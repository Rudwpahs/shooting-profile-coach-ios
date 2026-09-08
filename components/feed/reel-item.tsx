import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type AccessibilityActionEvent } from "react-native";

import { MotionLiftLayer } from "@/components/feed/motion-lift-layer";
import { REEL_CHROME_BOTTOM_HEIGHT, ReelChrome, type ReelAction } from "@/components/feed/reel-chrome";
import { ReelStage } from "@/components/feed/reel-stage";
import { buildReelStageFit } from "@/components/feed/reel-stage-fit";
import { MOTION_LIFT, type MotionLiftPhase } from "@/lib/feed/motion-lift-state";
import type { ReelMediaRole } from "@/lib/feed/reel-feed-state";
import { reelAccessibilityName, reelLine, type ReelItem as ReelItemModel } from "@/lib/feed/reel-model";

export type ReelSavedMoment = { itemId: string; yaw: number };

type ReelItemProps = {
  item: ReelItemModel;
  index: number;
  count: number;
  width: number;
  height: number;
  role: ReelMediaRole;
  paused: boolean;
  reducedMotion: boolean;
  actions: readonly ReelAction[];
  onTogglePlayback: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onLockScroll: (locked: boolean) => void;
  onSave: (moment: ReelSavedMoment) => void;
  onLiftPhase?: (phase: MotionLiftPhase) => void;
};

const useNativeDriver = Platform.OS !== "web";

/**
 * One full-height Reel. The whole stage is the tap target (tap = pause or
 * resume); VoiceOver gets the same as an adjustable element: double-tap
 * toggles playback, swipe up and down move to the next or previous Reel.
 * While paused, the Motion Lift layer becomes the touch surface: hold to
 * grab, drag sideways to turn, drag up to keep.
 */
export function ReelItem({
  item, index, count, width, height, role, paused, reducedMotion, actions,
  onTogglePlayback, onNext, onPrevious, onLockScroll, onSave, onLiftPhase,
}: ReelItemProps) {
  const active = role === "active";
  const stageHeight = Math.max(1, height - REEL_CHROME_BOTTOM_HEIGHT);
  const fit = useMemo(() => buildReelStageFit(item), [item]);
  const lift = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<MotionLiftPhase>("idle");
  const [liftYaw, setLiftYaw] = useState<number | null>(null);
  const lifting = active && paused;

  // Resuming or leaving the Reel drops the inspected pose.
  useEffect(() => {
    if (lifting) return;
    setPhase("idle");
    setLiftYaw(null);
    lift.setValue(0);
  }, [lift, lifting]);

  useEffect(() => {
    const target = phase === "pending" ? 0.55 : phase === "grabbed" || phase === "save_armed" ? 1 : 0;
    if (reducedMotion) {
      lift.setValue(phase === "pending" ? 0 : target);
      return;
    }
    const animation = phase === "pending"
      ? Animated.timing(lift, { toValue: target, duration: MOTION_LIFT.holdMs, easing: Easing.out(Easing.quad), useNativeDriver })
      : Animated.spring(lift, { toValue: target, damping: 18, mass: 0.8, stiffness: 220, useNativeDriver });
    animation.start();
    return () => animation.stop();
  }, [lift, phase, reducedMotion]);

  const onPhase = useCallback((next: MotionLiftPhase) => {
    setPhase(next);
    onLiftPhase?.(next);
  }, [onLiftPhase]);
  const onMomentSaved = useCallback((moment: { yaw: number }) => onSave({ itemId: item.id, yaw: moment.yaw }), [item.id, onSave]);

  const state = paused ? "일시정지됨" : "재생 중";
  const label = `${reelAccessibilityName(item)}, ${index + 1}/${count}, ${active ? state : "대기"} · ${reelLine(item)}`;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === "activate") onTogglePlayback();
    else if (name === "increment") onNext();
    else if (name === "decrement") onPrevious();
  };

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={{ width, height }}
      testID={`reel-item-${item.kind}`}
    >
      <ReelStage fit={fit} height={stageHeight} item={item} lift={lift} liftYaw={liftYaw} paused={paused} role={role} width={width} />
      <Pressable
        accessibilityActions={[
          { name: "activate", label: paused ? "재생" : "일시정지" },
          { name: "increment", label: "다음 릴" },
          { name: "decrement", label: "이전 릴" },
        ]}
        accessibilityHint="두 번 탭하면 일시정지 또는 재생, 위아래로 쓸어 넘기면 다음 또는 이전 릴"
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: `${index + 1} / ${count}` }}
        aria-disabled={!active}
        aria-valuetext={`${index + 1} / ${count}`}
        disabled={!active}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onTogglePlayback}
        style={[styles.tap, { height: stageHeight, width }]}
        testID="reel-tap"
      />
      {lifting ? (
        <MotionLiftLayer
          baseYaw={fit.baseYaw}
          height={stageHeight}
          onLockScroll={onLockScroll}
          onPhase={onPhase}
          onSave={onMomentSaved}
          onTap={onTogglePlayback}
          onYaw={setLiftYaw}
          reducedMotion={reducedMotion}
          width={width}
        />
      ) : null}
      <ReelChrome actions={actions} height={height} item={item} paused={active && paused} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  tap: { left: 0, position: "absolute", top: 0 },
});
