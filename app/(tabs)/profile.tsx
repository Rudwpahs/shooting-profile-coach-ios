import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PrivatePoseCapture } from "@/components/private-pose-capture";
import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { listFirebasePrivatePoses, removeFirebasePrivatePose, type FirebasePrivatePose } from "@/lib/firebase-private-data";
import { personalPoseToMotion, type PersonalPoseCandidate } from "@/lib/personal-pose";
import { useProfile } from "@/lib/profile-store";
import { useRouter } from "expo-router";

export default function PersonalProfileTab() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading, configured, signIn, signUp, logout } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [poses, setPoses] = useState<FirebasePrivatePose[]>([]);
  const [posesLoading, setPosesLoading] = useState(false);
  const [selectedPose, setSelectedPose] = useState<FirebasePrivatePose | null>(null);
  const goalLabel = profile.goal === "release" ? "릴리스" : profile.goal === "range" ? "거리" : profile.goal === "rhythm" ? "리듬" : "일관성";

  const loadPoses = async () => {
    if (!user) { setPoses([]); return; }
    setPosesLoading(true);
    try { setPoses(await listFirebasePrivatePoses(user)); } catch (error) { setStatus(error instanceof Error ? error.message : "개인 데이터를 불러오지 못했습니다."); } finally { setPosesLoading(false); }
  };
  useEffect(() => { void loadPoses(); }, [user?.uid]);
  const submit = async () => {
    if (!email.trim() || password.length < 6) { setStatus("이메일과 6자 이상 비밀번호를 입력하세요."); return; }
    setSubmitting(true); setStatus(null);
    try { if (mode === "signin") await signIn(email, password); else await signUp(email, password); } catch (error) { setStatus(firebaseMessage(error)); } finally { setSubmitting(false); }
  };
  const deletePose = async (poseId: string) => { if (!user) return; try { await removeFirebasePrivatePose(user, poseId); if (selectedPose?.id === poseId) setSelectedPose(null); await loadPoses(); } catch (error) { setStatus(error instanceof Error ? error.message : "스켈레톤을 삭제하지 못했습니다."); } };
  const selectedMotion = selectedPose ? personalPoseToMotion(JSON.parse(selectedPose.poseJson) as PersonalPoseCandidate, `personal-${selectedPose.id}`) : null;

  return <ScreenContainer containerClassName="bg-background">
    <View style={styles.canvas}><View style={styles.topArc} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={styles.kicker}>FORMPATH / PRIVATE VAULT</Text><Text style={styles.title}>내 기록</Text></View><View style={styles.lockChip}><MaterialIcons name="lock-outline" size={15} color="#F5F1E8" /><Text style={styles.lockChipText}>PRIVATE</Text></View></View>

      <View style={styles.identityCard}>
        <View style={styles.identityTop}><View style={styles.avatar}><Text style={styles.avatarText}>{(user?.email?.[0] ?? "F").toUpperCase()}</Text></View><View style={styles.identityCopy}><Text style={styles.name}>{user?.email?.split("@")[0] ?? "나의 훈련 기록"}</Text><Text style={styles.identityDetail}>{user ? "개인 저장공간 연결됨" : "계정을 연결하면 분석을 보관합니다"}</Text></View><MaterialIcons name={user ? "verified-user" : "person-outline"} size={23} color={user ? "#7AD8B7" : "#F97316"} /></View>
        <View style={styles.metricRail}><VaultMetric value={goalLabel} label="목표" /><VaultMetric value={user ? String(poses.length) : "—"} label="저장 모션" /><VaultMetric value={user ? "연결" : "대기"} label="계정" /></View>
      </View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>MY MOTIONS</Text><Text style={styles.sectionTitle}>개인 분석</Text></View><Text style={styles.sectionCount}>{user ? `${poses.length}개` : "LOCKED"}</Text></View>
      <View style={styles.vaultCard}>
        {loading ? <ActivityIndicator color="#F97316" style={styles.loader} /> : !user ? <LockedEmpty /> : posesLoading ? <ActivityIndicator color="#F97316" style={styles.loader} /> : poses.length ? <>{poses.map((pose) => <View key={pose.id} style={styles.poseRow}><Pressable onPress={() => setSelectedPose(pose)} style={({ pressed }) => [styles.poseSelect, pressed && styles.pressed]}><View style={styles.poseIcon}><MaterialIcons name="accessibility-new" size={20} color="#F97316" /></View><View style={styles.poseCopy}><Text style={styles.poseName}>{pose.sourceLabel}</Text><Text style={styles.poseMeta}>개인 단일 시점 analysis</Text></View><MaterialIcons name="chevron-right" size={22} color="#102235" /></Pressable><Pressable onPress={() => void deletePose(pose.id)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]} accessibilityLabel={`${pose.sourceLabel} 삭제`}><MaterialIcons name="delete-outline" size={20} color="#C74B11" /></Pressable></View>)}{selectedMotion ? <View style={styles.viewerWrap}><PoseMotionViewer motion={selectedMotion} title={selectedPose?.sourceLabel ?? "개인 스켈레톤"} boundary="개인 영상 기반 analysis · 실제 측정 3D·추천 사용 아님 · 본인 계정만 접근" hand="right" /></View> : null}<PrivatePoseCapture onSaved={loadPoses} /></> : <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="add" size={26} color="#F97316" /></View><Text style={styles.emptyTitle}>첫 분석을 저장하세요</Text><Text style={styles.emptyCopy}>전신 슈팅 영상을 분석하면 이 vault에 본인만 볼 수 있는 기록으로 저장됩니다.</Text><Pressable onPress={() => router.navigate("/motion" as never)} style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}><Text style={styles.emptyActionText}>모션 랩 열기</Text><MaterialIcons name="arrow-forward" size={17} color="#0B1623" /></Pressable><PrivatePoseCapture onSaved={loadPoses} /></View>}</View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>ACCOUNT ACCESS</Text><Text style={styles.sectionTitle}>계정 연결</Text></View><MaterialIcons name="security" size={20} color="#1D9B77" /></View>
      <View style={styles.accountCard}>
        {loading ? <ActivityIndicator color="#F97316" style={styles.loader} /> : !configured ? <Text style={styles.accountCopy}>Firebase client 설정이 누락되었습니다. 환경 변수를 다시 확인하세요.</Text> : !user ? <View style={styles.authForm}><Text style={styles.accountCopy}>로그인하면 개인 스켈레톤과 분석 이력을 독립 Firebase private space에 저장합니다.</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="이메일" placeholderTextColor="#8D9AA6" style={styles.input} /><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="비밀번호 (6자 이상)" placeholderTextColor="#8D9AA6" style={styles.input} />{status ? <Text style={styles.errorText}>{status}</Text> : null}<Pressable disabled={submitting} onPress={() => void submit()} style={({ pressed }) => [styles.authButton, submitting && styles.disabled, pressed && styles.pressed]}><Text style={styles.authButtonText}>{submitting ? "처리 중" : mode === "signin" ? "로그인" : "회원가입"}</Text><MaterialIcons name="arrow-forward" size={18} color="#0B1623" /></Pressable><Pressable onPress={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setStatus(null); }} style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}><Text style={styles.modeButtonText}>{mode === "signin" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}</Text></Pressable></View> : <View><Text style={styles.accountCopy}>{user.email} 계정으로 연결되었습니다. 개인 motion과 analysis는 본인의 UID 경로에서만 접근합니다.</Text>{status ? <Text style={styles.errorText}>{status}</Text> : null}<Pressable onPress={() => void logout()} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}><Text style={styles.logoutText}>로그아웃</Text></Pressable></View>}
      </View>
    </ScrollView>
  </ScreenContainer>;
}

function VaultMetric({ value, label }: { value: string; label: string }) { return <View style={styles.vaultMetric}><Text style={styles.vaultMetricValue}>{value}</Text><Text style={styles.vaultMetricLabel}>{label}</Text></View>; }
function LockedEmpty() { return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="lock-outline" size={25} color="#F97316" /></View><Text style={styles.emptyTitle}>vault가 잠겨 있습니다</Text><Text style={styles.emptyCopy}>계정을 연결하면 개인 motion과 분석 이력이 이곳에 보관됩니다.</Text></View>; }
function firebaseMessage(error: unknown) { const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""; if (code.includes("operation-not-allowed")) return "Firebase Console에서 이메일/비밀번호 로그인을 활성화하세요."; if (code.includes("email-already-in-use")) return "이미 사용 중인 이메일입니다. 로그인해 주세요."; if (code.includes("invalid-credential")) return "이메일 또는 비밀번호를 확인하세요."; if (code.includes("network")) return "네트워크 연결을 확인하세요."; return "계정 처리에 실패했습니다. 잠시 후 다시 시도하세요."; }

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
  empty: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 14 },
  emptyIcon: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 14, height: 44, justifyContent: "center", width: 44 },
  emptyTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 21, marginTop: 10 },
  emptyCopy: { color: "#667789", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: "center" },
  emptyAction: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 43, paddingHorizontal: 14 },
  emptyActionText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  poseRow: { alignItems: "center", borderBottomColor: "#E7EDF1", borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 10 },
  poseSelect: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10 },
  poseIcon: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  poseCopy: { flex: 1 },
  poseName: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 17 },
  poseMeta: { color: "#667789", fontFamily: "Barlow", fontSize: 11, marginTop: 1 },
  deleteButton: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 11, height: 36, justifyContent: "center", width: 36 },
  viewerWrap: { marginTop: 12 },
  accountCard: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 19, borderWidth: 1, marginTop: 11, padding: 15 },
  accountCopy: { color: "#667789", fontFamily: "Barlow", fontSize: 13, lineHeight: 19 },
  authForm: { gap: 9 },
  input: { backgroundColor: "#F5F1E8", borderColor: "#D9E0E4", borderRadius: 13, borderWidth: 1, color: "#102235", fontFamily: "Barlow", fontSize: 15, minHeight: 47, paddingHorizontal: 12 },
  authButton: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 3, minHeight: 47 },
  authButtonText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  modeButton: { alignItems: "center", minHeight: 33, justifyContent: "center" },
  modeButtonText: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 13 },
  errorText: { color: "#C24122", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 17 },
  logoutButton: { alignItems: "center", borderColor: "#C74B11", borderRadius: 13, borderWidth: 1, justifyContent: "center", marginTop: 14, minHeight: 43 },
  logoutText: { color: "#C74B11", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
