import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import { PrivatePoseCapture } from "@/components/private-pose-capture";
import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ShootingProfileList } from "@/components/shooting-profile/profile-list";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { listFirebasePrivatePoses, removeFirebasePrivatePose, type FirebasePrivatePose } from "@/lib/firebase-private-data";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import {
  deleteShootingProfileV2,
  listShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2,
  type ShootingProfileSummaryV2,
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

function focusStyle(focused: boolean, dark = false): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: dark ? "#FFFFFF" : "#102235",
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: "#F97316",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

export default function PersonalProfileTab() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading, configured, signIn, signUp, logout } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [v1RecordEnvelope, setV1RecordEnvelope] = useState<{ ownerUid: string; value: FirebasePrivatePose[] } | null>(null);
  const [v1Loading, setV1Loading] = useState(false);
  const [v1Error, setV1Error] = useState<string | null>(null);
  const [v1UiOwnerUid, setV1UiOwnerUid] = useState<string | null>(null);
  const [selectedPoseEnvelope, setSelectedPoseEnvelope] = useState<{ ownerUid: string; value: FirebasePrivatePose } | null>(null);
  const [v2RecordEnvelope, setV2RecordEnvelope] = useState<{ ownerUid: string; value: ShootingProfileSummaryV2[] } | null>(null);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2Error, setV2Error] = useState<string | null>(null);
  const [v2Notice, setV2Notice] = useState<string | null>(null);
  const [deletingProfileEnvelope, setDeletingProfileEnvelope] = useState<{ ownerUid: string; value: { profileId: string; token: number } } | null>(null);
  const [v2UiOwnerUid, setV2UiOwnerUid] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const currentOwnerUidRef = useRef<string | null>(null);
  const v1LoadGenerationRef = useRef(0);
  const v2LoadGenerationRef = useRef(0);
  const v2DeleteInFlightRef = useRef<OwnerOperationToken | null>(null);
  const v2DeleteTokenRef = useRef(0);
  currentOwnerUidRef.current = user?.uid ?? null;

  const currentOwnerUid = user?.uid ?? null;
  const poses = valueForExactOwner(currentOwnerUid, v1RecordEnvelope) ?? [];
  const v2Records = valueForExactOwner(currentOwnerUid, v2RecordEnvelope) ?? [];
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
  const visibleRecordCount = poses.length + (FORMPATH_FLAGS.profileV2 ? v2Records.length : 0);

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
      setV2RecordEnvelope(null);
      setV2UiOwnerUid(null);
      setV2Error(null);
      setV2Notice(null);
      setV2Loading(false);
      setDeletingProfileEnvelope(null);
      return;
    }
    void loadV2(user);
  }, [loadV2, loading, user]);

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

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.canvas}><View style={styles.topArc} /></View>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.kicker}>FORMPATH / PRIVATE VAULT</Text><Text style={styles.title}>내 기록</Text></View>
          <View style={styles.lockChip}><MaterialIcons name="lock-outline" size={15} color="#F5F1E8" /><Text style={styles.lockChipText}>PRIVATE</Text></View>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.identityTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.email?.[0] ?? "F").toUpperCase()}</Text></View>
            <View style={styles.identityCopy}><Text style={styles.name}>{user?.email?.split("@")[0] ?? "나의 훈련 기록"}</Text><Text style={styles.identityDetail}>{user ? "개인 저장공간 연결됨" : "계정을 연결하면 분석을 보관합니다"}</Text></View>
            <MaterialIcons name={user ? "verified-user" : "person-outline"} size={23} color={user ? "#7AD8B7" : "#F97316"} />
          </View>
          <View style={styles.metricRail}><VaultMetric value={goalLabel} label="목표" /><VaultMetric value={user ? String(visibleRecordCount) : "—"} label="저장 모션" /><VaultMetric value={user ? "연결" : "대기"} label="계정" /></View>
        </View>

        {FORMPATH_FLAGS.profileV2 ? (
          <>
            <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>REPRESENTATIVE V2</Text><Text style={styles.sectionTitle}>대표 슛폼</Text></View><Text style={styles.sectionCount}>{user ? `${v2Records.length}개` : "LOCKED"}</Text></View>
            <View style={styles.vaultCard}>
              {loading ? <Text accessibilityLiveRegion="polite" style={styles.stateText}>계정 상태를 확인하는 중</Text> : !user ? <LockedEmpty /> : (
                <>
                  <ShootingProfileList
                    canOpen={FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer}
                    deletingProfileId={visibleDeletingProfileId}
                    error={visibleV2Error}
                    loading={visibleV2Loading}
                    onDelete={confirmDeleteV2}
                    onOpen={openV2}
                    records={v2Records}
                  />
                  {visibleV2Notice ? <Text accessibilityLiveRegion="polite" style={styles.successText}>{visibleV2Notice}</Text> : null}
                </>
              )}
            </View>
          </>
        ) : null}

        <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>MY MOTIONS</Text><Text style={styles.sectionTitle}>개인 분석</Text></View><Text style={styles.sectionCount}>{user ? `${poses.length}개` : "LOCKED"}</Text></View>
        <View style={styles.vaultCard}>
          {loading ? <ActivityIndicator color="#F97316" style={styles.loader} /> : !user ? <LockedEmpty /> : (
            <>
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
                    <View style={styles.poseIcon}><MaterialIcons name="accessibility-new" size={20} color="#F97316" /></View>
                    <View style={styles.poseCopy}><Text style={styles.poseName}>{pose.sourceLabel}</Text><Text style={styles.poseMeta}>기존 단일 시점 분석</Text></View>
                    <MaterialIcons name="chevron-right" size={22} color="#102235" />
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
                    <MaterialIcons name="delete-outline" size={20} color="#C74B11" />
                    <Text style={styles.srDeleteText}>삭제</Text>
                  </Pressable>
                </View>
              )) : null}
              {!visibleV1Loading && !visibleV1Error && !poses.length ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}><MaterialIcons name="add" size={26} color="#F97316" /></View>
                  <Text accessibilityLiveRegion="polite" style={styles.emptyTitle}>저장된 분석이 없습니다</Text>
                  <Text style={styles.emptyCopy}>기존 분석의 클라우드 저장은 현재 사용할 수 없습니다. 영상 분석은 기기 안에서 계속 실행되며, 이미 저장된 기록은 여기서 확인하고 삭제할 수 있습니다.</Text>
                  <Pressable
                    accessibilityLabel="모션 랩 열기"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: false }}
                    disabled={false}
                    focusable
                    onBlur={() => setFocusedControl((current) => current === "motion" ? null : current)}
                    onFocus={() => setFocusedControl("motion")}
                    onPress={() => router.navigate("/motion" as never)}
                    style={({ pressed }) => [styles.emptyAction, focusStyle(focusedControl === "motion"), pressed && styles.pressed]}
                  >
                    <Text style={styles.emptyActionText}>모션 랩 열기</Text><MaterialIcons name="arrow-forward" size={17} color="#0B1623" />
                  </Pressable>
                </View>
              ) : null}
              {selectedFluid ? <View style={styles.viewerWrap}><PoseMotionViewer motion={selectedFluid.motion} title={selectedPose?.sourceLabel ?? "개인 스켈레톤"} boundary="개인 영상 기반 보정 fluid analysis · 실제 측정 3D·추천 사용 아님 · 본인 계정만 접근" hand="right" sourcePhaseTimestampsMs={selectedFluid.sourcePhaseTimestampsMs} /></View> : null}
              <PrivatePoseCapture key={user.uid} onSaved={() => loadV1(user)} />
            </>
          )}
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>ACCOUNT ACCESS</Text><Text style={styles.sectionTitle}>계정 연결</Text></View><MaterialIcons name="security" size={20} color="#1D9B77" /></View>
        <View style={styles.accountCard}>
          {loading ? <ActivityIndicator color="#F97316" style={styles.loader} /> : !configured ? <Text style={styles.accountCopy}>Firebase client 설정이 누락되었습니다. 환경 변수를 다시 확인하세요.</Text> : !user ? (
            <View style={styles.authForm}>
              <Text style={styles.accountCopy}>로그인하면 개인 스켈레톤과 분석 이력을 독립 Firebase private space에 저장합니다.</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="이메일" placeholderTextColor="#8D9AA6" style={styles.input} />
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="비밀번호 (6자 이상)" placeholderTextColor="#8D9AA6" style={styles.input} />
              {status ? <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{status}</Text> : null}
              <Pressable
                accessibilityLabel={mode === "signin" ? "계정 로그인" : "계정 회원가입"}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                focusable
                onBlur={() => setFocusedControl((current) => current === "submit" ? null : current)}
                onFocus={() => setFocusedControl("submit")}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.authButton, focusStyle(focusedControl === "submit", true), submitting && styles.disabled, pressed && !submitting && styles.pressed]}
              >
                <Text accessibilityLiveRegion="polite" style={styles.authButtonText}>{submitting ? "처리 중" : mode === "signin" ? "로그인" : "회원가입"}</Text><MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable
                accessibilityLabel={mode === "signin" ? "회원가입 화면으로 전환" : "로그인 화면으로 전환"}
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
                disabled={false}
                focusable
                onBlur={() => setFocusedControl((current) => current === "auth-mode" ? null : current)}
                onFocus={() => setFocusedControl("auth-mode")}
                onPress={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setStatus(null); }}
                style={({ pressed }) => [styles.modeButton, focusStyle(focusedControl === "auth-mode"), pressed && styles.pressed]}
              >
                <Text style={styles.modeButtonText}>{mode === "signin" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={styles.accountCopy}>{user.email} 계정으로 연결되었습니다. 개인 motion과 analysis는 본인의 UID 경로에서만 접근합니다.</Text>
              {status ? <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{status}</Text> : null}
              <Pressable
                accessibilityLabel="계정 로그아웃"
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
                disabled={false}
                focusable
                onBlur={() => setFocusedControl((current) => current === "logout" ? null : current)}
                onFocus={() => setFocusedControl("logout")}
                onPress={() => void logout()}
                style={({ pressed }) => [styles.logoutButton, focusStyle(focusedControl === "logout"), pressed && styles.pressed]}
              >
                <Text style={styles.logoutText}>로그아웃</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function VaultMetric({ value, label }: { value: string; label: string }) {
  return <View style={styles.vaultMetric}><Text style={styles.vaultMetricValue}>{value}</Text><Text style={styles.vaultMetricLabel}>{label}</Text></View>;
}

function LockedEmpty() {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="lock-outline" size={25} color="#F97316" /></View><Text accessibilityLiveRegion="polite" style={styles.emptyTitle}>vault가 잠겨 있습니다</Text><Text style={styles.emptyCopy}>계정을 연결하면 개인 motion과 분석 이력이 이곳에 보관됩니다.</Text></View>;
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
  canvas: { backgroundColor: "#F5F1E8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 },
  topArc: { borderColor: "rgba(249,115,22,0.18)", borderRadius: 260, borderWidth: 1, height: 380, position: "absolute", right: -245, top: -180, width: 380 },
  page: { alignSelf: "center", maxWidth: 680, paddingBottom: 116, paddingHorizontal: 16, paddingTop: 20, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.7 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 45, letterSpacing: -1.1, lineHeight: 49, marginTop: 2 },
  lockChip: { alignItems: "center", backgroundColor: "#102235", borderRadius: 12, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 7 },
  lockChipText: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1 },
  identityCard: { backgroundColor: "#0B1623", borderRadius: 23, marginTop: 20, overflow: "hidden", padding: 18 },
  identityTop: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 17, height: 54, justifyContent: "center", width: 54 },
  avatarText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 27 },
  identityCopy: { flex: 1 },
  name: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 25 },
  identityDetail: { color: "#B6C2CD", fontFamily: "Barlow", fontSize: 12, marginTop: 2 },
  metricRail: { borderTopColor: "rgba(231,237,241,0.14)", borderTopWidth: 1, flexDirection: "row", marginTop: 18, paddingTop: 14 },
  vaultMetric: { alignItems: "center", flex: 1 },
  vaultMetricValue: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 18 },
  vaultMetricLabel: { color: "#8FA2B1", fontFamily: "Barlow-SemiBold", fontSize: 10, marginTop: 1 },
  sectionHead: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 27 },
  sectionKicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.1 },
  sectionTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 28, marginTop: 1 },
  sectionCount: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.8 },
  vaultCard: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 19, borderWidth: 1, marginTop: 11, padding: 13 },
  loader: { marginVertical: 22 },
  stateText: { color: "#61738A", fontFamily: "Barlow-SemiBold", fontSize: 13, marginVertical: 18, textAlign: "center" },
  empty: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 14 },
  emptyIcon: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 14, height: 44, justifyContent: "center", width: 44 },
  emptyTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 21, marginTop: 10 },
  emptyCopy: { color: "#667789", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: "center" },
  emptyAction: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 44, minWidth: 44, paddingHorizontal: 14 },
  emptyActionText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  poseRow: { alignItems: "center", borderBottomColor: "#E7EDF1", borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 8 },
  poseSelect: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 10, minHeight: 56, minWidth: 44, paddingHorizontal: 4 },
  poseIcon: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  poseCopy: { flex: 1 },
  poseName: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 17 },
  poseMeta: { color: "#667789", fontFamily: "Barlow", fontSize: 11, marginTop: 1 },
  deleteButton: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 11, justifyContent: "center", minHeight: 48, minWidth: 48 },
  srDeleteText: { color: "#C74B11", fontFamily: "BarlowCondensed-Bold", fontSize: 10 },
  viewerWrap: { marginTop: 12 },
  accountCard: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 19, borderWidth: 1, marginTop: 11, padding: 15 },
  accountCopy: { color: "#667789", fontFamily: "Barlow", fontSize: 13, lineHeight: 19 },
  authForm: { gap: 9 },
  input: { backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 13, borderWidth: 1, color: "#102235", fontFamily: "Barlow", fontSize: 15, minHeight: 47, paddingHorizontal: 12 },
  authButton: { alignItems: "center", backgroundColor: "#9A3412", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 3, minHeight: 47, minWidth: 44 },
  authButtonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  modeButton: { alignItems: "center", borderRadius: 11, justifyContent: "center", minHeight: 44, minWidth: 44 },
  modeButtonText: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 13 },
  errorText: { color: "#C24122", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 17 },
  successText: { color: "#166534", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: "center" },
  logoutButton: { alignItems: "center", borderColor: "#C74B11", borderRadius: 13, borderWidth: 1, justifyContent: "center", marginTop: 14, minHeight: 44, minWidth: 44 },
  logoutText: { color: "#C74B11", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
