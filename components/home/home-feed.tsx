import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FeedCard } from "@/components/home/feed-card";
import { StoryStrip, type StoryItem } from "@/components/home/story-strip";
import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { profileReelId, referenceReelId } from "@/lib/reels/reel-model";
import { poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

export type HomeFeedProps = {
  width: number;
  latest: LatestRepresentativeState;
  reference: AnonymousPoseReference;
  goalLabel: string;
  focusTitle: string;
  viewerEnabled: boolean;
  onOpenCapture: () => void;
  onOpenProfile: () => void;
  onOpenReference: () => void;
  onOpenAnalysis: (profileId: string) => void;
  /** A tap on a preview opens full-screen Reels at that item. */
  onOpenReel: (reelId: string) => void;
};

/**
 * The feed itself: a story strip, my latest skeleton loop (or an honest
 * placeholder), and the anonymous reference loop. One caption line per card.
 * Each preview keeps playing inline and opens Reels on tap, the way a Reel
 * preview does; there is no detail screen and no separate expand control.
 * Presentational, so the route and the development demo render the same thing.
 */
export function HomeFeed({ width, latest, reference, goalLabel, focusTitle, viewerEnabled, onOpenCapture, onOpenProfile, onOpenReference, onOpenAnalysis, onOpenReel }: HomeFeedProps) {
  const stageHeight = Math.round(width * 0.9);
  const referenceAvatar = useMemo(() => poseMotionGlyph(reference.motion, { view: "side", progress: 0.75 }), [reference.motion]);
  const silhouette = useMemo(() => poseMotionGlyph(reference.motion, { view: "oblique", progress: 0.75 }), [reference.motion]);
  const ownAvatar = latest.status === "ready"
    ? representativeGlyph(latest.record.profile.frames[representativeReleaseFrameIndex(latest.record.profile)], "side", latest.record.shootingHand)
    : null;

  const stories: StoryItem[] = [
    { key: "capture", kind: "capture", label: "촬영", accessibilityLabel: "슛폼 촬영", onPress: onOpenCapture },
    ...(ownAvatar ? [{ key: "own", kind: "glyph" as const, glyph: ownAvatar, accent: true, label: "내 슛폼", accessibilityLabel: "내 슛폼 프로필 열기", onPress: onOpenProfile }] : []),
    { key: "reference", kind: "glyph", glyph: referenceAvatar, label: reference.shortLabel, accessibilityLabel: `${reference.shortLabel} 참조 모션 열기`, onPress: onOpenReference },
  ];

  const placeholderLine = latest.status === "signed-out"
    ? "로그인 후 촬영"
    : latest.status === "error"
      ? "내 슛폼을 불러오지 못했습니다"
      : latest.status === "disabled"
        ? "대표 슛폼 저장이 꺼져 있습니다"
        : "첫 슛폼을 촬영해 보세요";

  return (
    <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
      <StoryStrip items={stories} />

      {latest.status === "ready" ? (
        <FeedCard
          actions={[
            // The analysis route redirects while the viewer flag is off, so the
            // action only exists when it can open something.
            ...(viewerEnabled
              ? [{ icon: "arrow-expand" as const, label: "내 대표 슛폼 분석 열기", onPress: () => onOpenAnalysis(latest.summary.id) }]
              : []),
            { icon: "human", label: "내 슛폼 프로필 열기", onPress: onOpenProfile },
          ]}
          caption={focusTitle}
          captionLead={`목표 · ${goalLabel}`}
          confidence={representativeConfidence(latest.record.profile)}
          meta={relativeDayLabel(latest.summary.createdAt.toDate())}
          stage={(
            <Pressable
              accessibilityLabel="내 슛폼 릴 열기"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              onPress={() => onOpenReel(profileReelId(latest.summary.id))}
              style={({ pressed }) => [{ width, height: stageHeight }, pressed && styles.stagePressed]}
            >
              <SkeletonLoop
                accessibilityLabel="내 최근 대표 슛폼 skeleton, 사선 시점 재생"
                confidence={representativeConfidence(latest.record.profile)}
                height={stageHeight}
                profile={latest.record.profile}
                shootingHand={latest.record.shootingHand}
                view="oblique"
                width={width}
              />
            </Pressable>
          )}
          title="내 슛폼"
        />
      ) : (
        <FeedCard
          actions={[{ icon: "video", label: "슛폼 촬영", onPress: onOpenCapture }]}
          caption={focusTitle}
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
        actions={[{ icon: "arrow-expand", label: `${reference.shortLabel} 참조 모션 열기`, onPress: onOpenReference }]}
        caption={reference.styleTitle}
        meta="CMU optical mocap"
        stage={(
          <Pressable
            accessibilityLabel={`${reference.shortLabel} 참조 릴 열기`}
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            disabled={false}
            onPress={() => onOpenReel(referenceReelId(reference.id))}
            style={({ pressed }) => [{ width, height: stageHeight }, pressed && styles.stagePressed]}
          >
            <PoseMotionLoop
              accessibilityLabel={`${reference.shortLabel} 참조 skeleton, 사선 시점 재생`}
              height={stageHeight}
              motion={reference.motion}
              view="oblique"
              width={width}
            />
          </Pressable>
        )}
        title={reference.shortLabel}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  placeholder: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "flex-end", overflow: "hidden", paddingBottom: 22 },
  silhouette: { left: 0, opacity: 0.16, position: "absolute", top: 0 },
  placeholderText: { ...typography.callout, color: tokens.mutedForeground },
  stagePressed: { opacity: 0.92 },
});
