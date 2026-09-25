import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FilmSpaceViewer } from "@/components/shooting-profile/film-space-viewer";
import { PhaseSpaceViewer } from "@/components/shooting-profile/phase-space-viewer";
import { SequenceViewer } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { loadLocalFilmAssociation } from "@/lib/film-space/local-association";
import type { LocalFilmAssociationV1 } from "@/lib/film-space/types";
import {
  resolveShotInspectionModes,
  type ShotInspectionMode,
} from "@/lib/shooting-profile/shot-inspection";
import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

type ShotInspectionViewerProps = Readonly<{
  profileId: string;
  profile: RepresentativePose4DV2;
  confidence?: number;
  shootingHand: ShootingHandV2;
  highlightJoint?: PersistedJointNameV2;
  experimentalEnabled: boolean;
}>;

const MODE_LABELS: Readonly<Record<ShotInspectionMode, string>> = {
  motion: "Motion",
  phase: "Phase",
  film: "Film",
};

export function ShotInspectionViewer({
  profileId,
  profile,
  confidence,
  shootingHand,
  highlightJoint,
  experimentalEnabled,
}: ShotInspectionViewerProps) {
  const [association, setAssociation] = useState<LocalFilmAssociationV1 | null>(null);
  const [mode, setMode] = useState<ShotInspectionMode>("motion");

  useEffect(() => {
    let active = true;
    if (!experimentalEnabled) {
      setAssociation(null);
      setMode("motion");
      return () => { active = false; };
    }
    void loadLocalFilmAssociation(profileId)
      .then((result) => {
        if (active) setAssociation(result);
      })
      .catch(() => {
        if (active) setAssociation(null);
      });
    return () => { active = false; };
  }, [experimentalEnabled, profileId]);

  const model = useMemo(() => resolveShotInspectionModes({
    experimentalEnabled,
    hasLocalFilm: (association?.clips.length ?? 0) > 0,
  }), [association, experimentalEnabled]);

  useEffect(() => {
    if (!model.enabledModes.includes(mode)) setMode(model.defaultMode);
  }, [mode, model]);

  if (!experimentalEnabled) {
    return (
      <SequenceViewer
        confidence={confidence}
        highlightJoint={highlightJoint}
        profile={profile}
        shootingHand={shootingHand}
      />
    );
  }

  const localClip = association?.clips[0] ?? null;

  return (
    <View style={styles.container}>
      <View accessibilityRole="tablist" style={styles.modeRow}>
        {model.enabledModes.map((candidate) => {
          const selected = candidate === mode;
          return (
            <Pressable
              key={candidate}
              accessibilityLabel={`${MODE_LABELS[candidate]} 보기`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setMode(candidate)}
              style={({ pressed }) => [
                styles.modeButton,
                selected && styles.modeButtonSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modeText, selected && styles.modeTextSelected]}>
                {MODE_LABELS[candidate]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === "motion" ? (
        <SequenceViewer
          confidence={confidence}
          highlightJoint={highlightJoint}
          profile={profile}
          shootingHand={shootingHand}
        />
      ) : null}
      {mode === "phase" ? (
        <PhaseSpaceViewer
          highlightJoint={highlightJoint}
          profile={profile}
          shootingHand={shootingHand}
        />
      ) : null}
      {mode === "film" && localClip ? <FilmSpaceViewer clip={localClip} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: tokens.background },
  modeRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  modeButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, minWidth: 72, paddingHorizontal: 12 },
  modeButtonSelected: { backgroundColor: tokens.foreground, borderColor: tokens.foreground },
  modeText: { color: tokens.foreground, fontSize: 13, fontWeight: "600" },
  modeTextSelected: { color: tokens.background },
  pressed: { opacity: 0.65 },
});