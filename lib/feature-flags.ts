export const FORMPATH_FLAGS = Object.freeze({
  captureV2: process.env.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",
  representative4DViewer: process.env.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",
  profileV2: process.env.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",
  /** Development-build-only private evaluation report path; never affects capture or persistence. */
  realVideoEvaluation: process.env.EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL === "1",
});

/**
 * Opaque local consent record reference for the private evaluation build. It is
 * a record key, never a name, email, or file path, and it is only read when the
 * development-build evaluation flag is on.
 */
export const FORMPATH_REAL_VIDEO_CONSENT_RECORD_ID =
  process.env.EXPO_PUBLIC_FORMPATH_CONSENT_RECORD_ID ?? "";
