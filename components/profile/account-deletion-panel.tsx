import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";

type AccountDeletionPanelProps = {
  onDelete: (password: string) => Promise<void>;
};

export function AccountDeletionPanel({ onDelete }: AccountDeletionPanelProps) {
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);

  const performDelete = async () => {
    if (!password.trim()) {
      setError("현재 비밀번호를 입력하세요.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete(password);
      setPassword("");
      setDeletionOpen(false);
    } catch {
      setError("계정 삭제를 완료하지 못했습니다. 비밀번호와 네트워크 연결을 확인한 뒤 다시 시도하세요.");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!password.trim()) {
      setError("현재 비밀번호를 입력하세요.");
      return;
    }
    Alert.alert(
      "계정 영구 삭제",
      "계정과 저장된 슛폼 데이터가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "계정 영구 삭제", style: "destructive", onPress: () => { void onDelete(password).catch(() => setError("계정 삭제를 완료하지 못했습니다. 다시 시도하세요.")); } },
      ],
    );
  };

  if (!deletionOpen) {
    return (
      <Pressable
        accessibilityLabel="계정 삭제"
        accessibilityRole="button"
        focusable
        onBlur={() => setFocusedControl(null)}
        onFocus={() => setFocusedControl("open")}
        onPress={() => {
          setError(null);
          setDeletionOpen(true);
        }}
        style={({ pressed }) => [
          styles.openButton,
          getRepresentativeFocusStyle(focusedControl === "open", "light"),
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.openText}>계정 삭제</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.warning}>계정과 저장된 슛폼 데이터가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</Text>
      <TextInput
        accessibilityLabel="계정 삭제용 현재 비밀번호"
        autoComplete="current-password"
        onChangeText={setPassword}
        placeholder="현재 비밀번호"
        placeholderTextColor={tokens.mutedForeground}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="계정 삭제 취소"
          accessibilityRole="button"
          disabled={deleting}
          focusable
          onPress={() => {
            setDeletionOpen(false);
            setPassword("");
            setError(null);
          }}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="계정 영구 삭제 확인"
          accessibilityRole="button"
          accessibilityState={{ busy: deleting, disabled: deleting }}
          disabled={deleting}
          focusable
          onPress={confirmDelete}
          style={({ pressed }) => [styles.deleteButton, deleting && styles.disabled, pressed && !deleting && styles.pressed]}
        >
          <Text style={styles.deleteText}>{deleting ? "삭제 중" : "계정 영구 삭제"}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => { void performDelete(); }} style={styles.hiddenFallback}>
        <Text>삭제 재시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopColor: tokens.border, borderTopWidth: 1, gap: 10, marginTop: 4, paddingTop: 12 },
  warning: { color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 },
  input: { backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, color: tokens.foreground, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  actions: { flexDirection: "row", gap: 8 },
  openButton: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 44, minWidth: 44 },
  openText: { color: tokens.destructive, fontSize: 13, fontWeight: "700" },
  cancelButton: { alignItems: "center", borderColor: tokens.border, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44 },
  cancelText: { color: tokens.foreground, fontSize: 13, fontWeight: "700" },
  deleteButton: { alignItems: "center", backgroundColor: tokens.destructive, borderRadius: 10, flex: 1, justifyContent: "center", minHeight: 44 },
  deleteText: { color: tokens.background, fontSize: 13, fontWeight: "800" },
  error: { color: tokens.destructive, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  hiddenFallback: { display: "none" },
});
