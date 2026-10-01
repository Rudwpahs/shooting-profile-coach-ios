import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The system Reduce Motion setting for liquid surfaces, shared by every
 * surface: the system is asked once and subscribed to once, however many
 * buttons are on screen (a per-component hook would multiply both).
 *
 * `null` means not yet known and is treated as reduced, matching
 * `hooks/use-reduce-motion`, so nothing bounces before the answer arrives.
 * The setting is followed live, so toggling it while the app runs applies
 * immediately.
 */
let systemReduced: boolean | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(value: boolean) {
  if (systemReduced === value) return;
  systemReduced = value;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  try {
    void AccessibilityInfo.isReduceMotionEnabled().then(publish).catch(() => publish(true));
  } catch {
    publish(true);
  }
  try {
    AccessibilityInfo.addEventListener("reduceMotionChanged", publish);
  } catch {
    // Platforms without change events keep the first answer.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => systemReduced;
const getServerSnapshot = () => null;

/**
 * Whether liquid motion should be reduced. `forceReduced` (a caller's
 * `forceReducedMotion` prop) can only add reduction: nothing a caller passes
 * can switch off Reduce Motion for a user who turned it on.
 */
export function useLiquidReduceMotion(forceReduced?: boolean): boolean {
  const system = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return forceReduced === true || system !== false;
}
