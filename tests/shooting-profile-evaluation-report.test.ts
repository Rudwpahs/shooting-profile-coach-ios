import { describe, expect, it } from "vitest";

import {
  assertReportContainsNoRawEvidence,
  buildTwoViewEvaluationReport,
  twoViewEvaluationReportSchema,
} from "@/lib/shooting-profile/evaluation-report";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function attemptsFor(session: { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] }) {
  return [...session.front, ...session.shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

function freezeShootingArm(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const frozen = sequence.frames[0].sourceLandmarks;
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point, index) => (
        index >= 13 && index <= 16 ? { ...frozen[index] } : point
      )),
    })),
  };
}

describe("two-view evaluation report", () => {
  it("reports a complete Basic synthetic session without raw evidence", () => {
    const report = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
    });

    expect(twoViewEvaluationReportSchema.parse(report)).toEqual(report);
    expect(report.pipeline.status).toBe("complete");
    expect(report.reconstruction?.boneLengthDriftWithinTolerance).toBe(true);
    expect(report.reconstruction?.discontinuityCount).toBeLessThanOrEqual(2);
    expect(report.attempts).toHaveLength(2);
    report.attempts.forEach((attempt) => {
      expect(attempt.acceptedFrameRatio).toBe(1);
      expect(attempt.phaseDetection.status).toBe("detected");
    });
    expect(() => assertReportContainsNoRawEvidence(report)).not.toThrow();
    const json = JSON.stringify(report);
    expect(json).not.toContain("sourceLandmarks");
    expect(json).not.toContain("timestampMs");
    expect(json).not.toContain("file://");
  });

  it("reports all six attempts for a complete High session", () => {
    const report = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "high_accuracy_3_plus_3",
      shootingHand: "right",
      attempts: attemptsFor(syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" })),
    });

    expect(report.attempts).toHaveLength(6);
    expect(report.pipeline.status).toBe("complete");
  });

  it("retains only derived recapture evidence after a failed side phase detection", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const report = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [
        { id: "front-0", sequence: session.front[0] },
        { id: "shooting_side-0", sequence: freezeShootingArm(session.shootingSide[0]) },
      ],
    });

    expect(report.pipeline.status).toBe("recapture_required");
    expect(report.pipeline.reason).toBe("phase_detection_failed");
    expect(report.attempts.find((attempt) => attempt.attemptId === "shooting_side-0")?.phaseDetection)
      .toMatchObject({ status: "failed" });
    expect(report.attempts.find((attempt) => attempt.attemptId === "shooting_side-0")?.phaseDetection.reason)
      .toEqual(expect.any(String));
    expect(report.reconstruction).toBeUndefined();
    expect(twoViewEvaluationReportSchema.parse(report)).toEqual(report);
  });

  it("rejects unknown keys, unsafe privacy flags, and malformed commit identifiers", () => {
    const report = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
    });

    expect(() => twoViewEvaluationReportSchema.parse({ ...report, extra: true })).toThrow();
    expect(() => twoViewEvaluationReportSchema.parse({
      ...report,
      privacy: { ...report.privacy, containsTimestamps: true },
    })).toThrow();
    expect(() => twoViewEvaluationReportSchema.parse({ ...report, evaluatedCommitSha: "not-a-sha" })).toThrow();
  });

  it("rejects reports containing file-like raw evidence references", () => {
    const report = buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
    });
    const unsafeReport = {
      ...report,
      consentRecordId: "file:///tmp/x.mp4",
    };

    expect(() => assertReportContainsNoRawEvidence(unsafeReport as typeof report)).toThrow();
  });
});
