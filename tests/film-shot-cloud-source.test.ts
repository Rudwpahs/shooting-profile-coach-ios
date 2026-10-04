import { readFileSync } from "node:fs";

import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloud keeping of footage is a separate, default-off product decision: the
 * AI architecture keeps raw video on the device by default, so an ordinary
 * build must contain no way to upload it. The source is unavailable unless
 * the build sets EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1=1, and never in the
 * install-free preview.
 */

const memory = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value); },
    removeItem: async (key: string) => { memory.delete(key); },
  },
}));

const { filmShotCloudSource, unavailableFilmShotCloudSource } = await import("@/lib/film-shot-cloud-source");
const { FORMPATH_EXPERIMENTAL_FLAGS } = await import("@/lib/feature-flags");
const { clearFilmShotCloudState, markFilmShotUploaded, readFilmShotCloudState } = await import("@/lib/film-space/film-shot-cloud-state");

const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const user = { uid: "owner-uid-0001" } as unknown as User;
const shot = { id: "film-shot-abc-1", title: "내 슛폼 1", clips: [] };

beforeEach(() => memory.clear());

describe("film shot cloud source", () => {
  it("is off by default: the flag is false, the source is unavailable, and every call refuses", async () => {
    expect(FORMPATH_EXPERIMENTAL_FLAGS.cloudFilmShotsV1).toBe(false);
    expect(filmShotCloudSource.available).toBe(false);
    expect(filmShotCloudSource).toBe(unavailableFilmShotCloudSource);
    await expect(filmShotCloudSource.upload(user, shot, {})).rejects.toThrow(/사용할 수 없습니다/);
    await expect(filmShotCloudSource.list(user)).rejects.toThrow();
    await expect(filmShotCloudSource.download(user, shot.id)).rejects.toThrow();
    await expect(filmShotCloudSource.remove(user, shot.id)).rejects.toThrow();
    await expect(filmShotCloudSource.resumePendingDeletions(user)).rejects.toThrow();
  });

  it("reaches Firebase Storage only through a literal gate, so an ordinary bundle folds the upload code away", () => {
    const source = withoutComments(read("lib/film-shot-cloud-source.ts"));
    const previewGate = source.indexOf('if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") return unavailableFilmShotCloudSource;');
    const cloudGate = source.indexOf('process.env.EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1 === "1"');
    const cloudRequire = source.indexOf('require("@/lib/firebase-film-shot-cloud-source")');
    // The preview gate comes first: a preview build never reaches Firebase even if the cloud flag is set.
    expect(previewGate).toBeGreaterThan(-1);
    expect(cloudGate).toBeGreaterThan(previewGate);
    expect(cloudRequire).toBeGreaterThan(cloudGate);
    expect(source).not.toMatch(/^import (?!type\b)[^;]*from "@\/lib\/(firebase-film-shot|preview\/)/m);
    expect(source).not.toMatch(/@\/lib\/preview\//);
    expect(source).not.toMatch(/from "firebase\/storage"/);
    const flags = read("lib/feature-flags.ts");
    expect(flags).toContain('process.env.EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1 === "1"');
    expect(flags).toMatch(/cloudFilmShotsV1:[\s\S]*?PREVIEW_FLAG_OVERRIDE === null/);
  });

  it("guards the ordinary production export against the cloud upload code", () => {
    const workflow = read(".github/workflows/ui-web-preview-pages.yml");
    expect(workflow).toContain("firebaseFilmShotCloudSource|");
    expect(workflow).toContain("uploadFilmShotV1|");
    expect(workflow).toContain("|WebFilmCaptureSession");
  });

  it("wires the web capture session only behind the cloud flag, after the auth check", () => {
    const route = withoutComments(read("app/private-capture.tsx"));
    const gate = route.indexOf('process.env.EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1 === "1"');
    const required = route.indexOf('require("@/components/shooting-profile/web-film-capture-session")');
    expect(gate).toBeGreaterThan(-1);
    expect(required).toBeGreaterThan(gate);
    expect(gate).toBeGreaterThan(route.indexOf("if (authLoading)"));
    const session = read("components/shooting-profile/web-film-capture-session.tsx");
    expect(session).toContain("createWebFilmCaptureMachine(");
    expect(session).toContain("filmShotCloudSource.upload(");
    expect(session).toContain("markFilmShotUploaded(");
    expect(session).toContain("filmShotCloudSource.available");
  });
});

describe("film shot cloud state on this device", () => {
  it("marks a shot as kept in the cloud, reads it back, and clears it", async () => {
    expect(await readFilmShotCloudState("film-shot-abc-1")).toBeNull();
    await markFilmShotUploaded("film-shot-abc-1", () => 1_700_000_000_000);
    expect(await readFilmShotCloudState("film-shot-abc-1")).toEqual({ state: "uploaded", uploadedAtMs: 1_700_000_000_000 });
    expect(await readFilmShotCloudState("film-shot-other-2")).toBeNull();
    await clearFilmShotCloudState("film-shot-abc-1");
    expect(await readFilmShotCloudState("film-shot-abc-1")).toBeNull();
  });

  it("ignores a malformed mark and refuses ids that are not film shots", async () => {
    memory.set("hoophub:film-shots:v1:cloud:film-shot-abc-1", "{not json");
    expect(await readFilmShotCloudState("film-shot-abc-1")).toBeNull();
    await expect(markFilmShotUploaded("preview-shot-001")).rejects.toThrow();
    expect(await readFilmShotCloudState("../x")).toBeNull();
  });
});
