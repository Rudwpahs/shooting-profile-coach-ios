import type { TextStyle } from "react-native";

/**
 * Type roles for the redesigned surfaces, following Apple's typography
 * guidance: the platform system font by default, hierarchy from weight and
 * size and leading together, tracking that tightens as text grows and opens
 * slightly on tiny labels, and tabular figures wherever numbers line up.
 * Values are points; Dynamic Type still scales them.
 */
export const typography = {
  wordmark: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.2 },
  headline: { fontSize: 15, lineHeight: 20, fontWeight: "600", letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: 0 },
  callout: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.2 },
  stat: { fontSize: 22, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  finding: { fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3 },
} as const satisfies Record<string, TextStyle>;

export type TypographyRole = keyof typeof typography;
