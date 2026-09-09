import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import {
  MOTION_LIFT,
  createMotionLiftState,
  motionLiftArmProgress,
  transitionMotionLift,
  type MotionLiftEvent,
  type MotionLiftPhase,
  type MotionLiftState,
} from "@/lib/feed/motion-lift-state";

const AFFORDANCE = 32;

type MotionLiftLayerProps = {
  width: number;
  height: number;
  /** The yaw the Reel plays in; the first hold starts here. */
  baseYaw: number;
  reducedMotion: boolean;
  onPhase: (phase: MotionLiftPhase) => void;
  onYaw: (yaw: number) => void;
  onSave: (moment: { yaw: number }) => void;
  /** A press released before the hold is a tap: the Reel resumes. */
  onTap: () => void;
  onLockScroll: (locked: boolean) => void;
  /** The primary visual cue label, shown while inspecting; the joints it points at are ringed by the stage. */
  cueLabel?: string | null;
  /** Whether the reel is being inspected: held, or holding a turned pose. */
  showCue?: boolean;
};

function haptic(kind: "grab" | "arm" | "save") {
  try {
    const call = kind === "grab"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : kind === "arm"
        ? Haptics.selectionAsync()
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void call.catch(() => undefined);
  } catch {
    // No haptics on this platform.
  }
}

function announce(message: string) {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // Announcements are best effort.
  }
}

/**
 * The touch surface of a paused Reel. It owns the pure Motion Lift machine
 * and turns its effects into haptics, a scroll lock, a save and a tap; the
 * stage draws the lifted, rotated skeleton from the yaw it reports.
 *
 * Activation is manual: a JavaScript hold timer grabs after `holdMs` while
 * the finger stays within the jitter tolerance, and any larger movement
 * before that fails the gesture so the feed scroll wins. That keeps the
 * pre-activation window tolerant of a real thumb without letting an early
 * pan steal the scroll, which `activateAfterLongPress` cannot promise.
 *
 * VoiceOver ignores this layer; the Reel item underneath keeps the actions.
 */
export function MotionLiftLayer({ width, height, baseYaw, reducedMotion, onPhase, onYaw, onSave, onTap, onLockScroll, cueLabel = null, showCue = false }: MotionLiftLayerProps) {
  const stateRef = useRef<MotionLiftState>(createMotionLiftState(baseYaw));
  const [phase, setPhase] = useState<MotionLiftPhase>("idle");
  const [armProgress, setArmProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activated = useRef(false);
  const callbacks = useRef({ onPhase, onYaw, onSave, onTap, onLockScroll });
  callbacks.current = { onPhase, onYaw, onSave, onTap, onLockScroll };

  const clearHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const dispatch = useCallback((event: MotionLiftEvent): MotionLiftState => {
    const previous = stateRef.current;
    const { state, effects } = transitionMotionLift(previous, event);
    stateRef.current = state;
    for (const effect of effects) {
      if (effect.type === "haptic") haptic(effect.kind);
      else if (effect.type === "lock-scroll") callbacks.current.onLockScroll(effect.locked);
      else if (effect.type === "tap") callbacks.current.onTap();
      else if (effect.type === "save") {
        callbacks.current.onSave({ yaw: effect.yaw });
        announce("저장됨");
        setSaved(true);
        if (savedTimer.current !== null) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), MOTION_LIFT.savedNoticeMs);
      }
    }
    if (state.phase !== previous.phase) {
      setPhase(state.phase);
      callbacks.current.onPhase(state.phase);
      if (state.phase === "settling") {
        if (settleTimer.current !== null) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => dispatch({ type: "settled" }), reducedMotion ? 0 : MOTION_LIFT.settleMs);
      }
    }
    if (state.yaw !== previous.yaw) callbacks.current.onYaw(state.yaw);
    setArmProgress(motionLiftArmProgress(state));
    return state;
  }, [reducedMotion]);

  // Leaving the paused Reel (resume, swipe, unmount) drops any held state.
  useEffect(() => () => {
    clearHold();
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    if (savedTimer.current !== null) clearTimeout(savedTimer.current);
    const { effects } = transitionMotionLift(stateRef.current, { type: "cancel" });
    for (const effect of effects) {
      if (effect.type === "lock-scroll") callbacks.current.onLockScroll(effect.locked);
    }
  }, []);

  // A cue is announced once when it appears; the layer itself is hidden from assistive technology.
  const announcedCue = useRef<string | null>(null);
  useEffect(() => {
    if (!showCue || !cueLabel) {
      announcedCue.current = null;
      return;
    }
    if (announcedCue.current === cueLabel) return;
    announcedCue.current = cueLabel;
    announce(cueLabel);
  }, [cueLabel, showCue]);

  const gesture = useMemo(() => Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .runOnJS(true)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      manager.begin();
      activated.current = false;
      const next = dispatch({ type: "press", x: touch.x, y: touch.y, at: Date.now(), paused: true });
      if (next.phase === "pending") {
        clearHold();
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          dispatch({ type: "hold", at: Date.now() });
        }, MOTION_LIFT.holdMs);
      }
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      const before = stateRef.current.phase;
      const next = dispatch({ type: "move", x: touch.x, y: touch.y, at: Date.now() });
      if (before === "pending" && next.phase === "idle") {
        clearHold();
        manager.fail();
      } else if ((next.phase === "grabbed" || next.phase === "save_armed") && !activated.current) {
        activated.current = true;
        manager.activate();
      }
    })
    .onTouchesUp((_event, manager) => {
      clearHold();
      dispatch({ type: "release", at: Date.now() });
      if (activated.current) manager.end();
      else manager.fail();
      activated.current = false;
    })
    .onTouchesCancelled((_event, manager) => {
      clearHold();
      dispatch({ type: "cancel" });
      if (activated.current) manager.end();
      activated.current = false;
    }), [dispatch]);

  const held = phase === "grabbed" || phase === "save_armed";
  const armed = phase === "save_armed";
  const affordanceOpacity = saved ? 1 : held ? (armed ? 1 : 0.35 + 0.65 * armProgress) : 0;

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.layer, { width, height }]}
        testID={`motion-lift-layer-${phase}`}
      >
        <View
          style={[styles.affordance, { left: Math.round(width / 2 - AFFORDANCE / 2), opacity: affordanceOpacity }, (armed || saved) && styles.affordanceArmed]}
          testID={saved ? "motion-lift-saved" : armed ? "motion-lift-save-armed" : "motion-lift-save"}
        >
          <MaterialCommunityIcons
            name={saved ? "check" : armed ? "bookmark" : "bookmark-outline"}
            size={18}
            color={armed || saved ? tokens.primaryForeground : tokens.stageForeground}
          />
        </View>
        {showCue && cueLabel ? (
          <View style={styles.cue} testID="motion-lift-cue">
            <Text numberOfLines={1} style={styles.cueText}>{cueLabel}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  layer: { left: 0, position: "absolute", top: 0 },
  affordance: {
    alignItems: "center",
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.border,
    borderRadius: AFFORDANCE / 2,
    borderWidth: 1,
    height: AFFORDANCE,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
    top: 12,
    width: AFFORDANCE,
  },
  affordanceArmed: { backgroundColor: tokens.primary, borderColor: tokens.primary },
  // One small pill in the bottom-left padding zone, never over the figure.
  cue: {
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.primary,
    borderRadius: 14,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    maxWidth: "70%",
    paddingHorizontal: 10,
    paddingVertical: 5,
    pointerEvents: "none",
    position: "absolute",
  },
  cueText: { ...typography.label, color: tokens.foreground },
});
