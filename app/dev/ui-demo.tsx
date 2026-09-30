import { Redirect, useLocalSearchParams } from "expo-router";

import { UI_DEMO_ENABLED } from "@/lib/dev/ui-demo";
import type { UiPreviewScreen } from "@/lib/dev/ui-preview-navigation";

const PREVIEW_SCREENS = new Set<UiPreviewScreen>(["home", "profile", "analysis", "reels", "capture", "reference"]);

function previewScreen(value: string | undefined): UiPreviewScreen {
  return value && PREVIEW_SCREENS.has(value as UiPreviewScreen) ? (value as UiPreviewScreen) : "home";
}

/**
 * Optional deep-link entry for visual QA. Normal Pages use the real Home route,
 * which renders the same shell directly so browser navigation never depends on
 * GitHub Pages resolving an Expo route.
 */
export default function UiDemoRoute() {
  const params = useLocalSearchParams<{ screen?: string; state?: string; itemId?: string }>();
  const previewBuild = process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1";
  if (!UI_DEMO_ENABLED && !previewBuild) return <Redirect href="/" />;

  // Keep the preview-only shell outside ordinary production bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { UiPreviewShell } = require("@/components/dev/ui-preview-shell") as typeof import("@/components/dev/ui-preview-shell");
  return (
    <UiPreviewShell
      initialItemId={typeof params.itemId === "string" ? params.itemId : undefined}
      initialScreen={previewScreen(typeof params.screen === "string" ? params.screen : undefined)}
      initialState={typeof params.state === "string" ? params.state : "ready"}
    />
  );
}
