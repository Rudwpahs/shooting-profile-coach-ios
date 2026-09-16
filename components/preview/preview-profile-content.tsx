import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ScreenContainer } from "@/components/screen-container";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const noop = () => undefined;

/** Synthetic-only profile content for the install-free public preview. */
export function PreviewProfileContent() {
  const router = useRouter();
  const preview = usePreviewRuntime();
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const latestSummary = preview.summaries[0];
  const latestRecord = latestSummary ? preview.recordsById[latestSummary.id] : undefined;

  return (
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar title="내 슛폼" />
      <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
        <ProfileHero
          onViewChange={setHeroView}
          record={latestRecord}
          state={latestRecord ? "ready" : "empty"}
          view={heroView}
          width={width}
        />
        <ProfileStats
          locked={false}
          stats={[
            { value: preview.summaries.length, label: "대표 슛폼" },
            { value: 0, label: "기존 분석" },
          ]}
        />
        <Text style={styles.goalLine}>목표 · 일관성</Text>
        <View style={styles.section}>
          <MotionGrid
            canOpen
            deletingProfileId={null}
            error={null}
            glyphs={preview.recordsById}
            loading={false}
            onDelete={noop}
            onOpen={(profileId) => router.push(`/private-analysis/${profileId}` as never)}
            records={preview.summaries}
            width={width}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  goalLine: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 8 },
  section: { marginTop: 14 },
});
