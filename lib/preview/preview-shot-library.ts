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

/**
 * Twenty-four archetypes that differ in the pose itself, because a stored
 * profile is pelvis-centred and phase-normalised: dip depth, jump height and
 * tempo vanish, while release height, arm direction, elbow, lean, shoulder
 * turn, knee flexion, stance and the guide hand all survive and are what the
 * release still on a Profile tile actually shows. The glyph-space test in
 * `tests/preview-shot-library.test.ts` keeps every pair apart at a glance.
 */
export const PREVIEW_SHOT_ARCHETYPES: readonly PreviewShotArchetypeV1[] = Object.freeze([
  // Both feet planted, guide hand up.
  archetype(1, "canonical-balanced", "균형 잡힌 기본 리듬", {}),
  archetype(2, "compact-quick-release", "컴팩트 · 슈팅 발을 앞에 둔 빠른 릴리스", {
    mode: "high_accuracy_3_plus_3",
    style: { footStagger: 1.2, legExtension: 0.6 },
    anchorScheduleShift: -0.08,
    durationScale: 0.9,
    confidence: 0.7656,
  }),
  archetype(3, "fadeaway", "뒤로 젖히며 넘기는 페이드어웨이", {
    style: { forwardLean: -0.7, releaseElevation: -0.4 },
  }),
  archetype(4, "forward-lean-tuck", "앞으로 기울이고 가이드 핸드를 모은 릴리스", {
    style: { forwardLean: 0.7, offHandTuck: 0.85 },
  }),
  archetype(5, "stagger-back", "슈팅 발을 뒤로 뺀 스탠스", {
    mode: "high_accuracy_3_plus_3",
    style: { footStagger: -1.2 },
    confidence: 0.7806,
  }),
  archetype(6, "wide-squat-set", "넓게 디디고 무릎을 굽힌 채 쏘는 셋 슛", {
    style: { stanceWidth: 5, legExtension: 0 },
  }),
  archetype(7, "lean-back-stride", "앞발을 내딛고 뒤로 젖히는 릴리스", {
    style: { forwardLean: -0.85, footStagger: 1.2 },
  }),
  archetype(8, "lean-forward-trail-foot", "앞으로 기울이고 뒷발을 끌며 쏘는 릴리스", {
    style: { forwardLean: 0.75, offHandTuck: 0.85, footStagger: -1.2 },
  }),
  archetype(9, "bent-knees-lean-away", "반대쪽으로 기울이고 무릎을 굽힌 채 쏘는 릴리스", {
    style: { sideLean: -0.55, legExtension: 0 },
  }),
  // Guide hand hanging at the side (one-hand forms).
  archetype(10, "one-hand-release", "가이드 핸드를 내린 원핸드 릴리스", {
    style: { offHandDrop: 1 },
  }),
  archetype(11, "one-hand-fadeaway", "원핸드 · 뒤로 젖히며 넘기는 페이드어웨이", {
    style: { offHandDrop: 1, forwardLean: -0.7, releaseElevation: -0.4 },
  }),
  archetype(12, "one-hand-forward-bent", "왼손 · 원핸드 · 앞으로 기울이고 무릎을 굽힌 릴리스", {
    shootingHand: "left",
    style: { offHandDrop: 1, forwardLean: 0.75, legExtension: 0.3 },
  }),
  archetype(13, "one-hand-stride", "원핸드 · 슈팅 발을 앞에 둔 릴리스", {
    style: { offHandDrop: 1, footStagger: 1.2 },
  }),
  archetype(14, "one-hand-trail-foot", "원핸드 · 슈팅 발을 뒤로 뺀 릴리스", {
    style: { offHandDrop: 1, footStagger: -1.2 },
  }),
  archetype(15, "one-hand-wide-squat", "원핸드 · 넓게 디디고 무릎을 굽힌 셋 슛", {
    mode: "high_accuracy_3_plus_3",
    style: { offHandDrop: 1, stanceWidth: 5, legExtension: 0 },
    confidence: 0.7799,
  }),
  archetype(16, "one-hand-lean-back-stride", "원핸드 · 앞발을 내딛고 뒤로 젖히는 릴리스", {
    style: { offHandDrop: 1, forwardLean: -0.85, footStagger: 1.2 },
  }),
  archetype(17, "one-hand-forward-trail-foot", "원핸드 · 앞으로 기울이고 뒷발을 끌며 무릎을 굽힌 릴리스", {
    style: { offHandDrop: 1, forwardLean: 0.75, legExtension: 0.3, footStagger: -1.2 },
  }),
  // Off-hand-side leg lifted through release (kick-leg forms).
  archetype(18, "kick-leg-release", "한 다리를 들어 올리는 릴리스", {
    style: { freeLegLift: 1, sideLean: 0.2 },
  }),
  archetype(19, "kick-forward-lean", "다리를 들고 앞으로 기울여 가이드 핸드를 모은 릴리스", {
    style: { freeLegLift: 1, sideLean: 0.2, forwardLean: 0.7, offHandTuck: 0.85 },
  }),
  archetype(20, "kick-trail-foot", "다리를 들고 굽힌 디딤발을 뒤로 뺀 릴리스", {
    style: { freeLegLift: 1, sideLean: 0.2, footStagger: -0.9, legExtension: 0 },
  }),
  archetype(21, "kick-fadeaway", "다리를 들고 뒤로 젖히는 러너", {
    style: { freeLegLift: 1, forwardLean: -0.5, releaseElevation: -0.3 },
  }),
  // Leg lifted and guide hand hanging (one-hand runner forms).
  archetype(22, "kick-one-hand", "다리를 들고 가이드 핸드를 내린 원핸드 러너", {
    style: { freeLegLift: 1, offHandDrop: 1, forwardLean: 0.25 },
  }),
  archetype(23, "kick-one-hand-forward-bent", "왼손 · 원핸드 러너 · 앞으로 기울이고 무릎을 굽힌 릴리스", {
    shootingHand: "left",
    style: { freeLegLift: 1, offHandDrop: 1, forwardLean: 0.75, legExtension: 0, sideLean: 0.3 },
  }),
  archetype(24, "kick-one-hand-trail-foot", "원핸드 러너 · 굽힌 디딤발을 뒤로 뺀 릴리스", {
    style: { freeLegLift: 1, offHandDrop: 1, forwardLean: 0.25, footStagger: -0.9, legExtension: 0 },
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
