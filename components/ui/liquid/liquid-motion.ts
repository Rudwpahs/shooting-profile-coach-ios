/**
 * Liquid motion tokens for Hoop Hub (Graphite / Volt).
 *
 * Pure and platform-neutral: no React, React Native or Reanimated import, so
 * contract tests read these values directly and every liquid primitive shares
 * one named source of motion (spring physics, press deformation, magnetic
 * attraction, ripple timing and the Reduce Motion substitutes).
 *
 * Feel: bounce is earned on release only. A press-in and a pointer follow are
 * near-critically damped; the release rebounds once, softly, over a travel of
 * at most a few percent, so it reads as elastic rather than toy-like. Under
 * Reduce Motion every overshoot, drift and self-playing travel is removed and
 * the press becomes a short, bounce-free dim with a small scale nudge.
 */

export type LiquidSpringConfig = {
  stiffness: number;
  damping: number;
  mass: number;
  overshootClamping?: boolean;
};

export type LiquidTransition =
  | { type: "spring"; config: LiquidSpringConfig }
  | { type: "timing"; durationMs: number };

/** Bounds every spring (preset or caller override) must stay inside. */
export const LIQUID_SPRING_BOUNDS = {
  stiffness: { min: 120, max: 900 },
  damping: { min: 10, max: 80 },
  mass: { min: 0.5, max: 2 },
  /** Below 0.5 reads as a toy wobble; above 1.2 reads as drag. */
  dampingRatio: { min: 0.5, max: 1.2 },
  /** Largest overshoot a preset may produce, as a fraction of its travel. */
  maxOvershoot: 0.12,
  /** Longest 2% settling time a preset may take: analysis UI must feel fast. */
  maxSettleMs: 450,
} as const;

/**
 * Spring presets. Response ≈ 2π/ω: press ≈ 0.25 s, release ≈ 0.34 s,
 * magnetic ≈ 0.30 s. Damping ratios: press 0.86, release 0.65, magnetic 1.0.
 */
export const LIQUID_SPRINGS = {
  /** Finger or pointer down: a quick, near-critically damped compression. */
  press: { stiffness: 630, damping: 43, mass: 1 },
  /** Release: one soft rebound past rest, then settle. The "chewy" part. */
  release: { stiffness: 340, damping: 24, mass: 1 },
  /** Pointer attraction: critically damped follow, no ring. */
  magnetic: { stiffness: 440, damping: 42, mass: 1 },
} as const satisfies Record<string, LiquidSpringConfig>;

/** Hard limits for the non-spring tokens. */
export const LIQUID_LIMITS = {
  pressScale: { min: 0.94, max: 0.99 },
  /** Largest anisotropic stretch, as a fraction of the surface size. */
  stretchMax: 0.03,
  /** Largest lean toward a touch point, in px. */
  touchLeanMax: 2.5,
  /** Largest magnetic drift, in px: the visual never strays from its hit area. */
  magneticOffsetMax: 4,
  rippleMs: { min: 200, max: 700 },
  reducedFeedbackMsMax: 150,
} as const;

export const LIQUID_MOTION = {
  press: {
    /** Uniform compression while pressed. */
    scale: 0.965,
    /** Droplet stretch toward the touch axis (thins the other axis by half as much). */
    stretch: 0.018,
    /** Lean toward the touch point, px. */
    touchLean: 2,
  },
  magnetic: {
    /** Distance beyond the edge (px) at which attraction starts. */
    radius: 28,
    /** Fraction of the pointer's offset from centre the surface follows. */
    strength: 0.14,
    /** Absolute cap on drift, px. */
    maxOffset: 3,
  },
  ripple: {
    /** Quick fade-in so the ripple lands on touch-down. */
    inMs: 90,
    expandMs: 460,
    fadeMs: 280,
    peakOpacity: 0.14,
    /** Starting radius as a fraction of the final radius. */
    startScale: 0.2,
    /** Fast-out, long soft tail: cubic-bezier control points. */
    easing: [0.2, 0.85, 0.25, 1] as const,
  },
  reduced: {
    /** Short, bounce-free feedback (the 0.1–0.15 s "shortened" rung). */
    feedbackMs: 120,
    /** ≤5% scale nudge, the safe Reduce Motion substitute for a press. */
    pressedScale: 0.98,
    /** The crossfade rung: the pressed surface dims. */
    pressedOpacity: 0.72,
    /** Flat state-layer fade in place of the expanding ripple. */
    ripplePeakOpacity: 0.1,
    rippleFadeMs: 160,
  },
} as const;

export type LiquidRippleMode = "liquid" | "fade" | "none";

export type LiquidMotionPlan = {
  reduced: boolean;
  pressIn: LiquidTransition;
  release: LiquidTransition;
  pressedScale: number;
  pressedOpacity: number;
  /** 0 disables stretch. */
  stretch: number;
  /** 0 disables the lean toward the touch point. */
  touchLean: number;
  magnetic: {
    enabled: boolean;
    radius: number;
    strength: number;
    maxOffset: number;
    transition: LiquidTransition;
  };
  ripple: {
    mode: LiquidRippleMode;
    inMs: number;
    /** 0 means no expansion (fade in place). */
    expandMs: number;
    fadeMs: number;
    peakOpacity: number;
    startScale: number;
    easing: readonly [number, number, number, number];
  };
};

export type LiquidMotionOptions = {
  pressScale?: number;
  ripple?: boolean;
  magnetic?: boolean;
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** ζ = c / (2·√(k·m)). */
export function springDampingRatio(config: LiquidSpringConfig): number {
  return config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
}

/** Peak overshoot of a step response from rest, as a fraction of the travel. */
export function springOvershoot(config: LiquidSpringConfig): number {
  const zeta = springDampingRatio(config);
  if (config.overshootClamping || zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}

/**
 * Time (ms) until a unit step response stays within 2% of rest, found by
 * integrating the spring rather than by an envelope approximation, so it is
 * exact enough near critical damping too.
 */
export function springSettleMs(config: LiquidSpringConfig): number {
  const dt = 0.00025;
  const limit = 3;
  let x = 1;
  let v = 0;
  let lastOutside = 0;
  for (let t = 0; t < limit; t += dt) {
    const a = (-config.stiffness * x - config.damping * v) / config.mass;
    v += a * dt;
    x += v * dt;
    if (config.overshootClamping && x < 0) {
      x = 0;
      v = 0;
    }
    if (Math.abs(x) > 0.02) lastOutside = t + dt;
  }
  return lastOutside * 1000;
}

export function clampSpringConfig(config: LiquidSpringConfig): LiquidSpringConfig {
  const { stiffness, damping, mass } = LIQUID_SPRING_BOUNDS;
  return {
    stiffness: clamp(config.stiffness, stiffness.min, stiffness.max, LIQUID_SPRINGS.press.stiffness),
    damping: clamp(config.damping, damping.min, damping.max, LIQUID_SPRINGS.press.damping),
    mass: clamp(config.mass, mass.min, mass.max, LIQUID_SPRINGS.press.mass),
    ...(config.overshootClamping ? { overshootClamping: true } : {}),
  };
}

export function clampPressScale(value: number | undefined): number {
  if (value === undefined) return LIQUID_MOTION.press.scale;
  return clamp(value, LIQUID_LIMITS.pressScale.min, LIQUID_LIMITS.pressScale.max, LIQUID_MOTION.press.scale);
}

/**
 * The motion a liquid surface should use. `null` (the system setting not yet
 * known) counts as reduced, like the rest of the app, so nothing bounces
 * before the answer arrives.
 */
export function resolveLiquidMotion(reduceMotion: boolean | null, options: LiquidMotionOptions = {}): LiquidMotionPlan {
  const reduced = reduceMotion !== false;
  const rippleOn = options.ripple !== false;
  const magneticOn = options.magnetic !== false;

  if (reduced) {
    const short: LiquidTransition = { type: "timing", durationMs: LIQUID_MOTION.reduced.feedbackMs };
    return {
      reduced: true,
      pressIn: short,
      release: short,
      pressedScale: Math.max(LIQUID_MOTION.reduced.pressedScale, clampPressScale(options.pressScale)),
      pressedOpacity: LIQUID_MOTION.reduced.pressedOpacity,
      stretch: 0,
      touchLean: 0,
      magnetic: { enabled: false, radius: 0, strength: 0, maxOffset: 0, transition: short },
      ripple: {
        mode: rippleOn ? "fade" : "none",
        inMs: LIQUID_MOTION.reduced.feedbackMs,
        expandMs: 0,
        fadeMs: LIQUID_MOTION.reduced.rippleFadeMs,
        peakOpacity: LIQUID_MOTION.reduced.ripplePeakOpacity,
        startScale: 1,
        easing: LIQUID_MOTION.ripple.easing,
      },
    };
  }

  return {
    reduced: false,
    pressIn: { type: "spring", config: LIQUID_SPRINGS.press },
    release: { type: "spring", config: LIQUID_SPRINGS.release },
    pressedScale: clampPressScale(options.pressScale),
    pressedOpacity: 1,
    stretch: LIQUID_MOTION.press.stretch,
    touchLean: LIQUID_MOTION.press.touchLean,
    magnetic: magneticOn
      ? { enabled: true, ...LIQUID_MOTION.magnetic, transition: { type: "spring", config: LIQUID_SPRINGS.magnetic } }
      : { enabled: false, radius: 0, strength: 0, maxOffset: 0, transition: { type: "spring", config: LIQUID_SPRINGS.magnetic } },
    ripple: {
      mode: rippleOn ? "liquid" : "none",
      inMs: LIQUID_MOTION.ripple.inMs,
      expandMs: LIQUID_MOTION.ripple.expandMs,
      fadeMs: LIQUID_MOTION.ripple.fadeMs,
      peakOpacity: LIQUID_MOTION.ripple.peakOpacity,
      startScale: LIQUID_MOTION.ripple.startScale,
      easing: LIQUID_MOTION.ripple.easing,
    },
  };
}
