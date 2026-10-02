/**
 * Feature flags the install-free preview runs with. The preview is not a
 * release: it shows the real screens with synthetic data, so the viewer,
 * profile, capture and shot-inspection surfaces are on. Production flags
 * still come from the release gate; this object is loaded only behind the
 * preview-build gate.
 */
export const PREVIEW_FLAG_OVERRIDE = Object.freeze({
  flags: Object.freeze({
    captureV2: true,
    profileV2: true,
    representative4DViewer: true,
  }),
  shotInspectionV1: true,
});
