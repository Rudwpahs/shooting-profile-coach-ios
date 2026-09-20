export type GlassPlatform = "ios" | "web" | "android" | "native";
export type GlassBackend = "native-liquid" | "web-optical" | "web-css" | "graphite";

export type GlassCapabilitySnapshot = {
  platform: GlassPlatform;
  liquidGlass: boolean;
  webgl2: boolean;
  backdropFilter: boolean;
};

/** Pure backend selection so platform capability policy is testable without native modules. */
export function selectGlassBackend(capabilities: GlassCapabilitySnapshot): GlassBackend {
  if (capabilities.platform === "ios") {
    return capabilities.liquidGlass ? "native-liquid" : "graphite";
  }

  if (capabilities.platform === "web") {
    if (capabilities.webgl2) return "web-optical";
    if (capabilities.backdropFilter) return "web-css";
  }

  return "graphite";
}
