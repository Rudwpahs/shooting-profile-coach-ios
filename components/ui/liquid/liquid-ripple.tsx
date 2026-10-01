import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ColorValue, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { tokens } from "@/constants/tokens";

import { resolveLiquidMotion } from "./liquid-motion";
import type { LiquidPoint, LiquidSize } from "./magnetic-target";
import { resolveRippleOrigin, rippleCanvasDiameter, rippleTransform } from "./ripple-geometry";
import { useLiquidReduceMotion } from "./use-liquid-reduce-motion";

export type LiquidRippleHandle = {
  /** Start a ripple at a point local to the surface (centre when omitted). */
  begin(point?: Partial<LiquidPoint> | null): void;
  /** Let the ripple fade out (release). */
  end(): void;
};

export type LiquidRippleProps = {
  /** Token colour of the ripple; defaults to the foreground token. */
  color?: ColorValue;
  /** Uniform corner radius of the owning surface, so the ripple clips to its shape. */
  borderRadius?: number;
  /** Force the Reduce Motion fallback. Can only add reduction, never remove it. */
  forceReducedMotion?: boolean;
  testID?: string;
};

/**
 * A liquid ripple: a soft disc that swells from the touch point to the far
 * corner of its surface and fades on release. It is decorative only: hidden
 * from assistive technology, never a pointer target, clipped to the owning
 * surface, and animated with transform and opacity alone (the disc is sized
 * once per layout, so no ripple ever causes a reflow).
 *
 * Under Reduce Motion it becomes a flat state layer that fades in place.
 * Place it as the last child of the surface it belongs to; points passed to
 * `begin` are in that surface's coordinates.
 */
export const LiquidRipple = forwardRef<LiquidRippleHandle, LiquidRippleProps>(function LiquidRipple(
  { color = tokens.foreground, borderRadius = 0, forceReducedMotion, testID = "liquid-ripple" },
  ref,
) {
  const reduced = useLiquidReduceMotion(forceReducedMotion);
  const ripple = useMemo(() => resolveLiquidMotion(reduced).ripple, [reduced]);
  const easing = useMemo(() => Easing.bezier(...ripple.easing), [ripple]);

  const size = useRef<LiquidSize>({ width: 0, height: 0 });
  const [diameter, setDiameter] = useState(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    size.current = { width, height };
    setDiameter(rippleCanvasDiameter(size.current));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      begin(point) {
        if (ripple.mode === "none") return;
        const surface = size.current;
        // The plan already decides reduction; Reanimated's launch-time snapshot must not override it.
        const fadeIn = { duration: ripple.inMs, reduceMotion: ReduceMotion.Never };
        if (ripple.mode === "fade") {
          const cover = rippleTransform({ x: surface.width / 2, y: surface.height / 2 }, surface, 1);
          translateX.set(cover.translateX);
          translateY.set(cover.translateY);
          scale.set(cover.endScale);
          opacity.set(withTiming(ripple.peakOpacity, fadeIn));
          return;
        }
        const t = rippleTransform(resolveRippleOrigin(point, surface), surface, ripple.startScale);
        translateX.set(t.translateX);
        translateY.set(t.translateY);
        scale.set(t.startScale);
        scale.set(withTiming(t.endScale, { duration: ripple.expandMs, easing, reduceMotion: ReduceMotion.Never }));
        opacity.set(withTiming(ripple.peakOpacity, fadeIn));
      },
      end() {
        if (ripple.mode === "none") return;
        opacity.set(withTiming(0, { duration: ripple.fadeMs, reduceMotion: ReduceMotion.Never }));
      },
    }),
    [ripple, easing, translateX, translateY, scale, opacity],
  );

  const discMotion = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: translateX.get() }, { translateY: translateY.get() }, { scale: scale.get() }],
  }));

  return (
    <View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[styles.layer, { borderRadius }]}
    >
      <Animated.View
        style={[styles.disc, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: color }, discMotion]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "hidden", pointerEvents: "none" },
  disc: { left: 0, opacity: 0, position: "absolute", top: 0 },
});
