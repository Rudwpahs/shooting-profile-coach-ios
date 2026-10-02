import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Legacy address of the former demo shell. The install-free preview is now
 * the real app at the root URL, so each old `?screen=` lands on the real
 * route it used to imitate. Nothing is rendered here.
 */
const LEGACY_SCREEN_ROUTES = {
  home: "/",
  explore: "/explore",
  profile: "/profile",
  analysis: process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1" ? "/private-analysis/preview-shot-001" : "/profile",
  reels: "/reels",
  capture: "/private-capture",
  reference: "/library",
} as const;

type LegacyScreen = keyof typeof LEGACY_SCREEN_ROUTES;

export default function LegacyUiDemoRedirect() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screen = typeof params.screen === "string" ? params.screen : "home";
  const href = Object.prototype.hasOwnProperty.call(LEGACY_SCREEN_ROUTES, screen)
    ? LEGACY_SCREEN_ROUTES[screen as LegacyScreen]
    : LEGACY_SCREEN_ROUTES.home;
  return <Redirect href={href as never} />;
}
