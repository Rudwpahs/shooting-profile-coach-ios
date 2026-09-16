import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type {
  ShootingProfileSummaryV2,
  ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";
import type { CaptureSessionState } from "@/lib/shooting-profile/capture-session-reducer";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

export const PREVIEW_RUNTIME_ENABLED =
  process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1";

export type PreviewCaptureStates = Record<
  "setup" | "collecting" | "recapture" | "review",
  CaptureSessionState
>;

export type PreviewRuntime = {
  enabled: boolean;
  latest: LatestRepresentativeState;
  summaries: readonly ShootingProfileSummaryV2[];
  recordsById: Readonly<Record<string, ShootingProfileViewerRecordV2>>;
  profilesById: Readonly<Record<string, RepresentativePose4DV2>>;
  capture: PreviewCaptureStates | null;
  addCapturedRepresentative: () => string | null;
  reset: () => void;
};

export const DISABLED_PREVIEW_RUNTIME: PreviewRuntime = {
  enabled: false,
  latest: { status: "signed-out" },
  summaries: [],
  recordsById: {},
  profilesById: {},
  capture: null,
  addCapturedRepresentative: () => null,
  reset: () => undefined,
};
