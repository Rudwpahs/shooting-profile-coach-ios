import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Bytes,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-formpath";
const OWNER = "owner-uid-0001";
const INTRUDER = "intruder-uid-0002";
const ID = "profile0001";

const BASIC_ATTEMPTS = ["front-0", "shooting_side-0"];
const HIGH_ATTEMPTS = [
  "front-0",
  "front-1",
  "front-2",
  "shooting_side-0",
  "shooting_side-1",
  "shooting_side-2",
];

type Mode = "basic_1_plus_1" | "high_accuracy_3_plus_3";

let testEnv: RulesTestEnvironment;

function commonV2(recordType: string, ownerUid: string = OWNER) {
  return {
    ownerUid,
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    timeBasis: "normalized_shot_phase",
    dataClass: "owner_private_derived_biomechanics_v2",
    retentionClass: "owner_deleted_v2",
    consentReference: "owner_capture_consent_v2",
    algorithmVersion: "representative_phase_fusion_v1",
    modelVersion: "mediapipe_pose_landmarker_v2",
    recordType,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function observation(
  view: "front" | "shooting_side",
  takeIndex: 0 | 1 | 2,
  overrides: Record<string, unknown> = {},
  ownerUid: string = OWNER,
) {
  return {
    ...commonV2("normalized_observation_v2", ownerUid),
    storageLayout: "phase_sequence_payloads_v1",
    captureSessionId: ID,
    profileId: ID,
    revisionId: ID,
    attemptId: `${view}-${takeIndex}`,
    status: "complete",
    view,
    shootingHand: "right",
    takeIndex,
    frameCount: 101,
    framePayloadByteLength: 144,
    payloadByteLength: 14544,
    payloadFormat: "int32_be_fixed_1e6_v1",
    fixedPointScale: 1000000,
    packingOrder: "phase_major_joint_major_xy_visibility_v1",
    missingVisibilitySentinel: -2147483648,
    payload: Bytes.fromUint8Array(new Uint8Array(14544)),
    ...overrides,
  };
}

function captureSession(mode: Mode, overrides: Record<string, unknown> = {}) {
  return {
    ...commonV2("capture_session_v2"),
    storageLayout: "phase_sequence_payloads_v1",
    captureSessionId: ID,
    profileId: ID,
    revisionId: ID,
    status: "complete",
    mode,
    shootingHand: "right",
    attemptIds: mode === "basic_1_plus_1" ? BASIC_ATTEMPTS : HIGH_ATTEMPTS,
    attemptCount: mode === "basic_1_plus_1" ? 2 : 6,
    ...overrides,
  };
}

function revision(mode: Mode, overrides: Record<string, unknown> = {}) {
  return {
    ...commonV2("representative_revision_v2"),
    storageLayout: "phase_sequence_payloads_v1",
    profileId: ID,
    captureSessionId: ID,
    revisionId: ID,
    status: "complete",
    mode,
    shootingHand: "right",
    confidence: 0.6,
    attemptCount: mode === "basic_1_plus_1" ? 2 : 6,
    frameCount: 101,
    phaseSummaryCount: 5,
    units: "template_shoulder_breadths",
    framePayloadByteLength: 480,
    payloadByteLength: 48480,
    payloadFormat: "int32_be_fixed_1e6_v1",
    fixedPointScale: 1000000,
    packingOrder: "phase_major_joint_major_xyz_covariance6_cone_v1",
    uncertaintyModel: "heuristic_v1",
    payload: Bytes.fromUint8Array(new Uint8Array(48480)),
    quality: { passed: true, reasons: [] },
    ...overrides,
  };
}

function profileHead(mode: Mode, overrides: Record<string, unknown> = {}) {
  return {
    ...commonV2("motion_profile_v2"),
    storageLayout: "phase_sequence_payloads_v1",
    profileId: ID,
    captureSessionId: ID,
    revisionId: ID,
    status: "complete",
    deletionState: "active",
    mode,
    shootingHand: "right",
    confidence: 0.6,
    attemptIds: mode === "basic_1_plus_1" ? BASIC_ATTEMPTS : HIGH_ATTEMPTS,
    attemptCount: mode === "basic_1_plus_1" ? 2 : 6,
    frameCount: 101,
    representativePayloadByteLength: 48480,
    phaseSummaryCount: 5,
    units: "template_shoulder_breadths",
    ...overrides,
  };
}

const observationRef = (db: Firestore, attemptId: string, uid = OWNER) =>
  doc(db, "users", uid, "captureSessions", ID, "observations", attemptId);
const captureRef = (db: Firestore, uid = OWNER) => doc(db, "users", uid, "captureSessions", ID);
const revisionRef = (db: Firestore, uid = OWNER) =>
  doc(db, "users", uid, "motionProfiles", ID, "revisions", ID);
const headRef = (db: Firestore, uid = OWNER) => doc(db, "users", uid, "motionProfiles", ID);
const legacyPoseRef = (db: Firestore, uid = OWNER) => doc(db, "users", uid, "poses", "legacy-1");

function ownerDb() {
  return testEnv.authenticatedContext(OWNER).firestore() as unknown as Firestore;
}
function intruderDb() {
  return testEnv.authenticatedContext(INTRUDER).firestore() as unknown as Firestore;
}
function anonymousDb() {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

/** Publishes observations then the capture session, in the order the rules require. */
async function publishCapture(db: Firestore, mode: Mode) {
  const attempts = mode === "basic_1_plus_1" ? BASIC_ATTEMPTS : HIGH_ATTEMPTS;
  for (const attemptId of attempts) {
    const [view, take] = attemptId.split("-");
    await assertSucceeds(
      setDoc(
        observationRef(db, attemptId),
        observation(view as "front" | "shooting_side", Number(take) as 0 | 1 | 2),
      ),
    );
  }
  await assertSucceeds(setDoc(captureRef(db), captureSession(mode)));
}

async function publishProfile(db: Firestore, mode: Mode) {
  await publishCapture(db, mode);
  await assertSucceeds(setDoc(revisionRef(db), revision(mode)));
  await assertSucceeds(setDoc(headRef(db), profileHead(mode)));
}

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set. Run this suite through `pnpm test:rules`, which starts the Firestore emulator. It must never be skipped or reported as passing without a running emulator.",
    );
  }
  const [host, port] = emulatorHost.split(":");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host,
      port: Number(port),
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("authentication and ownership", () => {
  it("denies an unauthenticated read of a private profile", async () => {
    await assertFails(getDoc(headRef(anonymousDb())));
  });

  it("denies an unauthenticated write to a private observation", async () => {
    await assertFails(setDoc(observationRef(anonymousDb(), "front-0"), observation("front", 0)));
  });

  it("denies another signed-in user reading the owner's profile", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(headRef(context.firestore() as unknown as Firestore), profileHead("basic_1_plus_1"));
    });
    await assertFails(getDoc(headRef(intruderDb())));
  });

  it("denies another signed-in user writing into the owner's path", async () => {
    await assertFails(
      setDoc(observationRef(intruderDb(), "front-0"), observation("front", 0)),
    );
  });

  it("denies a document whose ownerUid does not match the path", async () => {
    await assertFails(
      setDoc(observationRef(ownerDb(), "front-0"), observation("front", 0, {}, INTRUDER)),
    );
  });
});

describe("legacy V1 private poses", () => {
  it("denies a new legacy pose create by the owner", async () => {
    await assertFails(
      setDoc(legacyPoseRef(ownerDb()), {
        sourceLabel: "legacy",
        poseJson: "{}",
        qualityJson: "{}",
        boundary: "monocular_relative_pose_not_metric_3d",
      }),
    );
  });

  it("denies an update to an existing legacy pose", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(legacyPoseRef(context.firestore() as unknown as Firestore), {
        sourceLabel: "stored earlier",
        poseJson: "{}",
        qualityJson: "{}",
        boundary: "monocular_relative_pose_not_metric_3d",
      });
    });
    await assertFails(updateDoc(legacyPoseRef(ownerDb()), { sourceLabel: "changed" }));
  });

  it("allows the owner to read and delete an existing legacy pose", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(legacyPoseRef(context.firestore() as unknown as Firestore), {
        sourceLabel: "stored earlier",
        poseJson: "{}",
        qualityJson: "{}",
        boundary: "monocular_relative_pose_not_metric_3d",
      });
    });
    await assertSucceeds(getDoc(legacyPoseRef(ownerDb())));
    await assertSucceeds(deleteDoc(legacyPoseRef(ownerDb())));
  });

  it("denies another user reading an existing legacy pose", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(legacyPoseRef(context.firestore() as unknown as Firestore), {
        sourceLabel: "stored earlier",
        poseJson: "{}",
        qualityJson: "{}",
        boundary: "monocular_relative_pose_not_metric_3d",
      });
    });
    await assertFails(getDoc(legacyPoseRef(intruderDb())));
  });
});

describe("V2 publication order and payload contract", () => {
  it("allows the full Basic publication in observation → capture → revision → head order", async () => {
    await publishProfile(ownerDb(), "basic_1_plus_1");
  });

  it("allows the full High publication with all six observations", async () => {
    await publishProfile(ownerDb(), "high_accuracy_3_plus_3");
  });

  it("denies a capture session created before its observations exist", async () => {
    await assertFails(setDoc(captureRef(ownerDb()), captureSession("basic_1_plus_1")));
  });

  it("denies a High capture session that only has the two Basic observations", async () => {
    const db = ownerDb();
    for (const attemptId of BASIC_ATTEMPTS) {
      const [view, take] = attemptId.split("-");
      await assertSucceeds(
        setDoc(
          observationRef(db, attemptId),
          observation(view as "front" | "shooting_side", Number(take) as 0 | 1 | 2),
        ),
      );
    }
    await assertFails(setDoc(captureRef(db), captureSession("high_accuracy_3_plus_3")));
  });

  it("denies a Basic capture session when extra High observations are present", async () => {
    const db = ownerDb();
    for (const attemptId of [...BASIC_ATTEMPTS, "front-1"]) {
      const [view, take] = attemptId.split("-");
      await assertSucceeds(
        setDoc(
          observationRef(db, attemptId),
          observation(view as "front" | "shooting_side", Number(take) as 0 | 1 | 2),
        ),
      );
    }
    await assertFails(setDoc(captureRef(db), captureSession("basic_1_plus_1")));
  });

  it("denies a revision created before its capture session exists", async () => {
    await assertFails(setDoc(revisionRef(ownerDb()), revision("basic_1_plus_1")));
  });

  it("denies a profile head published before its revision exists", async () => {
    const db = ownerDb();
    await publishCapture(db, "basic_1_plus_1");
    await assertFails(setDoc(headRef(db), profileHead("basic_1_plus_1")));
  });

  it("denies an observation whose payload is one byte short", async () => {
    await assertFails(
      setDoc(
        observationRef(ownerDb(), "front-0"),
        observation("front", 0, { payload: Bytes.fromUint8Array(new Uint8Array(14543)) }),
      ),
    );
  });

  it("denies an observation whose declared payload length disagrees with the contract", async () => {
    await assertFails(
      setDoc(observationRef(ownerDb(), "front-0"), observation("front", 0, { payloadByteLength: 14543 })),
    );
  });

  it("denies an observation carrying an extra field", async () => {
    await assertFails(
      setDoc(
        observationRef(ownerDb(), "front-0"),
        observation("front", 0, { sourceVideoFileName: "IMG_4821.MOV" }),
      ),
    );
  });

  it("denies an observation whose attemptId does not match its view and take index", async () => {
    await assertFails(
      setDoc(observationRef(ownerDb(), "front-0"), observation("front", 0, { takeIndex: 1 })),
    );
  });

  it("denies an observation written under a mismatching attempt path", async () => {
    await assertFails(
      setDoc(observationRef(ownerDb(), "front-1"), observation("front", 0)),
    );
  });

  it("denies an observation whose chain ids disagree", async () => {
    await assertFails(
      setDoc(observationRef(ownerDb(), "front-0"), observation("front", 0, { revisionId: "other-id" })),
    );
  });

  it("denies a capture session with the wrong attempt count", async () => {
    const db = ownerDb();
    for (const attemptId of BASIC_ATTEMPTS) {
      const [view, take] = attemptId.split("-");
      await assertSucceeds(
        setDoc(
          observationRef(db, attemptId),
          observation(view as "front" | "shooting_side", Number(take) as 0 | 1 | 2),
        ),
      );
    }
    await assertFails(setDoc(captureRef(db), captureSession("basic_1_plus_1", { attemptCount: 6 })));
  });

  it("denies a Basic revision whose confidence exceeds the 0.65 cap", async () => {
    const db = ownerDb();
    await publishCapture(db, "basic_1_plus_1");
    await assertFails(setDoc(revisionRef(db), revision("basic_1_plus_1", { confidence: 0.66 })));
  });

  it("denies a revision whose representative payload length is wrong", async () => {
    const db = ownerDb();
    await publishCapture(db, "basic_1_plus_1");
    await assertFails(
      setDoc(
        revisionRef(db),
        revision("basic_1_plus_1", { payload: Bytes.fromUint8Array(new Uint8Array(48479)) }),
      ),
    );
  });

  it("denies a head whose representative payload length disagrees with its revision", async () => {
    const db = ownerDb();
    await publishCapture(db, "basic_1_plus_1");
    await assertSucceeds(setDoc(revisionRef(db), revision("basic_1_plus_1")));
    await assertFails(
      setDoc(headRef(db), profileHead("basic_1_plus_1", { representativePayloadByteLength: 14544 })),
    );
  });

  it("denies a published record being mutated afterwards", async () => {
    const db = ownerDb();
    await publishProfile(db, "basic_1_plus_1");
    await assertFails(updateDoc(revisionRef(db), { confidence: 0.1 }));
    await assertFails(updateDoc(captureRef(db), { status: "draft" }));
  });
});

describe("owner deletion flow", () => {
  it("denies subordinate deletion while the profile head is still active", async () => {
    const db = ownerDb();
    await publishProfile(db, "basic_1_plus_1");
    await assertFails(deleteDoc(revisionRef(db)));
    await assertFails(deleteDoc(headRef(db)));
  });

  it("allows the resumable deletion sequence once the head is in progress", async () => {
    const db = ownerDb();
    await publishProfile(db, "basic_1_plus_1");

    await assertSucceeds(
      updateDoc(headRef(db), { deletionState: "in_progress", updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(deleteDoc(revisionRef(db)));
    await assertSucceeds(deleteDoc(captureRef(db)));
    for (const attemptId of BASIC_ATTEMPTS) {
      await assertSucceeds(deleteDoc(observationRef(db, attemptId)));
    }
    await assertSucceeds(deleteDoc(headRef(db)));

    let headStillExists = true;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(headRef(context.firestore() as unknown as Firestore));
      headStillExists = snapshot.exists();
    });
    expect(headStillExists).toBe(false);
  });

  it("denies a deletion transition that changes more than the deletion state", async () => {
    const db = ownerDb();
    await publishProfile(db, "basic_1_plus_1");
    await assertFails(
      updateDoc(headRef(db), {
        deletionState: "in_progress",
        updatedAt: serverTimestamp(),
        confidence: 0.1,
      }),
    );
  });

  it("denies another user driving the owner's deletion flow", async () => {
    await publishProfile(ownerDb(), "basic_1_plus_1");
    await assertFails(
      updateDoc(headRef(intruderDb()), { deletionState: "in_progress", updatedAt: serverTimestamp() }),
    );
    await assertFails(deleteDoc(revisionRef(intruderDb())));
  });
});
