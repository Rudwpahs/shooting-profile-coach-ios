import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const session = readFileSync("components/shooting-profile/capture-session.tsx", "utf8");
const guide = readFileSync("components/capture/capture-guide.tsx", "utf8");
const picker = readFileSync("components/shooting-profile/capture-mode-picker.tsx", "utf8");
const slot = readFileSync("components/shooting-profile/capture-slot-card.tsx", "utf8");
const review = readFileSync("components/shooting-profile/quality-summary.tsx", "utf8");
const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");

describe("capture: stand, camera, shoot, accept or recapture", () => {
  it("keeps the state machine and the hook untouched and renders every status", () => {
    expect(session).toContain("useShootingProfileCapture({ saveProfile })");
    expect(session).toContain("export function CaptureSessionView(");
    for (const status of ["mode_select", "setup", "collecting", "ready_to_aggregate", "aggregating", "result_review", "saving", "complete", "cancelled", "error"]) {
      expect(session, status).toContain(`"${status}"`);
    }
    // Recapture guidance comes from the typed reasons the hook already maps; the view never invents copy.
    expect(session).not.toMatch(/reasonCode ===|recaptureReasonCode ===/);
    expect(slot).toContain("slot.rejectionReason");
    expect(hook).toContain("recaptureReason(result.reason)");
  });

  it("renders guidance from protocol data, never from a hard-coded view layout or a yaw number", () => {
    expect(session).toContain("captureProtocolPresentation(");
    expect(session).toContain("captureGuidanceForSlot(");
    expect(guide).toContain("describeCameraYaw(");
    expect(guide).toContain("views.map(");
    expect(session).not.toMatch(/정면 클립부터|카메라를 한 번 옮겨/);
    for (const source of [session, guide, picker, slot, review]) {
      expect(source).not.toMatch(/45°|60°|±/);
      expect(source).not.toMatch(/#[0-9A-Fa-f]{6}\b|rgba?\(/);
      expect(source).not.toMatch(/fontFamily: "Barlow/);
    }
  });

  it("keeps the text budget: one line to stand, one line for the camera, short step titles", () => {
    expect(guide).toContain("numberOfLines={1}");
    expect(session).not.toMatch(/모든 필수 클립이 통과했습니다\. 정면과 측면의 서로 다른 시간축/);
    expect(session).not.toContain("StepHeader");
    expect(picker).not.toContain("각 시점의 반복 슛을 먼저 비교한 뒤");
  });

  it("puts the result skeleton first on review and keeps the truthful consent copy beside save", () => {
    expect(review).toContain("<SkeletonLoop");
    expect(review).toContain("<LoopStage");
    expect(review.indexOf("<LoopStage")).toBeLessThan(review.indexOf("<Pressable"));
    expect(review).toContain("confidenceBandCopy(profile)");
    expect(review).toContain("representativeConfidence(profile)");
    expect(review).not.toMatch(/정규화 위상|101/);
  });

  it("labels every control for assistive technology with a 44-point target and touch-down feedback", () => {
    for (const source of [session, picker, slot, review]) {
      const pressables = source.match(/<Pressable\b/g)?.length ?? 0;
      expect(pressables).toBeGreaterThan(0);
      expect(source.match(/accessibilityRole=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
      expect(source.match(/accessibilityLabel=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
      expect(source).toMatch(/minHeight: (?:44|4[5-9]|[5-9]\d)/);
      expect(source).toMatch(/pressed && (?:!\w+ && )?styles\.pressed/);
    }
    expect(session).toContain("accessibilityLiveRegion");
  });
});
