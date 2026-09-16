import { useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, View, type AccessibilityActionEvent, type AppStateStatus } from "react-native";

import { ReelMotionPlayer, reelStageBounds, reelStagePadding, reelStillGlyph } from "@/components/reels/reel-motion-player";
import { ReelOverlay, type ReelOverlayInsets } from "@/components/reels/reel-overlay";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import type { ReelMediaRole, ReelPlaybackMode } from "@/lib/reels/reel-feed-state";
import { reelAccessibilityName, reelAnalysisProfileId, reelConfidence, reelLine, type ReelItem as ReelItemModel } from "@/lib/reels/reel-model";
import { reelProgress, reelShouldPlay, reelStartFrame } from "@/lib/reels/reel-playback";

type ReelItemProps = {
  item: ReelItemModel;
  index: number;
  count: number;
  width: number;
  height: number;
  role: ReelMediaRole;
  playback: ReelPlaybackMode;
  focused: boolean;
  appState: AppStateStatus;
  reducedMotion: boolean | null;
  view: RepresentativeViewId;
  insets: ReelOverlayInsets;
  onViewChange: (view: RepresentativeViewId) => void;
  /** Receives whether the Reel was advancing, so a tap plays what autoplay held back. */
  onTogglePlayback: (playing: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onOpenAnalysis: ((profileId: string) => void) | null;
};

/**
 * One viewport of the feed, layered like a post: the stage (the active
 * player, a neighbour's still, or nothing), the tap surface, then the chrome.
 * The whole stage is the tap target: tap = pause or resume. VoiceOver gets an
 * adjustable element: double-tap toggles, swipe up and down move on.
 */
export function ReelItem({
  item, index, count, width, height, role, playback, focused, appState, reducedMotion, view, insets,
  onViewChange, onTogglePlayback, onNext, onPrevious, onClose, onOpenAnalysis,
}: ReelItemProps) {
  const active = role === "active";
  const playing = reelShouldPlay({ active, focused, appState, playback, reducedMotion });
  const startFrame = reelStartFrame(item);
  const progress = useRef(new Animated.Value(reelProgress(startFrame))).current;
  const still = useMemo(() => (role === "adjacent" ? reelStillGlyph(item, view) : null), [item, role, view]);
  const bounds = useMemo(() => (role === "adjacent" ? reelStageBounds(item, view) : null), [item, role, view]);
  const analysisId = reelAnalysisProfileId(item);

  const state = playing ? "재생 중" : "일시정지됨";
  const label = `${reelAccessibilityName(item)}, ${index + 1}/${count}, ${active ? state : "대기"} · ${reelLine(item)}`;

  const toggle = () => onTogglePlayback(playing);
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === "activate") toggle();
    else if (name === "increment") onNext();
    else if (name === "decrement") onPrevious();
  };

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[styles.item, { width, height }]}
      testID={`reel-item-${item.kind}`}
    >
      {/* Layer 1: media. (A future subject cutout would sit between this and the skeleton.) */}
      <View style={[styles.stage, { width, height }]} testID={`reel-stage-${active ? "active" : role === "adjacent" ? "still" : "idle"}`}>
        {active ? (
          <ReelMotionPlayer height={height} item={item} playing={playing} progress={progress} startFrame={startFrame} view={view} width={width} />
        ) : still && bounds ? (
          <SkeletonGlyph
            accessible={false}
            accessibilityLabel=""
            bounds={bounds}
            confidence={reelConfidence(item)}
            data={still}
            height={height}
            padding={reelStagePadding(width, height)}
            width={width}
          />
        ) : null}
      </View>

      {/* Layer 2: interaction. */}
      <Pressable
        accessibilityActions={[
          { name: "activate", label: playing ? "일시정지" : "재생" },
          { name: "increment", label: "다음 릴" },
          { name: "decrement", label: "이전 릴" },
        ]}
        accessibilityHint="두 번 탭하면 일시정지 또는 재생, 위아래로 쓸어 넘기면 다음 또는 이전 릴"
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !active }}
        accessibilityValue={{ text: `${index + 1} / ${count}` }}
        aria-disabled={!active}
        aria-valuetext={`${index + 1} / ${count}`}
        disabled={!active}
        onAccessibilityAction={onAccessibilityAction}
        onPress={toggle}
        style={[styles.tap, { width, height }]}
        testID="reel-tap"
      />

      {/* Layer 3: chrome. Neighbours carry it too so a swipe lands on a finished Reel. */}
      {role !== "idle" ? (
        <ReelOverlay
          height={height}
          insets={insets}
          item={item}
          onClose={onClose}
          onOpenAnalysis={analysisId && onOpenAnalysis ? () => onOpenAnalysis(analysisId) : null}
          onViewChange={onViewChange}
          paused={active && !playing}
          progress={progress}
          view={view}
          width={width}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: tokens.stage },
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
  tap: { left: 0, position: "absolute", top: 0 },
});
