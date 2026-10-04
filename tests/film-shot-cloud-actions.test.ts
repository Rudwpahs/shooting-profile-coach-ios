import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilmShotCloudSource } from "@/lib/film-shot-cloud-source";

/**
 * What the Profile does with a film shot and the owner's cloud space: keep a
 * device shot there, bring a cloud shot back to this device, and delete.
 * Deleting a shot removes its cloud copy first, so "삭제하면 함께 지워집니다"
 * holds even when the second half fails.
 */

const memory = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value); },
    removeItem: async (key: string) => { memory.delete(key); },
  },
}));

const { createMemoryFilmShotMedia } = await import("@/lib/film-space/film-shot-media");
const { listFilmShots, saveFilmShot } = await import("@/lib/film-space/film-shots");
const { readFilmShotCloudState, markFilmShotUploaded } = await import("@/lib/film-space/film-shot-cloud-state");
const {
  deleteFilmShotEverywhere,
  deleteFilmShotFromCloudOnly,
  downloadCloudFilmShotToDevice,
  keepFilmShotInCloud,
  listCloudFilmShotsForOwner,
  mergeFilmShotTiles,
} = await import("@/lib/film-space/film-shot-cloud-actions");

const user = { uid: "owner-uid-0001" } as unknown as User;
const blob = (tag: string) => new Blob([tag.repeat(32)], { type: "video/mp4" });
const clip = (slotId: string, uri: string, data?: Blob) => {
  const [view, take] = slotId.split("-") as ["front" | "shooting_side", string];
  return { slotId, view, takeIndex: Number(take), uri, durationMs: 4433, width: 1080, height: 1920, ...(data ? { blob: data } : {}) };
};

function fakeSource(overrides: Partial<FilmShotCloudSource> = {}): FilmShotCloudSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    available: true,
    upload: async (_user, shot) => { calls.push(`upload ${shot.id}`); },
    list: async () => { calls.push("list"); return []; },
    download: async (_user, shotId) => {
      calls.push(`download ${shotId}`);
      return { shotId, title: "내 슛폼 7", clips: [{ slotId: "front-0", view: "front" as const, takeIndex: 0, durationMs: 4433, width: 1080, height: 1920, blob: blob("front") }] };
    },
    remove: async (_user, shotId) => { calls.push(`remove ${shotId}`); },
    resumePendingDeletions: async () => { calls.push("resume"); },
    ...overrides,
  };
}

beforeEach(() => memory.clear());

describe("keeping a device film shot in the cloud", () => {
  it("sends the shot's own files and then notes on this device that it is kept", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front")), clip("shooting_side-0", "blob:side", blob("side"))] }, { media });
    const upload = vi.fn(async () => undefined);
    await keepFilmShotInCloud(user, shot, { source: fakeSource({ upload }), media });
    expect(upload).toHaveBeenCalledTimes(1);
    const [, sent, files] = upload.mock.calls[0] as unknown as [User, { id: string; title: string }, Record<string, Blob>];
    expect(sent).toMatchObject({ id: shot.id, title: shot.title });
    expect(Object.keys(files).sort()).toEqual(["front-0", "shooting_side-0"]);
    expect(await files["front-0"].text()).toBe("front".repeat(32));
    expect(await readFilmShotCloudState(shot.id)).toMatchObject({ state: "uploaded" });
  });

  it("refuses when this device no longer has a clip's file, and when the upload fails it leaves no note", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    media.drop(shot.id, "front-0");
    const source = fakeSource();
    await expect(keepFilmShotInCloud(user, shot, { source, media })).rejects.toThrow();
    expect(source.calls).toEqual([]);

    const kept = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    await expect(keepFilmShotInCloud(user, kept, { source: fakeSource({ upload: async () => { throw new Error("offline"); } }), media })).rejects.toThrow("offline");
    expect(await readFilmShotCloudState(kept.id)).toBeNull();
  });
});

describe("bringing a cloud film shot to this device", () => {
  it("recreates the shot under its own id, time and name with its files, and notes that it is kept", async () => {
    const media = createMemoryFilmShotMedia();
    const minted: Blob[] = [];
    await downloadCloudFilmShotToDevice(user, { shotId: "film-shot-cloud-7", createdAtMs: 1_700_000_000_000 }, {
      source: fakeSource(),
      media,
      createObjectUrl: (data) => { minted.push(data); return `blob:minted-${minted.length}`; },
    });
    const [shot] = await listFilmShots();
    expect(shot).toMatchObject({ id: "film-shot-cloud-7", title: "내 슛폼 7", createdAtMs: 1_700_000_000_000 });
    expect(shot.clips.map((entry) => [entry.slotId, entry.uri])).toEqual([["front-0", "blob:minted-1"]]);
    expect(media.stored("film-shot-cloud-7")).toEqual(["front-0"]);
    expect(await readFilmShotCloudState("film-shot-cloud-7")).toMatchObject({ state: "uploaded" });
  });

  it("refuses on a device that cannot hold the files", async () => {
    const source = fakeSource();
    await expect(downloadCloudFilmShotToDevice(user, { shotId: "film-shot-cloud-7", createdAtMs: 1 }, { source, media: createMemoryFilmShotMedia(), createObjectUrl: null })).rejects.toThrow(/내려받을 수 없습니다/);
    expect(source.calls).toEqual([]);
  });
});

describe("deleting", () => {
  it("removes the cloud copy first and then the device copy, and clears the note", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    await markFilmShotUploaded(shot.id);
    const source = fakeSource();
    await deleteFilmShotEverywhere(user, { shotId: shot.id, onDevice: true, inCloud: true }, { source, media });
    expect(source.calls).toEqual([`remove ${shot.id}`]);
    expect(await listFilmShots()).toEqual([]);
    expect(await readFilmShotCloudState(shot.id)).toBeNull();
  });

  it("keeps the device copy when the cloud copy could not be removed, so nothing is half-forgotten", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    await markFilmShotUploaded(shot.id);
    const source = fakeSource({ remove: async () => { throw new Error("offline"); } });
    await expect(deleteFilmShotEverywhere(user, { shotId: shot.id, onDevice: true, inCloud: true }, { source, media })).rejects.toThrow("offline");
    expect((await listFilmShots()).map((entry) => entry.id)).toEqual([shot.id]);
    expect(await readFilmShotCloudState(shot.id)).toMatchObject({ state: "uploaded" });
  });

  it("never calls the cloud for a shot that only lives on this device", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    const source = fakeSource();
    await deleteFilmShotEverywhere(null, { shotId: shot.id, onDevice: true, inCloud: false }, { source, media });
    expect(source.calls).toEqual([]);
    expect(await listFilmShots()).toEqual([]);
  });

  it("can remove only the cloud copy, leaving the device shot and clearing the note", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [clip("front-0", "blob:front", blob("front"))] }, { media });
    await markFilmShotUploaded(shot.id);
    const source = fakeSource();
    await deleteFilmShotFromCloudOnly(user, shot.id, { source });
    expect(source.calls).toEqual([`remove ${shot.id}`]);
    expect((await listFilmShots()).map((entry) => entry.id)).toEqual([shot.id]);
    expect(await readFilmShotCloudState(shot.id)).toBeNull();
  });
});

describe("the owner's cloud list for the Profile", () => {
  it("finishes pending deletions first, and still lists when that pass fails", async () => {
    const source = fakeSource();
    await listCloudFilmShotsForOwner(user, { source });
    expect(source.calls).toEqual(["resume", "list"]);
    const flaky = fakeSource({ resumePendingDeletions: async () => { throw new Error("later"); } });
    await expect(listCloudFilmShotsForOwner(user, { source: flaky })).resolves.toEqual([]);
  });

  it("merges device and cloud shots into tiles: both, device only, cloud only, newest first", async () => {
    const local = [
      { version: "film_shot_v1" as const, id: "film-shot-a-1", title: "내 슛폼 1", createdAtMs: 300, clips: [clip("front-0", "blob:a")] },
      { version: "film_shot_v1" as const, id: "film-shot-b-2", title: "내 슛폼 2", createdAtMs: 100, clips: [clip("front-0", "blob:b")] },
    ];
    const cloud = [
      { shotId: "film-shot-a-1", title: "내 슛폼 1", clipIds: ["front-0"], createdAtMs: 310 },
      { shotId: "film-shot-c-3", title: "내 슛폼 3", clipIds: ["front-0", "shooting_side-0"], createdAtMs: 200 },
    ];
    expect(mergeFilmShotTiles(local, cloud).map((tile) => [tile.id, tile.onDevice, tile.inCloud, tile.clipCount])).toEqual([
      ["film-shot-a-1", true, true, 1],
      ["film-shot-c-3", false, true, 2],
      ["film-shot-b-2", true, false, 1],
    ]);
    // Without a cloud list (unavailable, loading or failed) nothing is claimed about the cloud.
    expect(mergeFilmShotTiles(local, null).map((tile) => [tile.id, tile.onDevice, tile.inCloud])).toEqual([
      ["film-shot-a-1", true, false],
      ["film-shot-b-2", true, false],
    ]);
  });
});
