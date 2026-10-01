import { forwardRef, useEffect, useRef, type ComponentProps } from "react";
import { View } from "react-native";

/**
 * Test double for react-native-reanimated in the jsdom render suite.
 *
 * The real library cannot load under Vitest: react-native-worklets resolves
 * its native TurboModule spec at import time. This double keeps the public
 * shape the liquid primitives use (shared values with get/set, animated
 * styles, spring and timing drivers, ReduceMotion) and records every
 * animation request. Drivers resolve instantly to their target, and
 * `evaluateAnimatedStyles()` re-runs every mounted animated-style factory, so
 * a test can read the exact transform a surface would come to rest at. The
 * real integration is exercised by the Expo web export and the browser smoke
 * test, which compile the primitives with the worklets plugin.
 */
export type AnimationCall = { kind: "spring" | "timing"; toValue: number; config: Record<string, unknown> | undefined };
export const animationCalls: AnimationCall[] = [];
const styleFactories = new Set<() => unknown>();

export function resetAnimationCalls() {
  animationCalls.length = 0;
}

/** Current output of every mounted animated style, in mount order. */
export function evaluateAnimatedStyles(): Record<string, unknown>[] {
  return Array.from(styleFactories, (factory) => factory() as Record<string, unknown>);
}

type SharedValue<T> = { value: T; get(): T; set(next: T | ((current: T) => T)): void };

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const ref = useRef<SharedValue<T> | null>(null);
  if (ref.current === null) {
    const shared: SharedValue<T> = {
      value: initial,
      get() {
        return shared.value;
      },
      set(next) {
        shared.value = typeof next === "function" ? (next as (current: T) => T)(shared.value) : next;
      },
    };
    ref.current = shared;
  }
  return ref.current;
}

export function useAnimatedStyle<T>(factory: () => T): T {
  const registered = useRef<(() => T) | null>(null);
  if (registered.current) styleFactories.delete(registered.current);
  registered.current = factory;
  styleFactories.add(factory);
  useEffect(
    () => () => {
      if (registered.current) styleFactories.delete(registered.current);
    },
    [],
  );
  return factory();
}

export function withSpring(toValue: number, config?: Record<string, unknown>): number {
  animationCalls.push({ kind: "spring", toValue, config });
  return toValue;
}

export function withTiming(toValue: number, config?: Record<string, unknown>): number {
  animationCalls.push({ kind: "timing", toValue, config });
  return toValue;
}

export function cancelAnimation(): void {}

export const ReduceMotion = { System: "system", Always: "always", Never: "never" } as const;

const identity = (t: number) => t;
export const Easing = {
  linear: identity,
  bezier: () => ({ factory: () => identity }),
  out: (easing: (t: number) => number) => easing,
  cubic: identity,
};

const AnimatedView = forwardRef<View, ComponentProps<typeof View>>(function AnimatedView(props, ref) {
  return <View ref={ref} {...props} />;
});

const Animated = { View: AnimatedView };
export default Animated;
