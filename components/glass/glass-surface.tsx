import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { tokens } from "@/constants/tokens";
import { GLASS_PRESETS, type GlassTint, type GlassVariant } from "@/lib/glass/glass-tokens";

export type GlassSurfaceProps = PropsWithChildren<ViewProps & {
  variant: GlassVariant;
  interactive?: boolean;
  tint?: GlassTint;
}>;

/**
 * Opaque Graphite fallback. Platform-specific files override this module on
 * iOS and web. The fallback is deliberately opaque so unsupported platforms
 * never end up with unreadable translucent chrome.
 */
export function GlassSurface({
  variant,
  interactive: _interactive = false,
  tint = "neutral",
  style,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const preset = GLASS_PRESETS[variant];
  const backgroundColor = tint === "volt" ? tokens.elevatedSurface : tokens.surface;

  return (
    <View
      {...viewProps}
      style={[
        styles.base,
        {
          borderRadius: preset.cornerRadius,
          backgroundColor,
          borderColor: tint === "volt" ? tokens.primary : tokens.border,
        },
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
