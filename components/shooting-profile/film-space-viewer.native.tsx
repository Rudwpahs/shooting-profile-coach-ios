import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { tokens } from "@/constants/tokens";
import {
  disposeFilmSpaceFrames,
  extractFilmSpaceFrames,
} from "@/lib/film-space/frame-source.native";
import { createFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

const STAGE_HEIGHT = 320;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;

type FilmSpaceViewerProps = Readonly<{
  clip: LocalFilmClipRefV1;
}>;

type LoadedState = Awaited<ReturnType<typeof extractFilmSpaceFrames>>;
type ViewerState = { status: "loading" } | LoadedState;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function FilmSpaceViewer({ clip }: FilmSpaceViewerProps) {
  const plan = useMemo(
    () => createFilmSpaceSamplingPlan(clip.durationMs),
    [clip.durationMs],
  );
  const [viewerState, setViewerState] = useState<ViewerState>({ status: "loading" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrubWidth, setScrubWidth] = useState(1);
  const [yaw, setYaw] = useState(-18);
  const [pitch, setPitch] = useState(7);
  const [zoom, setZoom] = useState(1);
  const rotationStart = useRef({ yaw: -18, pitch: 7 });
  const readyCacheRef = useRef<Extract<LoadedState, { status: "ready" }> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setViewerState({ status: "loading" });
    setSelectedIndex(0);
    readyCacheRef.current = null;
    void extractFilmSpaceFrames(clip, plan, controller.signal).then((result) => {
      if (!active) {
        if (result.status === "ready") void disposeFilmSpaceFrames(result);
        return;
      }
      if (result.status === "ready") readyCacheRef.current = result;
      setViewerState(result);
    });
    return () => {
      active = false;
      controller.abort();
      const cache = readyCacheRef.current;
      readyCacheRef.current = null;
      if (cache) void disposeFilmSpaceFrames(cache);
    };
  }, [clip, plan]);

  const rotationResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      rotationStart.current = { yaw, pitch };
    },
    onPanResponderMove: (_, gesture) => {
      setYaw(rotationStart.current.yaw + gesture.dx * 0.25);
      setPitch(Math.max(-24, Math.min(24, rotationStart.current.pitch - gesture.dy * 0.15)));
    },
  }), [pitch, yaw]);

  if (viewerState.status === "loading") {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={tokens.mutedForeground} />
        <Text style={styles.stateCopy}>로컬 Film Space 프레임을 준비하는 중</Text>
      </View>
    );
  }

  if (viewerState.status !== "ready") {
    const unavailable = viewerState.status === "unavailable";
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>
          {unavailable ? "로컬 원본 영상을 사용할 수 없습니다" : "이 기기에서 Film Space를 사용할 수 없습니다"}
        </Text>
        <Text style={styles.stateCopy}>
          {unavailable
            ? "영상이 삭제되었거나 로컬 캐시에서 사라졌습니다. Motion과 Phase는 계속 사용할 수 있습니다."
            : "Film Space 준비가 취소되었거나 현재 플랫폼에서 지원되지 않습니다."}
        </Text>
      </View>
    );
  }

  const frames = viewerState.frames;
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, frames.length - 1));
  const selectedFrame = frames[safeSelectedIndex];
  const seekFromX = (locationX: number) => {
    const fraction = Math.max(0, Math.min(1, locationX / Math.max(1, scrubWidth)));
    setSelectedIndex(Math.round(fraction * Math.max(0, frames.length - 1)));
  };

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel="Film Space 로컬 영상 시간 슬라이스. 드래그하여 회전"
        accessibilityRole="image"
        style={styles.stage}
        {...rotationResponder.panHandlers}
      >
        {frames.map((frame, index) => {
          const depth = frames.length <= 1 ? 0 : index / (frames.length - 1);
          const selected = index === safeSelectedIndex;
          return (
            <Image
              key={`${frame.requestedTimestampMs}-${index}`}
              contentFit="contain"
              source={frame.imageRef}
              style={[
                styles.slice,
                {
                  opacity: selected ? 0.92 : 0.035,
                  transform: [
                    { perspective: 780 },
                    { rotateY: `${yaw}deg` },
                    { rotateX: `${pitch}deg` },
                    { translateY: (depth - 0.5) * 110 },
                    { scale: zoom * (0.82 + depth * 0.18) },
                  ],
                  zIndex: selected ? frames.length + 1 : index,
                },
              ]}
            />
          );
        })}
        <View pointerEvents="box-none" style={styles.zoomControls}>
          <Pressable
            accessibilityLabel="Film Space 확대"
            accessibilityRole="button"
            onPress={() => setZoom((current) => clampZoom(current + 0.1))}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="plus" color={tokens.stageForeground} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="Film Space 축소"
            accessibilityRole="button"
            onPress={() => setZoom((current) => clampZoom(current - 0.1))}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="minus" color={tokens.stageForeground} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="Film Space 시점 초기화"
            accessibilityRole="button"
            onPress={() => { setYaw(-18); setPitch(7); setZoom(1); }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="restore" color={tokens.stageForeground} size={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.axisHeader}>
        <Text style={styles.axisTitle}>SOURCE TIME</Text>
        <Text style={styles.timeValue}>
          {(selectedFrame.requestedTimestampMs / 1000).toFixed(2)}s / {(clip.durationMs / 1000).toFixed(2)}s
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Film Space 로컬 영상 시간 scrub 슬라이더"
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, frames.length - 1),
          now: safeSelectedIndex,
        }}
        onLayout={(event) => setScrubWidth(event.nativeEvent.layout.width)}
        onPress={(event) => seekFromX(event.nativeEvent.locationX)}
        onTouchMove={(event) => seekFromX(event.nativeEvent.locationX)}
        style={styles.scrubTrack}
      >
        <View style={styles.scrubRail} />
        <View
          style={[
            styles.scrubFill,
            { width: `${frames.length <= 1 ? 0 : (safeSelectedIndex / (frames.length - 1)) * 100}%` },
          ]}
        />
      </Pressable>
      <Text style={styles.boundaryCopy}>
        로컬 원본 영상의 시간축 · 대표 슛 Phase와 동기화되지 않음 · 서버 업로드 없음
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: tokens.background },
  stage: { backgroundColor: tokens.stage, height: STAGE_HEIGHT, overflow: "hidden", position: "relative" },
  slice: { height: 230, left: 45, position: "absolute", top: 44, width: 240 },
  zoomControls: { position: "absolute", right: 6, top: 6 },
  iconButton: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: "center", marginBottom: 4, minHeight: 44, minWidth: 44, width: 44 },
  pressed: { opacity: 0.62 },
  stateBox: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "center", minHeight: 220, padding: 24 },
  stateTitle: { color: tokens.stageForeground, fontSize: 16, fontWeight: "700", textAlign: "center" },
  stateCopy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 420, textAlign: "center" },
  axisHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10 },
  axisTitle: { color: tokens.foreground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  timeValue: { color: tokens.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] },
  scrubTrack: { height: 44, justifyContent: "center", marginHorizontal: 14, minHeight: 44, minWidth: 44 },
  scrubRail: { backgroundColor: tokens.border, borderRadius: 1, height: 2, left: 0, position: "absolute", right: 0 },
  scrubFill: { backgroundColor: tokens.primary, borderRadius: 1, height: 2, left: 0, position: "absolute" },
  boundaryCopy: { color: tokens.mutedForeground, fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 10 },
});