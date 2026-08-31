import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { BONE_LINKS, clampPoseZoom, getPoseCameraPresets, getPoseDisplayTransform, interpolatePoseFrame, normalizePoseYaw, projectPosePoint, type JointName, type PoseMotion } from "@/lib/pose-motion";

type Camera = { yaw: number; zoom: number };

function touchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

type PoseMotionViewerProps = {
  motion: PoseMotion;
  title?: string;
  boundary?: string;
  hand?: "auto" | "right" | "left";
  initialCameraView?: "front" | "oblique" | "side";
  activeFrameIndex?: number;
  sourcePhaseFrames?: number[];
  sourcePhaseTimestampsMs?: number[];
  onPhaseSelect?: (index: number) => void;
};

export function PoseMotionViewer({ motion, title, boundary, hand = "right", initialCameraView = "oblique", activeFrameIndex, sourcePhaseFrames, sourcePhaseTimestampsMs, onPhaseSelect }: PoseMotionViewerProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const presets = useMemo(() => getPoseCameraPresets(motion, hand), [motion, hand]);
  const preferredPreset = presets.find((preset) => preset.id === initialCameraView) ?? presets[1];
  const [camera, setCamera] = useState<Camera>(() => ({ yaw: preferredPreset.yaw, zoom: 1 }));
  const [isInteracting, setIsInteracting] = useState(false);
  const cameraRef = useRef<Camera>(camera);
  const startCamera = useRef<Camera>(camera);
  const pinchStartDistance = useRef(0);
  const isPinching = useRef(false);
  const pendingCamera = useRef<Camera | null>(null);
  const pendingCameraFrame = useRef<number | null>(null);
  const playbackFrame = useRef<number | null>(null);
  const displayProgressRef = useRef(displayProgress);
  const displayTransform = useMemo(() => getPoseDisplayTransform(motion), [motion]);
  const lastPhaseIndex = motion.frames.length - 1;
  const fluidFrame = useMemo(() => interpolatePoseFrame(motion, displayProgress), [displayProgress, motion]);
  const activePhaseIndex = activeFrameIndex ?? Math.min(lastPhaseIndex, Math.round(displayProgress * lastPhaseIndex));
  const phaseLabel = fluidFrame.startPhaseIndex === fluidFrame.endPhaseIndex || fluidFrame.phaseAmount < 0.02
    ? motion.frames[fluidFrame.startPhaseIndex].label
    : `${motion.frames[fluidFrame.startPhaseIndex].label} → ${motion.frames[fluidFrame.endPhaseIndex].label}`;
  const activeSide = hand === "left" ? "left" : "right";
  const activeArmJoints = [`${activeSide}Shoulder`, `${activeSide}Elbow`, `${activeSide}Wrist`] as JointName[];
  const points = useMemo(() => Object.fromEntries(Object.entries(fluidFrame.joints).map(([key, point]) => {
    const normalized = { x: point.x * displayTransform.scale, y: (point.y - displayTransform.groundY) * displayTransform.scale, z: point.z * displayTransform.scale };
    return [key, projectPosePoint(hand === "left" ? { ...normalized, x: -normalized.x } : normalized, camera.yaw, 8, 330, 300, camera.zoom * 1.22)];
  })) as Record<JointName, ReturnType<typeof projectPosePoint>>, [camera.yaw, camera.zoom, displayTransform, fluidFrame.joints, hand]);

  const scheduleCamera = useCallback((next: Camera) => {
    cameraRef.current = next;
    pendingCamera.current = next;
    if (pendingCameraFrame.current !== null) return;
    pendingCameraFrame.current = requestAnimationFrame(() => {
      pendingCameraFrame.current = null;
      if (pendingCamera.current) setCamera(pendingCamera.current);
      pendingCamera.current = null;
    });
  }, []);

  useEffect(() => () => {
    if (pendingCameraFrame.current !== null) cancelAnimationFrame(pendingCameraFrame.current);
    if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current);
  }, []);
  useEffect(() => { displayProgressRef.current = displayProgress; }, [displayProgress]);
  useEffect(() => { setDisplayProgress(0); setPlaying(true); scheduleCamera({ yaw: preferredPreset.yaw, zoom: 1 }); }, [motion.id, preferredPreset.yaw, scheduleCamera]);
  useEffect(() => {
    if (activeFrameIndex === undefined) return;
    setDisplayProgress(activeFrameIndex / lastPhaseIndex);
    setPlaying(false);
  }, [activeFrameIndex, lastPhaseIndex]);
  useEffect(() => {
    if (!playing) return;
    let startTime: number | null = null;
    const duration = Math.max(1850, (sourcePhaseTimestampsMs?.at(-1) ?? 0) - (sourcePhaseTimestampsMs?.[0] ?? 0));
    const tick = (time: number) => {
      if (startTime === null) startTime = time - displayProgressRef.current * duration;
      const next = ((time - startTime) % duration) / duration;
      setDisplayProgress(next);
      playbackFrame.current = requestAnimationFrame(tick);
    };
    playbackFrame.current = requestAnimationFrame(tick);
    return () => { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); };
  }, [motion.id, playing, sourcePhaseTimestampsMs]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.numberActiveTouches > 1 || (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.numberActiveTouches > 1 || (Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onPanResponderGrant: (event) => {
      startCamera.current = cameraRef.current;
      pinchStartDistance.current = touchDistance(event.nativeEvent.touches);
      isPinching.current = pinchStartDistance.current > 0;
      setIsInteracting(true);
    },
    onPanResponderMove: (event, gesture) => {
      const distance = touchDistance(event.nativeEvent.touches);
      if (gesture.numberActiveTouches > 1 && distance > 0) {
        if (!isPinching.current) { isPinching.current = true; pinchStartDistance.current = distance; startCamera.current = cameraRef.current; }
        scheduleCamera({ ...cameraRef.current, zoom: clampPoseZoom(startCamera.current.zoom * (distance / pinchStartDistance.current)) });
        return;
      }
      if (!isPinching.current) scheduleCamera({ ...cameraRef.current, yaw: normalizePoseYaw(startCamera.current.yaw + gesture.dx * 0.32) });
    },
    onPanResponderRelease: () => { isPinching.current = false; startCamera.current = cameraRef.current; setIsInteracting(false); },
    onPanResponderTerminate: () => { isPinching.current = false; setIsInteracting(false); },
    onPanResponderTerminationRequest: () => true,
  }), [scheduleCamera]);

  const seekPhase = (index: number) => { setDisplayProgress(index / lastPhaseIndex); setPlaying(false); onPhaseSelect?.(index); };
  const resetView = () => scheduleCamera({ yaw: preferredPreset.yaw, zoom: 1 });
  const displayTitle = title ?? "MOTION";
  const boundaryCopy = boundary ?? "source phase를 매끄럽게 보간한 display motion입니다.";

  return <View style={styles.card}>
    <View style={styles.header}><View style={styles.titleWrap}><Text style={styles.eyebrow}>FLUID MOTION</Text><Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{displayTitle}</Text></View><View style={styles.phaseStack}><Text style={styles.phaseLabel}>{phaseLabel}</Text><Text style={styles.phaseValue}>{Math.round(displayProgress * 100)}%</Text></View></View>
    <View style={[styles.stage, isInteracting && styles.stageInteracting]} {...panResponder.panHandlers}>
      <Svg width="100%" height={300} viewBox="0 0 330 300">
        <Line x1="22" y1="272" x2="308" y2="272" stroke="#40586B" strokeWidth="1" strokeDasharray="4 5" />
        {BONE_LINKS.map(([from, to]) => <Line key={`${from}-${to}`} x1={points[from].x} y1={points[from].y} x2={points[to].x} y2={points[to].y} stroke={from.includes(activeSide) || to.includes(activeSide) ? "#F97316" : "#AABDCB"} strokeWidth={from.includes(activeSide) || to.includes(activeSide) ? 7 : 5} strokeLinecap="round" />)}
        {(Object.keys(points) as JointName[]).filter((joint) => joint !== "head").map((joint) => <Circle key={joint} cx={points[joint].x} cy={points[joint].y} r={activeArmJoints.includes(joint) ? 7 : 5.5} fill={activeArmJoints.includes(joint) ? "#F97316" : "#E7EDF1"} stroke={activeArmJoints.includes(joint) ? "#9A3412" : "#E7EDF1"} strokeWidth={activeArmJoints.includes(joint) ? 1.6 : 0} />)}
        <Circle cx={points.head.x} cy={points.head.y} r={10} fill="#E7EDF1" stroke="#F5F1E8" strokeWidth={2.5} />
        <Circle cx={points.head.x + 2.25} cy={points.head.y - 1} r={1.5} fill="#0B1623" />
      </Svg>
      <View style={styles.stageOverlay}><Text style={styles.stageHint}>DRAG TO ROTATE · PINCH TO ZOOM</Text><Pressable onPress={resetView} style={({ pressed }) => [styles.resetIcon, pressed && styles.pressed]} accessibilityLabel="시점 초기화"><Text style={styles.resetIconText}>↺</Text></Pressable></View>
    </View>
    <View style={styles.viewRow}>{presets.map((angle) => <Pressable key={angle.id} onPress={() => scheduleCamera({ ...cameraRef.current, yaw: angle.yaw })} style={({ pressed }) => [styles.viewButton, Math.abs(normalizePoseYaw(camera.yaw - angle.yaw)) < 10 && styles.viewActive, pressed && styles.pressed]}><Text style={[styles.viewText, Math.abs(normalizePoseYaw(camera.yaw - angle.yaw)) < 10 && styles.viewTextActive]}>{angle.label}</Text></Pressable>)}</View>
    <View style={styles.timeline}>{motion.frames.map((item, index) => <Pressable key={item.label} onPress={() => seekPhase(index)} style={({ pressed }) => [styles.marker, pressed && styles.pressed]}><View style={styles.markerLine} /><View style={[styles.markerDot, Math.abs(index - activePhaseIndex) < 1 && styles.markerDotActive]} /><Text style={[styles.markerLabel, Math.abs(index - activePhaseIndex) < 1 && styles.markerLabelActive]}>{item.label}</Text>{sourcePhaseFrames?.[index] ? <Text style={styles.markerSource}>#{sourcePhaseFrames[index]}</Text> : sourcePhaseTimestampsMs?.[index] !== undefined ? <Text style={styles.markerSource}>{sourcePhaseTimestampsMs[index]}ms</Text> : null}</Pressable>)}</View>
    <Pressable onPress={() => setPlaying((value) => !value)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playIcon}>{playing ? "Ⅱ" : "▶"}</Text><Text style={styles.playText}>{playing ? "FLUID PLAYING" : "FLUID PLAY"}</Text></Pressable>
    <Text style={styles.boundary}>{boundaryCopy}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 18, borderWidth: 1, gap: 11, overflow: "hidden", padding: 13 },
  header: { alignItems: "center", flexDirection: "row", gap: 8 }, titleWrap: { flex: 1, minWidth: 0 }, eyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.2 }, title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 17, letterSpacing: 0.2, marginTop: 2, textTransform: "uppercase" },
  phaseStack: { alignItems: "flex-end" }, phaseLabel: { color: "#1D9B77", fontFamily: "BarlowCondensed-Bold", fontSize: 12 }, phaseValue: { color: "#667789", fontFamily: "Barlow-SemiBold", fontSize: 10, marginTop: 1 },
  stage: { backgroundColor: "#0B1623", borderColor: "#0B1623", borderRadius: 15, borderWidth: 1, minHeight: 300, overflow: "hidden" }, stageInteracting: { borderColor: "#F97316" }, stageOverlay: { alignItems: "center", bottom: 9, flexDirection: "row", justifyContent: "space-between", left: 11, position: "absolute", right: 11 }, stageHint: { color: "#8FA2B1", fontFamily: "BarlowCondensed-Bold", fontSize: 9, letterSpacing: 0.6 }, resetIcon: { alignItems: "center", backgroundColor: "rgba(231,237,241,0.12)", borderRadius: 10, height: 28, justifyContent: "center", width: 28 }, resetIconText: { color: "#F5F1E8", fontSize: 18, lineHeight: 20 },
  viewRow: { flexDirection: "row", gap: 7 }, viewButton: { alignItems: "center", backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 32, justifyContent: "center" }, viewActive: { backgroundColor: "#FFF0E8", borderColor: "#F97316" }, viewText: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 12 }, viewTextActive: { color: "#C74B11" },
  timeline: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 }, marker: { alignItems: "center", flex: 1, minWidth: 0 }, markerLine: { backgroundColor: "#D9E0E4", height: 1, left: 0, position: "absolute", right: 0, top: 5 }, markerDot: { backgroundColor: "#D9E0E4", borderRadius: 99, height: 10, width: 10 }, markerDotActive: { backgroundColor: "#F97316", height: 12, width: 12 }, markerLabel: { color: "#7A8997", fontFamily: "Barlow-SemiBold", fontSize: 9, marginTop: 4 }, markerLabelActive: { color: "#102235", fontFamily: "BarlowCondensed-Bold" }, markerSource: { color: "#9AA8B5", fontFamily: "Barlow", fontSize: 7, marginTop: 1 },
  playButton: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 12, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 40 }, playIcon: { color: "#0B1623", fontSize: 14, fontWeight: "900" }, playText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 0.75 }, boundary: { color: "#667789", fontFamily: "Barlow", fontSize: 10, lineHeight: 15 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});

