import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { tokens } from "@/constants/tokens";
import { useAppStateStatus } from "@/hooks/use-app-state";
import { useExploreFeed } from "@/hooks/use-explore-feed";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { useTabSceneSize } from "@/hooks/use-tab-scene-size";
import { exploreMotions } from "@/lib/explore-source";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { analysisHref } from "@/lib/shooting-profile/analysis-presentation";

/**
 * 탐색: other people's shooting forms, one per screen. The same vertical feed
 * as Reels, inside the tab, with the 참조 동작 chrome: a heading instead of a
 * close affordance (the tab bar is the way out), the camera menu, the rail,
 * the caption and the phase dots. Today the only lawful public content is
 * the CMU optical-mocap reference; each reel is built on first approach so
 * the first one paints at once. 분석 opens the analysis stage.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appState = useAppStateStatus();
  const reducedMotion = useReduceMotion();
  const focused = useIsFocused();
  const { width, height, onLayout } = useTabSceneSize();
  const { items, onActiveIndex } = useExploreFeed(exploreMotions());

  const onOpenAnalysis = useCallback((profileId: string) => {
    const item = items.find((candidate) => candidate.kind === "profile" && candidate.profileId === profileId);
    router.push(analysisHref(profileId, item?.kind === "profile" ? item.title : undefined) as never);
  }, [items, router]);

  // No safe-area edges here: the feed is full-bleed and hands the top inset to its own chrome.
  return (
    <ScreenContainer containerClassName="bg-background" edges={[]} onLayout={onLayout} style={styles.screen} testID="explore-feed-screen">
      {width > 0 && height > 0 && items.length > 0 ? (
        <ReelsFeed
          appState={appState}
          focused={focused}
          heading="탐색"
          height={height}
          initialIndex={0}
          insets={{ top: insets.top, bottom: 0 }}
          items={items}
          onClose={null}
          onOpenAnalysis={FORMPATH_FLAGS.representative4DViewer ? onOpenAnalysis : null}
          onStateChange={(state) => onActiveIndex(state.activeIndex)}
          reducedMotion={reducedMotion}
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
