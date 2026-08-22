import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
  RepresentativePoseFrameV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

type Point3 = { x: number; y: number; z: number };

export type RepresentativeViewId = "front" | "oblique" | "side";
export type DerivedDisplayJointName = "head" | "neck" | "spine" | "pelvis";
export type RepresentativeDisplayJointName = PersistedJointNameV2 | DerivedDisplayJointName;

type DisplayJoint = Point3 & { source: "observed" | "derived" };
type ProjectedJoint = { x: number; y: number; depth: number; source: "observed" | "derived" };
type PlaybackIntent = "autoplay" | "explicit" | "paused";

type PlaybackPolicy = {
  appState: AppStateStatus;
  intent: PlaybackIntent;
  reducedMotion: boolean;
};

export type RepresentativePlaybackLifecycle = {
  appState: AppStateStatus;
  intent: PlaybackIntent;
  reducedMotion: boolean | null;
  reducedMotionResolved: boolean;
};

export type RepresentativePlaybackLifecycleEvent =
  | { type: "app-state"; value: AppStateStatus }
  | { type: "reduced-motion"; value: boolean }
  | { type: "profile" }
  | { type: "explicit-play" }
  | { type: "pause" };

export type ShootingProfileViewerLoadStatus = "idle" | "loading" | "ready" | "not-found" | "error";
export type RepresentativeFocusSurface = "light" | "selected-navy" | "play";

type SequenceViewerProps = {
  profile: RepresentativePose4DV2;
  confidence?: number;
  shootingHand?: ShootingHandV2;
};

type ViewPreset = {
  id: RepresentativeViewId;
  label: "정면" | "사선" | "슈팅 측면";
  yaw: number;
  mirrorX: boolean;
};

const FRAME_COUNT = 101;
const LAST_FRAME_INDEX = FRAME_COUNT - 1;
const FRAME_INTERVAL_MS = 40;
const PERSISTED_JOINTS: readonly PersistedJointNameV2[] = [
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
];
const DISPLAY_JOINTS: readonly RepresentativeDisplayJointName[] = [
  ...PERSISTED_JOINTS,
  "head", "neck", "spine", "pelvis",
];
const DISPLAY_BONES: ReadonlyArray<readonly [RepresentativeDisplayJointName, RepresentativeDisplayJointName]> = [
  ["head", "neck"], ["neck", "spine"], ["spine", "pelvis"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
];
const PHASE_LABELS: Readonly<Record<string, string>> = {
  ready: "준비",
  deepestDip: "딥",
  rise: "상승",
  releaseProxy: "릴리스 추정",
  followThrough: "팔로우스루",
};

function finitePoint(point: Point3, name: string): Point3 {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new Error(`${name} display point must be finite`);
  }
  return { x: point.x, y: point.y, z: point.z };
}

function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function clampFrameIndex(index: number): number {
  if (!Number.isFinite(index)) throw new Error("frame index must be finite");
  return Math.max(0, Math.min(LAST_FRAME_INDEX, Math.round(index)));
}

export function sampleRepresentativeFrame(
  profile: RepresentativePose4DV2,
  phase: number,
): RepresentativePoseFrameV2 {
  if (!Number.isFinite(phase)) throw new Error("phase must be finite");
  validateRepresentativeViewerProfile(profile);
  const clamped = Math.max(0, Math.min(1, phase));
  const sourceIndex = Math.round(clamped * LAST_FRAME_INDEX);
  const storedFrame = profile.frames[sourceIndex];
  if (!storedFrame) throw new Error("stored representative frame is unavailable");
  return storedFrame;
}

export function validateRepresentativeViewerProfile(
  profile: RepresentativePose4DV2,
): RepresentativePose4DV2 {
  if (!profile || !Array.isArray(profile.frames) || profile.frames.length !== FRAME_COUNT) {
    throw new Error("representative viewer requires exactly 101 stored frames");
  }
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    if (!profile.frames[index]) {
      throw new Error("representative viewer requires exactly 101 stored frames");
    }
  }
  return profile;
}

export function getRepresentativeFocusStyle(
  focused: boolean,
  surface: RepresentativeFocusSurface,
): ViewStyle {
  if (!focused) return {};
  let outlineColor = "#102235";
  let shadowColor = "#F97316";
  if (surface === "play") {
    outlineColor = "#FFFFFF";
    shadowColor = "#102235";
  } else if (surface === "selected-navy") {
    outlineColor = "#F97316";
    shadowColor = "#FFFFFF";
  }
  return {
    elevation: 8,
    outlineColor,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

export function advanceRepresentativeFrameIndex(currentIndex: number): number {
  const clamped = clampFrameIndex(currentIndex);
  return clamped === LAST_FRAME_INDEX ? 0 : clamped + 1;
}

export function resolveRepresentativePlayback(policy: PlaybackPolicy): boolean {
  if (policy.appState !== "active" || policy.intent === "paused") return false;
  return policy.intent === "explicit" || !policy.reducedMotion;
}

export function createRepresentativePlaybackLifecycle(): RepresentativePlaybackLifecycle {
  return {
    appState: "unknown",
    intent: "paused",
    reducedMotion: null,
    reducedMotionResolved: false,
  };
}

export function transitionRepresentativePlaybackLifecycle(
  state: RepresentativePlaybackLifecycle,
  event: RepresentativePlaybackLifecycleEvent,
): RepresentativePlaybackLifecycle {
  if (event.type === "app-state") {
    return {
      ...state,
      appState: event.value,
      intent: event.value === "active" ? state.intent : "paused",
    };
  }
  if (event.type === "reduced-motion") {
    const firstResolution = !state.reducedMotionResolved;
    let intent = state.intent;
    if (event.value) intent = "paused";
    else if (firstResolution && state.appState === "active" && state.intent === "paused") intent = "autoplay";
    return {
      ...state,
      intent,
      reducedMotion: event.value,
      reducedMotionResolved: true,
    };
  }
  if (event.type === "explicit-play") return { ...state, intent: "explicit" };
  if (event.type === "pause") return { ...state, intent: "paused" };
  return state;
}

export function buildShootingProfileViewerKey(uid: string, profileId: string): string {
  return `${uid}:${profileId}`;
}

export function canRenderShootingProfileViewerRecord(
  stateKey: string | undefined,
  currentKey: string | null,
  status: ShootingProfileViewerLoadStatus,
): boolean {
  return status === "ready" && currentKey !== null && stateKey === currentKey;
}

export function buildRepresentativeDisplayJoints(
  frame: RepresentativePoseFrameV2,
): Record<RepresentativeDisplayJointName, DisplayJoint> {
  const observed = Object.fromEntries(PERSISTED_JOINTS.map((joint) => [
    joint,
    { ...finitePoint(frame.joints[joint], joint), source: "observed" as const },
  ])) as Record<PersistedJointNameV2, DisplayJoint>;
  const neck = midpoint(observed.leftShoulder, observed.rightShoulder);
  const pelvis = midpoint(observed.leftHip, observed.rightHip);
  const spine = midpoint(neck, pelvis);
  const torsoVector = { x: neck.x - spine.x, y: neck.y - spine.y, z: neck.z - spine.z };
  const torsoLength = Math.hypot(torsoVector.x, torsoVector.y, torsoVector.z);
  const head = torsoLength > 1e-8
    ? {
      x: neck.x + torsoVector.x * 0.62,
      y: neck.y + torsoVector.y * 0.62,
      z: neck.z + torsoVector.z * 0.62,
    }
    : { x: neck.x, y: neck.y + 0.34, z: neck.z };
  return {
    ...observed,
    head: { ...finitePoint(head, "head"), source: "derived" },
    neck: { ...finitePoint(neck, "neck"), source: "derived" },
    spine: { ...finitePoint(spine, "spine"), source: "derived" },
    pelvis: { ...finitePoint(pelvis, "pelvis"), source: "derived" },
  };
}

export function getRepresentativeViewPresets(shootingHand: ShootingHandV2): readonly ViewPreset[] {
  const mirrorX = shootingHand === "left";
  return [
    { id: "front", label: "정면", yaw: 0, mirrorX },
    { id: "oblique", label: "사선", yaw: -45, mirrorX },
    { id: "side", label: "슈팅 측면", yaw: -90, mirrorX },
  ];
}

export function projectRepresentativeJoints(
  frame: RepresentativePoseFrameV2,
  view: RepresentativeViewId,
  shootingHand: ShootingHandV2,
): Record<RepresentativeDisplayJointName, ProjectedJoint> {
  const preset = getRepresentativeViewPresets(shootingHand).find((item) => item.id === view);
  if (!preset) throw new Error("representative view preset is unavailable");
  const yaw = preset.yaw * Math.PI / 180;
  const pitch = 8 * Math.PI / 180;
  const display = buildRepresentativeDisplayJoints(frame);
  return Object.fromEntries(DISPLAY_JOINTS.map((joint) => {
    const point = display[joint];
    const sourceX = preset.mirrorX ? -point.x : point.x;
    const rotatedX = sourceX * Math.cos(yaw) - point.z * Math.sin(yaw);
    const depth = sourceX * Math.sin(yaw) + point.z * Math.cos(yaw);
    const rotatedY = point.y * Math.cos(pitch) - depth * Math.sin(pitch);
    if (![rotatedX, rotatedY, depth].every(Number.isFinite)) {
      throw new Error(`${joint} projection must be finite`);
    }
    return [joint, { x: rotatedX, y: rotatedY, depth, source: point.source }];
  })) as Record<RepresentativeDisplayJointName, ProjectedJoint>;
}

function phaseLabel(id: string): string {
  return PHASE_LABELS[id] ?? id;
}

export function SequenceViewer({
  profile,
  confidence,
  shootingHand = "right",
}: SequenceViewerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [view, setView] = useState<RepresentativeViewId>("oblique");
  const [lifecycle, setLifecycle] = useState(createRepresentativePlaybackLifecycle);
  const [announcement, setAnnouncement] = useState("대표 동작 뷰어 준비됨");
  const [sliderWidth, setSliderWidth] = useState(1);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const animationFrame = useRef<number | null>(null);
  const lifecycleRef = useRef(lifecycle);
  const applyLifecycleEvent = useCallback((event: RepresentativePlaybackLifecycleEvent) => {
    const next = transitionRepresentativePlaybackLifecycle(lifecycleRef.current, event);
    lifecycleRef.current = next;
    setLifecycle(next);
  }, []);
  const isPlaying = resolveRepresentativePlayback({
    appState: lifecycle.appState,
    intent: lifecycle.intent,
    reducedMotion: lifecycle.reducedMotion ?? true,
  });
  const validatedProfile = useMemo(
    () => validateRepresentativeViewerProfile(profile),
    [profile],
  );
  const projectedSequence = useMemo(
    () => validatedProfile.frames.map((item) => projectRepresentativeJoints(item, view, shootingHand)),
    [shootingHand, validatedProfile, view],
  );
  const projected = projectedSequence[frameIndex];
  const bounds = useMemo(() => {
    const points = projectedSequence.flatMap((item) => Object.values(item));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(276 / Math.max(0.01, maxX - minX), 252 / Math.max(0.01, maxY - minY));
    return { centerX: (minX + maxX) / 2, maxY, scale };
  }, [projectedSequence]);
  const canvasPoints = useMemo(() => Object.fromEntries(DISPLAY_JOINTS.map((joint) => [joint, {
    ...projected[joint],
    x: 165 + (projected[joint].x - bounds.centerX) * bounds.scale,
    y: 20 + (bounds.maxY - projected[joint].y) * bounds.scale,
  }])) as Record<RepresentativeDisplayJointName, ProjectedJoint>, [bounds, projected]);
  const presets = getRepresentativeViewPresets(shootingHand);
  const selectedView = presets.find((preset) => preset.id === view) ?? presets[1];
  const modeCopy = validatedProfile.mode === "basic_1_plus_1"
    ? "Basic · 대표 스냅샷"
    : "High accuracy · 반복 일치";
  const qualityCopy = validatedProfile.quality.passed ? "품질 통과" : "재촬영 필요";
  const confidenceCopy = confidence !== undefined && Number.isFinite(confidence)
    ? ` · 신뢰도 ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
    : "";

  useEffect(() => {
    const reconcileAppState = (nextState: AppStateStatus) => {
      applyLifecycleEvent({ type: "app-state", value: nextState });
    };
    const subscription = AppState.addEventListener("change", reconcileAppState);
    reconcileAppState(AppState.currentState);
    return () => subscription.remove();
  }, [applyLifecycleEvent]);

  useEffect(() => {
    let mounted = true;
    const updateReducedMotion = (enabled: boolean) => {
      if (mounted) applyLifecycleEvent({ type: "reduced-motion", value: enabled });
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(updateReducedMotion).catch(() => {
      if (mounted) applyLifecycleEvent({ type: "reduced-motion", value: true });
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", updateReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [applyLifecycleEvent]);

  useEffect(() => {
    setFrameIndex(0);
    applyLifecycleEvent({ type: "profile" });
  }, [applyLifecycleEvent, profile]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime: number | null = null;
    let elapsed = 0;
    const tick = (time: number) => {
      if (lastTime !== null) elapsed += Math.max(0, time - lastTime);
      lastTime = time;
      const currentLifecycle = lifecycleRef.current;
      const mayAdvance = resolveRepresentativePlayback({
        appState: currentLifecycle.appState,
        intent: currentLifecycle.intent,
        reducedMotion: currentLifecycle.reducedMotion ?? true,
      });
      if (mayAdvance && elapsed >= FRAME_INTERVAL_MS) {
        elapsed %= FRAME_INTERVAL_MS;
        setFrameIndex((current) => advanceRepresentativeFrameIndex(current));
      }
      animationFrame.current = requestAnimationFrame(tick);
    };
    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [isPlaying]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  const seekToIndex = useCallback((nextIndex: number, label?: string) => {
    const clamped = clampFrameIndex(nextIndex);
    setFrameIndex(clamped);
    applyLifecycleEvent({ type: "pause" });
    const message = label ?? `${clamped}% 위상`;
    setAnnouncement(`${message}(으)로 이동`);
  }, [applyLifecycleEvent]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      applyLifecycleEvent({ type: "pause" });
      setAnnouncement(`${frameIndex}% 위상에서 일시정지`);
      return;
    }
    applyLifecycleEvent({ type: "explicit-play" });
    setAnnouncement("대표 동작 재생");
  }, [applyLifecycleEvent, frameIndex, isPlaying]);

  const seekFromTrack = useCallback((locationX: number) => {
    seekToIndex(Math.round(Math.max(0, Math.min(1, locationX / Math.max(1, sliderWidth))) * LAST_FRAME_INDEX));
  }, [seekToIndex, sliderWidth]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>REPRESENTATIVE SEQUENCE</Text>
          <Text style={styles.title}>대표 슛폼 101</Text>
          <Text style={styles.boundary}>위상 결합 4D 추정 · 실측 3D 아님</Text>
        </View>
        <View style={styles.percentBadge}>
          <Text style={styles.percentValue}>{frameIndex}%</Text>
          <Text style={styles.percentLabel}>현재 위상</Text>
        </View>
      </View>

      <View style={styles.metaPanel}>
        <Text style={styles.mode}>{modeCopy}</Text>
        <Text style={styles.meta}>저장 위상 {validatedProfile.frames.length}개 · {selectedView.label}{confidenceCopy}</Text>
        <Text style={validatedProfile.quality.passed ? styles.qualityPass : styles.qualityRecapture}>
          {qualityCopy}{validatedProfile.quality.reasons.length ? ` · ${validatedProfile.quality.reasons.join(", ")}` : ""}
        </Text>
        <Text style={styles.mirrorConvention}>
          {shootingHand === "left"
            ? "왼손 슈터 · 표시 x축을 미러해 슈팅 측면을 정규화"
            : "오른손 슈터 · 원본 x축 기준으로 슈팅 측면 표시"}
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={`${selectedView.label}, ${frameIndex}% 위상 대표 골격 이미지, 관측 관절 12개와 표시용 파생 관절 4개`}
        accessibilityRole="image"
        style={styles.stage}
      >
        <Svg width="100%" height={300} viewBox="0 0 330 300">
          <Line x1="20" y1="280" x2="310" y2="280" stroke="#607487" strokeWidth="1" strokeDasharray="5 6" />
          {DISPLAY_BONES.map(([from, to]) => {
            const derived = canvasPoints[from].source === "derived" || canvasPoints[to].source === "derived";
            return (
              <Line
                key={`${from}-${to}`}
                x1={canvasPoints[from].x}
                y1={canvasPoints[from].y}
                x2={canvasPoints[to].x}
                y2={canvasPoints[to].y}
                stroke={derived ? "#8FA2B1" : "#E7EDF1"}
                strokeWidth={derived ? 4 : 6}
                strokeLinecap="round"
              />
            );
          })}
          {DISPLAY_JOINTS.map((joint) => {
            const derived = canvasPoints[joint].source === "derived";
            return (
              <Circle
                key={joint}
                cx={canvasPoints[joint].x}
                cy={canvasPoints[joint].y}
                r={derived ? 5 : 6}
                fill={derived ? "#0B1623" : "#F5F1E8"}
                stroke={derived ? "#B6C2CD" : "#C24122"}
                strokeWidth={derived ? 2 : 1.5}
              />
            );
          })}
        </Svg>
        <View style={styles.legend}>
          <Text style={styles.legendObserved}>● 관측 12</Text>
          <Text style={styles.legendDerived}>○ 표시용 파생 4</Text>
        </View>
      </View>

      <View style={styles.viewRow}>
        {presets.map((preset) => {
          const selected = preset.id === view;
          const focusKey = `view:${preset.id}`;
          return (
            <Pressable
              key={preset.id}
              accessibilityLabel={`${preset.label} 시점 선택`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              focusable
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onPress={() => {
                setView(preset.id);
                setAnnouncement(`${preset.label} 시점`);
              }}
              style={({ pressed }) => [
                styles.viewButton,
                selected && styles.controlSelected,
                getRepresentativeFocusStyle(focusedControl === focusKey, selected ? "selected-navy" : "light"),
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.viewText, selected && styles.controlSelectedText]}>{selected ? "✓ " : ""}{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.markerRow}>
        {validatedProfile.phaseAnchors.map((anchor) => {
          const markerIndex = clampFrameIndex(anchor.phase * LAST_FRAME_INDEX);
          const selected = markerIndex === frameIndex;
          const label = phaseLabel(anchor.id);
          const focusKey = `marker:${anchor.id}`;
          return (
            <Pressable
              key={anchor.id}
              accessibilityLabel={`${label} 위상 ${markerIndex}%로 이동`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              focusable
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onPress={() => seekToIndex(markerIndex, label)}
              style={({ pressed }) => [
                styles.marker,
                selected && styles.markerSelected,
                getRepresentativeFocusStyle(focusedControl === focusKey, "light"),
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.markerSymbol, selected && styles.markerSelectedText]}>{selected ? "◆" : "◇"}</Text>
              <Text numberOfLines={1} style={[styles.markerText, selected && styles.markerSelectedText]}>{label}</Text>
              <Text style={styles.markerPercent}>{markerIndex}%</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityActions={[{ name: "increment", label: "위상 1퍼센트 증가" }, { name: "decrement", label: "위상 1퍼센트 감소" }]}
        accessibilityLabel="대표 동작 위상 슬라이더"
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: false }}
        accessibilityValue={{ min: 0, max: 100, now: frameIndex, text: `${frameIndex}%` }}
        focusable
        onBlur={() => setFocusedControl((current) => current === "slider" ? null : current)}
        onFocus={() => setFocusedControl("slider")}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") seekToIndex(frameIndex + 1);
          if (event.nativeEvent.actionName === "decrement") seekToIndex(frameIndex - 1);
        }}
        onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
        onPress={(event) => seekFromTrack(event.nativeEvent.locationX)}
        style={({ pressed }) => [
          styles.slider,
          getRepresentativeFocusStyle(focusedControl === "slider", "light"),
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.sliderRail} />
        <View style={[styles.sliderFill, { width: `${frameIndex}%` }]} />
        <View style={[styles.sliderThumb, { left: `${frameIndex}%` }]} />
      </Pressable>

      <Pressable
        accessibilityLabel={isPlaying ? "대표 동작 일시정지" : "대표 동작 재생"}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        focusable
        onBlur={() => setFocusedControl((current) => current === "play" ? null : current)}
        onFocus={() => setFocusedControl("play")}
        onPress={togglePlayback}
        style={({ pressed }) => [
          styles.playButton,
          getRepresentativeFocusStyle(focusedControl === "play", "play"),
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.playSymbol}>{isPlaying ? "Ⅱ" : "▶"}</Text>
        <Text style={styles.playText}>{isPlaying ? "일시정지" : "재생"}</Text>
      </Pressable>

      <Text accessibilityLiveRegion="polite" style={styles.announcement}>{announcement}</Text>
      {lifecycle.reducedMotion === true ? (
        <Text style={styles.motionNote}>동작 줄이기 설정으로 자동 재생이 꺼져 있습니다. 재생과 위상 이동은 직접 사용할 수 있습니다.</Text>
      ) : null}
      <Text style={styles.sampleNote}>다섯 위상 표시는 탐색 마커이며, 재생은 저장된 101개 원본 위상 샘플을 순서대로 사용합니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 20, borderWidth: 1, gap: 12, overflow: "hidden", padding: 15 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.2 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 27, marginTop: 2 },
  boundary: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 18, marginTop: 2 },
  percentBadge: { alignItems: "center", backgroundColor: "#102235", borderRadius: 14, minWidth: 68, paddingHorizontal: 10, paddingVertical: 8 },
  percentValue: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 22 },
  percentLabel: { color: "#B6C2CD", fontFamily: "Barlow", fontSize: 9 },
  metaPanel: { backgroundColor: "#EEF4F8", borderRadius: 13, padding: 11 },
  mode: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 17 },
  meta: { color: "#52677B", fontFamily: "Barlow-SemiBold", fontSize: 12, marginTop: 3 },
  qualityPass: { color: "#166534", fontFamily: "Barlow-SemiBold", fontSize: 12, marginTop: 5 },
  qualityRecapture: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 12, marginTop: 5 },
  mirrorConvention: { color: "#52677B", fontFamily: "Barlow", fontSize: 11, lineHeight: 16, marginTop: 5 },
  stage: { backgroundColor: "#0B1623", borderRadius: 15, minHeight: 300, overflow: "hidden" },
  legend: { alignItems: "center", bottom: 9, flexDirection: "row", gap: 12, left: 12, position: "absolute" },
  legendObserved: { color: "#F5F1E8", fontFamily: "Barlow-SemiBold", fontSize: 10 },
  legendDerived: { color: "#B6C2CD", fontFamily: "Barlow-SemiBold", fontSize: 10 },
  viewRow: { flexDirection: "row", gap: 7 },
  viewButton: { alignItems: "center", backgroundColor: "#F5F1E8", borderColor: "#607487", borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 5 },
  controlSelected: { backgroundColor: "#102235", borderColor: "#102235" },
  viewText: { color: "#43596E", fontFamily: "BarlowCondensed-Bold", fontSize: 13 },
  controlSelectedText: { color: "#FFFFFF" },
  markerRow: { flexDirection: "row", gap: 4 },
  marker: { alignItems: "center", borderColor: "#607487", borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 58, minWidth: 44, paddingHorizontal: 2, paddingVertical: 5 },
  markerSelected: { backgroundColor: "#FFF0E8", borderColor: "#9A3412", borderWidth: 2 },
  markerSymbol: { color: "#607487", fontSize: 13 },
  markerText: { color: "#43596E", fontFamily: "BarlowCondensed-Bold", fontSize: 10, marginTop: 1 },
  markerSelectedText: { color: "#9A3412" },
  markerPercent: { color: "#607487", fontFamily: "Barlow", fontSize: 8, marginTop: 1 },
  slider: { justifyContent: "center", minHeight: 44, minWidth: 44, paddingVertical: 12 },
  sliderRail: { backgroundColor: "#607487", borderRadius: 99, height: 6, left: 0, position: "absolute", right: 0 },
  sliderFill: { backgroundColor: "#9A3412", borderRadius: 99, height: 6, left: 0, position: "absolute" },
  sliderThumb: { backgroundColor: "#FFFFFF", borderColor: "#9A3412", borderRadius: 99, borderWidth: 3, height: 22, marginLeft: -11, position: "absolute", width: 22 },
  playButton: { alignItems: "center", backgroundColor: "#9A3412", borderRadius: 13, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, minWidth: 44, paddingHorizontal: 16 },
  playSymbol: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  playText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  announcement: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 11, textAlign: "center" },
  motionNote: { backgroundColor: "#EEF4F8", borderRadius: 9, color: "#43596E", fontFamily: "Barlow", fontSize: 11, lineHeight: 17, padding: 9 },
  sampleNote: { color: "#52677B", fontFamily: "Barlow", fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
