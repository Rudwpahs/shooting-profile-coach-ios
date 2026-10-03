import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelsFeed } from "@/components/reels/reels-feed";
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
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { items, onActiveIndex } = useExploreFeed(exploreMotions());

  // The feed needs the tab scene's own size: the tab bar sits below it and
  // the window can report 0 before layout on the static web render.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.round(width), height: Math.round(height) });
  }, []);
  const onOpenAnalysis = useCallback((profileId: string) => {
    router.push(minimalAnalysisHref(profileId) as never);
  }, [router]);

  return (
    <View onLayout={onLayout} style={styles.screen} testID="explore-feed-screen">
      {size.width > 0 && size.height > 0 && items.length > 0 ? (
        <ReelsFeed
          appState={appState}
          focused={focused}
          height={size.height}
          initialIndex={0}
          insets={{ top: insets.top, bottom: 0 }}
          items={items}
          onClose={null}
          onOpenAnalysis={FORMPATH_FLAGS.representative4DViewer ? onOpenAnalysis : null}
          onStateChange={(state) => onActiveIndex(state.activeIndex)}
          reducedMotion={reducedMotion}
          viewChips={false}
          width={size.width}
        />
      ) : (
        <View accessibilityLabel="탐색 피드를 준비하는 중" style={styles.pending}>
          <ActivityIndicator color={tokens.mutedForeground} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage, flex: 1 },
  pending: { alignItems: "center", flex: 1, justifyContent: "center" },
});
