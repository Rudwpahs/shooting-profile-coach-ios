import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import {
  SequenceViewer,
  buildShootingProfileViewerKey,
  canRenderShootingProfileViewerRecord,
  getRepresentativeFocusStyle,
} from "@/components/shooting-profile/sequence-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import {
  getShootingProfileV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";

const OPAQUE_PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function opaqueProfileId(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value !== value.trim() || !OPAQUE_PROFILE_ID.test(value)) return null;
  return value;
}

type LoadedViewerRecord = NonNullable<ShootingProfileViewerRecordV2>;
type ViewerLoadState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; record: LoadedViewerRecord }
  | { status: "not-found"; key: string }
  | { status: "error"; key: string };

/**
 * 분석, in three layers: the skeleton with its band and one finding (layer 1),
 * the numbers behind it (layer 2, collapsed), and per-joint evidence with the
 * boundary of what the record is (layer 3, collapsed). Access rules are
 * unchanged: both viewer flags, the signed-in owner, an opaque id, and a
 * request key that must still be current when the record arrives.
 */
export default function PrivateAnalysisRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseAuth();
  const profileId = opaqueProfileId(id);
  const currentKey = user && profileId ? buildShootingProfileViewerKey(user.uid, profileId) : null;
  const [loadState, setLoadState] = useState<ViewerLoadState>({ status: "idle" });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const flagsEnabled = FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/profile");
  }, [router]);

  useEffect(() => {
    let active = true;
    if (authLoading) return () => { active = false; };
    if (!flagsEnabled || !user || !profileId || !currentKey) {
      setLoadState({ status: "idle" });
      return () => { active = false; };
    }
    const requestKey = currentKey;
    setLoadState({ status: "loading", key: requestKey });
    void getShootingProfileV2(user, profileId)
      .then((result) => {
        if (!active) return;
        if (result) setLoadState({ status: "ready", key: requestKey, record: result });
        else setLoadState({ status: "not-found", key: requestKey });
      })
      .catch(() => {
        if (active) setLoadState({ status: "error", key: requestKey });
      });
    return () => { active = false; };
  }, [authLoading, currentKey, flagsEnabled, profileId, retryGeneration, user]);

  if (!flagsEnabled || (!authLoading && (!user || !profileId))) {
    return <Redirect href="/profile" />;
  }

  const loadStateKey = "key" in loadState ? loadState.key : undefined;
  const stateIsCurrent = currentKey !== null && loadStateKey === currentKey;

  if (authLoading || !stateIsCurrent || loadState.status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color={tokens.mutedForeground} size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>분석을 불러오는 중</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState.status === "error" || loadState.status === "not-found") {
    const notFound = loadState.status === "not-found";
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>{notFound ? "분석을 찾을 수 없습니다" : "분석을 불러오지 못했습니다"}</Text>
          <Text style={styles.stateCopy}>
            {notFound ? "삭제되었거나 이 계정에서 볼 수 없는 분석입니다." : "연결을 확인한 뒤 다시 시도해 주세요."}
          </Text>
          {!notFound ? (
            <Pressable
              accessibilityLabel="대표 슛폼 분석 다시 시도"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              focusable
              onBlur={() => setFocusedControl((current) => current === "retry" ? null : current)}
              onFocus={() => setFocusedControl("retry")}
              onPress={() => setRetryGeneration((generation) => generation + 1)}
              style={({ pressed }) => [
                styles.primaryButton,
                getRepresentativeFocusStyle(focusedControl === "retry", "play"),
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>다시 시도</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="프로필로 돌아가기"
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            focusable
            onBlur={() => setFocusedControl((current) => current === "error-back" ? null : current)}
            onFocus={() => setFocusedControl("error-back")}
            onPress={goBack}
            style={({ pressed }) => [
              styles.secondaryButton,
              getRepresentativeFocusStyle(focusedControl === "error-back", "light"),
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>프로필로 돌아가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState.status !== "ready"
    || !canRenderShootingProfileViewerRecord(loadState.key, currentKey, loadState.status)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color={tokens.mutedForeground} size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>분석을 불러오는 중</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        left={(
          <Pressable
            accessibilityLabel="대표 슛폼 분석에서 뒤로 가기"
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            focusable
            onBlur={() => setFocusedControl((current) => current === "viewer-back" ? null : current)}
            onFocus={() => setFocusedControl("viewer-back")}
            onPress={goBack}
            style={({ pressed }) => [
              styles.iconButton,
              getRepresentativeFocusStyle(focusedControl === "viewer-back", "light"),
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={tokens.foreground} />
          </Pressable>
        )}
        title="대표 슛폼"
      />
      <ScrollView contentContainerStyle={styles.page}>
        <AnalysisSummaryLine profile={loadState.record.profile} />
        <SequenceViewer
          confidence={loadState.record.confidence}
          profile={loadState.record.profile}
          shootingHand={loadState.record.shootingHand}
        />
        <AnalysisDetails
          confidence={loadState.record.confidence}
          profile={loadState.record.profile}
          shootingHand={loadState.record.shootingHand}
        />
        <AnalysisEvidence profile={loadState.record.profile} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  page: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
  iconButton: { alignItems: "center", height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  centerState: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  stateTitle: { ...typography.title, color: tokens.foreground, marginTop: 14, textAlign: "center" },
  stateCopy: { ...typography.callout, color: tokens.mutedForeground, marginTop: 6, maxWidth: 420, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, justifyContent: "center", marginTop: 18, minHeight: 48, minWidth: 150, paddingHorizontal: 18 },
  primaryButtonText: { ...typography.headline, color: tokens.primaryForeground },
  secondaryButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", marginTop: 10, minHeight: 48, minWidth: 150, paddingHorizontal: 18 },
  secondaryButtonText: { ...typography.headline, color: tokens.foreground },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});
