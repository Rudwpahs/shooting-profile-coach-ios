import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilmReelUnavailable } from "@/components/reels/film-reel-unavailable";
import { ReelsFeed } from "@/components/reels/reels-feed";
import { tokens } from "@/constants/tokens";
import { useAppStateStatus } from "@/hooks/use-app-state";
import { useFilmShots } from "@/hooks/use-film-shots";
import { useLatestRepresentativeProfile } from "@/hooks/use-latest-representative-profile";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { initialReelIndex } from "@/lib/reels/reel-feed-state";
import { takeReelHandoff, type ReelHandoff } from "@/lib/reels/reel-handoff";
import { isFilmReelId } from "@/lib/reels/reel-model";
import { homeReelItems } from "@/lib/reels/reel-sources";

const ENTER_MS = 220;
const useNativeDriver = Platform.OS !== "web";

/**
 * Full-screen Reels. A stack route outside the tabs, so the tab bar and the
 * top bar are simply absent; the safe-area insets go to the chrome. Home
 * hands over the items it was showing and the tapped id; a deep link without
 * a handoff rebuilds the same list from Home's own sources. Leaving to the
 * analysis route keeps this screen mounted, so the same Reel and frame are
 * there on return; back returns to Home where it was.
 */
export default function ReelsRoute() {
  const params = useLocalSearchParams<{ start?: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const appState = useAppStateStatus();
  const reducedMotion = useReduceMotion();
  const [handoff] = useState<ReelHandoff | null>(() => takeReelHandoff());
  const { user, loading: authLoading } = useFirebaseAuth();
  // Only a deep link without a handoff loads anything; Home's own state is reused otherwise.
  const latest = useLatestRepresentativeProfile(handoff ? null : user, authLoading);
  const filmShots = useFilmShots(!handoff);
  const items = useMemo(() => handoff?.items ?? homeReelItems(latest, ANONYMOUS_POSE_REFERENCES, filmShots.shots), [filmShots.shots, handoff, latest]);
  const startId = typeof params.start === "string" ? params.start : handoff?.startId;
  const initialIndex = useMemo(() => initialReelIndex(items, startId), [items, startId]);
  const listKey = useMemo(() => items.map((item) => item.id).join("|"), [items]);
  // A deep link to one of my film shots never falls through to another reel: it waits for the device list, shows a
  // store failure with a retry, and tells a shot that is really not on this device apart from that failure.
  const filmDeepLink = !handoff && isFilmReelId(startId);
  const filmGate: "ready" | "loading" | "error" | "missing" = !filmDeepLink
    ? "ready"
    : filmShots.status === "loading"
      ? "loading"
      : filmShots.status === "error"
        ? "error"
        : items.some((item) => item.id === startId)
          ? "ready"
          : "missing";

  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  // The Home preview grows into the stage: a short scale and fade, none under Reduce Motion.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      enter.setValue(1);
      return;
    }
    const animation = Animated.timing(enter, { toValue: 1, duration: ENTER_MS, useNativeDriver });
    animation.start();
    return () => animation.stop();
  }, [enter, reducedMotion]);

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/" as never);
  }, [router]);
  const onOpenAnalysis = useCallback((profileId: string) => {
    router.push(`/private-analysis/${profileId}` as never);
  }, [router]);

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.stage,
          { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
      >
        {filmGate === "loading" ? null : filmGate === "error" ? (
          <FilmReelUnavailable insets={{ top: insets.top, bottom: insets.bottom }} kind="error" onClose={onClose} onRetry={filmShots.reload} />
        ) : filmGate === "missing" ? (
          <FilmReelUnavailable insets={{ top: insets.top, bottom: insets.bottom }} kind="missing" onClose={onClose} />
        ) : (
          <ReelsFeed
            key={listKey}
            appState={appState}
            focused={focused}
            height={height}
            initialIndex={initialIndex}
            insets={{ top: insets.top, bottom: insets.bottom }}
            items={items}
            onClose={onClose}
            onOpenAnalysis={FORMPATH_FLAGS.representative4DViewer ? onOpenAnalysis : null}
            reducedMotion={reducedMotion}
            width={width}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage, flex: 1 },
  stage: { flex: 1 },
});
