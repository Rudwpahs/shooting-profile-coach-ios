import { describe, expect, it } from "vitest";

import {
  buildPhaseSpaceGeometry,
  projectPhaseSpacePoint,
  selectGhostFrameIndices,
} from "@/lib/phase-space/geometry";
import { syntheticRepresentativeProfile } from "./support/representative-profile-fixture";

describe("phase-space geometry", () => {
  it("keeps exactly 101 normalized phases and never calls them time", () => {
    const profile = syntheticRepresentativeProfile();
    const geometry = buildPhaseSpaceGeometry(profile, "oblique", "right", 11);

    expect(geometry.frameCount).toBe(101);
    expect(geometry.axis.kind).toBe("normalized_shot_phase");
    expect(geometry.axis.label).toBe("SHOT PHASE");
    expect(geometry.trajectories.rightWrist).toHaveLength(101);
    expect(geometry.trajectories.rightWrist[0].z).toBe(0);
    expect(geometry.trajectories.rightWrist[100].z).toBe(1);
  });

  it("selects sparse ghosts including first and last without 101 opaque copies", () => {
    expect(selectGhostFrameIndices(101, 11)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(selectGhostFrameIndices(101, 13)).toHaveLength(13);
    expect(() => selectGhostFrameIndices(100, 11)).toThrow(/101/);
  });

  it("preserves five semantic anchors and projects only finite points", () => {
    const profile = syntheticRepresentativeProfile();
    const before = JSON.stringify(profile);
    const geometry = buildPhaseSpaceGeometry(profile, "front", "left", 11);

    expect(geometry.anchors.map((anchor) => anchor.id)).toEqual([
      "ready", "deepestDip", "rise", "releaseProxy", "followThrough",
    ]);
    expect(JSON.stringify(profile)).toBe(before);
    for (const point of geometry.trajectories.leftWrist) {
      const projected = projectPhaseSpacePoint(
        point,
        { yawDegrees: -34, pitchDegrees: 16, zoom: 1 },
        330,
        300,
      );
      expect(Object.values(projected).every(Number.isFinite)).toBe(true);
    }
  });

  it("rejects non-finite projection inputs", () => {
    expect(() => projectPhaseSpacePoint(
      { x: Number.NaN, y: 0, z: 0.5 },
      { yawDegrees: 0, pitchDegrees: 0, zoom: 1 },
      330,
      300,
    )).toThrow(/finite/i);
  });
});
