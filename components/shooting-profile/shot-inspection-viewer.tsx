import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FilmSpaceViewer } from "@/components/shooting-profile/film-space-viewer";
import { PhaseSpaceViewer } from "@/components/shooting-profile/phase-space-viewer";
import { tokens } from "@/constants/tokens";
import {
  evictLocalFilmClipFromAssociation,
  loadLocalFilmAssociation,
} from "@/lib/film-space/local-association";
import type {
  LocalFilmAssociationV1,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";
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
  phase: "Phase",
  film: "Film",
};

function localClipLabel(clip: LocalFilmClipRefV1): string {
  const view = clip.view === "front" ? "Front" : "Side";
  return `${view} ${clip.takeIndex + 1}`;
}

export function ShotInspectionViewer({
  profileId,
  profile,
  confidence,
  shootingHand,
  highlightJoint,
  experimentalEnabled,
}: ShotInspectionViewerProps) {
  const [association, setAssociation] = useState<LocalFilmAssociationV1 | null>(null);
  const [mode, setMode] = useState<ShotInspectionMode>("phase");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!experimentalEnabled) {
      setAssociation(null);
      setSelectedSlotId(null);
      setMode("phase");
      return () => { active = false; };
    }
    void loadLocalFilmAssociation(profileId)
      .then((result) => {
        if (!active) return;
        setAssociation(result);
        setSelectedSlotId(result?.clips[0]?.slotId ?? null);
      })
      .catch(() => {
        if (!active) return;
        setAssociation(null);
        setSelectedSlotId(null);
      });
    return () => { active = false; };
  }, [experimentalEnabled, profileId]);

  const clips = useMemo(() => association?.clips ?? [], [association]);
  // iPhone decodes through expo-video; the browser decodes its own local object URL. Android stays Motion/Phase.
  const filmSupported = Platform.OS === "ios" || Platform.OS === "web";
  const model = useMemo(() => resolveShotInspectionModes({
    experimentalEnabled,
    hasLocalFilm: filmSupported && clips.length > 0,
  }), [clips.length, experimentalEnabled, filmSupported]);

  useEffect(() => {
    if (!model.enabledModes.includes(mode)) setMode(model.defaultMode);
  }, [mode, model]);

  useEffect(() => {
    if (clips.length === 0) {
      if (selectedSlotId !== null) setSelectedSlotId(null);
      return;
    }
    if (!selectedSlotId || !clips.some((clip) => clip.slotId === selectedSlotId)) {
      setSelectedSlotId(clips[0].slotId);
    }
  }, [clips, selectedSlotId]);

  const handleFilmSourceUnavailable = useCallback(async (clip: LocalFilmClipRefV1) => {
    try {
      const next = await evictLocalFilmClipFromAssociation(profileId, clip.slotId);
      setAssociation(next);
      const nextSlotId = next?.clips[0]?.slotId ?? null;
      setSelectedSlotId(nextSlotId);
      if (!nextSlotId) setMode("phase");
    } catch {
      setAssociation(null);
      setSelectedSlotId(null);
      setMode("phase");
    }
  }, [profileId]);

  // Motion is the stage above this surface; with the experimental flag off there is nothing extra here.
  if (!experimentalEnabled) return null;

  const localClip = clips.find((clip) => clip.slotId === selectedSlotId) ?? clips[0] ?? null;

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

      {mode === "phase" ? (
        <PhaseSpaceViewer
          highlightJoint={highlightJoint}
          profile={profile}
          shootingHand={shootingHand}
        />
      ) : null}
      {mode === "film" && !localClip ? (
        <View style={styles.filmMissing}>
          <Text style={styles.filmMissingTitle}>연결된 로컬 원본 영상이 없습니다</Text>
          <Text style={styles.filmMissingCopy}>
            Film Space는 이 기기에서 촬영하거나 선택한 로컬 영상만 사용합니다. 촬영에서 로컬 영상을 연결하면 여기에 시간 슬라이스가 열립니다. Motion과 Phase는 계속 사용할 수 있습니다.
          </Text>
        </View>
      ) : null}
      {mode === "film" && localClip ? (
        <View>
          {clips.length > 1 ? (
            <View accessibilityRole="tablist" style={styles.clipRow}>
              {clips.map((clip) => {
                const selected = clip.slotId === localClip.slotId;
                return (
                  <Pressable
                    key={clip.slotId}
                    accessibilityLabel={`${localClipLabel(clip)} 로컬 영상 보기`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedSlotId(clip.slotId)}
                    style={({ pressed }) => [
                      styles.clipButton,
                      selected && styles.clipButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.clipText, selected && styles.clipTextSelected]}>
                      {localClipLabel(clip)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <FilmSpaceViewer
            clip={localClip}
            onSourceUnavailable={handleFilmSourceUnavailable}
          />
        </View>
      ) : null}
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
  clipRow: { flexDirection: "row", gap: 6, paddingBottom: 8, paddingHorizontal: 14 },
  clipButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, minWidth: 64, paddingHorizontal: 10 },
  clipButtonSelected: { backgroundColor: tokens.elevatedSurface },
  clipText: { color: tokens.mutedForeground, fontSize: 12, fontWeight: "600" },
  clipTextSelected: { color: tokens.foreground },
  filmMissing: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "center", minHeight: 220, padding: 24 },
  filmMissingTitle: { color: tokens.stageForeground, fontSize: 16, fontWeight: "700", textAlign: "center" },
  filmMissingCopy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 420, textAlign: "center" },
  pressed: { opacity: 0.65 },
});