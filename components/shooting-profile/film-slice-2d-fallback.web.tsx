import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { tokens } from "@/constants/tokens";
import { degreesToRadians, orderFilmSlicesForDraw } from "@/lib/film-space/gl-slice-shader";
import type { FilmSpaceCameraV1, FilmSpaceSlicePoseV1 } from "@/lib/film-space/slice-stack";
import type { FilmSliceTextureFrameV1 } from "@/lib/film-space/web-gl-slice-renderer";

type FilmSlice2DFallbackProps = Readonly<{
  frames: readonly FilmSliceTextureFrameV1[];
  slices: readonly FilmSpaceSlicePoseV1[];
  camera: FilmSpaceCameraV1;
  style?: StyleProp<ViewStyle>;
}>;

const MAX_DEVICE_PIXEL_RATIO = 2;
const SLICE_DEPTH_X_PX = 150;
const SLICE_DEPTH_Y_PX = 90;
const PLANE_HEIGHT_FRACTION = 0.72;

/**
 * Bounded 2D-canvas stand-in for the GL stage: the same slice render plan
 * (order, opacity, depth offsets, scale) composited with drawImage. Used when
 * GL is unavailable, lost, or fails, so Film never takes Analysis down.
 */
export function FilmSlice2DFallback({ frames, slices, camera, style }: FilmSlice2DFallbackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestRef = useRef({ frames, slices, camera });
  latestRef.current = { frames, slices, camera };
  const frameRequestRef = useRef<number | null>(null);

  const drawNow = useCallback(() => {
    frameRequestRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { frames: currentFrames, slices: currentSlices, camera: currentCamera } = latestRef.current;
    const width = canvas.width;
    const height = canvas.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = tokens.stage;
    context.fillRect(0, 0, width, height);

    const ratio = width / Math.max(1, canvas.clientWidth || width);
    const yaw = Math.sin(degreesToRadians(currentCamera.yawDegrees));
    const pitch = Math.sin(degreesToRadians(currentCamera.pitchDegrees));
    const planeHeight = height * PLANE_HEIGHT_FRACTION;

    for (const slice of orderFilmSlicesForDraw(currentSlices)) {
      const frame = currentFrames[slice.index];
      if (!frame) continue;
      const aspect = frame.width / Math.max(1, frame.height);
      const drawHeight = planeHeight * slice.scale;
      const drawWidth = drawHeight * aspect;
      const centerX = width / 2 + slice.centeredDepth * SLICE_DEPTH_X_PX * yaw * ratio;
      const centerY = height / 2 + slice.centeredDepth * SLICE_DEPTH_Y_PX * pitch * ratio;
      context.globalAlpha = slice.opacity;
      try {
        context.drawImage(frame.source as CanvasImageSource, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
      } catch {
        // A closed bitmap draws nothing; the stage stays bounded and alive.
      }
    }
    context.globalAlpha = 1;
  }, []);

  const scheduleDraw = useCallback(() => {
    if (typeof requestAnimationFrame !== "function") {
      drawNow();
      return;
    }
    if (frameRequestRef.current !== null) return;
    frameRequestRef.current = requestAnimationFrame(drawNow);
  }, [drawNow]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    scheduleDraw();
  }, [scheduleDraw]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
    observer?.observe(canvas);
    resize();
    return () => {
      observer?.disconnect();
      if (frameRequestRef.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    };
  }, [resize]);

  useEffect(() => {
    scheduleDraw();
  }, [camera, frames, scheduleDraw, slices]);

  return (
    <View style={[styles.host, style]}>
      <canvas
        aria-hidden="true"
        data-hoophub-film-renderer="canvas2d"
        ref={canvasRef}
        style={{ display: "block", height: "100%", width: "100%" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { overflow: "hidden" },
});
