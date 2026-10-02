import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";
import type { CaptureProtocolV2, LandmarkSequenceV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { syntheticLandmarkSession, type SyntheticShotStyleV1 } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * PREVIEW-ONLY SYNTHETIC SHOT LIBRARY.
 *
 * Every profile here is generated from the synthetic landmark session the
 * test-suite uses, with one deterministic style per archetype, and then run
 * through the unchanged two-view pipeline. Nothing is measured, nothing is
 * recorded, nobody is depicted: these are template-length synthetic
 * examples that exist so the install-free preview shows that shooting forms
 * differ. The same id always yields the same motion, phases and summary.
 * No randomness is involved anywhere in this module.
 *
 * What a stored profile can show: pelvis-centred joint directions over the
 * 101 normalised phases. Tempo is normalised away by design, so "rhythm"
 * archetypes differ in how the arm's lift is sequenced against the legs, and
 * a deep dip shows as a deeper knee bend rather than a lower pelvis.
 */

export type PreviewShotArchetypeV1 = Readonly<{
  /** Opaque profile id used by the real routes (`/private-analysis/<id>`). */
  id: string;
  /** Stable archetype key for tests and tooling; never a person's name. */
  key: string;
  /** One-line Korean description used for captions and accessibility. */
  label: string;
  mode: CaptureProtocolV2;
  shootingHand: ShootingHandV2;
  /** Days before the library's anchor date; newest first. */
  ageDays: number;
  style: Partial<SyntheticShotStyleV1>;
  /** Timing of the shot relative to the canonical schedule (within the generator's ±0.2 bound). */
  anchorScheduleShift: number;
  /** Clip tempo relative to the canonical two-second shot. */
  durationScale: number;
  /**
   * The pipeline's confidence for this archetype, recorded so listing stays
   * instant; `tests/preview-shot-library.test.ts` rebuilds every profile and
   * fails if the pipeline disagrees with this value.
   */
  confidence: number;
}>;

/** All summaries hang off this date so the library never depends on the clock. */
export const PREVIEW_SHOT_LIBRARY_ANCHOR_DATE = Object.freeze(new Date(2026, 8, 30, 18, 30, 0));

const BASIC_CONFIDENCE = 0.65;

const archetype = (
  index: number,
  key: string,
  label: string,
  spec: Readonly<{
    mode?: CaptureProtocolV2;
    shootingHand?: ShootingHandV2;
    style?: Partial<SyntheticShotStyleV1>;
    anchorScheduleShift?: number;
    durationScale?: number;
    confidence?: number;
  }>,
): PreviewShotArchetypeV1 => Object.freeze({
  id: `preview-shot-${String(index).padStart(3, "0")}`,
  key,
  label,
  mode: spec.mode ?? "basic_1_plus_1",
  shootingHand: spec.shootingHand ?? "right",
  // Strictly increasing with the index, so the list is newest first with no two profiles on the same day.
  ageDays: (index - 1) * 3 + (index % 2),
  style: Object.freeze({ ...(spec.style ?? {}) }),
  anchorScheduleShift: spec.anchorScheduleShift ?? 0,
  durationScale: spec.durationScale ?? 1,
  confidence: spec.confidence ?? BASIC_CONFIDENCE,
});

export const PREVIEW_SHOT_ARCHETYPES: readonly PreviewShotArchetypeV1[] = Object.freeze([
  archetype(1, "canonical-balanced", "균형 잡힌 기본 리듬", {}),
  archetype(2, "compact-quick-release", "컴팩트 · 빠른 릴리스", {
    style: { dipKneeBend: 1.45, armLiftStart: 0.5, setPointHold: 0.3, releaseHeight: 0.96, releaseElevation: 0.2, elbowFlare: 0.22, offHandTuck: 0.2, stanceWidth: 0.7 },
    anchorScheduleShift: -0.08,
    durationScale: 0.9,
  }),
  archetype(3, "high-set-point", "높은 셋포인트 릴리스", {
    style: { releaseElevation: -0.3, armLiftStart: 0.46, setPointHold: 0.4, elbowFlare: 0.1 },
  }),
  archetype(4, "deep-dip-rhythm", "깊은 딥 리듬", {
    style: { dipDepth: -0.68, jumpHeight: 0.6, dipKneeBend: 0.62 },
    durationScale: 1.1,
  }),
  archetype(5, "shallow-dip-rhythm", "얕은 딥 리듬", {
    style: { dipDepth: -0.46, jumpHeight: 0.45, dipKneeBend: 1.45, releaseElevation: 0.1, elbowFlare: 0.26, stanceWidth: 0.9 },
  }),
  archetype(6, "one-motion-smooth", "원모션 · 부드러운 상승", {
    style: { setPointHold: 0.5, armLiftStart: 0.24, releaseElevation: -0.1, elbowFlare: 0.16, dipKneeBend: 0.9 },
  }),
  archetype(7, "two-stage-set", "투스테이지 셋 · 멈춤 후 릴리스", {
    style: { setPointHold: 0.1, armLiftStart: 0.6, releaseElevation: -0.12 },
    anchorScheduleShift: 0.06,
    durationScale: 1.15,
  }),
  archetype(8, "forward-lean", "앞으로 기운 릴리스", {
    style: { forwardLean: 0.3, sideDrift: 0.05, releaseElevation: 0.18 },
  }),
  archetype(9, "upright-release", "곧게 선 릴리스", {
    style: { forwardLean: -0.14, releaseElevation: -0.2, stanceWidth: 0.9 },
  }),
  archetype(10, "wide-stance", "넓은 스탠스", {
    style: { stanceWidth: 1.55, dipDepth: -0.6, dipKneeBend: 0.85 },
  }),
  archetype(11, "narrow-stance", "좁은 스탠스", {
    style: { stanceWidth: 0.55 },
  }),
  archetype(12, "strong-hip-drive", "강한 힙 드라이브", {
    mode: "high_accuracy_3_plus_3",
    style: { hipDrive: 1.5, jumpHeight: 0.75, dipDepth: -0.65, dipKneeBend: 0.6, stanceWidth: 1.3, forwardLean: 0.12 },
    confidence: 0.8824,
  }),
  archetype(13, "low-jump-quick", "낮은 점프 · 빠른 릴리스", {
    style: { jumpHeight: 0.3, armLiftStart: 0.5, setPointHold: 0.12, hipDrive: 0.8, releaseElevation: 0.22 },
    anchorScheduleShift: -0.1,
  }),
  archetype(14, "high-jump-release", "높은 점프 릴리스", {
    mode: "high_accuracy_3_plus_3",
    style: { jumpHeight: 0.85, dipDepth: -0.62, armLiftStart: 0.44, setPointHold: 0.42, dipKneeBend: 1.1, hipDrive: 1.3, releaseElevation: -0.22, stanceWidth: 0.8 },
    confidence: 0.7967,
  }),
  archetype(15, "early-elbow-lift", "이른 팔꿈치 리프트", {
    style: { armLiftStart: 0.36, setPointHold: 0.35, elbowFlare: 0.36, releaseElevation: 0.1, stanceWidth: 1.1 },
  }),
  archetype(16, "delayed-elbow-lift", "늦은 팔꿈치 리프트", {
    style: { armLiftStart: 0.66, setPointHold: 0.1, elbowFlare: 0.14 },
  }),
  archetype(17, "pronounced-follow-through", "길게 뻗는 팔로우스루", {
    style: { followThroughReach: 0.3, releaseHeight: 1.1 },
  }),
  archetype(18, "short-follow-through", "짧은 팔로우스루", {
    style: { followThroughReach: -0.2, releaseHeight: 0.85, releaseElevation: 0.25, elbowFlare: 0.24, dipKneeBend: 1.15 },
  }),
  archetype(19, "shooting-side-drift", "슈팅 쪽으로 흐르는 체중", {
    style: { sideDrift: 0.16, sideLean: 0.16, stanceWidth: 1.15 },
  }),
  archetype(20, "slow-rhythm", "느린 리듬 · 늦게 올리는 셋", {
    style: { setPointHold: 0.08, armLiftStart: 0.64, dipKneeBend: 0.85, forwardLean: -0.06, stanceWidth: 0.95, sideLean: -0.08 },
    anchorScheduleShift: 0.1,
    durationScale: 1.3,
  }),
  archetype(21, "fast-rhythm", "빠른 리듬 · 함께 올라가는 팔", {
    style: { setPointHold: 0.3, armLiftStart: 0.42, dipKneeBend: 1.2, forwardLean: 0.1, elbowFlare: 0.3, sideLean: 0.06, stanceWidth: 0.9 },
    anchorScheduleShift: -0.12,
    durationScale: 0.8,
  }),
  archetype(22, "left-handed-compact", "왼손 · 컴팩트 셋", {
    shootingHand: "left",
    style: { dipDepth: -0.5, setPointHold: 0.3, armLiftStart: 0.5, dipKneeBend: 1.15, forwardLean: 0.12, stanceWidth: 1.2, releaseElevation: 0.1, sideLean: -0.1 },
  }),
  archetype(23, "off-hand-tucked", "오프핸드를 낮게 두는 릴리스", {
    style: { offHandTuck: 0.55, elbowFlare: 0.3 },
  }),
  archetype(24, "elbow-flare", "벌어진 팔꿈치", {
    mode: "high_accuracy_3_plus_3",
    style: { elbowFlare: 0.48, releaseElevation: 0.06 },
    confidence: 0.7775,
  }),
]);

export const PREVIEW_SHOT_IDS: readonly string[] = Object.freeze(PREVIEW_SHOT_ARCHETYPES.map((entry) => entry.id));

export function findPreviewShotArchetype(id: string): PreviewShotArchetypeV1 | null {
  return PREVIEW_SHOT_ARCHETYPES.find((entry) => entry.id === id) ?? null;
}

function timestampLike(date: Date): ShootingProfileSummaryV2["createdAt"] {
  return { toDate: () => date } as unknown as ShootingProfileSummaryV2["createdAt"];
}

export function previewShotCreatedAt(entry: PreviewShotArchetypeV1): Date {
  return new Date(PREVIEW_SHOT_LIBRARY_ANCHOR_DATE.getTime() - entry.ageDays * 24 * 60 * 60 * 1000);
}

/** The summary the list screens show; instant, no pipeline run. */
export function previewShotSummary(entry: PreviewShotArchetypeV1): ShootingProfileSummaryV2 {
  return {
    id: entry.id,
    mode: entry.mode,
    shootingHand: entry.shootingHand,
    confidence: entry.confidence,
    createdAt: timestampLike(previewShotCreatedAt(entry)),
  };
}

/** The synthetic clips that stand in for this archetype's accepted captures. */
export function previewShotSequences(entry: PreviewShotArchetypeV1): LandmarkSequenceV2[] {
  const session = syntheticLandmarkSession({
    mode: entry.mode,
    shootingHand: entry.shootingHand,
    anchorScheduleShift: entry.anchorScheduleShift,
    durationScale: entry.durationScale,
    style: entry.style,
  });
  return [...session.front, ...session.shootingSide];
}

export type PreviewShotRecordV1 = NonNullable<ShootingProfileViewerRecordV2>;

const records = new Map<string, PreviewShotRecordV1>();

/**
 * Runs the archetype through the real two-view pipeline. Memoised per id;
 * deterministic inputs make the output identical on every call.
 */
export function buildPreviewShotRecord(entry: PreviewShotArchetypeV1): PreviewShotRecordV1 {
  const cached = records.get(entry.id);
  if (cached) return cached;
  const sequences = previewShotSequences(entry);
  const result = buildTwoViewRepresentativeProfile({
    mode: entry.mode,
    shootingHand: entry.shootingHand,
    attempts: sequences.map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
  });
  if (result.status !== "complete") {
    throw new Error(`preview shot ${entry.key} does not reconstruct: ${result.reason}`);
  }
  const record: PreviewShotRecordV1 = {
    profile: result.profile,
    shootingHand: entry.shootingHand,
    confidence: result.confidence,
  };
  records.set(entry.id, record);
  return record;
}
