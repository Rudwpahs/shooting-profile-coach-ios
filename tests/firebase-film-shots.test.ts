import { describe, expect, it, vi } from "vitest";

import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import {
  deleteCloudFilmShotV1,
  downloadCloudFilmShotV1,
  listCloudFilmShotsV1,
  resumePendingCloudFilmShotDeletionsV1,
  uploadFilmShotV1,
  type FilmShotCloudPortsV1,
} from "@/lib/firebase-film-shots";

/**
 * The cloud orchestration for one owner's film shots, against fake ports:
 * objects first, then clip documents, then the head; every failure cleans up
 * what it knows it wrote; reads validate and fail closed; deletion is the
 * mirror image and resumable. No Firebase here.
 */

const UID = "owner-uid-0001";
const SHOT = "film-shot-abc123-1";
const clip = (slotId: string, uri: string): LocalFilmClipRefV1 => {
  const [view, take] = slotId.split("-") as ["front" | "shooting_side", string];
  return { slotId, view, takeIndex: Number(take), uri, durationMs: 4433, width: 1080, height: 1920 };
};
const blob = (tag: string, type = "video/mp4") => new Blob([tag.repeat(64)], { type });

type FakeCloud = {
  objects: Map<string, { blob: Blob; contentType: string }>;
  documents: Map<string, Record<string, unknown>>;
  calls: string[];
  failures: { uploadObjectAt?: number; setDocumentPath?: string; updateDocument?: boolean; deleteObjectPath?: string; readHeadThrows?: boolean };
  ports: FilmShotCloudPortsV1;
};

function fakeCloud(): FakeCloud {
  const objects = new Map<string, { blob: Blob; contentType: string }>();
  const documents = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const failures: FakeCloud["failures"] = {};
  let uploads = 0;
  // Capture the clock at write time; a lazy read would give every document the same "now" when listed.
  const stamp = () => { const at = 1_700_000_000_000 + calls.length; return { toMillis: () => at, toDate: () => new Date(at) }; };
  const materialize = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "__server_timestamp__" ? stamp() : value]));
  const ports: FilmShotCloudPortsV1 = {
    serverTimestamp: () => "__server_timestamp__",
    uploadObject: async (storagePath, data, contentType) => {
      calls.push(`upload ${storagePath}`);
      uploads += 1;
      if (failures.uploadObjectAt === uploads) throw new Error("upload failed");
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
      documents.delete(path);
    },
    readDocumentFromServer: async (path) => {
      calls.push(`read ${path}`);
      if (failures.readHeadThrows && path === `users/${UID}/filmShots/${SHOT}`) throw new Error("offline");
      const data = documents.get(path);
      return data ? { id: path.split("/").at(-1)!, data } : null;
    },
    listDocuments: async (collectionPath) => {
      calls.push(`list ${collectionPath}`);
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

describe("cloud film shot upload", () => {
  it("writes objects, then clip documents, then the head, in canonical order and with the file sizes and types", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    expect(cloud.calls).toEqual([
      `upload users/${UID}/filmShots/${SHOT}/front-0`,
      `upload users/${UID}/filmShots/${SHOT}/shooting_side-0`,
      `set users/${UID}/filmShots/${SHOT}/clips/front-0`,
      `set users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`,
      `set users/${UID}/filmShots/${SHOT}`,
    ]);
    expect(cloud.objects.get(`users/${UID}/filmShots/${SHOT}/shooting_side-0`)?.contentType).toBe("video/quicktime");
    const side = cloud.documents.get(`users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`)!;
    expect(side.byteLength).toBe(files["shooting_side-0"].size);
    expect(side.contentType).toBe("video/quicktime");
    expect(side.storagePath).toBe(`users/${UID}/filmShots/${SHOT}/shooting_side-0`);
    const head = cloud.documents.get(`users/${UID}/filmShots/${SHOT}`)!;
    expect(head).toMatchObject({ title: "내 슛폼 1", clipIds: ["front-0", "shooting_side-0"], clipCount: 2, deletionState: "active" });
    expect(JSON.stringify([...cloud.documents.values()])).not.toMatch(/blob:|\.mp4|IMG_/);
  });

  it("refuses a shot without a file for every clip or with a non-local clip, writing nothing", async () => {
    const cloud = fakeCloud();
    await expect(uploadFilmShotV1({ uid: UID, shot, files: { "front-0": blob("front") }, ports: cloud.ports })).rejects.toThrow();
    await expect(uploadFilmShotV1({ uid: UID, shot: { ...shot, clips: [clip("front-0", "https://example.com/a.mp4")] }, files, ports: cloud.ports })).rejects.toThrow();
    expect(cloud.calls).toEqual([]);
  });

  it("cleans up the uploaded objects when a later object upload fails, and writes no documents", async () => {
    const cloud = fakeCloud();
    cloud.failures.uploadObjectAt = 2;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports })).rejects.toThrow("upload failed");
    expect(cloud.calls.filter((call) => call.startsWith("set "))).toEqual([]);
    expect(cloud.calls).toContain(`deleteObject users/${UID}/filmShots/${SHOT}/front-0`);
    expect(cloud.objects.size).toBe(0);
  });

  it("cleans up objects and the clip documents it wrote when a clip document write fails", async () => {
    const cloud = fakeCloud();
    cloud.failures.setDocumentPath = `users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports })).rejects.toThrow("set failed");
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
    expect(cloud.calls).toContain(`deleteDoc users/${UID}/filmShots/${SHOT}/clips/front-0`);
  });

  it("treats a head write that was actually persisted as success, and otherwise cleans everything up", async () => {
    const persisted = fakeCloud();
    persisted.failures.setDocumentPath = `users/${UID}/filmShots/${SHOT}`;
    // The write "failed" from the client's view but the head is there: the read-back proves the publication.
    const originalSet = persisted.ports.setDocument;
    persisted.ports = {
      ...persisted.ports,
      setDocument: async (path, data) => {
        if (path === `users/${UID}/filmShots/${SHOT}`) {
          persisted.documents.set(path, { ...data, createdAt: { toMillis: () => 1, toDate: () => new Date(1) }, updatedAt: { toMillis: () => 1, toDate: () => new Date(1) } });
          throw new Error("ack lost");
        }
        return originalSet(path, data);
      },
    };
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: persisted.ports })).resolves.toBeUndefined();
    expect(persisted.documents.has(`users/${UID}/filmShots/${SHOT}`)).toBe(true);

    const lost = fakeCloud();
    lost.failures.setDocumentPath = `users/${UID}/filmShots/${SHOT}`;
    await expect(uploadFilmShotV1({ uid: UID, shot, files, ports: lost.ports })).rejects.toThrow("set failed");
    expect(lost.documents.size).toBe(0);
    expect(lost.objects.size).toBe(0);
  });
});

describe("cloud film shot list, download and delete", () => {
  it("lists active heads newest first and drops malformed or in-progress ones", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    await uploadFilmShotV1({ uid: UID, shot: { ...shot, id: "film-shot-def456-2", title: "내 슛폼 2" }, files, ports: cloud.ports });
    cloud.documents.set(`users/${UID}/filmShots/broken`, { recordType: "film_shot_head_v1", title: "x" });
    cloud.documents.set(`users/${UID}/filmShots/film-shot-ghi789-3`, { ...cloud.documents.get(`users/${UID}/filmShots/${SHOT}`)!, shotId: "film-shot-ghi789-3", deletionState: "in_progress" });
    const listed = await listCloudFilmShotsV1({ uid: UID, ports: cloud.ports });
    expect(listed.map((entry) => entry.shotId)).toEqual(["film-shot-def456-2", SHOT]);
    expect(listed[0]).toMatchObject({ title: "내 슛폼 2", clipIds: ["front-0", "shooting_side-0"] });
    expect(typeof listed[0].createdAtMs).toBe("number");
  });

  it("downloads a shot's clips with their files, validated against the documents, and refuses a shot being deleted", async () => {
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
    await cloud.ports.updateDocument(`users/${UID}/filmShots/${SHOT}`, { deletionState: "in_progress", updatedAt: "__server_timestamp__" });
    await expect(downloadCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).rejects.toThrow();
  });

  it("deletes in order (transition, objects, clip documents, head) and tolerates an already-missing head", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    cloud.calls.length = 0;
    await deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports });
    const order = cloud.calls.filter((call) => !call.startsWith("read "));
    expect(order[0]).toBe(`update users/${UID}/filmShots/${SHOT}`);
    expect(order.indexOf(`deleteObject users/${UID}/filmShots/${SHOT}/front-0`)).toBeLessThan(order.indexOf(`deleteDoc users/${UID}/filmShots/${SHOT}/clips/front-0`));
    expect(order.at(-1)).toBe(`deleteDoc users/${UID}/filmShots/${SHOT}`);
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
    await expect(deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).resolves.toBeUndefined();
  });

  it("stops before the head when an object delete fails, and resume finishes an in-progress deletion later", async () => {
    const cloud = fakeCloud();
    await uploadFilmShotV1({ uid: UID, shot, files, ports: cloud.ports });
    cloud.failures.deleteObjectPath = `users/${UID}/filmShots/${SHOT}/shooting_side-0`;
    await expect(deleteCloudFilmShotV1({ uid: UID, shotId: SHOT, ports: cloud.ports })).rejects.toThrow("delete object failed");
    expect(cloud.documents.get(`users/${UID}/filmShots/${SHOT}`)?.deletionState).toBe("in_progress");
    expect(cloud.documents.has(`users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`)).toBe(true);
    cloud.failures.deleteObjectPath = undefined;
    const resumed = vi.fn();
    await resumePendingCloudFilmShotDeletionsV1({ uid: UID, ports: cloud.ports, onDeleted: resumed });
    expect(resumed).toHaveBeenCalledWith(SHOT);
    expect(cloud.documents.size).toBe(0);
    expect(cloud.objects.size).toBe(0);
  });
});
