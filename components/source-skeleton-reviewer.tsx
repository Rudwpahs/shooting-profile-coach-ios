import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import type { PlayerSourceSkeletonReview } from "@/lib/anonymous-pose-library";

const EDGES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export function SourceSkeletonReviewer({ review }: { review: PlayerSourceSkeletonReview }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phase = review.phases[phaseIndex];
  const skeletonPoints = phase.landmarks.slice(11, 29);
  const minX = Math.min(...skeletonPoints.map((point) => point.x));
  const maxX = Math.max(...skeletonPoints.map((point) => point.x));
  const minY = Math.min(...skeletonPoints.map((point) => point.y));
  const maxY = Math.max(...skeletonPoints.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = Math.min(82 / Math.max(maxX - minX, 0.01), 132 / Math.max(maxY - minY, 0.01));
  const x = (index: number) => 50 + (phase.landmarks[index].x - centerX) * scale;
  const y = (index: number) => 75 + (phase.landmarks[index].y - centerY) * scale;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>ACTUAL VIDEO · 2D SKELETON</Text><Text style={styles.title}>{review.displayName}</Text></View>
        <View style={styles.tag}><Text style={styles.tagText}>{review.sourceView}</Text></View>
      </View>
      <Text style={styles.copy}>{review.sourceAttribution}</Text>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox="0 0 100 150">
          {EDGES.map(([from, to]) => <Line key={`${from}-${to}`} x1={x(from)} y1={y(from)} x2={x(to)} y2={y(to)} stroke="#F97316" strokeWidth={1.5} strokeLinecap="round" />)}
          {phase.landmarks.slice(11, 29).map((_, index) => <Circle key={index + 11} cx={x(index + 11)} cy={y(index + 11)} r={1.75} fill="#FFFFFF" stroke="#1E3A5F" strokeWidth={0.55} />)}
        </Svg>
      </View>
      <View style={styles.phaseHeader}><Text style={styles.phaseLabel}>{phase.label}</Text><Text style={styles.timestamp}>SRC {phase.sourceTimestampMs}ms</Text></View>
      <View style={styles.phaseRow}>{review.phases.map((item, index) => <Pressable key={item.label} onPress={() => setPhaseIndex(index)} style={({ pressed }) => [styles.phaseButton, phaseIndex === index && styles.phaseButtonActive, pressed && styles.pressed]}><Text style={[styles.phaseText, phaseIndex === index && styles.phaseTextActive]}>{item.label}</Text></Pressable>)}</View>
      <View style={styles.boundary}><Text style={styles.boundaryTitle}>FIXED 2D SOURCE REVIEW</Text><Text style={styles.boundaryCopy}>실제 영상 landmark만 표시합니다. 회전·깊이·3D 측정·추천에는 사용하지 않습니다.</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 18, borderWidth: 1, marginTop: 12, overflow: "hidden", padding: 14 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.15 },
  title: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 24, marginTop: 2 },
  tag: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11 },
  copy: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 5 },
  canvas: { alignSelf: "center", aspectRatio: 2 / 3, backgroundColor: "#102C46", borderRadius: 14, marginTop: 12, maxHeight: 282, overflow: "hidden", width: "58%" },
  phaseHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  phaseLabel: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 18 },
  timestamp: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.6 },
  phaseRow: { flexDirection: "row", gap: 5, marginTop: 8 },
  phaseButton: { alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 32, paddingHorizontal: 3 },
  phaseButtonActive: { backgroundColor: "#F97316" },
  phaseText: { color: "#475569", fontFamily: "BarlowCondensed-Bold", fontSize: 11 },
  phaseTextActive: { color: "#FFFFFF" },
  boundary: { backgroundColor: "#FFF7ED", borderLeftColor: "#F97316", borderLeftWidth: 3, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  boundaryTitle: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.75 },
  boundaryCopy: { color: "#7C5432", fontFamily: "Barlow", fontSize: 11, lineHeight: 15, marginTop: 2 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
