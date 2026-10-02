export type FilmSpaceCameraV1 = Readonly<{
  yawDegrees: number;
  pitchDegrees: number;
  zoom: number;
}>;

export type FilmSpaceSlicePoseV1 = Readonly<{
  index: number;
  normalizedDepth: number;
  centeredDepth: number;
  selected: boolean;
  opacity: number;
  translateXPx: number;
  translateYPx: number;
  scale: number;
  zIndex: number;
}>;

const MAX_SLICE_COUNT = 96;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;
const MIN_PITCH_DEGREES = -24;
const MAX_PITCH_DEGREES = 24;
const SLICE_DEPTH_X_PX = 150;
const SLICE_DEPTH_Y_PX = 90;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`film-space ${label} must be finite`);
  return value;
}

function normalizeYawDegrees(value: number): number {
  const normalized = finite(value, "yaw") % 360;
  return normalized > 180 ? normalized - 360 : normalized < -180 ? normalized + 360 : normalized;
}

export function normalizeFilmSpaceCamera(
  camera: FilmSpaceCameraV1,
): FilmSpaceCameraV1 {
  return Object.freeze({
    yawDegrees: normalizeYawDegrees(camera.yawDegrees),
    pitchDegrees: Math.max(
      MIN_PITCH_DEGREES,
      Math.min(MAX_PITCH_DEGREES, finite(camera.pitchDegrees, "pitch")),
    ),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, finite(camera.zoom, "zoom"))),
  });
}

export function createFilmSpaceSliceStack(
  frameCount: number,
  selectedIndex: number,
  camera: FilmSpaceCameraV1,
): readonly FilmSpaceSlicePoseV1[] {
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_SLICE_COUNT) {
    throw new Error(`film-space slice stack requires 1..${MAX_SLICE_COUNT} frames`);
  }
  if (!Number.isFinite(selectedIndex)) {
    throw new Error("film-space selected index must be finite");
  }

  const normalizedCamera = normalizeFilmSpaceCamera(camera);
  const safeSelectedIndex = Math.max(
    0,
    Math.min(frameCount - 1, Math.round(selectedIndex)),
  );
  const yawRadians = normalizedCamera.yawDegrees * Math.PI / 180;
  const pitchRadians = normalizedCamera.pitchDegrees * Math.PI / 180;

  return Object.freeze(Array.from({ length: frameCount }, (_, index) => {
    const normalizedDepth = frameCount === 1 ? 0 : index / (frameCount - 1);
    const centeredDepth = normalizedDepth - 0.5;
    const selected = index === safeSelectedIndex;
    return Object.freeze({
      index,
      normalizedDepth,
      centeredDepth,
      selected,
      opacity: selected ? 0.92 : 0.035,
      translateXPx: centeredDepth * SLICE_DEPTH_X_PX * Math.sin(yawRadians),
      translateYPx: centeredDepth * SLICE_DEPTH_Y_PX * Math.sin(pitchRadians),
      scale: normalizedCamera.zoom * (0.84 + normalizedDepth * 0.16),
      zIndex: selected ? frameCount + 1 : index,
    });
  }));
}
