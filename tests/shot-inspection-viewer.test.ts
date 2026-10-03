import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveShotInspectionModes } from "@/lib/shooting-profile/shot-inspection";

const routeSource = readFileSync(
  resolve(process.cwd(), "app/private-analysis/[id].tsx"),
  "utf8",
);
const stageSource = readFileSync(
  resolve(process.cwd(), "components/analysis/analysis-stage.tsx"),
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
  it("defaults to Phase and keeps an honest Film tab when local film is missing: the reel stage is the motion", () => {
    const model = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: false });
    expect(model.defaultMode).toBe("phase");
    expect(model.enabledModes).toEqual(["phase", "film"]);
    expect(model.filmSourceAvailable).toBe(false);
  });

  it("lists nothing when the experimental gate is off, and marks the Film source available only with a local clip", () => {
    expect(resolveShotInspectionModes({ experimentalEnabled: false, hasLocalFilm: true }).enabledModes)
      .toEqual([]);
    const withClip = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: true });
    expect(withClip.enabledModes).toEqual(["phase", "film"]);
    expect(withClip.filmSourceAvailable).toBe(true);
  });

  it("routes private analysis through the reel stage, which mounts ShotInspectionViewer behind 동작 정보 instead of SequenceViewer", () => {
    expect(routeSource).toMatch(/<AnalysisStage/);
    expect(routeSource).not.toMatch(/<SequenceViewer|ShotInspectionViewer/);
    expect(stageSource).toMatch(/<ShotInspectionViewer/);
    expect(stageSource).not.toMatch(/<SequenceViewer/);
    expect(stageSource).toMatch(/profileId=/);
    expect(stageSource).toMatch(/highlightJoint=/);
    expect(viewerSource).not.toMatch(/SequenceViewer|"motion"/);
  });

  it("evicts unavailable local film, supports clip selection, and fails closed to Phase", () => {
    expect(viewerSource).toMatch(/evictLocalFilmClipFromAssociation/);
    expect(viewerSource).toMatch(/onSourceUnavailable/);
    expect(viewerSource).toMatch(/selectedSlotId/);
    expect(viewerSource).toMatch(/clips\.map/);
    expect(viewerSource).toMatch(/setMode\(["']phase["']\)/);
  });

  it("keeps the new inspection surface behind a separate default-off public env flag and existing rollout gate", () => {
    expect(flagSource).toMatch(/EXPO_PUBLIC_FORMPATH_SHOT_INSPECTION_V1/);
    expect(flagSource).toMatch(/shotInspectionV1/);
    expect(flagSource).toMatch(/FORMPATH_FLAGS\.profileV2/);
    expect(flagSource).toMatch(/FORMPATH_FLAGS\.representative4DViewer/);
  });
});
