import { beforeEach, describe, expect, it, vi } from "vitest";

import * as localFilmAssociation from "@/lib/film-space/local-association";
import {
  deleteLocalFilmAssociation,
  loadLocalFilmAssociation,
  saveLocalFilmAssociation,
} from "@/lib/film-space/local-association";
import type { LocalFilmAssociationV1, LocalFilmClipRefV1 } from "@/lib/film-space/types";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
    removeItem: async (key: string) => { storage.delete(key); },
  },
}));

const clipA: LocalFilmClipRefV1 = {
  slotId: "front-0",
  view: "front",
  takeIndex: 0,
  uri: "file:///private/cache/front.mov",
  durationMs: 2800,
  width: 1080,
  height: 1920,
};
const clipB: LocalFilmClipRefV1 = {
  slotId: "shooting-side-0",
  view: "shooting_side",
  takeIndex: 0,
  uri: "file:///private/cache/side.mov",
  durationMs: 2900,
  width: 1080,
  height: 1920,
};
const clips = [clipA];

type EvictLocalFilmClip = (
  profileId: string,
  slotId: string,
) => Promise<LocalFilmAssociationV1 | null>;

describe("local film association", () => {
  beforeEach(() => storage.clear());

  it("stores local URI only under a local app key and never serializes filename or EXIF", async () => {
    await saveLocalFilmAssociation("profile-a", clips);
    const serialized = [...storage.values()][0] ?? "";
    expect(serialized).toContain("file:///private/cache/front.mov");
    expect(serialized).not.toMatch(/filename|exif|cloud|firestore|https?:/i);
  });

  it("loads only the exact version and profile id with non-empty valid clips", async () => {
    await saveLocalFilmAssociation("profile-a", clips);
    expect(await loadLocalFilmAssociation("profile-a")).toMatchObject({
      version: "local_film_association_v1",
      profileId: "profile-a",
      clips,
    });
    expect(await loadLocalFilmAssociation("profile-b")).toBeNull();
  });

  it("fails closed for malformed, wrong-version, wrong-profile, and empty records", async () => {
    storage.set("hoophub:film-space:v1:bad-json", "{");
    storage.set("hoophub:film-space:v1:wrong-version", JSON.stringify({ version: "v0", profileId: "wrong-version", clips }));
    storage.set("hoophub:film-space:v1:wrong-profile", JSON.stringify({ version: "local_film_association_v1", profileId: "other", clips }));
    storage.set("hoophub:film-space:v1:empty", JSON.stringify({ version: "local_film_association_v1", profileId: "empty", clips: [] }));

    expect(await loadLocalFilmAssociation("bad-json")).toBeNull();
    expect(await loadLocalFilmAssociation("wrong-version")).toBeNull();
    expect(await loadLocalFilmAssociation("wrong-profile")).toBeNull();
    expect(await loadLocalFilmAssociation("empty")).toBeNull();
  });

  it("evicts only the missing local clip and deletes the association after the last clip is gone", async () => {
    await saveLocalFilmAssociation("profile-a", [clipA, clipB]);
    const candidate = (localFilmAssociation as unknown as Record<string, unknown>)
      .evictLocalFilmClipFromAssociation;
    expect(candidate).toBeTypeOf("function");
    if (typeof candidate !== "function") return;
    const evict = candidate as EvictLocalFilmClip;

    const afterFirstEviction = await evict("profile-a", clipA.slotId);
    expect(afterFirstEviction?.clips).toEqual([clipB]);
    expect((await loadLocalFilmAssociation("profile-a"))?.clips).toEqual([clipB]);

    expect(await evict("profile-a", clipB.slotId)).toBeNull();
    expect(await loadLocalFilmAssociation("profile-a")).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("deletes only the local association key", async () => {
    await saveLocalFilmAssociation("profile-a", clips);
    await deleteLocalFilmAssociation("profile-a");
    expect(await loadLocalFilmAssociation("profile-a")).toBeNull();
    expect(storage.size).toBe(0);
  });
});