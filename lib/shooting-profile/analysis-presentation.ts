/**
 * How the analysis route presents a profile. Explore opens the minimal
 * surface (one stage, one caption, the phase line, details behind one
 * sheet); every other entry keeps the full three-layer layout.
 */
export type AnalysisPresentation = "full" | "minimal";

export const MINIMAL_ANALYSIS_PARAM = "presentation";
const MINIMAL_VALUE = "minimal";
const TITLE_PARAM = "title";
const FALLBACK_TITLE = "슛폼";
/** A short plain display name: letters, digits, Hangul, spaces and the middle dot; never markup or a link. */
const DISPLAY_TITLE = /^[A-Za-z0-9가-힣 ·]{1,24}$/;

/** Only the exact value selects the minimal surface; anything else is the full layout. */
export function resolveAnalysisPresentation(param: string | string[] | undefined): AnalysisPresentation {
  return param === MINIMAL_VALUE ? "minimal" : "full";
}

/** The display name carried on the route, or the plain fallback when it is missing or not a plain name. */
export function minimalAnalysisTitle(param: string | string[] | undefined): string {
  return typeof param === "string" && DISPLAY_TITLE.test(param) ? param : FALLBACK_TITLE;
}

/** The route Explore pushes for a profile id that the route already validates as opaque. */
export function minimalAnalysisHref(profileId: string, title?: string): string {
  const base = `/private-analysis/${encodeURIComponent(profileId)}?${MINIMAL_ANALYSIS_PARAM}=${MINIMAL_VALUE}`;
  return title && DISPLAY_TITLE.test(title) ? `${base}&${TITLE_PARAM}=${encodeURIComponent(title)}` : base;
}
