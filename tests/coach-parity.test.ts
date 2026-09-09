import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  CoachObservationV1Schema,
  CoachRequestV1Schema,
  CoachResponseV1Schema,
  parseCoachObservationV1,
  parseCoachRequestV1,
  parseCoachResponseForRequest,
  parseCoachResponseV1,
} from "@/lib/coach/contract";
import { request, response } from "@/tests/fixtures/coach-contract-fixtures";

/**
 * The shared fixtures are the contract between TypeScript and Python: both
 * sides run the same manifest and must reach the same verdict on every case.
 * `ml/coach/tests/test_contract_fixtures.py` is the other half.
 */
const FIXTURE_DIR = path.resolve("contracts/fixtures/coach");
const CONTRACT_DIR = path.resolve("contracts");

type PatchOp = { op: "set"; path: string; value: unknown } | { op: "remove"; path: string };
type FixtureCase = {
  id: string;
  schema: "coach-request-v1" | "coach-response-v1" | "coach-observation-v1";
  valid: boolean;
  reason?: string;
  file?: string;
  base?: string;
  patch?: PatchOp[];
  request_file?: string;
  structural?: boolean;
};
type Manifest = { schema_version: number; cases: FixtureCase[] };

const readJson = (relative: string): unknown => JSON.parse(readFileSync(path.join(FIXTURE_DIR, relative), "utf8"));
const manifest = readJson("manifest.json") as Manifest;

/** JSON-pointer style patches so a negative case is one visible mutation of a golden document. */
function applyPatch(document: unknown, ops: PatchOp[]): unknown {
  const root = JSON.parse(JSON.stringify(document));
  for (const op of ops) {
    const segments = op.path.split("/").slice(1);
    let node: Record<string, unknown> | unknown[] = root;
    for (const segment of segments.slice(0, -1)) {
      node = (Array.isArray(node) ? node[Number(segment)] : node[segment]) as Record<string, unknown> | unknown[];
    }
    const last = segments[segments.length - 1];
    if (Array.isArray(node)) {
      if (op.op === "set") node[Number(last)] = op.value;
      else node.splice(Number(last), 1);
    } else if (op.op === "set") {
      node[last] = op.value;
    } else {
      delete node[last];
    }
  }
  return root;
}

function loadDocument(fixture: FixtureCase): unknown {
  if (fixture.file) return readJson(fixture.file);
  if (!fixture.base) throw new Error(`${fixture.id}: a case names a file or a base`);
  return applyPatch(readJson(fixture.base), fixture.patch ?? []);
}

function verdict(fixture: FixtureCase): boolean {
  const document = loadDocument(fixture);
  if (fixture.schema === "coach-request-v1") return parseCoachRequestV1(document).ok;
  if (fixture.schema === "coach-observation-v1") return parseCoachObservationV1(document).ok;
  if (fixture.request_file) {
    const parsed = parseCoachRequestV1(readJson(fixture.request_file));
    if (!parsed.ok) throw new Error(`${fixture.id}: request fixture must be valid`);
    return parseCoachResponseForRequest(parsed.value, document).status === "ok";
  }
  return parseCoachResponseV1(document).ok;
}

describe("cross-language coach fixtures", () => {
  it("is a versioned manifest with unique ids, golden and negative cases, and grounding pairs", () => {
    expect(manifest.schema_version).toBe(1);
    expect(new Set(manifest.cases.map((fixture) => fixture.id)).size).toBe(manifest.cases.length);
    expect(manifest.cases.filter((fixture) => fixture.valid).length).toBeGreaterThanOrEqual(4);
    expect(manifest.cases.filter((fixture) => !fixture.valid).length).toBeGreaterThanOrEqual(24);
    expect(manifest.cases.filter((fixture) => fixture.request_file && !fixture.valid).length).toBeGreaterThanOrEqual(3);
    for (const fixture of manifest.cases) {
      if (!fixture.valid) expect(fixture.reason, fixture.id).toBeTruthy();
    }
  });

  it.each(manifest.cases.map((fixture) => [fixture.id, fixture] as const))("%s", (_id, fixture) => {
    expect(verdict(fixture)).toBe(fixture.valid);
  });

  it("keeps the golden documents equal to the shared builders so fixtures and tests cannot drift", () => {
    expect(readJson("golden/request-basic.json")).toEqual(request());
    expect(readJson("golden/response-basic.json")).toEqual(response());
  });
});

describe("exported JSON schema parity", () => {
  const contracts = [
    { name: "coach-request-v1", title: "CoachRequestV1", zod: CoachRequestV1Schema },
    { name: "coach-response-v1", title: "CoachResponseV1", zod: CoachResponseV1Schema },
    { name: "coach-observation-v1", title: "CoachObservationV1", zod: CoachObservationV1Schema },
  ] as const;

  type JsonSchemaObject = { title?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  const exported = (name: string) => JSON.parse(readFileSync(path.join(CONTRACT_DIR, `${name}.schema.json`), "utf8")) as JsonSchemaObject;

  it.each(contracts)("$name: the Python export and the Zod schema agree on keys, required keys and closedness", ({ name, title, zod }) => {
    const python = exported(name);
    const typescript = z.toJSONSchema(zod) as JsonSchemaObject;
    expect(python.title).toBe(title);
    expect(python.additionalProperties).toBe(false);
    expect(typescript.additionalProperties).toBe(false);
    expect(Object.keys(python.properties ?? {}).sort()).toEqual(Object.keys(typescript.properties ?? {}).sort());
    expect([...(python.required ?? [])].sort()).toEqual([...(typescript.required ?? [])].sort());
  });

  it("agrees on every closed vocabulary of the observation", () => {
    const python = exported("coach-observation-v1").properties as Record<string, { enum?: string[]; const?: string; anyOf?: { enum?: string[]; const?: string; type?: string }[] }>;
    const typescript = (z.toJSONSchema(CoachObservationV1Schema) as JsonSchemaObject).properties as Record<string, { enum?: string[]; const?: string; anyOf?: { enum?: string[]; const?: string; type?: string }[] }>;
    const vocabulary = (schema: { enum?: string[]; const?: string; anyOf?: { enum?: string[]; const?: string }[] }) =>
      [...(schema.enum ?? []), ...(schema.const ? [schema.const] : []), ...(schema.anyOf ?? []).flatMap((branch) => [...(branch.enum ?? []), ...(branch.const ? [branch.const] : [])])].sort();
    for (const key of ["metric", "unit", "source", "boundary", "phase_anchor", "measurement_confidence"]) {
      expect(vocabulary(python[key]), key).toEqual(vocabulary(typescript[key]));
      expect(vocabulary(python[key]).length, key).toBeGreaterThan(0);
    }
  });
});
