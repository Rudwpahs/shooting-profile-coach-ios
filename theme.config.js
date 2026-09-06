/**
 * Semantic colour tokens for Hoop Hub.
 *
 * `dark` is Direction A "Graphite / Volt" (docs/uiux/2026-09-06-screen-inventory-and-visual-directions.md)
 * and is the scheme the app ships with. `light` is a consistent counterpart kept for the theme lab and
 * future expansion; no product screen selects it today.
 *
 * Skeleton surfaces (`stage`) stay dark in both schemes so the skeleton, the product's identity element,
 * always sits on the same ground.
 */
/** @type {const} */
const themeColors = {
  background: { light: "#F4F4F1", dark: "#0F1012" },
  surface: { light: "#FFFFFF", dark: "#17191D" },
  elevatedSurface: { light: "#ECECE8", dark: "#20242A" },
  foreground: { light: "#1A1B1E", dark: "#F1F1EC" },
  mutedForeground: { light: "#6B6E74", dark: "#A2A7AF" },
  border: { light: "#DCDCD6", dark: "#2B3037" },
  primary: { light: "#4F7600", dark: "#C9F24B" },
  primaryForeground: { light: "#FFFFFF", dark: "#0F1012" },
  primarySoft: { light: "#4F76001A", dark: "#C9F24B22" },
  skeletonPrimary: { light: "#F1F1EC", dark: "#F1F1EC" },
  skeletonSecondary: { light: "#C9F24B", dark: "#C9F24B" },
  skeletonDerived: { light: "#7C828B", dark: "#7C828B" },
  stage: { light: "#17181B", dark: "#17191D" },
  stageForeground: { light: "#F1F1EC", dark: "#F1F1EC" },
  positive: { light: "#1E8E5A", dark: "#5FD3A0" },
  positiveSoft: { light: "#1E8E5A1A", dark: "#5FD3A022" },
  warning: { light: "#B26B00", dark: "#F2B950" },
  warningSoft: { light: "#B26B001A", dark: "#F2B95022" },
  destructive: { light: "#C4261D", dark: "#F0685A" },
  destructiveSoft: { light: "#C4261D1A", dark: "#F0685A22" },
  analysisLowConfidence: { light: "#9A9CA1", dark: "#7C828B" },
  analysisHighConfidence: { light: "#4F7600", dark: "#C9F24B" },
  focusRing: { light: "#1A1B1E", dark: "#F1F1EC" },
};

module.exports = { themeColors };
