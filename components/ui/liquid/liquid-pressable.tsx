import { forwardRef, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  type ColorValue,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { tokens } from "@/constants/tokens";

import { resolveLiquidMotion, type LiquidTransition } from "./liquid-motion";
import { LiquidRipple, type LiquidRippleHandle } from "./liquid-ripple";
import { registerMagneticTarget } from "./magnetic-field";
import { computeLiquidStretch, computeMagneticOffset, computeTouchLean, type LiquidPoint } from "./magnetic-target";
import { resolveRippleOrigin } from "./ripple-geometry";
import { useLiquidReduceMotion } from "./use-liquid-reduce-motion";

export type LiquidPressableProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  /** Placement and size of the hit area. The hit area itself never moves. */
  style?: StyleProp<ViewStyle>;
  /** The visible surface (background, radius, padding, border). This is what moves. */
  surfaceStyle?: StyleProp<ViewStyle>;
  /** Liquid ripple from the press point. On by default. */
  ripple?: boolean;
  /** Token colour of the ripple; use `tokens.primaryForeground` on Volt surfaces. */
  rippleColor?: ColorValue;
  /** Web only: drift a few px toward a nearby mouse pointer. Off by default. */
  magnetic?: boolean;
  /** Pressed scale, clamped to the liquid limits. */
  pressScale?: number;
  /**
   * Force the Reduce Motion fallback (showcases, tests, contexts that must stay
   * still). It can only add reduction: a user's system setting always wins.
   */
  forceReducedMotion?: boolean;
};

type Frame = { x: number; y: number; width: number; height: number };

const REST = 0;
/** Magnetic updates smaller than this (px) are not worth a new spring. */
const MAGNETIC_EPSILON = 0.05;
const EMPTY_FRAME: Frame = { x: 0, y: 0, width: 0, height: 0 };

/** Every animation opts out of Reanimated's launch-time Reduce Motion snapshot: the plan already decided. */
function animateTo(target: number, transition: LiquidTransition): number {
  return transition.type === "spring"
    ? withSpring(target, { ...transition.config, reduceMotion: ReduceMotion.Never })
    : withTiming(target, { duration: transition.durationMs, reduceMotion: ReduceMotion.Never });
}

/**
 * Press location in the hit area's coordinates. The hit area is the touch
 * target on every platform (children are `box-only`-excluded), so react-native
 * and react-native-web both report `locationX/Y` relative to it. Keyboard and
 * assistive activation carry no location.
 */
function hitAreaPoint(event: GestureResponderEvent | undefined): Partial<LiquidPoint> | null {
  const native = event?.nativeEvent as Partial<{ locationX: number; locationY: number }> | undefined;
  if (!native || typeof native.locationX !== "number" || typeof native.locationY !== "number") return null;
  return { x: native.locationX, y: native.locationY };
}

/**
 * A pressable with liquid feedback: it compresses on a near-critical spring
 * the moment it is touched, leans and stretches slightly toward the touch
 * point, rebounds once on release, can swell a liquid ripple from the press
 * point and, on web, drift a few px toward a nearby mouse pointer.
 *
 * Semantics stay those of a plain `Pressable`: role (a button unless the
 * caller says otherwise), label, state, `onPress` and keyboard activation
 * are untouched. Only the inner visual surface moves; the hit area and the
 * accessibility element never do, so the target a finger, pointer or screen
 * reader finds is always where the layout put it. The hit area is the touch
 * target and its children are presentational: do not nest interactive
 * controls inside.
 *
 * Under Reduce Motion there is no spring, bounce, stretch, lean or drift: a
 * press is a short dim with a small scale nudge and the ripple is a flat fade.
 */
export const LiquidPressable = forwardRef<View, LiquidPressableProps>(function LiquidPressable(props, ref) {
  const {
    children,
    style,
    surfaceStyle,
    ripple = true,
    rippleColor = tokens.foreground,
    magnetic = false,
    pressScale,
    forceReducedMotion,
    disabled,
    onPressIn,
    onPressOut,
    onLayout,
    ...pressableProps
  } = props;

  const reduced = useLiquidReduceMotion(forceReducedMotion);
  const plan = useMemo(() => resolveLiquidMotion(reduced, { pressScale, ripple, magnetic }), [reduced, pressScale, ripple, magnetic]);

  const hitArea = useRef<View | null>(null);
  const hitFrame = useRef<Frame>(EMPTY_FRAME);
  const surfaceFrame = useRef<Frame>(EMPTY_FRAME);
  const rippleRef = useRef<LiquidRippleHandle>(null);
  const lastMagnetic = useRef<LiquidPoint>({ x: REST, y: REST });

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const leanX = useSharedValue(REST);
  const leanY = useSharedValue(REST);
  const stretchX = useSharedValue(1);
  const stretchY = useSharedValue(1);
  const magneticX = useSharedValue(REST);
  const magneticY = useSharedValue(REST);

  const setHitArea = useCallback(
    (node: View | null) => {
      hitArea.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const handleHitLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      hitFrame.current = { x: 0, y: 0, width, height };
      onLayout?.(event);
    },
    [onLayout],
  );

  /** The surface's frame inside its hit area (layout frame: unaffected by the surface's own transform). */
  const handleSurfaceLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    surfaceFrame.current = { x, y, width, height };
  }, []);

  /** Converts a hit-area point into the surface's frame (falls back to the hit area before the surface is measured). */
  const toSurface = useCallback((point: Partial<LiquidPoint> | null) => {
    const frame = surfaceFrame.current.width > 0 ? surfaceFrame.current : hitFrame.current;
    const size = { width: frame.width, height: frame.height };
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") return { point: null, size };
    return { point: { x: point.x - frame.x, y: point.y - frame.y }, size };
  }, []);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      const local = toSurface(hitAreaPoint(event));
      const origin = resolveRippleOrigin(local.point, local.size);
      scale.set(animateTo(plan.pressedScale, plan.pressIn));
      opacity.set(animateTo(plan.pressedOpacity, plan.pressIn));
      const lean = computeTouchLean(origin, local.size, plan.touchLean);
      leanX.set(animateTo(lean.x, plan.pressIn));
      leanY.set(animateTo(lean.y, plan.pressIn));
      const stretch = computeLiquidStretch(origin, local.size, plan.stretch);
      stretchX.set(animateTo(stretch.scaleX, plan.pressIn));
      stretchY.set(animateTo(stretch.scaleY, plan.pressIn));
      rippleRef.current?.begin(local.point);
      onPressIn?.(event);
    },
    [plan, toSurface, onPressIn, scale, opacity, leanX, leanY, stretchX, stretchY],
  );

  // Release always returns every channel to rest, whatever the plan is now:
  // a setting that changed mid-press must never leave the surface dimmed or leaning.
  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      scale.set(animateTo(1, plan.release));
      opacity.set(animateTo(1, plan.release));
      leanX.set(animateTo(REST, plan.release));
      leanY.set(animateTo(REST, plan.release));
      stretchX.set(animateTo(1, plan.release));
      stretchY.set(animateTo(1, plan.release));
      rippleRef.current?.end();
      onPressOut?.(event);
    },
    [plan, onPressOut, scale, opacity, leanX, leanY, stretchX, stretchY],
  );

  const magneticField = plan.magnetic;
  const magneticActive = magnetic && !disabled && magneticField.enabled;
  useEffect(() => {
    if (!magneticActive) {
      magneticX.set(REST);
      magneticY.set(REST);
      lastMagnetic.current = { x: REST, y: REST };
      return;
    }
    return registerMagneticTarget(hitArea.current, { radius: magneticField.radius }, (pointer, hitSize) => {
      if (hitFrame.current.width === 0) hitFrame.current = { x: 0, y: 0, ...hitSize };
      const local = toSurface(pointer);
      const offset = local.point ? computeMagneticOffset(local.point, local.size, magneticField) : { x: REST, y: REST };
      const last = lastMagnetic.current;
      if (Math.abs(offset.x - last.x) < MAGNETIC_EPSILON && Math.abs(offset.y - last.y) < MAGNETIC_EPSILON) return;
      lastMagnetic.current = offset;
      magneticX.set(animateTo(offset.x, magneticField.transition));
      magneticY.set(animateTo(offset.y, magneticField.transition));
    });
  }, [magneticActive, magneticField, toSurface, magneticX, magneticY]);

  const surfaceMotion = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [
      { translateX: leanX.get() + magneticX.get() },
      { translateY: leanY.get() + magneticY.get() },
      { scaleX: scale.get() * stretchX.get() },
      { scaleY: scale.get() * stretchY.get() },
    ],
  }));

  const flatSurface = StyleSheet.flatten(surfaceStyle);
  const surfaceRadius = typeof flatSurface?.borderRadius === "number" ? flatSurface.borderRadius : 0;
  const defaultRole = pressableProps.role || pressableProps.accessibilityRole ? {} : { accessibilityRole: "button" as const };

  return (
    <Pressable
      ref={setHitArea}
      {...defaultRole}
      {...pressableProps}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLayout={handleHitLayout}
      style={[styles.hitArea, style]}
    >
      <Animated.View onLayout={handleSurfaceLayout} style={[styles.surface, surfaceStyle, surfaceMotion]}>
        {children}
        {plan.ripple.mode !== "none" ? (
          <LiquidRipple ref={rippleRef} color={rippleColor} borderRadius={surfaceRadius} forceReducedMotion={reduced} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // box-only: the hit area itself is the touch target on every platform, so
  // press coordinates always arrive in its frame and children never intercept.
  hitArea: { pointerEvents: "box-only" },
  surface: { flexGrow: 1 },
});
