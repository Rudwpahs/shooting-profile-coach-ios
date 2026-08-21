import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { BONE_LINKS, clampPoseZoom, getPoseCameraPresets, normalizePoseYaw, projectPosePoint, type JointName, type PoseMotion } from "@/lib/pose-motion";

type Camera = { yaw: number; zoom: number };

export type PoseDisplayTransform = { groundY: number; scale: number };

/** Fits heterogeneous measured and relative pose coordinate spaces into the same viewer without altering source motion data. */
export function getPoseDisplayTransform(motion: PoseMotion): PoseDisplayTransform {
  const ankleYs = motion.frames.flatMap((frame) => [frame.joints.leftAnkle.y, frame.joints.rightAnkle.y]);
  const groundY = Math.min(...ankleYs);
  const highestY = Math.max(...motion.frames.flatMap((frame) => Object.values(frame.joints).map((point) => point.y)));
  return { groundY, scale: Math.min(1, 2.72 / Math.max(2.72, highestY - groundY)) };
}

function touchDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

type PoseMotionViewerProps = {
  motion: PoseMotion;
  title?: string;
  boundary?: string;
  hand?: "auto" | "right" | "left";
  activeFrameIndex?: number;
  sourcePhaseFrames?: number[];
  sourcePhaseTimestampsMs?: number[];
  onPhaseSelect?: (index: number) => void;
};

export function PoseMotionViewer({ motion, title, boundary, hand = "right", activeFrameIndex, sourcePhaseFrames, sourcePhaseTimestampsMs, onPhaseSelect }: PoseMotionViewerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const presets = useMemo(() => getPoseCameraPresets(motion, hand), [motion, hand]);
  const [camera, setCamera] = useState<Camera>(() => ({ yaw: presets[1].yaw, zoom: 1 }));
  const [isInteracting, setIsInteracting] = useState(false);
  const cameraRef = useRef<Camera>(camera);
  const startCamera = useRef<Camera>(camera);
  const pinchStartDistance = useRef(0);
  const isPinching = useRef(false);
  const pendingCamera = useRef<Camera | null>(null);
  const pendingFrame = useRef<number | null>(null);
  const visibleFrameIndex = activeFrameIndex ?? frameIndex;
  const frame = motion.frames[visibleFrameIndex];
  const activeSide = hand === "left" ? "left" : "right";
  const activeArmJoints = [`${activeSide}Shoulder`, `${activeSide}Elbow`, `${activeSide}Wrist`] as JointName[];
  const displayTransform = useMemo(() => getPoseDisplayTransform(motion), [motion]);
  const points = useMemo(() => Object.fromEntries(Object.entries(frame.joints).map(([key, point]) => {
    const normalized = { x: point.x * displayTransform.scale, y: (point.y - displayTransform.groundY) * displayTransform.scale, z: point.z * displayTransform.scale };
    return [key, projectPosePoint(hand === "left" ? { ...normalized, x: -normalized.x } : normalized, camera.yaw, 8, 330, 270, camera.zoom)];
  })) as Record<JointName, ReturnType<typeof projectPosePoint>>, [camera.yaw, camera.zoom, displayTransform, frame, hand]);
  const scheduleCamera = useCallback((next: Camera) => {
    cameraRef.current = next;
    pendingCamera.current = next;
    if (pendingFrame.current !== null) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      if (pendingCamera.current) setCamera(pendingCamera.current);
      pendingCamera.current = null;
    });
  }, []);
  useEffect(() => () => { if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current); }, []);
  useEffect(() => { setFrameIndex(0); setPlaying(false); scheduleCamera({ yaw: presets[1].yaw, zoom: 1 }); }, [motion.id, presets, scheduleCamera]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setFrameIndex((current) => current >= motion.frames.length - 1 ? 0 : current + 1), 560);
    return () => clearInterval(timer);
  }, [playing, motion.frames.length]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (event, gesture) => gesture.numberActiveTouches > 1 || (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onMoveShouldSetPanResponderCapture: (event, gesture) => gesture.numberActiveTouches > 1 || (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onPanResponderGrant: (event) => {
      startCamera.current = cameraRef.current;
      pinchStartDistance.current = touchDistance(event.nativeEvent.touches);
      isPinching.current = pinchStartDistance.current > 0;
      setIsInteracting(true);
    },
    onPanResponderMove: (event, gesture) => {
      const distance = touchDistance(event.nativeEvent.touches);
      if (gesture.numberActiveTouches > 1 && distance > 0) {
        if (!isPinching.current) {
          isPinching.current = true;
          pinchStartDistance.current = distance;
          startCamera.current = cameraRef.current;
        }
        scheduleCamera({ ...cameraRef.current, zoom: clampPoseZoom(startCamera.current.zoom * (distance / pinchStartDistance.current)) });
        return;
      }
      if (!isPinching.current) scheduleCamera({ ...cameraRef.current, yaw: normalizePoseYaw(startCamera.current.yaw + gesture.dx * 0.32) });
    },
    onPanResponderRelease: () => { isPinching.current = false; startCamera.current = cameraRef.current; setIsInteracting(false); },
    onPanResponderTerminate: () => { isPinching.current = false; setIsInteracting(false); },
    onPanResponderTerminationRequest: () => true,
  }), [scheduleCamera]);
  const changeZoom = (amount: number) => scheduleCamera({ ...cameraRef.current, zoom: clampPoseZoom(cameraRef.current.zoom + amount) });
  const resetView = () => scheduleCamera({ yaw: presets[1].yaw, zoom: 1 });
  const displayTitle = title ?? "ACTUAL MOTION";
  const boundaryCopy = boundary ?? "실제 source motion에서 변환된 관절 데이터입니다. source 승인·관절 품질 상태는 모션별 기록을 따릅니다.";
  return <View style={styles.card}>
    <View style={styles.header}><View style={styles.titleWrap}><Text style={styles.eyebrow}>MOTION VIEW</Text><Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{displayTitle} · {frame.label}</Text></View><View style={styles.phaseStack}><Text style={styles.phase}>{visibleFrameIndex + 1}/{motion.frames.length}</Text>{sourcePhaseFrames?.[visibleFrameIndex] ? <Text style={styles.sourceFrame}>SRC {sourcePhaseFrames[visibleFrameIndex]}</Text> : sourcePhaseTimestampsMs?.[visibleFrameIndex] !== undefined ? <Text style={styles.sourceFrame}>{sourcePhaseTimestampsMs[visibleFrameIndex]}ms</Text> : null}</View></View>
    <View style={[styles.stage, isInteracting && styles.stageInteracting]} {...panResponder.panHandlers}>
      <Svg width="100%" height={270} viewBox="0 0 330 270">
        <Line x1="22" y1="243" x2="308" y2="243" stroke="#40586B" strokeWidth="1" strokeDasharray="4 5" />
        {BONE_LINKS.map(([from, to]) => <Line key={`${from}-${to}`} x1={points[from].x} y1={points[from].y} x2={points[to].x} y2={points[to].y} stroke={from.includes(activeSide) || to.includes(activeSide) ? "#F97316" : "#AABDCB"} strokeWidth={from.includes(activeSide) || to.includes(activeSide) ? 4.5 : 3.25} strokeLinecap="round" />)}
        {(Object.keys(points) as JointName[]).filter((joint) => joint !== "head").map((joint) => <Circle key={joint} cx={points[joint].x} cy={points[joint].y} r={activeArmJoints.includes(joint) ? 5.25 : 4} fill={activeArmJoints.includes(joint) ? "#F97316" : "#E7EDF1"} stroke={activeArmJoints.includes(joint) ? "#9A3412" : "#E7EDF1"} strokeWidth={activeArmJoints.includes(joint) ? 1.2 : 0} />)}
        <Circle cx={points.head.x} cy={points.head.y} r={8} fill="#E7EDF1" stroke="#F5F1E8" strokeWidth={2} />
        <Circle cx={points.head.x + 2.25} cy={points.head.y - 1} r={1.5} fill="#0B1623" />
      </Svg>
      <Text style={styles.dragHint}>좌우 드래그 회전 · 두 손가락 핀치 확대/축소</Text>
    </View>
    <View style={styles.angleRow}>{presets.map((angle) => <Pressable key={angle.id} onPress={() => scheduleCamera({ ...cameraRef.current, yaw: angle.yaw })} style={({ pressed }) => [styles.angleButton, Math.abs(normalizePoseYaw(camera.yaw - angle.yaw)) < 10 && styles.angleActive, pressed && styles.pressed]}><Text style={[styles.angleText, Math.abs(normalizePoseYaw(camera.yaw - angle.yaw)) < 10 && styles.angleTextActive]}>{angle.label}</Text></Pressable>)}</View>
    <View style={styles.zoomRow}><Pressable onPress={() => changeZoom(-0.12)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]} accessibilityLabel="축소"><Text style={styles.zoomButtonText}>−</Text></Pressable><View style={styles.zoomReadout}><Text style={styles.zoomLabel}>ZOOM</Text><Text style={styles.zoomValue}>{Math.round(camera.zoom * 100)}%</Text></View><Pressable onPress={() => changeZoom(0.12)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]} accessibilityLabel="확대"><Text style={styles.zoomButtonText}>＋</Text></Pressable><Pressable onPress={resetView} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]} accessibilityLabel="시점 초기화"><Text style={styles.resetText}>RESET</Text></Pressable></View>
    <View style={styles.scrubRow}>{motion.frames.map((item, index) => <Pressable key={item.label} onPress={() => { setFrameIndex(index); setPlaying(false); onPhaseSelect?.(index); }} style={({ pressed }) => [styles.scrubItem, index === visibleFrameIndex && styles.scrubItemActive, pressed && styles.pressed]}><View style={[styles.scrubDot, index === visibleFrameIndex && styles.scrubDotActive]} /><Text style={[styles.scrubLabel, index === visibleFrameIndex && styles.scrubLabelActive]}>{item.label}</Text></Pressable>)}</View>
    <Pressable onPress={() => setPlaying((value) => !value)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>{playing ? "일시 정지" : "모션 재생"}</Text><Text style={styles.playIcon}>{playing ? "Ⅱ" : "▶"}</Text></Pressable>
    <Text style={styles.boundary}>{boundaryCopy}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 18, borderWidth: 1, gap: 12, overflow: "hidden", padding: 13 }, header: { alignItems: "center", flexDirection: "row", gap: 8 }, titleWrap: { flex: 1, minWidth: 0 }, eyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.2 }, title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 18, letterSpacing: 0.25, marginTop: 2, textTransform: "uppercase" }, phaseStack: { alignItems: "flex-end", minWidth: 47 }, phase: { color: "#667789", fontFamily: "Barlow-SemiBold", fontSize: 12 }, sourceFrame: { color: "#1D9B77", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 0.1, marginTop: 2 },
  stage: { alignItems: "center", backgroundColor: "#0B1623", borderColor: "#0B1623", borderRadius: 14, borderWidth: 1, minHeight: 270, overflow: "hidden" }, stageInteracting: { borderColor: "#F97316" }, dragHint: { color: "#9DB0BE", fontFamily: "Barlow-SemiBold", fontSize: 11, marginBottom: 10, marginTop: -12 },
  angleRow: { flexDirection: "row", gap: 7 }, angleButton: { alignItems: "center", backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 11, borderWidth: 1, flex: 1, minHeight: 36, justifyContent: "center" }, angleActive: { backgroundColor: "#FFF0E8", borderColor: "#F97316" }, angleText: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 0.4 }, angleTextActive: { color: "#C74B11" },
  zoomRow: { alignItems: "stretch", flexDirection: "row", gap: 7 }, zoomButton: { alignItems: "center", backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 11, borderWidth: 1, justifyContent: "center", minWidth: 42 }, zoomButtonText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 23, lineHeight: 24 }, zoomReadout: { alignItems: "center", backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 11, borderWidth: 1, flex: 1, flexDirection: "row", justifyContent: "center", gap: 7, minHeight: 40 }, zoomLabel: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.8 }, zoomValue: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, resetButton: { alignItems: "center", backgroundColor: "#102235", borderRadius: 11, justifyContent: "center", minWidth: 62 }, resetText: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.4 },
  scrubRow: { flexDirection: "row", justifyContent: "space-between" }, scrubItem: { alignItems: "center", gap: 6, paddingHorizontal: 1 }, scrubItemActive: { opacity: 1 }, scrubDot: { backgroundColor: "#D9E0E4", borderRadius: 99, height: 9, width: 9 }, scrubDotActive: { backgroundColor: "#F97316", height: 11, width: 11 }, scrubLabel: { color: "#667789", fontFamily: "Barlow-SemiBold", fontSize: 9 }, scrubLabelActive: { color: "#102235" },
  playButton: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 13, flexDirection: "row", justifyContent: "center", minHeight: 44 }, playText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 15, letterSpacing: 0.5, textTransform: "uppercase" }, playIcon: { color: "#0B1623", fontSize: 15, fontWeight: "900", marginLeft: 8 }, boundary: { color: "#667789", fontFamily: "Barlow", fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
