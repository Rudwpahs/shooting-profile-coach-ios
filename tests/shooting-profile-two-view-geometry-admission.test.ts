import { describe, expect, it } from "vitest";

import {
  assessCrossViewGeometry,
  assessNormalizedCrossViewGeometry,
  CROSS_VIEW_GEOMETRY_V1,
} from "@/lib/shooting-profile/cross-view-geometry";
import { buildTwoViewEvaluationReport } from "@/lib/shooting-profile/evaluation-report";
import {
  detectPhaseAnchors,
  resampleAttemptToPhaseGrid,
} from "@/lib/shooting-profile/phase-normalization";
import {
  buildTwoViewRepresentativeProfile,
  type TwoViewPipelineAttemptV1,
  type TwoViewPipelineResultV1,
} from "@/lib/shooting-profile/two-view-pipeline";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

type Session = { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] };

function attemptsFor(session: Session): TwoViewPipelineAttemptV1[] {
  return [...session.front, ...session.shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

function relabel(sequence: LandmarkSequenceV2, view: "front" | "shooting_side"): LandmarkSequenceV2 {
  return { ...sequence, view };
}

function mirrorHorizontally(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point) => ({ ...point, x: 1 - point.x })),
    })),
  };
}

function stall(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const first = sequence.frames[0].sourceLandmarks;
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: first.map((point) => ({ ...point })),
    })),
  };
}

function expectRecapture(
  result: TwoViewPipelineResultV1,
): Extract<TwoViewPipelineResultV1, { status: "recapture_required" }> {
  expect(result.status).toBe("recapture_required");
  if (result.status !== "recapture_required") throw new Error("unreachable");
  expect("saveInput" in result).toBe(false);
  expect("profile" in result).toBe(false);
  expect(JSON.stringify(result)).not.toContain("joints");
  return result;
}

describe("product-path cross-view geometry admission", () => {
  it("refuses to build a profile when the side view is the front clip relabelled", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const attempts = attemptsFor({
      ...session,
      shootingSide: [relabel(session.front[0], "shooting_side")],
    });

    const result = expectRecapture(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts,
    }));

    expect(result.reason).toBe("duplicate_view_projection");
    expect([...result.affectedAttemptIds].sort()).toEqual(["front-0", "shooting_side-0"]);
    expect(result.affectedBones).toEqual([]);
    expect(result.crossViewGeometry).toMatchObject({
      status: "rejected",
      version: CROSS_VIEW_GEOMETRY_V1.version,
      reason: "duplicate_view_projection",
      comparedPairCount: 1,
    });
    expect(result.crossViewGeometry?.minimumNormalizedViewDistance).toBeLessThan(
      CROSS_VIEW_GEOMETRY_V1.minimumNormalizedViewDistance,
    );
  });

  it("refuses to build a profile from a mirrored copy of the same clip", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const attempts = attemptsFor({
      ...session,
      shootingSide: [relabel(mirrorHorizontally(session.front[0]), "shooting_side")],
    });

    const result = expectRecapture(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts,
    }));

    expect(result.reason).toBe("mirrored_view_projection");
    expect(result.crossViewGeometry?.status).toBe("rejected");
  });

  it("rejects a High session before consensus when every side take is a front take", () => {
    const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" });
    const attempts = attemptsFor({
      ...session,
      shootingSide: session.front.map((sequence) => relabel(sequence, "shooting_side")),
    });

    const result = expectRecapture(buildTwoViewRepresentativeProfile({
      mode: "high_accuracy_3_plus_3",
      shootingHand: "right",
      attempts,
    }));

    expect(result.reason).toBe("duplicate_view_projection");
    expect(result.affectedAttemptIds).toHaveLength(6);
    expect(result.crossViewGeometry?.comparedPairCount).toBe(9);
    // Nothing downstream ran: no alignment verdict is attached to a geometry rejection.
    expect(result.crossViewAlignment).toBeUndefined();
  });

  it("keeps a genuine pair complete and reports the accepted geometry margin", () => {
    for (const shootingHand of ["right", "left"] as const) {
      for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
        const result = buildTwoViewRepresentativeProfile({
          mode,
          shootingHand,
          attempts: attemptsFor(syntheticLandmarkSession({ mode, shootingHand })),
        });

        expect(result.status, `${shootingHand}/${mode}`).toBe("complete");
        if (result.status !== "complete") continue;
        expect(result.crossViewGeometry.status).toBe("accepted");
        if (result.crossViewGeometry.status !== "accepted") continue;
        expect(result.crossViewGeometry.minimumNormalizedViewDistance).toBeGreaterThan(
          CROSS_VIEW_GEOMETRY_V1.minimumNormalizedViewDistance * 2,
        );
        expect(result.crossViewGeometry.comparedPairCount).toBe(mode === "basic_1_plus_1" ? 1 : 9);
      }
    }
  });

  it("never masks a phase-detection failure with a geometry verdict", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectRecapture(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor({ ...session, shootingSide: [stall(session.shootingSide[0])] }),
    }));

    expect(result.reason).toBe("phase_detection_failed");
    expect(result.crossViewGeometry).toBeUndefined();
  });

  it("measures the same distance from raw clips and from already normalized attempts", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const attempts = attemptsFor(session);
    const normalized = attempts.map((attempt) => {
      const phaseAnchors = detectPhaseAnchors(attempt.sequence);
      return {
        id: attempt.id,
        phaseAnchors,
        frames: resampleAttemptToPhaseGrid(attempt.sequence, phaseAnchors),
      };
    });

    expect(assessNormalizedCrossViewGeometry(normalized)).toEqual(assessCrossViewGeometry(attempts));
  });
});

describe("derived report carries the geometry verdict", () => {
  it("records an accepted margin on a complete report and the rejection on a recapture", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const complete = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(session),
    });
    expect(complete.crossViewGeometry).toMatchObject({
      status: "accepted",
      version: CROSS_VIEW_GEOMETRY_V1.version,
      comparedPairCount: 1,
    });

    const duplicated = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor({ ...session, shootingSide: [relabel(session.front[0], "shooting_side")] }),
    });
    expect(duplicated.pipeline).toMatchObject({
      status: "recapture_required",
      reason: "duplicate_view_projection",
    });
    expect(duplicated.crossViewGeometry).toMatchObject({
      status: "rejected",
      reason: "duplicate_view_projection",
    });
    expect(duplicated.crossViewAlignment).toBeUndefined();
  });
});
