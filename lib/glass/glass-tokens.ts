export type GlassVariant = "bar" | "chip" | "button" | "panel";
export type GlassTint = "neutral" | "volt";

export type GlassPreset = {
  blurRadius: number;
  refraction: number;
  glareOpacity: number;
  tintOpacity: number;
  borderOpacity: number;
  cornerRadius: number;
};

/**
 * Product-owned medium-strength glass values. These are intentionally fixed:
 * Hoop Hub screens choose semantic variants rather than tuning optics locally.
 */
export const GLASS_PRESETS = {
  bar: {
    blurRadius: 26,
    refraction: 0.12,
    glareOpacity: 0.18,
    tintOpacity: 0.2,
    borderOpacity: 0.52,
    cornerRadius: 28,
  },
  chip: {
    blurRadius: 16,
    refraction: 0.14,
    glareOpacity: 0.22,
    tintOpacity: 0.14,
    borderOpacity: 0.58,
    cornerRadius: 18,
  },
  button: {
    blurRadius: 18,
    refraction: 0.16,
    glareOpacity: 0.24,
    tintOpacity: 0.16,
    borderOpacity: 0.6,
    cornerRadius: 22,
  },
  panel: {
    blurRadius: 24,
    refraction: 0.1,
    glareOpacity: 0.16,
    tintOpacity: 0.22,
    borderOpacity: 0.5,
    cornerRadius: 26,
  },
} as const satisfies Record<GlassVariant, GlassPreset>;
