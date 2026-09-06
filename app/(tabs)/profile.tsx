import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { PrivatePoseCapture } from "@/components/private-pose-capture";
import { AccountPanel, type AccountMode } from "@/components/profile/account-panel";
import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero, type ProfileHeroState } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ScreenContainer } from "@/components/screen-container";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { listFirebasePrivatePoses, removeFirebasePrivatePose, type FirebasePrivatePose } from "@/lib/firebase-private-data";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import {
  deleteShootingProfileV2,
  getShootingProfileV2,
  listShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2,
  type ShootingProfileSummaryV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";
import { personalPoseToCorrectedMotion, type PersonalPoseCandidate, type PersonalPoseCorrection } from "@/lib/personal-pose";
import type { PoseMotion } from "@/lib/pose-motion";
import { useProfile } from "@/lib/profile-store";
import {
  clearOwnerOperationIfMatching,
  ownerGenerationMatches,
  ownerOperationMatches,
  runOwnerBoundDeleteOperationV2,
  valueForExactOwner,
  type OwnerOperationToken,
} from "@/lib/shooting-profile/capture-session-reducer";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
/** Tiles fetch their full record lazily; this bounds the reads one profile view can cause. */
const GLYPH_FETCH_LIMIT = 9;

function focusStyle(focused: boolean, dark = false): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: tokens.focusRing,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: dark ? tokens.background : tokens.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

/**
 * 프로필: the owner's skeleton is the identity. Visual composition lives in
 * components/profile/*; every owner-bound load, delete and recovery decision
 * stays in this route exactly as before.
 */
export default function PersonalProfileTab() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading, configured, profileSync, signIn, signUp, logout } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AccountMode>("signin");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [v1RecordEnvelope, setV1RecordEnvelope] = useState<{ ownerUid: string; value: FirebasePrivatePose[] } | null>(null);
  const [v1Loading, setV1Loading] = useState(false);
  const [v1Error, setV1Error] = useState<string | null>(null);
  const [v1UiOwnerUid, setV1UiOwnerUid] = useState<string | null>(null);
  const [selectedPoseEnvelope, setSelectedPoseEnvelope] = useState<{ ownerUid: string; value: FirebasePrivatePose } | null>(null);
  const [v2RecordEnvelope, setV2RecordEnvelope] = useState<{ ownerUid: string; value: ShootingProfileSummaryV2[] } | null>(null);
  const [v2GlyphEnvelope, setV2GlyphEnvelope] = useState<{ ownerUid: string; value: Record<string, ShootingProfileViewerRecordV2> } | null>(null);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2Error, setV2Error] = useState<string | null>(null);
  const [v2Notice, setV2Notice] = useState<string | null>(null);
  const [deletingProfileEnvelope, setDeletingProfileEnvelope] = useState<{ ownerUid: string; value: { profileId: string; token: number } } | null>(null);
  const [v2UiOwnerUid, setV2UiOwnerUid] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  const [accountOpen, setAccountOpen] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const currentOwnerUidRef = useRef<string | null>(null);
  const v1LoadGenerationRef = useRef(0);
  const v2LoadGenerationRef = useRef(0);
  const v2GlyphGenerationRef = useRef(0);
  const v2DeleteInFlightRef = useRef<OwnerOperationToken | null>(null);
  const v2DeleteTokenRef = useRef(0);
  currentOwnerUidRef.current = user?.uid ?? null;

  const currentOwnerUid = user?.uid ?? null;
  const poses = valueForExactOwner(currentOwnerUid, v1RecordEnvelope) ?? [];
  const v2Records = valueForExactOwner(currentOwnerUid, v2RecordEnvelope) ?? [];
  const v2Glyphs = valueForExactOwner(currentOwnerUid, v2GlyphEnvelope) ?? {};
  const selectedPose = valueForExactOwner(currentOwnerUid, selectedPoseEnvelope) ?? null;
  const v1OwnerPending = currentOwnerUid !== null
    && v1RecordEnvelope?.ownerUid !== currentOwnerUid
    && v1UiOwnerUid !== currentOwnerUid;
  const v2OwnerPending = currentOwnerUid !== null
    && v2RecordEnvelope?.ownerUid !== currentOwnerUid
    && v2UiOwnerUid !== currentOwnerUid;
  const visibleV1Loading = v1OwnerPending || (v1UiOwnerUid === currentOwnerUid && v1Loading);
  const visibleV1Error = v1UiOwnerUid === currentOwnerUid ? v1Error : null;
  const visibleV2Loading = v2OwnerPending || (v2UiOwnerUid === currentOwnerUid && v2Loading);
  const visibleV2Error = v2UiOwnerUid === currentOwnerUid ? v2Error : null;
  const visibleV2Notice = v2UiOwnerUid === currentOwnerUid ? v2Notice : null;
  const visibleDeletingProfileId = valueForExactOwner(currentOwnerUid, deletingProfileEnvelope)?.profileId ?? null;
  const goalLabel = profile.goal === "release" ? "릴리스" : profile.goal === "range" ? "거리" : profile.goal === "rhythm" ? "리듬" : "일관성";
  const contentWidth = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const legacyCaptureOnly = !(FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2);

  const loadV1 = useCallback(async (owner: User) => {
    const ownerUid = owner.uid;
    const generation = ++v1LoadGenerationRef.current;
    setV1UiOwnerUid(ownerUid);
    setV1Loading(true);
    setV1Error(null);
    try {
      const nextPoses = await listFirebasePrivatePoses(owner);
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v1LoadGenerationRef.current, generation)) return;
      setV1RecordEnvelope({ ownerUid, value: nextPoses });
    } catch {
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v1LoadGenerationRef.current, generation)) return;
      setV1Error("기존 단일 시점 분석을 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.");
    } finally {
      if (ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v1LoadGenerationRef.current, generation)) setV1Loading(false);
    }
  }, []);

  const loadV2 = useCallback(async (owner: User) => {
    if (!FORMPATH_FLAGS.profileV2) return;
    const ownerUid = owner.uid;
    const generation = ++v2LoadGenerationRef.current;
    setV2UiOwnerUid(ownerUid);
    setV2Loading(true);
    setV2Error(null);
    setV2Notice(null);
    try {
      await resumePendingShootingProfileDeletionsV2(owner);
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2LoadGenerationRef.current, generation)) return;
      const records = await listShootingProfilesV2(owner);
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2LoadGenerationRef.current, generation)) return;
      setV2RecordEnvelope({ ownerUid, value: records });
    } catch {
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2LoadGenerationRef.current, generation)) return;
      setV2Error("대표 슛폼 삭제 복구 또는 목록 불러오기를 완료하지 못했습니다. 연결을 확인해 주세요.");
    } finally {
      if (ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2LoadGenerationRef.current, generation)) setV2Loading(false);
    }
  }, []);

  /**
   * Full records for the hero and the grid tiles. Read-only, owner-bound and
   * generation-guarded like the list; a stale result for a previous owner is
   * dropped, and a failed tile simply stays a placeholder.
   */
  const loadV2Glyphs = useCallback(async (owner: User, profileIds: readonly string[]) => {
    if (!FORMPATH_FLAGS.profileV2) return;
    const ownerUid = owner.uid;
    const generation = ++v2GlyphGenerationRef.current;
    for (const profileId of profileIds) {
      if (!isOpaqueShootingProfileIdV2(profileId)) continue;
      let record: ShootingProfileViewerRecordV2 | null = null;
      try {
        record = await getShootingProfileV2(owner, profileId);
      } catch {
        record = null;
      }
      if (!ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, v2GlyphGenerationRef.current, generation)) return;
      if (!record) continue;
      const loaded = record;
      setV2GlyphEnvelope((envelope) => ({
        ownerUid,
        value: { ...(envelope?.ownerUid === ownerUid ? envelope.value : {}), [profileId]: loaded },
      }));
    }
  }, []);

  useEffect(() => {
    const active = v2DeleteInFlightRef.current;
    if (active && active.ownerUid !== currentOwnerUid) {
      v2DeleteInFlightRef.current = null;
    }
    setDeletingProfileEnvelope((envelope) => envelope?.ownerUid === currentOwnerUid
      ? envelope
      : null);
  }, [currentOwnerUid]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      v1LoadGenerationRef.current += 1;
      setV1RecordEnvelope(null);
      setSelectedPoseEnvelope(null);
      setV1UiOwnerUid(null);
      setV1Error(null);
      setV1Loading(false);
      return;
    }
    void loadV1(user);
  }, [loadV1, loading, user]);

  useEffect(() => {
    if (loading) return;
    if (!FORMPATH_FLAGS.profileV2 || !user) {
      v2LoadGenerationRef.current += 1;
      v2GlyphGenerationRef.current += 1;
      setV2RecordEnvelope(null);
      setV2GlyphEnvelope(null);
      setV2UiOwnerUid(null);
      setV2Error(null);
      setV2Notice(null);
      setV2Loading(false);
      setDeletingProfileEnvelope(null);
      return;
    }
    void loadV2(user);
  }, [loadV2, loading, user]);

  useEffect(() => {
    if (!user || v2RecordEnvelope?.ownerUid !== user.uid) return;
    const loaded = v2GlyphEnvelope?.ownerUid === user.uid ? v2GlyphEnvelope.value : {};
    const missing = v2RecordEnvelope.value
      .slice(0, GLYPH_FETCH_LIMIT)
      .map((record) => record.id)
      .filter((profileId) => !(profileId in loaded));
    if (missing.length === 0) return;
    void loadV2Glyphs(user, missing);
  }, [loadV2Glyphs, user, v2GlyphEnvelope, v2RecordEnvelope]);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setStatus("이메일과 6자 이상 비밀번호를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
    } catch (error) {
      setStatus(firebaseMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const deletePose = async (poseId: string) => {
    const owner = user;
    if (!owner) return;
    const ownerUid = owner.uid;
    try {
      await removeFirebasePrivatePose(owner, poseId);
      if (currentOwnerUidRef.current !== ownerUid) return;
      if (selectedPose?.id === poseId) setSelectedPoseEnvelope(null);
      await loadV1(owner);
    } catch {
      if (currentOwnerUidRef.current === ownerUid) {
        setV1Error("기존 단일 시점 분석을 삭제하지 못했습니다. 연결을 확인해 주세요.");
      }
    }
  };

  const deleteV2 = useCallback(async (profileId: string) => {
    const owner = user;
    if (
      !FORMPATH_FLAGS.profileV2
      || !owner
      || currentOwnerUidRef.current !== owner.uid
      || !isOpaqueShootingProfileIdV2(profileId)
      || v2DeleteInFlightRef.current?.ownerUid === owner.uid
    ) return;
    const ownerUid = owner.uid;
    const token = ++v2DeleteTokenRef.current;
    v2DeleteInFlightRef.current = { ownerUid, profileId, token };
    setV2UiOwnerUid(ownerUid);
    setDeletingProfileEnvelope({ ownerUid, value: { profileId, token } });
    setV2Error(null);
    setV2Notice(null);
    await runOwnerBoundDeleteOperationV2({
      deleteProfile: () => deleteShootingProfileV2(owner, profileId),
      isCurrent: () => ownerOperationMatches(
        currentOwnerUidRef.current,
        v2DeleteInFlightRef.current,
        token,
      ),
      onSucceeded: () => {
        setV2RecordEnvelope((envelope) => envelope?.ownerUid === ownerUid
          ? { ownerUid, value: envelope.value.filter((record) => record.id !== profileId) }
          : envelope);
        setV2GlyphEnvelope((envelope) => {
          if (envelope?.ownerUid !== ownerUid) return envelope;
          const { [profileId]: _removed, ...rest } = envelope.value;
          return { ownerUid, value: rest };
        });
        setV2Notice("대표 슛폼과 연결된 파생 비공개 데이터를 삭제했습니다.");
      },
      onFailed: () => {
        setV2Error("대표 슛폼 삭제를 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      },
      onFinally: () => {
        const active = v2DeleteInFlightRef.current;
        const next = clearOwnerOperationIfMatching(active, token);
        if (next === active) return;
        v2DeleteInFlightRef.current = next;
        setDeletingProfileEnvelope(null);
      },
    });
  }, [user]);

  const confirmDeleteV2 = useCallback((profileId: string) => {
    if (!FORMPATH_FLAGS.profileV2 || !isOpaqueShootingProfileIdV2(profileId)) return;
    Alert.alert(
      "대표 슛폼 삭제",
      "정규화된 2D 관찰값과 대표 추정치를 포함한 이 비공개 기록을 삭제할까요?",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => { void deleteV2(profileId); } },
      ],
    );
  }, [deleteV2]);

  const openV2 = useCallback((profileId: string) => {
    if (
      !FORMPATH_FLAGS.profileV2
      || !FORMPATH_FLAGS.representative4DViewer
      || !isOpaqueShootingProfileIdV2(profileId)
    ) return;
    router.push(`/private-analysis/${profileId}` as never);
  }, [router]);

  const selectedFluid = selectedPose ? privatePoseFluid(selectedPose) : null;
  const latestSummary = v2Records[0];
  const latestRecord = latestSummary ? v2Glyphs[latestSummary.id] : undefined;
  // With V2 persistence off there is nothing to load, so the hero must not wait on it.
  const v2HeroLoading = FORMPATH_FLAGS.profileV2 && (visibleV2Loading || (latestSummary !== undefined && !latestRecord));
  const heroState: ProfileHeroState = !user
    ? "signed-out"
    : loading || v2HeroLoading
      ? "loading"
      : latestRecord
        ? "ready"
        : "empty";
  const accountVisible = !user || accountOpen;

  return (
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <ScrollView contentContainerStyle={[styles.page, { width: contentWidth }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>{user ? "내 슛폼" : "프로필"}</Text>
          <Pressable
            accessibilityLabel={user ? (accountOpen ? "계정 닫기" : "계정") : "로그인"}
            accessibilityRole="button"
            accessibilityState={{ disabled: false, expanded: accountVisible }}
            aria-expanded={accountVisible}
            disabled={false}
            focusable
            onBlur={() => setFocusedControl((current) => current === "account" ? null : current)}
            onFocus={() => setFocusedControl("account")}
            onPress={() => setAccountOpen((open) => !open)}
            style={({ pressed }) => [styles.iconButton, focusStyle(focusedControl === "account"), pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={user ? "account-circle-outline" : "login"} size={24} color={tokens.foreground} />
          </Pressable>
        </View>

        <ProfileHero onViewChange={setHeroView} record={latestRecord} state={heroState} view={heroView} width={contentWidth} />
        <ProfileStats
          locked={!user}
          stats={[
            { value: FORMPATH_FLAGS.profileV2 ? v2Records.length : 0, label: "대표 슛폼" },
            { value: poses.length, label: "기존 분석" },
          ]}
        />
        <Text style={styles.goalLine}>목표 · {goalLabel}</Text>

        {user && profileSync?.status === "failed" ? (
          <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.syncWarning}>
            <Text style={styles.syncWarningText}>{profileSync.message}</Text>
          </View>
        ) : null}

        {FORMPATH_FLAGS.profileV2 ? (
          <View style={styles.section}>
            {loading ? <Text accessibilityLiveRegion="polite" style={styles.stateText}>계정 상태를 확인하는 중</Text> : !user ? null : (
              <>
                <MotionGrid
                  canOpen={FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer}
                  deletingProfileId={visibleDeletingProfileId}
                  error={visibleV2Error}
                  glyphs={v2Glyphs}
                  loading={visibleV2Loading}
                  onDelete={confirmDeleteV2}
                  onOpen={openV2}
                  records={v2Records}
                  width={contentWidth}
                />
                {visibleV2Notice ? <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{visibleV2Notice}</Text> : null}
              </>
            )}
          </View>
        ) : null}

        {user && !loading ? (
          <View style={styles.section}>
            {visibleV1Loading ? <Text accessibilityLiveRegion="polite" style={styles.stateText}>기존 분석을 불러오는 중</Text> : null}
            {visibleV1Error ? <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{visibleV1Error}</Text> : null}
            {!visibleV1Loading && poses.length ? poses.map((pose) => (
              <View key={pose.id} style={styles.poseRow}>
                <Pressable
                  accessibilityLabel={`${pose.sourceLabel} 기존 단일 시점 분석 열기`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: false }}
                  disabled={false}
                  focusable
                  onBlur={() => setFocusedControl((current) => current === `v1-open-${pose.id}` ? null : current)}
                  onFocus={() => setFocusedControl(`v1-open-${pose.id}`)}
                  onPress={() => setSelectedPoseEnvelope({ ownerUid: user.uid, value: pose })}
                  style={({ pressed }) => [styles.poseSelect, focusStyle(focusedControl === `v1-open-${pose.id}`), pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="human" size={20} color={tokens.mutedForeground} />
                  <Text numberOfLines={1} style={styles.poseName}>{pose.sourceLabel}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${pose.sourceLabel} 기존 단일 시점 분석 삭제`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: false }}
                  disabled={false}
                  focusable
                  onBlur={() => setFocusedControl((current) => current === `v1-delete-${pose.id}` ? null : current)}
                  onFocus={() => setFocusedControl(`v1-delete-${pose.id}`)}
                  onPress={() => void deletePose(pose.id)}
                  style={({ pressed }) => [styles.deleteButton, focusStyle(focusedControl === `v1-delete-${pose.id}`), pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={tokens.destructive} />
                </Pressable>
              </View>
            )) : null}
            {selectedFluid ? <View style={styles.viewerWrap}><PoseMotionViewer motion={selectedFluid.motion} title={selectedPose?.sourceLabel ?? "개인 스켈레톤"} boundary="개인 영상 기반 보정 fluid analysis · 실제 측정 3D·추천 사용 아님 · 본인 계정만 접근" hand="right" sourcePhaseTimestampsMs={selectedFluid.sourcePhaseTimestampsMs} /></View> : null}
            {legacyCaptureOnly ? <PrivatePoseCapture key={user.uid} onSaved={() => loadV1(user)} /> : null}
          </View>
        ) : null}

        {accountVisible ? (
          <AccountPanel
            configured={configured}
            email={email}
            focusedControl={focusedControl}
            loading={loading}
            mode={mode}
            onEmailChange={setEmail}
            onFocusChange={setFocusedControl}
            onLogout={() => void logout()}
            onPasswordChange={setPassword}
            onSubmit={() => void submit()}
            onToggleMode={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setStatus(null); }}
            password={password}
            status={status}
            submitting={submitting}
            user={user}
          />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function firebaseMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("operation-not-allowed")) return "Firebase Console에서 이메일/비밀번호 로그인을 활성화하세요.";
  if (code.includes("email-already-in-use")) return "이미 사용 중인 이메일입니다. 로그인해 주세요.";
  if (code.includes("invalid-credential")) return "이메일 또는 비밀번호를 확인하세요.";
  if (code.includes("network")) return "네트워크 연결을 확인하세요.";
  return "계정 처리에 실패했습니다. 잠시 후 다시 시도하세요.";
}

function privatePoseFluid(pose: FirebasePrivatePose): { motion: PoseMotion; sourcePhaseTimestampsMs: number[] } | null {
  try {
    if (pose.correctedMotionJson) {
      const correction = pose.correctionJson ? JSON.parse(pose.correctionJson) as PersonalPoseCorrection : null;
      return { motion: JSON.parse(pose.correctedMotionJson) as PoseMotion, sourcePhaseTimestampsMs: correction?.sourcePhaseTimestampsMs ?? [] };
    }
    const corrected = personalPoseToCorrectedMotion(JSON.parse(pose.poseJson) as PersonalPoseCandidate, `personal-${pose.id}`);
    return corrected ? { motion: corrected.motion, sourcePhaseTimestampsMs: corrected.correction.sourcePhaseTimestampsMs } : null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  topBar: { alignItems: "center", flexDirection: "row", height: 44, justifyContent: "space-between", paddingLeft: 14, paddingRight: 4 },
  title: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 22, letterSpacing: -0.2 },
  iconButton: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  goalLine: { color: tokens.mutedForeground, fontSize: 12.5, paddingHorizontal: 14, paddingTop: 8 },
  syncWarning: { backgroundColor: tokens.warningSoft, borderColor: tokens.warning, borderRadius: 10, borderWidth: 1, marginHorizontal: 14, marginTop: 10, padding: 10 },
  syncWarningText: { color: tokens.warning, fontSize: 12, lineHeight: 17 },
  section: { marginTop: 14 },
  stateText: { color: tokens.mutedForeground, fontSize: 13, marginVertical: 14, textAlign: "center" },
  noticeText: { color: tokens.positive, fontSize: 12, lineHeight: 18, paddingHorizontal: 14, paddingTop: 8 },
  errorText: { color: tokens.destructive, fontSize: 12, lineHeight: 17, paddingHorizontal: 14 },
  poseRow: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 4 },
  poseSelect: { alignItems: "center", borderRadius: 10, flex: 1, flexDirection: "row", gap: 10, minHeight: 48, minWidth: 44, paddingHorizontal: 6 },
  poseName: { color: tokens.foreground, flex: 1, fontSize: 14 },
  deleteButton: { alignItems: "center", borderRadius: 10, height: 48, justifyContent: "center", minHeight: 48, minWidth: 48, width: 48 },
  viewerWrap: { marginHorizontal: 14, marginTop: 10 },
  pressed: { opacity: 0.75 },
});
