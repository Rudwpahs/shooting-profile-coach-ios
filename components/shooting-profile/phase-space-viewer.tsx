import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  DISPLAY_BONES,
  type RepresentativeDisplayJointName,
  type RepresentativeViewId,
} from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import {
  buildPhaseSpaceGeometry,
  projectPhaseSpacePoint,
  type PhaseSpaceAnchorId,
  type PhaseSpaceCamera,
} from "@/lib/phase-space/geometry";
import {
  clampPhaseSpacePitch,
  clampPhaseSpaceZoom,
  phaseIndexFromScrub,
} from "@/lib/phase-space/interaction";
import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

const STAGE_WIDTH = 330;
const STAGE_HEIGHT = 320;
const DEFAULT_CAMERA: PhaseSpaceCamera = Object.freeze({
  yawDegrees: -28,
  pitchDegrees: 14,
  zoom: 1,
});

const ANCHOR_LABELS: Readonly<Record<PhaseSpaceAnchorId, string>> = {
  ready: "준비",
  deepestDip: "딥",
  rise: "상승",
  releaseProxy: "릴리스 추정",
  followThrough: "팔로우스루",
};

const TRAJECTORY_JOINTS: readonly PersistedJointNameV2[] = [
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
];

type PhaseSpaceViewerProps = {
  profile: RepresentativePose4DV2;
  shootingHand?: ShootingHandV2;
  sourceView?: RepresentativeViewId;
  highlightJoint?: PersistedJointNameV2;
};

export function PhaseSpaceViewer({
  profile,
  shootingHand = "right",
  sourceView = "oblique",
  highlightJoint,
}: PhaseSpaceViewerProps) {
  const geometry = useMemo(
    () => buildPhaseSpaceGeometry(profile, sourceView, shootingHand, 11),
    [profile, shootingHand, sourceView],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [camera, setCamera] = useState<PhaseSpaceCamera>(DEFAULT_CAMERA);
  const [scrubWidth, setScrubWidth] = useState(1);
  const rotationStartRef = useRef(DEFAULT_CAMERA);

  const rotationResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      rotationStartRef.current = camera;
    },
    onPanResponderMove: (_, gesture) => {
      const start = rotationStartRef.current;
      setCamera({
        yawDegrees: start.yawDegrees + gesture.dx * 0.35,
        pitchDegrees: clampPhaseSpacePitch(start.pitchDegrees - gesture.dy * 0.25),
        zoom: start.zoom,
      });
    },
  }), [camera]);

  const currentFrame = geometry.frames[frameIndex];
  const project = (point: { x: number; y: number; z: number }) => (
    projectPhaseSpacePoint(point, camera, STAGE_WIDTH, STAGE_HEIGHT)
  );
  const currentProjected = Object.fromEntries(
    Object.entries(currentFrame.joints).map(([joint, point]) => [joint, project(point)]),
  ) as Record<RepresentativeDisplayJointName, { x: number; y: number; depth: number }>;

  const seekFromScrub = (locationX: number) => {
    const fraction = locationX / Math.max(1, scrubWidth);
    setFrameIndex(phaseIndexFromScrub(fraction));
  };

  const adjustZoom = (delta: number) => {
    setCamera((current) => ({ ...current, zoom: clampPhaseSpaceZoom(current.zoom + delta) }));
  };

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel={`Phase Space, ${frameIndex}% 정규화 슛 단계. 좌우 드래그로 회전`}
        accessibilityRole="image"
        style={styles.stage}
        {...rotationResponder.panHandlers}
      >
        <Svg width="100%" height={STAGE_HEIGHT} viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}>
          {TRAJECTORY_JOINTS.map((joint) => {
            const points = geometry.trajectories[joint]
              .map((point) => {
                const projected = project(point);
                return `${projected.x},${projected.y}`;
              })
              .join(" ");
            return (
              <Polyline
                key={`trajectory-${joint}`}
                fill="none"
                opacity={joint === highlightJoint ? 0.68 : 0.25}
                points={points}
                stroke={joint === highlightJoint ? tokens.primary : tokens.skeletonDerived}
                strokeWidth={joint === highlightJoint ? 2 : 1}
              />
            );
          })}

          {geometry.ghostFrameIndices.map((ghostIndex) => {
            const ghostFrame = geometry.frames[ghostIndex];
            const ghostProjected = Object.fromEntries(
              Object.entries(ghostFrame.joints).map(([joint, point]) => [joint, project(point)]),
            ) as Record<RepresentativeDisplayJointName, { x: number; y: number; depth: number }>;
            return DISPLAY_BONES.map(([from, to]) => (
              <Line
                key={`ghost-${ghostIndex}-${from}-${to}`}
                x1={ghostProjected[from].x}
                y1={ghostProjected[from].y}
                x2={ghostProjected[to].x}
                y2={ghostProjected[to].y}
                opacity={ghostIndex === frameIndex ? 0.22 : 0.1}
                stroke={tokens.skeletonDerived}
                strokeLinecap="round"
                strokeWidth={2}
              />
            ));
          })}

          {DISPLAY_BONES.map(([from, to]) => (
            <Line
              key={`current-${from}-${to}`}
              x1={currentProjected[from].x}
              y1={currentProjected[from].y}
              x2={currentProjected[to].x}
              y2={currentProjected[to].y}
              stroke={tokens.skeletonPrimary}
              strokeLinecap="round"
              strokeWidth={4}
            />
          ))}
          {Object.entries(currentProjected).map(([joint, point]) => (
            <Circle
              key={`current-joint-${joint}`}
              cx={point.x}
              cy={point.y}
              fill={joint === highlightJoint ? tokens.primary : tokens.stage}
              r={joint === highlightJoint ? 5 : 3.5}
              stroke={joint === highlightJoint ? tokens.primary : tokens.skeletonPrimary}
              strokeWidth={1.5}
            />
          ))}
        </Svg>

        <View pointerEvents="box-none" style={styles.zoomControls}>
          <Pressable
            accessibilityLabel="Phase Space 확대"
            accessibilityRole="button"
            onPress={() => adjustZoom(0.1)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="plus" color={tokens.stageForeground} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="Phase Space 축소"
            accessibilityRole="button"
            onPress={() => adjustZoom(-0.1)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="minus" color={tokens.stageForeground} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="Phase Space 시점 초기화"
            accessibilityRole="button"
            onPress={() => setCamera(DEFAULT_CAMERA)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="restore" color={tokens.stageForeground} size={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.axisHeader}>
        <Text style={styles.axisTitle}>SHOT PHASE</Text>
        <Text style={styles.phaseValue}>{frameIndex}%</Text>
      </View>
      <View style={styles.scrubArea}>
        <Pressable
          accessibilityActions={[
            { name: "increment", label: "슛 단계 1퍼센트 증가" },
            { name: "decrement", label: "슛 단계 1퍼센트 감소" },
          ]}
          accessibilityLabel="Phase Space 정규화 슛 단계 scrub 슬라이더"
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: 100, now: frameIndex, text: `${frameIndex}%` }}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") setFrameIndex(Math.min(100, frameIndex + 1));
            if (event.nativeEvent.actionName === "decrement") setFrameIndex(Math.max(0, frameIndex - 1));
          }}
          onLayout={(event) => setScrubWidth(event.nativeEvent.layout.width)}
          onPress={(event) => seekFromScrub(event.nativeEvent.locationX)}
          onTouchMove={(event) => seekFromScrub(event.nativeEvent.locationX)}
          style={styles.scrubTrack}
        >
          <View style={styles.scrubRail} />
          <View style={[styles.scrubFill, { width: `${frameIndex}%` }]} />
        </Pressable>
        {geometry.anchors.map((anchor) => (
          <Pressable
            key={anchor.id}
            accessibilityLabel={`${ANCHOR_LABELS[anchor.id]} ${anchor.frameIndex}% 단계로 이동`}
            accessibilityRole="button"
            onPress={() => setFrameIndex(anchor.frameIndex)}
            style={[styles.anchorTarget, { left: `${Math.round(anchor.phase * 100)}%` }]}
          >
            <View style={[styles.anchorDot, frameIndex === anchor.frameIndex && styles.anchorDotSelected]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.anchorLabels}>
        <Text style={styles.anchorLabel}>ready</Text>
        <Text style={styles.anchorLabel}>deepestDip</Text>
        <Text style={styles.anchorLabel}>rise</Text>
        <Text style={styles.anchorLabel}>releaseProxy</Text>
        <Text style={styles.anchorLabel}>followThrough</Text>
      </View>
      <Text style={styles.boundaryCopy}>
        101개 정규화 슛 단계 · 동기화 시간축이 아님 · 계측 4D가 아님
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: tokens.background },
  stage: { backgroundColor: tokens.stage, height: STAGE_HEIGHT, overflow: "hidden", position: "relative" },
  zoomControls: { position: "absolute", right: 6, top: 6 },
  iconButton: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: "center", marginBottom: 4, minHeight: 44, minWidth: 44, width: 44 },
  pressed: { opacity: 0.62 },
  axisHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10 },
  axisTitle: { color: tokens.foreground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  phaseValue: { color: tokens.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] },
  scrubArea: { height: 44, marginHorizontal: 14, position: "relative" },
  scrubTrack: { height: 44, justifyContent: "center", minHeight: 44, minWidth: 44 },
  scrubRail: { backgroundColor: tokens.border, borderRadius: 1, height: 2, left: 0, position: "absolute", right: 0 },
  scrubFill: { backgroundColor: tokens.primary, borderRadius: 1, height: 2, left: 0, position: "absolute" },
  anchorTarget: { alignItems: "center", height: 44, justifyContent: "center", marginLeft: -22, minHeight: 44, minWidth: 44, position: "absolute", top: 0, width: 44 },
  anchorDot: { backgroundColor: tokens.stageForeground, borderRadius: 3, height: 6, opacity: 0.5, width: 6 },
  anchorDotSelected: { backgroundColor: tokens.primary, borderRadius: 5, height: 10, opacity: 1, width: 10 },
  anchorLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14 },
  anchorLabel: { color: tokens.mutedForeground, fontSize: 9, maxWidth: 64, textAlign: "center" },
  boundaryCopy: { color: tokens.mutedForeground, fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingVertical: 10 },
});