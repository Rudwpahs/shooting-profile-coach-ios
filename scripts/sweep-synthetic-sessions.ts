/**
 * Deterministic synthetic known-geometry sweep.
 *
 * Runs generated front/side sessions through the real two-view pipeline and
 * writes a derived report: outcome distribution, contract expectations, profile
 * invariants, per-axis behaviour and runtime. Everything here is synthetic, so
 * the report carries no consent, media, or landmark data of any kind.
 *
 *   corepack pnpm sweep:synthetic -- --sessions 200 --output <path>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import {
  buildSyntheticSweepPlan,
  checkSyntheticSweepInvariants,
  summariseSyntheticSweep,
  SYNTHETIC_SWEEP_DISPLAY_SIZES,
  type SyntheticSweepOutcomeV1,
  type SyntheticSweepScenarioV1,
} from "@/lib/shooting-profile/synthetic-sweep";
import {
  buildTwoViewRepresentativeProfile,
  type TwoViewPipelineAttemptV1,
} from "@/lib/shooting-profile/two-view-pipeline";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

type Session = { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] };

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

/** Plays the first half at half speed: the same shot with a genuinely slower dip. */
function slowFirstHalf(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const origin = sequence.frames[0].timestampMs;
  const duration = sequence.frames[sequence.frames.length - 1].timestampMs - origin;
  const midpoint = origin + duration / 2;
  const warp = (timestampMs: number) => (
    timestampMs <= midpoint ? origin + 2 * (timestampMs - origin) : timestampMs + duration / 2
  );
  return {
    ...sequence,
    metadata: {
      ...sequence.metadata,
      durationMs: warp(sequence.metadata.durationMs),
      releaseProxyTimestampMs: warp(sequence.metadata.releaseProxyTimestampMs),
      attempts: sequence.metadata.attempts.map((attempt) => ({
        requestedTimestampMs: warp(attempt.requestedTimestampMs),
        decodedTimestampMs: attempt.decodedTimestampMs === null ? null : warp(attempt.decodedTimestampMs),
        detectedTimestampMs: attempt.detectedTimestampMs === null ? null : warp(attempt.detectedTimestampMs),
      })),
    },
    frames: sequence.frames.map((frame) => ({ ...frame, timestampMs: warp(frame.timestampMs) })),
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

function attemptsFor(scenario: SyntheticSweepScenarioV1): TwoViewPipelineAttemptV1[] {
  const session: Session = syntheticLandmarkSession({
    mode: scenario.mode,
    shootingHand: scenario.shootingHand,
    sideAnchorScheduleShift: scenario.sideAnchorShift,
    displaySize: SYNTHETIC_SWEEP_DISPLAY_SIZES[scenario.display],
    visibility: scenario.visibility,
    noiseAmplitude: scenario.noiseAmplitude,
  });

  let shootingSide = session.shootingSide;
  switch (scenario.degeneracy) {
    case "duplicate_view":
      shootingSide = session.front.map((sequence) => relabel(sequence, "shooting_side"));
      break;
    case "mirrored_view":
      shootingSide = session.front.map((sequence) => relabel(mirrorHorizontally(sequence), "shooting_side"));
      break;
    case "slow_first_half":
      shootingSide = session.shootingSide.map(slowFirstHalf);
      break;
    case "frozen_shooting_arm":
      shootingSide = session.shootingSide.map(freezeShootingArm);
      break;
    case "stalled_clip":
      shootingSide = session.shootingSide.map(stall);
      break;
    case "none":
      break;
  }
  return [...session.front, ...shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

function runScenario(scenario: SyntheticSweepScenarioV1): SyntheticSweepOutcomeV1 {
  const startedAt = performance.now();
  const result = buildTwoViewRepresentativeProfile({
    mode: scenario.mode,
    shootingHand: scenario.shootingHand,
    attempts: attemptsFor(scenario),
  });
  const elapsedMs = Math.max(0, performance.now() - startedAt);
  if (result.status !== "complete") {
    return { scenario, status: "recapture_required", reason: result.reason, invariantViolations: [], elapsedMs };
  }
  const invariants = checkSyntheticSweepInvariants(result.profile, scenario.mode, result.confidence);
  return {
    scenario,
    status: "complete",
    confidence: result.confidence,
    boneLengthDrift: invariants.boneLengthDrift,
    maximumConeDegrees: invariants.maximumConeDegrees,
    invariantViolations: invariants.violations,
    elapsedMs,
  };
}

function numericArgument(argv: readonly string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index < 0) return fallback;
  const parsed = Number(argv[index + 1]);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} needs a positive integer`);
  return parsed;
}

function main(): number {
  const argv = process.argv.slice(2);
  const sessions = numericArgument(argv, "--sessions", 200);
  const outputIndex = argv.indexOf("--output");
  const plan = buildSyntheticSweepPlan(sessions);

  const outcomes = plan.map((scenario, index) => {
    if (index % 25 === 0) process.stdout.write(`  ${index}/${plan.length}\n`);
    return runScenario(scenario);
  });

  // Determinism: the first few scenarios must reproduce byte-identically.
  const recheck = plan.slice(0, Math.min(4, plan.length));
  const identical = recheck.every((scenario, index) => {
    const repeated = runScenario(scenario);
    const first = outcomes[index];
    return repeated.status === first.status
      && repeated.reason === first.reason
      && repeated.confidence === first.confidence
      && repeated.boneLengthDrift === first.boneLengthDrift;
  });

  const report = summariseSyntheticSweep(outcomes);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputIndex >= 0 && argv[outputIndex + 1]) {
    writeFileSync(resolve(argv[outputIndex + 1]), json, "utf8");
  } else {
    process.stdout.write(json);
  }

  process.stdout.write(
    `sessions=${report.sessionCount} complete=${report.outcomes.complete} `
    + `recapture=${report.outcomes.recaptureRequired} `
    + `expectationViolations=${report.expectations.violated} `
    + `invariantViolations=${report.invariants.violations.length} `
    + `deterministic=${identical}\n`,
  );
  return report.expectations.violated === 0 && report.invariants.violations.length === 0 && identical ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "sweep failed"}\n`);
  process.exitCode = 2;
}
