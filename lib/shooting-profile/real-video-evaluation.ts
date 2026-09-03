import type { CaptureSessionState } from "@/lib/shooting-profile/capture-session-reducer";
import {
  assertReportContainsNoRawEvidence,
  buildTwoViewEvaluationReport,
  twoViewEvaluationReportSchema,
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
  sequence: LandmarkSequenceV2;
}>;

const EVALUABLE_STATUSES: ReadonlySet<CaptureSessionState["status"]> = new Set([
  "result_review",
  "saving",
  "complete",
  "error",
] as const);

/**
 * Returns the accepted slot sequences already retained in reducer memory, or
 * `undefined` when the session is not in a state that has a complete set.
 */
export function collectEvaluationAttempts(
  state: CaptureSessionState,
): readonly RealVideoEvaluationAttemptV1[] | undefined {
  if (state.mode === null || state.slots.length === 0 || !EVALUABLE_STATUSES.has(state.status)) {
    return undefined;
  }
  const attempts: RealVideoEvaluationAttemptV1[] = [];
  for (const slot of state.slots) {
    if (slot.status !== "accepted" || slot.sequence === undefined) return undefined;
    attempts.push(Object.freeze({ id: slot.id, sequence: slot.sequence }));
  }
  return Object.freeze(attempts);
}

export type RealVideoEvaluationBuildFailureReason =
  | "session_not_ready"
  | "report_build_failed"
  | "raw_evidence_detected"
  | "schema_invalid";

export type RealVideoEvaluationBuildResult =
  | Readonly<{ status: "ready"; report: TwoViewEvaluationReportV1; json: string }>
  | Readonly<{ status: "build_failed"; reason: RealVideoEvaluationBuildFailureReason }>;

export type RealVideoEvaluationBuildOptions = Readonly<{
  sourceClass: BuildTwoViewEvaluationReportInput["sourceClass"];
  consentRecordId?: string;
  evaluatedCommitSha?: string;
}>;

export function buildRealVideoEvaluation(
  state: CaptureSessionState,
  options: RealVideoEvaluationBuildOptions,
): RealVideoEvaluationBuildResult {
  const attempts = collectEvaluationAttempts(state);
  if (attempts === undefined || state.mode === null) {
    return { status: "build_failed", reason: "session_not_ready" };
  }
  let report: TwoViewEvaluationReportV1;
  try {
    report = buildTwoViewEvaluationReport({
      sourceClass: options.sourceClass,
      ...(options.consentRecordId === undefined ? {} : { consentRecordId: options.consentRecordId }),
      ...(options.evaluatedCommitSha === undefined ? {} : { evaluatedCommitSha: options.evaluatedCommitSha }),
      mode: state.mode,
      shootingHand: state.shootingHand,
      attempts,
    });
  } catch {
    return { status: "build_failed", reason: "report_build_failed" };
  }
  try {
    assertReportContainsNoRawEvidence(report);
  } catch {
    return { status: "build_failed", reason: "raw_evidence_detected" };
  }
  const parsed = twoViewEvaluationReportSchema.safeParse(report);
  if (!parsed.success) return { status: "build_failed", reason: "schema_invalid" };
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
  | Readonly<{
    status: "ready" | RealVideoEvaluationShareOutcome;
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
    case "ready":
      return `파생 리포트 준비됨 · ${state.report.pipeline.status}${state.report.pipeline.reason ? ` · ${state.report.pipeline.reason}` : ""}`;
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
