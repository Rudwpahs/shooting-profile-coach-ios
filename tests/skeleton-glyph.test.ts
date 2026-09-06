import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { BONE_LINKS } from "@/lib/pose-motion";
import { fitGlyphPoints, poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

const reference = ANONYMOUS_POSE_REFERENCES[0];

describe("poseMotionGlyph", () => {
  it("projects every joint of the anonymous reference into finite screen points", () => {
    const glyph = poseMotionGlyph(reference.motion, { view: "side", progress: 0.75 });

    expect(Object.keys(glyph.points)).toHaveLength(16);
    for (const point of Object.values(glyph.points)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(glyph.bones).toBe(BONE_LINKS);
    expect(glyph.armJoints).toEqual(["rightShoulder", "rightElbow", "rightWrist"]);
    expect(glyph.headJoint).toBe("head");
  });

  it("is deterministic and follows the motion timeline", () => {
    const release = poseMotionGlyph(reference.motion, { progress: 0.75 });
    expect(poseMotionGlyph(reference.motion, { progress: 0.75 })).toEqual(release);
    const ready = poseMotionGlyph(reference.motion, { progress: 0 });
    // The shooting wrist rises between ready and release (screen y grows downward).
    expect(release.points.rightWrist.y).toBeLessThan(ready.points.rightWrist.y);
  });

  it("changes the projection with the view and mirrors a left-handed shooter", () => {
    const front = poseMotionGlyph(reference.motion, { view: "front", progress: 0.75 });
    const side = poseMotionGlyph(reference.motion, { view: "side", progress: 0.75 });
    const spread = (glyph: ReturnType<typeof poseMotionGlyph>) => {
      const xs = Object.values(glyph.points).map((point) => point.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(front)).not.toBeCloseTo(spread(side), 3);

    // A left-handed shooter gets the accent on the left arm and a mirrored
    // figure: the shooting wrist ends up on the opposite side of the pelvis.
    const left = poseMotionGlyph(reference.motion, { view: "front", progress: 0.75, hand: "left" });
    expect(left.armJoints).toEqual(["leftShoulder", "leftElbow", "leftWrist"]);
    const rightSide = Math.sign(front.points.rightWrist.x - front.points.pelvis.x);
    const leftSide = Math.sign(left.points.leftWrist.x - left.points.pelvis.x);
    expect(rightSide).not.toBe(0);
    expect(leftSide).toBe(-rightSide);
  });

  it("rejects an out-of-range progress by clamping instead of extrapolating", () => {
    expect(poseMotionGlyph(reference.motion, { progress: 7 })).toEqual(poseMotionGlyph(reference.motion, { progress: 1 }));
    expect(poseMotionGlyph(reference.motion, { progress: -3 })).toEqual(poseMotionGlyph(reference.motion, { progress: 0 }));
  });
});

describe("fitGlyphPoints", () => {
  it("fits the glyph inside the box with padding and keeps the aspect ratio", () => {
    const glyph = poseMotionGlyph(reference.motion, { view: "oblique", progress: 0.5 });
    const fitted = fitGlyphPoints(glyph.points, 120, 160, 12);
    const xs = Object.values(fitted.points).map((point) => point.x);
    const ys = Object.values(fitted.points).map((point) => point.y);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(120 - 12 + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(160 - 12 + 1e-6);
    expect(fitted.groundY).toBeCloseTo(Math.max(...ys), 6);

    const sourceAspect = (Math.max(...Object.values(glyph.points).map((p) => p.x)) - Math.min(...Object.values(glyph.points).map((p) => p.x)))
      / (Math.max(...Object.values(glyph.points).map((p) => p.y)) - Math.min(...Object.values(glyph.points).map((p) => p.y)));
    const fittedAspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    expect(fittedAspect).toBeCloseTo(sourceAspect, 6);
  });

  it("refuses an empty glyph", () => {
    expect(() => fitGlyphPoints({}, 10, 10, 1)).toThrow();
  });
});
