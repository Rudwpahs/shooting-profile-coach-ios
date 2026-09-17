import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { tokens } from "@/constants/tokens";
import { GLASS_PRESETS, type GlassTint, type GlassVariant } from "@/lib/glass/glass-tokens";

export type GlassSurfaceProps = PropsWithChildren<ViewProps & {
  variant: GlassVariant;
  interactive?: boolean;
  tint?: GlassTint;
}>;

export function GlassSurface({
  variant,
  interactive: _interactive = false,
  tint = "neutral",
  style,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const preset = GLASS_PRESETS[variant];
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
