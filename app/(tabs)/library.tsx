import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useAppStateStatus } from "@/hooks/use-app-state";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { useTabSceneSize } from "@/hooks/use-tab-scene-size";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { referenceReelId, type ReelItem } from "@/lib/reels/reel-model";

/**
 * 참조 동작: the one approved optical-mocap reference as a single reel, with
 * the same chrome every player uses. 동작 정보 carries the attribution, the
 * measurement boundary, the original C3D frames and the recommendation
 * entry; likes and memos stay on this device.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appState = useAppStateStatus();
  const reducedMotion = useReduceMotion();
  const focused = useIsFocused();
  const { width, height, onLayout } = useTabSceneSize();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const items = useMemo<ReelItem[]>(() => (reference ? [{ kind: "reference", id: referenceReelId(reference.id), reference }] : []), [reference]);
  const renderInfo = useCallback(() => ({
    action: { label: "추천 목표 선택", onPress: () => router.replace("/assessment" as never) },
  }), [router]);

  return (
    <ScreenContainer containerClassName="bg-background" edges={[]} onLayout={onLayout} style={styles.screen} testID="reference-reel">
      {items.length > 0 && width > 0 && height > 0 ? (
        <ReelsFeed
          appState={appState}
          focused={focused}
          heading="참조 동작"
          height={height}
          initialIndex={0}
          insets={{ top: insets.top, bottom: 0 }}
          items={items}
          onClose={null}
          onOpenAnalysis={null}
          reducedMotion={reducedMotion}
          renderInfo={renderInfo}
          width={width}
        />
      ) : <Text style={styles.empty}>참조 동작을 준비하고 있습니다.</Text>}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage, flex: 1 },
  empty: { ...typography.body, color: tokens.mutedForeground, padding: 24 },
});
