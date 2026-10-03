import AsyncStorage from "@react-native-async-storage/async-storage";

import { type FilmShotClipInputV1, type FilmShotMedia } from "@/lib/film-space/film-shot-media";
import { saveFilmShot } from "@/lib/film-space/film-shots";
import type { LocalFilmViewV1 } from "@/lib/film-space/types";
import { createWebLocalVideoSource, type WebLocalVideoPorts, type WebLocalVideoSourceV1 } from "@/lib/film-space/web-local-video";
import { WEB_LOCAL_VIDEO_DOM_PORTS } from "@/lib/film-space/web-local-video-picker";

/**
 * LOCAL-ONLY PREVIEW FILM SHOTS. A developer may keep their own clips in the
 * gitignored `public/preview-local/` folder next to a small manifest. A local
 * preview build serves that folder; on first load each manifest entry becomes
 * an ordinary device-local film shot through the same store the capture flow
 * uses (object URL + the file kept in the browser's media store), so Home,
 * Profile and Reels show it exactly like a captured shot. The public Pages
 * site has no such folder: the manifest request is a 404 and nothing happens.
 * The folder never reaches the repository or the export (see .gitignore and
 * the Pages workflow guard). Nothing here sends anything anywhere.
 */

export const PREVIEW_LOCAL_FILM_MANIFEST_PATH = "preview-local/film-shots.json";
const MANIFEST_VERSION = "preview_local_film_shots_v1" as const;
const MARKER_PREFIX = "hoophub:preview-local-film-seed:v1:";
const VIEWS: readonly LocalFilmViewV1[] = ["front", "shooting_side"];
/** A manifest key is an opaque short token; a clip file is a bare file name (no path) with a video extension. */
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const FILE = /^[A-Za-z0-9_-]{1,120}\.(mp4|m4v|mov|webm)$/i;

export type PreviewLocalFilmClipV1 = Readonly<{ view: LocalFilmViewV1; file: string }>;
export type PreviewLocalFilmShotV1 = Readonly<{ key: string; title?: string; clips: readonly PreviewLocalFilmClipV1[] }>;
export type PreviewLocalFilmManifestV1 = Readonly<{ version: typeof MANIFEST_VERSION; shots: readonly PreviewLocalFilmShotV1[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePreviewLocalFilmManifest(value: unknown): PreviewLocalFilmManifestV1 | null {
  if (!isRecord(value) || value.version !== MANIFEST_VERSION || !Array.isArray(value.shots)) return null;
  const shots: PreviewLocalFilmShotV1[] = [];
  for (const entry of value.shots) {
    if (!isRecord(entry) || typeof entry.key !== "string" || !KEY.test(entry.key) || !Array.isArray(entry.clips) || entry.clips.length === 0) return null;
    const clips: PreviewLocalFilmClipV1[] = [];
    for (const clip of entry.clips) {
      if (!isRecord(clip) || typeof clip.view !== "string" || !VIEWS.includes(clip.view as LocalFilmViewV1) || typeof clip.file !== "string" || !FILE.test(clip.file)) return null;
      clips.push({ view: clip.view as LocalFilmViewV1, file: clip.file });
    }
    shots.push({ key: entry.key, ...(typeof entry.title === "string" ? { title: entry.title } : {}), clips });
  }
  return { version: MANIFEST_VERSION, shots };
}

export type PreviewLocalFilmSeedPorts = Readonly<{
  /** The parsed manifest JSON, or null when there is none (every public visit). */
  loadManifest(): Promise<unknown | null>;
  /** One clip's bytes, or null when it cannot be read. */
  loadClip(file: string): Promise<Blob | null>;
  probe?: WebLocalVideoPorts;
  media?: FilmShotMedia;
  now?: () => number;
}>;

export type PreviewLocalFilmSeedResult = Readonly<{
  status: "absent" | "invalid" | "seeded" | "skipped";
  seeded: string[];
  skipped: string[];
  failed: string[];
}>;

const markerKey = (shotKey: string) => `${MARKER_PREFIX}${shotKey}`;

async function seedOne(shot: PreviewLocalFilmShotV1, ports: PreviewLocalFilmSeedPorts): Promise<boolean> {
  const probe = ports.probe ?? WEB_LOCAL_VIDEO_DOM_PORTS;
  const sources: WebLocalVideoSourceV1[] = [];
  const inputs: FilmShotClipInputV1[] = [];
  const takes = new Map<LocalFilmViewV1, number>();
  const abandon = () => {
    for (const source of sources) source.revoke();
    return false;
  };
  for (const clip of shot.clips) {
    const blob = await ports.loadClip(clip.file);
    if (!blob) return abandon();
    // The File name only lets the type check pass; no clip reference keeps it.
    const file = new File([blob], clip.file, { type: blob.type || "video/mp4" });
    const result = await createWebLocalVideoSource(file, probe);
    if (result.status !== "ready") return abandon();
    sources.push(result.source);
    const takeIndex = takes.get(clip.view) ?? 0;
    takes.set(clip.view, takeIndex + 1);
    inputs.push({
      slotId: `${clip.view}-${takeIndex}`,
      view: clip.view,
      takeIndex,
      uri: result.source.uri,
      durationMs: result.source.durationMs,
      width: result.source.width,
      height: result.source.height,
      blob,
    });
  }
  try {
    const saved = await saveFilmShot({ clips: inputs, title: shot.title }, { media: ports.media, now: ports.now });
    await AsyncStorage.setItem(markerKey(shot.key), saved.id);
    return true;
  } catch {
    return abandon();
  }
}

/**
 * Seeds every manifest shot that this browser has not seeded before. A shot
 * that fails to load is skipped whole and left unmarked, so a later run can
 * try again; a shot the user has since deleted stays deleted.
 */
export async function seedPreviewLocalFilmShots(ports: PreviewLocalFilmSeedPorts): Promise<PreviewLocalFilmSeedResult> {
  const raw = await ports.loadManifest();
  if (raw === null || raw === undefined) return { status: "absent", seeded: [], skipped: [], failed: [] };
  const manifest = parsePreviewLocalFilmManifest(raw);
  if (!manifest) return { status: "invalid", seeded: [], skipped: [], failed: [] };

  const seeded: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const shot of manifest.shots) {
    if ((await AsyncStorage.getItem(markerKey(shot.key))) !== null) {
      skipped.push(shot.key);
      continue;
    }
    if (await seedOne(shot, ports)) seeded.push(shot.key);
    else failed.push(shot.key);
  }
  return { status: seeded.length > 0 ? "seeded" : "skipped", seeded, skipped, failed };
}

/** The served bundle's base URL ("" for a local root server, "/<repo>" on Pages), from the script tags on the page. */
export function previewLocalAssetBase(scriptSources: readonly string[]): string | null {
  for (const source of scriptSources) {
    const index = source.indexOf("/_expo/static/js/web/");
    if (index > 0) return source.slice(0, index);
  }
  return null;
}

/** Browser ports: same-origin static files next to the bundle, nothing else. Null outside a browser. */
export function createBrowserPreviewLocalFilmSeedPorts(): PreviewLocalFilmSeedPorts | null {
  if (typeof document === "undefined" || typeof window === "undefined" || typeof fetch !== "function") return null;
  const base = previewLocalAssetBase(Array.from(document.scripts).map((script) => script.src));
  if (base === null) return null;
  const load = async (path: string): Promise<Response | null> => {
    const url = new URL(`${base}/${path}`, window.location.href);
    if (url.origin !== window.location.origin) return null;
    try {
      const response = await fetch(url.toString(), { cache: "no-store" });
      return response.ok ? response : null;
    } catch {
      return null;
    }
  };
  return {
    loadManifest: async () => {
      const response = await load(PREVIEW_LOCAL_FILM_MANIFEST_PATH);
      if (!response) return null;
      try {
        return (await response.json()) as unknown;
      } catch {
        return null;
      }
    },
    loadClip: async (file) => {
      if (!FILE.test(file)) return null;
      const response = await load(`preview-local/${file}`);
      return response ? response.blob() : null;
    },
    probe: WEB_LOCAL_VIDEO_DOM_PORTS,
  };
}
