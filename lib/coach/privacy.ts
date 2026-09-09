import { parseCoachRequestV1, type CoachRequestV1 } from "@/lib/coach/contract";

/**
 * The privacy gate every Coach request passes before it is serialized.
 *
 * The strict schema already refuses unknown keys; this audit is the second,
 * independent line: it walks any value and refuses the key names private
 * capture evidence and identities travel under, refuses arrays long enough
 * to be per-frame evidence, and caps the size. It is deliberately dumb and
 * name-based so a future field cannot slip past it by being well-formed.
 */
export const COACH_FORBIDDEN_KEYS: readonly string[] = Object.freeze([
  // Per-frame and raw evidence.
  "frames",
  "frame",
  "sourceLandmarks",
  "landmarks",
  "landmark",
  "faceLandmarks",
  "face",
  "z",
  "covariance",
  "root",
  "cropRectPx",
  "sourceWidth",
  "sourceHeight",
  "contentRect",
  // Time and capture bookkeeping.
  "timestampMs",
  "timestamp",
  "timestamps",
  "requestedTimestampMs",
  "decodedTimestampMs",
  "detectedTimestampMs",
  "attempts",
  "attempt",
  "attemptId",
  "takeIndex",
  // Files and media.
  "uri",
  "url",
  "fileName",
  "filename",
  "path",
  "video",
  "videoUri",
  "asset",
  // Identity.
  "email",
  "uid",
  "userId",
  "profileId",
  "displayName",
  "name",
  "phone",
]);

export const COACH_REQUEST_MAX_BYTES = 16 * 1024;
export const COACH_REQUEST_MAX_ARRAY = 32;

export type CoachPrivacyViolation =
  | { code: "not_an_object" }
  | { code: "forbidden_key"; path: string }
  | { code: "array_too_long"; path: string; length: number }
  | { code: "too_large"; bytes: number };

export type CoachPrivacyAudit = { ok: true } | { ok: false; violations: CoachPrivacyViolation[] };

const forbidden = new Set(COACH_FORBIDDEN_KEYS);

function walk(value: unknown, path: string[], violations: CoachPrivacyViolation[]): void {
  if (Array.isArray(value)) {
    if (value.length > COACH_REQUEST_MAX_ARRAY) violations.push({ code: "array_too_long", path: path.join("."), length: value.length });
    value.forEach((item, index) => walk(item, [...path, String(index)], violations));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = [...path, key];
      if (forbidden.has(key)) violations.push({ code: "forbidden_key", path: next.join(".") });
      walk(item, next, violations);
    }
  }
}

export function auditCoachRequestPrivacy(value: unknown): CoachPrivacyAudit {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, violations: [{ code: "not_an_object" }] };
  const violations: CoachPrivacyViolation[] = [];
  walk(value, [], violations);
  const bytes = JSON.stringify(value).length;
  if (bytes > COACH_REQUEST_MAX_BYTES) violations.push({ code: "too_large", bytes });
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function describe(violations: CoachPrivacyViolation[]): string {
  return violations.map((violation) => {
    if (violation.code === "forbidden_key") return `forbidden key ${violation.path}`;
    if (violation.code === "array_too_long") return `array ${violation.path} has ${violation.length} items`;
    if (violation.code === "too_large") return `${violation.bytes} bytes`;
    return "not an object";
  }).join("; ");
}

export function assertCoachRequestPrivacy(value: unknown): void {
  const audit = auditCoachRequestPrivacy(value);
  if (!audit.ok) throw new Error(`coach request privacy: ${describe(audit.violations)}`);
}

/**
 * The only way a request becomes bytes: schema first, privacy audit second,
 * compact JSON last. A provider that sends anything else is a bug.
 */
export function serializeCoachRequest(request: CoachRequestV1): string {
  const parsed = parseCoachRequestV1(request);
  if (!parsed.ok) throw new Error(`coach request is invalid: ${parsed.issues.join("; ")}`);
  assertCoachRequestPrivacy(parsed.value);
  return JSON.stringify(parsed.value);
}
