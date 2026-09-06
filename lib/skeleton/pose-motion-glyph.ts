import {
  BONE_LINKS,
  getPoseCameraPresets,
  getPoseDisplayTransform,
  interpolatePoseFrame,
  projectPosePoint,
  type PoseMotion,
} from "@/lib/pose-motion";

/**
 * Skeleton glyph data: 2D screen-space points (y grows downward) plus the bone
 * list and the joints that get the shooting-arm accent. Pure, renderer-agnostic,
 * so the same glyph can be drawn as an SVG tile, a tab-bar avatar, or a feed
 * card, and can be tested in node.
 */
export type GlyphPoint = { x: number; y: number };

export type SkeletonGlyphData = {
  points: Readonly<Record<string, GlyphPoint>>;
  bones: readonly (readonly [string, string])[];
  armJoints: readonly string[];
  derivedJoints: readonly string[];
  headJoint: string | null;
};

export type GlyphView = "front" | "oblique" | "side";
export type GlyphHand = "right" | "left";

export type PoseMotionGlyphOptions = {
  view?: GlyphView;
  /** 0 (ready) … 1 (follow-through) along the motion's display timeline. */
  progress?: number;
  hand?: GlyphHand;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Projects one display frame of an anonymous reference `PoseMotion` the way the viewer does. */
export function poseMotionGlyph(motion: PoseMotion, options: PoseMotionGlyphOptions = {}): SkeletonGlyphData {
  const view = options.view ?? "side";
  const hand = options.hand ?? "right";
  const progress = clamp01(options.progress ?? 0.75);
  const presets = getPoseCameraPresets(motion, hand);
  const preset = presets.find((candidate) => candidate.id === view) ?? presets[1];
  const transform = getPoseDisplayTransform(motion);
  const frame = interpolatePoseFrame(motion, progress);
  const points = Object.fromEntries(Object.entries(frame.joints).map(([joint, point]) => {
    const normalized = {
      x: point.x * transform.scale,
      y: (point.y - transform.groundY) * transform.scale,
      z: point.z * transform.scale,
    };
    const oriented = hand === "left" ? { ...normalized, x: -normalized.x } : normalized;
    const projected = projectPosePoint(oriented, preset.yaw, 8, 330, 300, 1);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      throw new Error(`${joint} glyph point must be finite`);
    }
    return [joint, { x: projected.x, y: projected.y }];
  }));
  const side = hand === "left" ? "left" : "right";
  return {
    points,
    bones: BONE_LINKS,
    armJoints: [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`],
    derivedJoints: [],
    headJoint: "head",
  };
}

export type FittedGlyph = {
  points: Readonly<Record<string, GlyphPoint>>;
  /** Screen y of the lowest joint, where the ground line is drawn. */
  groundY: number;
  /** Ratio applied to the source box; used to scale stroke weights with the tile. */
  scale: number;
};

/** Fits glyph points into a width × height box, preserving aspect ratio, with even padding. */
export function fitGlyphPoints(
  points: Readonly<Record<string, GlyphPoint>>,
  width: number,
  height: number,
  padding: number,
): FittedGlyph {
  const values = Object.values(points);
  if (values.length === 0) throw new Error("glyph needs at least one point");
  const minX = Math.min(...values.map((point) => point.x));
  const maxX = Math.max(...values.map((point) => point.x));
  const minY = Math.min(...values.map((point) => point.y));
  const maxY = Math.max(...values.map((point) => point.y));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;
  const fitted = Object.fromEntries(Object.entries(points).map(([joint, point]) => [
    joint,
    { x: point.x * scale + offsetX, y: point.y * scale + offsetY },
  ]));
  return { points: fitted, groundY: maxY * scale + offsetY, scale };
}
