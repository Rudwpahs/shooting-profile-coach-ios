import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { FeedCard } from "@/components/home/feed-card";
import { StoryStrip, type StoryItem } from "@/components/home/story-strip";
import { ScreenContainer } from "@/components/screen-container";
import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { useLatestRepresentativeProfile } from "@/hooks/use-latest-representative-profile";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { useProfile } from "@/lib/profile-store";
import { getPracticeFocus } from "@/lib/recommendation";
import { poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const GOAL_LABELS = { consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" } as const;

/**
 * 홈 answers three things in one glance: what I can do now (촬영), what my
 * motion looks like now (my latest skeleton), and what to look at next (the
 * anonymous reference). Every card is a skeleton loop with one caption line.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading: authLoading } = useFirebaseAuth();
  const latest = useLatestRepresentativeProfile(user, authLoading);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const stageHeight = Math.round(width * 0.9);
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const focus = getPracticeFocus(profile.goal);
  const goalLabel = GOAL_LABELS[profile.goal];

  const referenceAvatar = useMemo(() => poseMotionGlyph(reference.motion, { view: "side", progress: 0.75 }), [reference.motion]);
  const silhouette = useMemo(() => poseMotionGlyph(reference.motion, { view: "oblique", progress: 0.75 }), [reference.motion]);
  const ownAvatar = latest.status === "ready"
    ? representativeGlyph(latest.record.profile.frames[representativeReleaseFrameIndex(latest.record.profile)], "side", latest.record.shootingHand)
    : null;

  const openCapture = () => router.push("/private-capture" as never);
  const openProfile = () => router.navigate("/profile" as never);
  const openReference = () => router.push("/library" as never);

  const stories: StoryItem[] = [
    { key: "capture", kind: "capture", label: "촬영", accessibilityLabel: "슛폼 촬영", onPress: openCapture },
    ...(ownAvatar ? [{ key: "own", kind: "glyph" as const, glyph: ownAvatar, accent: true, label: "내 슛폼", accessibilityLabel: "내 슛폼 프로필 열기", onPress: openProfile }] : []),
    { key: "reference", kind: "glyph", glyph: referenceAvatar, label: reference.shortLabel, accessibilityLabel: `${reference.shortLabel} 참조 모션 열기`, onPress: openReference },
  ];

  const placeholderLine = latest.status === "signed-out"
    ? "로그인 후 촬영"
    : latest.status === "error"
      ? "내 슛폼을 불러오지 못했습니다"
      : latest.status === "disabled"
        ? "대표 슛폼 저장이 꺼져 있습니다"
        : "첫 슛폼을 촬영해 보세요";

  return (
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
        <View style={styles.bar}><Text style={styles.wordmark}>Hoop Hub</Text></View>
        <StoryStrip items={stories} />

        {latest.status === "ready" ? (
          <FeedCard
            actions={[
              { icon: "arrow-expand", label: "내 대표 슛폼 분석 열기", onPress: () => router.push(`/private-analysis/${latest.summary.id}` as never) },
              { icon: "human", label: "내 슛폼 프로필 열기", onPress: openProfile },
            ]}
            caption={focus.title}
            captionLead={`목표 · ${goalLabel}`}
            confidence={representativeConfidence(latest.record.profile)}
            meta={relativeDayLabel(latest.summary.createdAt.toDate())}
            stage={(
              <SkeletonLoop
                accessibilityLabel="내 최근 대표 슛폼 skeleton, 사선 시점 재생"
                confidence={representativeConfidence(latest.record.profile)}
                height={stageHeight}
                profile={latest.record.profile}
                shootingHand={latest.record.shootingHand}
                view="oblique"
                width={width}
              />
            )}
            title="내 슛폼"
          />
        ) : (
          <FeedCard
            actions={[{ icon: "video", label: "슛폼 촬영", onPress: openCapture }]}
            caption={focus.title}
            captionLead={`목표 · ${goalLabel}`}
            stage={(
              <View accessible accessibilityLabel={latest.status === "loading" ? "내 슛폼을 불러오는 중" : placeholderLine} style={[styles.placeholder, { width, height: stageHeight }]}>
                <View pointerEvents="none" style={styles.silhouette}>
                  <SkeletonGlyph accessible={false} accessibilityLabel="" data={silhouette} ground={false} height={stageHeight} padding={Math.round(stageHeight * 0.14)} width={width} />
                </View>
                {latest.status === "loading" ? <ActivityIndicator color={tokens.mutedForeground} /> : <Text style={styles.placeholderText}>{placeholderLine}</Text>}
              </View>
            )}
            title="내 슛폼"
          />
        )}

        <FeedCard
          actions={[{ icon: "arrow-expand", label: `${reference.shortLabel} 참조 모션 열기`, onPress: openReference }]}
          caption={reference.styleTitle}
          meta="CMU optical mocap"
          stage={(
            <PoseMotionLoop
              accessibilityLabel={`${reference.shortLabel} 참조 skeleton, 사선 시점 재생`}
              height={stageHeight}
              motion={reference.motion}
              view="oblique"
              width={width}
            />
          )}
          title={reference.shortLabel}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  bar: { alignItems: "center", flexDirection: "row", height: 44, paddingHorizontal: 14 },
  wordmark: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 24, letterSpacing: -0.3 },
  placeholder: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "flex-end", overflow: "hidden", paddingBottom: 22 },
  silhouette: { left: 0, opacity: 0.16, position: "absolute", top: 0 },
  placeholderText: { color: tokens.mutedForeground, fontSize: 13 },
});
