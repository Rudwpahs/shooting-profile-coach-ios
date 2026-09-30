export type UiPreviewScreen = "home" | "profile" | "analysis" | "reels" | "capture" | "reference";

export type UiPreviewRoute = {
  screen: UiPreviewScreen;
  state?: string;
  itemId?: string;
};

export type UiPreviewNavigation = {
  stack: readonly UiPreviewRoute[];
};

const DEFAULT_ROUTE: UiPreviewRoute = { screen: "home", state: "ready" };

export function createUiPreviewNavigation(initial: UiPreviewRoute = DEFAULT_ROUTE): UiPreviewNavigation {
  return { stack: [initial] };
}

export function currentUiPreviewRoute(navigation: UiPreviewNavigation): UiPreviewRoute {
  return navigation.stack[navigation.stack.length - 1] ?? DEFAULT_ROUTE;
}

export function openUiPreview(navigation: UiPreviewNavigation, route: UiPreviewRoute): UiPreviewNavigation {
  return { stack: [...navigation.stack, route] };
}

export function backUiPreview(navigation: UiPreviewNavigation): UiPreviewNavigation {
  if (navigation.stack.length <= 1) return navigation;
  return { stack: navigation.stack.slice(0, -1) };
}
