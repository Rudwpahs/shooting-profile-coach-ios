import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { poseMotionGlyph, type GlyphView } from "@/lib/skeleton/pose-motion-glyph";

const VIEWS: readonly { id: GlyphView; label: string }[] = [
  { id: "front", label: "정면" },
  { id: "oblique", label: "사선" },
  { id: "side", label: "측면" },
];
const GAP = 2;
const MAX_WIDTH = 680;
const FALLBACK_WIDTH = 375;

/**
 * 탐색: a grid of anonymous skeleton motion. Today the only lawful public
 * content is the CMU optical-mocap reference, shown once per shot phase; other
 * users' skeletons appear here only after a public opt-in contract exists.
 * Famous-player footage is never foundational content.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [view, setView] = useState<GlyphView>("oblique");
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  // The window can report 0 before layout (static web render); measure the
  // screen itself and fall back to a phone width so tiles never go negative.
  const contentWidth = Math.min(measuredWidth || windowWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const tile = Math.max(1, Math.floor((contentWidth - GAP * 2) / 3));
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
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar title="탐색" />
      <View style={styles.header}>
        <View style={styles.chips}>
          {VIEWS.map((candidate) => {
            const selected = candidate.id === view;
            return (
              <Pressable
                key={candidate.id}
                accessibilityLabel={`${candidate.label} 시점`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                aria-selected={selected}
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
  header: { alignSelf: "center", maxWidth: MAX_WIDTH, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, width: "100%" },
  chips: { flexDirection: "row", gap: 6 },
  chip: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 999, justifyContent: "center", minHeight: 34, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: tokens.foreground },
  chipText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  chipTextSelected: { color: tokens.background },
  page: { alignSelf: "center", gap: GAP, paddingBottom: 32 },
  row: { flexDirection: "row", gap: GAP },
  column: { gap: GAP },
  caption: { ...typography.label, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 10 },
  pressed: { opacity: 0.6 },
});
