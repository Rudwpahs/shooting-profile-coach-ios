export const PHASE_SPACE_MIN_ZOOM = 0.75;
export const PHASE_SPACE_MAX_ZOOM = 1.8;

export function phaseIndexFromScrub(fraction: number): number {
  if (!Number.isFinite(fraction)) throw new Error("phase-space scrub fraction must be finite");
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

export function clampPhaseSpaceZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) throw new Error("phase-space zoom must be finite");
  return Math.max(PHASE_SPACE_MIN_ZOOM, Math.min(PHASE_SPACE_MAX_ZOOM, zoom));
}

export function clampPhaseSpacePitch(pitchDegrees: number): number {
  if (!Number.isFinite(pitchDegrees)) throw new Error("phase-space pitch must be finite");
  return Math.max(-45, Math.min(45, pitchDegrees));
}