/**
 * The analysis route's display name and link. The route is the same stage
 * every player uses; the only thing a caller adds is the honest name the
 * form was shown under (SHOT 12, 내 슛폼), which is accepted only as a short
 * plain string and never a file name or a link.
 */
const TITLE_PARAM = "title";
const FALLBACK_TITLE = "슛폼";
const DISPLAY_TITLE = /^[A-Za-z0-9가-힣 ·]{1,24}$/;

/** The display name carried on the route, or the plain fallback when it is missing or not a plain name. */
export function analysisTitle(param: string | string[] | undefined): string {
  return typeof param === "string" && DISPLAY_TITLE.test(param) ? param : FALLBACK_TITLE;
}

/** The route Explore and Home push for a profile id that the route already validates as opaque. */
export function analysisHref(profileId: string, title?: string): string {
  const base = `/private-analysis/${encodeURIComponent(profileId)}`;
  return title && DISPLAY_TITLE.test(title) ? `${base}?${TITLE_PARAM}=${encodeURIComponent(title)}` : base;
}
