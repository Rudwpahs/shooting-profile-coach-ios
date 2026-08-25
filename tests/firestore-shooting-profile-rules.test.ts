import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rules = readFileSync("firestore.rules", "utf8");
const PHASE_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;

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
    functions.set(
      match[1],
      new RuleExpressionParser(tokenizeRuleExpression(body)).parseFunctionBody(),
    );
  }
  return functions;
}

function extractAllowCreateExpression(source: string, matchMarker: string): RuleExpression {
  const matchStart = source.indexOf(matchMarker);
  if (matchStart < 0) throw new Error(`Missing Firestore match: ${matchMarker}`);
  const matchBody = extractBalancedBlock(source, matchStart + matchMarker.length - 1);
  const allowMarker = "allow create: if";
  const allowStart = matchBody.indexOf(allowMarker);
  if (allowStart < 0) throw new Error(`Missing create allow in: ${matchMarker}`);
  const expressionStart = allowStart + allowMarker.length;
  const expressionEnd = matchBody.indexOf(";", expressionStart);
  if (expressionEnd < 0) throw new Error(`Unterminated create allow in: ${matchMarker}`);
  return parseRuleExpression(matchBody.slice(expressionStart, expressionEnd));
}

function countConservativeAstNodes(
  expression: RuleExpression,
  functions: ReadonlyMap<string, ParsedRuleFunction>,
  stack: readonly string[] = [],
): number {
  switch (expression.kind) {
    case "identifier":
    case "literal":
      return 1;
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

describe("owner-only fixed-point V2 shooting-profile Firestore rules", () => {
  it("preserves the existing V1 private poses boundary and operations", () => {
    expect(rules).toContain("match /poses/{poseId}");
    expect(rules).toContain("allow read, delete: if signedInOwner(userId)");
    expect(rules).toContain("boundary == 'monocular_relative_pose_not_metric_3d'");
    expect(rules).toContain("allow update: if false");
  });

  it("isolates every V2 owner path and preserves deny-by-default", () => {
    expect(rules).toContain("match /captureSessions/{captureSessionId}");
    expect(rules).toContain("match /observations/{attemptId}");
    expect(rules).toContain("match /frameChunks/{chunkId}");
    expect(rules).toContain("match /motionProfiles/{profileId}");
    expect(rules).toContain("match /revisions/{revisionId}");
    expect(rules).toContain("match /sequenceChunks/{chunkId}");
    expect(rules).toContain("match /phaseSummaries/{phaseId}");
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).not.toMatch(/allow\s+(read|write)\s*:\s*if\s+true/);
  });

  it("stores observation phases as exact fixed-size bytes without floats or padded IDs", () => {
    expect(rules).toContain("chunkId == string(data.phaseIndex)");
    expect(rules).toContain("data.payload is bytes");
    expect(rules).toContain("data.payload.size() == 144");
    expect(rules).toContain("data.payloadFormat == 'int32_be_fixed_1e6_v1'");
    expect(rules).toContain("data.payloadByteLength == 144");
    expect(rules).toContain("data.packingOrder == 'joint_major_xy_visibility_v1'");
    expect(rules).toContain("data.missingVisibilitySentinel == -2147483648");
    expect(rules).not.toContain("int(data.chunkIndex)");
    expect(rules).not.toContain("data.frames[");
    expect(rules).not.toContain("validObservationJoints");
  });

  it("validates the exact representative byte envelope and canonical phase document ID", () => {
    expect(rules).toContain("data.payload is bytes");
    expect(rules).toContain("data.payload.size() == 480");
    expect(rules).toContain("data.payloadByteLength == 480");
    expect(rules).toContain("data.fixedPointScale == 1000000");
    expect(rules).toContain("data.uncertaintyModel == 'heuristic_v1'");
    expect(rules).toContain("chunkId == string(data.phaseIndex)");
    expect(rules).toContain("data.packingOrder == 'joint_major_xyz_covariance6_cone_v1'");
    expect(rules).not.toContain("validPackedRepresentativeGroup");
    expect(rules).not.toContain("data.groupIndex");
    expect(rules).not.toContain("data.values");
  });

  it("counts the real create allow AST and recursively expanded helpers without manual overhead", () => {
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
    const helper = parseRuleFunctions("function unit(value) { return value >= 0 && value <= 1; }");
    expect(countConservativeAstNodes(parseRuleExpression("unit(input)"), helper)).toBe(10);

    const functions = parseRuleFunctions(rules);
    const createMatches = [
      ["captureSessions", "match /captureSessions/{captureSessionId} {"],
      ["observations", "match /observations/{attemptId} {"],
      ["frameChunks", "match /frameChunks/{chunkId} {"],
      ["motionProfiles", "match /motionProfiles/{profileId} {"],
      ["revisions", "match /revisions/{revisionId} {"],
      ["sequenceChunks", "match /sequenceChunks/{chunkId} {"],
      ["phaseSummaries", "match /phaseSummaries/{phaseId} {"],
    ] as const;
    const costs = createMatches.map(([name, marker]) => ({
      name,
      cost: countConservativeAstNodes(extractAllowCreateExpression(rules, marker), functions),
    }));
    expect(costs.every(({ cost }) => cost <= 700), JSON.stringify(costs)).toBe(true);
  });

  it("requires completed empty quality and a fully matching revision before publication", () => {
    expect(rules).toContain("quality.passed == true");
    expect(rules).toContain("quality.reasons.size() == 0");
    expect(rules).toContain("data.sequenceChunkCount == 101");
    expect(rules.match(/data\.confidence <= 0\.65/g)).toHaveLength(2);
    const completedRevisionRule = rules.match(/function completedRevisionExists[\s\S]*?\n    }/)?.[0] ?? "";
    expect(completedRevisionRule.match(/get\(revisionPath\)/g)).toHaveLength(1);
    expect(completedRevisionRule).not.toContain("exists(revisionPath)");
    for (const field of [
      "captureSessionId", "mode", "shootingHand", "confidence", "attemptCount",
      "frameCount", "sequenceChunkCount", "phaseSummaryCount", "units", "timeBasis",
      "schemaVersion", "algorithmVersion",
    ]) {
      expect(completedRevisionRule).toContain(`revision.${field} == head.${field}`);
    }
  });

  it("stores canonical summaries by integer phase index only", () => {
    expect(rules).not.toContain("data.phase ==");
    for (const phase of PHASE_IDS) expect(rules).toContain(`'${phase}'`);
    for (const phaseIndex of [0, 25, 50, 75, 100]) expect(rules).toContain(`phaseIndex == ${phaseIndex}`);
  });

  it("denies active-head subordinate deletion but permits no-head cleanup and in-progress deletion", () => {
    expect(rules).toContain("function canDeleteV2(userId, profileId)");
    expect(rules).toMatch(/canDeleteV2[\s\S]*!exists\(profilePath\)[\s\S]*get\(profilePath\)\.data\.deletionState == 'in_progress'/);
    expect(rules.match(/allow delete: if canDeleteV2\(userId, resource\.data\.profileId\);/g)).toHaveLength(6);
    expect(rules).toContain("allow delete: if signedInOwner(userId) && resource.data.deletionState == 'in_progress';");
  });
});
