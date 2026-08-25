import { readFileSync } from "node:fs";

import { Bytes } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  BINARY_PAYLOAD_FORMAT_V2,
  FIXED_POINT_SCALE_V2,
  FRAME_CHUNK_COUNT_V2,
  MISSING_VISIBILITY_SENTINEL_V2,
  OBSERVATION_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_PAYLOAD_PACKING_ORDER_V2,
  PERSISTED_OBSERVATION_JOINTS_V2,
  REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_PAYLOAD_PACKING_ORDER_V2,
  REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
  RULE_SAFE_BATCH_MUTATIONS_V2,
  buildRepresentativeSequenceChunksV2,
  reconstructRepresentativeFrameFromPayloadV2,
  serializeObservationForCloud,
  serializeRepresentativeProfileForCloud,
  validatePersistedRepresentativeFrameV2,
  validatePersistedObservationFrameV2,
  validateShootingProfileWriteV2,
  type SaveShootingProfileInputV2,
} from "@/lib/firebase-shooting-profile-contract";
import {
  attemptKnownSinglePathCleanupV2,
  buildShootingProfileDeletePlanV2,
  buildShootingProfileWritePlanV2,
  deleteHeadWithPostconditionV2,
  deleteSubordinateWithAmbiguityCheckV2,
  matchesPlannedStagingWriteV2,
  partitionShootingProfileWritesV2,
  reconstructShootingProfileViewerRecordV2,
  selectPendingDeletionProfileIdsV2,
  validateObservationChunkDocumentV2,
  validateObservationHeadDocumentV2,
  validateShootingProfilePublicationIdentityV2,
  type PersistedDocumentV2,
  type PlannedFirestoreWriteV2,
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

function timestampFixture() {
  const date = new Date("2026-08-22T00:00:00.000Z");
  return { toDate: () => date, toMillis: () => date.getTime() };
}

function plannedDocument(write: PlannedFirestoreWriteV2): PersistedDocumentV2 {
  return { id: write.path.split("/").at(-1)!, data: write.data };
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

describe("V2 private shooting-profile cloud contract", () => {
  it("packs each observation phase into one deterministic 144-byte big-endian payload", () => {
    const attempt = makeAttempt("front", 0);
    delete attempt.frames[0].sourceLandmarks[11].visibility;
    const serialized = serializeObservationForCloud(attempt);
    expect(serialized.frames).toHaveLength(FRAME_CHUNK_COUNT_V2);
    expect(serialized.frames[37]).toMatchObject({ phaseIndex: 37 });
    expect(serialized.frames[37]).not.toHaveProperty("phase");
    expect(serialized.frames[37].payload).toBeInstanceOf(Uint8Array);
    expect(serialized.frames[37].payload).toHaveLength(OBSERVATION_PAYLOAD_BYTE_LENGTH_V2);
    expect(readInt32(serialized.frames[37].payload, 0)).toBe(211_000);
    expect(readInt32(serialized.frames[37].payload, 1)).toBe(337_000);
    expect(readInt32(serialized.frames[37].payload, 2)).toBe(900_000);
    expect([...serialized.frames[37].payload.slice(0, 4)]).toEqual([0, 3, 56, 56]);

    const missingVisibility = validatePersistedObservationFrameV2(serialized.frames[0]);
    expect(Object.keys(missingVisibility.joints)).toEqual([...PERSISTED_OBSERVATION_JOINTS_V2]);
    expect(missingVisibility.joints.leftShoulder).toEqual({ x: 0.211, y: 0.3 });
    expect(readInt32(serialized.frames[0].payload, 2)).toBe(MISSING_VISIBILITY_SENTINEL_V2);
    expect(serializeObservationForCloud(attempt).frames[37].payload).toEqual(serialized.frames[37].payload);
    expect(JSON.stringify(serialized)).not.toMatch(/nose|timestampMs|sourceTimestampMs|uri|filename|exif|thumbnail|"phase":/i);
  });

  it("strictly rejects malformed observation binary slots, arbitrary byte lookalikes, and phase floats", () => {
    const base = serializeObservationForCloud(makeAttempt("front", 0)).frames[0];
    expect(() => validatePersistedObservationFrameV2({ ...base, phase: 0 })).toThrow(/key/i);
    expect(() => validatePersistedObservationFrameV2({ ...base, phaseIndex: 12.5 })).toThrow(/phaseIndex|integer/i);
    expect(() => validatePersistedObservationFrameV2({
      ...base,
      payload: base.payload.slice(1),
    })).toThrow(/144|length/i);
    expect(() => validatePersistedObservationFrameV2({
      ...base,
      payload: { byteLength: OBSERVATION_PAYLOAD_BYTE_LENGTH_V2 },
    })).toThrow(/Uint8Array|payload/i);
    expect(() => validatePersistedObservationFrameV2({
      ...base,
      payload: replaceInt32(base.payload, 0, 2_000_001),
    })).toThrow(/bound|coordinate/i);
    expect(() => validatePersistedObservationFrameV2({
      ...base,
      payload: replaceInt32(base.payload, 2, -1),
    })).toThrow(/visibility|sentinel/i);
  });

  it("rejects raw metadata, native source z, noncanonical attempts, nonempty completed reasons, and Basic overconfidence", () => {
    const input = makeInput("basic_1_plus_1") as unknown as Record<string, unknown>;
    expect(() => validateShootingProfileWriteV2({ ...input, filename: "shot.mov" })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, exif: { device: "phone" } })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, bytes: new Uint8Array([1]) })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, uri: "file:///private/shot.mov" })).toThrow(/key/i);
    expect(() => validateShootingProfileWriteV2({ ...input, thumbnail: "base64" })).toThrow(/key/i);

    const withZ = makeInput("basic_1_plus_1") as unknown as {
      normalizedAttempts: Array<{ frames: Array<{ sourceLandmarks: Array<Record<string, unknown>> }> }>;
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

  it("packs every representative phase into one exact 480-byte big-endian payload", () => {
    const serialized = serializeRepresentativeProfileForCloud(makeProfile("basic_1_plus_1"));
    expect(serialized.frames).toHaveLength(101);
    expect(serialized.quality).toEqual({ passed: true, reasons: [] });
    const phase37 = serialized.frames[37];
    expect(phase37).toMatchObject({ phaseIndex: 37, uncertaintyModel: "heuristic_v1" });
    expect(phase37).not.toHaveProperty("phase");
    expect(phase37.payload).toBeInstanceOf(Uint8Array);
    expect(phase37.payload).toHaveLength(REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2);
    expect(Array.from({ length: 10 }, (_, index) => readInt32(phase37.payload, index))).toEqual([
      0, 370_000, 0,
      10_000, 0, 0, 10_000, 0, 10_000,
      8_123_456,
    ]);
    expect([...phase37.payload.slice(4, 8)]).toEqual([0, 5, 165, 80]);
    expect(serializeRepresentativeProfileForCloud(makeProfile("basic_1_plus_1")).frames[37].payload)
      .toEqual(phase37.payload);

    const chunks = buildRepresentativeSequenceChunksV2(serialized.frames);
    expect(BINARY_PAYLOAD_FORMAT_V2).toBe("int32_be_fixed_1e6_v1");
    expect(FIXED_POINT_SCALE_V2).toBe(1_000_000);
    expect(REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2).toBe(101);
    expect(chunks).toHaveLength(101);
    expect(chunks[0]).toMatchObject({ documentId: "0", phaseIndex: 0 });
    expect(chunks[100]).toMatchObject({ documentId: "100", phaseIndex: 100 });
    expect(chunks[0].payloadFormat).toBe(BINARY_PAYLOAD_FORMAT_V2);
    expect(chunks[0].payloadByteLength).toBe(REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2);
    expect(chunks[0].packingOrder).toBe(REPRESENTATIVE_PAYLOAD_PACKING_ORDER_V2);
    expect(JSON.stringify(chunks)).not.toMatch(/"phase":/);
    expect(() => buildRepresentativeSequenceChunksV2([
      serialized.frames[1],
      serialized.frames[0],
      ...serialized.frames.slice(2),
    ])).toThrow(/ordered|phase/i);

    const reconstructed = reconstructRepresentativeFrameFromPayloadV2(phase37);
    expect(reconstructed.phase).toBe(0.37);
    expect(reconstructed.joints.leftElbow).toEqual({ x: 0.01, y: 0.37, z: -0.01 });
    expect(reconstructed.uncertainty.leftShoulder.directionalConeDegrees).toBe(8.123456);

    for (const diagonalIndex of [3, 6, 8, 13, 16, 18, 23, 26, 28]) {
      expect(() => validatePersistedRepresentativeFrameV2({
        ...phase37,
        payload: replaceInt32(phase37.payload, diagonalIndex, -1),
      })).toThrow(/bound|covariance|diagonal/i);
    }
    expect(() => validatePersistedRepresentativeFrameV2({
      ...phase37,
      payload: replaceInt32(phase37.payload, 4, -1),
    })).not.toThrow();
    expect(() => validatePersistedRepresentativeFrameV2({
      ...phase37,
      payload: replaceInt32(phase37.payload, 0, -10_000_001),
    })).toThrow(/bound|coordinate/i);
    expect(() => validatePersistedRepresentativeFrameV2({
      ...phase37,
      payload: phase37.payload.slice(1),
    })).toThrow(/480|length/i);
    expect(() => validatePersistedRepresentativeFrameV2({
      ...phase37,
      payload: { byteLength: REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2 },
    })).toThrow(/Uint8Array|payload/i);
  });

  it("builds exact 101 binary documents per stream and publishes the profile head last", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
      input: makeInput("high_accuracy_3_plus_3"),
      timestamp: timestampFixture(),
    });
    expect(plan.publicationWrite.path).toBe("users/owner_1/motionProfiles/profile_1");
    expect(plan.stagingWrites.every((write) => write.path !== plan.publicationWrite.path)).toBe(true);
    expect(plan.stagingWrites).toHaveLength(720);

    const observation = plan.stagingWrites.find((write) => write.path.endsWith("/observations/front-0/frameChunks/0"))!;
    expect(observation.data).toMatchObject({ phaseIndex: 0, attemptId: "front-0", view: "front" });
    expect(observation.data.payloadFormat).toBe(BINARY_PAYLOAD_FORMAT_V2);
    expect(observation.data.payloadByteLength).toBe(OBSERVATION_PAYLOAD_BYTE_LENGTH_V2);
    expect(observation.data.fixedPointScale).toBe(FIXED_POINT_SCALE_V2);
    expect(observation.data.packingOrder).toBe(OBSERVATION_PAYLOAD_PACKING_ORDER_V2);
    expect(observation.data.missingVisibilitySentinel).toBe(MISSING_VISIBILITY_SENTINEL_V2);
    expect(observation.data.payload).toBeInstanceOf(Bytes);
    expect((observation.data.payload as Bytes).toUint8Array()).toHaveLength(OBSERVATION_PAYLOAD_BYTE_LENGTH_V2);
    expect(observation.data).not.toHaveProperty("phase");
    expect(observation.data).not.toHaveProperty("joints");
    expect(observation.data).not.toHaveProperty("frames");

    const sequence = plan.stagingWrites.filter((write) => write.path.includes("/sequenceChunks/"));
    expect(sequence).toHaveLength(REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2);
    expect(sequence.some((write) => write.path.endsWith("/0"))).toBe(true);
    expect(sequence.some((write) => write.path.endsWith("/100"))).toBe(true);
    expect(sequence.some((write) => write.path.endsWith("/000"))).toBe(false);
    expect(sequence.every((write) => !Object.prototype.hasOwnProperty.call(write.data, "phase"))).toBe(true);
    expect(sequence.every((write) => write.data.payload instanceof Bytes)).toBe(true);
    expect(sequence.every((write) => (write.data.payload as Bytes).toUint8Array().length === REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2)).toBe(true);
    expect(sequence[0].data).toMatchObject({
      payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
      payloadByteLength: REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2,
      fixedPointScale: FIXED_POINT_SCALE_V2,
      packingOrder: REPRESENTATIVE_PAYLOAD_PACKING_ORDER_V2,
      uncertaintyModel: "heuristic_v1",
    });
    expect(plan.publicationWrite.data.sequenceChunkCount).toBe(101);
    expect(JSON.stringify([...plan.stagingWrites, plan.publicationWrite])).not.toMatch(/file:\/\/|thumbnail|filename|exif|rawMedia|sourceTimestampMs/i);
    expect(RULE_SAFE_BATCH_MUTATIONS_V2).toBe(1);
    expect(partitionShootingProfileWritesV2(plan.stagingWrites).every((batch) => batch.length === 1)).toBe(true);
  });

  it("strictly binds observation head and phase-document IDs to their path context", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    });
    const head = plan.stagingWrites.find((write) => write.path.endsWith("/observations/front-0"))!;
    const chunk = plan.stagingWrites.find((write) => write.path.endsWith("/observations/front-0/frameChunks/0"))!;
    const context = {
      uid: "owner_1",
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
      attemptId: "front-0",
    };
    expect(() => validateObservationHeadDocumentV2({ ...context, document: plannedDocument(head) })).not.toThrow();
    expect(() => validateObservationChunkDocumentV2({ ...context, document: plannedDocument(chunk) })).not.toThrow();
    expect(() => validateObservationHeadDocumentV2({
      ...context,
      document: { ...plannedDocument(head), id: "shooting_side-0" },
    })).toThrow(/attempt document ID/i);
    expect(() => validateObservationChunkDocumentV2({
      ...context,
      document: { ...plannedDocument(chunk), id: "00" },
    })).toThrow(/chunk document ID/i);
    expect(() => validateObservationChunkDocumentV2({
      ...context,
      document: {
        ...plannedDocument(chunk),
        data: {
          ...asRecord(chunk.data),
          payload: (asRecord(chunk.data).payload as Bytes).toUint8Array(),
        },
      },
    })).toThrow(/Firestore Bytes|payload/i);
    expect(() => validateObservationChunkDocumentV2({
      ...context,
      document: {
        ...plannedDocument(chunk),
        data: { ...asRecord(chunk.data), payloadByteLength: 145 },
      },
    })).toThrow(/payload|length|metadata/i);
  });

  it("uses server reads for safety paths and exact identity for uncertain publication", () => {
    const source = readFileSync("lib/firebase-shooting-profiles.ts", "utf8");
    expect(source).toContain("Bytes.fromUint8Array");
    expect(source).toContain("instanceof Bytes");
    expect(source).toContain("toUint8Array()");
    expect(source).toMatch(/published = await getDocFromServer/);
    expect(source).toMatch(/initialSnapshot = await getDocFromServer/);
    expect(source).toMatch(/getDocFromServer\(headReference\)/);
    expect(source).toMatch(/resumePendingShootingProfileDeletionsV2[\s\S]*getDocsFromServer/);
    expect(source).toMatch(/enumerateDeletionSubordinatePaths[\s\S]*getDocsFromServer/);
    expect(source).toMatch(/deleteSubordinateWithAmbiguityCheckV2[\s\S]*getDocFromServer\(doc\(db, path\)\)/);
    expect(source).toMatch(/listShootingProfilesV2[\s\S]*getDocs\(/);
    expect(source).toMatch(/getShootingProfileV2[\s\S]*getDoc\(/);

    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
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
    expect(matchesPlannedStagingWriteV2(plan.stagingWrites[0].data, plan.stagingWrites[0].data)).toBe(true);
    expect(matchesPlannedStagingWriteV2(
      { ...plan.stagingWrites[0].data, phaseIndex: 99 },
      plan.stagingWrites[0].data,
    )).toBe(false);
    expect(matchesPlannedStagingWriteV2(
      { ...plan.stagingWrites[0].data, createdAt: "server-time" },
      plan.stagingWrites[0].data,
    )).toBe(false);
  });

  it("reconstructs only 101 complete binary phases and enforces public PSD quality", () => {
    const plan = buildShootingProfileWritePlanV2({
      uid: "owner_1",
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
      input: makeInput("basic_1_plus_1"),
      timestamp: timestampFixture(),
    });
    const revision = plan.stagingWrites.find((write) => write.path.endsWith("/revisions/revision_1"))!;
    const sequenceDocuments = plan.stagingWrites
      .filter((write) => write.path.includes("/sequenceChunks/"))
      .map(plannedDocument);
    const phaseDocuments = plan.stagingWrites
      .filter((write) => write.path.includes("/phaseSummaries/"))
      .map(plannedDocument);
    const headDocument = plannedDocument(plan.publicationWrite);
    const revisionDocument = plannedDocument(revision);
    const args = {
      uid: "owner_1",
      profileId: "profile_1",
      head: headDocument,
      revision: revisionDocument,
      sequenceChunks: sequenceDocuments,
      phaseSummaries: phaseDocuments,
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
      revision: { ...revisionDocument, id: "different_revision" },
    })).toThrow(/revision document ID/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: sequenceDocuments.slice(1),
    })).toThrow(/chunk|pair/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [sequenceDocuments[0], ...sequenceDocuments.slice(0, -1)],
    })).toThrow(/chunk|duplicate/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [...sequenceDocuments, sequenceDocuments[0]],
    })).toThrow(/chunk|extra/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [{ ...sequenceDocuments[0], id: "00" }, ...sequenceDocuments.slice(1)],
    })).toThrow(/document ID|canonical/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [
        {
          ...sequenceDocuments[0],
          data: { ...asRecord(sequenceDocuments[0].data), phaseIndex: 1 },
        },
        ...sequenceDocuments.slice(1),
      ],
    })).toThrow(/document ID|canonical|phase/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      phaseSummaries: phaseDocuments.slice(1),
    })).toThrow(/phase summaries/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      phaseSummaries: [{ ...phaseDocuments[0], id: "rise" }, ...phaseDocuments.slice(1)],
    })).toThrow(/summary document ID/i);
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
      sequenceChunks: [{
        ...sequenceDocuments[0],
        data: {
          ...asRecord(sequenceDocuments[0].data),
          payload: (asRecord(sequenceDocuments[0].data).payload as Bytes).toUint8Array(),
        },
      }, ...sequenceDocuments.slice(1)],
    })).toThrow(/Firestore Bytes|payload/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [{
        ...sequenceDocuments[0],
        data: {
          ...asRecord(sequenceDocuments[0].data),
          payload: Bytes.fromUint8Array(new Uint8Array(REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2 - 1)),
        },
      }, ...sequenceDocuments.slice(1)],
    })).toThrow(/480|length/i);
    expect(() => reconstructShootingProfileViewerRecordV2({
      ...args,
      sequenceChunks: [{
        ...sequenceDocuments[0],
        data: { ...asRecord(sequenceDocuments[0].data), payloadFormat: "unknown" },
      }, ...sequenceDocuments.slice(1)],
    })).toThrow(/packing|payload|metadata/i);

    const phaseIndex = sequenceDocuments.findIndex((document) => document.id === "0");
    const phaseDocument = sequenceDocuments[phaseIndex];
    const phaseData = asRecord(phaseDocument.data);
    let indefinitePayload = (phaseData.payload as Bytes).toUint8Array();
    indefinitePayload = replaceInt32(indefinitePayload, 3, 10_000);
    indefinitePayload = replaceInt32(indefinitePayload, 4, 20_000);
    indefinitePayload = replaceInt32(indefinitePayload, 6, 10_000);
    expect(() => validatePersistedRepresentativeFrameV2({
      phaseIndex: phaseData.phaseIndex,
      uncertaintyModel: phaseData.uncertaintyModel,
      payload: indefinitePayload,
    })).not.toThrow();
    const invalidPsd = [...sequenceDocuments];
    invalidPsd[phaseIndex] = {
      ...phaseDocument,
      data: { ...phaseData, payload: Bytes.fromUint8Array(indefinitePayload) },
    };
    expect(() => reconstructShootingProfileViewerRecordV2({ ...args, sequenceChunks: invalidPsd })).toThrow(/semidefinite|covariance/i);
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
    const subordinatePaths = [
      `${headPath}/revisions/revision_1/sequenceChunks/0`,
      `${headPath}/revisions/revision_1/sequenceChunks/1`,
      `${headPath}/revisions/revision_1/phaseSummaries/ready`,
      `${headPath}/revisions/revision_1`,
      "users/owner_1/captureSessions/capture_1/observations/front-0/frameChunks/0",
      "users/owner_1/captureSessions/capture_1/observations/front-0",
      "users/owner_1/captureSessions/capture_1",
    ];
    const plan = buildShootingProfileDeletePlanV2({
      deletionState: "in_progress",
      headPath,
      subordinatePaths,
    });
    expect(plan.deletePaths.at(-1)).toBe(headPath);
    expect(plan.transitionRequired).toBe(false);
    expect(plan.deleteBatches.every((batch) => batch.length === 1)).toBe(true);
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
      captureSessionId: "capture_1",
      profileId: "profile_1",
      revisionId: "revision_1",
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
