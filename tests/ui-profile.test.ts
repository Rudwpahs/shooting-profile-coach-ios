import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const profile = readFileSync("app/(tabs)/profile.tsx", "utf8");
const hero = readFileSync("components/profile/profile-hero.tsx", "utf8");
const grid = readFileSync("components/profile/motion-grid.tsx", "utf8");
const account = readFileSync("components/profile/account-panel.tsx", "utf8");
const loop = readFileSync("components/skeleton/skeleton-loop.tsx", "utf8");

describe("profile as skeleton identity", () => {
  it("leads with the owner's skeleton loop, not a letter avatar, a photo, or an email", () => {
    expect(profile).toContain("<ProfileHero");
    expect(hero).toContain("<SkeletonLoop");
    expect(profile).not.toMatch(/user\?\.email\?\.\[0\]|user\?\.email\?\.split/);
    expect(profile).not.toMatch(/PRIVATE VAULT|avatar/i);
    expect(profile).not.toMatch(/expo-image|<Image\b/);
  });

  it("keeps the text budget: numbers with tiny labels, one goal line, no kickers or paragraphs", () => {
    expect(profile).toContain("<ProfileStats");
    expect(profile).toContain("목표 · {goalLabel}");
    expect(profile).not.toMatch(/kicker|eyebrow|sectionTitle|lead:/);
    expect(profile).not.toContain("개인 저장공간 연결됨");
    expect(profile).not.toContain("계정을 연결하면 분석을 보관합니다");
    // Boundary and mode copy survive only as accessibility labels on the tiles.
    expect(grid).toContain("위상 결합 4D 추정 · 실측 3D 아님");
    expect(profile).not.toContain("위상 결합 4D 추정 · 실측 3D 아님");
  });

  it("separates account controls from the identity area", () => {
    expect(profile).toContain("<AccountPanel");
    expect(profile).toContain("const accountVisible = !user || accountOpen;");
    expect(account).not.toMatch(/useFirebaseAuth|listShootingProfilesV2|deleteShootingProfileV2|getShootingProfileV2/);
    expect(existsSync("components/shooting-profile/profile-list.tsx")).toBe(false);
  });

  it("fetches the full records for the hero and tiles with the same owner and generation guards", () => {
    expect(profile).toContain("getShootingProfileV2(owner, profileId)");
    expect(profile).toContain("v2GlyphGenerationRef");
    expect(profile).toContain("valueForExactOwner(currentOwnerUid, v2GlyphEnvelope)");
    expect(profile).toContain("GLYPH_FETCH_LIMIT = 9");
    expect(profile).toContain("if (!isOpaqueShootingProfileIdV2(profileId)) continue;");
    const loadGlyphs = profile.slice(profile.indexOf("const loadV2Glyphs = useCallback"), profile.indexOf("useEffect(() =>", profile.indexOf("const loadV2Glyphs = useCallback")));
    expect(loadGlyphs.indexOf("if (!FORMPATH_FLAGS.profileV2) return;")).toBeLessThan(loadGlyphs.indexOf("getShootingProfileV2"));
    expect(loadGlyphs).toContain("ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2GlyphGenerationRef.current, generation)");
    // Deleting a profile also drops its cached glyph.
    expect(profile).toContain("const { [profileId]: _removed, ...rest } = envelope.value;");
  });

  it("shows confidence as form: high and recapture dots, dashed retake tiles, no percentage on the grid", () => {
    expect(grid).toContain("representativeConfidence(full.profile)");
    expect(grid).toContain("styles.dotHigh");
    expect(grid).toContain("styles.dotRecapture");
    expect(grid).not.toMatch(/Math\.round\(record\.confidence \* 100\)/);
    expect(hero).toContain("styles.badgeRecapture");
  });

  it("keeps deletion reachable on tiles by long-press and as an accessibility action", () => {
    expect(grid).toContain('accessibilityActions={validId ? [{ name: "longpress", label: "삭제" }] : []}');
    expect(grid).toContain("onLongPress=");
    expect(grid).toContain('actionName === "longpress"');
    expect(grid).toContain("길게 눌러 삭제");
  });

  it("gives the hero loop the viewer's lifecycle rules", () => {
    expect(loop).toContain("resolveRepresentativePlayback");
    expect(loop).toContain("isReduceMotionEnabled");
    expect(loop).toContain('AppState.addEventListener("change"');
    expect(loop).toContain("representativeSequenceBounds");
    expect(loop).toContain("FRAME_INTERVAL_MS = 40");
  });
});
