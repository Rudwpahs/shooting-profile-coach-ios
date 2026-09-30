import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { HomeFeed } from "@/components/home/home-feed";
import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ReelsFeed } from "@/components/reels/reels-feed";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { ShotInspectionViewer } from "@/components/shooting-profile/shot-inspection-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import type { UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";
import {
  backUiPreview,
  createUiPreviewNavigation,
  currentUiPreviewRoute,
  openUiPreview,
  type UiPreviewRoute,
  type UiPreviewScreen,
} from "@/lib/dev/ui-preview-navigation";
import { profileReelId } from "@/lib/reels/reel-model";
import { primaryFinding } from "@/lib/skeleton/analysis-evidence";
import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;

export type UiPreviewShellProps = {
  initialScreen?: UiPreviewScreen;
  initialState?: string;
  initialItemId?: string;
};

function usePreviewFixtures(): UiDemoFixtures | null {
  return useMemo(() => {
    if (
      !((__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1") ||
        process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1")
    ) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("@/lib/dev/ui-demo-fixtures") as typeof import("@/lib/dev/ui-demo-fixtures");
    return module.buildUiDemoFixtures();
  }, []);
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="이전 화면" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <Text style={styles.backText}>‹</Text>
    </Pressable>
  );
}

/**
 * Install-free signed-in simulator used only by the explicit preview build.
 * It keeps navigation in local state, so GitHub Pages never needs to resolve
 * an app route after the initial page load.
 */
export function UiPreviewShell({ initialScreen = "home", initialState = "ready", initialItemId }: UiPreviewShellProps) {
  const fixtures = usePreviewFixtures();
  const [navigation, setNavigation] = useState(() => createUiPreviewNavigation({ screen: initialScreen, state: initialState, itemId: initialItemId }));
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  const [deletedProfileIds, setDeletedProfileIds] = useState<ReadonlySet<string>>(() => new Set());
  const [captureState, setCaptureState] = useState<CaptureSessionState>(() => createCaptureSession());
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!fixtures) {
    return <View style={styles.unavailable}><Text style={styles.unavailableText}>Preview unavailable</Text></View>;
  }

  const route = currentUiPreviewRoute(navigation);
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const open = (next: UiPreviewRoute) => setNavigation((current) => openUiPreview(current, next));
  const back = () => setNavigation((current) => backUiPreview(current));
  const openCapture = () => {
    setCaptureState(createCaptureSession());
    open({ screen: "capture", state: "mode_select" });
  };

  if (route.screen === "home") {
    const latest = { status: "ready" as const, summary: fixtures.summaries[0], record: fixtures.record };
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar wordmark="Hoop Hub" />
        <HomeFeed
          focusTitle="같은 리듬을 먼저 만드세요"
          goalLabel="일관성"
          latest={latest}
          onOpenAnalysis={(profileId) => open({ screen: "analysis", state: "ready", itemId: profileId })}
          onOpenCapture={openCapture}
          onOpenProfile={() => open({ screen: "profile", state: "ready" })}
          onOpenReel={(reelId) => open({ screen: "reels", state: "playing", itemId: reelId })}
          onOpenReference={() => open({ screen: "reference", state: "ready", itemId: reference.id })}
          reference={reference}
          viewerEnabled
          width={width}
        />
      </ScreenContainer>
    );
  }

  if (route.screen === "profile") {
    const records = fixtures.summaries.filter((summary) => !deletedProfileIds.has(summary.id));
    const glyphs = Object.fromEntries(records.map((summary) => [summary.id, fixtures.record]));
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar left={<BackButton onPress={back} />} title="내 슛폼" />
        <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
          <ProfileHero onViewChange={setHeroView} record={fixtures.record} state="ready" view={heroView} width={width} />
          <ProfileStats locked={false} stats={[{ value: records.length, label: "대표 슛폼" }, { value: 0, label: "기존 분석" }]} />
          <Text style={styles.goalLine}>목표 · 일관성</Text>
          <View style={styles.section}>
            <MotionGrid
              canOpen
              deletingProfileId={null}
              error={null}
              glyphs={glyphs}
              loading={false}
              onDelete={(profileId) => setDeletedProfileIds((current) => new Set([...current, profileId]))}
              onOpen={(profileId) => open({ screen: "analysis", state: "ready", itemId: profileId })}
              records={records}
              width={width}
            />
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (route.screen === "analysis") {
    const profile = route.state === "recapture" ? fixtures.recaptureProfile : fixtures.profile;
    return (
      <SafeAreaView style={styles.safeArea}>
        <TopBar left={<BackButton onPress={back} />} title="대표 슛폼" />
        <ScrollView contentContainerStyle={styles.analysisPage}>
          <AnalysisSummaryLine profile={profile} />
          <ShotInspectionViewer
            confidence={fixtures.record.confidence}
            experimentalEnabled
            highlightJoint={primaryFinding(profile).joint}
            profile={profile}
            profileId={route.itemId ?? fixtures.summaries[0].id}
            shootingHand="right"
          />
          <AnalysisDetails confidence={fixtures.record.confidence} profile={profile} shootingHand="right" />
          <AnalysisEvidence profile={profile} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (route.screen === "reels") {
    const requestedIndex = route.itemId ? fixtures.reels.findIndex((item) => item.id === route.itemId) : 0;
    return (
      <View style={styles.reels}>
        <ReelsFeed
          appState="active"
          focused
          height={viewport.height}
          initialIndex={requestedIndex >= 0 ? requestedIndex : 0}
          initialPlayback="auto"
          insets={{ top: insets.top, bottom: insets.bottom }}
          items={fixtures.reels}
          onClose={back}
          onOpenAnalysis={(profileId) => open({ screen: "analysis", state: "ready", itemId: profileId })}
          reducedMotion={false}
          width={viewport.width}
        />
      </View>
    );
  }

  if (route.screen === "reference") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <TopBar left={<BackButton onPress={back} />} title="참조 모션" />
        <ScrollView contentContainerStyle={styles.referencePage} showsVerticalScrollIndicator={false}>
          <Text style={styles.referenceEyebrow}>APPROVED OPTICAL 3D REFERENCE</Text>
          <Text style={styles.referenceTitle}>{reference.styleTitle}</Text>
          <Text style={styles.referenceCopy}>{reference.sourceAttribution}</Text>
          <PoseMotionViewer
            boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다."
            hand="right"
            motion={reference.motion}
            sourcePhaseFrames={reference.sourcePhaseFrames}
            title={reference.shortLabel}
          />
          <Pressable
            accessibilityLabel="참조 릴 열기"
            accessibilityRole="button"
            onPress={() => open({ screen: "reels", state: "playing", itemId: fixtures.reels.find((item) => item.kind === "reference")?.id })}
            style={({ pressed }) => [styles.referenceButton, pressed && styles.pressed]}
          >
            <Text style={styles.referenceButtonText}>Reels에서 보기</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  const updateCapture = (action: Parameters<typeof captureSessionReducer>[1]) => setCaptureState((current) => captureSessionReducer(current, action));
  const controller: CaptureController = {
    state: captureState,
    canSave: captureState.status === "result_review",
    selectMode: (mode) => updateCapture({ type: "SELECT_MODE", mode }),
    returnToModeSelect: () => updateCapture({ type: "RETURN_TO_MODE_SELECT" }),
    setShootingHand: (shootingHand) => updateCapture({ type: "SET_SHOOTING_HAND", shootingHand }),
    startCollection: () => updateCapture({ type: "START_COLLECTION" }),
    acquireSlot: () => setCaptureState(fixtures.capture.review),
    retakeSlot: (slotId) => updateCapture({ type: "RETAKE_SLOT", slotId }),
    cancelSession: () => updateCapture({ type: "CANCEL_SESSION" }),
    retrySession: () => updateCapture({ type: "RETRY_SESSION" }),
    save: () => {
      const saving = captureSessionReducer(captureState, { type: "SAVE_STARTED" });
      setCaptureState(captureSessionReducer(saving, {
        type: "SAVE_SUCCEEDED",
        sessionGeneration: saving.sessionGeneration,
        profileId: fixtures.summaries[0].id,
      }));
    },
  };

  return (
    <CaptureSessionView
      completionActionLabel="저장된 대표 슛폼 열기"
      controller={controller}
      onClose={back}
      onComplete={(profileId) => open({ screen: "analysis", state: "ready", itemId: profileId })}
    />
  );
}

export function demoProfileReelId(fixtures: UiDemoFixtures): string {
  return profileReelId(fixtures.summaries[0].id);
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  goalLine: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 8 },
  section: { marginTop: 14 },
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  analysisPage: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
  reels: { backgroundColor: tokens.stage, flex: 1 },
  back: { alignItems: "center", height: 44, justifyContent: "center", minWidth: 44 },
  backText: { color: tokens.foreground, fontSize: 34, lineHeight: 36 },
  pressed: { opacity: 0.7 },
  unavailable: { alignItems: "center", backgroundColor: tokens.background, flex: 1, justifyContent: "center" },
  unavailableText: { ...typography.callout, color: tokens.mutedForeground },
  referencePage: { alignSelf: "center", maxWidth: 680, padding: 20, paddingBottom: 40, width: "100%" },
  referenceEyebrow: { ...typography.label, color: tokens.primary },
  referenceTitle: { ...typography.title, color: tokens.foreground, marginTop: 8 },
  referenceCopy: { ...typography.callout, color: tokens.mutedForeground, marginBottom: 18, marginTop: 8 },
  referenceButton: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, justifyContent: "center", marginTop: 16, minHeight: 48, paddingHorizontal: 16 },
  referenceButtonText: { ...typography.headline, color: tokens.primaryForeground },
});
