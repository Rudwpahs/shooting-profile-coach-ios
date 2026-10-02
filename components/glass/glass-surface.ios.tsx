import { useRef, type PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

import { tokens } from "@/constants/tokens";
import { GLASS_PRESETS, type GlassTint, type GlassVariant } from "@/lib/glass/glass-tokens";

export type GlassSurfaceProps = PropsWithChildren<ViewProps & {
  variant: GlassVariant;
  interactive?: boolean;
  tint?: GlassTint;
}>;

function GraphiteGlassFallback({
  variant,
  tint = "neutral",
  style,
  children,
  ...viewProps
}: Omit<GlassSurfaceProps, "interactive">) {
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

export function GlassSurface({
  variant,
  interactive = false,
  tint = "neutral",
  style,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  // expo-glass-effect documents interactivity as a mount-time concern. Keep it
  // stable rather than mutating the native backing view after creation.
  const interactiveAtMount = useRef(interactive).current;
  const preset = GLASS_PRESETS[variant];

  if (!isLiquidGlassAvailable()) {
    return (
      <GraphiteGlassFallback variant={variant} tint={tint} style={style} {...viewProps}>
        {children}
      </GraphiteGlassFallback>
    );
  }

  const glassEffectStyle = variant === "bar" || variant === "panel" ? "regular" : "clear";

  return (
    <GlassView
      {...viewProps}
      glassEffectStyle={glassEffectStyle}
      isInteractive={interactiveAtMount}
      tintColor={tint === "volt" ? tokens.primarySoft : undefined}
      style={[
        styles.base,
        {
          borderRadius: preset.cornerRadius,
          borderColor: tint === "volt" ? tokens.primary : tokens.border,
        },
        style,
      ]}
    >
      {children}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: "hidden",
  },
});

export default GlassSurface;
