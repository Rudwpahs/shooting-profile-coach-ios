import { describe, expect, it } from "vitest";

import {
  LIQUID_LIMITS,
  LIQUID_MOTION,
  LIQUID_SPRING_BOUNDS,
  LIQUID_SPRINGS,
  clampPressScale,
  clampSpringConfig,
  resolveLiquidMotion,
  springDampingRatio,
  springOvershoot,
  springSettleMs,
  type LiquidSpringConfig,
  type LiquidTransition,
} from "@/components/ui/liquid/liquid-motion";

const PRESETS = Object.entries(LIQUID_SPRINGS) as [string, LiquidSpringConfig][];

function transitionOvershoot(transition: LiquidTransition): number {
  return transition.type === "spring" ? springOvershoot(transition.config) : 0;
}

describe("liquid spring presets", () => {
  it("keeps stiffness, damping and mass of every preset inside the declared bounds", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const [name, config] of PRESETS) {
      expect(config.stiffness, `${name}.stiffness`).toBeGreaterThanOrEqual(LIQUID_SPRING_BOUNDS.stiffness.min);
      expect(config.stiffness, `${name}.stiffness`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.stiffness.max);
      expect(config.damping, `${name}.damping`).toBeGreaterThanOrEqual(LIQUID_SPRING_BOUNDS.damping.min);
      expect(config.damping, `${name}.damping`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.damping.max);
      expect(config.mass, `${name}.mass`).toBeGreaterThanOrEqual(LIQUID_SPRING_BOUNDS.mass.min);
      expect(config.mass, `${name}.mass`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.mass.max);
    }
  });

  it("stays between toy-like wobble and sluggish drag (damping ratio window)", () => {
    for (const [name, config] of PRESETS) {
      const zeta = springDampingRatio(config);
      expect(zeta, `${name} ζ`).toBeGreaterThanOrEqual(LIQUID_SPRING_BOUNDS.dampingRatio.min);
      expect(zeta, `${name} ζ`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.dampingRatio.max);
    }
  });

  it("never overshoots past the declared ceiling and settles fast enough for an analysis tool", () => {
    for (const [name, config] of PRESETS) {
      expect(springOvershoot(config), `${name} overshoot`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.maxOvershoot);
      expect(springSettleMs(config), `${name} settle`).toBeLessThanOrEqual(LIQUID_SPRING_BOUNDS.maxSettleMs);
      expect(springSettleMs(config), `${name} settle`).toBeGreaterThan(0);
    }
  });

  it("gives the release a small visible rebound while the press-in stays nearly bounce-free", () => {
    // Bounce is earned on release only; a tap-driven press-in and pointer-follow stay near-critical.
    expect(springDampingRatio(LIQUID_SPRINGS.press)).toBeGreaterThanOrEqual(0.8);
    expect(springDampingRatio(LIQUID_SPRINGS.magnetic)).toBeGreaterThanOrEqual(0.95);
    expect(springDampingRatio(LIQUID_SPRINGS.release)).toBeLessThan(springDampingRatio(LIQUID_SPRINGS.press));
    expect(springOvershoot(LIQUID_SPRINGS.release)).toBeGreaterThan(0.03);
    expect(springOvershoot(LIQUID_SPRINGS.press)).toBeLessThan(0.03);
    expect(springOvershoot(LIQUID_SPRINGS.magnetic)).toBeLessThan(0.01);
  });

  it("computes the second-order spring quantities correctly", () => {
    const critical = { stiffness: 400, damping: 40, mass: 1 };
    expect(springDampingRatio(critical)).toBeCloseTo(1, 6);
    expect(springOvershoot(critical)).toBe(0);
    // ζ = 0.5 → overshoot e^(-π·0.5/√0.75) ≈ 16.3 %
    expect(springOvershoot({ stiffness: 400, damping: 20, mass: 1 })).toBeCloseTo(0.163, 3);
    expect(springOvershoot({ stiffness: 400, damping: 20, mass: 1, overshootClamping: true })).toBe(0);
  });

  it("clamps arbitrary configs into the bounds", () => {
    const wild = clampSpringConfig({ stiffness: 5000, damping: 1, mass: 10 });
    expect(wild.stiffness).toBe(LIQUID_SPRING_BOUNDS.stiffness.max);
    expect(wild.damping).toBe(LIQUID_SPRING_BOUNDS.damping.min);
    expect(wild.mass).toBe(LIQUID_SPRING_BOUNDS.mass.max);
    const nan = clampSpringConfig({ stiffness: Number.NaN, damping: Number.NaN, mass: Number.NaN });
    expect(Number.isFinite(nan.stiffness) && Number.isFinite(nan.damping) && Number.isFinite(nan.mass)).toBe(true);
  });
});

describe("liquid motion tokens", () => {
  it("keeps press, stretch, magnetic and ripple values inside their limits", () => {
    expect(LIQUID_MOTION.press.scale).toBeGreaterThanOrEqual(LIQUID_LIMITS.pressScale.min);
    expect(LIQUID_MOTION.press.scale).toBeLessThanOrEqual(LIQUID_LIMITS.pressScale.max);
    expect(LIQUID_MOTION.press.stretch).toBeGreaterThan(0);
    expect(LIQUID_MOTION.press.stretch).toBeLessThanOrEqual(LIQUID_LIMITS.stretchMax);
    expect(LIQUID_MOTION.press.touchLean).toBeGreaterThan(0);
    expect(LIQUID_MOTION.press.touchLean).toBeLessThanOrEqual(LIQUID_LIMITS.touchLeanMax);
    expect(LIQUID_MOTION.magnetic.maxOffset).toBeGreaterThan(0);
    expect(LIQUID_MOTION.magnetic.maxOffset).toBeLessThanOrEqual(LIQUID_LIMITS.magneticOffsetMax);
    expect(LIQUID_MOTION.magnetic.strength).toBeGreaterThan(0);
    expect(LIQUID_MOTION.magnetic.strength).toBeLessThan(0.5);
    expect(LIQUID_MOTION.magnetic.radius).toBeGreaterThan(0);
    for (const ms of [LIQUID_MOTION.ripple.expandMs, LIQUID_MOTION.ripple.fadeMs]) {
      expect(ms).toBeGreaterThanOrEqual(LIQUID_LIMITS.rippleMs.min);
      expect(ms).toBeLessThanOrEqual(LIQUID_LIMITS.rippleMs.max);
    }
    expect(LIQUID_MOTION.ripple.peakOpacity).toBeGreaterThan(0);
    expect(LIQUID_MOTION.ripple.peakOpacity).toBeLessThanOrEqual(0.25);
    expect(LIQUID_MOTION.reduced.feedbackMs).toBeLessThanOrEqual(LIQUID_LIMITS.reducedFeedbackMsMax);
  });

  it("clamps a caller's press scale so a surface can never collapse or grow on press", () => {
    expect(clampPressScale(0.5)).toBe(LIQUID_LIMITS.pressScale.min);
    expect(clampPressScale(1.2)).toBe(LIQUID_LIMITS.pressScale.max);
    expect(clampPressScale(undefined)).toBe(LIQUID_MOTION.press.scale);
    expect(clampPressScale(Number.NaN)).toBe(LIQUID_MOTION.press.scale);
    expect(clampPressScale(0.97)).toBe(0.97);
  });
});

describe("resolveLiquidMotion", () => {
  it("uses springs, stretch, lean, magnetic attraction and a liquid ripple when motion is allowed", () => {
    const plan = resolveLiquidMotion(false);
    expect(plan.reduced).toBe(false);
    expect(plan.pressIn).toEqual({ type: "spring", config: LIQUID_SPRINGS.press });
    expect(plan.release).toEqual({ type: "spring", config: LIQUID_SPRINGS.release });
    expect(plan.pressedScale).toBe(LIQUID_MOTION.press.scale);
    expect(plan.stretch).toBe(LIQUID_MOTION.press.stretch);
    expect(plan.touchLean).toBe(LIQUID_MOTION.press.touchLean);
    expect(plan.magnetic.enabled).toBe(true);
    expect(plan.magnetic.maxOffset).toBe(LIQUID_MOTION.magnetic.maxOffset);
    expect(plan.magnetic.transition).toEqual({ type: "spring", config: LIQUID_SPRINGS.magnetic });
    expect(plan.ripple.mode).toBe("liquid");
  });

  it("removes every overshoot and bounce under reduced motion", () => {
    const plan = resolveLiquidMotion(true);
    expect(plan.reduced).toBe(true);
    for (const transition of [plan.pressIn, plan.release, plan.magnetic.transition]) {
      expect(transitionOvershoot(transition)).toBe(0);
      expect(transition.type).toBe("timing");
    }
    expect(plan.pressIn.type === "timing" && plan.pressIn.durationMs).toBeLessThanOrEqual(LIQUID_LIMITS.reducedFeedbackMsMax);
  });

  it("removes magnetic drift, stretch and lean under reduced motion, keeping only a small scale nudge", () => {
    const plan = resolveLiquidMotion(true);
    expect(plan.magnetic.enabled).toBe(false);
    expect(plan.magnetic.maxOffset).toBe(0);
    expect(plan.magnetic.strength).toBe(0);
    expect(plan.stretch).toBe(0);
    expect(plan.touchLean).toBe(0);
    // A ≤5% scale change on a short, bounce-free ease is a safe Reduce Motion substitute,
    // and never larger than the full-motion press.
    expect(plan.pressedScale).toBeGreaterThanOrEqual(0.95);
    expect(plan.pressedScale).toBeLessThan(1);
    expect(plan.pressedScale).toBeGreaterThanOrEqual(resolveLiquidMotion(false).pressedScale);
  });

  it("simplifies the ripple to a flat fade but keeps the pressed state clearly visible", () => {
    const plan = resolveLiquidMotion(true);
    expect(plan.ripple.mode).toBe("fade");
    expect(plan.ripple.expandMs).toBe(0);
    expect(plan.ripple.fadeMs).toBeLessThanOrEqual(LIQUID_LIMITS.reducedFeedbackMsMax * 2);
    // State stays legible: the surface visibly dims while pressed (a crossfade, not travel).
    expect(plan.pressedOpacity).toBeLessThanOrEqual(0.8);
    expect(plan.pressedOpacity).toBeGreaterThanOrEqual(0.5);
    // Full motion does not dim; scale and ripple carry the press.
    expect(resolveLiquidMotion(false).pressedOpacity).toBe(1);
  });

  it("keeps reduced-motion feedback inside the 0.1–0.15 s shortened band", () => {
    const plan = resolveLiquidMotion(true);
    for (const transition of [plan.pressIn, plan.release]) {
      expect(transition.type).toBe("timing");
      if (transition.type === "timing") {
        expect(transition.durationMs).toBeGreaterThanOrEqual(80);
        expect(transition.durationMs).toBeLessThanOrEqual(150);
      }
    }
  });

  it("treats an unresolved system setting (null) as reduced, like the rest of the app", () => {
    expect(resolveLiquidMotion(null)).toEqual(resolveLiquidMotion(true));
  });

  it("honours per-surface opt-outs and a clamped custom press scale", () => {
    const plan = resolveLiquidMotion(false, { ripple: false, magnetic: false, pressScale: 0.1 });
    expect(plan.ripple.mode).toBe("none");
    expect(plan.magnetic.enabled).toBe(false);
    expect(plan.magnetic.maxOffset).toBe(0);
    expect(plan.pressedScale).toBe(LIQUID_LIMITS.pressScale.min);
    expect(resolveLiquidMotion(true, { ripple: false }).ripple.mode).toBe("none");
  });
});
