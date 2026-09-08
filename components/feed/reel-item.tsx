import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from "react-native";

import { REEL_CHROME_BOTTOM_HEIGHT, ReelChrome, type ReelAction } from "@/components/feed/reel-chrome";
import { ReelStage } from "@/components/feed/reel-stage";
import type { ReelMediaRole } from "@/lib/feed/reel-feed-state";
import { reelAccessibilityName, reelLine, type ReelItem as ReelItemModel } from "@/lib/feed/reel-model";

type ReelItemProps = {
  item: ReelItemModel;
  index: number;
  count: number;
  width: number;
  height: number;
  role: ReelMediaRole;
  paused: boolean;
  actions: readonly ReelAction[];
  onTogglePlayback: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

/**
 * One full-height Reel. The whole stage is the tap target (tap = pause or
 * resume); VoiceOver gets the same as an adjustable element: double-tap
 * toggles playback, swipe up and down move to the next or previous Reel.
 */
export function ReelItem({ item, index, count, width, height, role, paused, actions, onTogglePlayback, onNext, onPrevious }: ReelItemProps) {
  const active = role === "active";
  const stageHeight = Math.max(1, height - REEL_CHROME_BOTTOM_HEIGHT);
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
      <ReelStage height={stageHeight} item={item} paused={paused} role={role} width={width} />
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
      <ReelChrome actions={actions} height={height} item={item} paused={active && paused} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  tap: { left: 0, position: "absolute", top: 0 },
});
