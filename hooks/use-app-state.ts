import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/** The current app state, so one subscription serves every Reel on screen. */
export function useAppStateStatus(): AppStateStatus {
  const [status, setStatus] = useState<AppStateStatus>(() => AppState.currentState ?? "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setStatus);
    setStatus(AppState.currentState ?? "active");
    return () => subscription?.remove?.();
  }, []);

  return status;
}
