import { describe, expect, it } from "vitest";

import { selectGlassBackend } from "@/lib/glass/glass-capabilities";

describe("glass backend selection", () => {
  it("selects native Liquid Glass only on supported iOS", () => {
    expect(selectGlassBackend({ platform: "ios", liquidGlass: true, webgl2: false, backdropFilter: false })).toBe("native-liquid");
    expect(selectGlassBackend({ platform: "ios", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
  });

  it("prefers the bounded web renderer, then CSS blur, then Graphite", () => {
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: true, backdropFilter: true })).toBe("web-optical");
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: false, backdropFilter: true })).toBe("web-css");
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
  });

  it("never selects glass on generic native platforms", () => {
    expect(selectGlassBackend({ platform: "android", liquidGlass: true, webgl2: true, backdropFilter: true })).toBe("graphite");
    expect(selectGlassBackend({ platform: "native", liquidGlass: true, webgl2: true, backdropFilter: true })).toBe("graphite");
  });
});
