import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { saveFirebasePrivatePose } from "@/lib/firebase-private-data";
import { detectPoseFromSelectedVideo } from "@/lib/pose-detection";
import { personalPoseToCorrectedMotion } from "@/lib/personal-pose";
import { validateSelectedShootingVideo } from "@/lib/video-intake";

type CaptureState = "idle" | "picking" | "detecting" | "saving" | "complete" | "error";

export function PrivatePoseCapture({ onSaved }: { onSaved: () => Promise<void> | void }) {
  return FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2
    ? <GuidedPrivatePoseCaptureEntry />
    : <LegacyPrivatePoseCapture onSaved={onSaved} />;
}

function GuidedPrivatePoseCaptureEntry() {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  return <View style={styles.v2Card}>
    <View style={styles.heading}>
      <View style={styles.v2HeadingCopy}>
        <Text style={styles.title}>정면·측면 대표 슛폼</Text>
        <Text style={styles.subtitle}>Basic 1+1 또는 High accuracy 3+3 클립을 기기 안에서 분석합니다.</Text>
      </View>
      <MaterialIcons name="switch-video" size={23} color="#F97316" />
    </View>
    <View style={styles.tip}>
      <MaterialIcons name="privacy-tip" size={18} color="#102C46" />
      <Text style={styles.tipText}>정면과 슈팅 측면은 따로 촬영하며, 원본 영상을 업로드하거나 저장했다고 표시하지 않습니다.</Text>
    </View>
    <Pressable
      accessibilityLabel="정면과 슈팅 측면 대표 슛폼 촬영 시작"
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      disabled={false}
      focusable
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={() => router.push("/private-capture")}
      style={({ pressed }) => [styles.v2Button, focusStyle(focused, true), pressed && styles.v2Pressed]}
    >
      <MaterialIcons name="videocam" size={19} color="#FFFFFF" />
      <Text style={styles.buttonText}>정면·측면 슛폼 만들기</Text>
    </Pressable>
  </View>;
}

function LegacyPrivatePoseCapture({ onSaved }: { onSaved: () => Promise<void> | void }) {
  const { user } = useFirebaseAuth();
  const [state, setState] = useState<CaptureState>("idle");
  const [detail, setDetail] = useState("측면 전신 슈팅 영상을 선택하세요.");
  const [focused, setFocused] = useState(false);

  const chooseAndAnalyze = async () => {
    if (!user) return;
    try {
      setState("picking");
      setDetail("영상 접근 권한을 확인하는 중입니다.");
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setState("error");
        setDetail("영상 선택 권한이 필요합니다. iPhone 설정에서 사진 접근을 허용한 뒤 다시 시도하세요.");
        return;
      }
      setDetail("영상 선택기를 여는 중입니다.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        videoMaxDuration: 20,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]) { setState("idle"); setDetail("분석할 영상을 선택하지 않았습니다."); return; }
      const asset = result.assets[0];
      const intakeFailure = validateSelectedShootingVideo(asset);
      if (intakeFailure) { setState("error"); setDetail(intakeFailure); return; }
      setState("detecting");
      const output = await detectPoseFromSelectedVideo(asset.uri, (progress) => {
        setDetail(`포즈 추출 중 · ${progress.completed}/${progress.total} 프레임`);
      });
      if (output.status !== "complete") {
        setState("error");
        setDetail(output.reason ?? "포즈 품질 기준을 통과하지 못했습니다. 측면 전신·밝은 영상으로 다시 시도하세요.");
        return;
      }
      const corrected = personalPoseToCorrectedMotion(output.candidate, `personal-${Date.now()}`);
      if (!corrected) {
        setState("error");
        setDetail("통과한 landmark에서 안정적인 five-phase motion을 만들지 못했습니다. 전신이 보이는 영상으로 다시 시도하세요.");
        return;
      }
      setState("saving");
      setDetail("보정된 fluid motion을 개인 보관함에 안전하게 저장하는 중입니다.");
      await saveFirebasePrivatePose(user, {
        sourceLabel: asset.fileName?.replace(/\.[^/.]+$/, "") || `개인 슈팅 분석 ${new Date().toLocaleDateString("ko-KR")}`,
        poseJson: JSON.stringify(output.candidate),
        qualityJson: JSON.stringify(output.candidate.quality),
        correctedMotionJson: JSON.stringify(corrected.motion),
        correctionJson: JSON.stringify(corrected.correction),
      });
      await onSaved();
      setState("complete");
      setDetail("보정된 fluid motion을 비공개 보관함에 저장했습니다. 원본 영상은 업로드하지 않습니다.");
    } catch (error) {
      setState("error");
      setDetail(error instanceof Error ? error.message : "영상 분석을 완료하지 못했습니다. 잠시 후 다시 시도하세요.");
    }
  };

  const working = state === "picking" || state === "detecting" || state === "saving";
  return <View style={styles.card}>
    <View style={styles.heading}><View><Text style={styles.title}>새 개인 스켈레톤</Text><Text style={styles.subtitle}>통과한 pose는 보수 보정 뒤 fluid motion으로 저장합니다.</Text></View><MaterialIcons name="video-library" size={22} color="#F97316" /></View>
    <View style={styles.tip}><MaterialIcons name="tips-and-updates" size={17} color="#102C46" /><Text style={styles.tipText}>측면·전신·밝은 조명에서 2–20초 슈팅 영상을 선택하세요. 추출은 iPhone custom development build에서 기기 안에서 실행됩니다.</Text></View>
    <Pressable
      accessibilityLabel="기존 단일 시점 슈팅 영상 선택 후 분석"
      accessibilityRole="button"
      accessibilityState={{ disabled: working, busy: working }}
      disabled={working}
      focusable
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={() => void chooseAndAnalyze()}
      style={({ pressed }) => [styles.button, focusStyle(focused, true), working && styles.disabled, pressed && !working && styles.pressed]}
    >
      {working ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="add-to-photos" size={18} color="#FFFFFF" />}<Text style={styles.buttonText}>{working ? "분석 중" : "영상 선택 후 분석"}</Text>
    </Pressable>
    <Text accessibilityLiveRegion={state === "error" ? "assertive" : "polite"} style={[styles.status, state === "error" && styles.error, state === "complete" && styles.complete]}>{detail}</Text>
  </View>;
}

function focusStyle(focused: boolean, dark: boolean): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: dark ? "#FFFFFF" : "#102235",
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: "#102235",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

const styles = StyleSheet.create({
  v2Card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 14 },
  v2HeadingCopy: { flex: 1, paddingRight: 10 },
  v2Button: { alignItems: "center", backgroundColor: "#C24122", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 13, minHeight: 46, minWidth: 44, paddingHorizontal: 12 },
  v2Pressed: { opacity: 0.76 },
  card: { backgroundColor: "rgba(238,244,248,0.72)", borderColor: "rgba(16,44,70,0.12)", borderRadius: 16, borderStyle: "dashed", borderWidth: 1, marginTop: 14, padding: 14 },
  heading: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, title: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 20 }, subtitle: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 2 },
  tip: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 12 }, tipText: { color: "#102C46", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 17 },
  button: { alignItems: "center", backgroundColor: "#9A3412", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 13, minHeight: 46, minWidth: 44 }, buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  status: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 10 }, error: { color: "#C24122" }, complete: { color: "#166534" }, disabled: { opacity: 0.62 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
