import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as nativeAssociation from "@/lib/film-space/local-association";
import * as webAssociation from "@/lib/film-space/local-association.web";
import { createWebLocalFilmAssociationStore } from "@/lib/film-space/local-association.web";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

const clipA: LocalFilmClipRefV1 = {
  slotId: "front-0",
  view: "front",
  takeIndex: 0,
  uri: "blob:https://rudwpahs.github.io/aaaa",
  durationMs: 2800,
  width: 512,
  height: 910,
};
const clipB: LocalFilmClipRefV1 = { ...clipA, slotId: "shooting-side-0", view: "shooting_side", uri: "blob:https://rudwpahs.github.io/bbbb" };
const clipA2: LocalFilmClipRefV1 = { ...clipA, uri: "blob:https://rudwpahs.github.io/a2a2" };

function store() {
  const revoked: string[] = [];
  const api = createWebLocalFilmAssociationStore((uri) => { revoked.push(uri); });
  return { api, revoked };
}

describe("web local film association (session-local, in-memory)", () => {
  it("exports the same public API as the native AsyncStorage module", () => {
    const names = (module: Record<string, unknown>) => Object.keys(module).filter((name) => typeof module[name] === "function").sort();
    const nativeNames = names(nativeAssociation as unknown as Record<string, unknown>);
    const webNames = names(webAssociation as unknown as Record<string, unknown>);
    expect(nativeNames.every((name) => webNames.includes(name))).toBe(true);
  });

  it("keeps the association in memory only: no AsyncStorage, localStorage, Firebase or network", () => {
    const source = readFileSync("lib/film-space/local-association.web.ts", "utf8");
    expect(source).not.toMatch(/AsyncStorage|localStorage|sessionStorage|indexedDB|firebase|fetch\(|axios|trpc|upload/i);
    expect(source).toMatch(/revokeObjectURL/);
    expect(source).not.toMatch(/console\./);
  });

  it("saves, loads, and deletes per opaque profile id with the native validation rules", async () => {
    const { api } = store();
    await api.saveLocalFilmAssociation("preview-shot-001", [clipA, clipB]);
    expect(await api.loadLocalFilmAssociation("preview-shot-001")).toEqual({
      version: "local_film_association_v1",
      profileId: "preview-shot-001",
      clips: [clipA, clipB],
    });
    expect(await api.loadLocalFilmAssociation("other")).toBeNull();
    expect(await api.loadLocalFilmAssociation("bad id!")).toBeNull();
    await api.saveLocalFilmAssociation("preview-shot-001", [{ ...clipA, uri: "https://example.com/a.mp4" }]);
    expect(await api.loadLocalFilmAssociation("preview-shot-001")).toBeNull();
  });

  it("revokes a replaced clip's object URL and keeps URLs still in use", async () => {
    const { api, revoked } = store();
    await api.saveLocalFilmAssociation("p", [clipA, clipB]);
    await api.saveLocalFilmAssociation("p", [clipA2, clipB]);
    expect(revoked).toEqual([clipA.uri]);
  });

  it("revokes every clip on delete and only the evicted clip on eviction, then deletes an emptied association", async () => {
    const { api, revoked } = store();
    await api.saveLocalFilmAssociation("p", [clipA, clipB]);
    expect(await api.evictLocalFilmClipFromAssociation("p", clipA.slotId)).toEqual({
      version: "local_film_association_v1",
      profileId: "p",
      clips: [clipB],
    });
    expect(revoked).toEqual([clipA.uri]);
    expect(await api.evictLocalFilmClipFromAssociation("p", clipB.slotId)).toBeNull();
    expect(revoked).toEqual([clipA.uri, clipB.uri]);
    expect(await api.loadLocalFilmAssociation("p")).toBeNull();

    await api.saveLocalFilmAssociation("q", [clipA, clipB]);
    await api.deleteLocalFilmAssociation("q");
    expect(revoked.slice(2)).toEqual([clipA.uri, clipB.uri]);
    expect(await api.loadLocalFilmAssociation("q")).toBeNull();
  });

  it("does not revoke a URL that another profile still references", async () => {
    const { api, revoked } = store();
    await api.saveLocalFilmAssociation("p", [clipA]);
    await api.saveLocalFilmAssociation("q", [clipA]);
    await api.deleteLocalFilmAssociation("p");
    expect(revoked).toEqual([]);
    await api.deleteLocalFilmAssociation("q");
    expect(revoked).toEqual([clipA.uri]);
  });

  it("clears everything, revoking each URL once", async () => {
    const { api, revoked } = store();
    await api.saveLocalFilmAssociation("p", [clipA]);
    await api.saveLocalFilmAssociation("q", [clipB]);
    api.clearAllLocalFilmAssociations();
    api.clearAllLocalFilmAssociations();
    expect(revoked.sort()).toEqual([clipA.uri, clipB.uri].sort());
  });
});
