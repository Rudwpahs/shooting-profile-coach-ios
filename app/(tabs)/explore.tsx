import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { tokens } from "@/constants/tokens";
import { useAppStateStatus } from "@/hooks/use-app-state";
import { useExploreFeed } from "@/hooks/use-explore-feed";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { exploreMotions } from "@/lib/explore-source";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { minimalAnalysisHref } from "@/lib/shooting-profile/analysis-presentation";

/**
 * 탐색: other people's shooting forms, one per screen. The same vertical feed
 * as Reels, inside the tab: no close affordance (the tab bar is the way out)
 * and no virtual view chips (the figure is the content, not a camera). Today
 * the only lawful public content is the CMU optical-mocap reference; the
 * install-free preview adds its synthetic library through the explore source,
 * and each reel is built on first approach so the first one paints at once.
 * Opening 분석 lands on the minimal analysis surface.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appState = useAppStateStatus();
  const reducedMotion = useReduceMotion();
  const focused = useIsFocused();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { items, onActiveIndex } = useExploreFeed(exploreMotions());

  // The feed takes the tab scene's own size (the tab bar sits below it);
  // until layout reports it, the window size stands in so the first reel
  // paints at once, including on the static web render.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = { width: Math.round(event.nativeEvent.layout.width), height: Math.round(event.nativeEvent.layout.height) };
    setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
  }, []);
  const width = size.width > 0 ? size.width : Math.round(window.width);
  const height = size.height > 0 ? size.height : Math.round(window.height);
  const onOpenAnalysis = useCallback((profileId: string) => {
    const item = items.find((candidate) => candidate.kind === "profile" && candidate.profileId === profileId);
    router.push(minimalAnalysisHref(profileId, item?.kind === "profile" ? item.title : undefined) as never);
  }, [items, router]);

  // No safe-area edges here: the feed is full-bleed and hands the top inset to its own chrome.
  return (
    <ScreenContainer containerClassName="bg-background" edges={[]} onLayout={onLayout} style={styles.screen} testID="explore-feed-screen">
      {width > 0 && height > 0 && items.length > 0 ? (
        <ReelsFeed
          appState={appState}
          focused={focused}
          height={height}
          initialIndex={0}
          insets={{ top: insets.top, bottom: 0 }}
          items={items}
          onClose={null}
          onOpenAnalysis={FORMPATH_FLAGS.representative4DViewer ? onOpenAnalysis : null}
          onStateChange={(state) => onActiveIndex(state.activeIndex)}
          reducedMotion={reducedMotion}
          viewChips={false}
          width={width}
        />
      ) : (
        <View accessibilityLabel="탐색 피드를 준비하는 중" style={styles.pending}>
          <ActivityIndicator color={tokens.mutedForeground} />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage, flex: 1 },
  pending: { alignItems: "center", flex: 1, justifyContent: "center" },
});
