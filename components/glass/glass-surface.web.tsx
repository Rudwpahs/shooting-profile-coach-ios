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
  const backend = selectGlassBackend({
    platform: "web",
    liquidGlass: false,
    webgl2: typeof WebGL2RenderingContext !== "undefined",
    backdropFilter: supportsBackdropFilter(),
  });

  const webGlassStyle: WebGlassStyle | undefined = backend === "web-optical" || backend === "web-css"
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
          backgroundColor: tint === "volt" ? tokens.primarySoft : tokens.surface,
          borderColor: tint === "volt" ? tokens.primary : tokens.border,
        },
        webGlassStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: "hidden",
  },
});

export default GlassSurface;
