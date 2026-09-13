export const CAMERA_SEMANTIC_VIEWS_V2 = [
  "front",
  "shooting_oblique",
  "shooting_side",
] as const;

export const CAMERA_YAW_SOURCES_V2 = [
  "legacy_semantic_view",
  "capture_instruction",
  "estimated",
  "calibrated",
] as const;

export type CameraSemanticViewV2 = (typeof CAMERA_SEMANTIC_VIEWS_V2)[number];
export type CameraYawSourceV2 = (typeof CAMERA_YAW_SOURCES_V2)[number];

export type CameraViewMetadataV2 = {
  semanticView: CameraSemanticViewV2;
  /**
   * Shooter-centric camera yaw in degrees.
   * 0 = camera in front of the shooter; positive moves toward the shooter's
   * anatomical right side; negative moves toward the anatomical left side.
   */
  yawDegrees: number;
  yawSource: CameraYawSourceV2;
};

type LegacyCaptureViewV2 = "front" | "shooting_side";
type ShootingHandV2 = "left" | "right";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSemanticView(value: unknown): value is CameraSemanticViewV2 {
  return typeof value === "string"
    && (CAMERA_SEMANTIC_VIEWS_V2 as readonly string[]).includes(value);
}

function isYawSource(value: unknown): value is CameraYawSourceV2 {
  return typeof value === "string"
    && (CAMERA_YAW_SOURCES_V2 as readonly string[]).includes(value);
}

function assertYawDegrees(value: unknown): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < -180
    || value > 180
  ) {
    throw new Error("camera yaw must be a finite value in [-180, 180]");
  }
}

export function validateCameraViewMetadata(value: unknown): CameraViewMetadataV2 {
  if (!isRecord(value)) throw new Error("camera view metadata must be an object");

  const semanticView = value.semanticView;
  const yawDegrees = value.yawDegrees;
  const yawSource = value.yawSource;

  if (!isSemanticView(semanticView)) throw new Error("invalid camera semantic view");
  assertYawDegrees(yawDegrees);
  if (!isYawSource(yawSource)) throw new Error("invalid camera yaw source");

  return { semanticView, yawDegrees, yawSource };
}

export function resolveLegacyCameraViewMetadata(
  view: LegacyCaptureViewV2,
  shootingHand: ShootingHandV2,
): CameraViewMetadataV2 {
  if (view === "front") {
    return {
      semanticView: "front",
      yawDegrees: 0,
      yawSource: "legacy_semantic_view",
    };
  }

  return {
    semanticView: "shooting_side",
    yawDegrees: shootingHand === "right" ? 90 : -90,
    yawSource: "legacy_semantic_view",
  };
}

export function cameraYawSeparationDegrees(
  firstYawDegrees: number,
  secondYawDegrees: number,
): number {
  assertYawDegrees(firstYawDegrees);
  assertYawDegrees(secondYawDegrees);

  const directDifference = Math.abs(firstYawDegrees - secondYawDegrees) % 360;
  return Math.min(directDifference, 360 - directDifference);
}
