import { createPersonalPoseCandidate, type PersonalPoseFrame } from "@/lib/personal-pose";
import type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

export type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const VISION_SCRIPT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js";

type BrowserLandmark = { x: number; y: number; z: number; visibility?: number };
type BrowserPoseDetector = {
  close: () => void;
  detectForVideo: (frame: HTMLVideoElement, timestamp: number) => { landmarks: BrowserLandmark[][] };
};
type BrowserVision = {
  FilesetResolver: { forVisionTasks: (wasmRoot: string) => Promise<unknown> };
  PoseLandmarker: { createFromOptions: (fileset: unknown, options: unknown) => Promise<BrowserPoseDetector> };
};

function loadVisionScript() {
  const cached = (window as unknown as { Vision?: BrowserVision }).Vision;
  if (cached) return Promise.resolve(cached);
  return new Promise<BrowserVision>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${VISION_SCRIPT}"]`);
    const complete = () => {
      const vision = (window as unknown as { Vision?: BrowserVision }).Vision;
      if (vision) resolve(vision); else reject(new Error("mediapipe_global_not_available"));
    };
    if (existing) { existing.addEventListener("load", complete, { once: true }); existing.addEventListener("error", () => reject(new Error("mediapipe_script_load_failed")), { once: true }); return; }
    const script = document.createElement("script");
    script.src = VISION_SCRIPT;
    script.async = true;
    script.onload = complete;
    script.onerror = () => reject(new Error("mediapipe_script_load_failed"));
    document.head.appendChild(script);
  });
}

function waitForEvent(target: HTMLVideoElement, event: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const complete = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("video_load_failed")); };
    const cleanup = () => { target.removeEventListener(event, complete); target.removeEventListener("error", fail); };
    target.addEventListener(event, complete, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

/** Browser-only MediaPipe Pose Landmarker pipeline for a user-selected local video. */
export async function detectPoseFromSelectedVideo(uri: string, onProgress?: (progress: PoseDetectionProgress) => void): Promise<PoseDetectionResult> {
  let video: HTMLVideoElement | null = null;
  let landmarker: BrowserPoseDetector | null = null;
  try {
    const vision = await loadVisionScript();
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = uri;
    await waitForEvent(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) return { status: "error", reason: "동영상 길이를 읽을 수 없습니다." };
    const total = Math.max(8, Math.min(48, Math.ceil(video.duration * 8)));
    const frames: PersonalPoseFrame[] = [];
    for (let index = 0; index < total; index += 1) {
      const targetTime = Math.min(Math.max(0, (video.duration * index) / Math.max(1, total - 1)), Math.max(0, video.duration - 0.001));
      video.currentTime = targetTime;
      await waitForEvent(video, "seeked");
      const result = landmarker.detectForVideo(video, Math.max(1, Math.round(targetTime * 1000)));
      const landmarks = result.landmarks?.[0];
      if (landmarks?.length === 33) frames.push({ timestampMs: Math.round(targetTime * 1000), landmarks: landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility ?? 1 })) });
      onProgress?.({ completed: index + 1, total });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const candidate = createPersonalPoseCandidate(frames);
    if (!candidate.quality.passed) return { status: "rejected", candidate, sampledFrames: total, reason: candidate.quality.reasons.join(", ") || "pose_quality_failed" };
    return { status: "complete", candidate, sampledFrames: total };
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "pose_detection_failed" };
  } finally {
    landmarker?.close();
    if (video) { video.removeAttribute("src"); video.load(); }
  }
}
