import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type CaptureViewV2,
  type JointUncertaintyV2,
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

export const SHOOTING_PROFILE_SCHEMA_VERSION_V2 = 2 as const;
export const SHOOTING_PROFILE_BOUNDARY_V2 = "representative_phase_fused_4d_estimate_not_actual_3d" as const;
export const SHOOTING_PROFILE_TIME_BASIS_V2 = "normalized_shot_phase" as const;
export const SHOOTING_PROFILE_DATA_CLASS_V2 = "owner_private_derived_biomechanics_v2" as const;
export const SHOOTING_PROFILE_RETENTION_CLASS_V2 = "owner_deleted_v2" as const;
export const SHOOTING_PROFILE_CONSENT_REFERENCE_V2 = "owner_capture_consent_v2" as const;
export const SHOOTING_PROFILE_ALGORITHM_VERSION_V2 = "representative_phase_fusion_v1" as const;
export const SHOOTING_PROFILE_MODEL_VERSION_V2 = "mediapipe_pose_landmarker_v2" as const;
export const PHASE_SAMPLE_COUNT_V2 = 101 as const;
export const RULE_SAFE_BATCH_MUTATIONS_V2 = 1 as const;
export const NUMERIC_PRECISION_DIGITS_V2 = 6 as const;
export const FIXED_POINT_SCALE_V2 = 1_000_000 as const;
export const BINARY_PAYLOAD_FORMAT_V2 = "int32_be_fixed_1e6_v1" as const;
export const OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2 = 144 as const;
export const OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2 = 14_544 as const;
export const REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2 = 480 as const;
export const REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2 = 48_480 as const;
export const OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2 = "phase_major_joint_major_xy_visibility_v1" as const;
export const REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2 = "phase_major_joint_major_xyz_covariance6_cone_v1" as const;
export const MISSING_VISIBILITY_SENTINEL_V2 = -2_147_483_648 as const;

const NUMERIC_SCALE_V2 = FIXED_POINT_SCALE_V2;
const PHASE_TOLERANCE_V2 = 1e-12;
const SOURCE_COORDINATE_BOUND_V2 = 2;
const REPRESENTATIVE_COORDINATE_BOUND_V2 = 10;
const COVARIANCE_BOUND_V2 = 100;
const MAX_SOURCE_TIMESTAMP_MS_V2 = 3_600_000;
const OPAQUE_ID_V2 = /^[A-Za-z0-9_-]{1,128}$/;

export const PERSISTED_OBSERVATION_JOINTS_V2 = PERSISTED_JOINT_NAMES_V2;

export const PERSISTED_OBSERVATION_LANDMARK_INDEX_V2 = Object.freeze({
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
} satisfies Record<PersistedJointNameV2, number>);

export const CANONICAL_PHASE_SUMMARIES_V2 = Object.freeze([
  Object.freeze({ id: "ready", phase: 0, phaseIndex: 0 }),
  Object.freeze({ id: "deepestDip", phase: 0.25, phaseIndex: 25 }),
  Object.freeze({ id: "rise", phase: 0.5, phaseIndex: 50 }),
  Object.freeze({ id: "releaseProxy", phase: 0.75, phaseIndex: 75 }),
  Object.freeze({ id: "followThrough", phase: 1, phaseIndex: 100 }),
] as const);

export type CanonicalPhaseIdV2 = (typeof CANONICAL_PHASE_SUMMARIES_V2)[number]["id"];

export type SaveShootingProfileInputV2 = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence: number;
  normalizedAttempts: readonly NormalizedViewAttemptV2[];
};

export type ShootingProfileViewerRecordV2 = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence: number;
};

export type PersistedObservationPointV2 = {
  x: number;
  y: number;
  visibility?: number;
};

export type PersistedObservationFrameV2 = {
  phaseIndex: number;
  joints: Record<PersistedJointNameV2, PersistedObservationPointV2>;
};

type SerializedObservationFrameV2 = {
  phaseIndex: number;
  payload: Uint8Array;
};

type PersistedRepresentativeFrameV2 = {
  phaseIndex: number;
  uncertaintyModel: "heuristic_v1";
  payload: Uint8Array;
};

type SerializedObservationV2 = {
  attemptId: string;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  takeIndex: 0 | 1 | 2;
  frames: SerializedObservationFrameV2[];
};

type SerializedRepresentativeProfileV2 = {
  frames: PersistedRepresentativeFrameV2[];
  quality: RepresentativePose4DV2["quality"];
};

export type SerializedObservationSequenceV2 = {
  attemptId: string;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  takeIndex: 0 | 1 | 2;
  frameCount: typeof PHASE_SAMPLE_COUNT_V2;
  framePayloadByteLength: typeof OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2;
  payloadByteLength: typeof OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2;
  payloadFormat: typeof BINARY_PAYLOAD_FORMAT_V2;
  fixedPointScale: typeof FIXED_POINT_SCALE_V2;
  packingOrder: typeof OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2;
  missingVisibilitySentinel: typeof MISSING_VISIBILITY_SENTINEL_V2;
  payload: Uint8Array;
};

export type SerializedRepresentativeSequenceV2 = {
  frameCount: typeof PHASE_SAMPLE_COUNT_V2;
  framePayloadByteLength: typeof REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2;
  payloadByteLength: typeof REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2;
  payloadFormat: typeof BINARY_PAYLOAD_FORMAT_V2;
  fixedPointScale: typeof FIXED_POINT_SCALE_V2;
  packingOrder: typeof REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2;
  uncertaintyModel: "heuristic_v1";
  payload: Uint8Array;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function assertExactKeys(value: UnknownRecord, keys: readonly string[], name: string): void {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new Error(`${name} contains an unknown or missing key`);
  }
}

function assertOnlyKeys(value: UnknownRecord, keys: readonly string[], required: readonly string[], name: string): void {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.has(key)) || required.some((key) => !(key in value))) {
    throw new Error(`${name} contains an unknown or missing key`);
  }
}

function requireFiniteBounded(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${name} is outside its sane bound`);
  }
  return value;
}

function requireInteger(value: unknown, minimum: number, maximum: number, name: string): number {
  const number = requireFiniteBounded(value, minimum, maximum, name);
  if (!Number.isInteger(number)) throw new Error(`${name} must be an integer`);
  return number;
}

function quantizeFiniteBounded(value: unknown, minimum: number, maximum: number, name: string): number {
  const number = requireFiniteBounded(value, minimum, maximum, name);
  const quantized = Math.round(number * NUMERIC_SCALE_V2) / NUMERIC_SCALE_V2;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function requireQuantized(value: unknown, minimum: number, maximum: number, name: string): number {
  const number = requireFiniteBounded(value, minimum, maximum, name);
  if (quantizeFiniteBounded(number, minimum, maximum, name) !== number) {
    throw new Error(`${name} exceeds the fixed numeric precision`);
  }
  return number;
}

function packFixedPoint(value: unknown, minimum: number, maximum: number, name: string): number {
  const number = requireFiniteBounded(value, minimum, maximum, name);
  const packed = Math.round(number * FIXED_POINT_SCALE_V2);
  if (!Number.isSafeInteger(packed)) throw new Error(`${name} cannot be represented as a safe fixed-point integer`);
  return Object.is(packed, -0) ? 0 : packed;
}

function requirePackedInteger(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe packed integer`);
  }
  const number = value;
  const packedMinimum = minimum * FIXED_POINT_SCALE_V2;
  const packedMaximum = maximum * FIXED_POINT_SCALE_V2;
  if (number < packedMinimum || number > packedMaximum) throw new Error(`${name} is outside its packed bound`);
  return number;
}

function unpackFixedPoint(value: number): number {
  const unpacked = value / FIXED_POINT_SCALE_V2;
  return Object.is(unpacked, -0) ? 0 : unpacked;
}

function requireString(value: unknown, minimumLength: number, maximumLength: number, name: string): string {
  if (typeof value !== "string" || value.length < minimumLength || value.length > maximumLength) {
    throw new Error(`${name} must be a bounded string`);
  }
  return value;
}

function requireOpaqueId(value: unknown, name: string): string {
  const id = requireString(value, 1, 128, name);
  if (!OPAQUE_ID_V2.test(id)) throw new Error(`${name} must be an opaque ID`);
  return id;
}

export function isOpaqueShootingProfileIdV2(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID_V2.test(value);
}

function exactJointKeys(value: UnknownRecord, name: string): void {
  assertExactKeys(value, PERSISTED_JOINT_NAMES_V2, name);
}

function validateSourcePoint(value: unknown, name: string): PersistedObservationPointV2 {
  const point = requireRecord(value, name);
  assertOnlyKeys(point, ["x", "y", "visibility"], ["x", "y"], name);
  const validated: PersistedObservationPointV2 = {
    x: requireFiniteBounded(point.x, -SOURCE_COORDINATE_BOUND_V2, SOURCE_COORDINATE_BOUND_V2, `${name}.x`),
    y: requireFiniteBounded(point.y, -SOURCE_COORDINATE_BOUND_V2, SOURCE_COORDINATE_BOUND_V2, `${name}.y`),
  };
  if (point.visibility !== undefined) {
    validated.visibility = requireFiniteBounded(point.visibility, 0, 1, `${name}.visibility`);
  }
  return validated;
}

function validateVector3(value: unknown, name: string, quantized: boolean): { x: number; y: number; z: number } {
  const vector = requireRecord(value, name);
  assertExactKeys(vector, ["x", "y", "z"], name);
  const requireNumber = quantized ? requireQuantized : requireFiniteBounded;
  return {
    x: requireNumber(vector.x, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${name}.x`),
    y: requireNumber(vector.y, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${name}.y`),
    z: requireNumber(vector.z, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${name}.z`),
  };
}

function validateUncertainty(value: unknown, name: string, quantized: boolean): JointUncertaintyV2 {
  const uncertainty = requireRecord(value, name);
  assertExactKeys(uncertainty, ["model", "covariance", "directionalConeDegrees"], name);
  if (uncertainty.model !== "heuristic_v1") throw new Error(`${name}.model is invalid`);
  if (!Array.isArray(uncertainty.covariance) || uncertainty.covariance.length !== 6) {
    throw new Error(`${name}.covariance must contain six values`);
  }
  const requireNumber = quantized ? requireQuantized : requireFiniteBounded;
  const covariance = uncertainty.covariance.map((entry, index) => requireNumber(
    entry,
    -COVARIANCE_BOUND_V2,
    COVARIANCE_BOUND_V2,
    `${name}.covariance[${index}]`,
  )) as JointUncertaintyV2["covariance"];
  return {
    model: "heuristic_v1",
    covariance,
    directionalConeDegrees: requireNumber(
      uncertainty.directionalConeDegrees,
      0,
      180,
      `${name}.directionalConeDegrees`,
    ),
  };
}

function validateCanonicalProfile(profile: RepresentativePose4DV2): void {
  if (profile.frames.length !== PHASE_SAMPLE_COUNT_V2) throw new Error("profile must contain exactly 101 phases");
  profile.frames.forEach((frame, frameIndex) => {
    const record = requireRecord(frame, `profile.frames[${frameIndex}]`);
    assertExactKeys(record, ["phase", "joints", "uncertainty"], `profile.frames[${frameIndex}]`);
    const phase = requireFiniteBounded(frame.phase, 0, 1, `profile.frames[${frameIndex}].phase`);
    if (Math.abs(phase - frameIndex / 100) > PHASE_TOLERANCE_V2) {
      throw new Error("profile frames must use the exact ordered 101 phase grid");
    }
    const joints = requireRecord(frame.joints, `profile.frames[${frameIndex}].joints`);
    const uncertainty = requireRecord(frame.uncertainty, `profile.frames[${frameIndex}].uncertainty`);
    exactJointKeys(joints, `profile.frames[${frameIndex}].joints`);
    exactJointKeys(uncertainty, `profile.frames[${frameIndex}].uncertainty`);
    PERSISTED_JOINT_NAMES_V2.forEach((joint) => {
      validateVector3(joints[joint], `profile.frames[${frameIndex}].joints.${joint}`, false);
      validateUncertainty(uncertainty[joint], `profile.frames[${frameIndex}].uncertainty.${joint}`, false);
    });
  });
  if (profile.phaseAnchors.length !== CANONICAL_PHASE_SUMMARIES_V2.length) {
    throw new Error("profile must contain five canonical phase summaries");
  }
  profile.phaseAnchors.forEach((anchor, index) => {
    const record = requireRecord(anchor, `profile.phaseAnchors[${index}]`);
    assertExactKeys(record, ["id", "phase"], `profile.phaseAnchors[${index}]`);
    const canonical = CANONICAL_PHASE_SUMMARIES_V2[index];
    if (anchor.id !== canonical.id || anchor.phase !== canonical.phase) {
      throw new Error("profile phase summaries must be canonical and ordered");
    }
  });
  const quality = requireRecord(profile.quality, "profile.quality");
  assertExactKeys(quality, ["passed", "reasons"], "profile.quality");
  if (profile.quality.passed !== true) throw new Error("only a passed representative profile may be saved");
  if (!Array.isArray(profile.quality.reasons) || profile.quality.reasons.length !== 0) {
    throw new Error("completed profile quality reasons must be empty");
  }
}

function validateNormalizedAttempt(value: unknown): NormalizedViewAttemptV2 {
  const attempt = requireRecord(value, "normalized attempt");
  assertExactKeys(attempt, ["id", "phaseAnchors", "frames"], "normalized attempt");
  const id = requireOpaqueId(attempt.id, "normalized attempt ID");
  if (!Array.isArray(attempt.phaseAnchors) || attempt.phaseAnchors.length !== CANONICAL_PHASE_SUMMARIES_V2.length) {
    throw new Error(`attempt ${id} must contain five canonical phase anchors`);
  }
  let previousAnchorTimestamp = -1;
  attempt.phaseAnchors.forEach((value, index) => {
    const anchor = requireRecord(value, `attempt ${id} phase anchor ${index}`);
    assertExactKeys(anchor, ["id", "timestampMs", "phase"], `attempt ${id} phase anchor ${index}`);
    const canonical = CANONICAL_PHASE_SUMMARIES_V2[index];
    const timestamp = requireFiniteBounded(
      anchor.timestampMs,
      0,
      MAX_SOURCE_TIMESTAMP_MS_V2,
      `attempt ${id} phase anchor ${index} timestampMs`,
    );
    if (anchor.id !== canonical.id || anchor.phase !== canonical.phase || timestamp <= previousAnchorTimestamp) {
      throw new Error(`attempt ${id} phase anchors must be canonical and strictly ordered`);
    }
    previousAnchorTimestamp = timestamp;
  });
  if (!Array.isArray(attempt.frames) || attempt.frames.length !== PHASE_SAMPLE_COUNT_V2) {
    throw new Error(`attempt ${id} must contain exactly 101 phase samples`);
  }
  let identity: { view: CaptureViewV2; shootingHand: ShootingHandV2; takeIndex: 0 | 1 | 2 } | undefined;
  let previousTimestamp = -1;
  attempt.frames.forEach((value, frameIndex) => {
    const frame = requireRecord(value, `attempt ${id} frame ${frameIndex}`);
    assertExactKeys(
      frame,
      ["phase", "sourceTimestampMs", "view", "shootingHand", "takeIndex", "sourceLandmarks"],
      `attempt ${id} frame ${frameIndex}`,
    );
    const phase = requireFiniteBounded(frame.phase, 0, 1, `attempt ${id} frame ${frameIndex} phase`);
    if (Math.abs(phase - frameIndex / 100) > PHASE_TOLERANCE_V2) {
      throw new Error(`attempt ${id} must use the exact ordered 101 phase grid`);
    }
    const timestamp = requireFiniteBounded(
      frame.sourceTimestampMs,
      0,
      MAX_SOURCE_TIMESTAMP_MS_V2,
      `attempt ${id} frame ${frameIndex} source timestamp`,
    );
    if (frameIndex > 0 && timestamp <= previousTimestamp) {
      throw new Error(`attempt ${id} source timestamps must be strictly ordered`);
    }
    previousTimestamp = timestamp;
    if (frame.view !== "front" && frame.view !== "shooting_side") throw new Error(`attempt ${id} view is invalid`);
    if (frame.shootingHand !== "left" && frame.shootingHand !== "right") throw new Error(`attempt ${id} hand is invalid`);
    const takeIndex = requireInteger(frame.takeIndex, 0, 2, `attempt ${id} take index`) as 0 | 1 | 2;
    identity ??= { view: frame.view, shootingHand: frame.shootingHand, takeIndex };
    if (
      frame.view !== identity.view
      || frame.shootingHand !== identity.shootingHand
      || takeIndex !== identity.takeIndex
    ) {
      throw new Error(`attempt ${id} view, hand, and take identity must remain consistent`);
    }
    if (!Array.isArray(frame.sourceLandmarks) || frame.sourceLandmarks.length !== 33) {
      throw new Error(`attempt ${id} must contain the complete 33-point normalized source layout`);
    }
    frame.sourceLandmarks.forEach((point, landmarkIndex) => validateSourcePoint(
      point,
      `attempt ${id} frame ${frameIndex} source landmark ${landmarkIndex}`,
    ));
  });
  if (!identity || id !== `${identity.view}-${identity.takeIndex}`) {
    throw new Error(`attempt ID ${id} must equal its canonical view and take identity`);
  }
  return value as NormalizedViewAttemptV2;
}

function validateAttemptSet(
  attempts: readonly NormalizedViewAttemptV2[],
  mode: CaptureProtocolV2,
  shootingHand: ShootingHandV2,
): void {
  const expectedCount = mode === "basic_1_plus_1" ? 2 : 6;
  if (attempts.length !== expectedCount) throw new Error(`${mode} requires exactly ${expectedCount} attempts`);
  const seenIds = new Set<string>();
  const identities = new Set<string>();
  attempts.forEach((attempt) => {
    const firstFrame = attempt.frames[0];
    if (firstFrame.shootingHand !== shootingHand) throw new Error("all attempts must use the selected shooting hand");
    if (seenIds.has(attempt.id)) throw new Error("attempt IDs must be unique");
    seenIds.add(attempt.id);
    const identity = `${firstFrame.view}:${firstFrame.takeIndex}`;
    if (identities.has(identity)) throw new Error("view/take attempt identities must be unique");
    identities.add(identity);
  });
  const expectedTakes = mode === "basic_1_plus_1" ? [0] : [0, 1, 2];
  for (const view of ["front", "shooting_side"] as const) {
    for (const takeIndex of expectedTakes) {
      if (!identities.has(`${view}:${takeIndex}`)) {
        throw new Error(`${mode} is missing the required ${view} attempt ${takeIndex}`);
      }
    }
  }
}

export function validateShootingProfileWriteV2(value: unknown): SaveShootingProfileInputV2 {
  const input = requireRecord(value, "shooting profile write");
  assertExactKeys(input, ["profile", "shootingHand", "confidence", "normalizedAttempts"], "shooting profile write");
  const profile = parseRepresentativePose4D(input.profile);
  validateCanonicalProfile(profile);
  if (input.shootingHand !== "left" && input.shootingHand !== "right") {
    throw new Error("shooting hand must be left or right");
  }
  const confidence = requireFiniteBounded(input.confidence, 0, 1, "confidence");
  if (profile.mode === "basic_1_plus_1" && confidence > 0.65) {
    throw new Error("Basic capture confidence must not exceed 0.65");
  }
  if (!Array.isArray(input.normalizedAttempts)) throw new Error("normalized attempts must be an array");
  const normalizedAttempts = input.normalizedAttempts.map(validateNormalizedAttempt);
  validateAttemptSet(normalizedAttempts, profile.mode, input.shootingHand);
  return {
    profile,
    shootingHand: input.shootingHand,
    confidence,
    normalizedAttempts,
  };
}

function requireBinaryPayload(value: unknown, byteLength: number, name: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`${name} payload must be a Uint8Array`);
  if (value.byteLength !== byteLength) {
    throw new Error(`${name} payload must contain exactly ${byteLength} bytes`);
  }
  return value;
}

function readPackedInt32(payload: Uint8Array, index: number): number {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(index * 4, false);
}

function writePackedInt32(payload: Uint8Array, index: number, value: number, name: string): void {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new Error(`${name} cannot be represented as a signed int32`);
  }
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setInt32(index * 4, value, false);
}

function validatePersistedObservationFrameV2(value: unknown): PersistedObservationFrameV2 {
  const frame = requireRecord(value, "persisted observation frame");
  assertExactKeys(frame, ["phaseIndex", "payload"], "persisted observation frame");
  const phaseIndex = requireInteger(frame.phaseIndex, 0, 100, "persisted observation frame.phaseIndex");
  const payload = requireBinaryPayload(
    frame.payload,
    OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    "persisted observation frame",
  );
  const joints = Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint, jointIndex) => {
    const offset = jointIndex * 3;
    const x = unpackFixedPoint(requirePackedInteger(
      readPackedInt32(payload, offset),
      -SOURCE_COORDINATE_BOUND_V2,
      SOURCE_COORDINATE_BOUND_V2,
      `persisted observation ${joint} x coordinate`,
    ));
    const y = unpackFixedPoint(requirePackedInteger(
      readPackedInt32(payload, offset + 1),
      -SOURCE_COORDINATE_BOUND_V2,
      SOURCE_COORDINATE_BOUND_V2,
      `persisted observation ${joint} y coordinate`,
    ));
    const packedVisibility = readPackedInt32(payload, offset + 2);
    if (packedVisibility === MISSING_VISIBILITY_SENTINEL_V2) return [joint, { x, y }];
    return [joint, {
      x,
      y,
      visibility: unpackFixedPoint(requirePackedInteger(
        packedVisibility,
        0,
        1,
        `persisted observation ${joint} visibility or sentinel`,
      )),
    }];
  })) as PersistedObservationFrameV2["joints"];
  return { phaseIndex, joints };
}

function validatePersistedRepresentativeFrameV2(value: unknown): PersistedRepresentativeFrameV2 {
  const frame = requireRecord(value, "persisted representative frame");
  assertExactKeys(
    frame,
    ["phaseIndex", "uncertaintyModel", "payload"],
    "persisted representative frame",
  );
  const phaseIndex = requireInteger(frame.phaseIndex, 0, 100, "persisted representative frame.phaseIndex");
  if (frame.uncertaintyModel !== "heuristic_v1") {
    throw new Error("persisted representative uncertainty model is invalid");
  }
  const payload = requireBinaryPayload(
    frame.payload,
    REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    "persisted representative frame",
  );
  for (let index = 0; index < PERSISTED_JOINT_NAMES_V2.length * 10; index += 1) {
    const slot = index % 10;
    const isCoordinate = slot <= 2;
    const isCone = slot === 9;
    const isCovarianceDiagonal = slot === 3 || slot === 6 || slot === 8;
    requirePackedInteger(
      readPackedInt32(payload, index),
      isCoordinate
        ? -REPRESENTATIVE_COORDINATE_BOUND_V2
        : (isCone || isCovarianceDiagonal ? 0 : -COVARIANCE_BOUND_V2),
      isCoordinate
        ? REPRESENTATIVE_COORDINATE_BOUND_V2
        : (isCone ? 180 : COVARIANCE_BOUND_V2),
      `persisted representative payload slot ${index}`,
    );
  }
  return { phaseIndex, uncertaintyModel: "heuristic_v1", payload: payload.slice() };
}

function serializeObservationForCloud(attempt: NormalizedViewAttemptV2): SerializedObservationV2 {
  const validated = validateNormalizedAttempt(attempt);
  const firstFrame = validated.frames[0];
  return {
    attemptId: validated.id,
    view: firstFrame.view,
    shootingHand: firstFrame.shootingHand,
    takeIndex: firstFrame.takeIndex,
    frames: validated.frames.map((frame, frameIndex) => {
      const payload = new Uint8Array(OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2);
      PERSISTED_JOINT_NAMES_V2.forEach((joint, jointIndex) => {
        const point = validateSourcePoint(
          frame.sourceLandmarks[PERSISTED_OBSERVATION_LANDMARK_INDEX_V2[joint]],
          `attempt ${validated.id} frame ${frameIndex} ${joint}`,
        );
        const offset = jointIndex * 3;
        writePackedInt32(payload, offset, packFixedPoint(
          point.x, -SOURCE_COORDINATE_BOUND_V2, SOURCE_COORDINATE_BOUND_V2, `${joint}.x`,
        ), `${joint}.x`);
        writePackedInt32(payload, offset + 1, packFixedPoint(
          point.y, -SOURCE_COORDINATE_BOUND_V2, SOURCE_COORDINATE_BOUND_V2, `${joint}.y`,
        ), `${joint}.y`);
        writePackedInt32(
          payload,
          offset + 2,
          point.visibility === undefined
            ? MISSING_VISIBILITY_SENTINEL_V2
            : packFixedPoint(point.visibility, 0, 1, `${joint}.visibility`),
          `${joint}.visibility`,
        );
      });
      return { phaseIndex: frameIndex, payload };
    }),
  };
}

function serializeRepresentativeProfileForCloud(
  profile: RepresentativePose4DV2,
): SerializedRepresentativeProfileV2 {
  const parsed = parseRepresentativePose4D(profile);
  validateCanonicalProfile(parsed);
  const serialized: SerializedRepresentativeProfileV2 = {
    frames: parsed.frames.map((frame, phaseIndex) => {
      const payload = new Uint8Array(REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2);
      PERSISTED_JOINT_NAMES_V2.forEach((joint, jointIndex) => {
        const offset = jointIndex * 10;
        const uncertainty = frame.uncertainty[joint];
        const values = [
          packFixedPoint(frame.joints[joint].x, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${joint}.x`),
          packFixedPoint(frame.joints[joint].y, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${joint}.y`),
          packFixedPoint(frame.joints[joint].z, -REPRESENTATIVE_COORDINATE_BOUND_V2, REPRESENTATIVE_COORDINATE_BOUND_V2, `${joint}.z`),
          ...uncertainty.covariance.map((entry, covarianceIndex) => packFixedPoint(
            entry,
            covarianceIndex === 0 || covarianceIndex === 3 || covarianceIndex === 5
              ? 0
              : -COVARIANCE_BOUND_V2,
            COVARIANCE_BOUND_V2,
            `${joint}.covariance[${covarianceIndex}]`,
          )),
          packFixedPoint(
            uncertainty.directionalConeDegrees,
            0,
            180,
            `${joint}.directionalConeDegrees`,
          ),
        ];
        values.forEach((value, slot) => writePackedInt32(payload, offset + slot, value, `${joint}[${slot}]`));
      });
      return { phaseIndex, uncertaintyModel: "heuristic_v1" as const, payload };
    }),
    quality: { passed: true, reasons: [] },
  };
  parseRepresentativePose4D({
    schemaVersion: SHOOTING_PROFILE_SCHEMA_VERSION_V2,
    boundary: SHOOTING_PROFILE_BOUNDARY_V2,
    mode: parsed.mode,
    timeBasis: SHOOTING_PROFILE_TIME_BASIS_V2,
    units: "template_shoulder_breadths",
    frames: Array.from({ length: PHASE_SAMPLE_COUNT_V2 }, (_, phaseIndex) => (
      reconstructRepresentativeFrameFromPayloadV2(serialized.frames[phaseIndex])
    )),
    phaseAnchors: parsed.phaseAnchors,
    quality: serialized.quality,
  });
  return serialized;
}

export function serializeObservationSequenceForCloud(
  attempt: NormalizedViewAttemptV2,
): SerializedObservationSequenceV2 {
  const serialized = serializeObservationForCloud(attempt);
  const payload = new Uint8Array(OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2);
  serialized.frames.forEach((frame, phaseIndex) => {
    if (frame.phaseIndex !== phaseIndex) {
      throw new Error("serialized observation frames must use canonical ordered phase indices");
    }
    payload.set(frame.payload, phaseIndex * OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2);
  });
  return {
    attemptId: serialized.attemptId,
    view: serialized.view,
    shootingHand: serialized.shootingHand,
    takeIndex: serialized.takeIndex,
    frameCount: PHASE_SAMPLE_COUNT_V2,
    framePayloadByteLength: OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    payloadByteLength: OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
    fixedPointScale: FIXED_POINT_SCALE_V2,
    packingOrder: OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
    missingVisibilitySentinel: MISSING_VISIBILITY_SENTINEL_V2,
    payload,
  };
}

function requireObservationSequenceEnvelopeV2(value: unknown): SerializedObservationSequenceV2 {
  const sequence = requireRecord(value, "persisted observation sequence");
  assertExactKeys(sequence, [
    "attemptId",
    "view",
    "shootingHand",
    "takeIndex",
    "frameCount",
    "framePayloadByteLength",
    "payloadByteLength",
    "payloadFormat",
    "fixedPointScale",
    "packingOrder",
    "missingVisibilitySentinel",
    "payload",
  ], "persisted observation sequence");
  const attemptId = requireOpaqueId(sequence.attemptId, "persisted observation sequence.attemptId");
  if (sequence.view !== "front" && sequence.view !== "shooting_side") {
    throw new Error("persisted observation sequence view metadata is invalid");
  }
  if (sequence.shootingHand !== "left" && sequence.shootingHand !== "right") {
    throw new Error("persisted observation sequence shootingHand metadata is invalid");
  }
  const takeIndex = requireInteger(
    sequence.takeIndex,
    0,
    2,
    "persisted observation sequence.takeIndex",
  ) as 0 | 1 | 2;
  if (attemptId !== `${sequence.view}-${takeIndex}`) {
    throw new Error("persisted observation sequence attemptId metadata is not canonical");
  }
  if (sequence.frameCount !== PHASE_SAMPLE_COUNT_V2) {
    throw new Error("persisted observation sequence frameCount metadata is invalid");
  }
  if (sequence.framePayloadByteLength !== OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2) {
    throw new Error("persisted observation sequence framePayloadByteLength metadata is invalid");
  }
  if (sequence.payloadByteLength !== OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2) {
    throw new Error("persisted observation sequence payloadByteLength metadata is invalid");
  }
  if (sequence.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2) {
    throw new Error("persisted observation sequence payloadFormat metadata is invalid");
  }
  if (sequence.fixedPointScale !== FIXED_POINT_SCALE_V2) {
    throw new Error("persisted observation sequence fixedPointScale metadata is invalid");
  }
  if (sequence.packingOrder !== OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2) {
    throw new Error("persisted observation sequence packingOrder metadata is invalid");
  }
  if (sequence.missingVisibilitySentinel !== MISSING_VISIBILITY_SENTINEL_V2) {
    throw new Error("persisted observation sequence missingVisibilitySentinel metadata is invalid");
  }
  const payload = requireBinaryPayload(
    sequence.payload,
    OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    "persisted observation sequence",
  );
  return {
    attemptId,
    view: sequence.view,
    shootingHand: sequence.shootingHand,
    takeIndex,
    frameCount: PHASE_SAMPLE_COUNT_V2,
    framePayloadByteLength: OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    payloadByteLength: OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
    fixedPointScale: FIXED_POINT_SCALE_V2,
    packingOrder: OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
    missingVisibilitySentinel: MISSING_VISIBILITY_SENTINEL_V2,
    payload,
  };
}

export function reconstructObservationFramesFromSequencePayloadV2(
  value: unknown,
): PersistedObservationFrameV2[] {
  const sequence = validatePersistedObservationSequenceV2(value);
  return Array.from({ length: PHASE_SAMPLE_COUNT_V2 }, (_, phaseIndex) => {
    const offset = phaseIndex * OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2;
    return validatePersistedObservationFrameV2({
      phaseIndex,
      payload: sequence.payload.slice(offset, offset + OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2),
    });
  });
}

export function validatePersistedObservationSequenceV2(
  value: unknown,
): SerializedObservationSequenceV2 {
  const sequence = requireObservationSequenceEnvelopeV2(value);
  for (let phaseIndex = 0; phaseIndex < PHASE_SAMPLE_COUNT_V2; phaseIndex += 1) {
    const offset = phaseIndex * OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2;
    validatePersistedObservationFrameV2({
      phaseIndex,
      payload: sequence.payload.slice(offset, offset + OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2),
    });
  }
  return { ...sequence, payload: sequence.payload.slice() };
}

export function serializeRepresentativeSequenceForCloud(
  profile: RepresentativePose4DV2,
): SerializedRepresentativeSequenceV2 {
  const serialized = serializeRepresentativeProfileForCloud(profile);
  const payload = new Uint8Array(REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2);
  serialized.frames.forEach((frame, phaseIndex) => {
    if (frame.phaseIndex !== phaseIndex) {
      throw new Error("serialized representative frames must use canonical ordered phase indices");
    }
    payload.set(frame.payload, phaseIndex * REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2);
  });
  return {
    frameCount: PHASE_SAMPLE_COUNT_V2,
    framePayloadByteLength: REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    payloadByteLength: REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
    fixedPointScale: FIXED_POINT_SCALE_V2,
    packingOrder: REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
    uncertaintyModel: "heuristic_v1",
    payload,
  };
}

function requireRepresentativeSequenceEnvelopeV2(value: unknown): SerializedRepresentativeSequenceV2 {
  const sequence = requireRecord(value, "persisted representative sequence");
  assertExactKeys(sequence, [
    "frameCount",
    "framePayloadByteLength",
    "payloadByteLength",
    "payloadFormat",
    "fixedPointScale",
    "packingOrder",
    "uncertaintyModel",
    "payload",
  ], "persisted representative sequence");
  if (sequence.frameCount !== PHASE_SAMPLE_COUNT_V2) {
    throw new Error("persisted representative sequence frameCount metadata is invalid");
  }
  if (sequence.framePayloadByteLength !== REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2) {
    throw new Error("persisted representative sequence framePayloadByteLength metadata is invalid");
  }
  if (sequence.payloadByteLength !== REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2) {
    throw new Error("persisted representative sequence payloadByteLength metadata is invalid");
  }
  if (sequence.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2) {
    throw new Error("persisted representative sequence payloadFormat metadata is invalid");
  }
  if (sequence.fixedPointScale !== FIXED_POINT_SCALE_V2) {
    throw new Error("persisted representative sequence fixedPointScale metadata is invalid");
  }
  if (sequence.packingOrder !== REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2) {
    throw new Error("persisted representative sequence packingOrder metadata is invalid");
  }
  if (sequence.uncertaintyModel !== "heuristic_v1") {
    throw new Error("persisted representative sequence uncertaintyModel metadata is invalid");
  }
  return {
    frameCount: PHASE_SAMPLE_COUNT_V2,
    framePayloadByteLength: REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    payloadByteLength: REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
    fixedPointScale: FIXED_POINT_SCALE_V2,
    packingOrder: REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
    uncertaintyModel: "heuristic_v1",
    payload: requireBinaryPayload(
      sequence.payload,
      REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
      "persisted representative sequence",
    ),
  };
}

function validateRepresentativeSequenceRangesV2(
  value: unknown,
): SerializedRepresentativeSequenceV2 {
  const sequence = requireRepresentativeSequenceEnvelopeV2(value);
  for (let phaseIndex = 0; phaseIndex < PHASE_SAMPLE_COUNT_V2; phaseIndex += 1) {
    const offset = phaseIndex * REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2;
    validatePersistedRepresentativeFrameV2({
      phaseIndex,
      uncertaintyModel: "heuristic_v1",
      payload: sequence.payload.slice(offset, offset + REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2),
    });
  }
  return { ...sequence, payload: sequence.payload.slice() };
}

export function reconstructRepresentativeProfileFromSequencePayloadV2(
  value: unknown,
  mode: CaptureProtocolV2,
): RepresentativePose4DV2 {
  if (mode !== "basic_1_plus_1" && mode !== "high_accuracy_3_plus_3") {
    throw new Error("persisted representative sequence mode is invalid");
  }
  const sequence = validateRepresentativeSequenceRangesV2(value);
  const frames = Array.from({ length: PHASE_SAMPLE_COUNT_V2 }, (_, phaseIndex) => {
    const offset = phaseIndex * REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2;
    return reconstructRepresentativeFrameFromPayloadV2({
      phaseIndex,
      uncertaintyModel: "heuristic_v1",
      payload: sequence.payload.slice(offset, offset + REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2),
    });
  });
  const profile = parseRepresentativePose4D({
    schemaVersion: SHOOTING_PROFILE_SCHEMA_VERSION_V2,
    boundary: SHOOTING_PROFILE_BOUNDARY_V2,
    mode,
    timeBasis: SHOOTING_PROFILE_TIME_BASIS_V2,
    units: "template_shoulder_breadths",
    frames,
    phaseAnchors: CANONICAL_PHASE_SUMMARIES_V2.map(({ id, phase }) => ({ id, phase })),
    quality: { passed: true, reasons: [] },
  });
  validateCanonicalProfile(profile);
  return profile;
}

function reconstructRepresentativeFrameFromPayloadV2(
  value: unknown,
): RepresentativePose4DV2["frames"][number] {
  const frame = validatePersistedRepresentativeFrameV2(value);
  return {
    phase: frame.phaseIndex / 100,
    joints: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint, jointIndex) => {
      const offset = jointIndex * 10;
      return [joint, {
        x: unpackFixedPoint(readPackedInt32(frame.payload, offset)),
        y: unpackFixedPoint(readPackedInt32(frame.payload, offset + 1)),
        z: unpackFixedPoint(readPackedInt32(frame.payload, offset + 2)),
      }];
    })) as RepresentativePose4DV2["frames"][number]["joints"],
    uncertainty: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint, jointIndex) => {
      const offset = jointIndex * 10;
      return [joint, {
        model: "heuristic_v1" as const,
        covariance: Array.from({ length: 6 }, (_, covarianceIndex) => (
          unpackFixedPoint(readPackedInt32(frame.payload, offset + 3 + covarianceIndex))
        )) as JointUncertaintyV2["covariance"],
        directionalConeDegrees: unpackFixedPoint(readPackedInt32(frame.payload, offset + 9)),
      }];
    })) as RepresentativePose4DV2["frames"][number]["uncertainty"],
  };
}

export function quantizeShootingProfileNumberV2(
  value: number,
  minimum: number,
  maximum: number,
  name = "value",
): number {
  return quantizeFiniteBounded(value, minimum, maximum, name);
}
