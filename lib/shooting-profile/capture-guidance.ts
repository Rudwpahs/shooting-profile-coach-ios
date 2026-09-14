import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";
import type { CaptureProtocolV2, CaptureSlotV2, CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/**
 * Capture guidance as data.
 *
 * The protocol (`buildCapturePlan`) decides which views and how many takes;
 * this module only says how to present a view: where to stand, where the
 * camera goes, and, when a protocol declares one, the camera yaw. The
 * presentation vocabulary is deliberately wider than today's protocol so a
 * future oblique protocol is a configuration change, not a new screen.
 * Nothing here defines a yaw requirement; every current view carries null.
 */
export type CaptureGuidanceViewId = CaptureViewV2 | "left_oblique" | "right_oblique";
export type CaptureGuidanceIcon = "human" | "camera" | "angle-acute";

export type CaptureViewGuidance = Readonly<{
  view: CaptureGuidanceViewId;
  title: string;
  /** Where to stand, one short line. */
  stand: string;
  /** Where to put the camera, one short line. */
  camera: string;
  /** Shooter-centric camera yaw in degrees when the protocol declares one; null otherwise. */
  cameraYawDegrees: number | null;
  icon: CaptureGuidanceIcon;
}>;

export type CaptureProtocolPresentation = Readonly<{
  mode: CaptureProtocolV2;
  modeTitle: string;
  modeLine: string;
  takesPerView: number;
  views: readonly CaptureViewGuidance[];
}>;

const HAND_SIDE: Readonly<Record<ShootingHandV2, string>> = { right: "오른쪽", left: "왼쪽" };
const OTHER_SIDE: Readonly<Record<ShootingHandV2, string>> = { right: "왼쪽", left: "오른쪽" };

export function captureViewGuidance(view: CaptureGuidanceViewId, shootingHand: ShootingHandV2): CaptureViewGuidance {
  switch (view) {
    case "front":
      return {
        view,
        title: "정면",
        stand: "골대를 보고 평소 자리에",
        camera: "골대 쪽에서 정면, 전신이 다 보이게",
        cameraYawDegrees: null,
        icon: "human",
      };
    case "shooting_side":
      return {
        view,
        title: "슈팅 측면",
        stand: "같은 자리에서 같은 슛",
        camera: `슈팅 손 쪽(${HAND_SIDE[shootingHand]}) 옆에서, 전신이 다 보이게`,
        cameraYawDegrees: null,
        icon: "camera",
      };
    case "left_oblique":
      return {
        view,
        title: "왼쪽 사선",
        stand: "같은 자리에서 같은 슛",
        camera: `${OTHER_SIDE.right} 앞 대각선에서, 전신이 다 보이게`,
        cameraYawDegrees: null,
        icon: "angle-acute",
      };
    case "right_oblique":
      return {
        view,
        title: "오른쪽 사선",
        stand: "같은 자리에서 같은 슛",
        camera: `${HAND_SIDE.right} 앞 대각선에서, 전신이 다 보이게`,
        cameraYawDegrees: null,
        icon: "angle-acute",
      };
  }
}

export function captureProtocolPresentation(mode: CaptureProtocolV2, shootingHand: ShootingHandV2): CaptureProtocolPresentation {
  const slots = buildCapturePlan(mode);
  const views = [...new Set(slots.map((slot) => slot.view))].map((view) => captureViewGuidance(view, shootingHand));
  const takesPerView = views.length === 0 ? 0 : slots.length / views.length;
  return {
    mode,
    modeTitle: mode === "basic_1_plus_1" ? "Basic" : "High",
    modeLine: mode === "basic_1_plus_1" ? "정면 1 · 측면 1 · 대표 스냅샷" : "정면 3 · 측면 3 · 반복 일치",
    takesPerView,
    views,
  };
}

export function captureGuidanceForSlot(slot: Pick<CaptureSlotV2, "view">, shootingHand: ShootingHandV2): CaptureViewGuidance {
  return captureViewGuidance(slot.view, shootingHand);
}

/** A yaw line only when a protocol declared one; the current protocol never does. */
export function describeCameraYaw(guidance: CaptureViewGuidance): string | null {
  if (guidance.cameraYawDegrees === null || !Number.isFinite(guidance.cameraYawDegrees)) return null;
  return `카메라 각도 ${guidance.cameraYawDegrees}°`;
}
