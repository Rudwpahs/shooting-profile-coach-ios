import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { ReelAction } from "@/components/feed/reel-chrome";
import { ReelFeed } from "@/components/feed/reel-feed";
import type { ReelSavedMoment } from "@/components/feed/reel-item";
import { ScreenContainer } from "@/components/screen-container";
import { TOP_BAR_HEIGHT, TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useHomeCoachReel } from "@/hooks/use-home-coach-reel";
import { homeSocialDependencies, useHomePublicReels } from "@/hooks/use-home-public-reels";
import { useLatestRepresentativeProfile } from "@/hooks/use-latest-representative-profile";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { buildHomeFeed, homeStatusLine, referenceReels, userReelFromLatest } from "@/lib/feed/home-feed";
import type { ReelItem } from "@/lib/feed/reel-model";
import { isMomentSaved, saveMoment, toggleSavedMoment, type SavedMoment } from "@/lib/feed/saved-moments";
import { syncSavedMoment, syncUnsavedMoment } from "@/lib/feed/saved-reels-sync";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { useProfile } from "@/lib/profile-store";

/** Estimates used only until the viewport is measured: the flat tab bar and the one status line. */
const TAB_BAR_ESTIMATE = 56;
const STATUS_LINE_HEIGHT = 32;
const COMPACT_FALLBACK = { width: 375, height: 812 };

/**
 * Home is one vertical feed of full-height reels: my latest representative
 * loop, the coaching moment right after it when the frozen feed event says
 * there is one, then the anonymous reference. The default reel carries no
 * analysis; tap pauses, hold lifts, sideways turns, up keeps. Capture stays
 * one action in the bar, and a state without my reel is one honest line.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { profile: userProfile } = useProfile();
  const { user, loading: authLoading } = useFirebaseAuth();
  const latest = useLatestRepresentativeProfile(user, authLoading);
  const coach = useHomeCoachReel(latest, userProfile);
  const publicReels = useHomePublicReels(user, authLoading);
  const reducedMotion = useReduceMotion();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const [saved, setSaved] = useState<SavedMoment[]>([]);

  const own = useMemo(() => userReelFromLatest(latest), [latest]);
  const references = useMemo(() => referenceReels(ANONYMOUS_POSE_REFERENCES), []);
  const items = useMemo(
    () => buildHomeFeed({ own, coach: coach.reel, publicReels: publicReels.reels, references }),
    [own, coach.reel, publicReels.reels, references],
  );

  // Posts I already saved show as saved; the store is read once per sign-in and only ever adds.
  useEffect(() => {
    if (publicReels.savedPostIds.length === 0) return;
    setSaved((current) => {
      const known = new Set(current.map((moment) => moment.itemId));
      const additions = publicReels.savedPostIds.filter((postId) => !known.has(`post-${postId}`)).map((postId) => ({ itemId: `post-${postId}`, yaw: 0, savedAtMs: 0 }));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [publicReels.savedPostIds]);
  const status = homeStatusLine(latest);
  const profileId = latest.status === "ready" ? latest.summary.id : null;

  const openCapture = useCallback(() => router.push("/private-capture" as never), [router]);
  const openProfile = useCallback(() => router.navigate("/profile" as never), [router]);
  const openLibrary = useCallback(() => router.push("/library" as never), [router]);
  const openAnalysis = useCallback(() => {
    if (profileId) router.push(`/private-analysis/${profileId}` as never);
  }, [profileId, router]);

  // Saved moments land in session state first (the reel never waits on the network);
  // a public post is then persisted under one document per post, and failures stay silent.
  const onSave = useCallback((moment: ReelSavedMoment) => {
    setSaved((current) => saveMoment(current, { itemId: moment.itemId, yaw: moment.yaw, savedAtMs: Date.now() }));
    const item = items.find((candidate) => candidate.id === moment.itemId);
    if (item) void syncSavedMoment(homeSocialDependencies().social, item, moment);
  }, [items]);
  const toggleSave = useCallback((itemId: string) => {
    const wasSaved = isMomentSaved(saved, itemId);
    setSaved((current) => toggleSavedMoment(current, { itemId, yaw: 0, savedAtMs: Date.now() }));
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const social = homeSocialDependencies().social;
    void (wasSaved ? syncUnsavedMoment(social, item) : syncSavedMoment(social, item, { itemId, yaw: 0 }));
  }, [items, saved]);

  const actionsFor = useCallback((item: ReelItem): readonly ReelAction[] => {
    if (item.kind === "reference") return [{ icon: "arrow-expand", label: `${item.label} 참조 모션 열기`, onPress: openLibrary }];
    const isSaved = isMomentSaved(saved, item.id);
    const bookmark: ReelAction = { icon: isSaved ? "bookmark" : "bookmark-outline", label: isSaved ? "저장 취소" : "저장", onPress: () => toggleSave(item.id) };
    // The analysis route redirects while the viewer flag is off; do not offer a door that goes nowhere.
    const detail: ReelAction[] = FORMPATH_FLAGS.representative4DViewer && profileId
      ? [{ icon: "arrow-expand", label: item.kind === "coach" ? "코치 설명 자세히" : "내 대표 슛폼 분석 열기", onPress: openAnalysis }]
      : [];
    if (item.kind === "coach") return [...detail, bookmark];
    // Another shooter's public post: no door into my analysis or profile, just the bookmark.
    if (item.motion.source === "public") return [bookmark];
    return [...detail, { icon: "human", label: "내 슛폼 프로필 열기", onPress: openProfile }, bookmark];
  }, [openAnalysis, openLibrary, openProfile, profileId, saved, toggleSave]);

  // Until the viewport is measured, web uses the window (or a compact-iPhone estimate when even that is unknown); native waits for layout.
  const windowWidth = window.width > 0 ? Math.round(window.width) : COMPACT_FALLBACK.width;
  const windowHeight = window.height > 0 ? Math.round(window.height) : COMPACT_FALLBACK.height;
  const width = measured.width > 0 ? measured.width : windowWidth;
  const height = measured.height > 0
    ? measured.height
    : Platform.OS === "web"
      ? Math.max(1, windowHeight - TOP_BAR_HEIGHT - TAB_BAR_ESTIMATE - (status ? STATUS_LINE_HEIGHT : 0))
      : 0;

  return (
    <ScreenContainer containerClassName="bg-background">
      <TopBar
        right={(
          <Pressable
            accessibilityLabel="슛폼 촬영"
            accessibilityRole="button"
            onPress={openCapture}
            style={({ pressed }) => [styles.barAction, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="video-outline" size={26} color={tokens.foreground} />
          </Pressable>
        )}
        wordmark="Hoop Hub"
      />
      {status ? (
        <Text accessibilityLiveRegion={latest.status === "error" ? "assertive" : "polite"} numberOfLines={1} style={styles.status}>
          {status}
        </Text>
      ) : null}
      <View
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setMeasured({ width: Math.round(w), height: Math.round(h) });
        }}
        style={styles.viewport}
      >
        {height > 0 && width > 0 ? (
          <ReelFeed
            actionsFor={actionsFor}
            height={height}
            items={items}
            onSave={onSave}
            reducedMotion={reducedMotion ?? true}
            width={width}
          />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  barAction: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  pressed: { opacity: 0.5 },
  status: { ...typography.callout, color: tokens.mutedForeground, paddingHorizontal: 14, paddingVertical: 6 },
});
