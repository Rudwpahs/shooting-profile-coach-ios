import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { useAppStateStatus } from "@/hooks/use-app-state";

export default function LibraryScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const reducedMotion = useReduceMotion();
  const focused = useIsFocused();
  const appState = useAppStateStatus();
  const [panel, setPanel] = useState<"info" | "note" | null>(null);
  const [liked, setLiked] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const storageKey = `hoophub:reference:${reference?.id ?? "empty"}`;

  useEffect(() => {
    let active = true;
    void Promise.all([AsyncStorage.getItem(`${storageKey}:like`), AsyncStorage.getItem(`${storageKey}:note`)]).then(([storedLike, storedNote]) => {
      if (active) { setLiked(storedLike === "1"); setNote(storedNote?.slice(0, 2000) ?? ""); setReady(true); }
    }).catch(() => { if (active) setError("기기 저장소를 읽지 못했습니다. 다시 읽기를 눌러 주세요."); });
    return () => { active = false; };
  }, [storageKey, readAttempt]);

  const toggleLike = async () => {
    setSaving(true); setError("");
    try { await AsyncStorage.setItem(`${storageKey}:like`, liked ? "0" : "1"); setLiked((value) => !value); }
    catch { setError("좋아요를 저장하지 못했습니다. 다시 눌러 주세요."); }
    finally { setSaving(false); }
  };
  const saveNote = async () => {
    setSaving(true); setError("");
    try { await AsyncStorage.setItem(`${storageKey}:note`, draft.trim()); setNote(draft.trim()); setPanel(null); }
    catch { setError("메모를 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };
  const panelTitle = panel === "note" ? "동작 메모" : "동작 정보";

  return <ScreenContainer>
    {reference ? <View style={styles.reel} testID="reference-reel">
      <PoseMotionViewer compact reel suspended={panel !== null || !focused || appState !== "active"} motion={reference.motion} title={reference.styleTitle} hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} />
      <Text accessibilityRole="header" style={styles.heading}>참조 동작</Text>
      <View style={styles.rail} testID="reference-action-rail">
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? "좋아요 취소" : "좋아요"} accessibilityState={{ selected: liked, disabled: !ready || saving }} aria-pressed={liked} disabled={!ready || saving} onPress={() => void toggleLike()} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
          <MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? tokens.primary : tokens.stageForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="동작 메모" disabled={!ready || saving} onPress={() => { setDraft(note); setError(""); setPanel("note"); }} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="comment-outline" size={29} color={tokens.stageForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="동작 정보" aria-expanded={panel === "info"} accessibilityState={{ expanded: panel === "info" }} onPress={() => { if (ready) setError(""); setPanel("info"); }} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="book-open-outline" size={30} color={tokens.stageForeground} />
        </Pressable>
      </View>
      <View style={styles.caption}>
        <Text numberOfLines={2} style={styles.motionTitle}>{reference.styleTitle}</Text>
        <Text style={styles.attribution}>CMU 모션 캡처 · 익명 참조</Text>
      </View>
      {error && !panel ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
        {!ready ? <Pressable accessibilityRole="button" accessibilityLabel="저장소 다시 읽기" onPress={() => { setError(""); setReadAttempt((value) => value + 1); }} style={styles.retry}><Text style={styles.errorText}>다시 읽기</Text></Pressable> : null}
      </View> : null}
      {panel ? <Modal transparent visible animationType={reducedMotion === false ? "slide" : "none"} onRequestClose={() => setPanel(null)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable accessibilityRole="button" accessibilityLabel="패널 닫기" onPress={() => setPanel(null)} style={styles.backdrop} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>{panelTitle}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${panelTitle} 닫기`} onPress={() => setPanel(null)} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}><MaterialCommunityIcons name="close" size={24} color={tokens.foreground} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              {panel === "info" ? <>
                <Text style={styles.infoText}>{reference.sourceAttribution}</Text>
                <Text style={styles.infoText}>광학 모션 캡처로 측정한 3D 참조 동작입니다. 화면의 움직임은 원본 단계 사이를 부드럽게 보간합니다.</Text>
                <Text style={styles.infoText}>원본 C3D 프레임{reference.sourcePhaseFrames ? `: ${reference.sourcePhaseFrames.join(" · ")}` : " 정보 없음"}</Text>
                <Text style={styles.infoText}>화면을 누르면 재생·정지합니다. 좌우로 드래그해 회전하고 두 손가락으로 확대하세요. 아래 점을 누르면 해당 단계로 이동합니다.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="추천 목표 선택" onPress={() => { setPanel(null); router.replace("/assessment" as never); }} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>추천 목표 선택</Text></Pressable>
              </> : <>
                <Text style={styles.infoText}>메모와 좋아요는 이 기기에만 저장됩니다.</Text>
                <TextInput accessibilityLabel="동작 메모 입력" multiline maxLength={2000} value={draft} onChangeText={setDraft} placeholder="이 동작에서 참고할 점" placeholderTextColor={tokens.mutedForeground} style={styles.input} />
                <Pressable accessibilityRole="button" accessibilityLabel="메모 저장" disabled={saving} onPress={() => void saveNote()} style={({ pressed }) => [styles.button, saving && styles.disabled, pressed && styles.pressed]}><Text style={styles.buttonText}>{saving ? "저장 중" : "메모 저장"}</Text></Pressable>
              </>}
              {error ? <Text accessibilityRole="alert" style={styles.infoText}>{error}</Text> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal> : null}
    </View> : <Text style={styles.empty}>참조 동작을 준비하고 있습니다.</Text>}
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  reel: { backgroundColor: tokens.stage, flex: 1 },
  heading: { ...typography.title, color: tokens.stageForeground, position: "absolute", left: 20, top: 20, pointerEvents: "none" },
  rail: { position: "absolute", right: 10, bottom: 132, gap: 18 },
  icon: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 48 },
  caption: { position: "absolute", left: 20, right: 72, bottom: 78, gap: 4, pointerEvents: "none" },
  motionTitle: { ...typography.headline, color: tokens.stageForeground },
  attribution: { ...typography.caption, color: tokens.mutedForeground },
  error: { position: "absolute", left: 20, right: 72, top: 60, backgroundColor: tokens.surface, padding: 12, borderRadius: 12 },
  errorText: { ...typography.caption, color: tokens.foreground },
  retry: { minHeight: 48, justifyContent: "center" },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: tokens.background, opacity: 0.65 },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 28 },
  sheetHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 24, paddingRight: 12, paddingTop: 8 },
  sheetTitle: { ...typography.title, color: tokens.foreground },
  sheetContent: { gap: 16, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  infoText: { ...typography.callout, color: tokens.mutedForeground },
  input: { ...typography.body, color: tokens.foreground, backgroundColor: tokens.background, borderRadius: 14, minHeight: 128, padding: 16, textAlignVertical: "top" },
  button: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 14, justifyContent: "center", minHeight: 48, padding: 12 },
  buttonText: { ...typography.headline, color: tokens.primaryForeground },
  empty: { ...typography.body, color: tokens.mutedForeground, padding: 24 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
