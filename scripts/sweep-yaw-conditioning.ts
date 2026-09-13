/**
 * Synthetic conditioning sweep for two-view camera-yaw geometries.
 *
 * Answers one question with data instead of intuition: for a given pair of
 * shooter-centric camera yaws, how well conditioned is the generalized
 * direction reconstruction across the orientations a bone can actually take?
 *
 * It samples directions deterministically on the upper hemisphere (a Fibonacci
 * lattice, no RNG), projects each into both views exactly as the product path
 * does, runs the real solver, and reports the conditioning distribution, the
 * rejection rate with reasons, and the worst orientations.
 *
 * Output is derived geometry only. It contains no capture data.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import type { Vector3 } from "@/lib/pose-motion";
import { angleBetweenDirections } from "@/lib/shooting-profile/direction-reconstruction";
import {
  reconstructBoneDirectionFromYawViews,
} from "@/lib/shooting-profile/generalized-direction-reconstruction";

const YAW_PAIRS: readonly (readonly [number, number])[] = [
  [0, 30],
  [0, 45],
  [0, 60],
  [0, 75],
  [0, 90],
  [-45, 45],
];

const SAMPLE_COUNT = 4001;

function upperHemisphereDirections(count: number): Vector3[] {
  // Fibonacci lattice over the upper hemisphere: deterministic and near-uniform.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const directions: Vector3[] = [];
  for (let index = 0; index < count; index += 1) {
    const y = (index + 0.5) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    directions.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return directions;
}

function observation(direction: Vector3, yawDegrees: number) {
  const yaw = yawDegrees * Math.PI / 180;
  const horizontal = Math.cos(yaw) * direction.x + Math.sin(yaw) * direction.z;
  const vertical = direction.y;
  return {
    yawDegrees,
    angleRadians: Math.atan2(horizontal, vertical),
    projectionLength: Math.hypot(horizontal, vertical),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function elevationDegrees(direction: Vector3): number {
  return Math.asin(Math.max(-1, Math.min(1, direction.y))) * 180 / Math.PI;
}

function azimuthDegrees(direction: Vector3): number {
  return Math.atan2(direction.z, direction.x) * 180 / Math.PI;
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function sweepPair(first: number, second: number, directions: readonly Vector3[]) {
  const conditioning: number[] = [];
  const errorsDegrees: number[] = [];
  const rejectionReasons = new Map<string, number>();
  const perDirection: { direction: Vector3; conditioning: number }[] = [];

  for (const truth of directions) {
    const result = reconstructBoneDirectionFromYawViews({
      first: observation(truth, first),
      second: observation(truth, second),
      verticalSign: 1,
    });
    if (result.status === "rejected") {
      rejectionReasons.set(result.reason, (rejectionReasons.get(result.reason) ?? 0) + 1);
      continue;
    }
    conditioning.push(result.conditioning);
    perDirection.push({ direction: truth, conditioning: result.conditioning });
    errorsDegrees.push(angleBetweenDirections(result.direction, truth) * 180 / Math.PI);
  }

  const sortedConditioning = [...conditioning].sort((left, right) => left - right);
  const sortedErrors = [...errorsDegrees].sort((left, right) => left - right);
  const worst = [...perDirection]
    .sort((left, right) => left.conditioning - right.conditioning)
    .slice(0, 5)
    .map((entry) => ({
      elevationDegrees: round(elevationDegrees(entry.direction), 1),
      azimuthDegrees: round(azimuthDegrees(entry.direction), 1),
      conditioning: round(entry.conditioning),
    }));

  return {
    yawPair: `${first} / ${second}`,
    separationDegrees: Math.abs(second - first),
    sampled: directions.length,
    accepted: conditioning.length,
    rejectionRate: round(1 - conditioning.length / directions.length),
    rejectionReasons: Object.fromEntries([...rejectionReasons.entries()].sort()),
    conditioning: {
      median: round(percentile(sortedConditioning, 0.5)),
      p25: round(percentile(sortedConditioning, 0.25)),
      p10: round(percentile(sortedConditioning, 0.1)),
      p05: round(percentile(sortedConditioning, 0.05)),
      minimum: round(sortedConditioning[0] ?? Number.NaN),
    },
    reconstructionErrorDegrees: {
      median: round(percentile(sortedErrors, 0.5), 9),
      p95: round(percentile(sortedErrors, 0.95), 9),
      maximum: round(sortedErrors[sortedErrors.length - 1] ?? Number.NaN, 9),
    },
    worstOrientations: worst,
  };
}

function main(): number {
  const outputPath = process.argv[2];
  const directions = upperHemisphereDirections(SAMPLE_COUNT);
  const report = {
    version: "yaw_conditioning_sweep_v1",
    note: "Synthetic geometry only. Not evidence about any real capture angle.",
    conditioningFloor: 0.1,
    sampleCount: SAMPLE_COUNT,
    sampling: "deterministic Fibonacci lattice over the upper hemisphere",
    pairs: YAW_PAIRS.map(([first, second]) => sweepPair(first, second, directions)),
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(resolve(outputPath), serialized, "utf8");

  for (const pair of report.pairs) {
    process.stdout.write(
      `${pair.yawPair.padStart(9)}  median ${String(pair.conditioning.median).padEnd(6)}`
      + `  p10 ${String(pair.conditioning.p10).padEnd(6)}`
      + `  p05 ${String(pair.conditioning.p05).padEnd(6)}`
      + `  min ${String(pair.conditioning.minimum).padEnd(6)}`
      + `  rejected ${(pair.rejectionRate * 100).toFixed(2)}%`
      + `  maxErr ${pair.reconstructionErrorDegrees.maximum}deg\n`,
    );
  }
  return 0;
}

process.exitCode = main();
