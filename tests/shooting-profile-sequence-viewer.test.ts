import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  advanceRepresentativeFrameIndex,
  buildShootingProfileViewerKey,
  buildRepresentativeDisplayJoints,
  canRenderShootingProfileViewerRecord,
  createRepresentativePlaybackLifecycle,
  getRepresentativeViewPresets,
  getRepresentativeFocusStyle,
  projectRepresentativeJoints,
  resolveRepresentativePlayback,
  sampleRepresentativeFrame,
  transitionRepresentativePlaybackLifecycle,
  validateRepresentativeViewerProfile,
} from "@/components/shooting-profile/sequence-viewer";
import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
} from "@/lib/shooting-profile/types";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T>(styles: T) => styles },
}));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));

const PERSISTED_JOINTS = [
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
] as const satisfies readonly PersistedJointNameV2[];

function syntheticRepresentativeProfile(): RepresentativePose4DV2 {
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode: "high_accuracy_3_plus_3",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames: Array.from({ length: 101 }, (_, index) => ({
      phase: index / 100,
      joints: Object.fromEntries(PERSISTED_JOINTS.map((joint, jointIndex) => [joint, {
        x: (jointIndex % 2 === 0 ? -1 : 1) * (0.25 + index / 1000),
        y: 0.2 + jointIndex * 0.11 + index / 500,
        z: (jointIndex - 5) * 0.04,
      }])) as RepresentativePose4DV2["frames"][number]["joints"],
      uncertainty: Object.fromEntries(PERSISTED_JOINTS.map((joint) => [joint, {
        model: "heuristic_v1" as const,
        covariance: [0.01, 0, 0, 0.01, 0, 0.01] as [number, number, number, number, number, number],
        directionalConeDegrees: 9,
      }])) as RepresentativePose4DV2["frames"][number]["uncertainty"],
    })),
    phaseAnchors: [
      { id: "ready", phase: 0 },
      { id: "deepestDip", phase: 0.25 },
      { id: "rise", phase: 0.5 },
      { id: "releaseProxy", phase: 0.75 },
      { id: "followThrough", phase: 1 },
    ],
    quality: { passed: true, reasons: [] },
  };
}

describe("representative sequence sampling", () => {
  it("accepts exactly 101 viewer frames and rejects 100 or 102 with an explicit contract error", () => {
    const valid = syntheticRepresentativeProfile();
    const short = { ...valid, frames: valid.frames.slice(0, 100) };
    const long = { ...valid, frames: [...valid.frames, valid.frames[100]] };
    const sparseFrames = [...valid.frames];
    sparseFrames[50] = undefined as never;
    const sparse = { ...valid, frames: sparseFrames };

    expect(validateRepresentativeViewerProfile(valid)).toBe(valid);
    expect(() => validateRepresentativeViewerProfile(short)).toThrow("representative viewer requires exactly 101 stored frames");
    expect(() => validateRepresentativeViewerProfile(long)).toThrow("representative viewer requires exactly 101 stored frames");
    expect(() => validateRepresentativeViewerProfile(sparse)).toThrow("representative viewer requires exactly 101 stored frames");
  });

  it("returns the exact stored 0.51 frame for phase 0.505", () => {
    const profile = syntheticRepresentativeProfile();
    const sampled = sampleRepresentativeFrame(profile, 0.505);

    expect(profile.frames).toHaveLength(101);
    expect(sampled).toBe(profile.frames[51]);
    expect(sampled.phase).toBe(0.51);
  });

  it("clamps finite phases and rejects every non-finite phase", () => {
    const profile = syntheticRepresentativeProfile();

    expect(sampleRepresentativeFrame(profile, -12)).toBe(profile.frames[0]);
    expect(sampleRepresentativeFrame(profile, 4)).toBe(profile.frames[100]);
    expect(() => sampleRepresentativeFrame(profile, Number.NaN)).toThrow(/finite/i);
    expect(() => sampleRepresentativeFrame(profile, Number.POSITIVE_INFINITY)).toThrow(/finite/i);
    expect(() => sampleRepresentativeFrame(profile, Number.NEGATIVE_INFINITY)).toThrow(/finite/i);
  });

  it("uses five anchors only as exact seek markers while preserving all 101 source samples", () => {
    const profile = syntheticRepresentativeProfile();

    expect(profile.phaseAnchors).toHaveLength(5);
    expect(profile.phaseAnchors.map((anchor) => sampleRepresentativeFrame(profile, anchor.phase))).toEqual([
      profile.frames[0],
      profile.frames[25],
      profile.frames[50],
      profile.frames[75],
      profile.frames[100],
    ]);
    expect(sampleRepresentativeFrame(profile, 0.63)).toBe(profile.frames[63]);
  });

  it("advances one stored index at a time and loops only after index 100", () => {
    expect(advanceRepresentativeFrameIndex(0)).toBe(1);
    expect(advanceRepresentativeFrameIndex(50)).toBe(51);
    expect(advanceRepresentativeFrameIndex(99)).toBe(100);
    expect(advanceRepresentativeFrameIndex(100)).toBe(0);
    expect(advanceRepresentativeFrameIndex(-7)).toBe(1);
    expect(advanceRepresentativeFrameIndex(700)).toBe(0);
  });
});

describe("representative display-only skeleton", () => {
  it("derives head, neck, spine, and pelvis in memory without mutating or relabeling persisted joints", () => {
    const profile = syntheticRepresentativeProfile();
    const frame = profile.frames[30];
    const before = JSON.stringify(frame);
    const display = buildRepresentativeDisplayJoints(frame);

    expect(JSON.stringify(frame)).toBe(before);
    expect(Object.keys(frame.joints)).toEqual(PERSISTED_JOINTS);
    expect([display.head.source, display.neck.source, display.spine.source, display.pelvis.source]).toEqual([
      "derived", "derived", "derived", "derived",
    ]);
    expect(PERSISTED_JOINTS.every((joint) => display[joint].source === "observed")).toBe(true);
    const expectedNeck = {
      x: (frame.joints.leftShoulder.x + frame.joints.rightShoulder.x) / 2,
      y: (frame.joints.leftShoulder.y + frame.joints.rightShoulder.y) / 2,
      z: (frame.joints.leftShoulder.z + frame.joints.rightShoulder.z) / 2,
    };
    const expectedPelvis = {
      x: (frame.joints.leftHip.x + frame.joints.rightHip.x) / 2,
      y: (frame.joints.leftHip.y + frame.joints.rightHip.y) / 2,
      z: (frame.joints.leftHip.z + frame.joints.rightHip.z) / 2,
    };
    expect(display.neck).toMatchObject(expectedNeck);
    expect(display.pelvis).toMatchObject(expectedPelvis);
    expect(display.spine).toMatchObject({
      x: (expectedNeck.x + expectedPelvis.x) / 2,
      y: (expectedNeck.y + expectedPelvis.y) / 2,
      z: (expectedNeck.z + expectedPelvis.z) / 2,
    });
    expect(Math.hypot(
      display.head.x - display.neck.x,
      display.head.y - display.neck.y,
      display.head.z - display.neck.z,
    )).toBeCloseTo(Math.hypot(
      display.neck.x - display.spine.x,
      display.neck.y - display.spine.y,
      display.neck.z - display.spine.z,
    ) * 0.62, 10);
  });

  it("projects finite points for all presets and uses an explicit left-hand x-mirror convention", () => {
    const frame = syntheticRepresentativeProfile().frames[40];
    const rightPresets = getRepresentativeViewPresets("right");
    const leftPresets = getRepresentativeViewPresets("left");

    expect(rightPresets.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "front", label: "정면" },
      { id: "oblique", label: "사선" },
      { id: "side", label: "슈팅 측면" },
    ]);
    expect(rightPresets.every((preset) => preset.mirrorX === false)).toBe(true);
    expect(leftPresets.every((preset) => preset.mirrorX === true)).toBe(true);
    const rightFront = projectRepresentativeJoints(frame, "front", "right");
    const leftFront = projectRepresentativeJoints(frame, "front", "left");
    expect(leftFront.rightWrist.x).toBeCloseTo(-rightFront.rightWrist.x, 8);
    expect(Object.values(projectRepresentativeJoints(frame, "oblique", "right")).every((point) => (
      Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.depth)
    ))).toBe(true);
  });
});

describe("representative playback policy", () => {
  it("allows autoplay only while active and reduced motion is disabled", () => {
    expect(resolveRepresentativePlayback({ appState: "active", intent: "autoplay", reducedMotion: false })).toBe(true);
    expect(resolveRepresentativePlayback({ appState: "active", intent: "autoplay", reducedMotion: true })).toBe(false);
    expect(resolveRepresentativePlayback({ appState: "inactive", intent: "autoplay", reducedMotion: false })).toBe(false);
    expect(resolveRepresentativePlayback({ appState: "background", intent: "autoplay", reducedMotion: false })).toBe(false);
  });

  it("keeps explicit playback available with reduced motion but never advances in the background", () => {
    expect(resolveRepresentativePlayback({ appState: "active", intent: "explicit", reducedMotion: true })).toBe(true);
    expect(resolveRepresentativePlayback({ appState: "inactive", intent: "explicit", reducedMotion: true })).toBe(false);
    expect(resolveRepresentativePlayback({ appState: "background", intent: "explicit", reducedMotion: false })).toBe(false);
    expect(resolveRepresentativePlayback({ appState: "active", intent: "paused", reducedMotion: false })).toBe(false);
  });

  it("autoplays only when the first reduced-motion result is false and the app is already active", () => {
    const initial = createRepresentativePlaybackLifecycle();
    expect(initial).toEqual({
      appState: "unknown",
      intent: "paused",
      reducedMotion: null,
      reducedMotionResolved: false,
    });
    const active = transitionRepresentativePlaybackLifecycle(initial, { type: "app-state", value: "active" });
    const allowed = transitionRepresentativePlaybackLifecycle(active, { type: "reduced-motion", value: false });
    expect(allowed).toMatchObject({ appState: "active", intent: "autoplay", reducedMotion: false, reducedMotionResolved: true });

    const resolvedWhileUnknown = transitionRepresentativePlaybackLifecycle(initial, { type: "reduced-motion", value: false });
    const activatedLater = transitionRepresentativePlaybackLifecycle(resolvedWhileUnknown, { type: "app-state", value: "active" });
    expect(activatedLater.intent).toBe("paused");
  });

  it("pauses immediately for reduced motion or background and profile changes never force resume", () => {
    const playing = {
      appState: "active" as const,
      intent: "explicit" as const,
      reducedMotion: false,
      reducedMotionResolved: true,
    };
    expect(transitionRepresentativePlaybackLifecycle(playing, { type: "reduced-motion", value: true }).intent).toBe("paused");
    const background = transitionRepresentativePlaybackLifecycle(playing, { type: "app-state", value: "background" });
    const changedProfile = transitionRepresentativePlaybackLifecycle(background, { type: "profile" });
    const activeAgain = transitionRepresentativePlaybackLifecycle(changedProfile, { type: "app-state", value: "active" });
    expect(background.intent).toBe("paused");
    expect(changedProfile.intent).toBe("paused");
    expect(activeAgain.intent).toBe("paused");
  });
});

describe("representative keyboard focus visuals", () => {
  it("uses a layout-stable double-ring treatment that remains distinct on light and selected navy controls", () => {
    const unfocused = getRepresentativeFocusStyle(false, "light");
    const light = getRepresentativeFocusStyle(true, "light");
    const selectedNavy = getRepresentativeFocusStyle(true, "selected-navy");

    expect(unfocused).toEqual({});
    expect(light).toMatchObject({ outlineColor: "#102235", outlineWidth: 3, shadowColor: "#F97316", elevation: 8 });
    expect(selectedNavy).toMatchObject({ outlineColor: "#F97316", outlineWidth: 3, shadowColor: "#FFFFFF", elevation: 8 });
    expect(light.outlineColor).not.toBe("#F5F1E8");
    expect(selectedNavy.outlineColor).not.toBe("#102235");
    expect(light).not.toHaveProperty("borderWidth");
    expect(selectedNavy).not.toHaveProperty("borderWidth");
  });

  it("uses a white inner outline and navy outer shadow around the dark-red play surface", () => {
    const play = getRepresentativeFocusStyle(true, "play");

    expect(play).toMatchObject({
      outlineColor: "#FFFFFF",
      outlineOffset: 2,
      outlineWidth: 3,
      shadowColor: "#102235",
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 8,
    });
    expect(play.outlineColor).not.toBe("#9A3412");
    expect(play.shadowColor).not.toBe("#9A3412");
    expect(play).not.toHaveProperty("borderWidth");
  });
});

describe("keyed private viewer state", () => {
  it("keys profile loads by owner and opaque profile ID", () => {
    expect(buildShootingProfileViewerKey("owner-a", "profile-1")).toBe("owner-a:profile-1");
    expect(buildShootingProfileViewerKey("owner-b", "profile-1")).not.toBe(buildShootingProfileViewerKey("owner-a", "profile-1"));
  });

  it("renders a ready record only when its deferred request key is still current", () => {
    expect(canRenderShootingProfileViewerRecord("owner-a:profile-1", "owner-a:profile-1", "ready")).toBe(true);
    expect(canRenderShootingProfileViewerRecord("owner-a:profile-1", "owner-a:profile-2", "ready")).toBe(false);
    expect(canRenderShootingProfileViewerRecord("owner-a:profile-1", "owner-a:profile-1", "loading")).toBe(false);
    expect(canRenderShootingProfileViewerRecord(undefined, "owner-a:profile-1", "ready")).toBe(false);
  });
});

describe("viewer and private route static safety", () => {
  const viewerSource = readFileSync(resolve(process.cwd(), "components/shooting-profile/sequence-viewer.tsx"), "utf8");
  const routeSource = readFileSync(resolve(process.cwd(), "app/private-analysis/[id].tsx"), "utf8");

  it("does not import or call the V1 five-frame interpolator", () => {
    expect(viewerSource).not.toContain("interpolatePoseFrame");
    expect(viewerSource).not.toContain("@/lib/pose-motion");
  });

  it("subscribes to app-state and reduced-motion changes and cancels scheduled animation", () => {
    expect(viewerSource).toContain("AppState.addEventListener");
    expect(viewerSource.indexOf("AppState.addEventListener")).toBeLessThan(viewerSource.indexOf("reconcileAppState(AppState.currentState)"));
    expect(viewerSource).toContain("AccessibilityInfo.isReduceMotionEnabled");
    expect(viewerSource).toContain("reduceMotionChanged");
    expect(viewerSource).toContain("cancelAnimationFrame");
  });

  it("gives every Pressable an accessibility contract, keyboard focus treatment, and a 44-point target", () => {
    const pressableCount = viewerSource.match(/<Pressable\b/g)?.length ?? 0;
    expect(pressableCount).toBeGreaterThan(0);
    expect(viewerSource.match(/accessibilityRole=/g)).toHaveLength(pressableCount + 1);
    expect(viewerSource.match(/accessibilityLabel=/g)?.length).toBeGreaterThanOrEqual(pressableCount + 1);
    expect(viewerSource.match(/accessibilityState=/g)).toHaveLength(pressableCount);
    expect(viewerSource.match(/focusable/g)).toHaveLength(pressableCount);
    expect(viewerSource.match(/onFocus=/g)).toHaveLength(pressableCount);
    expect(viewerSource.match(/onBlur=/g)).toHaveLength(pressableCount);
    expect(viewerSource).toContain("minHeight: 44");
    expect(viewerSource).toContain("minWidth: 44");
    expect(viewerSource).toContain("accessibilityRole=\"image\"");
    expect(viewerSource).toContain("accessibilityLabel={`${selectedView.label}, ${frameIndex}% 위상 대표 골격 이미지");
    expect(viewerSource).not.toContain("accessibilityState={{ selected: isPlaying }}");
    expect(viewerSource).toContain("getRepresentativeFocusStyle");
    expect(viewerSource).toContain("#607487");
  });

  it("keeps route access behind both flags, Firebase owner auth, and opaque ID validation", () => {
    expect(routeSource).toContain("FORMPATH_FLAGS.profileV2");
    expect(routeSource).toContain("FORMPATH_FLAGS.representative4DViewer");
    expect(routeSource).toContain("useFirebaseAuth");
    expect(routeSource).toContain("getShootingProfileV2(user, profileId)");
    expect(routeSource).toContain("@/lib/firebase-shooting-profiles");
    expect(routeSource).toContain("ShootingProfileViewerRecordV2");
    expect(routeSource).toContain("buildShootingProfileViewerKey(user.uid, profileId)");
    expect(routeSource).toContain("canRenderShootingProfileViewerRecord");
    expect(routeSource).not.toContain("JSON.parse");
    expect(routeSource).not.toMatch(/console\.(?:log|warn|error)/);
    expect(routeSource).toContain("<Redirect href=\"/profile\"");
  });

  it("uses safe back fallback and exposes loading, retry, back, error, and viewer states", () => {
    expect(routeSource).toContain("router.canGoBack()");
    expect(routeSource).toContain("router.replace(\"/profile\")");
    expect(routeSource).toContain("분석을 불러오는 중");
    expect(routeSource).toContain("다시 시도");
    expect(routeSource).toContain("프로필로 돌아가기");
    expect(routeSource).toContain("SequenceViewer");
    expect(routeSource).toContain("shootingHand={loadState.record.shootingHand}");
    expect(routeSource).toContain("confidence={loadState.record.confidence}");
    expect(routeSource).not.toContain("const [profile, setProfile]");
    const routePressableCount = routeSource.match(/<Pressable\b/g)?.length ?? 0;
    expect(routeSource.match(/focusable/g)).toHaveLength(routePressableCount);
    expect(routeSource.match(/onFocus=/g)).toHaveLength(routePressableCount);
    expect(routeSource.match(/onBlur=/g)).toHaveLength(routePressableCount);
  });
});
