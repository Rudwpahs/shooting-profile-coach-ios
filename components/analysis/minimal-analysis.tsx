import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, type AppStateStatus } from "react-native";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { GlassSurface } from "@/components/glass/glass-surface";
import { ReelMotionPlayer } from "@/components/reels/reel-motion-player";
import { REEL_PROGRESS_HEIGHT, ReelProgress } from "@/components/reels/reel-progress";
import { ShotInspectionViewer } from "@/components/shooting-profile/shot-inspection-viewer";
import { LiquidPressable } from "@/components/ui/liquid";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { SHOT_PHASES } from "@/lib/pose-motion";
import type { ReelPlaybackMode } from "@/lib/reels/reel-feed-state";
import { profileReelId, type ProfileReel } from "@/lib/reels/reel-model";
import { reelProgress, reelShouldPlay, reelStartFrame } from "@/lib/reels/reel-playback";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { anchorPositions, primaryFinding } from "@/lib/skeleton/analysis-evidence";

const CONTROL = 44;
/** Clearance under the back control. */
const STAGE_TOP = CONTROL + 8;
/** The caption, the phase markers and the progress line live in this band; the figure's feet never meet them. */
const STAGE_BOTTOM = 168;
const MARKER = 48;

export type MinimalAnalysisProps = {
  profileId: string;
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence?: number;
  /** The name Explore gave this form, never a person's name. */
  title: string;
  experimentalEnabled: boolean;
  focused: boolean;
  appState: AppStateStatus;
  reducedMotion: boolean | null;
  width: number;
  height: number;
  insets: { top: number; bottom: number };
  onBack: () => void;
};

/**
 * The minimal analysis surface Explore opens: one full-height motion stage,
 * the form's name with its one finding, the thin phase line with five phase
 * markers, and a single 자세히 sheet that holds the unchanged three-layer
 * inspection (Motion / Phase / Film, the numbers, the per-joint evidence).
 * Stage tap pauses or resumes; a marker seeks to that phase and holds it;
 * playback is suspended while the sheet is open, the screen is unfocused
 * or the app is in the background, and never autoplays under Reduce Motion.
 */
export function MinimalAnalysis({
  profileId, profile, shootingHand, confidence, title, experimentalEnabled, focused, appState, reducedMotion,
  width, height, insets, onBack,
}: MinimalAnalysisProps) {
  const item = useMemo<ProfileReel>(() => ({
    kind: "profile",
    id: profileReelId(profileId),
    profileId,
    profile,
    shootingHand,
    confidence: confidence ?? 0,
    createdAt: new Date(0),
    title,
    line: primaryFinding(profile).line,
  }), [confidence, profile, profileId, shootingHand, title]);
  const finding = primaryFinding(profile);
  const anchors = useMemo(() => anchorPositions(profile), [profile]);
  const releaseFrame = reelStartFrame(item);

  const [playback, setPlayback] = useState<ReelPlaybackMode>("auto");
  const [sheet, setSheet] = useState(false);
  const [seek, setSeek] = useState<{ frame: number; generation: number; phase: number } | null>(null);
  const progress = useRef(new Animated.Value(reelProgress(releaseFrame))).current;

  const playing = !sheet && reelShouldPlay({ active: true, focused, appState, playback, reducedMotion });
  const toggle = useCallback(() => setPlayback(playing ? "paused" : "explicit"), [playing]);
  const seekTo = useCallback((frame: number, phase: number) => {
    setSeek((current) => ({ frame, phase, generation: (current?.generation ?? 0) + 1 }));
    setPlayback("paused");
    progress.setValue(reelProgress(frame));
  }, [progress]);

  const stageTop = insets.top + STAGE_TOP;
  const stageHeight = Math.max(1, height - stageTop - (insets.bottom + STAGE_BOTTOM));
  const progressBottom = insets.bottom + 8;
  const bandBottom = progressBottom + REEL_PROGRESS_HEIGHT + 6;
  const phaseLabel = seek && !playing ? SHOT_PHASES[seek.phase] : null;

  return (
    <View style={[styles.screen, { width, height }]} testID="minimal-analysis">
      <View style={[styles.stage, { top: stageTop, height: stageHeight, width }]} testID="minimal-analysis-stage">
        <ReelMotionPlayer
          key={seek?.generation ?? 0}
          height={stageHeight}
          item={item}
          playing={playing}
          progress={progress}
          startFrame={seek?.frame ?? releaseFrame}
          view="oblique"
          width={width}
        />
      </View>

      <Pressable
        accessibilityHint="두 번 탭하면 일시정지 또는 재생"
        accessibilityLabel={playing ? "동작 화면 일시정지" : "동작 화면 재생"}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        onPress={toggle}
        style={({ pressed }) => [styles.tap, { top: stageTop, height: stageHeight, width }, pressed && styles.pressed]}
        testID="minimal-analysis-tap"
      />

      {!playing && !sheet ? (
        <View style={[styles.indicator, { left: Math.round((width - 60) / 2), top: Math.round(stageTop + (stageHeight - 60) / 2) }]} testID="reel-pause-indicator">
          <MaterialCommunityIcons name="play" size={30} color={tokens.stageForeground} />
        </View>
      ) : null}

      <GlassSurface variant="bar" style={[styles.topRow, { top: insets.top + 6, width }]}>
        <LiquidPressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
          disabled={false}
          magnetic
          onPress={onBack}
          rippleColor={tokens.stageForeground}
          style={styles.control}
          surfaceStyle={styles.controlSurface}
          testID="minimal-analysis-back"
        >
          <MaterialCommunityIcons name="arrow-left" size={26} color={tokens.stageForeground} />
        </LiquidPressable>
      </GlassSurface>

      <View style={[styles.band, { bottom: bandBottom, width }]}>
        <View style={styles.captionRow}>
          <View style={styles.caption}>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            <Text numberOfLines={2} style={styles.line} testID="minimal-analysis-line">{phaseLabel ?? finding.line}</Text>
          </View>
          <LiquidPressable
            accessibilityLabel="자세히"
            accessibilityRole="button"
            accessibilityState={{ disabled: false, expanded: sheet }}
            aria-expanded={sheet}
            disabled={false}
            magnetic
            onPress={() => setSheet(true)}
            rippleColor={tokens.stageForeground}
            style={styles.rail}
            surfaceStyle={styles.railSurface}
            testID="minimal-analysis-details"
          >
            <MaterialCommunityIcons name="chart-timeline-variant" size={26} color={tokens.stageForeground} />
            <Text style={styles.railText}>자세히</Text>
          </LiquidPressable>
        </View>
        <View accessibilityRole="toolbar" style={styles.markers}>
          {anchors.map((anchor, index) => {
            const selected = seek !== null && !playing && seek.phase === index;
            return (
              <Pressable
                key={anchor.percent}
                accessibilityLabel={`${SHOT_PHASES[index]} 단계 보기`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                aria-pressed={selected}
                onPress={() => seekTo(anchor.percent, index)}
                style={({ pressed }) => [styles.marker, pressed && styles.pressed]}
              >
                <View style={[styles.dot, selected && styles.dotSelected]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <ReelProgress bottom={progressBottom} progress={progress} width={width} />

      {sheet ? (
        <Modal animationType={reducedMotion === false ? "slide" : "none"} onRequestClose={() => setSheet(false)} transparent visible>
          <View style={styles.modal}>
            <Pressable accessibilityLabel="시트 바깥 닫기" accessibilityRole="button" accessibilityState={{ disabled: false }} onPress={() => setSheet(false)} style={styles.backdrop} />
            <View accessibilityViewIsModal style={[styles.sheet, { maxHeight: Math.round(height * 0.86) }]} testID="minimal-analysis-sheet">
              <View style={styles.sheetHeading}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
                <Pressable
                  accessibilityLabel="자세히 닫기"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: false }}
                  onPress={() => setSheet(false)}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="close" size={24} color={tokens.foreground} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent}>
                <AnalysisSummaryLine profile={profile} />
                <ShotInspectionViewer
                  confidence={confidence}
                  experimentalEnabled={experimentalEnabled}
                  highlightJoint={finding.joint}
                  profile={profile}
                  profileId={profileId}
                  shootingHand={shootingHand}
                />
                <AnalysisDetails confidence={confidence} profile={profile} shootingHand={shootingHand} />
                <AnalysisEvidence profile={profile} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage },
  stage: { backgroundColor: tokens.stage, left: 0, overflow: "hidden", position: "absolute" },
  tap: { left: 0, position: "absolute" },
  pressed: { opacity: 0.78 },
  indicator: {
    alignItems: "center",
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.border,
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: "center",
    opacity: 0.94,
    paddingLeft: 4,
    pointerEvents: "none",
    position: "absolute",
    width: 60,
  },
  topRow: { alignItems: "center", borderWidth: 0, flexDirection: "row", left: 0, paddingHorizontal: 6, pointerEvents: "box-none", position: "absolute" },
  control: { height: CONTROL, minHeight: CONTROL, minWidth: CONTROL, width: CONTROL },
  controlSurface: { alignItems: "center", borderRadius: CONTROL / 2, justifyContent: "center" },
  band: { left: 0, pointerEvents: "box-none", position: "absolute" },
  captionRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14 },
  caption: { flex: 1, gap: 2, paddingRight: 12, pointerEvents: "none" },
  title: { ...typography.headline, color: tokens.stageForeground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  rail: { minHeight: CONTROL, minWidth: CONTROL, paddingHorizontal: 4 },
  railSurface: { alignItems: "center", borderRadius: 14, gap: 2, justifyContent: "center" },
  railText: { ...typography.label, color: tokens.stageForeground },
  markers: { flexDirection: "row", paddingHorizontal: 10, paddingTop: 4 },
  marker: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: MARKER },
  dot: { backgroundColor: tokens.border, borderRadius: 4, height: 8, width: 8 },
  dotSelected: { backgroundColor: tokens.primary, height: 12, width: 12, borderRadius: 6 },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: tokens.background, opacity: 0.65 },
  sheet: { backgroundColor: tokens.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 },
  sheetHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8, paddingTop: 8 },
  sheetTitle: { ...typography.title, color: tokens.foreground },
  closeButton: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  sheetContent: { paddingBottom: 24 },
});
