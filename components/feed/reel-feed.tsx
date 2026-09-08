import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from "react-native";

import type { ReelAction } from "@/components/feed/reel-chrome";
import { ReelItem, type ReelSavedMoment } from "@/components/feed/reel-item";
import type { MotionLiftPhase } from "@/lib/feed/motion-lift-state";
import {
  createReelFeedState,
  reelIndexFromOffset,
  reelMediaRole,
  reelSnapOffset,
  transitionReelFeedState,
  type ReelFeedState,
} from "@/lib/feed/reel-feed-state";
import type { ReelItem as ReelItemModel } from "@/lib/feed/reel-model";

const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 0 };
const noop = () => {};

type ReelFeedProps = {
  items: readonly ReelItemModel[];
  width: number;
  /** The viewport height; every item is exactly this tall. */
  height: number;
  reducedMotion: boolean;
  actionsFor: (item: ReelItemModel) => readonly ReelAction[];
  onStateChange?: (state: ReelFeedState) => void;
  /** A held Motion Lift released while armed keeps this moment. */
  onSave?: (moment: ReelSavedMoment) => void;
  onLiftPhase?: (phase: MotionLiftPhase) => void;
};

/**
 * The vertical, one-item-per-viewport feed. Snapping is native paging; the
 * active index settles through viewability and through the VoiceOver actions
 * alike, and only the active item plays. A grabbed Motion Lift locks the
 * scroll until release, so a held drag never changes the Reel.
 */
export function ReelFeed({ items, width, height, reducedMotion, actionsFor, onStateChange, onSave = noop, onLiftPhase }: ReelFeedProps) {
  const [state, dispatch] = useReducer(transitionReelFeedState, items.length, createReelFeedState);
  const [scrollLocked, setScrollLocked] = useState(false);
  const listRef = useRef<FlatList<ReelItemModel>>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    dispatch({ type: "items", count: items.length });
  }, [items.length]);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  // A new Reel always starts unlocked, whatever the previous one was doing.
  useEffect(() => {
    setScrollLocked(false);
  }, [state.activeIndex]);

  const goTo = useCallback((index: number) => {
    const target = Math.max(0, Math.min(stateRef.current.count - 1, index));
    if (target === stateRef.current.activeIndex) return;
    dispatch({ type: "settle", index: target });
    listRef.current?.scrollToOffset({ offset: reelSnapOffset(target, height), animated: !reducedMotion });
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

  const renderItem = useCallback(({ item, index }: { item: ReelItemModel; index: number }) => (
    <ReelItem
      actions={actionsFor(item)}
      count={state.count}
      height={height}
      index={index}
      item={item}
      onLiftPhase={onLiftPhase}
      onLockScroll={setScrollLocked}
      onNext={() => goTo(stateRef.current.activeIndex + 1)}
      onPrevious={() => goTo(stateRef.current.activeIndex - 1)}
      onSave={onSave}
      onTogglePlayback={() => dispatch({ type: "toggle-playback" })}
      paused={index === state.activeIndex && state.paused}
      reducedMotion={reducedMotion}
      role={reelMediaRole(index, state.activeIndex)}
      width={width}
    />
  ), [actionsFor, goTo, height, onLiftPhase, onSave, reducedMotion, state.activeIndex, state.count, state.paused, width]);

  if (!(height > 0) || !(width > 0)) return null;

  return (
    <FlatList
      ref={listRef}
      data={items}
      decelerationRate="fast"
      disableIntervalMomentum
      extraData={state}
      getItemLayout={(_, index) => ({ length: height, offset: reelSnapOffset(index, height), index })}
      initialNumToRender={1}
      keyExtractor={(item) => item.id}
      maxToRenderPerBatch={2}
      onMomentumScrollEnd={onMomentumScrollEnd}
      pagingEnabled
      removeClippedSubviews
      renderItem={renderItem}
      scrollEnabled={!scrollLocked}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={height}
      style={{ width, height }}
      testID="reel-feed"
      viewabilityConfigCallbackPairs={viewability.current}
      windowSize={3}
    />
  );
}
