import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The system Reduce Motion setting, `null` until resolved. Callers treat
 * `null` as reduced so decorative animation never runs before the answer,
 * matching the playback lifecycle of the skeleton loops.
 */
export function useReduceMotion(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => {
      if (mounted) setEnabled(value);
    };
    try {
      void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    } catch {
      update(true);
    }
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return enabled;
}
