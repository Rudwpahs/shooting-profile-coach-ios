import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FilmSpaceViewer } from "@/components/shooting-profile/film-space-viewer";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import type { FilmReel } from "@/lib/reels/reel-model";

/** The clip's place in the capture plan, never a file name. */
export function filmClipLabel(clip: LocalFilmClipRefV1): string {
  return `${clip.view === "front" ? "정면" : "측면"} ${clip.takeIndex + 1}`;
}

type ReelFilmMediaProps = {
  item: FilmReel;
  width: number;
  height: number;
  /** Only the active reel decodes footage; neighbours show a quiet placeholder. */
  active: boolean;
};

/**
 * The media of a film reel: the user's own footage through Film Space, one
 * clip at a time, with the other clips one tap away. There is no skeleton
 * and no playback state here; what plays is the local clip's time slices.
 * A shot whose files are not on this device says so instead of breaking.
 */
export function ReelFilmMedia({ item, width, height, active }: ReelFilmMediaProps) {
  const [slotId, setSlotId] = useState<string | null>(item.clips[0]?.slotId ?? null);
  useEffect(() => {
    setSlotId(item.clips[0]?.slotId ?? null);
  }, [item.id, item.clips]);
  const clip = item.clips.find((candidate) => candidate.slotId === slotId) ?? item.clips[0] ?? null;

  if (!clip) {
    return (
      <View style={[styles.box, { width, height }]} testID="reel-film-empty">
        <MaterialCommunityIcons name="filmstrip-off" size={34} color={tokens.mutedForeground} />
        <Text style={styles.title}>이 기기에 영상이 없습니다</Text>
        <Text style={styles.copy}>내 영상은 보관한 기기의 브라우저에서만 열립니다. 어디에도 업로드되지 않습니다.</Text>
      </View>
    );
  }

  if (!active) {
    return (
      <View style={[styles.box, { width, height }]} testID="reel-film-idle">
        <MaterialCommunityIcons name="filmstrip" size={34} color={tokens.mutedForeground} />
        <Text style={styles.copy}>{item.clips.length}개 클립 · 내 영상</Text>
      </View>
    );
  }

  return (
    <View style={[styles.active, { width, height }]} testID="reel-film-active">
      {item.clips.length > 1 ? (
        <View accessibilityRole="tablist" style={styles.clipRow}>
          {item.clips.map((candidate) => {
            const selected = candidate.slotId === clip.slotId;
            return (
              <Pressable
                key={candidate.slotId}
                accessibilityLabel={`${filmClipLabel(candidate)} 로컬 영상 보기`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => setSlotId(candidate.slotId)}
                style={({ pressed }) => [styles.clipButton, selected && styles.clipButtonSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.clipText, selected && styles.clipTextSelected]}>{filmClipLabel(candidate)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.viewer}>
        <FilmSpaceViewer clip={clip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", backgroundColor: tokens.stage, gap: 8, justifyContent: "center", padding: 24 },
  title: { ...typography.headline, color: tokens.stageForeground, textAlign: "center" },
  copy: { ...typography.callout, color: tokens.mutedForeground, maxWidth: 320, textAlign: "center" },
  active: { backgroundColor: tokens.stage, overflow: "hidden" },
  clipRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingTop: 6 },
  clipButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 44, minWidth: 64, paddingHorizontal: 12 },
  clipButtonSelected: { backgroundColor: tokens.elevatedSurface, borderColor: tokens.stageForeground },
  clipText: { ...typography.label, color: tokens.mutedForeground },
  clipTextSelected: { color: tokens.stageForeground },
  viewer: { flex: 1 },
  pressed: { opacity: 0.7 },
});
