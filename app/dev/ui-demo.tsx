import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { HomeFeed } from "@/components/home/home-feed";
import { HoopHubDock, type HoopHubDockTabName } from "@/components/hoophub-tab-bar";
import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { ShotInspectionViewer } from "@/components/shooting-profile/shot-inspection-viewer";
import { LiquidPressable } from "@/components/ui/liquid";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { UI_DEMO_ENABLED } from "@/lib/dev/ui-demo";
import type { UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";
import { primaryFinding } from "@/lib/skeleton/analysis-evidence";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
/** Reels demo states: autoplaying, paused with the indicator, the next item active, and the paused frame the analysis action opens from. */
const REEL_STATES = ["playing", "paused", "next", "analysis-entry"] as const;
type ReelDemoState = (typeof REEL_STATES)[number];
type UiDemoScreen = "home" | "explore" | "profile" | "analysis" | "reels" | "capture" | "reference";
type UiDemoScene = { screen: UiDemoScreen; state: string };
type UiDemoNavigation = { current: UiDemoScene; history: UiDemoScene[] };

const UI_DEMO_SCREENS: readonly UiDemoScreen[] = ["home", "explore", "profile", "analysis", "reels", "capture", "reference"];

function uiDemoScene(screen?: string, state?: string): UiDemoScene {
  const safeScreen = UI_DEMO_SCREENS.includes(screen as UiDemoScreen) ? (screen as UiDemoScreen) : "home";
  return { screen: safeScreen, state: typeof state === "string" && state.length > 0 ? state : "ready" };
}

function createUiDemoNavigation(screen?: string, state?: string): UiDemoNavigation {
  return { current: uiDemoScene(screen, state), history: [] };
}

function pushUiDemoScene(navigation: UiDemoNavigation, screen: UiDemoScreen, state: string): UiDemoNavigation {
  return { current: { screen, state }, history: [...navigation.history, navigation.current] };
}

function replaceUiDemoScene(navigation: UiDemoNavigation, screen: UiDemoScreen, state: string): UiDemoNavigation {
  return { ...navigation, current: { screen, state } };
}

function backUiDemoScene(navigation: UiDemoNavigation): UiDemoNavigation {
  const previous = navigation.history[navigation.history.length - 1];
  if (!previous) return createUiDemoNavigation("home", "ready");
  return { current: previous, history: navigation.history.slice(0, -1) };
}

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
 * so the browser acts like one signed-in app session without Firebase, a
 * device, or a recording. Navigation remains inside this preview shell so the
 * GitHub Pages base path is never dropped. Normal production builds remain
 * disabled by the explicit build-time gate.
 */
export default function UiDemoRoute() {
  const params = useLocalSearchParams<{ screen?: string; state?: string }>();
  const fixtures = useDemoFixtures();
  const [navigation, setNavigation] = useState(() => createUiDemoNavigation(params.screen, params.state));
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  const [hiddenProfileIds, setHiddenProfileIds] = useState<readonly string[]>([]);
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!UI_DEMO_ENABLED || !fixtures) return <Redirect href="/" />;

  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const { screen, state } = navigation.current;
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const openScene = (nextScreen: UiDemoScreen, nextState = "ready") => {
    setNavigation((current) => pushUiDemoScene(current, nextScreen, nextState));
  };
  const replaceScene = (nextScreen: UiDemoScreen, nextState = "ready") => {
    setNavigation((current) => replaceUiDemoScene(current, nextScreen, nextState));
  };
  const goBack = () => setNavigation((current) => backUiDemoScene(current));
  const previewBack = (
    <LiquidPressable
      accessibilityLabel="미리보기에서 뒤로 가기"
      accessibilityRole="button"
      magnetic
      onPress={goBack}
      rippleColor={tokens.foreground}
      style={styles.iconButton}
      surfaceStyle={styles.iconButtonSurface}
    >
      <MaterialCommunityIcons color={tokens.foreground} name="chevron-left" size={28} />
    </LiquidPressable>
  );
  const previewDock = (selectedRoute: HoopHubDockTabName) => (
    <HoopHubDock
      bottomInset={insets.bottom}
      selectedRoute={selectedRoute}
      onSelectTab={(name) => {
        if (name === "index") openScene("home", "ready");
        else if (name === "explore") openScene("explore", "ready");
        else openScene("profile", "ready");
      }}
      onCapture={() => openScene("capture", "setup")}
    />
  );

  if (screen === "home") {
    const latest = state === "ready"
      ? { status: "ready" as const, summary: fixtures.summaries[0], record: fixtures.record }
      : state === "loading" ? { status: "loading" as const } : { status: "signed-out" as const };
    return (
      <View style={styles.tabScene}>
        <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
          <TopBar wordmark="Hoop Hub" />
          <HomeFeed
            focusTitle="같은 리듬을 먼저 만드세요"
            goalLabel="일관성"
            latest={latest}
            onOpenAnalysis={() => openScene("analysis", "ready")}
            onOpenCapture={() => openScene("capture", "setup")}
            onOpenProfile={() => openScene("profile", "ready")}
            onOpenReel={() => openScene("reels", "playing")}
            onOpenReference={() => openScene("reference", "ready")}
            reference={reference}
            viewerEnabled
            width={width}
          />
        </ScreenContainer>
        {previewDock("index")}
      </View>
    );
  }

  if (screen === "explore") {
    return (
      <View style={styles.tabScene}>
        <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
          <TopBar title="탐색" />
          <ScrollView contentContainerStyle={[styles.referencePage, { width }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.referenceTitle}>익명 레퍼런스 모션</Text>
            <Text style={styles.referenceCopy}>{reference.shortLabel} · CMU optical mocap</Text>
            <PoseMotionViewer
              boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다."
              hand="right"
              motion={reference.motion}
              sourcePhaseFrames={reference.sourcePhaseFrames}
              title={reference.shortLabel}
            />
            <LiquidPressable
              accessibilityLabel="참조 모션 열기"
              accessibilityRole="button"
              magnetic
              onPress={() => openScene("reference", "ready")}
              rippleColor={tokens.foreground}
              style={styles.referenceButtonHit}
              surfaceStyle={styles.referenceButton}
            >
              <Text style={styles.referenceButtonText}>참조 모션 열기</Text>
            </LiquidPressable>
          </ScrollView>
        </ScreenContainer>
        {previewDock("explore")}
      </View>
    );
  }

  if (screen === "profile") {
    const signedIn = state !== "signed-out";
    const records = fixtures.summaries.filter((summary) => !hiddenProfileIds.includes(summary.id));
    const glyphs = signedIn ? Object.fromEntries(records.map((summary) => [summary.id, fixtures.record])) : {};
    return (
      <View style={styles.tabScene}>
        <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
          <TopBar left={previewBack} title={signedIn ? "내 슛폼" : "프로필"} />
          <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
            <ProfileHero onViewChange={setHeroView} record={signedIn ? fixtures.record : undefined} state={signedIn ? "ready" : "signed-out"} view={heroView} width={width} />
            <ProfileStats locked={!signedIn} stats={[{ value: records.length, label: "대표 슛폼" }, { value: 0, label: "기존 분석" }]} />
            <Text style={styles.goalLine}>목표 · 일관성</Text>
            {signedIn ? (
              <View style={styles.section}>
                <MotionGrid
                  canOpen
                  deletingProfileId={null}
                  error={null}
                  glyphs={glyphs}
                  loading={false}
                  onDelete={(profileId) => setHiddenProfileIds((current) => [...current, profileId])}
                  onOpen={() => openScene("analysis", "ready")}
                  records={records}
                  width={width}
                />
              </View>
            ) : null}
          </ScrollView>
        </ScreenContainer>
        {previewDock("profile")}
      </View>
    );
  }

  if (screen === "analysis") {
    const profile = state === "recapture" ? fixtures.recaptureProfile : fixtures.profile;
    return (
      <SafeAreaView style={styles.safeArea}>
        <TopBar left={previewBack} title="대표 슛폼" />
        <ScrollView contentContainerStyle={styles.analysisPage}>
          <AnalysisSummaryLine profile={profile} />
          <ShotInspectionViewer
            confidence={fixtures.record.confidence}
            experimentalEnabled
            highlightJoint={primaryFinding(profile).joint}
            profile={profile}
            profileId={fixtures.summaries[0].id}
            shootingHand="right"
          />
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
          onClose={goBack}
          onOpenAnalysis={() => openScene("analysis", "ready")}
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
      selectMode: () => replaceScene("capture", "setup"),
      returnToModeSelect: () => replaceScene("capture", "setup"),
      setShootingHand: () => replaceScene("capture", "setup"),
      startCollection: () => replaceScene("capture", "collecting"),
      acquireSlot: () => replaceScene("capture", "review"),
      retakeSlot: () => replaceScene("capture", "recapture"),
      cancelSession: () => replaceScene("capture", "setup"),
      retrySession: () => replaceScene("capture", "collecting"),
      save: () => openScene("profile", "ready"),
    };
    return (
      <CaptureSessionView
        completionActionLabel="저장된 대표 슛폼 열기"
        controller={controller}
        onClose={goBack}
        onComplete={() => openScene("profile", "ready")}
      />
    );
  }

  if (screen === "reference") {
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar left={previewBack} title="참조 모션" />
        <ScrollView contentContainerStyle={[styles.referencePage, { width }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.referenceTitle}>{reference.styleTitle}</Text>
          <Text style={styles.referenceCopy}>{reference.sourceAttribution}</Text>
          <PoseMotionViewer
            boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다."
            hand="right"
            motion={reference.motion}
            sourcePhaseFrames={reference.sourcePhaseFrames}
            title={reference.shortLabel}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  tabScene: { backgroundColor: tokens.background, flex: 1 },
  page: { alignSelf: "center", paddingBottom: 32 },
  goalLine: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 8 },
  section: { marginTop: 14 },
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  analysisPage: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
  reels: { backgroundColor: tokens.stage, flex: 1 },
  iconButton: { height: 44, minHeight: 44, minWidth: 44, width: 44 },
  iconButtonSurface: { alignItems: "center", borderRadius: 22, justifyContent: "center" },
  referencePage: { alignSelf: "center", paddingBottom: 40, paddingHorizontal: 14, paddingTop: 16 },
  referenceTitle: { ...typography.title, color: tokens.foreground },
  referenceCopy: { ...typography.callout, color: tokens.mutedForeground, marginBottom: 16, marginTop: 6 },
  referenceButtonHit: { marginTop: 16, minHeight: 48 },
  referenceButton: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 14, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  referenceButtonText: { ...typography.headline, color: tokens.foreground },
});
