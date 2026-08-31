import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rules = readFileSync("firestore.rules", "utf8");

// This suite is deliberately a static Rules AST/source regression harness. It does
// not substitute for the Firebase Emulator authorization suite, which remains a
// release gate for request/auth, stored-document, and Bytes runtime semantics.

type RuleToken = {
  kind: "identifier" | "literal" | "symbol" | "eof";
  value: string;
};

type RuleExpression =
  | { kind: "identifier"; name: string }
  | { kind: "literal"; value: string }
  | { kind: "list"; elements: RuleExpression[] }
  | { kind: "unary"; operator: string; argument: RuleExpression }
  | { kind: "binary"; operator: string; left: RuleExpression; right: RuleExpression }
  | {
    kind: "conditional";
    test: RuleExpression;
    consequent: RuleExpression;
    alternate: RuleExpression;
  }
  | { kind: "call"; callee: RuleExpression; arguments: RuleExpression[] }
  | { kind: "member"; object: RuleExpression; property: RuleExpression }
  | { kind: "index"; object: RuleExpression; index: RuleExpression };

type ParsedRuleFunction = {
  initializers: RuleExpression[];
  result: RuleExpression;
};

const BINARY_PRECEDENCE = new Map<string, number>([
  ["||", 1],
  ["&&", 2],
  ["==", 3],
  ["!=", 3],
  [">=", 4],
  ["<=", 4],
  [">", 4],
  ["<", 4],
  ["is", 4],
  ["in", 4],
  ["+", 5],
  ["-", 5],
  ["*", 6],
  ["/", 6],
  ["%", 6],
]);

function tokenizeRuleExpression(source: string): RuleToken[] {
  const tokens: RuleToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      index = source.indexOf("\n", index);
      if (index < 0) break;
      continue;
    }
    if (source.startsWith("/databases/", index)) {
      const start = index;
      while (index < source.length && !/[;\s]/.test(source[index])) index += 1;
      tokens.push({ kind: "literal", value: source.slice(start, index) });
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      if (source[index - 1] !== quote) throw new Error("Unterminated Firestore rules string literal");
      tokens.push({ kind: "literal", value: source.slice(start, index) });
      continue;
    }
    if (/[0-9]/.test(character)) {
      const start = index;
      while (index < source.length && /[0-9.]/.test(source[index])) index += 1;
      tokens.push({ kind: "literal", value: source.slice(start, index) });
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      const value = source.slice(start, index);
      tokens.push({
        kind: value === "true" || value === "false" || value === "null" ? "literal" : "identifier",
        value,
      });
      continue;
    }
    const doubleCharacter = source.slice(index, index + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(doubleCharacter)) {
      tokens.push({ kind: "symbol", value: doubleCharacter });
      index += 2;
      continue;
    }
    if ("()[],.!?:;=+-*/%<>".includes(character)) {
      tokens.push({ kind: "symbol", value: character });
      index += 1;
      continue;
    }
    throw new Error(`Unsupported Firestore rules token near: ${source.slice(index, index + 24)}`);
  }
  tokens.push({ kind: "eof", value: "<eof>" });
  return tokens;
}

class RuleExpressionParser {
  private cursor = 0;
  private readonly tokens: readonly RuleToken[];

  constructor(tokens: readonly RuleToken[]) {
    this.tokens = tokens;
  }

  parseCompleteExpression(): RuleExpression {
    const expression = this.parseExpression();
    this.expect("<eof>");
    return expression;
  }

  parseFunctionBody(): ParsedRuleFunction {
    const initializers: RuleExpression[] = [];
    while (this.match("let")) {
      this.expectKind("identifier");
      this.expect("=");
      initializers.push(this.parseExpression());
      this.expect(";");
    }
    this.expect("return");
    const result = this.parseExpression();
    this.expect(";");
    this.expect("<eof>");
    return { initializers, result };
  }

  parseExpression(minimumPrecedence = 0): RuleExpression {
    let left = this.parseUnary();
    while (true) {
      if (this.peek().value === "?" && minimumPrecedence === 0) {
        this.consume();
        const consequent = this.parseExpression();
        this.expect(":");
        const alternate = this.parseExpression();
        left = { kind: "conditional", test: left, consequent, alternate };
        continue;
      }
      const operator = this.peek().value;
      const precedence = BINARY_PRECEDENCE.get(operator);
      if (precedence === undefined || precedence < minimumPrecedence) break;
      this.consume();
      const right = this.parseExpression(precedence + 1);
      left = { kind: "binary", operator, left, right };
    }
    return left;
  }

  private parseUnary(): RuleExpression {
    if (["!", "-", "+"].includes(this.peek().value)) {
      const operator = this.consume().value;
      return { kind: "unary", operator, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): RuleExpression {
    let expression = this.parsePrimary();
    while (true) {
      if (this.match("(")) {
        const args: RuleExpression[] = [];
        if (!this.match(")")) {
          do {
            args.push(this.parseExpression());
          } while (this.match(","));
          this.expect(")");
        }
        expression = { kind: "call", callee: expression, arguments: args };
        continue;
      }
      if (this.match(".")) {
        const property = this.expectKind("identifier");
        expression = {
          kind: "member",
          object: expression,
          property: { kind: "identifier", name: property.value },
        };
        continue;
      }
      if (this.match("[")) {
        const arrayIndex = this.parseExpression();
        this.expect("]");
        expression = { kind: "index", object: expression, index: arrayIndex };
        continue;
      }
      return expression;
    }
  }

  private parsePrimary(): RuleExpression {
    const token = this.consume();
    if (token.kind === "identifier") return { kind: "identifier", name: token.value };
    if (token.kind === "literal") return { kind: "literal", value: token.value };
    if (token.value === "(") {
      const expression = this.parseExpression();
      this.expect(")");
      return expression;
    }
    if (token.value === "[") {
      const elements: RuleExpression[] = [];
      if (!this.match("]")) {
        do {
          elements.push(this.parseExpression());
        } while (this.match(","));
        this.expect("]");
      }
      return { kind: "list", elements };
    }
    throw new Error(`Unexpected Firestore rules token: ${token.value}`);
  }

  private peek(): RuleToken {
    return this.tokens[this.cursor];
  }

  private consume(): RuleToken {
    const token = this.peek();
    this.cursor += 1;
    return token;
  }

  private match(value: string): boolean {
    if (this.peek().value !== value) return false;
    this.consume();
    return true;
  }

  private expect(value: string): RuleToken {
    const token = this.consume();
    if (token.value !== value) throw new Error(`Expected ${value}, received ${token.value}`);
    return token;
  }

  private expectKind(kind: RuleToken["kind"]): RuleToken {
    const token = this.consume();
    if (token.kind !== kind) throw new Error(`Expected ${kind}, received ${token.kind}`);
    return token;
  }
}

function parseRuleExpression(source: string): RuleExpression {
  return new RuleExpressionParser(tokenizeRuleExpression(source)).parseCompleteExpression();
}

function extractBalancedBlock(source: string, openingBraceIndex: number): string {
  let depth = 1;
  let index = openingBraceIndex + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    index += 1;
  }
  if (depth !== 0) throw new Error("Unbalanced Firestore rules block");
  return source.slice(openingBraceIndex + 1, index - 1);
}

function parseRuleFunctions(source: string): Map<string, ParsedRuleFunction> {
  const functions = new Map<string, ParsedRuleFunction>();
  const pattern = /function\s+([A-Za-z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    const openingBraceIndex = (match.index ?? 0) + match[0].length - 1;
    const body = extractBalancedBlock(source, openingBraceIndex);
    try {
      functions.set(
        match[1],
        new RuleExpressionParser(tokenizeRuleExpression(body)).parseFunctionBody(),
      );
    } catch (error) {
      throw new Error(`Unable to parse Firestore helper ${match[1]}: ${String(error)}`);
    }
  }
  return functions;
}

function extractMatchBlock(source: string, matchMarker: string): string {
  const matchStart = source.indexOf(matchMarker);
  if (matchStart < 0) throw new Error(`Missing Firestore match: ${matchMarker}`);
  return extractBalancedBlock(source, matchStart + matchMarker.length - 1);
}

function extractAllowExpression(
  source: string,
  matchMarker: string,
  operation: "create" | "delete",
): RuleExpression {
  const matchBody = extractMatchBlock(source, matchMarker);
  const allowMarker = `allow ${operation}: if`;
  const allowStart = matchBody.indexOf(allowMarker);
  if (allowStart < 0) throw new Error(`Missing ${operation} allow in: ${matchMarker}`);
  const expressionStart = allowStart + allowMarker.length;
  const expressionEnd = matchBody.indexOf(";", expressionStart);
  if (expressionEnd < 0) throw new Error(`Unterminated ${operation} allow in: ${matchMarker}`);
  return parseRuleExpression(matchBody.slice(expressionStart, expressionEnd));
}

function extractRuleFunctionSource(source: string, functionName: string): string {
  const pattern = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`, "g");
  const match = pattern.exec(source);
  if (!match) throw new Error(`Missing Firestore helper: ${functionName}`);
  const openingBraceIndex = match.index + match[0].length - 1;
  return extractBalancedBlock(source, openingBraceIndex);
}

function renderRuleExpression(expression: RuleExpression): string {
  switch (expression.kind) {
    case "identifier":
      return expression.name;
    case "literal":
      return expression.value;
    case "list":
      return `[${expression.elements.map(renderRuleExpression).join(", ")}]`;
    case "unary":
      return `${expression.operator}${renderRuleExpression(expression.argument)}`;
    case "binary":
      return `${renderRuleExpression(expression.left)} ${expression.operator} ${renderRuleExpression(expression.right)}`;
    case "conditional":
      return `${renderRuleExpression(expression.test)} ? ${renderRuleExpression(expression.consequent)} : ${renderRuleExpression(expression.alternate)}`;
    case "call":
      return `${renderRuleExpression(expression.callee)}(${expression.arguments.map(renderRuleExpression).join(", ")})`;
    case "member":
      return `${renderRuleExpression(expression.object)}.${renderRuleExpression(expression.property)}`;
    case "index":
      return `${renderRuleExpression(expression.object)}[${renderRuleExpression(expression.index)}]`;
  }
}

function flattenBinaryClauses(expression: RuleExpression, operator: string): RuleExpression[] {
  if (expression.kind === "binary" && expression.operator === operator) {
    return [
      ...flattenBinaryClauses(expression.left, operator),
      ...flattenBinaryClauses(expression.right, operator),
    ];
  }
  return [expression];
}

function collectPairwiseListEqualities(expression: RuleExpression): [string, string][] {
  return flattenBinaryClauses(expression, "&&").flatMap((clause) => {
    if (clause.kind !== "binary" || clause.operator !== "==") return [];
    if (clause.left.kind !== "list" || clause.right.kind !== "list") return [];
    const leftElements = clause.left.elements;
    const rightElements = clause.right.elements;
    if (leftElements.length !== rightElements.length) {
      throw new Error(`Mismatched list equality: ${renderRuleExpression(clause)}`);
    }
    return leftElements.map((left, index): [string, string] => [
      renderRuleExpression(left),
      renderRuleExpression(rightElements[index]),
    ]);
  });
}

function expectListEqualityPairs(
  expression: RuleExpression,
  expectedPairs: readonly (readonly [string, string])[],
): void {
  const actualPairs = collectPairwiseListEqualities(expression);
  for (const expectedPair of expectedPairs) {
    expect(actualPairs, JSON.stringify(actualPairs)).toContainEqual([...expectedPair]);
  }
}

function extractPathInterpolations(pathLiteral: string): string[] {
  const expressions: string[] = [];
  let cursor = 0;
  while (cursor < pathLiteral.length) {
    const start = pathLiteral.indexOf("$(", cursor);
    if (start < 0) break;
    let depth = 1;
    let end = start + 2;
    while (end < pathLiteral.length && depth > 0) {
      if (pathLiteral[end] === "(") depth += 1;
      if (pathLiteral[end] === ")") depth -= 1;
      end += 1;
    }
    if (depth !== 0) throw new Error(`Unterminated Firestore path interpolation: ${pathLiteral}`);
    expressions.push(pathLiteral.slice(start + 2, end - 1));
    cursor = end;
  }
  return expressions;
}

function countConservativeAstNodes(
  expression: RuleExpression,
  functions: ReadonlyMap<string, ParsedRuleFunction>,
  stack: readonly string[] = [],
): number {
  switch (expression.kind) {
    case "identifier":
      return 1;
    case "literal": {
      if (!expression.value.startsWith("/databases/")) return 1;
      return 1 + extractPathInterpolations(expression.value).reduce(
        (sum, interpolation) => sum
          + 1
          + countConservativeAstNodes(parseRuleExpression(interpolation), functions, stack),
        0,
      );
    }
    case "list":
      return 1 + expression.elements.reduce(
        (sum, element) => sum + countConservativeAstNodes(element, functions, stack),
        0,
      );
    case "unary":
      return 1 + countConservativeAstNodes(expression.argument, functions, stack);
    case "binary":
      return 1
        + countConservativeAstNodes(expression.left, functions, stack)
        + countConservativeAstNodes(expression.right, functions, stack);
    case "conditional":
      return 1
        + countConservativeAstNodes(expression.test, functions, stack)
        + countConservativeAstNodes(expression.consequent, functions, stack)
        + countConservativeAstNodes(expression.alternate, functions, stack);
    case "member":
      return 1
        + countConservativeAstNodes(expression.object, functions, stack)
        + countConservativeAstNodes(expression.property, functions, stack);
    case "index":
      return 1
        + countConservativeAstNodes(expression.object, functions, stack)
        + countConservativeAstNodes(expression.index, functions, stack);
    case "call": {
      let count = 1
        + countConservativeAstNodes(expression.callee, functions, stack)
        + expression.arguments.reduce(
          (sum, argument) => sum + countConservativeAstNodes(argument, functions, stack),
          0,
        );
      if (expression.callee.kind === "identifier" && functions.has(expression.callee.name)) {
        if (stack.includes(expression.callee.name)) {
          throw new Error(`Recursive Firestore helper: ${[...stack, expression.callee.name].join(" -> ")}`);
        }
        const helper = functions.get(expression.callee.name)!;
        const helperStack = [...stack, expression.callee.name];
        count += helper.initializers.reduce(
          (sum, initializer) => sum + countConservativeAstNodes(initializer, functions, helperStack),
          0,
        );
        count += countConservativeAstNodes(helper.result, functions, helperStack);
      }
      return count;
    }
  }
}

function countExpandedAccessCalls(
  expression: RuleExpression,
  functions: ReadonlyMap<string, ParsedRuleFunction>,
  stack: readonly string[] = [],
): number {
  switch (expression.kind) {
    case "identifier":
    case "literal":
      return 0;
    case "list":
      return expression.elements.reduce(
        (sum, element) => sum + countExpandedAccessCalls(element, functions, stack),
        0,
      );
    case "unary":
      return countExpandedAccessCalls(expression.argument, functions, stack);
    case "binary":
      return countExpandedAccessCalls(expression.left, functions, stack)
        + countExpandedAccessCalls(expression.right, functions, stack);
    case "conditional":
      return countExpandedAccessCalls(expression.test, functions, stack)
        + Math.max(
          countExpandedAccessCalls(expression.consequent, functions, stack),
          countExpandedAccessCalls(expression.alternate, functions, stack),
        );
    case "member":
      return countExpandedAccessCalls(expression.object, functions, stack)
        + countExpandedAccessCalls(expression.property, functions, stack);
    case "index":
      return countExpandedAccessCalls(expression.object, functions, stack)
        + countExpandedAccessCalls(expression.index, functions, stack);
    case "call": {
      let count = expression.callee.kind === "identifier"
        && (expression.callee.name === "get" || expression.callee.name === "exists")
        ? 1
        : 0;
      count += countExpandedAccessCalls(expression.callee, functions, stack);
      count += expression.arguments.reduce(
        (sum, argument) => sum + countExpandedAccessCalls(argument, functions, stack),
        0,
      );
      if (expression.callee.kind === "identifier" && functions.has(expression.callee.name)) {
        if (stack.includes(expression.callee.name)) {
          throw new Error(`Recursive Firestore helper: ${[...stack, expression.callee.name].join(" -> ")}`);
        }
        const helper = functions.get(expression.callee.name)!;
        const helperStack = [...stack, expression.callee.name];
        count += helper.initializers.reduce(
          (sum, initializer) => sum + countExpandedAccessCalls(initializer, functions, helperStack),
          0,
        );
        count += countExpandedAccessCalls(helper.result, functions, helperStack);
      }
      return count;
    }
  }
}

const parsedFunctions = parseRuleFunctions(rules);

describe("static compact V2 shooting-profile Firestore Rules contract", () => {
  it("keeps the V1 private poses path read-and-delete only", () => {
    const posesBlock = rules.slice(
      rules.indexOf("match /poses/{poseId}"),
      rules.indexOf("match /analyses/{analysisId}"),
    );
    expect(posesBlock).toContain("allow read, delete: if signedInOwner(userId)");
    expect(posesBlock).toContain("allow create, update: if false");
    expect(rules).not.toContain("boundary == 'monocular_relative_pose_not_metric_3d'");
  });

  it("keeps only the compact V2 topology and deny-by-default owner paths", () => {
    expect(rules).toContain("match /captureSessions/{captureSessionId}");
    expect(rules).toContain("match /observations/{attemptId}");
    expect(rules).toContain("match /motionProfiles/{profileId}");
    expect(rules).toContain("match /revisions/{revisionId}");
    for (const removedPath of ["frameChunks", "sequenceChunks", "phaseSummaries"]) {
      expect(rules).not.toContain(`match /${removedPath}/`);
    }
    for (const removedRecordType of [
      "observation_frame_chunk_v2",
      "representative_phase_chunk_v2",
      "representative_phase_summary_v2",
    ]) {
      expect(rules).not.toContain(removedRecordType);
    }
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).not.toMatch(/allow\s+(read|write)\s*:\s*if\s+true/);
  });

  it("binds every immutable V2 layer to one canonical profile/capture/revision ID", () => {
    const canonicalIds = extractRuleFunctionSource(rules, "validChainIds");
    expect(canonicalIds).toContain("validOpaqueId(profileId)");
    expect(canonicalIds).toContain("captureSessionId == profileId");
    expect(canonicalIds).toContain("revisionId == profileId");

    for (const validatorName of [
      "validObservation",
      "validCaptureSession",
      "validRevision",
      "validMotionProfileHead",
    ]) {
      expect(extractRuleFunctionSource(rules, validatorName)).toContain(
        "validChainIds(data.profileId, data.captureSessionId, data.revisionId)",
      );
    }

    const capture = parsedFunctions.get("validCaptureSession")!.result;
    expectListEqualityPairs(capture, [["data.captureSessionId", "captureSessionId"]]);
    const revision = parsedFunctions.get("validRevision")!.result;
    expectListEqualityPairs(revision, [
      ["data.profileId", "profileId"],
      ["data.revisionId", "revisionId"],
    ]);
    const head = parsedFunctions.get("validMotionProfileHead")!.result;
    expectListEqualityPairs(head, [["data.profileId", "profileId"]]);
  });

  it("locks each compact observation to the exact path identity and 14,544-byte envelope", () => {
    const validator = extractRuleFunctionSource(rules, "validObservation");
    expect(validator).toContain("validExactKeys(data");
    expect(validator).toContain("validCommonV2(data, userId, 'normalized_observation_v2')");
    expect(validator).toContain("data.storageLayout == 'phase_sequence_payloads_v1'");
    expect(validator).toContain("data.captureSessionId == captureSessionId");
    expect(validator).toContain("data.attemptId == attemptId");
    expect(validator).toContain("data.attemptId == data.view + '-' + string(data.takeIndex)");
    expect(validator).toContain("data.frameCount == 101");
    expect(validator).toContain("data.framePayloadByteLength == 144");
    expect(validator).toContain("data.payloadByteLength == 14544");
    expect(validator).toContain("data.payloadFormat == 'int32_be_fixed_1e6_v1'");
    expect(validator).toContain("data.fixedPointScale == 1000000");
    expect(validator).toContain("data.packingOrder == 'phase_major_joint_major_xy_visibility_v1'");
    expect(validator).toContain("data.missingVisibilitySentinel == -2147483648");
    expect(validator).toContain("data.payload is bytes");
    expect(validator).toContain("data.payload.size() == 14544");
    expect(validator).not.toMatch(/payload(?:ByteLength|\.size\(\))\s*[<>]=?\s*14544/);
  });

  it("locks the immutable revision to the full 48,480-byte representative envelope", () => {
    const validator = extractRuleFunctionSource(rules, "validRevision");
    const result = parsedFunctions.get("validRevision")!.result;
    expect(validator).toContain("validExactKeys(data");
    expect(validator).toContain("validCommonV2(data, userId, 'representative_revision_v2')");
    expectListEqualityPairs(result, [
      ["data.storageLayout", "'phase_sequence_payloads_v1'"],
      ["data.profileId", "profileId"],
      ["data.revisionId", "revisionId"],
      ["data.status", "'complete'"],
      ["data.frameCount", "101"],
      ["data.framePayloadByteLength", "480"],
      ["data.payloadByteLength", "48480"],
      ["data.phaseSummaryCount", "5"],
      ["data.packingOrder", "'phase_major_joint_major_xyz_covariance6_cone_v1'"],
      ["data.uncertaintyModel", "'heuristic_v1'"],
    ]);
    expect(validator).toContain("data.payload is bytes");
    expect(validator).toContain("data.payload.size() == 48480");
    expect(validator).not.toMatch(/payload(?:ByteLength|\.size\(\))\s*[<>]=?\s*48480/);
    expect(validator).toContain("validQuality(data.quality)");
  });

  it("uses exact-key maps so unknown fields cannot satisfy any compact validator", () => {
    const exactKeys = extractRuleFunctionSource(rules, "validExactKeys");
    expect(exactKeys).toContain("data.keys().hasAll(keys)");
    expect(exactKeys).toContain("data.keys().hasOnly(keys)");
    for (const validatorName of [
      "validObservation",
      "validCaptureSession",
      "validRevision",
      "validMotionProfileHead",
      "validQuality",
    ]) {
      expect(extractRuleFunctionSource(rules, validatorName)).toContain("validExactKeys(");
    }
  });

  it("encodes the canonical Basic/High observation proof and immutable-create trust before capture creation", () => {
    const proof = extractRuleFunctionSource(rules, "allStoredObservationsValid");
    for (const attemptId of [
      "front-0", "front-1", "front-2",
      "shooting_side-0", "shooting_side-1", "shooting_side-2",
    ]) {
      expect(proof).toContain(`'${attemptId}'`);
    }
    expect(proof).toContain("capture.mode == 'basic_1_plus_1'");
    for (const deniedExtraObservation of ["front1Path", "front2Path", "side1Path", "side2Path"]) {
      expect(proof).toContain(`!exists(${deniedExtraObservation})`);
    }
    expect(proof.match(/validStoredObservationProof\(/g)).toHaveLength(6);

    const storedObservation = extractRuleFunctionSource(rules, "validStoredObservationProof");
    const storedObservationResult = parsedFunctions.get("validStoredObservationProof")!.result;
    expect(storedObservation.match(/get\(observationPath\)/g)).toHaveLength(1);
    expect(storedObservation).toContain("immutable observation-create rule");
    expect(storedObservation).toContain("binds its canonical chain IDs");
    expect(storedObservation).toContain("view, takeIndex, and attemptId to this path");
    expectListEqualityPairs(storedObservationResult, [
      ["observation.ownerUid", "userId"],
      ["observation.shootingHand", "capture.shootingHand"],
    ]);
    expect(storedObservation).toContain("observation.payload is bytes");
    expect(storedObservation).toContain("observation.payload.size() == 14544");
  });

  it("encodes observation-to-capture-to-revision-to-head creation and immutability", () => {
    const cases = [
      {
        marker: "match /observations/{attemptId} {",
        validator: "validObservation(request.resource.data, userId, captureSessionId, attemptId)",
        prerequisites: [
          "noCaptureSession(userId, captureSessionId)",
          "noProfileHead(userId, request.resource.data.profileId)",
        ],
      },
      {
        marker: "match /captureSessions/{captureSessionId} {",
        validator: "validCaptureSession(request.resource.data, userId, captureSessionId)",
        prerequisites: ["allStoredObservationsValid(userId, captureSessionId, request.resource.data)"],
      },
      {
        marker: "match /revisions/{revisionId} {",
        validator: "validRevision(request.resource.data, userId, profileId, revisionId)",
        prerequisites: ["validStoredCapture(userId, request.resource.data)"],
      },
      {
        marker: "match /motionProfiles/{profileId} {",
        validator: "validMotionProfileHead(request.resource.data, userId, profileId)",
        prerequisites: ["validStoredRevision(userId, profileId, request.resource.data)"],
      },
    ] as const;
    for (const { marker, validator, prerequisites } of cases) {
      const matchBlock = extractMatchBlock(rules, marker);
      expect(matchBlock).toContain("allow create: if signedInOwner(userId)");
      expect(matchBlock).toContain(validator);
      for (const prerequisite of prerequisites) {
        expect(matchBlock).toContain(prerequisite);
      }
    }
    for (const marker of [
      "match /observations/{attemptId} {",
      "match /captureSessions/{captureSessionId} {",
      "match /revisions/{revisionId} {",
    ]) {
      expect(extractMatchBlock(rules, marker)).toContain("allow update: if false;");
    }

    const noHead = extractRuleFunctionSource(rules, "noProfileHead");
    expect(noHead).toContain("!exists(profilePath)");
    const noCaptureSession = extractRuleFunctionSource(rules, "noCaptureSession");
    expect(noCaptureSession).toContain("!exists(capturePath)");
    expect(extractMatchBlock(rules, "match /captureSessions/{captureSessionId} {")).toContain(
      "noProfileHead(userId, request.resource.data.profileId)",
    );
    expect(extractMatchBlock(rules, "match /revisions/{revisionId} {")).toContain(
      "noProfileHead(userId, profileId)",
    );
  });

  it("requires a full stored capture for revision and a full stored revision for publication", () => {
    const storedCapture = extractRuleFunctionSource(rules, "validStoredCapture");
    const storedCaptureResult = parsedFunctions.get("validStoredCapture")!.result;
    expect(storedCapture.match(/get\(capturePath\)/g)).toHaveLength(1);
    expect(storedCapture).toContain("validCaptureSession(capture, userId, revision.captureSessionId)");
    expectListEqualityPairs(storedCaptureResult, [
      ["capture.mode", "revision.mode"],
      ["capture.shootingHand", "revision.shootingHand"],
      ["capture.attemptCount", "revision.attemptCount"],
      ["capture.storageLayout", "revision.storageLayout"],
    ]);

    const storedRevision = extractRuleFunctionSource(rules, "validStoredRevision");
    const storedRevisionResult = parsedFunctions.get("validStoredRevision")!.result;
    expect(storedRevision.match(/get\(revisionPath\)/g)).toHaveLength(1);
    expect(storedRevision).toContain("validRevision(revision, userId, profileId, head.revisionId)");
    expectListEqualityPairs(storedRevisionResult, [
      ["revision.mode", "head.mode"],
      ["revision.shootingHand", "head.shootingHand"],
      ["revision.confidence", "head.confidence"],
      ["revision.attemptCount", "head.attemptCount"],
      ["revision.frameCount", "head.frameCount"],
      ["revision.phaseSummaryCount", "head.phaseSummaryCount"],
      ["revision.units", "head.units"],
      ["revision.storageLayout", "head.storageLayout"],
      ["revision.payloadByteLength", "head.representativePayloadByteLength"],
    ]);
    expect(extractRuleFunctionSource(rules, "validRevision")).toContain("data.payload.size() == 48480");
  });

  it("keeps every compact create expression below the conservative 700-node budget", () => {
    const emptyFunctions = new Map<string, ParsedRuleFunction>();
    const cases = [
      ["value", 1],
      ["1", 1],
      ["!value", 2],
      ["value + 1", 3],
      ["flag ? 1 : 2", 4],
      ["object.field", 3],
      ["values[0]", 3],
      ["check(value)", 3],
      ["[1, item]", 3],
    ] as const;
    for (const [source, expected] of cases) {
      expect(countConservativeAstNodes(parseRuleExpression(source), emptyFunctions)).toBe(expected);
    }
    expect(countConservativeAstNodes(
      parseRuleExpression("/databases/$(database)/documents/users/$(userId)"),
      emptyFunctions,
    )).toBe(5);
    const helper = parseRuleFunctions("function unit(value) { return value >= 0 && value <= 1; }");
    expect(countConservativeAstNodes(parseRuleExpression("unit(input)"), helper)).toBe(10);

    const functions = parseRuleFunctions(rules);
    const createMatches = [
      ["captureSessions", "match /captureSessions/{captureSessionId} {"],
      ["observations", "match /observations/{attemptId} {"],
      ["motionProfiles", "match /motionProfiles/{profileId} {"],
      ["revisions", "match /revisions/{revisionId} {"],
    ] as const;
    const costs = createMatches.map(([name, marker]) => ({
      name,
      cost: countConservativeAstNodes(extractAllowExpression(rules, marker, "create"), functions),
    }));
    const helperCosts = [
      "validOpaqueId",
      "validChainIds",
      "validExactKeys",
      "validCommonV2",
      "validCreateTimestamps",
      "validMode",
      "validShootingHand",
      "validAttemptIds",
      "validQuality",
      "validObservation",
      "validCaptureSession",
      "noCaptureSession",
      "validStoredObservationProof",
      "allStoredObservationsValid",
      "validRevision",
      "validStoredCapture",
      "validMotionProfileHead",
      "validStoredRevision",
    ].map((name) => {
      const helper = functions.get(name)!;
      return {
        name,
        cost: helper.initializers.reduce(
          (sum, initializer) => sum + countConservativeAstNodes(initializer, functions, [name]),
          0,
        ) + countConservativeAstNodes(helper.result, functions, [name]),
      };
    });
    expect(
      costs.every(({ cost }) => cost <= 700),
      JSON.stringify({ costs, helperCosts }),
    ).toBe(true);
  });

  it("documents and statically caps Firestore document access calls", () => {
    expect(rules).toContain("Access-call maxima: observation create 2; capture create Basic 7 / High 7;");
    expect(rules).toContain("revision create 2; publication create 1; subordinate delete 3 or fewer;");
    expect(rules).toContain("profile-head delete Basic 4 / High 8.");
    const accessCounts = [
      ["observations", "match /observations/{attemptId} {", "create", 2],
      ["captureSessions", "match /captureSessions/{captureSessionId} {", "create", 7],
      ["revisions", "match /revisions/{revisionId} {", "create", 2],
      ["motionProfiles", "match /motionProfiles/{profileId} {", "create", 1],
      ["observationDelete", "match /observations/{attemptId} {", "delete", 3],
      ["captureDelete", "match /captureSessions/{captureSessionId} {", "delete", 3],
      ["revisionDelete", "match /revisions/{revisionId} {", "delete", 2],
      ["profileDelete", "match /motionProfiles/{profileId} {", "delete", 8],
    ] as const;
    for (const [name, marker, operation, expected] of accessCounts) {
      const count = countExpandedAccessCalls(
        extractAllowExpression(rules, marker, operation),
        parsedFunctions,
      );
      expect(count, name).toBe(expected);
      expect(count, name).toBeLessThanOrEqual(10);
    }
  });

  it("encodes dependency-aware unpublished cleanup and in-progress direct deletion", () => {
    const observationDelete = extractRuleFunctionSource(rules, "canDeleteObservation");
    expect(observationDelete).toContain("!exists(profilePath) && !exists(capturePath)");
    expect(observationDelete).toContain("get(profilePath).data.deletionState == 'in_progress'");

    const captureDelete = extractRuleFunctionSource(rules, "canDeleteCapture");
    expect(captureDelete).toContain("!exists(profilePath) && !exists(revisionPath)");
    expect(captureDelete).toContain("get(profilePath).data.deletionState == 'in_progress'");

    const revisionDelete = extractRuleFunctionSource(rules, "canDeleteRevision");
    expect(revisionDelete).toContain("!exists(profilePath)");
    expect(revisionDelete).toContain("get(profilePath).data.deletionState == 'in_progress'");

    expect(extractMatchBlock(rules, "match /observations/{attemptId} {")).toContain(
      "allow delete: if canDeleteObservation(userId, captureSessionId, resource.data);",
    );
    expect(extractMatchBlock(rules, "match /captureSessions/{captureSessionId} {")).toContain(
      "allow delete: if canDeleteCapture(userId, captureSessionId, resource.data);",
    );
    expect(extractMatchBlock(rules, "match /revisions/{revisionId} {")).toContain(
      "allow delete: if canDeleteRevision(userId, profileId, revisionId);",
    );
    const profileDelete = extractRuleFunctionSource(rules, "canDeleteProfileHead");
    expect(profileDelete).toContain("head.deletionState == 'in_progress'");
    expect(profileDelete).toContain("!exists(revisionPath)");
    expect(profileDelete).toContain("!exists(capturePath)");
    expect(profileDelete).toContain("allObservationDocumentsAbsent(userId, head.captureSessionId, head.mode)");
    expect(extractMatchBlock(rules, "match /motionProfiles/{profileId} {")).toContain(
      "allow delete: if canDeleteProfileHead(userId, profileId, resource.data);",
    );
  });
});
