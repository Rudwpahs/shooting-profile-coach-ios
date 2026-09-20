import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from "react";

import {
  DISABLED_PREVIEW_RUNTIME,
  PREVIEW_RUNTIME_ENABLED,
  type PreviewRuntime,
} from "@/lib/preview/preview-runtime";
import {
  createPreviewSessionState,
  previewSessionReducer,
} from "@/lib/preview/preview-session-state";
import type { PreviewRuntimeFixtureBundle } from "@/lib/preview/preview-runtime-fixtures";

const PreviewRuntimeContext = createContext<PreviewRuntime>(DISABLED_PREVIEW_RUNTIME);

export function PreviewRuntimeProvider({ children }: PropsWithChildren) {
  const [session, dispatch] = useReducer(
    previewSessionReducer,
    undefined,
    createPreviewSessionState,
  );

  const fixtures = useMemo<PreviewRuntimeFixtureBundle | null>(() => {
    if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") {
      // Kept behind a build-time-foldable literal so ordinary production
      // exports can eliminate the synthetic fixture graph entirely.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("@/lib/preview/preview-runtime-fixtures") as typeof import("@/lib/preview/preview-runtime-fixtures");
      return module.buildPreviewRuntimeFixtures(session.representatives);
    }
    return null;
  }, [session.representatives]);

  const addCapturedRepresentative = useCallback(() => {
    if (!PREVIEW_RUNTIME_ENABLED) return null;
    const id = `preview_fixture_capture_${session.captureSequence + 1}`;
    dispatch({ type: "capture-complete" });
    return id;
  }, [session.captureSequence]);

  const reset = useCallback(() => {
    if (PREVIEW_RUNTIME_ENABLED) dispatch({ type: "reset" });
  }, []);

  const value = useMemo<PreviewRuntime>(() => {
    if (!PREVIEW_RUNTIME_ENABLED || !fixtures) return DISABLED_PREVIEW_RUNTIME;
    const summary = fixtures.summaries[0];
    const record = summary ? fixtures.recordsById[summary.id] : undefined;
    return {
      enabled: true,
      latest: summary && record
        ? { status: "ready", summary, record }
        : { status: "empty" },
      summaries: fixtures.summaries,
      recordsById: fixtures.recordsById,
      profilesById: fixtures.profilesById,
      capture: fixtures.capture,
      addCapturedRepresentative,
      reset,
    };
  }, [addCapturedRepresentative, fixtures, reset]);

  return (
    <PreviewRuntimeContext.Provider value={value}>
      {children}
    </PreviewRuntimeContext.Provider>
  );
}

export function usePreviewRuntime(): PreviewRuntime {
  return useContext(PreviewRuntimeContext);
}
