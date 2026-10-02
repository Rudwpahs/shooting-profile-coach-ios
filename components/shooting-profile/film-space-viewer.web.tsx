import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { FilmSlice2DFallback } from "@/components/shooting-profile/film-slice-2d-fallback.web";
import { FilmSliceGLRenderer } from "@/components/shooting-profile/film-slice-gl-renderer.web";
import { tokens } from "@/constants/tokens";
import { disposeFilmSpaceFrames, extractFilmSpaceFrames } from "@/lib/film-space/frame-source.web";
import {
  createFilmSpaceLocalFrameCacheController,
  type FilmSpaceLocalFrameCacheController,
} from "@/lib/film-space/local-frame-cache-lifecycle";
import { resolveFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";
import { createFilmSpaceSliceStack, normalizeFilmSpaceCamera } from "@/lib/film-space/slice-stack";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import { estimateWebFilmCacheBytes, type WebFilmFrameSourceResult } from "@/lib/film-space/web-frame-extraction";
import type { FilmSliceTextureFrameV1 } from "@/lib/film-space/web-gl-slice-renderer";
import { publishFilmSpaceWebMetrics } from "@/lib/film-space/web-metrics";

const STAGE_HEIGHT = 320;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;
const DEFAULT_YAW = -18;
const DEFAULT_PITCH = 7;

type FilmSpaceViewerProps = Readonly<{
  clip: LocalFilmClipRefV1;
  onSourceUnavailable?: (clip: LocalFilmClipRefV1) => void | Promise<void>;
}>;

type ViewerState = { status: "loading" } | WebFilmFrameSourceResult;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Browser Film Space. The user's local clip (an object URL that never leaves
 * this page) is sampled by the shared plan into bounded bitmaps, which the
 * WebGL stage stacks along source time; a 2D canvas takes over if WebGL is
 * missing or lost. Motion and Phase stay available whatever happens here.
 */
export function FilmSpaceViewer({ clip, onSourceUnavailable }: FilmSpaceViewerProps) {
  const plan = useMemo(() => resolveFilmSpaceSamplingPlan(clip.durationMs), [clip.durationMs]);
  const [viewerState, setViewerState] = useState<ViewerState>({ status: "loading" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrubWidth, setScrubWidth] = useState(1);
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const [zoom, setZoom] = useState(1);
  const [glFailed, setGlFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const rotationStart = useRef({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH });
  const scrubStart = useRef(0);
  const sourceUnavailableNotifiedRef = useRef(false);
  const loadStartedAtRef = useRef(0);
  const metricsRef = useRef<{ sliceCount: number; extractionMs: number; approxCacheBytes: number } | null>(null);
  const cacheControllerRef = useRef<FilmSpaceLocalFrameCacheController<WebFilmFrameSourceResult> | null>(null);
  if (!cacheControllerRef.current) {
    cacheControllerRef.current = createFilmSpaceLocalFrameCacheController<WebFilmFrameSourceResult>(
      extractFilmSpaceFrames,
      disposeFilmSpaceFrames,
    );
  }
  const cacheController = cacheControllerRef.current;

  useEffect(() => () => {
    void cacheController.dispose();
  }, [cacheController]);

  useEffect(() => {
    let active = true;
    setViewerState({ status: "loading" });
    setSelectedIndex(0);
    setGlFailed(false);
    metricsRef.current = null;
    sourceUnavailableNotifiedRef.current = false;

    const notifySourceUnavailable = () => {
      if (sourceUnavailableNotifiedRef.current) return;
      sourceUnavailableNotifiedRef.current = true;
      if (onSourceUnavailable) void onSourceUnavailable(clip);
    };

    if (!plan) {
      setViewerState({ status: "unavailable", reason: "source_unavailable" });
      notifySourceUnavailable();
      return () => {
        active = false;
        cacheController.suspend();
      };
    }

    // Tab hidden or app backgrounded: stop decoding, drop the bitmaps, say so. A visible tab can ask again.
    const onVisibilityChange = () => {
      if (typeof document === "undefined" || !document.hidden || !active) return;
      cacheController.suspend();
      setViewerState({ status: "cancelled" });
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

    loadStartedAtRef.current = now();
    void cacheController.load(clip, plan).then((result) => {
      if (!active) return;
      if (result.status === "unavailable" && result.reason === "source_unavailable") notifySourceUnavailable();
      if (result.status === "ready") {
        metricsRef.current = {
          sliceCount: result.frames.length,
          extractionMs: now() - loadStartedAtRef.current,
          approxCacheBytes: estimateWebFilmCacheBytes(result),
        };
      }
      setViewerState(result);
    });

    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
      active = false;
      cacheController.suspend();
    };
  }, [cacheController, clip, onSourceUnavailable, plan, reloadToken]);

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

  const frameCount = viewerState.status === "ready" ? viewerState.frames.length : 0;
  const seekFromX = useCallback((locationX: number) => {
    const fraction = Math.max(0, Math.min(1, locationX / Math.max(1, scrubWidth)));
    setSelectedIndex(Math.round(fraction * Math.max(0, frameCount - 1)));
  }, [frameCount, scrubWidth]);

  const scrubResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      scrubStart.current = event.nativeEvent.locationX;
      seekFromX(event.nativeEvent.locationX);
    },
    onPanResponderMove: (_, gesture) => {
      seekFromX(scrubStart.current + gesture.dx);
    },
  }), [seekFromX]);

  const textureFrames = useMemo<readonly FilmSliceTextureFrameV1[] | null>(
    () => (viewerState.status === "ready"
      ? viewerState.frames.map((frame) => ({ source: frame.imageRef.source, width: frame.width, height: frame.height }))
      : null),
    [viewerState],
  );

  const renderer: "webgl" | "canvas2d" = glFailed ? "canvas2d" : "webgl";
  const publishMetrics = useCallback((textureReadyMs: number | null) => {
    const base = metricsRef.current;
    if (!base || !plan) return;
    publishFilmSpaceWebMetrics({
      version: "film_space_web_metrics_v1",
      sourceSlotId: clip.slotId,
      sliceCount: base.sliceCount,
      durationMs: plan.durationMs,
      targetLongEdgePx: plan.targetLongEdgePx,
      extractionMs: Math.round(base.extractionMs),
      approxCacheBytes: base.approxCacheBytes,
      textureReadyMs: textureReadyMs === null ? null : Math.round(textureReadyMs),
      firstVisibleMs: Math.round(now() - loadStartedAtRef.current),
      renderer,
    });
  }, [clip.slotId, plan, renderer]);

  useEffect(() => {
    if (glFailed && viewerState.status === "ready") publishMetrics(null);
  }, [glFailed, publishMetrics, viewerState.status]);

  if (viewerState.status === "loading") {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={tokens.mutedForeground} />
        <Text style={styles.stateCopy}>로컬 영상 프레임을 브라우저 안에서 준비하는 중</Text>
      </View>
    );
  }

  if (viewerState.status !== "ready") {
    const unavailable = viewerState.status === "unavailable";
    const unsupported = viewerState.status === "unsupported_platform";
    const cancelled = viewerState.status === "cancelled";
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>
          {unavailable
            ? "로컬 원본 영상을 사용할 수 없습니다"
            : unsupported
              ? "이 브라우저에서는 Film Space를 지원하지 않습니다"
              : "Film Space 준비가 중단되었습니다"}
        </Text>
        <Text style={styles.stateCopy}>
          {unavailable
            ? "영상을 다시 읽을 수 없거나 브라우저 안에서 프레임을 만들 수 없습니다. Motion과 Phase는 계속 사용할 수 있습니다."
            : unsupported
              ? "영상 프레임 추출을 지원하는 최신 브라우저가 필요합니다. Motion과 Phase는 계속 사용할 수 있습니다."
              : "탭이 가려지거나 다른 클립으로 바뀌어 프레임 준비를 멈췄습니다. Motion과 Phase는 계속 사용할 수 있습니다."}
        </Text>
        {cancelled ? (
          <Pressable
            accessibilityLabel="Film Space 다시 준비"
            accessibilityRole="button"
            onPress={() => setReloadToken((token) => token + 1)}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>다시 준비</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const frames = viewerState.frames;
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, frames.length - 1));
  const selectedFrame = frames[safeSelectedIndex];
  const renderCamera = normalizeFilmSpaceCamera({ yawDegrees: yaw, pitchDegrees: pitch, zoom });
  const sliceStack = createFilmSpaceSliceStack(frames.length, safeSelectedIndex, renderCamera);

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel="Film Space 로컬 영상 시간 슬라이스. 드래그하여 회전"
        accessibilityRole="image"
        style={styles.stage}
        {...rotationResponder.panHandlers}
      >
        {textureFrames && !glFailed ? (
          <FilmSliceGLRenderer
            camera={renderCamera}
            frames={textureFrames}
            onRendererError={() => setGlFailed(true)}
            onTexturesReady={(readyMs) => publishMetrics(readyMs)}
            slices={sliceStack}
            style={styles.glStage}
          />
        ) : textureFrames ? (
          <FilmSlice2DFallback camera={renderCamera} frames={textureFrames} slices={sliceStack} style={styles.glStage} />
        ) : null}
        <View style={styles.zoomControls}>
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
            onPress={() => { setYaw(DEFAULT_YAW); setPitch(DEFAULT_PITCH); setZoom(1); }}
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
          {" · "}슬라이스 {safeSelectedIndex + 1}/{frames.length}
        </Text>
      </View>
      <View
        accessibilityLabel="Film Space 로컬 영상 시간 scrub 슬라이더"
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: Math.max(0, frames.length - 1), now: safeSelectedIndex }}
        onLayout={(event) => setScrubWidth(event.nativeEvent.layout.width)}
        style={styles.scrubTrack}
        {...scrubResponder.panHandlers}
      >
        <View style={styles.scrubRail} />
        <View
          style={[
            styles.scrubFill,
            { width: `${frames.length <= 1 ? 0 : (safeSelectedIndex / (frames.length - 1)) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.boundaryCopy}>
        로컬 원본 영상의 시간 슬라이스 시각화 · 대표 슛 Phase와 동기화되지 않음 · 화면 깊이처럼 배치한 표현일 뿐 측정된 3D 또는 실제 4D가 아님 · 브라우저 밖으로 영상이 나가지 않음
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: tokens.background },
  stage: { backgroundColor: tokens.stage, height: STAGE_HEIGHT, overflow: "hidden", position: "relative" },
  glStage: { height: "100%", width: "100%" },
  zoomControls: { pointerEvents: "box-none", position: "absolute", right: 6, top: 6 },
  iconButton: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: "center", marginBottom: 4, minHeight: 44, minWidth: 44, width: 44 },
  pressed: { opacity: 0.62 },
  stateBox: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "center", minHeight: 220, padding: 24 },
  stateTitle: { color: tokens.stageForeground, fontSize: 16, fontWeight: "700", textAlign: "center" },
  stateCopy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 420, textAlign: "center" },
  retryButton: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", marginTop: 14, minHeight: 44, minWidth: 120, paddingHorizontal: 16 },
  retryText: { color: tokens.stageForeground, fontSize: 13, fontWeight: "600" },
  axisHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10 },
  axisTitle: { color: tokens.foreground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  timeValue: { color: tokens.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] },
  scrubTrack: { height: 44, justifyContent: "center", marginHorizontal: 14, minHeight: 44, minWidth: 44 },
  scrubRail: { backgroundColor: tokens.border, borderRadius: 1, height: 2, left: 0, position: "absolute", right: 0 },
  scrubFill: { backgroundColor: tokens.primary, borderRadius: 1, height: 2, left: 0, position: "absolute" },
  boundaryCopy: { color: tokens.mutedForeground, fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 10 },
});
