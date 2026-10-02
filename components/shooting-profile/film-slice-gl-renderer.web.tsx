import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { FilmSpaceCameraV1, FilmSpaceSlicePoseV1 } from "@/lib/film-space/slice-stack";
import {
  createFilmSliceGLEngine,
  type FilmSliceGLEngine,
  type FilmSliceTextureFrameV1,
} from "@/lib/film-space/web-gl-slice-renderer";

type FilmSliceGLRendererProps = Readonly<{
  frames: readonly FilmSliceTextureFrameV1[];
  slices: readonly FilmSpaceSlicePoseV1[];
  camera: FilmSpaceCameraV1;
  style?: StyleProp<ViewStyle>;
  /** Called once when WebGL is unavailable, lost or fails; the caller switches to the 2D fallback. */
  onRendererError?: () => void;
  /** Called after the frame set is in place with the time texture creation took. */
  onTexturesReady?: (readyMs: number) => void;
}>;

const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * Browser WebGL stage for the Film Space slice stack. One <canvas>, one
 * engine, one texture per sampled frame. Context loss is handled by giving
 * the viewer a chance to fall back rather than drawing into a dead context.
 */
export function FilmSliceGLRenderer({ frames, slices, camera, style, onRendererError, onTexturesReady }: FilmSliceGLRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FilmSliceGLEngine | null>(null);
  const failedRef = useRef(false);
  const latestRef = useRef({ frames, slices, camera, onRendererError, onTexturesReady });
  latestRef.current = { frames, slices, camera, onRendererError, onTexturesReady };
  const frameRequestRef = useRef<number | null>(null);

  const fail = useCallback(() => {
    if (failedRef.current) return;
    failedRef.current = true;
    engineRef.current?.dispose();
    engineRef.current = null;
    latestRef.current.onRendererError?.();
  }, []);

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || failedRef.current) return;
    try {
      engine.draw(latestRef.current.slices, latestRef.current.camera, { width: canvas.width, height: canvas.height });
    } catch {
      fail();
    }
  }, [fail]);

  // The first draw of a burst is immediate so a frame is on screen even where animation frames are
  // paused (hidden window, background iframe); further calls within the same frame are coalesced.
  const pendingDrawRef = useRef(false);
  const scheduleDraw = useCallback(() => {
    if (frameRequestRef.current !== null) {
      pendingDrawRef.current = true;
      return;
    }
    drawNow();
    if (typeof requestAnimationFrame !== "function") return;
    frameRequestRef.current = requestAnimationFrame(() => {
      frameRequestRef.current = null;
      if (!pendingDrawRef.current) return;
      pendingDrawRef.current = false;
      drawNow();
    });
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

  // Context + engine: created once per mounted canvas, destroyed on unmount or loss.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    failedRef.current = false;
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      gl = (canvas.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: true })
        ?? canvas.getContext("webgl", { alpha: false, antialias: true, premultipliedAlpha: true })) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl) {
      fail();
      return;
    }
    try {
      engineRef.current = createFilmSliceGLEngine(gl);
    } catch {
      fail();
      return;
    }

    const onContextLost = (event: Event) => {
      // Tell the browser we noticed; then stop using this context for good and let the viewer fall back.
      event.preventDefault();
      fail();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
    observer?.observe(canvas);
    resize();

    return () => {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      observer?.disconnect();
      if (frameRequestRef.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [fail, resize]);

  // Textures: rebuilt whenever the frame set changes, never while interacting.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || failedRef.current) return;
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      engine.setTextures(frames);
    } catch {
      fail();
      return;
    }
    const finished = typeof performance !== "undefined" ? performance.now() : Date.now();
    latestRef.current.onTexturesReady?.(finished - started);
    scheduleDraw();
  }, [fail, frames, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [camera, scheduleDraw, slices]);

  return (
    <View style={[styles.host, style]}>
      <canvas
        aria-hidden="true"
        data-hoophub-film-renderer="webgl"
        ref={canvasRef}
        style={{ display: "block", height: "100%", width: "100%" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { overflow: "hidden" },
});
