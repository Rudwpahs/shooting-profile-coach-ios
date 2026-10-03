import { existsSync, readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebLocalVideoPorts } from "@/lib/film-space/web-local-video";

/**
 * Local-only preview film shots. A gitignored `public/preview-local/` folder
 * (the owner's clips plus a manifest) is served only by a local preview build;
 * on first load the preview turns each manifest entry into an ordinary
 * device-local film shot through the same store the capture flow uses. The
 * public Pages site has no manifest, so nothing happens there, and the
 * folder can never reach the repository or the export.
 */

const memory = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value); },
    removeItem: async (key: string) => { memory.delete(key); },
  },
}));

const { PREVIEW_LOCAL_FILM_MANIFEST_PATH, parsePreviewLocalFilmManifest, previewLocalAssetBase, seedPreviewLocalFilmShots } = await import("@/lib/dev/preview-local-film-seed");
const { deleteFilmShot, listFilmShots } = await import("@/lib/film-space/film-shots");
const { createMemoryFilmShotMedia } = await import("@/lib/film-space/film-shot-media");

const manifest = {
  version: "preview_local_film_shots_v1",
  shots: [
    { key: "shot-1", title: "내 슛폼 1", clips: [{ view: "front", file: "shot-1-front.mp4" }, { view: "shooting_side", file: "shot-1-side.mp4" }] },
    { key: "shot-2", title: "내 슛폼 2", clips: [{ view: "front", file: "shot-2-front.mp4" }, { view: "shooting_side", file: "shot-2-side.mp4" }] },
  ],
};

let objectUrls = 0;
const probe: WebLocalVideoPorts = {
  createObjectURL: () => `blob:seed-${++objectUrls}`,
  revokeObjectURL: () => undefined,
  probe: async () => ({ durationMs: 4433, width: 1080, height: 1920 }),
};
let clock = 1_700_000_000_000;
const now = () => (clock += 60_000);

function ports(overrides: Partial<Parameters<typeof seedPreviewLocalFilmShots>[0]> = {}) {
  const media = createMemoryFilmShotMedia();
  const loadClip = vi.fn(async (file: string) => new Blob([file], { type: "video/mp4" }));
  return {
    media,
    loadClip,
    ports: {
      loadManifest: async () => manifest as unknown,
      loadClip,
      probe,
      media,
      now,
      ...overrides,
    },
  };
}

beforeEach(() => {
  memory.clear();
  objectUrls = 0;
  clock = 1_700_000_000_000;
});

describe("preview-local film seed", () => {
  it("does nothing when there is no manifest, which is every public Pages visit", async () => {
    const { ports: p, loadClip, media } = ports({ loadManifest: async () => null });
    const result = await seedPreviewLocalFilmShots(p);
    expect(result.status).toBe("absent");
    expect(loadClip).not.toHaveBeenCalled();
    expect(await listFilmShots({ media })).toEqual([]);
  });

  it("ignores a manifest it does not understand", async () => {
    const { ports: p, loadClip, media } = ports({ loadManifest: async () => ({ version: "something_else", shots: [{}] }) });
    const result = await seedPreviewLocalFilmShots(p);
    expect(result.status).toBe("invalid");
    expect(loadClip).not.toHaveBeenCalled();
    expect(await listFilmShots({ media })).toEqual([]);
    expect(parsePreviewLocalFilmManifest({ version: "preview_local_film_shots_v1", shots: [{ key: "x", clips: [{ view: "sideways", file: "a.mp4" }] }] })).toBeNull();
    expect(parsePreviewLocalFilmManifest(manifest)?.shots).toHaveLength(2);
  });

  it("seeds every shot once as an ordinary device-local film shot with its files, and a second run adds nothing", async () => {
    const { ports: p, loadClip, media } = ports();
    const first = await seedPreviewLocalFilmShots(p);
    expect(first.status).toBe("seeded");
    expect(first.seeded).toEqual(["shot-1", "shot-2"]);
    expect(loadClip).toHaveBeenCalledTimes(4);
    const shots = await listFilmShots({ media });
    expect(shots.map((shot) => shot.title)).toEqual(["내 슛폼 2", "내 슛폼 1"]);
    for (const shot of shots) {
      expect(shot.clips.map((clip) => [clip.view, clip.slotId, clip.takeIndex])).toEqual([["front", "front-0", 0], ["shooting_side", "shooting_side-0", 0]]);
      expect(shot.clips.every((clip) => clip.uri.startsWith("blob:") && clip.durationMs === 4433 && clip.width === 1080 && clip.height === 1920)).toBe(true);
      // The files are kept in the device media store, so a reload re-opens them like any captured shot.
      expect(media.stored(shot.id)).toEqual(["front-0", "shooting_side-0"]);
    }
    // No clip reference carries a file name.
    expect(JSON.stringify(shots)).not.toMatch(/\.mp4|shot-1-front/);

    const second = await seedPreviewLocalFilmShots(p);
    expect(second.status).toBe("skipped");
    expect(second.skipped).toEqual(["shot-1", "shot-2"]);
    expect(loadClip).toHaveBeenCalledTimes(4);
    expect(await listFilmShots({ media })).toHaveLength(2);
  });

  it("skips a shot whose clip cannot be loaded, whole and unmarked, so a later run can seed it", async () => {
    const { ports: p, media } = ports();
    const flaky = vi.fn(async (file: string) => (file === "shot-2-side.mp4" ? null : new Blob([file], { type: "video/mp4" })));
    const first = await seedPreviewLocalFilmShots({ ...p, loadClip: flaky });
    expect(first.seeded).toEqual(["shot-1"]);
    expect(first.failed).toEqual(["shot-2"]);
    expect((await listFilmShots({ media })).map((shot) => shot.title)).toEqual(["내 슛폼 1"]);
    const second = await seedPreviewLocalFilmShots(p);
    expect(second.seeded).toEqual(["shot-2"]);
    expect(second.skipped).toEqual(["shot-1"]);
    expect((await listFilmShots({ media })).map((shot) => shot.title)).toEqual(["내 슛폼 2", "내 슛폼 1"]);
  });

  it("respects a deletion: a seeded shot the user removed is not brought back", async () => {
    const { ports: p, media } = ports();
    await seedPreviewLocalFilmShots(p);
    const [newest] = await listFilmShots({ media });
    await deleteFilmShot(newest.id, { media });
    const again = await seedPreviewLocalFilmShots(p);
    expect(again.seeded).toEqual([]);
    expect((await listFilmShots({ media })).map((shot) => shot.title)).toEqual(["내 슛폼 1"]);
  });

  it("resolves the manifest next to the served bundle, for the Pages base path and for a local server alike", () => {
    expect(previewLocalAssetBase(["https://rudwpahs.github.io/shooting-profile-coach-ios/_expo/static/js/web/entry-abc.js"])).toBe("https://rudwpahs.github.io/shooting-profile-coach-ios");
    expect(previewLocalAssetBase(["http://localhost:8095/_expo/static/js/web/entry-abc.js"])).toBe("http://localhost:8095");
    expect(previewLocalAssetBase(["http://localhost:8095/other.js"])).toBeNull();
    expect(previewLocalAssetBase([])).toBeNull();
    expect(PREVIEW_LOCAL_FILM_MANIFEST_PATH).toBe("preview-local/film-shots.json");
  });

  it("stays out of the repository, out of every web export, out of the preview runtime's network boundary, and out of the Pages export", () => {
    // Outside public/: Expo copies public/ into every web export, including an ordinary production export.
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore).toMatch(/^\/preview-local\/$/m);
    expect(gitignore).not.toContain("public/preview-local/");
    expect(existsSync("public/preview-local")).toBe(false);
    const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");
    expect(workflow).toMatch(/-e web-preview-dist\/preview-local/);
    expect(workflow).toMatch(/-e web-production-check\/preview-local/);
    expect(workflow).toContain("preview-local|");
    // The local serve script is the only thing that puts the folder next to a bundle, and only on localhost.
    const serve = readFileSync("scripts/preview-local-serve.mjs", "utf8");
    expect(serve).toContain('"preview-local"');
    expect(serve).toMatch(/127\.0\.0\.1|0\.0\.0\.0/);
    const root = readFileSync("lib/preview/preview-runtime-root.web.tsx", "utf8");
    expect(root).toContain("<PreviewLocalFilmSeed");
    const bridge = readFileSync("lib/preview/preview-local-film-seed.tsx", "utf8");
    expect(bridge).toContain('from "@/lib/dev/preview-local-film-seed"');
    expect(bridge).not.toMatch(/fetch\(|AsyncStorage|indexedDB/);
    const seed = readFileSync("lib/dev/preview-local-film-seed.ts", "utf8");
    expect(seed).toContain("saveFilmShot(");
    expect(seed).toContain("createWebLocalVideoSource(");
    expect(seed).not.toMatch(/IMG_|firebase|upload/i);
  });
});
