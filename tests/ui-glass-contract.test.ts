import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("approved Liquid Glass scope", () => {
  it("glassifies chrome but never the motion content itself", () => {
    expect(read("components/hoophub-tab-bar.tsx")).toContain("GlassSurface");
    expect(read("components/ui/top-bar.tsx")).toContain("GlassSurface");
    expect(read("components/reels/reel-overlay.tsx")).toContain("GlassSurface");
    expect(read("app/(tabs)/explore.tsx")).toContain("GlassSurface");
    expect(read("components/shooting-profile/capture-session.tsx")).toContain("GlassSurface");

    expect(read("components/shooting-profile/sequence-viewer.tsx")).not.toContain("GlassSurface");
    expect(read("components/skeleton/skeleton-glyph.tsx")).not.toContain("GlassSurface");
    expect(read("components/reels/reel-progress.tsx")).not.toContain("GlassSurface");
  });

  it("keeps Reels caption and progress outside glass controls", () => {
    const overlay = read("components/reels/reel-overlay.tsx");
    expect(overlay).toContain("<GlassSurface");
    expect(overlay).toContain("<ReelProgress");
    expect(overlay).toContain("style={styles.caption}");
  });

  it("keeps touch feedback and 44-point control contracts after glass wrapping", () => {
    for (const file of [
      "components/hoophub-tab-bar.tsx",
      "components/reels/reel-overlay.tsx",
      "components/shooting-profile/capture-session.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("pressed &&");
      expect(source, file).toMatch(/(?:minHeight|height): (?:44|48|CONTROL)/);
    }
  });
});
