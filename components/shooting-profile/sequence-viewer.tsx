import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
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
import { tokens } from "@/constants/tokens";

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
  /** Accepted for callers that pass the record whole; the percentage is shown by the analysis route's detail layer, not here. */
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
export const DISPLAY_BONES: readonly (readonly [RepresentativeDisplayJointName, RepresentativeDisplayJointName])[] = [
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
  let outlineColor = tokens.focusRing;
  let shadowColor = tokens.primary;
  if (surface === "play") {
    outlineColor = tokens.focusRing;
    shadowColor = tokens.background;
  } else if (surface === "selected-navy") {
    outlineColor = tokens.primary;
    shadowColor = tokens.foreground;
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
  return projectRepresentativeJointsAtYaw(frame, preset.yaw, shootingHand);
}

/**
 * The same projection at any yaw in degrees; the presets are named yaws of
 * this function. A left-handed profile is mirrored before the rotation so
 * the shooting side reads the same way for both hands.
 */
export function projectRepresentativeJointsAtYaw(
  frame: RepresentativePoseFrameV2,
  yawDegrees: number,
  shootingHand: ShootingHandV2,
): Record<RepresentativeDisplayJointName, ProjectedJoint> {
  if (!Number.isFinite(yawDegrees)) throw new Error("representative yaw must be finite");
  const mirrorX = shootingHand === "left";
  const yaw = yawDegrees * Math.PI / 180;
  const pitch = 8 * Math.PI / 180;
  const display = buildRepresentativeDisplayJoints(frame);
  return Object.fromEntries(DISPLAY_JOINTS.map((joint) => {
    const point = display[joint];
    const sourceX = mirrorX ? -point.x : point.x;
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
  shootingHand = "right",
}: SequenceViewerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [view, setView] = useState<RepresentativeViewId>("oblique");
  const [lifecycle, setLifecycle] = useState(createRepresentativePlaybackLifecycle);
  const [sliderWidth, setSliderWidth] = useState(1);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const animationFrame = useRef<number | null>(null);
  const lifecycleRef = useRef(lifecycle);
  const announce = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
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

  useEffect(() => {
    const reconcileAppState = (nextState: AppStateStatus) => {
      applyLifecycleEvent({ type: "app-state", value: nextState });
    };
    const subscription = AppState.addEventListener("change", reconcileAppState);
    reconcileAppState(AppState.currentState);
    return () => subscription?.remove?.();
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
      subscription?.remove?.();
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
    announce(`${message}(으)로 이동`);
  }, [announce, applyLifecycleEvent]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      applyLifecycleEvent({ type: "pause" });
      announce(`${frameIndex}% 위상에서 일시정지`);
      return;
    }
    applyLifecycleEvent({ type: "explicit-play" });
    announce("대표 동작 재생");
  }, [announce, applyLifecycleEvent, frameIndex, isPlaying]);

  const seekFromTrack = useCallback((locationX: number) => {
    seekToIndex(Math.round(Math.max(0, Math.min(1, locationX / Math.max(1, sliderWidth))) * LAST_FRAME_INDEX));
  }, [seekToIndex, sliderWidth]);

  const anchorMarkers = validatedProfile.phaseAnchors.map((anchor) => ({
    id: anchor.id,
    label: phaseLabel(anchor.id),
    index: clampFrameIndex(anchor.phase * LAST_FRAME_INDEX),
  }));
  const progressPercent = Math.round((frameIndex / LAST_FRAME_INDEX) * 100);
  const snapToAnchor = (index: number, label: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    seekToIndex(index, label);
  };

  return (
    <View style={styles.player}>
      <View
        accessible
        accessibilityLabel={`${selectedView.label}, ${frameIndex}% 위상 대표 골격 이미지, 관측 관절 12개와 표시용 파생 관절 4개`}
        accessibilityRole="image"
        style={styles.stage}
      >
        <Svg width="100%" height={STAGE_HEIGHT} viewBox={`0 0 330 ${STAGE_HEIGHT}`}>
          <Line x1="20" y1="280" x2="310" y2="280" stroke={tokens.skeletonDerived} strokeWidth="1" strokeDasharray="5 6" />
          {DISPLAY_BONES.map(([from, to]) => {
            const derived = canvasPoints[from].source === "derived" || canvasPoints[to].source === "derived";
            const arm = ARM_JOINTS[shootingHand].includes(from) && ARM_JOINTS[shootingHand].includes(to);
            return (
              <Line
                key={`${from}-${to}`}
                x1={canvasPoints[from].x}
                y1={canvasPoints[from].y}
                x2={canvasPoints[to].x}
                y2={canvasPoints[to].y}
                stroke={arm ? tokens.skeletonSecondary : derived ? tokens.skeletonDerived : tokens.skeletonPrimary}
                strokeWidth={derived ? 4 : arm ? 7 : 6}
                strokeLinecap="round"
              />
            );
          })}
          {DISPLAY_JOINTS.map((joint) => {
            const derived = canvasPoints[joint].source === "derived";
            const arm = ARM_JOINTS[shootingHand].includes(joint);
            return (
              <Circle
                key={joint}
                cx={canvasPoints[joint].x}
                cy={canvasPoints[joint].y}
                r={derived ? 5 : 6}
                fill={derived ? tokens.stage : arm ? tokens.skeletonSecondary : tokens.skeletonPrimary}
                stroke={derived ? tokens.skeletonDerived : arm ? tokens.skeletonSecondary : tokens.skeletonPrimary}
                strokeWidth={derived ? 2 : 1.5}
              />
            );
          })}
        </Svg>
      </View>

      <Pressable
        accessibilityLabel={isPlaying ? "대표 동작 일시정지" : "대표 동작 재생"}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        focusable
        onBlur={() => setFocusedControl((current) => current === "play" ? null : current)}
        onFocus={() => setFocusedControl("play")}
        onPress={togglePlayback}
        style={({ pressed }) => [
          styles.stageTap,
          getRepresentativeFocusStyle(focusedControl === "play", "play"),
          pressed && styles.stagePressed,
        ]}
      >
        {!isPlaying ? (
          <View style={styles.pausedGlyph}>
            <MaterialCommunityIcons name="play" size={30} color={tokens.stageForeground} />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.viewDots}>
        {presets.map((preset) => {
          const selected = preset.id === view;
          const focusKey = `view:${preset.id}`;
          return (
            <Pressable
              key={preset.id}
              accessibilityLabel={`${preset.label} 시점 선택`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-selected={selected}
              focusable
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onPress={() => {
                setView(preset.id);
                announce(`${preset.label} 시점`);
              }}
              style={({ pressed }) => [
                styles.viewDotTarget,
                getRepresentativeFocusStyle(focusedControl === focusKey, "light"),
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.viewDot, selected && styles.viewDotSelected]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.progressArea}>
        <Pressable
          accessibilityActions={[{ name: "increment", label: "위상 1퍼센트 증가" }, { name: "decrement", label: "위상 1퍼센트 감소" }]}
          accessibilityLabel="대표 동작 위상 슬라이더"
          accessibilityRole="adjustable"
          accessibilityState={{ disabled: false }}
          accessibilityValue={{ min: 0, max: 100, now: frameIndex, text: `${frameIndex}%` }}
          focusable
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") seekToIndex(frameIndex + 1);
            if (event.nativeEvent.actionName === "decrement") seekToIndex(frameIndex - 1);
          }}
          onBlur={() => setFocusedControl((current) => current === "slider" ? null : current)}
          onFocus={() => setFocusedControl("slider")}
          onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
          onPress={(event) => seekFromTrack(event.nativeEvent.locationX)}
          onTouchMove={(event) => seekFromTrack(event.nativeEvent.locationX)}
          style={[styles.track, getRepresentativeFocusStyle(focusedControl === "slider", "light")]}
        >
          <View style={styles.trackRail} />
          <View style={[styles.trackFill, { width: `${progressPercent}%` }]} />
        </Pressable>
        {anchorMarkers.map((marker) => {
          const selected = marker.index === frameIndex;
          const focusKey = `marker:${marker.id}`;
          return (
            <Pressable
              key={marker.id}
              accessibilityLabel={`${marker.label} 위상 ${marker.index}%로 이동`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-selected={selected}
              focusable
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onPress={() => snapToAnchor(marker.index, marker.label)}
              style={({ pressed }) => [
                styles.anchorTarget,
                { left: `${marker.index}%` },
                getRepresentativeFocusStyle(focusedControl === focusKey, "light"),
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.anchorDot, selected && styles.anchorDotSelected]} />
            </Pressable>
          );
        })}
      </View>

      {lifecycle.reducedMotion === true ? (
        <Text style={styles.motionNote}>동작 줄이기 · 탭하면 재생, 점을 누르면 위상 이동</Text>
      ) : null}
    </View>
  );
}

const STAGE_HEIGHT = 300;
const ARM_JOINTS: Record<ShootingHandV2, readonly RepresentativeDisplayJointName[]> = {
  right: ["rightShoulder", "rightElbow", "rightWrist"],
  left: ["leftShoulder", "leftElbow", "leftWrist"],
};

const styles = StyleSheet.create({
  player: { backgroundColor: tokens.background, position: "relative" },
  stage: { backgroundColor: tokens.stage, height: STAGE_HEIGHT, overflow: "hidden" },
  stageTap: { alignItems: "center", height: STAGE_HEIGHT, justifyContent: "center", left: 0, minHeight: 44, minWidth: 44, position: "absolute", right: 0, top: 0 },
  stagePressed: { opacity: 0.92 },
  pausedGlyph: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 32, borderWidth: 1, height: 64, justifyContent: "center", opacity: 0.94, paddingLeft: 4, width: 64 },
  viewDots: { flexDirection: "row", position: "absolute", right: 2, top: 2 },
  viewDotTarget: { alignItems: "center", height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  viewDot: { backgroundColor: tokens.stageForeground, borderRadius: 4, height: 7, opacity: 0.35, width: 7 },
  viewDotSelected: { backgroundColor: tokens.skeletonSecondary, opacity: 1 },
  progressArea: { height: 44, justifyContent: "center", marginHorizontal: 14, position: "relative" },
  track: { height: 44, justifyContent: "center", minHeight: 44, minWidth: 44 },
  trackRail: { backgroundColor: tokens.border, borderRadius: 1, height: 2, left: 0, position: "absolute", right: 0 },
  trackFill: { backgroundColor: tokens.primary, borderRadius: 1, height: 2, left: 0, position: "absolute" },
  anchorTarget: { alignItems: "center", height: 44, justifyContent: "center", marginLeft: -22, minHeight: 44, minWidth: 44, position: "absolute", top: 0, width: 44 },
  anchorDot: { backgroundColor: tokens.stageForeground, borderRadius: 3, height: 6, opacity: 0.55, width: 6 },
  anchorDotSelected: { backgroundColor: tokens.primary, borderRadius: 5, height: 10, opacity: 1, width: 10 },
  motionNote: { color: tokens.mutedForeground, fontSize: 12, paddingHorizontal: 14, paddingTop: 2 },
  pressed: { opacity: 0.6 },
});
