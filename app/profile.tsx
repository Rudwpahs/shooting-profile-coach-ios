import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { personalPoseToMotion, type PersonalPoseCandidate } from "@/lib/personal-pose";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const profileQuery = trpc.personalProfile.get.useQuery(undefined, { enabled: isAuthenticated });
  const posesQuery = trpc.personalProfile.poses.useQuery(undefined, { enabled: isAuthenticated });
  const saveProfile = trpc.personalProfile.save.useMutation({ onSuccess: () => profileQuery.refetch() });
  const removePose = trpc.personalProfile.removePose.useMutation({ onSuccess: () => posesQuery.refetch() });
  const [displayName, setDisplayName] = useState("");

  useEffect(() => { if (profileQuery.data?.displayName) setDisplayName(profileQuery.data.displayName); }, [profileQuery.data?.displayName]);

  return <ScreenContainer>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>← ANALYSIS</Text></Pressable>
      <Text style={styles.eyebrow}>PRIVATE ATHLETE PROFILE</Text>
      <Text style={styles.title}>나의 스켈레톤</Text>
      <Text style={styles.lead}>계정에 저장하는 pose 후보와 분석 이력은 기본값이 비공개입니다. 원본 영상은 이 화면에서 별도로 보관하지 않습니다.</Text>

      {loading ? <ActivityIndicator color="#F97316" /> : !isAuthenticated ? <View style={styles.block}>
        <Text style={styles.blockTitle}>로그인 또는 회원가입</Text>
        <Text style={styles.copy}>한 번의 계정 인증으로 개인 프로필이 자동 생성됩니다. 별도 비밀번호를 앱에 저장하지 않습니다.</Text>
        <Pressable onPress={() => startOAuthLogin()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>계속하기</Text></Pressable>
      </View> : <>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>개인 프로필</Text>
          <Text style={styles.account}>{user?.email ?? user?.name ?? "Signed-in shooter"}</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} placeholder="프로필 이름" style={styles.input} maxLength={80} />
          <View style={styles.actionRow}><Pressable disabled={!displayName.trim() || saveProfile.isPending} onPress={() => saveProfile.mutate({ displayName: displayName.trim() })} style={({ pressed }) => [styles.primary, (!displayName.trim() || saveProfile.isPending) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{saveProfile.isPending ? "저장 중" : "프로필 저장"}</Text></Pressable><Pressable onPress={() => logout()} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>로그아웃</Text></Pressable></View>
        </View>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>개인 3D 스켈레톤 후보</Text>
          <Text style={styles.copy}>pose detection이 통과한 동영상만 여기에 표시됩니다. 단일 시점 결과는 상대 pose이며 계측 3D가 아닙니다.</Text>
          {posesQuery.isLoading ? <ActivityIndicator color="#F97316" /> : posesQuery.data?.length ? posesQuery.data.map((row) => {
            let candidate: PersonalPoseCandidate | null = null;
            try { candidate = JSON.parse(row.poseJson) as PersonalPoseCandidate; } catch { candidate = null; }
            const motion = candidate ? personalPoseToMotion(candidate, `personal-${row.id}`) : null;
            return <View key={row.id} style={styles.poseEntry}>{motion ? <PoseMotionViewer motion={motion} title={row.sourceLabel} boundary="개인 단일 시점 relative pose 후보입니다. 보정된 실측 3D가 아니며 본인 계정에만 저장됩니다." /> : <Text style={styles.copy}>손상되었거나 품질 기준을 통과하지 못한 pose 후보입니다.</Text>}<Pressable onPress={() => removePose.mutate({ id: row.id })} style={({ pressed }) => [styles.danger, pressed && styles.pressed]}><Text style={styles.dangerText}>이 스켈레톤 삭제</Text></Pressable></View>;
          }) : <View style={styles.empty}><Text style={styles.emptyTitle}>아직 저장된 스켈레톤이 없습니다.</Text><Text style={styles.copy}>홈에서 Side 영상을 선택하고 pose detection을 실행하면, 품질 검사를 통과한 개인 스켈레톤 후보가 이곳에 저장됩니다.</Text></View>}
        </View>
      </>}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", gap: 14, maxWidth: 760, padding: 20, paddingBottom: 64, width: "100%" },
  back: { alignSelf: "flex-start", borderColor: "#1E3A5F", borderWidth: 2, paddingHorizontal: 10, paddingVertical: 7 }, backText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 14, letterSpacing: 0.8 },
  eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 46, lineHeight: 48 }, lead: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22 },
  block: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, gap: 12, padding: 18 }, blockTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 27, textTransform: "uppercase" }, copy: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19 }, account: { color: "#1E3A5F", fontFamily: "Barlow-SemiBold", fontSize: 14 }, input: { borderColor: "#DBE3EE", borderWidth: 2, color: "#0F172A", fontFamily: "Barlow", fontSize: 16, minHeight: 46, paddingHorizontal: 12 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, primary: { alignItems: "center", backgroundColor: "#F97316", justifyContent: "center", minHeight: 44, paddingHorizontal: 16 }, primaryText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.5 }, secondary: { alignItems: "center", borderColor: "#1E3A5F", borderWidth: 2, justifyContent: "center", minHeight: 44, paddingHorizontal: 16 }, secondaryText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, disabled: { opacity: 0.45 }, poseEntry: { gap: 10 }, empty: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderStyle: "dashed", borderWidth: 2, gap: 6, padding: 14 }, emptyTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, danger: { alignItems: "center", borderColor: "#C24122", borderWidth: 2, minHeight: 38, justifyContent: "center" }, dangerText: { color: "#C24122", fontFamily: "BarlowCondensed-Bold", fontSize: 14 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
