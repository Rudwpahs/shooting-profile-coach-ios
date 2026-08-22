import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CaptureSession } from "@/components/shooting-profile/capture-session";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import {
  saveShootingProfileV2,
  type SaveShootingProfileInputV2,
} from "@/lib/firebase-shooting-profiles";

export default function PrivateCaptureRoute() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseAuth();
  const captureEnabled = FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2;

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/profile");
  }, [router]);

  const complete = useCallback((savedProfileId: string) => {
    if (
      FORMPATH_FLAGS.profileV2
      && FORMPATH_FLAGS.captureV2
      && FORMPATH_FLAGS.representative4DViewer
      && isOpaqueShootingProfileIdV2(savedProfileId)
    ) {
      router.replace(`/private-analysis/${savedProfileId}` as never);
      return;
    }
    router.replace("/profile");
  }, [router]);

  const saveProfile = useCallback((input: SaveShootingProfileInputV2) => {
    if (!user) return Promise.reject(new Error("signed-in owner is required"));
    return saveShootingProfileV2(user, input);
  }, [user]);

  if (!captureEnabled || (!authLoading && !user)) return <Redirect href="/profile" />;

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#9A3412" size="large" />
        <Text accessibilityLiveRegion="polite" style={styles.loadingTitle}>로그인 상태를 확인하는 중</Text>
        <Text style={styles.loadingCopy}>비공개 대표 슛폼 저장 공간을 안전하게 준비하고 있습니다.</Text>
      </View>
    );
  }

  return (
    <CaptureSession
      key={user?.uid ?? "missing-owner"}
      completionActionLabel={FORMPATH_FLAGS.representative4DViewer ? "저장된 대표 슛폼 열기" : "내 기록으로 돌아가기"}
      onClose={close}
      onComplete={complete}
      saveProfile={saveProfile}
    />
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", backgroundColor: "#F5F1E8", flex: 1, justifyContent: "center", padding: 24 },
  loadingTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 25, marginTop: 14, textAlign: "center" },
  loadingCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 5, textAlign: "center" },
});
