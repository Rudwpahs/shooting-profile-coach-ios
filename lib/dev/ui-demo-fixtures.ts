import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";
import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * Deterministic DEMO FIXTURES for visual QA. Everything here derives from the
 * synthetic landmark session the test-suite uses: no account, no network, no
 * recording, no person. Loaded only by the gated demo route.
 */
export type UiDemoFixtures = {
  profile: RepresentativePose4DV2;
  recaptureProfile: RepresentativePose4DV2;
  record: NonNullable<ShootingProfileViewerRecordV2>;
  summaries: ShootingProfileSummaryV2[];
  capture: Record<"setup" | "collecting" | "recapture" | "review", CaptureSessionState>;
};

const DEMO_DATE = new Date(2026, 8, 15, 10, 0, 0);

function timestampLike(date: Date): ShootingProfileSummaryV2["createdAt"] {
  return { toDate: () => date } as unknown as ShootingProfileSummaryV2["createdAt"];
}

export function buildUiDemoFixtures(): UiDemoFixtures {
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
  const sequences = [...session.front, ...session.shootingSide];
  const attempts = sequences.map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence }));
  const result = buildTwoViewRepresentativeProfile({ mode: "basic_1_plus_1", shootingHand: "right", attempts });
  if (result.status !== "complete") throw new Error("demo fixture must reconstruct");
  const profile = result.profile;
  const recaptureProfile: RepresentativePose4DV2 = { ...profile, quality: { passed: false, reasons: ["demo_fixture_recapture"] } };
  const record = { profile, shootingHand: "right" as const, confidence: result.confidence };
  const summaries: ShootingProfileSummaryV2[] = [
    { id: "demo-fixture-001", mode: "basic_1_plus_1", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(DEMO_DATE) },
    { id: "demo-fixture-002", mode: "high_accuracy_3_plus_3", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(new Date(2026, 8, 12)) },
    { id: "demo-fixture-003", mode: "basic_1_plus_1", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(new Date(2026, 8, 3)) },
  ];

  const setup = captureSessionReducer(createCaptureSession(), { type: "SELECT_MODE", mode: "basic_1_plus_1" });
  const collecting = captureSessionReducer(setup, { type: "START_COLLECTION" });
  const frontSlot = collecting.slots[0];
  const started = captureSessionReducer(collecting, {
    type: "SLOT_ACQUIRE_STARTED",
    slotId: frontSlot.id,
    requestId: "demo-request-1",
    generation: frontSlot.generation + 1,
  });
  const recapture = captureSessionReducer(started, {
    type: "SLOT_REJECTED",
    slotId: frontSlot.id,
    requestId: "demo-request-1",
    generation: frontSlot.generation + 1,
    reason: "어깨·손목·골반·무릎·발목이 충분히 보이지 않았습니다. 전신과 슈팅 팔이 가려지지 않게 다시 촬영하세요.",
  });

  let review = collecting;
  for (const slot of collecting.slots) {
    const sequence = sequences.find((candidate) => candidate.view === slot.view && candidate.takeIndex === slot.takeIndex);
    if (!sequence) throw new Error("demo fixture slot has no sequence");
    const current = review.slots.find((candidate) => candidate.id === slot.id);
    if (!current) throw new Error("demo fixture slot disappeared");
    const generation = current.generation + 1;
    review = captureSessionReducer(review, { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId: `demo-${slot.id}`, generation });
    review = captureSessionReducer(review, { type: "SLOT_ACCEPTED", slotId: slot.id, requestId: `demo-${slot.id}`, generation, sequence });
  }
  review = captureSessionReducer(review, { type: "AGGREGATE_STARTED" });
  review = captureSessionReducer(review, {
    type: "AGGREGATE_COMPLETED",
    sessionGeneration: review.sessionGeneration,
    profile,
    confidence: result.confidence,
  });
  if (review.status !== "result_review") throw new Error(`demo fixture review state is ${review.status}`);

  return { profile, recaptureProfile, record, summaries, capture: { setup, collecting, recapture, review } };
}
