import { describe, expect, it } from "vitest";

import {
  assessCrossViewPhaseAlignment,
  CROSS_VIEW_PHASE_ALIGNMENT_V1,
} from "@/lib/shooting-profile/cross-view-alignment";
import { angleBetweenDirections } from "@/lib/shooting-profile/direction-reconstruction";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import {
  buildRepresentativeSequence,
  type RepresentativeSequenceResultV1,
} from "@/lib/shooting-profile/representative-sequence";
import { PERSISTED_JOINT_NAMES_V2 } from "@/lib/shooting-profile/types";
import {
  syntheticDualViewSession,
  type SyntheticDualViewSession,
} from "@/tests/fixtures/synthetic-dual-view";

type Complete = Extract<RepresentativeSequenceResultV1, { status: "complete" }>;
type Point3 = { x: number; y: number; z: number };

function expectComplete(result: RepresentativeSequenceResultV1): Complete {
  expect(result.status, JSON.stringify(result)).toBe("complete");
  if (result.status !== "complete") throw new Error("unreachable");
  return result;
}

function expectRecaptureWithoutProfile(result: RepresentativeSequenceResultV1): void {
  expect(result.status).toBe("recapture_required");
  if (result.status !== "recapture_required") return;
  expect("profile" in result).toBe(false);
  expect("frames" in result).toBe(false);
  expect("confidence" in result).toBe(false);
  expect(JSON.stringify(result)).not.toContain("joints");
}

function maximumTrace(result: Complete): number {
  return Math.max(...result.profile.frames.flatMap((frame) => (
    Object.values(frame.uncertainty).map(({ covariance }) => covariance[0] + covariance[3] + covariance[5])
  )));
}

function meanCone(result: Complete): number {
  const cones = result.profile.frames.flatMap((frame) => (
    Object.values(frame.uncertainty).map((uncertainty) => uncertainty.directionalConeDegrees)
  ));
  return cones.reduce((sum, value) => sum + value, 0) / cones.length;
}

function jointsOf(result: Complete): Record<string, Point3>[] {
  return result.profile.frames.map((frame) => frame.joints);
}

/** Re-times the shooting-side attempts as if recorded later and slower. */
function retimeSide(
  session: SyntheticDualViewSession,
  offsetMs: number,
  durationScale: number,
): SyntheticDualViewSession {
  const retime = (attempt: NormalizedViewAttemptV2): NormalizedViewAttemptV2 => {
    const origin = attempt.phaseAnchors[0].timestampMs;
    const map = (timestampMs: number) => origin + offsetMs + (timestampMs - origin) * durationScale;
    return {
      ...attempt,
      phaseAnchors: attempt.phaseAnchors.map((anchor) => ({ ...anchor, timestampMs: map(anchor.timestampMs) })),
      frames: attempt.frames.map((frame) => ({ ...frame, sourceTimestampMs: map(frame.sourceTimestampMs) })),
    };
  };
  return { ...session, shootingSideAttempts: session.shootingSideAttempts.map(retime) };
}

/** Mirrors both camera images horizontally (x -> -x in isotropic units). */
function mirrorImages(session: SyntheticDualViewSession): SyntheticDualViewSession {
  const mirror = (attempts: readonly NormalizedViewAttemptV2[]) => attempts.map((attempt) => ({
    ...attempt,
    frames: attempt.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point) => ({ ...point, x: -point.x })),
    })),
  }));
  return {
    ...session,
    frontAttempts: mirror(session.frontAttempts),
    shootingSideAttempts: mirror(session.shootingSideAttempts),
  };
}

function withSideVisibility(
  session: SyntheticDualViewSession,
  landmarkIndices: readonly number[],
  visibility: number,
): SyntheticDualViewSession {
  const selected = new Set(landmarkIndices);
  return {
    ...session,
    shootingSideAttempts: session.shootingSideAttempts.map((attempt) => ({
      ...attempt,
      frames: attempt.frames.map((frame) => ({
        ...frame,
        sourceLandmarks: frame.sourceLandmarks.map((point, index) => (
          selected.has(index) ? { ...point, visibility } : point
        )),
      })),
    })),
  };
}

function elbowAngle(joints: Record<string, Point3>, side: "left" | "right"): number {
  const shoulder = joints[`${side}Shoulder`];
  const elbow = joints[`${side}Elbow`];
  const wrist = joints[`${side}Wrist`];
  return angleBetweenDirections(
    { x: shoulder.x - elbow.x, y: shoulder.y - elbow.y, z: shoulder.z - elbow.z },
    { x: wrist.x - elbow.x, y: wrist.y - elbow.y, z: wrist.z - elbow.z },
  );
}

describe("assessCrossViewPhaseAlignment", () => {
  it("accepts front and side takes that share canonical phase timing", () => {
    const basic = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const high = syntheticDualViewSession({ mode: "high_accuracy_3_plus_3" });

    expect(assessCrossViewPhaseAlignment(basic.frontAttempts, basic.shootingSideAttempts)).toEqual({
      status: "accepted",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      confidence: 1,
      maximumIntermediateAnchorDelta: 0,
      phaseIntervalRmse: 0,
      comparedPairCount: 1,
    });
    expect(assessCrossViewPhaseAlignment(high.frontAttempts, high.shootingSideAttempts)).toMatchObject({
      status: "accepted",
      comparedPairCount: 9,
    });
  });

  it("rejects a side take whose intermediate anchors sit beyond the provisional limit", () => {
    const session = syntheticDualViewSession({ mode: "basic_1_plus_1", sideAnchorShiftNormalized: 0.12 });
    const result = assessCrossViewPhaseAlignment(session.frontAttempts, session.shootingSideAttempts);

    expect(result).toMatchObject({ status: "rejected", reason: "cross_view_phase_mismatch", comparedPairCount: 1 });
    if (result.status !== "rejected") return;
    expect(result.maximumIntermediateAnchorDelta).toBeCloseTo(0.12, 9);
    expect(result.phaseIntervalRmse).toBeGreaterThan(0);
  });

  it("reports the typed identity and anchor failures without numbers", () => {
    const basic = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const [side] = basic.shootingSideAttempts;
    const corruptedAnchors: NormalizedViewAttemptV2 = {
      ...side,
      phaseAnchors: side.phaseAnchors.map((anchor, index) => (
        index === 2 ? { ...anchor, timestampMs: side.phaseAnchors[1].timestampMs - 1 } : anchor
      )),
    };
    const leftHanded: NormalizedViewAttemptV2 = {
      ...side,
      frames: side.frames.map((frame) => ({ ...frame, shootingHand: "left" as const })),
    };

    expect(assessCrossViewPhaseAlignment([], basic.shootingSideAttempts)).toMatchObject({
      status: "rejected",
      reason: "invalid_attempt_set",
    });
    expect(assessCrossViewPhaseAlignment(basic.shootingSideAttempts, basic.frontAttempts)).toMatchObject({
      status: "rejected",
      reason: "view_mismatch",
    });
    expect(assessCrossViewPhaseAlignment(basic.frontAttempts, [leftHanded])).toMatchObject({
      status: "rejected",
      reason: "shooting_hand_mismatch",
    });
    expect(assessCrossViewPhaseAlignment(basic.frontAttempts, [corruptedAnchors])).toMatchObject({
      status: "rejected",
      reason: "invalid_phase_anchors",
    });
  });
});

describe("buildRepresentativeSequence cross-view alignment gate", () => {
  it("aligns the same shot recorded later and slower in the side view to an identical profile", () => {
    const base = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const reference = expectComplete(buildRepresentativeSequence(base));
    const retimed = expectComplete(buildRepresentativeSequence(retimeSide(base, 37_500, 1.31)));

    expect(retimed.profile).toEqual(reference.profile);
    expect(retimed.confidence).toBe(reference.confidence);
    expect(retimed.crossViewAlignment.status).toBe("accepted");
    expect(retimed.crossViewAlignment.confidence).toBeCloseTo(reference.crossViewAlignment.confidence, 9);
    expect(retimed.crossViewAlignment.maximumIntermediateAnchorDelta).toBeCloseTo(
      reference.crossViewAlignment.maximumIntermediateAnchorDelta,
      9,
    );
    expect(retimed.crossViewAlignment.phaseIntervalRmse).toBeCloseTo(
      reference.crossViewAlignment.phaseIntervalRmse,
      9,
    );
  });

  it("exposes the accepted alignment score and evidence summary on a complete profile", () => {
    const result = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({ mode: "basic_1_plus_1" })));

    expect(result.crossViewAlignment).toMatchObject({
      status: "accepted",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      confidence: 1,
      comparedPairCount: 1,
    });
    expect(result.evidenceSummary.meanConditioning).toBeGreaterThan(0.1);
    expect(result.evidenceSummary.meanConditioning).toBeLessThanOrEqual(1);
    expect(result.evidenceSummary.minimumConditioning).toBeGreaterThanOrEqual(0.1);
    expect(result.evidenceSummary.minimumConditioning).toBeLessThanOrEqual(result.evidenceSummary.meanConditioning);
    expect(result.evidenceSummary.meanAvailability).toBeGreaterThan(0.5);
    expect(result.evidenceSummary.maximumDirectionalConeDegrees).toBeLessThanOrEqual(
      ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees,
    );
    expect(result.evidenceSummary.retainedAnchorDispersion).toBe(0);
    expect(Object.values(result.evidenceSummary).every((value) => Number.isFinite(value))).toBe(true);
  });

  it("requires recapture with a stable reason when front and side phase timing disagree", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      sideAnchorShiftNormalized: 0.12,
    }));

    expectRecaptureWithoutProfile(result);
    expect(result).toMatchObject({
      reason: "cross_view_phase_mismatch",
      crossViewAlignment: { status: "rejected", reason: "cross_view_phase_mismatch" },
    });
  });

  it.each(["basic_1_plus_1", "high_accuracy_3_plus_3"] as const)(
    "never lowers %s uncertainty or raises confidence as cross-view disagreement grows",
    (mode) => {
      // High takes already carry within-view timing jitter, so the synthetic
      // shoulder line (deliberately close to horizontal) reaches the 25-degree
      // admission cone sooner; stay inside the fused range for both modes.
      const shifts = mode === "basic_1_plus_1" ? [0, 0.03, 0.06, 0.09] : [0, 0.02, 0.04, 0.06];
      const results = shifts.map((sideAnchorShiftNormalized) => expectComplete(buildRepresentativeSequence(
        syntheticDualViewSession({ mode, sideAnchorShiftNormalized }),
      )));

      for (let index = 1; index < results.length; index += 1) {
        const previous = results[index - 1];
        const current = results[index];
        expect(current.crossViewAlignment.confidence).toBeLessThan(previous.crossViewAlignment.confidence);
        expect(current.crossViewAlignment.maximumIntermediateAnchorDelta).toBeGreaterThanOrEqual(shifts[index] - 1e-9);
        expect(current.confidence).toBeLessThanOrEqual(previous.confidence);
        expect(maximumTrace(current)).toBeGreaterThanOrEqual(maximumTrace(previous));
        expect(meanCone(current)).toBeGreaterThanOrEqual(meanCone(previous));
        // Only timing evidence changed, so the estimate itself must not move.
        expect(jointsOf(current)).toEqual(jointsOf(results[0]));
      }
      expect(results.at(-1)!.confidence).toBeLessThan(results[0].confidence);
      expect(maximumTrace(results.at(-1)!)).toBeGreaterThan(maximumTrace(results[0]));
      expect(meanCone(results.at(-1)!)).toBeGreaterThan(meanCone(results[0]));
      if (mode === "basic_1_plus_1") {
        results.forEach((result) => expect(result.confidence).toBeLessThanOrEqual(0.65));
      }
    },
  );

  it("keeps High-accuracy retained-take dispersion and cross-view disagreement both visible", () => {
    const aligned = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
    })));
    const shifted = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      sideAnchorShiftNormalized: 0.05,
    })));

    expect(aligned.crossViewAlignment.comparedPairCount).toBe(shifted.crossViewAlignment.comparedPairCount);
    expect(shifted.crossViewAlignment.confidence).toBeLessThan(aligned.crossViewAlignment.confidence);
    expect(shifted.evidenceSummary.retainedAnchorDispersion).toBeGreaterThanOrEqual(0.05);
    expect(shifted.confidence).toBeLessThan(aligned.confidence);
    expect(maximumTrace(shifted)).toBeGreaterThan(maximumTrace(aligned));
    expect(jointsOf(shifted)).toEqual(jointsOf(aligned));
  });

  it("fails closed on a corrupted phase anchor in one view without partial output", () => {
    const base = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const corrupted: SyntheticDualViewSession = {
      ...base,
      shootingSideAttempts: base.shootingSideAttempts.map((attempt) => ({
        ...attempt,
        phaseAnchors: attempt.phaseAnchors.map((anchor, index) => (
          index === 2 ? { ...anchor, timestampMs: attempt.phaseAnchors[1].timestampMs } : anchor
        )),
      })),
    };

    const result = buildRepresentativeSequence(corrupted);

    expectRecaptureWithoutProfile(result);
    expect(["invalid_attempt", "invalid_phase_anchors"]).toContain(
      (result as { reason: string }).reason,
    );
  });

  it("requires recapture when a side-view shooting-arm landmark is effectively missing", () => {
    const result = buildRepresentativeSequence(withSideVisibility(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      [16],
      0,
    ));

    expectRecaptureWithoutProfile(result);
    expect(typeof (result as { reason: string }).reason).toBe("string");
  });

  it("lowers confidence and never lowers uncertainty when side-view visibility is low", () => {
    // High mode is uncapped, so the confidence change is observable; Basic would
    // hide it behind the 0.65 cap while still carrying the uncertainty change.
    const clear = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
    })));
    const dim = expectComplete(buildRepresentativeSequence(withSideVisibility(
      syntheticDualViewSession({ mode: "high_accuracy_3_plus_3" }),
      [14, 16],
      0.6,
    )));

    expect(dim.confidence).toBeLessThan(clear.confidence);
    expect(dim.evidenceSummary.meanAvailability).toBeLessThan(clear.evidenceSummary.meanAvailability);
    expect(maximumTrace(dim)).toBeGreaterThanOrEqual(maximumTrace(clear));
    expect(meanCone(dim)).toBeGreaterThanOrEqual(meanCone(clear));
  });

  it("mirrors both camera images without swapping anatomical joint identity", () => {
    const base = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const reference = expectComplete(buildRepresentativeSequence(base));
    const mirrored = expectComplete(buildRepresentativeSequence(mirrorImages(base)));

    expect(mirrored.crossViewAlignment).toEqual(reference.crossViewAlignment);
    expect(mirrored.confidence).toBeCloseTo(reference.confidence, 9);
    mirrored.profile.frames.forEach((frame, frameIndex) => {
      const original = reference.profile.frames[frameIndex].joints;
      expect(Object.keys(frame.joints)).toEqual([...PERSISTED_JOINT_NAMES_V2]);
      for (const joint of PERSISTED_JOINT_NAMES_V2) {
        expect(frame.joints[joint].x).toBeCloseTo(-original[joint].x, 9);
        expect(frame.joints[joint].y).toBeCloseTo(original[joint].y, 9);
        expect(frame.joints[joint].z).toBeCloseTo(-original[joint].z, 9);
      }
      expect(elbowAngle(frame.joints, "left")).toBeCloseTo(elbowAngle(original, "left"), 9);
      expect(elbowAngle(frame.joints, "right")).toBeCloseTo(elbowAngle(original, "right"), 9);
    });
  });

  it("mirrors only depth for a left-handed shooter and keeps every joint name", () => {
    const right = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      shootingHand: "right",
    })));
    const left = expectComplete(buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      shootingHand: "left",
    })));

    expect(left.crossViewAlignment).toEqual(right.crossViewAlignment);
    left.profile.frames.forEach((frame, frameIndex) => {
      const original = right.profile.frames[frameIndex].joints;
      for (const joint of PERSISTED_JOINT_NAMES_V2) {
        expect(frame.joints[joint].x).toBeCloseTo(original[joint].x, 9);
        expect(frame.joints[joint].y).toBeCloseTo(original[joint].y, 9);
        expect(frame.joints[joint].z).toBeCloseTo(-original[joint].z, 9);
      }
    });
  });
});
