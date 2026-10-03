/**
 * How the analysis route presents a profile. Explore opens the minimal
 * surface (one stage, one caption, the phase line, details behind one
 * sheet); every other entry keeps the full three-layer layout.
 */
export type AnalysisPresentation = "full" | "minimal";

export const MINIMAL_ANALYSIS_PARAM = "presentation";
const MINIMAL_VALUE = "minimal";

/** Only the exact value selects the minimal surface; anything else is the full layout. */
export function resolveAnalysisPresentation(param: string | string[] | undefined): AnalysisPresentation {
  return param === MINIMAL_VALUE ? "minimal" : "full";
}

/** The route Explore pushes for a profile id that the route already validates as opaque. */
export function minimalAnalysisHref(profileId: string): string {
  return `/private-analysis/${encodeURIComponent(profileId)}?${MINIMAL_ANALYSIS_PARAM}=${MINIMAL_VALUE}`;
}
