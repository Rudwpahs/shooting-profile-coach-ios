/**
 * UI demo gate. Normal app builds keep the demo disabled. It can be enabled
 * either by the original development-only opt-in or by the explicit static
 * preview build used only by the GitHub Pages workflow.
 */
export const UI_DEMO_ENABLED: boolean =
  (__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1") ||
  process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1";
