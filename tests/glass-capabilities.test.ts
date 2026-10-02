import { describe, expect, it } from "vitest";

import { selectGlassBackend } from "@/lib/glass/glass-capabilities";

describe("Glass capability policy", () => {
  it("uses native Liquid Glass only when iOS actually exposes it", () => {
    expect(selectGlassBackend({ platform: "ios", liquidGlass: true, webgl2: false, backdropFilter: false })).toBe("native-liquid");
    expect(selectGlassBackend({ platform: "ios", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
  });

  it("falls through web optical, CSS blur, then opaque Graphite", () => {
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: true, backdropFilter: true })).toBe("web-optical");
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: false, backdropFilter: true })).toBe("web-css");
    expect(selectGlassBackend({ platform: "web", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
  });

  it("keeps unsupported native platforms on the opaque fallback", () => {
    expect(selectGlassBackend({ platform: "android", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
    expect(selectGlassBackend({ platform: "native", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
  });
});
