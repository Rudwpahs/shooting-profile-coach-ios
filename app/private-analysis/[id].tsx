import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnalysisStage } from "@/components/analysis/analysis-stage";
import {
  buildShootingProfileViewerKey,
  canRenderShootingProfileViewerRecord,
  getRepresentativeFocusStyle,
} from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useAppStateStatus } from "@/hooks/use-app-state";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { FORMPATH_EXPERIMENTAL_FLAGS, FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { analysisTitle } from "@/lib/shooting-profile/analysis-presentation";
import {
  getShootingProfileV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/shooting-profile-source";

const OPAQUE_PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Static web export: the install-free preview pre-renders its deterministic
 * preview profile pages (`preview-shot-001`, …) so GitHub Pages can serve
 * them without a server. Ordinary builds return no params, which leaves the
 * dynamic route exactly as it was.
 */
export function generateStaticParams(): { id: string }[] {
  if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const preview = require("@/lib/preview/preview-runtime") as typeof import("@/lib/preview/preview-runtime");
    return preview.PREVIEW_PROFILE_IDS.map((id) => ({ id }));
  }
  return [];
}

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
 * 분석: the same reel stage every player uses, for one saved profile. The
 * stage is the motion; 동작 정보 holds the inspection surface (Phase Space,
 * Film), the numbers and the per-joint evidence. Access rules are unchanged:
 * both viewer flags, the signed-in owner, an opaque id, and a request key
 * that must still be current when the record arrives.
 */
export default function PrivateAnalysisRoute() {
  const { id, title } = useLocalSearchParams<{ id?: string | string[]; title?: string | string[] }>();
  const router = useRouter();
  const { user, loading: authLoading } = useFirebaseAuth();
  const profileId = opaqueProfileId(id);
  // The stage needs the same playback inputs the Reels route has.
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const appState = useAppStateStatus();
  const reducedMotion = useReduceMotion();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
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

  if (!profileId) return <Redirect href="/profile" />;

  return (
    <View style={styles.stageScreen}>
      <AnalysisStage
        appState={appState}
        confidence={loadState.record.confidence}
        experimentalEnabled={FORMPATH_EXPERIMENTAL_FLAGS.shotInspectionV1}
        focused={focused}
        height={height}
        insets={{ top: insets.top, bottom: insets.bottom }}
        onBack={goBack}
        profile={loadState.record.profile}
        profileId={profileId}
        reducedMotion={reducedMotion}
        shootingHand={loadState.record.shootingHand}
        title={analysisTitle(title)}
        width={width}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  stageScreen: { backgroundColor: tokens.stage, flex: 1 },
  centerState: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  stateTitle: { ...typography.title, color: tokens.foreground, marginTop: 14, textAlign: "center" },
  stateCopy: { ...typography.callout, color: tokens.mutedForeground, marginTop: 6, maxWidth: 420, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, justifyContent: "center", marginTop: 18, minHeight: 48, minWidth: 150, paddingHorizontal: 18 },
  primaryButtonText: { ...typography.headline, color: tokens.primaryForeground },
  secondaryButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", marginTop: 10, minHeight: 48, minWidth: 150, paddingHorizontal: 18 },
  secondaryButtonText: { ...typography.headline, color: tokens.foreground },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});