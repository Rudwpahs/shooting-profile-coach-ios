export type PreviewRepresentativeSeed = {
  id: string;
  source: "fixture" | "capture";
};

export type PreviewSessionState = {
  captureSequence: number;
  representatives: readonly PreviewRepresentativeSeed[];
};

export type PreviewSessionAction =
  | { type: "capture-complete" }
  | { type: "reset" };

const CANONICAL_REPRESENTATIVES: readonly PreviewRepresentativeSeed[] = [
  { id: "preview_fixture_001", source: "fixture" },
  { id: "preview_fixture_002", source: "fixture" },
  { id: "preview_fixture_003", source: "fixture" },
];

export function createPreviewSessionState(): PreviewSessionState {
  return {
    captureSequence: 0,
    representatives: CANONICAL_REPRESENTATIVES.map((item) => ({ ...item })),
  };
}

export function previewSessionReducer(
  state: PreviewSessionState,
  action: PreviewSessionAction,
): PreviewSessionState {
  if (action.type === "reset") return createPreviewSessionState();

  const captureSequence = state.captureSequence + 1;
  return {
    captureSequence,
    representatives: [
      { id: `preview_fixture_capture_${captureSequence}`, source: "capture" },
      ...state.representatives,
    ],
  };
}
