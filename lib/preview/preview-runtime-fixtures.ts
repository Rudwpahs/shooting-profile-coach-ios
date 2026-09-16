import type {
  ShootingProfileSummaryV2,
  ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

import { buildUiDemoFixtures } from "../dev/ui-demo-fixtures";
import type { PreviewCaptureStates } from "./preview-runtime";
import type { PreviewRepresentativeSeed } from "./preview-session-state";

export type PreviewRuntimeFixtureBundle = {
  summaries: ShootingProfileSummaryV2[];
  recordsById: Record<string, ShootingProfileViewerRecordV2>;
  profilesById: Record<string, RepresentativePose4DV2>;
  capture: PreviewCaptureStates;
};

/**
 * Synthetic-only fixture adapter for the install-free Pages runtime.
 * This module is value-loaded only through the build-time preview gate in the
 * provider. It deliberately reuses the deterministic UI-demo reconstruction
 * instead of inventing a second motion data source.
 */
export function buildPreviewRuntimeFixtures(
  representatives: readonly PreviewRepresentativeSeed[],
): PreviewRuntimeFixtureBundle {
  const demo = buildUiDemoFixtures();
  const summaries: ShootingProfileSummaryV2[] = [];
  const recordsById: Record<string, ShootingProfileViewerRecordV2> = {};
  const profilesById: Record<string, RepresentativePose4DV2> = {};

  representatives.forEach((seed, index) => {
    const template = demo.summaries[Math.min(index, demo.summaries.length - 1)] ?? demo.summaries[0];
    if (!template) throw new Error("preview fixture requires at least one representative summary");
    const summary: ShootingProfileSummaryV2 = {
      ...template,
      id: seed.id,
    };
    summaries.push(summary);
    recordsById[seed.id] = demo.record;
    profilesById[seed.id] = demo.profile;
  });

  return {
    summaries,
    recordsById,
    profilesById,
    capture: demo.capture,
  };
}
