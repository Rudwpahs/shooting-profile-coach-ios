import { readFileSync } from "node:fs";

import { Bytes, serverTimestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  BINARY_PAYLOAD_FORMAT_V2,
  FIXED_POINT_SCALE_V2,
  MISSING_VISIBILITY_SENTINEL_V2,
  OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
  PERSISTED_OBSERVATION_JOINTS_V2,
  REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
  RULE_SAFE_BATCH_MUTATIONS_V2,
  reconstructObservationFramesFromSequencePayloadV2,
  reconstructRepresentativeProfileFromSequencePayloadV2,
  serializeObservationSequenceForCloud,
  serializeRepresentativeSequenceForCloud,
  validateShootingProfileWriteV2,
  type SaveShootingProfileInputV2,
} from "@/lib/firebase-shooting-profile-contract";
import {
  attemptKnownSinglePathCleanupV2,
  buildFailedStagingCleanupPathsV2,
  buildShootingProfileDeletePlanV2,
  buildShootingProfileWritePlanV2,
  deleteHeadWithPostconditionV2,
  deleteSubordinateWithAmbiguityCheckV2,
  executeShootingProfileWritePlanV2,
  loadShootingProfileViewerRecordV2,
  matchesPlannedStagingWriteV2,
  partitionShootingProfileWritesV2,
  reconstructShootingProfileViewerRecordV2,
  resolveFailedShootingProfilePublicationV2,
  selectPendingDeletionProfileIdsV2,
  validateObservationDocumentV2,
  validateShootingProfilePublicationIdentityV2,
  type PersistedDocumentV2,
  type PlannedFirestoreWriteV2,
  type ShootingProfileReaderPortV2,
  type ShootingProfileWritePortV2,
} from "@/lib/firebase-shooting-profiles";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type CaptureViewV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

const PHASE_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const PHASE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;
const EXPECTED_OBSERVATION_LANDMARK_INDEX = {
  leftShoulder: 11,
  leftElbow: 13,
  leftWrist: 15,
  rightShoulder: 12,
  rightElbow: 14,
  rightWrist: 16,
  leftHip: 23,
  leftKnee: 25,
  leftAnkle: 27,
  rightHip: 24,
  rightKnee: 26,
  rightAnkle: 28,
} as const;

function expectedQuantized(value: number): number {
  const quantized = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function timestampFixture() {
  const date = new Date("2026-08-22T00:00:00.000Z");
  return { toDate: () => date, toMillis: () => date.getTime() };
}

function plannedDocument(write: PlannedFirestoreWriteV2): PersistedDocumentV2 {
  return {
    id: write.path.split("/").at(-1)!,
    data: { ...write.data, createdAt: timestampFixture(), updatedAt: timestampFixture() },
  };
}

function makeProfile(mode: CaptureProtocolV2): RepresentativePose4DV2 {
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode,
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames: Array.from({ length: 101 }, (_, index) => ({
      phase: index / 100,
      joints: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint, jointIndex) => [
        joint,
        { x: jointIndex / 100 + 0.00000049, y: index / 100, z: -jointIndex / 100 },
      ])) as RepresentativePose4DV2["frames"][number]["joints"],
      uncertainty: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint) => [
        joint,
        {
          model: "heuristic_v1",
          covariance: [0.01, 0, 0, 0.01, 0, 0.01],
          directionalConeDegrees: 8.12345649,
        },
      ])) as RepresentativePose4DV2["frames"][number]["uncertainty"],
    })),
    phaseAnchors: PHASE_IDS.map((id, index) => ({ id, phase: PHASE_VALUES[index] })),
    quality: { passed: true, reasons: [] },
  };
}

function makeAttempt(
  view: CaptureViewV2,
  takeIndex: 0 | 1 | 2,
  shootingHand: ShootingHandV2 = "right",
): NormalizedViewAttemptV2 {
  return {
    id: `${view}-${takeIndex}`,
    phaseAnchors: PHASE_IDS.map((id, index) => ({
      id,
      phase: PHASE_VALUES[index],
      timestampMs: index * 250,
    })),
    frames: Array.from({ length: 101 }, (_, frameIndex) => ({
      phase: frameIndex / 100,
      sourceTimestampMs: frameIndex * 10,
      view,
      shootingHand,
      takeIndex,
      sourceLandmarks: Array.from({ length: 33 }, (_, landmarkIndex) => ({
        x: 0.2 + landmarkIndex * 0.00100000049,
        y: 0.3 + frameIndex * 0.001,
        visibility: 0.90000049,
      })),
    })),
  };
}

function makeInput(mode: CaptureProtocolV2): SaveShootingProfileInputV2 {
  const attempts = mode === "basic_1_plus_1"
    ? [makeAttempt("front", 0), makeAttempt("shooting_side", 0)]
    : [0, 1, 2].flatMap((takeIndex) => [
      makeAttempt("front", takeIndex as 0 | 1 | 2),
      makeAttempt("shooting_side", takeIndex as 0 | 1 | 2),
    ]);
  return {
    profile: makeProfile(mode),
    shootingHand: "right",
    confidence: mode === "basic_1_plus_1" ? 0.65 : 0.87654349,
    normalizedAttempts: attempts,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function replaceInt32(payload: Uint8Array, index: number, value: number): Uint8Array {
  const copy = payload.slice();
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setInt32(index * 4, value, false);
  return copy;
}

function readInt32(payload: Uint8Array, index: number): number {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(index * 4, false);
}

function makeWritePlan(mode: CaptureProtocolV2 = "basic_1_plus_1") {
  return buildShootingProfileWritePlanV2({
    uid: "owner_1",
    captureSessionId: "profile_1",
    profileId: "profile_1",
    revisionId: "profile_1",
    input: makeInput(mode),
    timestamp: serverTimestamp(),
  });
}

describe("V2 private shooting-profile cloud contract", () => {
  it("packs one observation attempt into one exact, deterministic 14,544-byte sequence", () => {
    const attempt = makeAttempt("front", 0);
    delete attempt.frames[0].sourceLandmarks[11].visibility;
    const sequence = serializeObservationSequenceForCloud(attempt);

    expect(OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2).toBe(12 * 3 * 4);
    expect(OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2).toBe(101 * 12 * 3 * 4);
    expect(sequence).toMatchObject({
      attemptId: "front-0",
      view: "front",
      shootingHand: "right",
      takeIndex: 0,
      frameCount: 101,
      framePayloadByteLength: 144,
      payloadByteLength: 14_544,
      payloadFormat: "int32_be_fixed_1e6_v1",
      fixedPointScale: 1_000_000,
      packingOrder: "phase_major_joint_major_xy_visibility_v1",
      missingVisibilitySentinel: -2_147_483_648,
    });
    expect(sequence.payload).toBeInstanceOf(Uint8Array);
    expect(sequence.payload).toHaveLength(14_544);
    expect(OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2)
      .toBe("phase_major_joint_major_xy_visibility_v1");

    const slotsPerPhase = 12 * 3;
    expect(readInt32(sequence.payload, 0 * slotsPerPhase + 0)).toBe(211_000);
    expect(readInt32(sequence.payload, 0 * slotsPerPhase + 1)).toBe(300_000);
    expect(readInt32(sequence.payload, 0 * slotsPerPhase + 2)).toBe(MISSING_VISIBILITY_SENTINEL_V2);
    expect(readInt32(sequence.payload, 37 * slotsPerPhase + 0)).toBe(211_000);
    expect(readInt32(sequence.payload, 37 * slotsPerPhase + 1)).toBe(337_000);
    expect(readInt32(sequence.payload, 37 * slotsPerPhase + 2)).toBe(900_000);
    expect(readInt32(sequence.payload, 100 * slotsPerPhase + 0)).toBe(211_000);
    expect(readInt32(sequence.payload, 100 * slotsPerPhase + 1)).toBe(400_000);
    expect(readInt32(sequence.payload, 100 * slotsPerPhase + 2)).toBe(900_000);
    expect(serializeObservationSequenceForCloud(attempt).payload).toEqual(sequence.payload);

    const roundTrip = reconstructObservationFramesFromSequencePayloadV2(sequence);
    expect(roundTrip).toHaveLength(101);
    roundTrip.forEach((frame, frameIndex) => {
      expect(frame.phaseIndex).toBe(frameIndex);
      PERSISTED_JOINT_NAMES_V2.forEach((joint) => {
        const landmarkIndex = EXPECTED_OBSERVATION_LANDMARK_INDEX[joint];
        const expected = {
          x: expectedQuantized(0.2 + landmarkIndex * 0.00100000049),
          y: expectedQuantized(0.3 + frameIndex * 0.001),
          ...(frameIndex === 0 && joint === "leftShoulder"
            ? {}
            : { visibility: expectedQuantized(0.90000049) }),
        };
        expect(frame.joints[joint]).toEqual(expected);
      });
    });
    expect(JSON.stringify(sequence)).not.toMatch(/nose|timestampMs|sourceTimestampMs|uri|filename|exif|thumbnail|"phase":/i);
  });

  it("rejects malformed observation sequences at the first, middle, and last phase", () => {
    const sequence = serializeObservationSequenceForCloud(makeAttempt("front", 0));
    const replaceSequenceInt32 = (phaseIndex: number, slot: number, value: number) => ({
      ...sequence,
      payload: replaceInt32(sequence.payload, phaseIndex * 12 * 3 + slot, value),
    });

    expect(() => reconstructObservationFramesFromSequencePayloadV2({
      ...sequence,
      payload: sequence.payload.slice(1),
    })).toThrow(/14.?544|length/i);
    expect(() => reconstructObservationFramesFromSequencePayloadV2({
      ...sequence,
      payload: new Uint8Array(14_545),
    })).toThrow(/14.?544|length/i);
    expect(() => reconstructObservationFramesFromSequencePayloadV2({
      ...sequence,
      payload: { byteLength: 14_544 },
    })).toThrow(/Uint8Array|payload/i);
    const missingPayloadFormat = { ...sequence } as Record<string, unknown>;
    delete missingPayloadFormat.payloadFormat;
    const metadataMutations: [string, unknown][] = [
      ["frameCount", { ...sequence, frameCount: 100 }],
      ["framePayloadByteLength", { ...sequence, framePayloadByteLength: 145 }],
      ["payloadByteLength", { ...sequence, payloadByteLength: 144 }],
      ["payloadFormat", { ...sequence, payloadFormat: "float32_le_v1" }],
      ["fixedPointScale", { ...sequence, fixedPointScale: 100_000 }],
      ["packingOrder", { ...sequence, packingOrder: "joint_major_xy_visibility_v1" }],
      ["missingVisibilitySentinel", { ...sequence, missingVisibilitySentinel: -1 }],
      ["unknown key", { ...sequence, sourceTimestampMs: 123 }],
      ["missing key", missingPayloadFormat],
    ];
    metadataMutations.forEach(([name, mutated]) => {
      expect(
        () => reconstructObservationFramesFromSequencePayloadV2(mutated),
        `observation sequence must reject ${name}`,
      ).toThrow(/metadata|key|frameCount|ByteLength|payloadFormat|fixedPointScale|packingOrder|Sentinel/i);
    });
    expect(() => reconstructObservationFramesFromSequencePayloadV2(replaceSequenceInt32(0, 0, 2_000_001)))
      .toThrow(/bound|coordinate/i);
    expect(() => reconstructObservationFramesFromSequencePayloadV2(replaceSequenceInt32(50, 2, -1)))
      .toThrow(/visibility|sentinel/i);
    expect(() => reconstructObservationFramesFromSequencePayloadV2(replaceSequenceInt32(100, 1, -2_000_001)))
      .toThrow(/bound|coordinate/i);
  });

  it("packs and decodes the complete representative profile as one exact 48,480-byte sequence", () => {
    const profile = makeProfile("basic_1_plus_1");
    const sequence = serializeRepresentativeSequenceForCloud(profile);

    expect(REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2).toBe(12 * 10 * 4);
    expect(REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2).toBe(101 * 12 * 10 * 4);
    expect(sequence).toMatchObject({
      frameCount: 101,
      framePayloadByteLength: 480,
      payloadByteLength: 48_480,
      payloadFormat: "int32_be_fixed_1e6_v1",
      fixedPointScale: 1_000_000,
      packingOrder: "phase_major_joint_major_xyz_covariance6_cone_v1",
      uncertaintyModel: "heuristic_v1",
    });
    expect(sequence.payload).toBeInstanceOf(Uint8Array);
    expect(sequence.payload).toHaveLength(48_480);
    expect(REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2)
      .toBe("phase_major_joint_major_xyz_covariance6_cone_v1");

    const slotsPerPhase = 12 * 10;
    expect(readInt32(sequence.payload, 0 * slotsPerPhase + 1)).toBe(0);
    expect(readInt32(sequence.payload, 37 * slotsPerPhase + 1)).toBe(370_000);
    expect(readInt32(sequence.payload, 100 * slotsPerPhase + 1)).toBe(1_000_000);
    expect(serializeRepresentativeSequenceForCloud(profile).payload).toEqual(sequence.payload);

    const roundTrip = reconstructRepresentativeProfileFromSequencePayloadV2(
      sequence,
      "basic_1_plus_1",
    );
    expect(roundTrip.frames).toHaveLength(101);
    roundTrip.frames.forEach((frame, frameIndex) => {
      expect(frame.phase).toBe(frameIndex / 100);
      PERSISTED_JOINT_NAMES_V2.forEach((joint, jointIndex) => {
        expect(frame.joints[joint]).toEqual({
          x: expectedQuantized(jointIndex / 100 + 0.00000049),
          y: expectedQuantized(frameIndex / 100),
          z: expectedQuantized(-jointIndex / 100),
        });
        expect(frame.uncertainty[joint]).toEqual({
          model: "heuristic_v1",
          covariance: [0.01, 0, 0, 0.01, 0, 0.01],
          directionalConeDegrees: 8.123456,
        });
      });
    });
    expect(roundTrip.phaseAnchors).toEqual(profile.phaseAnchors);
    expect(roundTrip.quality).toEqual({ passed: true, reasons: [] });
  });

  it("rejects malformed representative sequence metadata, blocks, and non-PSD covariance", () => {
    const sequence = serializeRepresentativeSequenceForCloud(makeProfile("high_accuracy_3_plus_3"));
    const replaceSequenceInt32 = (phaseIndex: number, slot: number, value: number) => ({
      ...sequence,
      payload: replaceInt32(sequence.payload, phaseIndex * 12 * 10 + slot, value),
    });

    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2({
      ...sequence,
      payload: sequence.payload.slice(1),
    }, "high_accuracy_3_plus_3")).toThrow(/48.?480|length/i);
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2({
      ...sequence,
      payload: new Uint8Array(48_481),
    }, "high_accuracy_3_plus_3")).toThrow(/48.?480|length/i);
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2({
      ...sequence,
      payload: { byteLength: 48_480 },
    }, "high_accuracy_3_plus_3")).toThrow(/Uint8Array|payload/i);
    const missingUncertaintyModel = { ...sequence } as Record<string, unknown>;
    delete missingUncertaintyModel.uncertaintyModel;
    const metadataMutations: [string, unknown][] = [
      ["frameCount", { ...sequence, frameCount: 100 }],
      ["framePayloadByteLength", { ...sequence, framePayloadByteLength: 479 }],
      ["payloadByteLength", { ...sequence, payloadByteLength: 480 }],
      ["payloadFormat", { ...sequence, payloadFormat: "float32_le_v1" }],
      ["fixedPointScale", { ...sequence, fixedPointScale: 100_000 }],
      ["packingOrder", { ...sequence, packingOrder: "joint_major_xyz_covariance6_cone_v1" }],
      ["uncertaintyModel", { ...sequence, uncertaintyModel: "statistical_v1" }],
      ["unknown key", { ...sequence, phaseSummaries: [] }],
      ["missing key", missingUncertaintyModel],
    ];
    metadataMutations.forEach(([name, mutated]) => {
      expect(
        () => reconstructRepresentativeProfileFromSequencePayloadV2(mutated, "high_accuracy_3_plus_3"),
        `representative sequence must reject ${name}`,
      ).toThrow(/metadata|key|frameCount|ByteLength|payloadFormat|fixedPointScale|packingOrder|uncertaintyModel/i);
    });
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2(replaceSequenceInt32(0, 0, -10_000_001), "high_accuracy_3_plus_3"))
      .toThrow(/bound|coordinate/i);
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2(replaceSequenceInt32(50, 9, 180_000_001), "high_accuracy_3_plus_3"))
      .toThrow(/bound|slot/i);
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2(replaceSequenceInt32(100, 3, -1), "high_accuracy_3_plus_3"))
      .toThrow(/bound|covariance/i);

    let nonPsd = replaceInt32(sequence.payload, 37 * 12 * 10 + 3, 10_000);
    nonPsd = replaceInt32(nonPsd, 37 * 12 * 10 + 4, 20_000);
    nonPsd = replaceInt32(nonPsd, 37 * 12 * 10 + 6, 10_000);
    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2({
      ...sequence,
      payload: nonPsd,
    }, "high_accuracy_3_plus_3")).toThrow(/semidefinite|covariance/i);
  });

  it("rejects raw metadata, native source z, noncanonical attempts, nonempty completed reasons, and Basic overconfidence", () => {
    const input = makeInput("basic_1_plus_1") as unknown as Record<string, unknown>;
    expect(() => validateShootingProfileWriteV2({ ...input, filename: "shot.mov" })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, exif: { device: "phone" } })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, bytes: new Uint8Array([1]) })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, uri: "file:///private/shot.mov" })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, thumbnail: "base64" })).toThrow(/key/i);

    const withZ = makeInput("basic_1_plus_1") as unknown as {
      normalizedAttempts: { frames: { sourceLandmarks: Record<string, unknown>[] }[] }[];
    };
    withZ.normalizedAttempts[0].frames[0].sourceLandmarks[11].z = 0.4;
    expect(() => validateShootingProfileWriteV2(withZ)).toThrow(/key/i);

    const nonfiniteObservation = makeInput("basic_1_plus_1");
    nonfiniteObservation.normalizedAttempts[0].frames[0].sourceLandmarks[11].x = Number.NaN;
    expect(() => validateShootingProfileWriteV2(nonfiniteObservation)).toThrow(/finite/i);

    const outOfRangeObservation = makeInput("basic_1_plus_1");
    outOfRangeObservation.normalizedAttempts[0].frames[0].sourceLandmarks[11].x = 2.000001;
    expect(() => validateShootingProfileWriteV2(outOfRangeObservation)).toThrow(/bound/i);

    const nonfiniteRepresentative = makeInput("basic_1_plus_1");
    nonfiniteRepresentative.profile.frames[0].joints.leftShoulder.x = Number.POSITIVE_INFINITY;
    expect(() => validateShootingProfileWriteV2(nonfiniteRepresentative)).toThrow(/finite|number/i);

    const outOfRangeRepresentative = makeInput("basic_1_plus_1");
    outOfRangeRepresentative.profile.frames[0].joints.leftShoulder.x = 10.000001;
    expect(() => validateShootingProfileWriteV2(outOfRangeRepresentative)).toThrow(/bound/i);

    const nonemptyQuality = makeInput("basic_1_plus_1");
    nonemptyQuality.profile.quality.reasons = ["warning_code"];
    expect(() => validateShootingProfileWriteV2(nonemptyQuality)).toThrow(/quality|reason/i);

    const overconfident = makeInput("basic_1_plus_1");
    overconfident.confidence = 0.650001;
    expect(() => validateShootingProfileWriteV2(overconfident)).toThrow(/confidence.*0\.65/i);

    const missing = makeInput("high_accuracy_3_plus_3");
    expect(() => validateShootingProfileWriteV2({
      ...missing,
      normalizedAttempts: missing.normalizedAttempts.slice(0, 5),
    })).toThrow(/attempt/i);

    const inconsistentHand = makeInput("basic_1_plus_1");
    inconsistentHand.normalizedAttempts[1].frames[50].shootingHand = "left";
    expect(() => validateShootingProfileWriteV2(inconsistentHand)).toThrow(/hand|consistent/i);

    const duplicateTake = makeInput("high_accuracy_3_plus_3");
    const duplicatedAttempts = [...duplicateTake.normalizedAttempts];
    duplicatedAttempts[1] = makeAttempt("front", 0);
    expect(() => validateShootingProfileWriteV2({
      ...duplicateTake,
      normalizedAttempts: duplicatedAttempts,
    })).toThrow(/unique|attempt/i);
  });

  it("requires one canonical opaque ID for the profile, capture, and revision chain", () => {
    expect(() => buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "capture_other",
      profileId: "profile_1",
      revisionId: "revision_other",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    })).toThrow(/canonical chain ID/i);
  });

  it.each([
    ["basic_1_plus_1", 4, 5, ["front-0", "shooting_side-0"]],
    ["high_accuracy_3_plus_3", 8, 9, [
      "front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2",
    ]],
  ] as const)("builds the compact %s persistence plan in dependency order", (mode, stagingCount, totalCount, attemptIds) => {
    const input = makeInput(mode);
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "profile_1",
      profileId: "profile_1",
      revisionId: "profile_1",
      input,
      timestamp: timestampFixture(),
    });
    const capturePath = "users/owner_1/captureSessions/profile_1";
    const revisionPath = "users/owner_1/motionProfiles/profile_1/revisions/profile_1";
    const expectedPaths = [
      ...attemptIds.map((attemptId) => `${capturePath}/observations/${attemptId}`),
      capturePath,
      revisionPath,
    ];
    expect(plan.stagingWrites).toHaveLength(stagingCount);
    expect([...plan.stagingWrites, plan.publicationWrite]).toHaveLength(totalCount);
    expect(plan.stagingWrites.map((write) => write.path)).toEqual(expectedPaths);
    expect(plan.publicationWrite.path).toBe("users/owner_1/motionProfiles/profile_1");
    expect([...plan.stagingWrites, plan.publicationWrite].at(-1)).toBe(plan.publicationWrite);
    expect([...plan.stagingWrites, plan.publicationWrite].every(
      (write) => write.data.storageLayout === "phase_sequence_payloads_v1",
    )).toBe(true);
    expect([...plan.stagingWrites, plan.publicationWrite].map((write) => write.path).join("\n"))
      .not.toMatch(/\/(frameChunks|sequenceChunks|phaseSummaries)\//);

    const orderedAttempts = [...input.normalizedAttempts].sort((left, right) =>
      (left.frames[0].view === "front" ? 0 : 1) - (right.frames[0].view === "front" ? 0 : 1)
      || left.frames[0].takeIndex - right.frames[0].takeIndex);
    orderedAttempts.forEach((attempt, index) => {
      const expected = serializeObservationSequenceForCloud(attempt);
      const observation = plan.stagingWrites[index];
      expect(observation.data).toMatchObject({
        recordType: "normalized_observation_v2",
        storageLayout: "phase_sequence_payloads_v1",
        attemptId: expected.attemptId,
        frameCount: 101,
        framePayloadByteLength: 144,
        payloadByteLength: 14_544,
        payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
        fixedPointScale: FIXED_POINT_SCALE_V2,
        packingOrder: OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
        missingVisibilitySentinel: MISSING_VISIBILITY_SENTINEL_V2,
      });
      expect(observation.data.payload).toBeInstanceOf(Bytes);
      expect((observation.data.payload as Bytes).toUint8Array()).toEqual(expected.payload);
    });

    const expectedRepresentative = serializeRepresentativeSequenceForCloud(input.profile);
    const revision = plan.stagingWrites.at(-1)!;
    expect(revision.data).toMatchObject({
      recordType: "representative_revision_v2",
      storageLayout: "phase_sequence_payloads_v1",
      frameCount: 101,
      framePayloadByteLength: 480,
      payloadByteLength: 48_480,
      payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
      fixedPointScale: FIXED_POINT_SCALE_V2,
      packingOrder: REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
      uncertaintyModel: "heuristic_v1",
    });
    expect(revision.data.payload).toBeInstanceOf(Bytes);
    expect((revision.data.payload as Bytes).toUint8Array()).toEqual(expectedRepresentative.payload);
    expect(plan.publicationWrite.data.representativePayloadByteLength).toBe(48_480);
    expect(JSON.stringify([...plan.stagingWrites, plan.publicationWrite]))
      .not.toMatch(/file:\/\/|thumbnail|filename|exif|rawMedia|sourceTimestampMs/i);
    expect(RULE_SAFE_BATCH_MUTATIONS_V2).toBe(1);
    expect(partitionShootingProfileWritesV2(plan.stagingWrites).every((batch) => batch.length === 1)).toBe(true);
  });

  it("strictly validates one compact observation document against its path identity", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1", captureSessionId: "profile_1", profileId: "profile_1", revisionId: "profile_1",
      input: makeInput("basic_1_plus_1"), timestamp: timestampFixture(),
    });
    const observation = plan.stagingWrites[0];
    const context = {
      uid: "owner_1", captureSessionId: "profile_1", profileId: "profile_1", revisionId: "profile_1",
      attemptId: "front-0", document: plannedDocument(observation),
    };
    expect(() => validateObservationDocumentV2(context)).not.toThrow();
    expect(() => validateObservationDocumentV2({
      ...context, document: { ...context.document, id: "shooting_side-0" },
    })).toThrow(/attempt document ID/i);
    expect(() => validateObservationDocumentV2({
      ...context,
      document: { ...context.document, data: { ...asRecord(context.document.data), storageLayout: "legacy" } },
    })).toThrow(/layout|metadata/i);
    expect(() => validateObservationDocumentV2({
      ...context,
      document: {
        ...context.document,
        data: { ...asRecord(context.document.data), payload: (asRecord(context.document.data).payload as Bytes).toUint8Array() },
      },
    })).toThrow(/Firestore Bytes|payload/i);
    expect(() => validateObservationDocumentV2({
      ...context,
      document: {
        ...context.document,
        data: { ...asRecord(context.document.data), payload: Bytes.fromUint8Array(new Uint8Array(14_543)) },
      },
    })).toThrow(/14544|length|payload/i);
    expect(() => validateObservationDocumentV2({
      ...context,
      document: {
        ...context.document,
        data: { ...asRecord(context.document.data), payload: Bytes.fromUint8Array(new Uint8Array(14_545)) },
      },
    })).toThrow(/14544|length|payload/i);
    expect(() => validateObservationDocumentV2({
      ...context,
      document: { ...context.document, data: { ...asRecord(context.document.data), unexpected: true } },
    })).toThrow(/unknown|missing/i);
  });

  it.each([
    ["basic_1_plus_1", [
      "users/owner_1/captureSessions/profile_1/observations/front-0",
      "users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "users/owner_1/captureSessions/profile_1",
      "users/owner_1/motionProfiles/profile_1/revisions/profile_1",
      "users/owner_1/motionProfiles/profile_1",
    ]],
    ["high_accuracy_3_plus_3", [
      "users/owner_1/captureSessions/profile_1/observations/front-0",
      "users/owner_1/captureSessions/profile_1/observations/front-1",
      "users/owner_1/captureSessions/profile_1/observations/front-2",
      "users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "users/owner_1/captureSessions/profile_1/observations/shooting_side-1",
      "users/owner_1/captureSessions/profile_1/observations/shooting_side-2",
      "users/owner_1/captureSessions/profile_1",
      "users/owner_1/motionProfiles/profile_1/revisions/profile_1",
      "users/owner_1/motionProfiles/profile_1",
    ]],
  ] as const)("executes the compact %s plan as exact single mutations in dependency order", async (mode, expectedPaths) => {
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => { calls.push(`set:${write.path}`); },
      readDocumentFromServer: async (path) => {
        calls.push(`read:${path}`);
        throw new Error("successful writes must not be read back");
      },
      deletePath: async (path) => { calls.push(`delete:${path}`); },
    };

    await expect(executeShootingProfileWritePlanV2({
      uid: "owner_1",
      plan: makeWritePlan(mode),
      port,
    })).resolves.toBeUndefined();
    expect(calls).toEqual(expectedPaths.map((path) => `set:${path}`));
  });

  it.each([
    ["non-canonical top-level capture ID", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.captureSessionId = "capture_other";
    }],
    ["non-canonical top-level revision ID", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.revisionId = "revision_other";
    }],
    ["forged staging path", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0] = {
        ...plan.stagingWrites[0],
        path: "users/owner_1/motionProfiles/colliding_profile",
      };
    }],
    ["mismatched immutable staging identity", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0] = {
        ...plan.stagingWrites[0],
        data: { ...plan.stagingWrites[0].data, profileId: "colliding_profile" },
      };
    }],
  ] as const)("rejects a %s write plan before any port call", async (_caseName, forgePlan) => {
    const plan = makeWritePlan();
    forgePlan(plan);
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => { calls.push(`set:${write.path}`); },
      readDocumentFromServer: async (path) => { calls.push(`read:${path}`); return null; },
      deletePath: async (path) => { calls.push(`delete:${path}`); },
    };

    await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port }))
      .rejects.toThrow(/write plan|staging|canonical|immutable/i);
    expect(calls).toEqual([]);
  });

  it.each([
    ["an unexpected observation key", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, forged: true };
    }],
    ["an observation owner mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, ownerUid: "other_owner" };
    }],
    ["an observation frame count mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, frameCount: 100 };
    }],
    ["an observation non-Bytes payload", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, payload: "payload" };
    }],
    ["an observation short Bytes payload", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, payload: Bytes.fromUint8Array(new Uint8Array([0])) };
    }],
    ["an observation invalid encoded payload", (plan: ReturnType<typeof makeWritePlan>) => {
      const payload = plan.stagingWrites[0].data.payload as Bytes;
      plan.stagingWrites[0].data = {
        ...plan.stagingWrites[0].data,
        payload: Bytes.fromUint8Array(replaceInt32(payload.toUint8Array(), 0, 2_000_001)),
      };
    }],
    ["an observation payload format mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, payloadFormat: "float32_le_v1" };
    }],
    ["an observation frame payload length mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, framePayloadByteLength: 143 };
    }],
    ["an observation fixed-point scale mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, fixedPointScale: 100_000 };
    }],
    ["an observation packing order mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, packingOrder: "joint_major_v1" };
    }],
    ["an observation missing-visibility sentinel mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.stagingWrites[0].data = { ...plan.stagingWrites[0].data, missingVisibilitySentinel: -1 };
    }],
    ["an unexpected capture key", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 2;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, forged: true };
    }],
    ["a capture attempt count mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 2;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, attemptCount: 1 };
    }],
    ["a capture attempt identity mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 2;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, attemptIds: ["shooting_side-0", "front-0"] };
    }],
    ["a capture mode mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 2;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, mode: "high_accuracy_3_plus_3" };
    }],
    ["an unexpected revision key", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, forged: true };
    }],
    ["a Basic revision overconfidence", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, confidence: 1 };
    }],
    ["a revision units mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, units: "meters" };
    }],
    ["a revision count mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, attemptCount: 1 };
    }],
    ["a revision frame count mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, frameCount: 100 };
    }],
    ["a revision payload format mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, payloadFormat: "float32_le_v1" };
    }],
    ["a revision fixed-point scale mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, fixedPointScale: 100_000 };
    }],
    ["a revision packing mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, packingOrder: "joint_major_v1" };
    }],
    ["a revision uncertainty model mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, uncertaintyModel: "statistical_v1" };
    }],
    ["a revision quality mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, quality: { passed: true, reasons: ["forged"] } };
    }],
    ["a revision non-Bytes payload", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, payload: "payload" };
    }],
    ["a revision short Bytes payload", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      plan.stagingWrites[index].data = { ...plan.stagingWrites[index].data, payload: Bytes.fromUint8Array(new Uint8Array([0])) };
    }],
    ["an invalid encoded revision payload", (plan: ReturnType<typeof makeWritePlan>) => {
      const index = plan.stagingWrites.length - 1;
      const payload = plan.stagingWrites[index].data.payload as Bytes;
      plan.stagingWrites[index].data = {
        ...plan.stagingWrites[index].data,
        payload: Bytes.fromUint8Array(replaceInt32(payload.toUint8Array(), 0, 10_000_001)),
      };
    }],
    ["an unexpected publication key", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.publicationWrite.data = { ...plan.publicationWrite.data, forged: true };
    }],
    ["a publication attempt count mismatch", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.publicationWrite.data = { ...plan.publicationWrite.data, attemptCount: 1 };
    }],
    ["a publication non-sentinel created timestamp", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.publicationWrite.data = { ...plan.publicationWrite.data, createdAt: "server-time" };
    }],
    ["a publication non-sentinel updated timestamp", (plan: ReturnType<typeof makeWritePlan>) => {
      plan.publicationWrite.data = { ...plan.publicationWrite.data, updatedAt: "server-time" };
    }],
  ] as const)("rejects %s before any port call", async (_caseName, forgePlan) => {
    const plan = makeWritePlan();
    forgePlan(plan);
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => { calls.push(`set:${write.path}`); },
      readDocumentFromServer: async (path) => { calls.push(`read:${path}`); return null; },
      deletePath: async (path) => { calls.push(`delete:${path}`); },
    };

    await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it.each([
    ["exact", [
      "delete:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "delete:users/owner_1/captureSessions/profile_1/observations/front-0",
    ]],
    ["mismatch", [
      "delete:users/owner_1/captureSessions/profile_1/observations/front-0",
    ]],
    ["unknown", [
      "delete:users/owner_1/captureSessions/profile_1/observations/front-0",
    ]],
  ] as const)("cleans only acknowledged or server-observed %s staging writes in reverse order", async (observation, expectedDeletes) => {
    const plan = makeWritePlan();
    const failedWrite = plan.stagingWrites[1];
    const failure = new Error("injected staging write failure");
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => {
        calls.push(`set:${write.path}`);
        if (write.path === failedWrite.path) throw failure;
      },
      readDocumentFromServer: async (path) => {
        calls.push(`read:${path}`);
        if (observation === "unknown") throw new Error("server read unavailable");
        const persistedFailedWrite = asRecord(plannedDocument(failedWrite).data);
        const originalPayload = persistedFailedWrite.payload as Bytes;
        return {
          id: "shooting_side-0",
          data: {
            ...persistedFailedWrite,
            payload: Bytes.fromUint8Array(originalPayload.toUint8Array()),
            ...(observation === "mismatch" ? { revisionId: "colliding_revision" } : {}),
          },
        };
      },
      deletePath: async (path) => { calls.push(`delete:${path}`); },
    };

    await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port })).rejects.toBe(failure);
    expect(calls).toEqual([
      "set:users/owner_1/captureSessions/profile_1/observations/front-0",
      "set:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "read:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      ...expectedDeletes,
    ]);
  });

  it.each(["malformed", "mismatch", "unreadable"] as const)(
    "preserves all staging data when a failed publication is %s",
    async (observation) => {
      const plan = makeWritePlan();
      const failure = new Error("injected publication write failure");
      const calls: string[] = [];
      const port: ShootingProfileWritePortV2 = {
        setWrite: async (write) => {
          calls.push(`set:${write.path}`);
          if (write.path === plan.publicationWrite.path) throw failure;
        },
        readDocumentFromServer: async (path) => {
          calls.push(`read:${path}`);
          if (observation === "unreadable") throw new Error("server read unavailable");
          if (observation === "malformed") return { id: "profile_1", data: {} };
          return {
            id: "profile_1",
            data: { ...plan.publicationWrite.data, revisionId: "colliding_revision" },
          };
        },
        deletePath: async (path) => { calls.push(`delete:${path}`); },
      };

      await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port })).rejects.toBe(failure);
      expect(calls).toEqual([
        "set:users/owner_1/captureSessions/profile_1/observations/front-0",
        "set:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
        "set:users/owner_1/captureSessions/profile_1",
        "set:users/owner_1/motionProfiles/profile_1/revisions/profile_1",
        "set:users/owner_1/motionProfiles/profile_1",
        "read:users/owner_1/motionProfiles/profile_1",
      ]);
    },
  );

  it("accepts a strictly valid matching active head after an ambiguous publication failure", async () => {
    const plan = makeWritePlan();
    const publicationFailure = new Error("ambiguous publication write");
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => {
        calls.push(`set:${write.path}`);
        if (write.path === plan.publicationWrite.path) throw publicationFailure;
      },
      readDocumentFromServer: async (path) => {
        calls.push(`read:${path}`);
        return plannedDocument(plan.publicationWrite);
      },
      deletePath: async (path) => { calls.push(`delete:${path}`); },
    };

    await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port })).resolves.toBeUndefined();
    expect(calls).toEqual([
      "set:users/owner_1/captureSessions/profile_1/observations/front-0",
      "set:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "set:users/owner_1/captureSessions/profile_1",
      "set:users/owner_1/motionProfiles/profile_1/revisions/profile_1",
      "set:users/owner_1/motionProfiles/profile_1",
      "read:users/owner_1/motionProfiles/profile_1",
    ]);
  });

  it("cleans every staging write in reverse when publication absence is confirmed and preserves the publication error", async () => {
    const plan = makeWritePlan();
    const publicationFailure = new Error("confirmed absent publication");
    const cleanupFailure = new Error("injected cleanup failure");
    const calls: string[] = [];
    const port: ShootingProfileWritePortV2 = {
      setWrite: async (write) => {
        calls.push(`set:${write.path}`);
        if (write.path === plan.publicationWrite.path) throw publicationFailure;
      },
      readDocumentFromServer: async (path) => {
        calls.push(`read:${path}`);
        return null;
      },
      deletePath: async (path) => {
        calls.push(`delete:${path}`);
        if (path.endsWith("/revisions/profile_1")) throw cleanupFailure;
      },
    };

    await expect(executeShootingProfileWritePlanV2({ uid: "owner_1", plan, port }))
      .rejects.toBe(publicationFailure);
    expect(calls.slice(-4)).toEqual([
      "delete:users/owner_1/motionProfiles/profile_1/revisions/profile_1",
      "delete:users/owner_1/captureSessions/profile_1",
      "delete:users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      "delete:users/owner_1/captureSessions/profile_1/observations/front-0",
    ]);
  });

  it("loads a viewer record through exactly the active head and its referenced compact revision", async () => {
    const plan = makeWritePlan();
    const revision = plan.stagingWrites.at(-1)!;
    const calls: string[] = [];
    const reader: ShootingProfileReaderPortV2 = {
      readDocument: async (path) => {
        calls.push(path);
        if (path === "users/owner_1/motionProfiles/profile_1") return plannedDocument(plan.publicationWrite);
        if (path === "users/owner_1/motionProfiles/profile_1/revisions/profile_1") {
          return plannedDocument(revision);
        }
        throw new Error(`unexpected read: ${path}`);
      },
    };

    const record = await loadShootingProfileViewerRecordV2({ uid: "owner_1", profileId: "profile_1", reader });
    expect(record?.profile.frames).toHaveLength(101);
    expect(calls).toEqual([
      "users/owner_1/motionProfiles/profile_1",
      "users/owner_1/motionProfiles/profile_1/revisions/profile_1",
    ]);
  });

  it.each(["missing", "malformed"] as const)("fails closed when the referenced revision is %s", async (observation) => {
    const plan = makeWritePlan();
    const reader: ShootingProfileReaderPortV2 = {
      readDocument: async (path) => {
        if (path === "users/owner_1/motionProfiles/profile_1") return plannedDocument(plan.publicationWrite);
        return observation === "missing" ? null : { id: "profile_1", data: {} };
      },
    };
    await expect(loadShootingProfileViewerRecordV2({ uid: "owner_1", profileId: "profile_1", reader }))
      .rejects.toThrow(observation === "missing" ? /revision.*missing/i : /unknown|missing/i);
  });

  it("rejects the same non-PSD representative payload through every public viewer read path", async () => {
    const plan = makeWritePlan();
    const revision = plan.stagingWrites.at(-1)!;
    const revisionData = asRecord(plannedDocument(revision).data);
    let nonPsdPayload = (revisionData.payload as Bytes).toUint8Array();
    nonPsdPayload = replaceInt32(nonPsdPayload, 37 * 12 * 10 + 3, 10_000);
    nonPsdPayload = replaceInt32(nonPsdPayload, 37 * 12 * 10 + 4, 20_000);
    nonPsdPayload = replaceInt32(nonPsdPayload, 37 * 12 * 10 + 6, 10_000);
    const nonPsdRevision = {
      id: "profile_1",
      data: { ...revisionData, payload: Bytes.fromUint8Array(nonPsdPayload) },
    };
    const representativeSequence = {
      frameCount: revisionData.frameCount,
      framePayloadByteLength: revisionData.framePayloadByteLength,
      payloadByteLength: revisionData.payloadByteLength,
      payloadFormat: revisionData.payloadFormat,
      fixedPointScale: revisionData.fixedPointScale,
      packingOrder: revisionData.packingOrder,
      uncertaintyModel: revisionData.uncertaintyModel,
      payload: nonPsdPayload,
    };

    expect(() => reconstructRepresentativeProfileFromSequencePayloadV2(
      representativeSequence,
      "basic_1_plus_1",
    )).toThrow(/semidefinite|covariance/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      uid: "owner_1",
      profileId: "profile_1",
      head: plannedDocument(plan.publicationWrite),
      revision: nonPsdRevision,
    })).toThrow(/semidefinite|covariance/i);
    await expect(loadShootingProfileViewerRecordV2({
      uid: "owner_1",
      profileId: "profile_1",
      reader: {
        readDocument: async (path) => {
          if (path === "users/owner_1/motionProfiles/profile_1") {
            return plannedDocument(plan.publicationWrite);
          }
          if (path === "users/owner_1/motionProfiles/profile_1/revisions/profile_1") {
            return nonPsdRevision;
          }
          throw new Error(`unexpected read: ${path}`);
        },
      },
    })).rejects.toThrow(/semidefinite|covariance/i);
  });

  it("uses server reads for safety paths and exact identity for uncertain publication", () => {
    const source = readFileSync("lib/firebase-shooting-profiles.ts", "utf8");
    const contractSource = readFileSync("lib/firebase-shooting-profile-contract.ts", "utf8");
    expect(source).toContain("Bytes.fromUint8Array");
    expect(source).toContain("instanceof Bytes");
    expect(source).toContain("toUint8Array()");
    expect(source).toMatch(/published = await getDocFromServer/);
    expect(source).toMatch(/initialSnapshot = await getDocFromServer/);
    expect(source).toMatch(/getDocFromServer\(headReference\)/);
    expect(source).toMatch(/resumePendingShootingProfileDeletionsV2[\s\S]*getDocsFromServer/);
    expect(source).not.toContain("enumerateDeletionSubordinatePaths");
    expect(source).not.toMatch(/collection\(db, revisionPath, "(sequenceChunks|phaseSummaries)"\)/);
    expect(contractSource).not.toContain("PERSISTED_PHASE_SUMMARIES_V2");
    expect(source).toMatch(/deleteSubordinateWithAmbiguityCheckV2[\s\S]*getDocFromServer\(doc\(db, path\)\)/);
    expect(source).toMatch(/listShootingProfilesV2[\s\S]*getDocs\(/);
    expect(source).toMatch(/getShootingProfileV2[\s\S]*getDoc\(/);

    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "profile_1",
      profileId: "profile_1",
      revisionId: "profile_1",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    });
    expect(() => validateShootingProfilePublicationIdentityV2(
      plan.publicationWrite.data,
      plan.publicationWrite.data,
    )).not.toThrow();
    expect(() => validateShootingProfilePublicationIdentityV2(
      { ...plan.publicationWrite.data, revisionId: "colliding_revision" },
      plan.publicationWrite.data,
    )).toThrow(/publication identity/i);
    const persistedObservation = asRecord(plannedDocument(plan.stagingWrites[0]).data);
    expect(matchesPlannedStagingWriteV2(persistedObservation, plan.stagingWrites[0].data)).toBe(true);
    const originalPayload = plan.stagingWrites[0].data.payload as Bytes;
    expect(matchesPlannedStagingWriteV2(
      { ...persistedObservation, payload: Bytes.fromUint8Array(originalPayload.toUint8Array()) },
      plan.stagingWrites[0].data,
    )).toBe(true);
    const changedPayload = originalPayload.toUint8Array();
    changedPayload[0] ^= 1;
    expect(matchesPlannedStagingWriteV2(
      { ...persistedObservation, payload: Bytes.fromUint8Array(changedPayload) },
      plan.stagingWrites[0].data,
    )).toBe(false);
    expect(matchesPlannedStagingWriteV2(
      { ...persistedObservation, createdAt: "server-time" },
      plan.stagingWrites[0].data,
    )).toBe(false);
  });

  it("resolves every failed-publication observation without deleting uncertain evidence", async () => {
    const matchingHead: PersistedDocumentV2 = { id: "profile_1", data: { revisionId: "profile_1" } };
    const run = async (overrides: Partial<{
      readHeadFromServer: () => Promise<PersistedDocumentV2 | null>;
      validateMatchingHead: (document: PersistedDocumentV2) => void;
      cleanupStaging: () => Promise<void>;
    }> = {}) => {
      let cleanupCalls = 0;
      let validationCalls = 0;
      const outcome = await resolveFailedShootingProfilePublicationV2({
        readHeadFromServer: async () => matchingHead,
        validateMatchingHead: (document) => {
          validationCalls += 1;
          if (document.id !== "profile_1" || asRecord(document.data).revisionId !== "profile_1") {
            throw new Error("malformed or mismatched publication head");
          }
        },
        cleanupStaging: async () => {
          cleanupCalls += 1;
        },
        ...overrides,
      });
      return { outcome, cleanupCalls, validationCalls };
    };

    await expect(run()).resolves.toEqual({
      outcome: "published", cleanupCalls: 0, validationCalls: 1,
    });
    await expect(run({ readHeadFromServer: async () => null })).resolves.toEqual({
      outcome: "not_published", cleanupCalls: 1, validationCalls: 0,
    });
    await expect(run({
      readHeadFromServer: async () => { throw new Error("server read unavailable"); },
    })).resolves.toEqual({ outcome: "unknown", cleanupCalls: 0, validationCalls: 0 });
    await expect(run({
      readHeadFromServer: async () => ({ id: "profile_1", data: {} }),
    })).resolves.toEqual({ outcome: "unknown", cleanupCalls: 0, validationCalls: 1 });
    await expect(run({
      readHeadFromServer: async () => ({ id: "profile_1", data: { revisionId: "wrong_revision" } }),
    })).resolves.toEqual({ outcome: "unknown", cleanupCalls: 0, validationCalls: 1 });
    let failedCleanupCalls = 0;
    await expect(resolveFailedShootingProfilePublicationV2({
      readHeadFromServer: async () => null,
      validateMatchingHead: () => { throw new Error("absent heads must not be validated"); },
      cleanupStaging: async () => {
        failedCleanupCalls += 1;
        throw new Error("cleanup failed");
      },
    })).resolves.toBe("unknown");
    expect(failedCleanupCalls).toBe(1);
  });

  it("reconstructs 101 phases from only the head and compact revision and fails closed", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "profile_1",
      profileId: "profile_1",
      revisionId: "profile_1",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    });
    const revision = plan.stagingWrites.find((write) => write.path.endsWith("/revisions/profile_1"))!;
    const headDocument = plannedDocument(plan.publicationWrite);
    const revisionDocument = plannedDocument(revision);
    const args = {
      uid: "owner_1",
      profileId: "profile_1",
      head: headDocument,
      revision: revisionDocument,
    };
    const record = reconstructShootingProfileViewerRecordV2(args);
    expect(Object.keys(record)).toEqual(["profile", "shootingHand", "confidence"]);
    expect(record.profile.frames).toHaveLength(101);
    expect(record.profile.frames[37].phase).toBe(0.37);
    expect(Object.keys(record.profile.frames[37].joints)).toEqual([...PERSISTED_OBSERVATION_JOINTS_V2]);
    expect(record.profile.quality).toEqual({ passed: true, reasons: [] });

    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      head: { ...headDocument, data: { ...asRecord(headDocument.data), deletionState: "in_progress" } },
    })).toThrow(/active/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      head: { ...headDocument, id: "different_profile" },
    })).toThrow(/document ID/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      head: { ...headDocument, data: { ...asRecord(headDocument.data), storageLayout: "legacy" } },
    })).toThrow(/layout|immutable/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: { ...revisionDocument, id: "different_revision" },
    })).toThrow(/revision document ID/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: { ...revisionDocument, data: { ...asRecord(revisionDocument.data), storageLayout: "legacy" } },
    })).toThrow(/layout|metadata/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: { ...asRecord(revisionDocument.data), captureSessionId: "different_capture" },
      },
    })).toThrow(/does not match/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      head: { ...headDocument, data: { ...asRecord(headDocument.data), createdAt: "server-time" } },
    })).toThrow(/timestamp/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      head: { ...headDocument, data: { ...asRecord(headDocument.data), confidence: 0.650001 } },
    })).toThrow(/confidence.*0\.65/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: { ...asRecord(revisionDocument.data), quality: { passed: true, reasons: ["warning_code"] } },
      },
    })).toThrow(/quality|reason/i);

    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: {
          ...asRecord(revisionDocument.data),
          payload: (asRecord(revisionDocument.data).payload as Bytes).toUint8Array(),
        },
      },
    })).toThrow(/Firestore Bytes|payload/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: {
          ...asRecord(revisionDocument.data),
          payload: Bytes.fromUint8Array(new Uint8Array(REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2 - 1)),
        },
      },
    })).toThrow(/48480|length/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: { ...asRecord(revisionDocument.data), payloadFormat: "unknown" },
      },
    })).toThrow(/packing|payload|metadata/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: { ...asRecord(revisionDocument.data), unexpected: true },
      },
    })).toThrow(/unknown|missing/i);

    const revisionData = asRecord(revisionDocument.data);
    let indefinitePayload = (revisionData.payload as Bytes).toUint8Array();
    indefinitePayload = replaceInt32(indefinitePayload, 3, 10_000);
    indefinitePayload = replaceInt32(indefinitePayload, 4, 20_000);
    indefinitePayload = replaceInt32(indefinitePayload, 6, 10_000);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      revision: {
        ...revisionDocument,
        data: { ...revisionData, payload: Bytes.fromUint8Array(indefinitePayload) },
      },
    })).toThrow(/semidefinite|covariance/i);
  });

  it("continues every known single-path cleanup after failures and reports failures without stopping", async () => {
    const attempted: string[] = [];
    const failure = new Error("injected delete failure");
    const result = await attemptKnownSinglePathCleanupV2(["a", "b", "c", "b"], async (path) => {
      attempted.push(path);
      if (path === "b") throw failure;
    });
    expect(attempted).toEqual(["a", "b", "c"]);
    expect(result.attemptedPaths).toEqual(["a", "b", "c"]);
    expect(result.failures).toEqual([{ path: "b", error: failure }]);
    expect(buildFailedStagingCleanupPathsV2(["observation-a", "observation-b", "capture", "revision", "capture"]))
      .toEqual(["revision", "capture", "observation-b", "observation-a"]);
  });

  it("treats already-missing and server-confirmed ambiguous subordinate deletes as success", async () => {
    let postconditionReads = 0;
    await expect(deleteSubordinateWithAmbiguityCheckV2({
      commitDelete: async () => undefined,
      readExistsFromServer: async () => {
        postconditionReads += 1;
        return false;
      },
    })).resolves.toBeUndefined();
    expect(postconditionReads).toBe(0);

    const ambiguous = new Error("ambiguous subordinate commit");
    await expect(deleteSubordinateWithAmbiguityCheckV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => false,
    })).resolves.toBeUndefined();
    await expect(deleteSubordinateWithAmbiguityCheckV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => true,
    })).rejects.toBe(ambiguous);
    await expect(deleteSubordinateWithAmbiguityCheckV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => { throw new Error("server read unavailable"); },
    })).rejects.toBe(ambiguous);
  });

  it("keeps deletion head-last, one mutation per request, and handles uncertain head-delete acknowledgement", async () => {
    const headPath = "users/owner_1/motionProfiles/profile_1";
    const plan = buildShootingProfileDeletePlanV2({
      uid: "owner_1",
      profileId: "profile_1",
      captureSessionId: "profile_1",
      revisionId: "profile_1",
      attemptIds: ["front-0", "shooting_side-0"],
      deletionState: "in_progress",
    });
    expect(plan.deletePaths).toEqual([
      `${headPath}/revisions/profile_1`,
      "users/owner_1/captureSessions/profile_1",
      "users/owner_1/captureSessions/profile_1/observations/front-0",
      "users/owner_1/captureSessions/profile_1/observations/shooting_side-0",
      headPath,
    ]);
    expect(plan.deletePaths.join("\n")).not.toMatch(/frameChunks|sequenceChunks|phaseSummaries/);
    expect(plan.deletePaths.at(-1)).toBe(headPath);
    expect(plan.transitionRequired).toBe(false);
    expect(plan.deleteBatches.every((batch) => batch.length === 1)).toBe(true);
    expect(buildShootingProfileDeletePlanV2({
      uid: "owner_1",
      profileId: "profile_1",
      captureSessionId: "profile_1",
      revisionId: "profile_1",
      attemptIds: ["front-0", "shooting_side-0"],
      deletionState: "active",
    }).transitionRequired).toBe(true);
    expect(() => partitionShootingProfileWritesV2([1], 2)).toThrow(/one|1/);

    const ambiguous = new Error("ambiguous head commit");
    await expect(deleteHeadWithPostconditionV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => false,
    })).resolves.toBeUndefined();
    await expect(deleteHeadWithPostconditionV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => true,
    })).rejects.toBe(ambiguous);
    await expect(deleteHeadWithPostconditionV2({
      commitDelete: async () => { throw ambiguous; },
      readExistsFromServer: async () => { throw new Error("server read unavailable"); },
    })).rejects.toBe(ambiguous);
    await expect(deleteHeadWithPostconditionV2({
      commitDelete: async () => undefined,
      readExistsFromServer: async () => false,
    })).resolves.toBeUndefined();
    await expect(deleteHeadWithPostconditionV2({
      commitDelete: async () => undefined,
      readExistsFromServer: async () => true,
    })).rejects.toThrow(/postcondition|remove/i);
  });

  it("selects only strict owner in-progress heads for restart-time deletion resumption", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "profile_1",
      profileId: "profile_1",
      revisionId: "profile_1",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    });
    expect(selectPendingDeletionProfileIdsV2("owner_1", [
      { id: "profile_1", data: { ...plan.publicationWrite.data, deletionState: "in_progress" } },
      { id: "active_profile", data: { ...plan.publicationWrite.data, profileId: "active_profile" } },
    ])).toEqual(["profile_1"]);
    expect(() => selectPendingDeletionProfileIdsV2("other_owner", [
      { id: "profile_1", data: { ...plan.publicationWrite.data, deletionState: "in_progress" } },
    ])).toThrow(/owner/i);
  });
});
