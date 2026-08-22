import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("private V2 capture persistence wiring", () => {
  it("retains the exact normalized attempts by session generation and saves only the strict envelope", () => {
    const hook = read("hooks/use-shooting-profile-capture.ts");
    expect(hook).toContain("type SaveShootingProfileInputV2");
    expect(hook).toMatch(/input:\s*SaveShootingProfileInputV2,?\s*\) => Promise<string>/);
    expect(hook).toContain("normalizedAttemptsRef");
    expect(hook).toContain("sessionGeneration");
    expect(hook).toContain("normalizedAttempts: attempts");
    expect(hook).toContain("matchingShootingProfileSaveInputV2(snapshot, retained)");
    expect(hook).toContain("runCaptureSaveOperationV2");
    expect(hook).toContain("saveProfile: options.saveProfile");
    const reducer = read("lib/shooting-profile/capture-session-reducer.ts");
    expect(reducer).toContain("profile: state.profile");
    expect(reducer).toContain("shootingHand: state.shootingHand");
    expect(reducer).toContain("confidence: state.confidence");
    expect(reducer).toContain("normalizedAttempts: retained.normalizedAttempts");
    const saveSection = hook.slice(hook.indexOf("const save = useCallback"), hook.indexOf("return {", hook.indexOf("const save = useCallback")));
    expect(saveSection).not.toMatch(/\buri\b|filename|sourceLandmarks|sequence:/);
  });

  it("invalidates retained attempts on every capture-generation escape and rejects late save completion", () => {
    const hook = read("hooks/use-shooting-profile-capture.ts");
    for (const callback of [
      "selectMode",
      "returnToModeSelect",
      "setShootingHand",
      "retakeSlot",
      "cancelSession",
    ]) {
      const start = hook.indexOf(`const ${callback} = useCallback`);
      expect(start).toBeGreaterThan(-1);
      expect(hook.slice(start, start + 420)).toContain("invalidateDerivedSave");
    }
    expect(hook).toContain("normalizedAttemptsRef.current = null");
    expect(hook).toContain("captureSaveOperationMatches");
    expect(hook).toContain("stateRef.current.sessionGeneration");
    expect(hook).toContain("clearCaptureSaveOperationIfMatching");
    expect(hook).toContain('type: "SAVE_SUCCEEDED"');
  });

  it("requires both capture flags and settled signed-in auth, then routes only by opaque returned ID", () => {
    const route = read("app/private-capture.tsx");
    expect(route).toContain("FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2");
    expect(route).toContain("useFirebaseAuth");
    expect(route).toContain("authLoading");
    expect(route).toContain("saveShootingProfileV2(user, input)");
    expect(route).toContain('key={user?.uid ?? "missing-owner"}');
    expect(route).toContain("isOpaqueShootingProfileIdV2");
    expect(route).toContain("FORMPATH_FLAGS.representative4DViewer");
    expect(route).toContain('router.replace(`/private-analysis/${savedProfileId}` as never)');
    expect(route).toContain('<Redirect href="/profile" />');
    expect(route).toContain("router.canGoBack()");
    expect(route).not.toMatch(/JSON\.stringify|profileJson|profile=/);
  });

  it("exposes the guided CTA only when both persistence flags are enabled", () => {
    const entry = read("components/private-pose-capture.tsx");
    expect(entry).toContain("FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2");
    expect(entry).toContain(": <LegacyPrivatePoseCapture onSaved={onSaved} />");
  });

  it("shows truthful consent immediately before save and truthful completion copy", () => {
    const quality = read("components/shooting-profile/quality-summary.tsx");
    const session = read("components/shooting-profile/capture-session.tsx");
    expect(quality).toContain("12개 허용 관절의 위상 정규화 2D 관찰값과 대표 추정치만 업로드합니다");
    expect(quality).toContain("원본 영상, 파일명, 원본 MediaPipe 깊이값은 업로드하지 않습니다");
    expect(quality).toContain("삭제할 때까지 비공개로 보관됩니다");
    expect(quality).toContain("아직 저장 완료로 표시하지 않습니다");
    expect(quality).toContain("busy: saving");
    expect(quality.indexOf("{saving")).toBeLessThan(quality.indexOf(": canSave"));
    expect(quality).toContain("위상 결합 4D 추정 · 실측 3D 아님");
    expect(quality.indexOf("삭제할 때까지 비공개로 보관됩니다")).toBeLessThan(quality.indexOf("<Pressable"));
    expect(session).toContain("원본 영상은 업로드하지 않았고, 파생된 대표 슛폼 데이터만 비공개로 저장했습니다");
  });

  it("locks session exit while save is unresolved and gives changed controls visible focus", () => {
    const session = read("components/shooting-profile/capture-session.tsx");
    const quality = read("components/shooting-profile/quality-summary.tsx");
    expect(session).toContain('const saving = state.status === "saving"');
    expect(session).toContain("accessibilityState={{ disabled: saving, busy: saving }}");
    for (const source of [session, quality, read("components/private-pose-capture.tsx")]) {
      expect(source).toContain("focusable");
      expect(source).toContain("outlineStyle");
      expect(source).toContain("minWidth: 44");
      expect(source).not.toContain("focusBorderWidth");
    }
  });
});

describe("V1-independent V2 profile UI", () => {
  it("keeps every changed profile action labelled, stateful, focusable, and at least 44 points", () => {
    for (const source of [read("app/(tabs)/profile.tsx"), read("components/shooting-profile/profile-list.tsx")]) {
      const pressables = [...source.matchAll(/<Pressable\b[\s\S]*?<\/Pressable>/g)].map((match) => match[0]);
      expect(pressables.length).toBeGreaterThan(0);
      for (const pressable of pressables) {
        expect(pressable).toContain("accessibilityLabel=");
        expect(pressable).toContain('accessibilityRole="button"');
        expect(pressable).toContain("accessibilityState=");
        expect(pressable).toContain("disabled=");
        expect(pressable).toContain("focusable");
        expect(pressable).toContain("onFocus=");
      }
      expect(source).toContain("outlineStyle");
      expect(source).toMatch(/minHeight: (?:44|4[5-9]|[5-9]\d|\d{3,})/);
      expect(source).toMatch(/minWidth: (?:44|4[5-9]|[5-9]\d|\d{3,})/);
    }
  });

  it("keeps the list component presentational, honest, accessible, and deletion-aware", () => {
    const list = read("components/shooting-profile/profile-list.tsx");
    expect(list).toContain("ShootingProfileSummaryV2[]");
    expect(list).toContain("onOpen:");
    expect(list).toContain("onDelete:");
    expect(list).not.toContain("useFirebaseAuth");
    expect(list).not.toContain("listShootingProfilesV2(");
    expect(list).not.toContain("deleteShootingProfileV2(");
    expect(list).toContain("대표 스냅샷 추정 · 반복성 측정 아님");
    expect(list).toContain("3회 반복 대표 슛폼");
    expect(list).toContain("위상 결합 4D 추정 · 실측 3D 아님");
    expect(list).toContain("isOpaqueShootingProfileIdV2(record.id)");
    expect(list).toContain("기록 식별자가 유효하지 않아 열거나 삭제할 수 없습니다");
    expect(list).toContain('accessibilityLiveRegion="polite"');
    expect(list).toContain("minHeight: 72");
    expect(list).toContain("minWidth: 44");
    expect(list).toContain("minHeight: 52");
    expect(list).toContain("minWidth: 52");
    expect(list).toContain("outlineStyle");
  });

  it("resumes deletion before V2 listing and guards results by exact owner", () => {
    const profile = read("app/(tabs)/profile.tsx");
    const resume = profile.indexOf("await resumePendingShootingProfileDeletionsV2(owner)");
    const list = profile.indexOf("await listShootingProfilesV2(owner)");
    expect(resume).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(resume);
    expect(profile).toContain("currentOwnerUidRef.current !== ownerUid");
    expect(profile).toContain("v2LoadGenerationRef");
    expect(profile).toContain("ownerGenerationMatches");
    expect(profile).toContain("valueForExactOwner(currentOwnerUid, v1RecordEnvelope)");
    expect(profile).toContain("valueForExactOwner(currentOwnerUid, v2RecordEnvelope)");
    expect(profile).toContain("valueForExactOwner(currentOwnerUid, selectedPoseEnvelope)");
    expect(profile).toContain("valueForExactOwner(currentOwnerUid, deletingProfileEnvelope)");
    expect(profile).toContain("listFirebasePrivatePoses");
    expect(profile).toContain("listShootingProfilesV2");
    expect(profile).toContain("기존 단일 시점 분석");
    expect(profile).toContain("v1Error");
    expect(profile).toContain("v2Error");
  });

  it("does not invoke or render V2 persistence when the profile flag is off", () => {
    const profile = read("app/(tabs)/profile.tsx");
    const loadV2 = profile.slice(profile.indexOf("const loadV2 = useCallback"), profile.indexOf("useEffect(() =>", profile.indexOf("const loadV2 = useCallback")));
    const deleteV2 = profile.slice(profile.indexOf("const deleteV2 = useCallback"), profile.indexOf("const confirmDeleteV2"));
    expect(loadV2.indexOf("if (!FORMPATH_FLAGS.profileV2) return;")).toBeLessThan(loadV2.indexOf("resumePendingShootingProfileDeletionsV2"));
    expect(deleteV2.indexOf("!FORMPATH_FLAGS.profileV2")).toBeLessThan(deleteV2.indexOf("deleteShootingProfileV2"));
    expect(profile).toContain("{FORMPATH_FLAGS.profileV2 ? (");
    expect(profile).toContain("<PrivatePoseCapture");
  });

  it("confirms and awaits V2 deletion, and opens only when both viewer flags allow it", () => {
    const profile = read("app/(tabs)/profile.tsx");
    expect(profile).toContain("Alert.alert");
    expect(profile).toContain("await runOwnerBoundDeleteOperationV2");
    expect(profile).toContain("deleteProfile: () => deleteShootingProfileV2(owner, profileId)");
    expect(profile).toContain("FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer");
    expect(profile).toContain('router.push(`/private-analysis/${profileId}` as never)');
    expect(profile).toContain("v2DeleteInFlightRef.current");
    expect(profile).toContain("ownerOperationMatches");
    expect(profile).toContain("clearOwnerOperationIfMatching");
    expect(profile).toContain("!isOpaqueShootingProfileIdV2(profileId)");
    expect(profile).not.toContain("saveFirebasePrivatePose");
  });

  it("does not introduce forbidden persistence or public-sharing paths", () => {
    const changedSources = [
      "app/private-capture.tsx",
      "app/(tabs)/profile.tsx",
      "hooks/use-shooting-profile-capture.ts",
      "components/shooting-profile/capture-session.tsx",
      "components/shooting-profile/quality-summary.tsx",
      "components/shooting-profile/profile-list.tsx",
      "components/private-pose-capture.tsx",
    ].map(read).join("\n");
    expect(changedSources).not.toMatch(/console\.(log|warn|error)/);
    expect(changedSources).not.toMatch(/@\/server|trpc|mysql/i);
    expect(changedSources).not.toMatch(/public-share|shareProfile|compareProfile|referencePlayer/i);
  });
});
