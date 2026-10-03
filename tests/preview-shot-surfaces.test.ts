import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { exploreMotions } from "@/lib/explore-source";
import { previewExploreMotions } from "@/lib/preview/preview-explore-motions";
import { PREVIEW_PROFILE_IDS, buildPreviewData, previewUser } from "@/lib/preview/preview-runtime";
import { PREVIEW_SHOT_ARCHETYPES } from "@/lib/preview/preview-shot-library";
import { createPreviewShootingProfileSource } from "@/lib/preview/preview-shooting-profile-source";
import { reelAnalysisProfileId, reelLine, reelTitle } from "@/lib/reels/reel-model";
import { resolveShotInspectionModes } from "@/lib/shooting-profile/shot-inspection";


// The preview Explore entries draw through the representative glyph helpers, whose neighbours are native modules.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(styles: T) => styles }, AccessibilityInfo: {}, AppState: {} }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));
const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("preview shot library on the real surfaces", () => {
  it("is what the real Profile grid lists, with a tile budget that covers the whole library", () => {
    const profile = read("app/(tabs)/profile.tsx");
    expect(profile).toContain('from "@/lib/shooting-profile-source"');
    expect(profile).toContain("<MotionGrid");
    const limit = Number(/const GLYPH_FETCH_LIMIT = (\d+);/.exec(profile)?.[1]);
    expect(limit).toBeGreaterThanOrEqual(PREVIEW_SHOT_ARCHETYPES.length);
    expect(PREVIEW_PROFILE_IDS.length).toBeGreaterThanOrEqual(16);
  });

  it("lists every archetype, newest first, and opens each one through the preview source", async () => {
    const data = buildPreviewData();
    const source = createPreviewShootingProfileSource(data);
    const list = await source.listShootingProfilesV2(previewUser);
    expect(list.map((summary) => summary.id)).toEqual([...PREVIEW_PROFILE_IDS]);
    for (const id of PREVIEW_PROFILE_IDS.slice(0, 6)) {
      const record = await source.getShootingProfileV2(previewUser, id);
      expect(record?.profile.frames.length, id).toBe(101);
    }
    expect(await source.getShootingProfileV2(previewUser, "preview-shot-999")).toBeNull();
  });

  it("is what the real Explore screen browses, through the explore source only", () => {
    const explore = withoutComments(read("app/(tabs)/explore.tsx"));
    expect(explore).toContain('from "@/lib/explore-source"');
    expect(explore).toContain("exploreMotions()");
    expect(explore).toContain("<ReelsFeed");
    expect(explore).toContain("useExploreFeed(");
    expect(explore).not.toMatch(/@\/lib\/preview\/|@\/lib\/dev\//);
    const source = withoutComments(read("lib/explore-source.ts"));
    expect(source).toContain("ANONYMOUS_POSE_REFERENCES");
    expect(source).toContain("poseMotionGlyph");
    expect(source.indexOf('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"')).toBeLessThan(source.indexOf('require("@/lib/preview/preview-explore-motions")'));
    expect(source).not.toMatch(/PLAYER_|Curry|Paul George/);
  });

  it("adds one Explore entry per archetype that opens the real analysis route and loads its stills lazily", async () => {
    const motions = previewExploreMotions();
    expect(motions.length).toBe(PREVIEW_SHOT_ARCHETYPES.length);
    expect(new Set(motions.map((motion) => motion.id)).size).toBe(motions.length);
    for (const [index, motion] of motions.entries()) {
      expect(motion.kind).toBe("synthetic_preview");
      expect(motion.href).toBe(`/private-analysis/${PREVIEW_SHOT_ARCHETYPES[index].id}`);
      expect(motion.caption).toMatch(/합성/);
    }
    const stills = await motions[0].load();
    expect(stills.stills.map((still) => still.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(Object.keys(stills.stills[3].glyph("oblique").points).length).toBeGreaterThan(0);
    // The one-per-screen feed gets a profile reel named honestly, never "내 슛폼", that opens the same analysis.
    const reel = await motions[11].reel();
    expect(reel.kind).toBe("profile");
    expect(reelTitle(reel)).toBe("SHOT 12");
    expect(reelLine(reel)).toContain("합성");
    expect(reelAnalysisProfileId(reel)).toBe(PREVIEW_SHOT_ARCHETYPES[11].id);
    expect(reel.kind === "profile" && reel.profile.frames.length).toBe(101);
    // Ordinary production exposes the anonymous reference only, and its reel is the reference itself.
    expect(exploreMotions().every((motion) => motion.kind === "anonymous_reference")).toBe(true);
    expect((await exploreMotions()[0].reel()).kind).toBe("reference");
  });

  it("keeps Home at its production density: latest, recommendation, reference", () => {
    const home = withoutComments(read("app/(tabs)/index.tsx"));
    expect(home).not.toMatch(/@\/lib\/preview\/|explore-source|preview-shot/);
    expect(home).toContain("useLatestRepresentativeProfile(user, authLoading)");
    expect(home).toContain("ANONYMOUS_POSE_REFERENCES[0]");
  });

  it("keeps Motion, Phase and Film tabs for a profile with no local clip and shows an honest Film fallback", () => {
    const model = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: false });
    expect(model.enabledModes).toEqual(["motion", "phase", "film"]);
    expect(model.filmSourceAvailable).toBe(false);
    const viewer = read("components/shooting-profile/shot-inspection-viewer.tsx");
    expect(viewer).toContain("연결된 로컬 원본 영상이 없습니다");
    expect(viewer).toContain('mode === "film" && !localClip');
    expect(viewer).toContain("<SequenceViewer");
    expect(viewer).toContain("<PhaseSpaceViewer");
    expect(viewer).not.toMatch(/측정된 물리|actual 4D|synchronized representative/i);
  });

  it("pre-renders an analysis page for every archetype in the preview export and greps them out of production", () => {
    const analysis = read("app/private-analysis/[id].tsx");
    expect(analysis).toContain("preview.PREVIEW_PROFILE_IDS.map((id) => ({ id }))");
    const workflow = read(".github/workflows/ui-web-preview-pages.yml");
    expect(workflow).toContain("- work/hoophub-preview-shot-library-v1");
    for (const token of ["preview-shot-library", "canonical-balanced", "compact-quick-release", "previewExploreMotions", "SyntheticShotStyle"]) {
      expect(workflow).toContain(token);
    }
  });

  it("keeps the user's browser clip and the synthetic library apart: Film reads only the local association", () => {
    const viewer = withoutComments(read("components/shooting-profile/shot-inspection-viewer.tsx"));
    expect(viewer).toContain("loadLocalFilmAssociation(profileId)");
    expect(viewer).not.toMatch(/preview-shot|@\/lib\/preview\//);
    const library = withoutComments(read("lib/preview/preview-shot-library.ts"));
    expect(library).not.toMatch(/film-space|LocalFilm|blob:|createObjectURL/);
  });
});
