import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

/**
 * Film shots: capture sessions kept as footage only, on this device. The
 * store is AsyncStorage (an index plus one record per shot) and reuses the
 * local film association so the Film viewer path is unchanged. On the web
 * the picked file is kept in a blob store so a shot survives a reload; a
 * clip whose blob is gone is dropped honestly rather than shown broken.
 */

const memory = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value); },
    removeItem: async (key: string) => { memory.delete(key); },
  },
}));

const { deleteFilmShot, isFilmShotId, listFilmShots, restoreFilmShot, saveFilmShot } = await import("@/lib/film-space/film-shots");
const { loadLocalFilmAssociation } = await import("@/lib/film-space/local-association");
const { createMemoryFilmShotMedia } = await import("@/lib/film-space/film-shot-media");

const clip = (slotId: string, view: LocalFilmClipRefV1["view"], uri: string): LocalFilmClipRefV1 => (
  { slotId, view, takeIndex: 0, uri, durationMs: 3533, width: 1080, height: 1920 }
);
const blob = (tag: string) => new Blob([tag], { type: "video/mp4" });

let clock = 1_700_000_000_000;
const now = () => (clock += 60_000);

beforeEach(() => {
  memory.clear();
  clock = 1_700_000_000_000;
});

describe("film shots", () => {
  it("saves a shot with an opaque id and a default name, keeps the association, and lists newest first", async () => {
    const media = createMemoryFilmShotMedia();
    const first = await saveFilmShot({ clips: [clip("front-0", "front", "blob:a"), clip("shooting_side-0", "shooting_side", "blob:b")] }, { media, now });
    const second = await saveFilmShot({ clips: [clip("front-0", "front", "blob:c"), clip("shooting_side-0", "shooting_side", "blob:d")] }, { media, now });
    expect(isFilmShotId(first.id)).toBe(true);
    expect(first.id).toMatch(/^film-shot-[A-Za-z0-9_-]+$/);
    expect(first.id).not.toBe(second.id);
    expect(first.title).toBe("내 슛폼 1");
    expect(second.title).toBe("내 슛폼 2");
    expect(second.createdAtMs).toBeGreaterThan(first.createdAtMs);
    const listed = await listFilmShots({ media });
    expect(listed.map((shot) => shot.id)).toEqual([second.id, first.id]);
    expect(listed[1].clips.map((entry) => entry.slotId)).toEqual(["front-0", "shooting_side-0"]);
    expect((await loadLocalFilmAssociation(first.id))?.clips.map((entry) => entry.uri)).toEqual(["blob:a", "blob:b"]);
    // Never a profile id and never a URL that could leave the device.
    expect(isFilmShotId("preview-shot-001")).toBe(false);
    expect(JSON.stringify(listed)).not.toMatch(/https?:/);
  });

  it("keeps the picked files in the media store and restores fresh object URLs after a reload, dropping clips whose file is gone", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({
      clips: [
        { ...clip("front-0", "front", "blob:stale-front"), blob: blob("front") },
        { ...clip("shooting_side-0", "shooting_side", "blob:stale-side"), blob: blob("side") },
      ],
    }, { media, now });
    expect(media.stored(shot.id)).toEqual(["front-0", "shooting_side-0"]);

    // A new page session: the old object URLs are dead; restore mints new ones from the stored blobs.
    media.forgetUrls();
    const restored = await restoreFilmShot(shot, { media });
    expect(restored.clips.map((entry) => entry.uri)).toEqual(["memory://front-0#1", "memory://shooting_side-0#1"]);
    expect((await loadLocalFilmAssociation(shot.id))?.clips.map((entry) => entry.uri)).toEqual(["memory://front-0#1", "memory://shooting_side-0#1"]);

    media.drop(shot.id, "shooting_side-0");
    const partial = await restoreFilmShot(shot, { media });
    expect(partial.clips.map((entry) => entry.slotId)).toEqual(["front-0"]);
    expect((await loadLocalFilmAssociation(shot.id))?.clips).toHaveLength(1);
  });

  it("deletes a shot, its association and its stored files, and skips a corrupt record when listing", async () => {
    const media = createMemoryFilmShotMedia();
    const shot = await saveFilmShot({ clips: [{ ...clip("front-0", "front", "blob:x"), blob: blob("x") }] }, { media, now });
    memory.set("hoophub:film-shots:v1:shot:film-shot-bogus", "{not json");
    memory.set("hoophub:film-shots:v1:index", JSON.stringify(["film-shot-bogus", shot.id]));
    expect((await listFilmShots({ media })).map((entry) => entry.id)).toEqual([shot.id]);

    await deleteFilmShot(shot.id, { media });
    expect(await listFilmShots({ media })).toEqual([]);
    expect(await loadLocalFilmAssociation(shot.id)).toBeNull();
    expect(media.stored(shot.id)).toEqual([]);
  });

  it("refuses clips that are not device-local and never stores a file name", async () => {
    const media = createMemoryFilmShotMedia();
    await expect(saveFilmShot({ clips: [clip("front-0", "front", "https://example.com/a.mp4")] }, { media, now })).rejects.toThrow();
    const shot = await saveFilmShot({ clips: [{ ...clip("front-0", "front", "blob:ok"), blob: blob("ok") }], title: "IMG_8680.mp4" }, { media, now });
    expect(shot.title).toBe("내 슛폼 1");
  });
});
