import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T>(styles: T) => styles, hairlineWidth: 1 },
  AccessibilityInfo: {},
  AppState: {},
  Animated: { View: () => null },
  View: () => null,
}));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const {
  getRepresentativeViewPresets,
  projectRepresentativeJoints,
  projectRepresentativeJointsAtYaw,
} = await import("@/components/shooting-profile/sequence-viewer");
const { representativeGlyph, representativeGlyphAtYaw, representativeViewYaw } = await import("@/components/skeleton/representative-glyph");
const { buildReelStageFit } = await import("@/components/feed/reel-stage-fit");
const { poseMotionGlyph, poseMotionViewYaw } = await import("@/lib/skeleton/pose-motion-glyph");
const { reelLabFixtures } = await import("@/lib/feed/reel-fixtures");
const { ANONYMOUS_POSE_REFERENCES } = await import("@/lib/anonymous-pose-library");

const items = reelLabFixtures();
const own = items[0];
if (own.motion.source !== "representative") throw new Error("fixture must be representative");
const profile = own.motion.profile;
const frame = profile.frames[75];
const reference = ANONYMOUS_POSE_REFERENCES[0];

type Points = Readonly<Record<string, { x: number; y: number }>>;
const expectClose = (a: Points, b: Points) => {
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  for (const joint of Object.keys(a)) {
    expect(a[joint].x).toBeCloseTo(b[joint].x, 9);
    expect(a[joint].y).toBeCloseTo(b[joint].y, 9);
  }
};

describe("continuous yaw projection", () => {
  it("reproduces every named preset exactly, for both hands", () => {
    for (const hand of ["right", "left"] as const) {
      for (const preset of getRepresentativeViewPresets(hand)) {
        expect(projectRepresentativeJointsAtYaw(frame, preset.yaw, hand)).toEqual(projectRepresentativeJoints(frame, preset.id, hand));
        expect(representativeViewYaw(preset.id, hand)).toBe(preset.yaw);
        expect(representativeGlyphAtYaw(frame, preset.yaw, hand)).toEqual(representativeGlyph(frame, preset.id, hand));
      }
    }
  });

  it("is periodic and rejects a non-finite yaw", () => {
    expectClose(representativeGlyphAtYaw(frame, -45 + 360, "right").points, representativeGlyphAtYaw(frame, -45, "right").points);
    expect(() => projectRepresentativeJointsAtYaw(frame, Number.NaN, "right")).toThrow(/finite/);
    expect(() => poseMotionGlyph(reference.motion, { yaw: Number.POSITIVE_INFINITY })).toThrow(/finite/);
  });

  it("actually turns: a quarter turn moves the shooting wrist across the screen", () => {
    const front = representativeGlyphAtYaw(frame, 0, "right").points;
    const side = representativeGlyphAtYaw(frame, -90, "right").points;
    const between = representativeGlyphAtYaw(frame, -45, "right").points;
    expect(front.rightWrist.x).not.toBeCloseTo(side.rightWrist.x, 3);
    const lower = Math.min(front.rightWrist.x, side.rightWrist.x) - 1e-6;
    const upper = Math.max(front.rightWrist.x, side.rightWrist.x) + 1e-6;
    expect(between.rightWrist.x).toBeGreaterThanOrEqual(Math.min(lower, between.rightWrist.x));
    expect(between.rightWrist.x).toBeLessThanOrEqual(Math.max(upper, between.rightWrist.x));
  });

  it("the reference glyph takes the same yaw override and its named views are yaws too", () => {
    const yaw = poseMotionViewYaw(reference.motion, "oblique", "right");
    expect(poseMotionGlyph(reference.motion, { yaw, hand: "right" })).toEqual(poseMotionGlyph(reference.motion, { view: "oblique", hand: "right" }));
    const turned = poseMotionGlyph(reference.motion, { yaw: yaw + 60, hand: "right" });
    expect(turned.points.rightWrist.x).not.toBeCloseTo(poseMotionGlyph(reference.motion, { view: "oblique", hand: "right" }).points.rightWrist.x, 3);
  });
});

describe("buildReelStageFit", () => {
  it("fits the loop, the still and every rotation into one box for the representative fixture", () => {
    const fit = buildReelStageFit(own);
    if (!fit) throw new Error("a representative reel always has a fit");
    expect(fit.baseYaw).toBe(-45);
    expect(fit.confidence).toBe("basic");
    expect(fit.still).toEqual(representativeGlyph(frame, "oblique", "right"));
    for (const yaw of [-45, 45, 135, -135, 0, 180]) {
      for (const point of Object.values(fit.glyphAtYaw(yaw).points)) {
        expect(point.x).toBeGreaterThanOrEqual(fit.bounds.minX - 1e-9);
        expect(point.x).toBeLessThanOrEqual(fit.bounds.maxX + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(fit.bounds.minY - 1e-9);
        expect(point.y).toBeLessThanOrEqual(fit.bounds.maxY + 1e-9);
      }
    }
    for (const stored of profile.frames) {
      for (const point of Object.values(representativeGlyph(stored, "oblique", "right").points)) {
        expect(point.x).toBeGreaterThanOrEqual(fit.bounds.minX - 1e-9);
        expect(point.x).toBeLessThanOrEqual(fit.bounds.maxX + 1e-9);
      }
    }
  });

  it("does the same for the reference reel from its own oblique yaw", () => {
    const fit = buildReelStageFit(items[2]);
    if (!fit) throw new Error("a reference reel always has a fit");
    expect(fit.baseYaw).toBe(poseMotionViewYaw(reference.motion, "oblique", "right"));
    expect(fit.still).toEqual(poseMotionGlyph(reference.motion, { view: "oblique", hand: "right", progress: 0.75 }));
    expectClose(fit.glyphAtYaw(fit.baseYaw).points, fit.still.points);
    for (const point of Object.values(fit.glyphAtYaw(fit.baseYaw + 90).points)) {
      expect(point.x).toBeGreaterThanOrEqual(fit.bounds.minX - 1e-9);
      expect(point.x).toBeLessThanOrEqual(fit.bounds.maxX + 1e-9);
    }
  });
});
