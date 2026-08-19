import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { palette } from "@/components/formpath-ui";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, buildPoseMotion, projectPosePoint, type JointName } from "@/lib/pose-motion";

const ANGLES = [
  { label: "정면", yaw: 0 },
  { label: "사선", yaw: 38 },
  { label: "측면", yaw: 82 },
];

export function PoseMotionViewer({ reference }: { reference: AnonymousPoseReference }) {
  const motion = useMemo(() => buildPoseMotion(reference), [reference]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [yaw, setYaw] = useState(38);
  const startYaw = useRef(38);
  const frame = motion.frames[frameIndex];
  const points = useMemo(() => Object.fromEntries(Object.entries(frame.joints).map(([key, point]) => [key, projectPosePoint(point, yaw, 8)])) as Record<JointName, ReturnType<typeof projectPosePoint>>, [frame, yaw]);
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
        {BONE_LINKS.map(([from, to]) => <Line key={`${from}-${to}`} x1={points[from].x} y1={points[from].y} x2={points[to].x} y2={points[to].y} stroke={from.includes("right") || to.includes("right") ? "#FF8A5B" : "#D4E5F0"} strokeWidth={from.includes("right") || to.includes("right") ? 4.5 : 3.5} strokeLinecap="round" />)}
        {(Object.keys(points) as JointName[]).map((joint) => <Circle key={joint} cx={points[joint].x} cy={points[joint].y} r={joint === "rightWrist" ? 5.5 : 4} fill={joint === "rightWrist" ? "#FFB18D" : "#F5FBFF"} />)}
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
  card: { backgroundColor: palette.navy, borderRadius: 24, gap: 14, overflow: "hidden", padding: 18 }, header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#FFAB89", fontSize: 11, fontWeight: "800", letterSpacing: 1 }, title: { color: palette.white, fontSize: 18, fontWeight: "800", marginTop: 2 }, phase: { color: "#C9D8E4", fontSize: 12, fontWeight: "800" },
  stage: { alignItems: "center", backgroundColor: "#0A2538", borderColor: "#35526A", borderRadius: 18, borderWidth: 1, minHeight: 270, overflow: "hidden" }, dragHint: { color: "#9FB5C6", fontSize: 11, fontWeight: "700", marginBottom: 10, marginTop: -12 },
  angleRow: { flexDirection: "row", gap: 8 }, angleButton: { alignItems: "center", borderColor: "#35526A", borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 36, justifyContent: "center" }, angleActive: { backgroundColor: "#FF8A5B", borderColor: "#FF8A5B" }, angleText: { color: "#C9D8E4", fontSize: 12, fontWeight: "800" }, angleTextActive: { color: "#3A180C" },
  scrubRow: { flexDirection: "row", justifyContent: "space-between" }, scrubItem: { alignItems: "center", gap: 6, paddingHorizontal: 1 }, scrubItemActive: { opacity: 1 }, scrubDot: { backgroundColor: "#4B6576", borderRadius: 99, height: 9, width: 9 }, scrubDotActive: { backgroundColor: "#FF8A5B", height: 11, width: 11 }, scrubLabel: { color: "#9FB5C6", fontSize: 9, fontWeight: "700" }, scrubLabelActive: { color: palette.white },
  playButton: { alignItems: "center", backgroundColor: "#F4F0E9", borderRadius: 14, flexDirection: "row", justifyContent: "center", minHeight: 46 }, playText: { color: "#133047", fontSize: 14, fontWeight: "900" }, playIcon: { color: "#E35B2B", fontSize: 15, fontWeight: "900", marginLeft: 8 }, boundary: { color: "#9FB5C6", fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
