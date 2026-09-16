import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AnalysisDetails,
  AnalysisEvidence,
  AnalysisSummaryLine,
} from "@/components/analysis/analysis-layers";
import { SequenceViewer } from "@/components/shooting-profile/sequence-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";
import { primaryFinding } from "@/lib/skeleton/analysis-evidence";

/** Synthetic-only Analysis route used by the install-free preview. */
export function PreviewAnalysisRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const preview = usePreviewRuntime();
  const profileId = typeof id === "string" ? id : "";
  const record = preview.recordsById[profileId];
  const profile = preview.profilesById[profileId] ?? record?.profile;

  if (!record || !profile) return <Redirect href="/profile" />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/profile" as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        left={(
          <Pressable
            accessibilityLabel="대표 슛폼 분석에서 뒤로 가기"
            accessibilityRole="button"
            onPress={goBack}
            style={styles.back}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={tokens.foreground} />
          </Pressable>
        )}
        title="대표 슛폼"
      />
      <ScrollView contentContainerStyle={styles.page}>
        <AnalysisSummaryLine profile={profile} />
        <SequenceViewer
          confidence={record.confidence}
          highlightJoint={primaryFinding(profile).joint}
          profile={profile}
          shootingHand={record.shootingHand}
        />
        <AnalysisDetails
          confidence={record.confidence}
          profile={profile}
          shootingHand={record.shootingHand}
        />
        <AnalysisEvidence profile={profile} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  page: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
  back: { alignItems: "center", height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
});
