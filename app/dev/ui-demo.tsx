import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { HomeFeed } from "@/components/home/home-feed";
import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import { SequenceViewer, type RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { UI_DEMO_ENABLED } from "@/lib/dev/ui-demo";
import type { UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";
import { primaryFinding } from "@/lib/skeleton/analysis-evidence";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const noop = () => undefined;
/** Reels demo states: autoplaying, paused with the indicator, the next item active, and the paused frame the analysis action opens from. */
const REEL_STATES = ["playing", "paused", "next", "analysis-entry"] as const;
type ReelDemoState = (typeof REEL_STATES)[number];

function useDemoFixtures(): UiDemoFixtures | null {
  return useMemo(() => {
    let fixtures: UiDemoFixtures | null = null;
    // Keep the require behind build-time-foldable literals. Normal production exports have
    // neither flag enabled, while the GitHub Pages workflow explicitly enables PREVIEW_BUILD.
    if (
      (__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1") ||
      process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("@/lib/dev/ui-demo-fixtures") as typeof import("@/lib/dev/ui-demo-fixtures");
      fixtures = module.buildUiDemoFixtures();
    }
    return fixtures;
  }, []);
}

/**
 * UI DEMO. Renders the real presentational components with synthetic fixtures
 * so every state can be reviewed without an account, a device or a recording.
 * Normal production builds remain disabled; the Pages preview is an explicit
 * build-time opt-in used only by its deployment workflow.
 */
export default function UiDemoRoute() {
  const params = useLocalSearchParams<{ screen?: string; state?: string }>();
  const fixtures = useDemoFixtures();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!UI_DEMO_ENABLED || !fixtures) return <Redirect href="/" />;
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const screen = typeof params.screen === "string" ? params.screen : "home";
  const state = typeof params.state === "string" ? params.state : "ready";
  const reference = ANONYMOUS_POSE_REFERENCES[0];

  if (screen === "home") {
    const latest = state === "ready"
      ? { status: "ready" as const, summary: fixtures.summaries[0], record: fixtures.record }
      : state === "loading" ? { status: "loading" as const } : { status: "signed-out" as const };
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar wordmark="Hoop Hub" />
        <HomeFeed
          focusTitle="같은 리듬을 먼저 만드세요"
          goalLabel="일관성"
          latest={latest}
          onOpenAnalysis={noop}
          onOpenCapture={noop}
          onOpenProfile={noop}
          onOpenReel={noop}
          onOpenReference={noop}
          reference={reference}
          viewerEnabled
          width={width}
        />
      </ScreenContainer>
    );
  }

  if (screen === "profile") {
    const signedIn = state !== "signed-out";
    const glyphs = signedIn ? Object.fromEntries(fixtures.summaries.map((summary) => [summary.id, fixtures.record])) : {};
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar title={signedIn ? "내 슛폼" : "프로필"} />
        <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
          <ProfileHero onViewChange={setHeroView} record={signedIn ? fixtures.record : undefined} state={signedIn ? "ready" : "signed-out"} view={heroView} width={width} />
          <ProfileStats locked={!signedIn} stats={[{ value: fixtures.summaries.length, label: "대표 슛폼" }, { value: 0, label: "기존 분석" }]} />
          <Text style={styles.goalLine}>목표 · 일관성</Text>
          {signedIn ? (
            <View style={styles.section}>
              <MotionGrid canOpen deletingProfileId={null} error={null} glyphs={glyphs} loading={false} onDelete={noop} onOpen={noop} records={fixtures.summaries} width={width} />
            </View>
          ) : null}
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (screen === "analysis") {
    const profile = state === "recapture" ? fixtures.recaptureProfile : fixtures.profile;
    return (
      <SafeAreaView style={styles.safeArea}>
        <TopBar title="대표 슛폼" />
        <ScrollView contentContainerStyle={styles.analysisPage}>
          <AnalysisSummaryLine profile={profile} />
          <SequenceViewer confidence={fixtures.record.confidence} highlightJoint={primaryFinding(profile).joint} profile={profile} shootingHand="right" />
          <AnalysisDetails confidence={fixtures.record.confidence} profile={profile} shootingHand="right" />
          <AnalysisEvidence profile={profile} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "reels") {
    const reelState: ReelDemoState = (REEL_STATES as readonly string[]).includes(state) ? (state as ReelDemoState) : "playing";
    return (
      <View style={styles.reels}>
        <ReelsFeed
          appState="active"
          focused
          height={viewport.height}
          initialIndex={reelState === "next" ? 1 : 0}
          initialPlayback={reelState === "paused" || reelState === "analysis-entry" ? "paused" : "auto"}
          insets={{ top: insets.top, bottom: insets.bottom }}
          items={fixtures.reels}
          onClose={noop}
          onOpenAnalysis={noop}
          reducedMotion={false}
          width={viewport.width}
        />
      </View>
    );
  }

  if (screen === "capture") {
    const captureState = state === "setup" || state === "collecting" || state === "recapture" || state === "review" ? fixtures.capture[state] : fixtures.capture.setup;
    const controller: CaptureController = {
      state: captureState,
      canSave: captureState.status === "result_review",
      selectMode: noop,
      returnToModeSelect: noop,
      setShootingHand: noop,
      startCollection: noop,
      acquireSlot: noop,
      retakeSlot: noop,
      cancelSession: noop,
      retrySession: noop,
      save: noop,
    };
    return <CaptureSessionView completionActionLabel="저장된 대표 슛폼 열기" controller={controller} onClose={noop} onComplete={noop} />;
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  goalLine: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 8 },
  section: { marginTop: 14 },
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  analysisPage: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
  reels: { backgroundColor: tokens.stage, flex: 1 },
});
