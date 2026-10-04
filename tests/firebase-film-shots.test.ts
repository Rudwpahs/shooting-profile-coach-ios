import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import {
  FILM_SHOT_STALE_UPLOAD_MS_V1,
  FilmShotCloudNotDeployedError,
  eraseEveryCloudFilmShotV1,
  isFilmShotCloudNotDeployedError,
  isFilmShotListingNotDeployedV1,
  isFilmShotObjectAlreadyAbsentV1,
} from "@/lib/firebase-film-shot-deletion";
import {
  deleteCloudFilmShotV1,
  downloadCloudFilmShotV1,
  listCloudFilmShotsV1,
  resumePendingCloudFilmShotDeletionsV1,
  uploadFilmShotV1,
  type FilmShotCloudPortsV1,
} from "@/lib/firebase-film-shots";

/**
 * The cloud orchestration for one owner's film shots, against fake ports that
 * refuse what the rules refuse. The head is the journal: it is written first,
 * as `uploading`, so a document names every object an upload may create; then
 * objects, then clip documents, then the completion. Every failure runs the
 * deletion, which is the mirror image and resumable. No Firebase here.
 */

const UID = "owner-uid-0001";
const SHOT = "film-shot-abc123-1";
const HEAD = `users/${UID}/filmShots/${SHOT}`;
const NOW = 1_700_000_000_000;
const clip = (slotId: string, uri: string): LocalFilmClipRefV1 => {
  const [view, take] = slotId.split("-") as ["front" | "shooting_side", string];
  return { slotId, view, takeIndex: Number(take), uri, durationMs: 4433, width: 1080, height: 1920 };
};
const blob = (tag: string, type = "video/mp4") => new Blob([tag.repeat(64)], { type });
const at = (millis: number) => ({ toMillis: () => millis, toDate: () => new Date(millis) });

type FakeCloud = {
  objects: Map<string, { blob: Blob; contentType: string }>;
  documents: Map<string, Record<string, unknown>>;
  calls: string[];
  failures: { uploadObjectAt?: number; setDocumentPath?: string; updateDocument?: boolean; deleteObjectPath?: string; listThrows?: unknown };
  ports: FilmShotCloudPortsV1;
};

const isHeadPath = (path: string) => /^users\/[^/]+\/filmShots\/[^/]+$/.test(path);
const headPathOf = (clipPath: string) => clipPath.replace(/\/clips\/[^/]+$/, "");

function fakeCloud(): FakeCloud {
  const objects = new Map<string, { blob: Blob; contentType: string }>();
  const documents = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const failures: FakeCloud["failures"] = {};
  let uploads = 0;
  // Capture the clock at write time; a lazy read would give every document the same "now" when listed.
  const stamp = () => at(NOW + calls.length);
  const materialize = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "__server_timestamp__" ? stamp() : value]));
  const ports: FilmShotCloudPortsV1 = {
    serverTimestamp: () => "__server_timestamp__",
    uploadObject: async (storagePath, data, contentType) => {
      calls.push(`upload ${storagePath}`);
      uploads += 1;
      if (failures.uploadObjectAt === uploads) throw new Error("upload failed");
      // Objects are write-once.
      if (objects.has(storagePath)) throw new Error("object exists");
      objects.set(storagePath, { blob: data, contentType });
    },
    deleteObject: async (storagePath) => {
      calls.push(`deleteObject ${storagePath}`);
      if (failures.deleteObjectPath === storagePath) throw new Error("delete object failed");
      objects.delete(storagePath);
    },
    downloadObject: async (storagePath) => {
      calls.push(`download ${storagePath}`);
      const entry = objects.get(storagePath);
      if (!entry) throw new Error("object missing");
      return entry.blob;
    },
    setDocument: async (path, data) => {
      calls.push(`set ${path}`);
      if (failures.setDocumentPath === path) throw new Error("set failed");
      if (isHeadPath(path)) {
        // The rules only let a head be created, and only as an upload in progress.
        if (documents.has(path)) throw new Error("rules: a head cannot be overwritten");
        if (data.status !== "uploading" || data.deletionState !== "active") throw new Error("rules: a head is created as uploading");
      } else {
        const head = documents.get(headPathOf(path));
        const slotId = path.split("/").at(-1)!;
        if (!head || head.status !== "uploading" || head.deletionState !== "active" || !(head.clipIds as string[]).includes(slotId)) {
          throw new Error("rules: a clip document needs an uploading head that names it");
        }
      }
      documents.set(path, materialize(data));
    },
    updateDocument: async (path, data) => {
      calls.push(`update ${path}`);
      if (failures.updateDocument) throw new Error("update failed");
      const current = documents.get(path);
      if (!current) throw new Error("missing document");
      documents.set(path, { ...current, ...materialize(data) });
    },
    deleteDocument: async (path) => {
      calls.push(`deleteDoc ${path}`);
      if (isHeadPath(path)) {
        const head = documents.get(path);
        if (head && head.deletionState !== "in_progress") throw new Error("rules: a head is deleted only while its deletion is in progress");
        if ([...documents.keys()].some((key) => key.startsWith(`${path}/clips/`))) throw new Error("rules: a head is deleted after its clip documents");
      } else if (documents.get(headPathOf(path))?.deletionState !== "in_progress") {
        throw new Error("rules: a clip document is deleted only while its head's deletion is in progress");
      }
      documents.delete(path);
    },
    readDocumentFromServer: async (path) => {
      calls.push(`read ${path}`);
      const data = documents.get(path);
      return data ? { id: path.split("/").at(-1)!, data } : null;
    },
    listDocuments: async (collectionPath) => {
      calls.push(`list ${collectionPath}`);
      if (failures.listThrows) throw failures.listThrows;
      const prefix = `${collectionPath}/`;
      return [...documents.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        .map(([path, data]) => ({ id: path.slice(prefix.length), data }));
    },
  };
  return { objects, documents, calls, failures, ports };
}

const shot = { id: SHOT, title: "내 슛폼 1", clips: [clip("front-0", "blob:front"), clip("shooting_side-0", "blob:side")] };
const files = { "front-0": blob("front"), "shooting_side-0": blob("side", "video/quicktime") };
const writes = (cloud: FakeCloud) => cloud.calls.filter((call) => !call.startsWith("read ") && !call.startsWith("list "));

/** A head as an earlier session may have left it, written around the fake's create rule. */
function leaveHead(cloud: FakeCloud, shotId: string, overrides: Record<string, unknown> = {}) {
  cloud.documents.set(`users/${UID}/filmShots/${shotId}`, {
    ownerUid: UID,
    schemaVersion: 1,
    recordType: "film_shot_head_v1",
    boundary: "owner_footage_only_no_pose_analysis_v1",
    dataClass: "owner_private_raw_footage_v1",
    retentionClass: "owner_deleted_v1",
    consentReference: "owner_cloud_footage_consent_v1",
    createdAt: at(NOW),
    updatedAt: at(NOW),
    status: "uploading",
    deletionState: "active",
    shotId,
    title: "내 슛폼 1",
    clipIds: ["front-0", "shooting_side-0"],
    clipCount: 2,
    ...overrides,
  });
}

describe("cloud film shot upload", () => {
  it("writes the head as uploading first, then objects, then clip documents, then completes the head", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    expect(writes(cloud)).toEqual([
      `set ${HEAD}`,
      `upload ${HEAD}/front-0`,
      `upload ${HEAD}/shooting_side-0`,
      `set ${HEAD}/clips/front-0`,
      `set ${HEAD}/clips/shooting_side-0`,
      `update ${HEAD}`,
    ]);
    expect(cloud.objects.get(`${HEAD}/shooting_side-0`)?.contentType).toBe("video/quicktime");
    const side = cloud.documents.get(`${HEAD}/clips/shooting_side-0`)!;
    expect(side.byteLength).toBe(files["shooting_side-0"].size);
    expect(side.contentType).toBe("video/quicktime");
    expect(side.storagePath).toBe(`${HEAD}/shooting_side-0`);
    expect(cloud.documents.get(HEAD)).toMatchObject({ title: "내 슛폼 1", clipIds: ["front-0", "shooting_side-0"], clipCount: 2, status: "complete", deletionState: "active" });
    expect(JSON.stringify([...cloud.documents.values()])).not.toMatch(/blob:|\.mp4|IMG_/);
  });

  it("refuses a shot without a file for every clip or with a non-local clip, writing nothing", async () => {
    const cloud = fakeCloud();
    await expect(uploadFilmShotV1({ uid: UID, shot, files: { "front-0": blob("front") }, ports: cloud.ports })).rejects.toThrow();
    await expect(uploadFilmShotV1({ uid: UID, shot: { ...shot, clips: [clip("front-0", "https://example.com/a.mp4")] }, files, ports: cloud.ports })).rejects.toThrow();
    expect(cloud.calls).toEqual([]);
  });

  it("removes everything it wrote, the head included, when an object upload fails", async () => {
    const cloud = fakeCloud();
    cloud.failures.uploadObjectAt = 2;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports })).rejects.toThrow("upload failed");
    expect(cloud.objects.size).toBe(0);
    expect(cloud.documents.size).toBe(0);
  });

  it("removes objects, clip documents and the head when a clip document write fails", async () => {
    const cloud = fakeCloud();
    cloud.failures.setDocumentPath = `${HEAD}/clips/shooting_side-0`;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports })).rejects.toThrow("set failed");
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
  });

  it("treats a completion that was actually persisted as kept, and otherwise removes everything", async () => {
    const persisted = fakeCloud();
    const originalUpdate = persisted.ports.updateDocument;
    persisted.ports = {
      ...persisted.ports,
      updateDocument: async (path, data) => {
        await originalUpdate(path, data);
        // The completion "failed" from the client's view but the head is complete: the read-back proves it.
        if (data.status === "complete") throw new Error("ack lost");
      },
    };
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: persisted.ports })).resolves.toBeUndefined();
    expect(persisted.documents.get(HEAD)?.status).toBe("complete");
    expect(persisted.objects.size).toBe(2);

    const lost = fakeCloud();
    const lostUpdate = lost.ports.updateDocument;
    lost.ports = {
      ...lost.ports,
      updateDocument: async (path, data) => {
        if (data.status === "complete") throw new Error("completion failed");
        return lostUpdate(path, data);
      },
    };
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: lost.ports })).rejects.toThrow("completion failed");
    expect(lost.documents.size).toBe(0);
    expect(lost.objects.size).toBe(0);
  });

  it("leaves the head behind as the journal when the cleanup itself fails, so a later pass finishes it", async () => {
    const cloud = fakeCloud();
    cloud.failures.uploadObjectAt = 2;
    cloud.failures.deleteObjectPath = `${HEAD}/front-0`;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports })).rejects.toThrow("upload failed");
    // The footage is still there, and so is the document that names it.
    expect(cloud.objects.has(`${HEAD}/front-0`)).toBe(true);
    expect(cloud.documents.get(HEAD)?.deletionState).toBe("in_progress");
    cloud.failures.deleteObjectPath = undefined;
    await resumePendingCloudFilmShotDeletionsV1({ uid: UID, ports: cloud.ports, now: () => NOW });
    expect(cloud.objects.size).toBe(0);
    expect(cloud.documents.size).toBe(0);
  });

  it("is a no-op for a shot that is already kept, and starts clean over a leftover journal", async () => {
    const kept = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: kept.ports });
    kept.calls.length = 0;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: kept.ports })).resolves.toBeUndefined();
    expect(writes(kept)).toEqual([]);

    const leftover = fakeCloud();
    leaveHead(leftover, SHOT);
    leftover.objects.set(`${HEAD}/front-0`, { blob: blob("stale"), contentType: "video/mp4" });
    await uploadFilmShotV1({ uid: UID, shot, files, ports: leftover.ports });
    expect(leftover.documents.get(HEAD)?.status).toBe("complete");
    expect(await leftover.objects.get(`${HEAD}/front-0`)!.blob.text()).toBe("front".repeat(64));
  });
});

describe("cloud film shot list, download and delete", () => {
  it("lists kept shots newest first and drops malformed, unfinished and in-progress ones", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    await uploadFilmShotV1({ uid: UID, shot: { ...shot, id: "film-shot-def456-2", title: "내 슛폼 2" }, files, ports: cloud.ports });
    cloud.documents.set(`users/${UID}/filmShots/broken`, { recordType: "film_shot_head_v1", title: "x" });
    leaveHead(cloud, "film-shot-ghi789-3", { status: "complete", deletionState: "in_progress" });
    leaveHead(cloud, "film-shot-jkl012-4", { status: "uploading" });
    const listed = await listCloudFilmShotsV1({ uid: UID, ports: cloud.ports });
    expect(listed.map((entry) => entry.shotId)).toEqual(["film-shot-def456-2", SHOT]);
    expect(listed[0]).toMatchObject({ title: "내 슛폼 2", clipIds: ["front-0", "shooting_side-0"] });
    expect(typeof listed[0].createdAtMs).toBe("number");
  });

  it("downloads a kept shot's clips with their files, validated against the documents, and refuses any other state", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    const downloaded = await downloadCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports });
    expect(downloaded.title).toBe("내 슛폼 1");
    expect(downloaded.clips.map((entry) => [entry.slotId, entry.view, entry.takeIndex, entry.durationMs, entry.width, entry.height])).toEqual([
      ["front-0", "front", 0, 4433, 1080, 1920],
      ["shooting_side-0", "shooting_side", 0, 4433, 1080, 1920],
    ]);
    expect(downloaded.clips.every((entry) => entry.blob instanceof Blob)).toBe(true);
    expect(downloaded.clips[1].blob.type).toBe("video/quicktime");
    expect(await downloadCloudFilmShotV1({ uid: UID, shotId: "film-shot-missing-9", ports: cloud.ports }).catch((error: Error) => error.message)).toMatch(/not found|missing/i);
    leaveHead(cloud, "film-shot-jkl012-4", { status: "uploading" });
    await expect(downloadCloudFilmShotV1({ uid: UID, shotId: "film-shot-jkl012-4", ports: cloud.ports })).rejects.toThrow();
    await cloud.ports.updateDocument(HEAD, { deletionState: "in_progress", updatedAt: "__server_timestamp__" });
    await expect(downloadCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).rejects.toThrow();
  });

  it("deletes in order (transition, objects, clip documents, head) and tolerates an already-missing head", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    cloud.calls.length = 0;
    await deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports });
    const order = writes(cloud);
    expect(order[0]).toBe(`update ${HEAD}`);
    expect(order.indexOf(`deleteObject ${HEAD}/front-0`)).toBeLessThan(order.indexOf(`deleteDoc ${HEAD}/clips/front-0`));
    expect(order.at(-1)).toBe(`deleteDoc ${HEAD}`);
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
    await expect(deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).resolves.toBeUndefined();
  });

  it("deletes the objects an unfinished upload left even though no clip document names them", async () => {
    const cloud = fakeCloud();
    leaveHead(cloud, SHOT);
    cloud.objects.set(`${HEAD}/front-0`, { blob: blob("front"), contentType: "video/mp4" });
    cloud.objects.set(`${HEAD}/shooting_side-0`, { blob: blob("side"), contentType: "video/mp4" });
    await deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports });
    expect(cloud.objects.size).toBe(0);
    expect(cloud.documents.size).toBe(0);
  });

  it("stops before the head when an object delete fails, and resume finishes an in-progress deletion later", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    cloud.failures.deleteObjectPath = `${HEAD}/shooting_side-0`;
    await expect(deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).rejects.toThrow("delete object failed");
    expect(cloud.documents.get(HEAD)?.deletionState).toBe("in_progress");
    expect(cloud.documents.has(`${HEAD}/clips/shooting_side-0`)).toBe(true);
    cloud.failures.deleteObjectPath = undefined;
    const resumed = vi.fn();
    await resumePendingCloudFilmShotDeletionsV1({ uid: UID, ports: cloud.ports, onDeleted: resumed, now: () => NOW });
    expect(resumed).toHaveBeenCalledWith(SHOT);
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
  });

  it("resume also removes an upload that went stale, and leaves a recent one alone", async () => {
    const cloud = fakeCloud();
    leaveHead(cloud, "film-shot-stale-5", { updatedAt: at(NOW - FILM_SHOT_STALE_UPLOAD_MS_V1 - 1) });
    cloud.objects.set(`users/${UID}/filmShots/film-shot-stale-5/front-0`, { blob: blob("stale"), contentType: "video/mp4" });
    leaveHead(cloud, "film-shot-fresh-6", { updatedAt: at(NOW - 60_000) });
    cloud.objects.set(`users/${UID}/filmShots/film-shot-fresh-6/front-0`, { blob: blob("fresh"), contentType: "video/mp4" });
    await resumePendingCloudFilmShotDeletionsV1({ uid: UID, ports: cloud.ports, now: () => NOW });
    expect([...cloud.documents.keys()]).toEqual([`users/${UID}/filmShots/film-shot-fresh-6`]);
    expect([...cloud.objects.keys()]).toEqual([`users/${UID}/filmShots/film-shot-fresh-6/front-0`]);
    expect(FILM_SHOT_STALE_UPLOAD_MS_V1).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});

describe("erasing every cloud film shot (account deletion)", () => {
  it("removes every shot whatever its state or age, objects included", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    leaveHead(cloud, "film-shot-fresh-6", { updatedAt: at(NOW) });
    cloud.objects.set(`users/${UID}/filmShots/film-shot-fresh-6/shooting_side-0`, { blob: blob("fresh"), contentType: "video/mp4" });
    leaveHead(cloud, "film-shot-ghi789-3", { status: "complete", deletionState: "in_progress" });
    await eraseEveryCloudFilmShotV1({ uid: UID, ports: cloud.ports });
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
  });

  it("treats a backend where the feature was never deployed as nothing to erase, and touches nothing else", async () => {
    const cloud = fakeCloud();
    cloud.failures.listThrows = new FilmShotCloudNotDeployedError();
    await expect(eraseEveryCloudFilmShotV1({ uid: UID, ports: cloud.ports })).resolves.toBeUndefined();
    expect(cloud.calls).toEqual([`list users/${UID}/filmShots`]);
  });

  it("aborts on any other failure, so the account is never removed with footage left behind", async () => {
    const offline = fakeCloud();
    offline.failures.listThrows = new Error("offline");
    await expect(eraseEveryCloudFilmShotV1({ uid: UID, ports: offline.ports })).rejects.toThrow("offline");

    const stuck = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: stuck.ports });
    stuck.failures.deleteObjectPath = `${HEAD}/front-0`;
    await expect(eraseEveryCloudFilmShotV1({ uid: UID, ports: stuck.ports })).rejects.toThrow("delete object failed");
    expect(stuck.documents.has(HEAD)).toBe(true);
  });

  it("reads backend refusals narrowly: only a missing object or bucket is already erased, only a refused owner listing is not deployed", () => {
    expect(isFilmShotObjectAlreadyAbsentV1({ code: "storage/object-not-found" })).toBe(true);
    expect(isFilmShotObjectAlreadyAbsentV1({ code: "storage/bucket-not-found" })).toBe(true);
    // A refusal or an outage is not an absence: the footage may still be there, so the deletion must stop.
    expect(isFilmShotObjectAlreadyAbsentV1({ code: "storage/unauthorized" })).toBe(false);
    expect(isFilmShotObjectAlreadyAbsentV1({ code: "storage/retry-limit-exceeded" })).toBe(false);
    expect(isFilmShotObjectAlreadyAbsentV1(new Error("offline"))).toBe(false);
    expect(isFilmShotListingNotDeployedV1({ code: "permission-denied" })).toBe(true);
    expect(isFilmShotListingNotDeployedV1({ code: "unavailable" })).toBe(false);
    expect(isFilmShotListingNotDeployedV1(new Error("offline"))).toBe(false);
    expect(isFilmShotCloudNotDeployedError(new FilmShotCloudNotDeployedError())).toBe(true);
    expect(isFilmShotCloudNotDeployedError({ code: "permission-denied" })).toBe(false);
  });

  it("lives in a delete-only module: it can remove footage but has no way to send or fetch it", () => {
    const source = readFileSync("lib/firebase-film-shot-deletion.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source).not.toMatch(/uploadBytes|uploadString|uploadBytesResumable|getBytes|getBlob|getDownloadURL|setDoc|\.set\(|addDoc/);
    expect(source).not.toMatch(/from "@\/lib\/firebase-film-shots"|from "@\/lib\/film-shot-cloud-source"|from "@\/lib\/firebase-film-shot-cloud-source"/);
    // Account deletion uses it in every build, whatever the cloud flag says.
    const accountDeletion = readFileSync("lib/firebase-account-deletion.ts", "utf8");
    expect(accountDeletion).toContain('from "@/lib/firebase-film-shot-deletion"');
    expect(accountDeletion).toContain("eraseEveryCloudFilmShotV1(");
    expect(accountDeletion).not.toMatch(/EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1|firebase-film-shots"/);
  });
});
