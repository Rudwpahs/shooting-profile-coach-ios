import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { poseMotionGlyph, type GlyphView } from "@/lib/skeleton/pose-motion-glyph";

const VIEWS: readonly { id: GlyphView; label: string }[] = [
  { id: "front", label: "정면" },
  { id: "oblique", label: "사선" },
  { id: "side", label: "측면" },
];
const GAP = 2;
const MAX_WIDTH = 680;

/**
 * 탐색: a grid of anonymous skeleton motion. Today the only lawful public
 * content is the CMU optical-mocap reference, shown once per shot phase; other
 * users' skeletons appear here only after a public opt-in contract exists.
 * Famous-player footage is never foundational content.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<GlyphView>("oblique");
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const contentWidth = Math.min(width, MAX_WIDTH);
  const tile = Math.floor((contentWidth - GAP * 2) / 3);
  const big = tile * 2 + GAP;

  const glyphs = useMemo(
    () => reference.motion.frames.map((frame) => ({
      label: frame.label,
      data: poseMotionGlyph(reference.motion, { view, progress: frame.progress }),
    })),
    [reference.motion, view],
  );
  const open = () => router.push("/library" as never);
  const tileFor = (index: number, size: number) => {
    const glyph = glyphs[index];
    if (!glyph) return null;
    return (
      <Pressable
        accessibilityLabel={`${reference.shortLabel} ${glyph.label} 위상 열기`}
        accessibilityRole="button"
        onPress={open}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <SkeletonGlyph accessible={false} accessibilityLabel={glyph.label} data={glyph.data} height={size} width={size} />
      </Pressable>
    );
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.header}>
        <Text style={styles.title}>탐색</Text>
        <View style={styles.chips}>
          {VIEWS.map((candidate) => {
            const selected = candidate.id === view;
            return (
              <Pressable
                key={candidate.id}
                accessibilityLabel={`${candidate.label} 시점`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setView(candidate.id)}
                style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{candidate.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.page, { width: contentWidth }]} showsVerticalScrollIndicator={false}>
        <View style={styles.row}>
          {tileFor(3, big)}
          <View style={styles.column}>
            {tileFor(0, tile)}
            {tileFor(1, tile)}
          </View>
        </View>
        <View style={styles.row}>
          {tileFor(2, tile)}
          {tileFor(4, tile)}
        </View>
        <Text style={styles.caption}>{reference.shortLabel} · CMU optical mocap</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignSelf: "center", gap: 10, maxWidth: MAX_WIDTH, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, width: "100%" },
  title: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 26, letterSpacing: -0.3 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 999, justifyContent: "center", minHeight: 34, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: tokens.foreground },
  chipText: { color: tokens.foreground, fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: tokens.background },
  page: { alignSelf: "center", gap: GAP, paddingBottom: 32 },
  row: { flexDirection: "row", gap: GAP },
  column: { gap: GAP },
  caption: { color: tokens.mutedForeground, fontSize: 11, paddingHorizontal: 14, paddingTop: 10 },
  pressed: { opacity: 0.7 },
});
