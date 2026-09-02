/**
 * Raw videos and landmark JSON must stay outside git and outside cloud
 * persistence; only the derived evaluation report may be shared.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { parseLandmarkSequenceV2 } from "@/lib/shooting-profile/landmark-sequence-contract";
import {
  assertReportContainsNoRawEvidence,
  buildTwoViewEvaluationReport,
} from "@/lib/shooting-profile/evaluation-report";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";

type SourceClass = "synthetic_fixture" | "consented_self_capture" | "internal_test_capture";
type Mode = "basic_1_plus_1" | "high_accuracy_3_plus_3";
type Hand = "left" | "right";
type Flag = "--mode" | "--hand" | "--front" | "--side" | "--source" | "--consent-record" | "--output";

type ParsedArguments = {
  mode?: Mode;
  hand?: Hand;
  front: string[];
  side: string[];
  source?: SourceClass;
  consentRecordId?: string;
  output?: string;
};

class InputFileError extends Error {
  constructor(readonly position: string) {
    super(`Invalid landmark sequence at ${position}`);
  }
}

function isFlag(value: string): value is Flag {
  return value === "--mode"
    || value === "--hand"
    || value === "--front"
    || value === "--side"
    || value === "--source"
    || value === "--consent-record"
    || value === "--output";
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const parsed: ParsedArguments = { front: [], side: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!isFlag(flag) || index + 1 >= argv.length || isFlag(argv[index + 1])) {
      throw new Error("Invalid arguments");
    }
    const value = argv[index + 1];
    index += 1;
    if (flag === "--front") parsed.front.push(value);
    if (flag === "--side") parsed.side.push(value);
    if (flag === "--mode" && (value === "basic_1_plus_1" || value === "high_accuracy_3_plus_3")) parsed.mode = value;
    else if (flag === "--hand" && (value === "left" || value === "right")) parsed.hand = value;
    else if (flag === "--source" && (
      value === "synthetic_fixture" || value === "consented_self_capture" || value === "internal_test_capture"
    )) parsed.source = value;
    else if (flag === "--consent-record") parsed.consentRecordId = value;
    else if (flag === "--output") parsed.output = value;
    else if (flag !== "--front" && flag !== "--side") throw new Error("Invalid arguments");
  }
  return parsed;
}

function readSequence(filePath: string, position: string): LandmarkSequenceV2 {
  try {
    return parseLandmarkSequenceV2(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    throw new InputFileError(position);
  }
}

function requireArguments(parsed: ParsedArguments): asserts parsed is Required<ParsedArguments> {
  const expectedPerView = parsed.mode === "basic_1_plus_1" ? 1 : 3;
  if (
    parsed.mode === undefined
    || parsed.hand === undefined
    || parsed.source === undefined
    || parsed.output === undefined
    || parsed.front.length !== expectedPerView
    || parsed.side.length !== expectedPerView
  ) {
    throw new Error("Invalid arguments");
  }
}

function main(): number {
  const parsed = parseArguments(process.argv.slice(2));
  requireArguments(parsed);
  const front = parsed.front.map((filePath, index) => readSequence(filePath, `--front #${index + 1}`));
  const side = parsed.side.map((filePath, index) => readSequence(filePath, `--side #${index + 1}`));
  const report = buildTwoViewEvaluationReport({
    sourceClass: parsed.source,
    ...(parsed.consentRecordId === undefined ? {} : { consentRecordId: parsed.consentRecordId }),
    mode: parsed.mode,
    shootingHand: parsed.hand,
    attempts: [...front, ...side].map((sequence) => ({
      id: `${sequence.view}-${sequence.takeIndex}`,
      sequence,
    })),
  });
  assertReportContainsNoRawEvidence(report);
  writeFileSync(resolve(parsed.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const alignmentDelta = report.crossViewAlignment?.maximumIntermediateAnchorDelta ?? "unavailable";
  const reason = report.pipeline.reason ?? "none";
  const confidence = report.pipeline.confidence ?? "unavailable";
  process.stdout.write(
    `pipeline=${report.pipeline.status} reason=${reason} confidence=${confidence} alignmentDelta=${alignmentDelta}\n`,
  );
  return report.pipeline.status === "complete" ? 0 : 3;
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof InputFileError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write("Evaluation failed\n");
    process.exitCode = 1;
  }
}
