import type { SourceLandmarkV2 } from "@/lib/shooting-profile/types";

export type Point2 = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceTransformV2 = {
  sourceWidth: number;
  sourceHeight: number;
  cropRectPx: Rect;
  contentRect: Rect;
  mirrored: boolean;
  rotationDeg: 0 | 90 | 180 | 270;
};

/** A source-space observation. Image-model relative depth is intentionally excluded. */
export type SourceObservation2DV2 = Omit<SourceLandmarkV2, "z">;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function validateTransform(transform: SourceTransformV2): void {
  requireFinite(transform.sourceWidth, "sourceWidth");
  requireFinite(transform.sourceHeight, "sourceHeight");
  requireFinite(transform.cropRectPx.x, "cropRectPx.x");
  requireFinite(transform.cropRectPx.y, "cropRectPx.y");
  requireFinite(transform.cropRectPx.width, "cropRectPx.width");
  requireFinite(transform.cropRectPx.height, "cropRectPx.height");
  requireFinite(transform.contentRect.x, "contentRect.x");
  requireFinite(transform.contentRect.y, "contentRect.y");
  requireFinite(transform.contentRect.width, "contentRect.width");
  requireFinite(transform.contentRect.height, "contentRect.height");

  if (
    transform.sourceWidth <= 0
    || transform.sourceHeight <= 0
    || transform.cropRectPx.width <= 0
    || transform.cropRectPx.height <= 0
    || transform.contentRect.width <= 0
    || transform.contentRect.height <= 0
  ) {
    throw new Error("source, crop, and content dimensions must be positive");
  }
  if (![0, 90, 180, 270].includes(transform.rotationDeg)) {
    throw new Error(`unsupported source rotation: ${transform.rotationDeg}`);
  }
  const swapsAxes = transform.rotationDeg === 90 || transform.rotationDeg === 270;
  const orientedWidth = swapsAxes ? transform.sourceHeight : transform.sourceWidth;
  const orientedHeight = swapsAxes ? transform.sourceWidth : transform.sourceHeight;
  if (
    transform.cropRectPx.x < 0
    || transform.cropRectPx.y < 0
    || transform.cropRectPx.x + transform.cropRectPx.width > orientedWidth
    || transform.cropRectPx.y + transform.cropRectPx.height > orientedHeight
  ) {
    throw new Error("cropRectPx must lie within the oriented source image");
  }
  if (
    transform.contentRect.x < 0
    || transform.contentRect.y < 0
    || transform.contentRect.x + transform.contentRect.width > 1
    || transform.contentRect.y + transform.contentRect.height > 1
  ) {
    throw new Error("contentRect must lie within normalized model input bounds");
  }
}

function assertWithinContent(point: Point2, transform: SourceTransformV2): void {
  const toleranceX = transform.contentRect.width / transform.cropRectPx.width;
  const toleranceY = transform.contentRect.height / transform.cropRectPx.height;
  const minX = transform.contentRect.x - toleranceX;
  const maxX = transform.contentRect.x + transform.contentRect.width + toleranceX;
  const minY = transform.contentRect.y - toleranceY;
  const maxY = transform.contentRect.y + transform.contentRect.height + toleranceY;

  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
    throw new Error("point lies outside model content by more than one source pixel");
  }
}

export function restoreSourcePoint(point: Point2, transform: SourceTransformV2): Point2 {
  requireFinite(point.x, "point.x");
  requireFinite(point.y, "point.y");
  validateTransform(transform);
  assertWithinContent(point, transform);

  const contentX = (point.x - transform.contentRect.x) / transform.contentRect.width;
  const contentY = (point.y - transform.contentRect.y) / transform.contentRect.height;
  const transformedX = transform.cropRectPx.x + contentX * transform.cropRectPx.width;
  const transformedY = transform.cropRectPx.y + contentY * transform.cropRectPx.height;
  const orientedWidth = transform.rotationDeg === 90 || transform.rotationDeg === 270
    ? transform.sourceHeight
    : transform.sourceWidth;
  const unmirroredX = transform.mirrored ? orientedWidth - transformedX : transformedX;

  switch (transform.rotationDeg) {
    case 0:
      return {
        x: unmirroredX / transform.sourceWidth,
        y: transformedY / transform.sourceHeight,
      };
    case 90:
      return {
        x: transformedY / transform.sourceWidth,
        y: (transform.sourceHeight - unmirroredX) / transform.sourceHeight,
      };
    case 180:
      return {
        x: (transform.sourceWidth - unmirroredX) / transform.sourceWidth,
        y: (transform.sourceHeight - transformedY) / transform.sourceHeight,
      };
    case 270:
      return {
        x: (transform.sourceWidth - transformedY) / transform.sourceWidth,
        y: unmirroredX / transform.sourceHeight,
      };
  }
}

export function restoreSourceLandmarks(
  landmarks: readonly SourceLandmarkV2[],
  transform: SourceTransformV2,
): SourceObservation2DV2[] {
  return landmarks.map((landmark, index) => {
    requireFinite(landmark.z, `landmarks[${index}].z`);
    if (landmark.visibility !== undefined) {
      requireFinite(landmark.visibility, `landmarks[${index}].visibility`);
    }
    const point = restoreSourcePoint(landmark, transform);
    return landmark.visibility === undefined
      ? point
      : { ...point, visibility: landmark.visibility };
  });
}
