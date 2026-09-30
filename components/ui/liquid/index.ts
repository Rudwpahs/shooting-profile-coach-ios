/**
 * Liquid interaction foundation: reusable press, ripple and magnetic
 * primitives plus their motion tokens. The platform-specific magnetic field
 * is resolved by the bundler (`magnetic-field.web.ts` on web).
 */
export { LiquidPressable, type LiquidPressableProps } from "./liquid-pressable";
export { LiquidRipple, type LiquidRippleHandle, type LiquidRippleProps } from "./liquid-ripple";
export {
  LIQUID_LIMITS,
  LIQUID_MOTION,
  LIQUID_SPRINGS,
  LIQUID_SPRING_BOUNDS,
  clampPressScale,
  clampSpringConfig,
  resolveLiquidMotion,
  springDampingRatio,
  springOvershoot,
  springSettleMs,
  type LiquidMotionOptions,
  type LiquidMotionPlan,
  type LiquidRippleMode,
  type LiquidSpringConfig,
  type LiquidTransition,
} from "./liquid-motion";
export { MAGNETIC_FIELD_SUPPORTED, registerMagneticTarget, type MagneticListener } from "./magnetic-field";
export {
  computeLiquidStretch,
  computeMagneticOffset,
  computeTouchLean,
  distanceOutsideRect,
  type LiquidPoint,
  type LiquidSize,
  type LiquidStretch,
  type MagneticConfig,
} from "./magnetic-target";
export { resolveRippleOrigin, rippleCanvasDiameter, rippleRadius, rippleTransform } from "./ripple-geometry";
export { useLiquidReduceMotion } from "./use-liquid-reduce-motion";
