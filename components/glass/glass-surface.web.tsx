import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";

import { tokens } from "@/constants/tokens";
import { selectGlassBackend } from "@/lib/glass/glass-capabilities";
import { GLASS_PRESETS, type GlassTint, type GlassVariant } from "@/lib/glass/glass-tokens";

export type GlassSurfaceProps = PropsWithChildren<ViewProps & {
  variant: GlassVariant;
  interactive?: boolean;
  tint?: GlassTint;
}>;

type WebGlassStyle = ViewStyle & {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
};

function supportsBackdropFilter() {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return CSS.supports("backdrop-filter", "blur(1px)")
    || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
}

export function GlassSurface({
  variant,
  interactive: _interactive = false,
  tint = "neutral",
  style,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const preset = GLASS_PRESETS[variant];
  // This implementation owns CSS backdrop blur. A future optical/WebGL
  // implementation can opt into the separate web-optical backend explicitly.
  const backend = selectGlassBackend({
    platform: "web",
    liquidGlass: false,
    webgl2: false,
    backdropFilter: supportsBackdropFilter(),
  });
  const glassEnabled = backend === "web-css";
  const fallbackBackground = tint === "volt" ? tokens.elevatedSurface : tokens.surface;

  const webGlassStyle: WebGlassStyle | undefined = glassEnabled
    ? {
        backdropFilter: `blur(${preset.blurRadius}px) saturate(132%)`,
        WebkitBackdropFilter: `blur(${preset.blurRadius}px) saturate(132%)`,
      }
    : undefined;

  return (
    <View
      {...viewProps}
      style={[
        styles.base,
        {
          borderRadius: preset.cornerRadius,
          backgroundColor: glassEnabled ? undefined : fallbackBackground,
          borderColor: tint === "volt" ? tokens.primary : tokens.border,
        },
        webGlassStyle,
        style,
      ]}
    >
      {glassEnabled ? (
        <View
          aria-hidden
          pointerEvents="none"
          style={[
            styles.webTint,
            {
              backgroundColor: tint === "volt" ? tokens.primary : tokens.surface,
              opacity: tint === "volt" ? 0.12 : 0.72,
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: "hidden",
  },
  webTint: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default GlassSurface;
