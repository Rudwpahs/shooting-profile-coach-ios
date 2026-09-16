import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FlatList, type AppStateStatus, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from "react-native";

import { ReelItem } from "@/components/reels/reel-item";
import type { ReelOverlayInsets } from "@/components/reels/reel-overlay";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import {
  clampReelIndex,
  createReelFeedState,
  reelIndexFromOffset,
  reelMediaRole,
  reelSnapOffset,
  transitionReelFeedState,
  type ReelFeedState,
  type ReelPlaybackMode,
} from "@/lib/reels/reel-feed-state";
import type { ReelItem as ReelItemModel } from "@/lib/reels/reel-model";

const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 0 };
const DEFAULT_VIEW: RepresentativeViewId = "oblique";

export type ReelsFeedProps = {
  items: readonly ReelItemModel[];
  width: number;
  /** The viewport height; every item is exactly this tall. */
  height: number;
  initialIndex: number;
  initialPlayback?: ReelPlaybackMode;
  /** False while another screen (Analysis) covers Reels: playback holds, intent is kept. */
  focused: boolean;
  appState: AppStateStatus;
  reducedMotion: boolean | null;
  insets: ReelOverlayInsets;
  onClose: () => void;
  onOpenAnalysis: ((profileId: string) => void) | null;
  onStateChange?: (state: ReelFeedState) => void;
};

/**
 * The vertical, one-item-per-viewport feed. Snapping is native paging; the
 * active index settles through viewability, momentum end and the VoiceOver
 * actions through one transition; only the active item plays and only its
 * neighbours hold a still. The view selection is shared by every item so a
 * swipe keeps the chosen view.
 */
export function ReelsFeed({
  items, width, height, initialIndex, initialPlayback = "auto", focused, appState, reducedMotion, insets,
  onClose, onOpenAnalysis, onStateChange,
}: ReelsFeedProps) {
  const [state, dispatch] = useReducer(transitionReelFeedState, undefined, () => createReelFeedState(items.length, initialIndex, initialPlayback));
  const [view, setView] = useState<RepresentativeViewId>(DEFAULT_VIEW);
  const listRef = useRef<FlatList<ReelItemModel>>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    dispatch({ type: "items", count: items.length });
  }, [items.length]);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const goTo = useCallback((index: number) => {
    const target = clampReelIndex(index, stateRef.current.count);
    if (target === stateRef.current.activeIndex) return;
    dispatch({ type: "settle", index: target });
    listRef.current?.scrollToOffset({ offset: reelSnapOffset(target, height), animated: reducedMotion !== true });
  }, [height, reducedMotion]);

  // FlatList requires a stable viewability pair for the life of the list.
  const viewability = useRef([{
    viewabilityConfig: VIEWABILITY,
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken<ReelItemModel>[] }) => {
      const first = viewableItems.find((token) => token.isViewable && typeof token.index === "number");
      if (first && typeof first.index === "number") dispatch({ type: "settle", index: first.index });
    },
  }]);

  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    dispatch({ type: "settle", index: reelIndexFromOffset(event.nativeEvent.contentOffset.y, height, stateRef.current.count) });
  }, [height]);

  const onTogglePlayback = useCallback((playing: boolean) => dispatch({ type: "toggle-playback", playing }), []);
  const onNext = useCallback(() => goTo(stateRef.current.activeIndex + 1), [goTo]);
  const onPrevious = useCallback(() => goTo(stateRef.current.activeIndex - 1), [goTo]);

  const renderItem = useCallback(({ item, index }: { item: ReelItemModel; index: number }) => (
    <ReelItem
      appState={appState}
      count={state.count}
      focused={focused}
      height={height}
      index={index}
      insets={insets}
      item={item}
      onClose={onClose}
      onNext={onNext}
      onOpenAnalysis={onOpenAnalysis}
      onPrevious={onPrevious}
      onTogglePlayback={onTogglePlayback}
      onViewChange={setView}
      playback={state.playback}
      reducedMotion={reducedMotion}
      role={reelMediaRole(index, state.activeIndex)}
      view={view}
      width={width}
    />
  ), [appState, focused, height, insets, onClose, onNext, onOpenAnalysis, onPrevious, onTogglePlayback, reducedMotion, state.activeIndex, state.count, state.playback, view, width]);

  if (!(height > 0) || !(width > 0) || items.length === 0) return null;

  return (
    <FlatList
      ref={listRef}
      data={items}
      decelerationRate="fast"
      disableIntervalMomentum
      extraData={{ state, view, focused, appState, reducedMotion }}
      getItemLayout={(_, index) => ({ length: height, offset: reelSnapOffset(index, height), index })}
      initialNumToRender={1}
      initialScrollIndex={clampReelIndex(initialIndex, items.length)}
      keyExtractor={(item) => item.id}
      maxToRenderPerBatch={2}
      onMomentumScrollEnd={onMomentumScrollEnd}
      pagingEnabled
      removeClippedSubviews
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={height}
      style={{ width, height }}
      testID="reels-feed"
      viewabilityConfigCallbackPairs={viewability.current}
      windowSize={3}
    />
  );
}
