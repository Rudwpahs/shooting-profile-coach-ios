type Swatch = { light: string; dark: string };

/** Keep in step with theme.config.js; tests/ui-tokens.test.ts checks every name resolves. */
export const themeColors: {
  background: Swatch;
  surface: Swatch;
  elevatedSurface: Swatch;
  foreground: Swatch;
  mutedForeground: Swatch;
  border: Swatch;
  primary: Swatch;
  primaryForeground: Swatch;
  primarySoft: Swatch;
  skeletonPrimary: Swatch;
  skeletonSecondary: Swatch;
  skeletonDerived: Swatch;
  stage: Swatch;
  stageForeground: Swatch;
  positive: Swatch;
  positiveSoft: Swatch;
  warning: Swatch;
  warningSoft: Swatch;
  destructive: Swatch;
  destructiveSoft: Swatch;
  analysisLowConfidence: Swatch;
  analysisHighConfidence: Swatch;
  focusRing: Swatch;
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
