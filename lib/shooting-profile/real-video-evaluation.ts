import type {
  CaptureSessionState,
  CaptureSlotSourceV2,
} from "@/lib/shooting-profile/capture-session-reducer";
import {
  assertReportContainsNoRawEvidence,
  buildTwoViewEvaluationReport,
  CONSENT_RECORD_ID_PATTERN_V1,
  twoViewEvaluationReportSchema,
  TwoViewEvaluationReportError,
  type BuildTwoViewEvaluationReportInput,
  type TwoViewEvaluationReportV1,
} from "@/lib/shooting-profile/evaluation-report";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";

/**
 * Private, development-build-only evaluation of a real capture session.
 *
 * The raw `LandmarkSequenceV2` clips stay exactly where the reducer already
 * holds them (in memory, on device). This module only turns them into the
 * strict-schema, non-identifying `TwoViewEvaluationReportV1` and maps a
 * user-initiated share-sheet outcome to a state. It has no network, cloud, or
 * platform dependency, and it never produces a save envelope.
 */

export type RealVideoEvaluationFlags = Readonly<{ realVideoEvaluation: boolean }>;

/** React Native sets `__DEV__`; anywhere it is absent counts as a release build. */
export function isDevelopmentBuild(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

export function isRealVideoEvaluationEnabled(
  flags: RealVideoEvaluationFlags,
  developmentBuild: boolean,
): boolean {
  return flags.realVideoEvaluation === true && developmentBuild === true;
}

export type RealVideoEvaluationAttemptV1 = Readonly<{
  id: string;
  captureSource: CaptureSlotSourceV2;
  sequence: LandmarkSequenceV2;
}>;

const EVALUABLE_STATUSES: ReadonlySet<CaptureSessionState["status"]> = new Set([
  "result_review",
  "saving",
  "complete",
  "error",
] as const);

export type EvaluationAttemptAdmissionReasonV1 =
  | "session_not_ready"
  | "unknown_capture_source"
  | "library_source_not_admissible";

export type EvaluationAttemptAdmissionV1 =
  | Readonly<{ status: "admitted"; attempts: readonly RealVideoEvaluationAttemptV1[] }>
  | Readonly<{ status: "rejected"; reason: EvaluationAttemptAdmissionReasonV1 }>;

/**
 * Real-video evidence must come from a clip filmed inside this app right now.
 * A library pick has unverifiable provenance - it can be any downloaded video -
 * so it is excluded from evaluation evidence even though the capture flow
 * itself still accepts it for the owner's private profile.
 */
export function admitEvaluationAttempts(state: CaptureSessionState): EvaluationAttemptAdmissionV1 {
  if (state.mode === null || state.slots.length === 0 || !EVALUABLE_STATUSES.has(state.status)) {
    return { status: "rejected", reason: "session_not_ready" };
  }
  const attempts: RealVideoEvaluationAttemptV1[] = [];
  for (const slot of state.slots) {
    if (slot.status !== "accepted" || slot.sequence === undefined) {
      return { status: "rejected", reason: "session_not_ready" };
    }
    if (slot.captureSource === undefined) {
      return { status: "rejected", reason: "unknown_capture_source" };
    }
    if (slot.captureSource !== "camera") {
      return { status: "rejected", reason: "library_source_not_admissible" };
    }
    attempts.push(Object.freeze({
      id: slot.id,
      captureSource: slot.captureSource,
      sequence: slot.sequence,
    }));
  }
  return Object.freeze({ status: "admitted" as const, attempts: Object.freeze(attempts) });
}

/**
 * Rejects a consent record id before the report is built, so the panel can name
 * the reason. The report schema enforces the same pattern at the boundary, which
 * also covers the local CLI. Changing the accepted form means changing
 * `CONSENT_RECORD_ID_PATTERN_V1` and the runbook together.
 */
export function isOpaqueConsentRecordId(value: unknown): value is string {
  return typeof value === "string" && CONSENT_RECORD_ID_PATTERN_V1.test(value);
}

export type RealVideoEvaluationBuildFailureReason =
  | EvaluationAttemptAdmissionReasonV1
  | "consent_not_confirmed"
  | "consent_record_invalid"
  | "report_build_failed"
  | "raw_evidence_detected"
  | "schema_invalid";

export type RealVideoEvaluationBuildResult =
  | Readonly<{ status: "ready"; report: TwoViewEvaluationReportV1; json: string }>
  | Readonly<{ status: "build_failed"; reason: RealVideoEvaluationBuildFailureReason }>;

export type RealVideoEvaluationBuildOptions = Readonly<{
  sourceClass: BuildTwoViewEvaluationReportInput["sourceClass"];
  consentConfirmed?: boolean;
  consentRecordId?: string;
  evaluatedCommitSha?: string;
}>;

function failed(reason: RealVideoEvaluationBuildFailureReason): RealVideoEvaluationBuildResult {
  return { status: "build_failed", reason };
}

export function buildRealVideoEvaluation(
  state: CaptureSessionState,
  options: RealVideoEvaluationBuildOptions,
): RealVideoEvaluationBuildResult {
  const admission = admitEvaluationAttempts(state);
  if (admission.status !== "admitted" || state.mode === null) {
    return failed(admission.status === "admitted" ? "session_not_ready" : admission.reason);
  }
  const { attempts } = admission;

  // Claiming consent requires the owner to say so in this session and to name
  // an opaque local consent record; neither is inferred.
  if (options.sourceClass === "consented_self_capture") {
    if (options.consentConfirmed !== true) return failed("consent_not_confirmed");
    if (!isOpaqueConsentRecordId(options.consentRecordId)) return failed("consent_record_invalid");
  }

  // Cross-view geometry admission (duplicate / mirrored views) runs inside the
  // product pipeline, so a same-projection pair surfaces here as a derived
  // recapture report carrying the stable reason rather than as a build failure.
  let report: TwoViewEvaluationReportV1;
  try {
    report = buildTwoViewEvaluationReport({
      sourceClass: options.sourceClass,
      ...(options.consentRecordId === undefined || options.sourceClass === "synthetic_fixture"
        ? {}
        : { consentRecordId: options.consentRecordId }),
      ...(options.evaluatedCommitSha === undefined ? {} : { evaluatedCommitSha: options.evaluatedCommitSha }),
      mode: state.mode,
      shootingHand: state.shootingHand,
      attempts: attempts.map(({ id, sequence }) => ({ id, sequence })),
    });
  } catch (error) {
    return failed(error instanceof TwoViewEvaluationReportError ? error.reason : "report_build_failed");
  }
  try {
    assertReportContainsNoRawEvidence(report);
  } catch {
    return failed("raw_evidence_detected");
  }
  const parsed = twoViewEvaluationReportSchema.safeParse(report);
  if (!parsed.success) return failed("schema_invalid");
  return Object.freeze({
    status: "ready" as const,
    report: parsed.data,
    json: JSON.stringify(parsed.data, null, 2),
  });
}

export type RealVideoEvaluationShareOutcome = "shared" | "share_dismissed" | "share_failed";

export type PreparedRealVideoEvaluationFile = Readonly<{
  uri: string;
  cleanup: () => Promise<void>;
}>;

export type RealVideoEvaluationFilePreparer = (
  json: string,
) => Promise<PreparedRealVideoEvaluationFile>;

export type RealVideoEvaluationSharePayload = Readonly<{ url: string; title: string }>;

export type RealVideoEvaluationShareResult = Readonly<{ action: "sharedAction" | "dismissedAction" }>;

export const REAL_VIDEO_EVALUATION_SHARE_TITLE = "FormPath derived evaluation report";

/**
 * Prepares the already-validated report JSON as a temporary file, hands its URL
 * to a user-initiated share function, and removes the temporary item after the
 * share attempt. Dismissing the sheet is a distinct, non-error state.
 */
export async function shareRealVideoEvaluation(
  json: string,
  prepareFile: RealVideoEvaluationFilePreparer,
  share: (payload: RealVideoEvaluationSharePayload) => Promise<RealVideoEvaluationShareResult>,
): Promise<RealVideoEvaluationShareOutcome> {
  let prepared: PreparedRealVideoEvaluationFile | undefined;
  let outcome: RealVideoEvaluationShareOutcome = "share_failed";
  try {
    prepared = await prepareFile(json);
    const result = await share({ url: prepared.uri, title: REAL_VIDEO_EVALUATION_SHARE_TITLE });
    outcome = result.action === "sharedAction" ? "shared" : "share_dismissed";
  } catch {
    outcome = "share_failed";
  }
  if (prepared === undefined) return outcome;
  try {
    await prepared.cleanup();
  } catch {
    return "share_failed";
  }
  return outcome;
}

export type RealVideoEvaluationState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "building"; sessionGeneration: number }>
  | Readonly<{
    status: "ready" | "sharing" | RealVideoEvaluationShareOutcome;
    sessionGeneration: number;
    report: TwoViewEvaluationReportV1;
    json: string;
  }>
  | Readonly<{
    status: "build_failed";
    sessionGeneration: number;
    reason: RealVideoEvaluationBuildFailureReason;
  }>;

export function describeRealVideoEvaluationState(state: RealVideoEvaluationState): string {
  switch (state.status) {
    case "idle":
      return "아직 리포트를 만들지 않았습니다. 원본 영상과 랜드마크는 기기 밖으로 나가지 않습니다.";
    case "building":
      return "파생 리포트를 만드는 중입니다.";
    case "ready":
      return `파생 리포트 준비됨 · ${state.report.pipeline.status}${state.report.pipeline.reason ? ` · ${state.report.pipeline.reason}` : ""}`;
    case "sharing":
      return "공유 시트를 여는 중입니다.";
    case "shared":
      return "파생 리포트를 공유 시트로 전달했습니다.";
    case "share_dismissed":
      return "공유를 취소했습니다. 리포트는 그대로 준비되어 있습니다.";
    case "share_failed":
      return "공유 시트를 열지 못했습니다. 리포트는 그대로 준비되어 있으니 다시 시도하세요.";
    case "build_failed":
      return `리포트를 만들지 못했습니다 · ${state.reason}`;
  }
}
