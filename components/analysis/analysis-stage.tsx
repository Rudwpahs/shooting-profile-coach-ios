import { useCallback, useMemo } from "react";
import { StyleSheet, View, type AppStateStatus } from "react-native";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { ReelsFeed } from "@/components/reels/reels-feed";
import { ShotInspectionViewer } from "@/components/shooting-profile/shot-inspection-viewer";
import { tokens } from "@/constants/tokens";
import { profileReelId, type ProfileReel } from "@/lib/reels/reel-model";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { confidenceBandCopy, primaryFinding } from "@/lib/skeleton/analysis-evidence";

export type AnalysisStageProps = {
  profileId: string;
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence?: number;
  /** The name the form was shown under, never a person's name. */
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
 * The analysis surface: the same reel every player uses, for one profile.
 * The stage is the motion; the caption carries the name, the band and the
 * one finding; 동작 정보 holds the unchanged inspection (Phase Space, Film),
 * the numbers and the per-joint evidence. Nothing about the record changes.
 */
export function AnalysisStage({
  profileId, profile, shootingHand, confidence, title, experimentalEnabled, focused, appState, reducedMotion,
  width, height, insets, onBack,
}: AnalysisStageProps) {
  const finding = primaryFinding(profile);
  const band = confidenceBandCopy(profile);
  const items = useMemo<ProfileReel[]>(() => [{
    kind: "profile",
    id: profileReelId(profileId),
    profileId,
    profile,
    shootingHand,
    confidence: confidence ?? 0,
    createdAt: new Date(0),
    title,
    line: `${band.title} · ${finding.line}`,
  }], [band.title, confidence, finding.line, profile, profileId, shootingHand, title]);

  const renderInfo = useCallback(() => ({
    body: (
      <View style={styles.layers} testID="analysis-layers">
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
      </View>
    ),
  }), [confidence, experimentalEnabled, finding.joint, profile, profileId, shootingHand]);

  return (
    <View style={[styles.screen, { width, height }]} testID="analysis-stage">
      <ReelsFeed
        appState={appState}
        focused={focused}
        height={height}
        initialIndex={0}
        insets={insets}
        items={items}
        onClose={onBack}
        onOpenAnalysis={null}
        reducedMotion={reducedMotion}
        renderInfo={renderInfo}
        width={width}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.stage },
  layers: { gap: 4, marginHorizontal: -24 },
});
