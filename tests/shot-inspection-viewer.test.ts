import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveShotInspectionModes } from "@/lib/shooting-profile/shot-inspection";

const routeSource = readFileSync(
  resolve(process.cwd(), "app/private-analysis/[id].tsx"),
  "utf8",
);
const flagSource = readFileSync(
  resolve(process.cwd(), "lib/feature-flags.ts"),
  "utf8",
);
const viewerSource = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/shot-inspection-viewer.tsx"),
  "utf8",
);

describe("shot inspection coordinator", () => {
  it("defaults to Motion and keeps Phase and an honest Film tab when local film is missing", () => {
    const model = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: false });
    expect(model.defaultMode).toBe("motion");
    expect(model.enabledModes).toEqual(["motion", "phase", "film"]);
    expect(model.filmSourceAvailable).toBe(false);
  });

  it("lists Film only when the experimental gate is on, and marks the source available only with a local clip", () => {
    expect(resolveShotInspectionModes({ experimentalEnabled: false, hasLocalFilm: true }).enabledModes)
      .toEqual(["motion"]);
    const withClip = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: true });
    expect(withClip.enabledModes).toEqual(["motion", "phase", "film"]);
    expect(withClip.filmSourceAvailable).toBe(true);
  });

  it("routes private analysis through ShotInspectionViewer instead of mounting SequenceViewer directly", () => {
    expect(routeSource).toMatch(/ShotInspectionViewer/);
    expect(routeSource).not.toMatch(/<SequenceViewer/);
    expect(routeSource).toMatch(/profileId=/);
    expect(routeSource).toMatch(/highlightJoint=/);
  });

  it("evicts unavailable local film, supports clip selection, and fails closed to Motion", () => {
    expect(viewerSource).toMatch(/evictLocalFilmClipFromAssociation/);
    expect(viewerSource).toMatch(/onSourceUnavailable/);
    expect(viewerSource).toMatch(/selectedSlotId/);
    expect(viewerSource).toMatch(/clips\.map/);
    expect(viewerSource).toMatch(/setMode\(["']motion["']\)/);
  });

  it("keeps the new inspection surface behind a separate default-off public env flag and existing rollout gate", () => {
    expect(flagSource).toMatch(/EXPO_PUBLIC_FORMPATH_SHOT_INSPECTION_V1/);
    expect(flagSource).toMatch(/shotInspectionV1/);
    expect(flagSource).toMatch(/FORMPATH_FLAGS\.profileV2/);
    expect(flagSource).toMatch(/FORMPATH_FLAGS\.representative4DViewer/);
  });
});