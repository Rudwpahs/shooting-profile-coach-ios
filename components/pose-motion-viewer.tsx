import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, buildPoseMotion, projectPosePoint, type JointName } from "@/lib/pose-motion";

const ANGLES = [
  { label: "정면", yaw: 0 },
  { label: "사선", yaw: 38 },
  { label: "측면", yaw: 82 },
];

export function PoseMotionViewer({ reference, hand = "right" }: { reference: AnonymousPoseReference; hand?: "auto" | "right" | "left" }) {
  const motion = useMemo(() => buildPoseMotion(reference), [reference]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [yaw, setYaw] = useState(38);
  const startYaw = useRef(38);
  const frame = motion.frames[frameIndex];
  const activeSide = hand === "left" ? "left" : "right";
  const points = useMemo(() => Object.fromEntries(Object.entries(frame.joints).map(([key, point]) => [key, projectPosePoint(hand === "left" ? { ...point, x: -point.x } : point, yaw, 8)])) as Record<JointName, ReturnType<typeof projectPosePoint>>, [frame, hand, yaw]);
  useEffect(() => { setFrameIndex(0); setPlaying(false); }, [reference.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setFrameIndex((current) => current >= motion.frames.length - 1 ? 0 : current + 1), 560);
    return () => clearInterval(timer);
  }, [playing, motion.frames.length]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startYaw.current = yaw; },
    onPanResponderMove: (_, gesture) => setYaw(Math.max(-90, Math.min(90, startYaw.current + gesture.dx * 0.48))),
  }), [yaw]);
  return <View style={styles.card}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>MOTION VIEW</Text><Text style={styles.title}>{reference.shortLabel} · {frame.label}</Text></View><Text style={styles.phase}>{frameIndex + 1}/{motion.frames.length}</Text></View>
    <View style={styles.stage} {...panResponder.panHandlers}>
      <Svg width="100%" height={270} viewBox="0 0 330 270">
        <Line x1="22" y1="243" x2="308" y2="243" stroke="#21445B" strokeWidth="1" strokeDasharray="4 5" />
        {BONE_LINKS.map(([from, to]) => <Line key={`${from}-${to}`} x1={points[from].x} y1={points[from].y} x2={points[to].x} y2={points[to].y} stroke={from.includes(activeSide) || to.includes(activeSide) ? "#F97316" : "#B8CEE4"} strokeWidth={from.includes(activeSide) || to.includes(activeSide) ? 4.5 : 3.5} strokeLinecap="round" />)}
        {(Object.keys(points) as JointName[]).map((joint) => <Circle key={joint} cx={points[joint].x} cy={points[joint].y} r={joint === `${activeSide}Wrist` ? 5.5 : 4} fill={joint === `${activeSide}Wrist` ? "#EA580C" : "#FFFFFF"} />)}
      </Svg>
      <Text style={styles.dragHint}>좌우로 드래그해 시점 회전</Text>
    </View>
    <View style={styles.angleRow}>{ANGLES.map((angle) => <Pressable key={angle.label} onPress={() => setYaw(angle.yaw)} style={({ pressed }) => [styles.angleButton, Math.abs(yaw - angle.yaw) < 10 && styles.angleActive, pressed && styles.pressed]}><Text style={[styles.angleText, Math.abs(yaw - angle.yaw) < 10 && styles.angleTextActive]}>{angle.label}</Text></Pressable>)}</View>
    <View style={styles.scrubRow}>{motion.frames.map((item, index) => <Pressable key={item.label} onPress={() => { setFrameIndex(index); setPlaying(false); }} style={({ pressed }) => [styles.scrubItem, index === frameIndex && styles.scrubItemActive, pressed && styles.pressed]}><View style={[styles.scrubDot, index === frameIndex && styles.scrubDotActive]} /><Text style={[styles.scrubLabel, index === frameIndex && styles.scrubLabelActive]}>{item.label}</Text></Pressable>)}</View>
    <Pressable onPress={() => setPlaying((value) => !value)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>{playing ? "일시 정지" : "모션 재생"}</Text><Text style={styles.playIcon}>{playing ? "Ⅱ" : "▶"}</Text></Pressable>
    <Text style={styles.boundary}>상대적 3D pose 시각화입니다. 단일 시점 특성으로 만든 참고용 모션이며, 보정된 실제 3D 측정값이 아닙니다.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, gap: 12, overflow: "hidden", padding: 14 }, header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 0.4, marginTop: 2, textTransform: "uppercase" }, phase: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 12 },
  stage: { alignItems: "center", backgroundColor: "#EFF6FF", borderColor: "#1E3A5F", borderRadius: 0, borderWidth: 2, minHeight: 270, overflow: "hidden" }, dragHint: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 11, marginBottom: 10, marginTop: -12 },
  angleRow: { flexDirection: "row", gap: 8 }, angleButton: { alignItems: "center", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flex: 1, minHeight: 36, justifyContent: "center" }, angleActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, angleText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 0.4 }, angleTextActive: { color: "#EA580C" },
  scrubRow: { flexDirection: "row", justifyContent: "space-between" }, scrubItem: { alignItems: "center", gap: 6, paddingHorizontal: 1 }, scrubItemActive: { opacity: 1 }, scrubDot: { backgroundColor: "#DBE3EE", borderRadius: 99, height: 9, width: 9 }, scrubDotActive: { backgroundColor: "#F97316", height: 11, width: 11 }, scrubLabel: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 9 }, scrubLabelActive: { color: "#1E3A5F" },
  playButton: { alignItems: "center", backgroundColor: "transparent", borderColor: "#1E3A5F", borderRadius: 0, borderWidth: 2, flexDirection: "row", justifyContent: "center", minHeight: 42 }, playText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 15, letterSpacing: 0.5, textTransform: "uppercase" }, playIcon: { color: "#EA580C", fontSize: 15, fontWeight: "900", marginLeft: 8 }, boundary: { color: "#64748B", fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
