import { useCallback, useEffect, useReducer, useRef } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from "react-native";

import type { ReelAction } from "@/components/feed/reel-chrome";
import { ReelItem } from "@/components/feed/reel-item";
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

type ReelFeedProps = {
  items: readonly ReelItemModel[];
  width: number;
  /** The viewport height; every item is exactly this tall. */
  height: number;
  reducedMotion: boolean;
  /** A held interaction on the active item may lock feed scrolling. */
  scrollLocked?: boolean;
  actionsFor: (item: ReelItemModel) => readonly ReelAction[];
  onStateChange?: (state: ReelFeedState) => void;
};

/**
 * The vertical, one-item-per-viewport feed. Snapping is native paging; the
 * active index settles through viewability and through the VoiceOver actions
 * alike, and only the active item plays.
 */
export function ReelFeed({ items, width, height, reducedMotion, scrollLocked = false, actionsFor, onStateChange }: ReelFeedProps) {
  const [state, dispatch] = useReducer(transitionReelFeedState, items.length, createReelFeedState);
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
      onNext={() => goTo(stateRef.current.activeIndex + 1)}
      onPrevious={() => goTo(stateRef.current.activeIndex - 1)}
      onTogglePlayback={() => dispatch({ type: "toggle-playback" })}
      paused={index === state.activeIndex && state.paused}
      role={reelMediaRole(index, state.activeIndex)}
      width={width}
    />
  ), [actionsFor, goTo, height, state.activeIndex, state.count, state.paused, width]);

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
