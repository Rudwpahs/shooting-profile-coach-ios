import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View, type AccessibilityActionEvent, type AppStateStatus } from "react-native";

import { ReelFilmMedia } from "@/components/reels/reel-film-media";
import { ReelMotionPlayer, isSkeletonReel, reelConfidence, reelStageBounds, reelStagePadding, reelStillGlyph } from "@/components/reels/reel-motion-player";
import { REEL_STAGE_BOTTOM, REEL_STAGE_TOP, ReelOverlay, type ReelInfo, type ReelOverlayInsets } from "@/components/reels/reel-overlay";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import type { ReelMediaRole, ReelPlaybackMode } from "@/lib/reels/reel-feed-state";
import { reelAccessibilityName, reelAnalysisProfileId, reelLine, type ReelItem as ReelItemModel } from "@/lib/reels/reel-model";
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
  onClose: (() => void) | null;
  heading?: string | null;
  info?: ReelInfo;
  onOpenAnalysis: ((profileId: string) => void) | null;
};

const PHASE_COUNT = 5;
/** Film media takes its own touches; the tap layer must never sit between a finger and the Film controls. */
const PASS_THROUGH = { pointerEvents: "none" } as const;
/** The nearest of the five shot phases for a loop fraction. */
function phaseAtProgress(fraction: number): number {
  return Math.max(0, Math.min(PHASE_COUNT - 1, Math.round(fraction * (PHASE_COUNT - 1))));
}

/**
 * One viewport of the feed, layered like a post: the stage (the active
 * player, a neighbour's still, or nothing), the tap surface, then the chrome.
 * The whole stage is the tap target: tap = pause or resume. VoiceOver gets an
 * adjustable element: double-tap toggles, swipe up and down move on.
 */
export function ReelItem({
  item, index, count, width, height, role, playback, focused, appState, reducedMotion, view, insets,
  onViewChange, onTogglePlayback, onNext, onPrevious, onClose, heading = null, info, onOpenAnalysis,
}: ReelItemProps) {
  const active = role === "active";
  // A film reel has no skeleton clock: its media is the local clip itself.
  const skeleton = isSkeletonReel(item) ? item : null;
  const film = item.kind === "film" ? item : null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const playing = skeleton !== null && !sheetOpen && reelShouldPlay({ active, focused, appState, playback, reducedMotion });
  const startFrame = reelStartFrame(item);
  // The item is the whole viewport; the figure is fitted between the chrome bands.
  const stageTop = insets.top + REEL_STAGE_TOP;
  const stageHeight = Math.max(1, height - stageTop - (insets.bottom + REEL_STAGE_BOTTOM));
  const progress = useRef(new Animated.Value(reelProgress(startFrame))).current;

  // The caption and the dots follow the loop: the nearest shot phase, updated only when it changes.
  const [activePhase, setActivePhase] = useState<number | null>(skeleton ? phaseAtProgress(reelProgress(startFrame)) : null);
  useEffect(() => {
    if (!skeleton) return;
    const id = progress.addListener(({ value }) => {
      const phase = phaseAtProgress(value);
      setActivePhase((current) => (current === phase ? current : phase));
    });
    return () => progress.removeListener(id);
  }, [progress, skeleton]);
  const [seek, setSeek] = useState<{ frame: number; token: number } | null>(null);
  const onSeekPhase = useCallback((phase: number) => {
    const frame = Math.round((phase / (PHASE_COUNT - 1)) * 100);
    setSeek((current) => ({ frame, token: (current?.token ?? 0) + 1 }));
    setActivePhase(phase);
    progress.setValue(reelProgress(frame));
    // A seek holds the chosen phase: pause what was playing.
    if (playing) onTogglePlayback(true);
  }, [onTogglePlayback, playing, progress]);
  const still = useMemo(() => (skeleton && role === "adjacent" ? reelStillGlyph(skeleton, view) : null), [skeleton, role, view]);
  const bounds = useMemo(() => (skeleton && role === "adjacent" ? reelStageBounds(skeleton, view) : null), [skeleton, role, view]);
  const analysisId = reelAnalysisProfileId(item);

  const state = skeleton ? (playing ? "재생 중" : "일시정지됨") : "영상";
  const label = `${reelAccessibilityName(item)}, ${index + 1}/${count}, ${active ? state : "대기"} · ${reelLine(item)}`;

  const toggle = () => { if (skeleton) onTogglePlayback(playing); };
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
      <View style={[styles.stage, { width, height: stageHeight, top: stageTop }]} testID={`reel-stage-${active ? "active" : role === "adjacent" ? "still" : "idle"}`}>
        {film ? (
          role !== "idle" ? <ReelFilmMedia active={active} height={stageHeight} item={film} width={width} /> : null
        ) : skeleton && active ? (
          <ReelMotionPlayer height={stageHeight} item={skeleton} playing={playing} progress={progress} seek={seek} startFrame={startFrame} view={view} width={width} />
        ) : still && bounds ? (
          <SkeletonGlyph
            accessible={false}
            accessibilityLabel=""
            bounds={bounds}
            confidence={reelConfidence(item)}
            data={still}
            height={stageHeight}
            padding={reelStagePadding(width, stageHeight)}
            width={width}
          />
        ) : null}
      </View>

      {/* Layer 2: interaction. On a film reel the Film viewer owns touch (clip tabs, scrub, rotate, zoom), so this
          layer passes pointer events through and remains only for VoiceOver's next/previous reel actions. */}
      <Pressable
        accessibilityActions={[
          ...(skeleton ? [{ name: "activate", label: playing ? "일시정지" : "재생" }] : []),
          { name: "increment", label: "다음 릴" },
          { name: "decrement", label: "이전 릴" },
        ]}
        accessibilityHint={skeleton ? "두 번 탭하면 일시정지 또는 재생, 위아래로 쓸어 넘기면 다음 또는 이전 릴" : "위아래로 쓸어 넘기면 다음 또는 이전 릴"}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !active }}
        accessibilityValue={{ text: `${index + 1} / ${count}` }}
        aria-disabled={!active}
        aria-valuetext={`${index + 1} / ${count}`}
        disabled={!active}
        onAccessibilityAction={onAccessibilityAction}
        onPress={toggle}
        style={({ pressed }) => [styles.tap, { width, height }, film ? PASS_THROUGH : null, pressed && !film && styles.pressed]}
        testID="reel-tap"
      />

      {/* Layer 3: chrome. Neighbours carry it too so a swipe lands on a finished Reel. */}
      {role !== "idle" ? (
        <ReelOverlay
          activePhase={skeleton ? activePhase : null}
          heading={heading}
          height={height}
          info={info}
          insets={insets}
          item={item}
          onClose={onClose}
          onOpenAnalysis={analysisId && onOpenAnalysis ? () => onOpenAnalysis(analysisId) : null}
          onSeekPhase={skeleton && active ? onSeekPhase : null}
          onSheetChange={setSheetOpen}
          onViewChange={onViewChange}
          paused={skeleton !== null && active && !playing && !sheetOpen}
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
  stage: { backgroundColor: tokens.stage, left: 0, overflow: "hidden", position: "absolute" },
  tap: { left: 0, position: "absolute", top: 0 },
  // Touch-down dims the stage a little; the tap itself is the pause or resume.
  pressed: { backgroundColor: tokens.background, opacity: 0.12 },
});
