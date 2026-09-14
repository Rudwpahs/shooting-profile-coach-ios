import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { User } from "firebase/auth";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";

export type AccountMode = "signin" | "signup";

type AccountPanelProps = {
  loading: boolean;
  configured: boolean;
  user: User | null;
  mode: AccountMode;
  email: string;
  password: string;
  status: string | null;
  submitting: boolean;
  focusedControl: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
  onSubmit: () => void;
  onLogout: () => void;
  onFocusChange: (control: string | null) => void;
};

/**
 * Account controls, separated from the identity area. Presentational: every
 * decision about auth, sync and ownership stays in the profile route.
 */
export function AccountPanel({
  loading, configured, user, mode, email, password, status, submitting, focusedControl,
  onEmailChange, onPasswordChange, onToggleMode, onSubmit, onLogout, onFocusChange,
}: AccountPanelProps) {
  const focus = (key: string) => ({
    onBlur: () => onFocusChange(focusedControl === key ? null : focusedControl),
    onFocus: () => onFocusChange(key),
  });

  if (loading) {
    return <View style={styles.panel}><ActivityIndicator color={tokens.mutedForeground} style={styles.loader} /></View>;
  }
  if (!configured) {
    return <View style={styles.panel}><Text style={styles.copy}>Firebase client 설정이 누락되었습니다. 환경 변수를 다시 확인하세요.</Text></View>;
  }
  if (!user) {
    return (
      <View style={styles.panel}>
        <TextInput
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={onEmailChange}
          placeholder="이메일"
          placeholderTextColor={tokens.mutedForeground}
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="비밀번호"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onChangeText={onPasswordChange}
          placeholder="비밀번호 (6자 이상)"
          placeholderTextColor={tokens.mutedForeground}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {status ? <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{status}</Text> : null}
        <Pressable
          accessibilityLabel={mode === "signin" ? "계정 로그인" : "계정 회원가입"}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting, busy: submitting }}
          disabled={submitting}
          focusable
          {...focus("submit")}
          onPress={onSubmit}
          style={({ pressed }) => [styles.primaryButton, getRepresentativeFocusStyle(focusedControl === "submit", "play"), submitting && styles.disabled, pressed && !submitting && styles.pressed]}
        >
          <Text accessibilityLiveRegion="polite" style={styles.primaryText}>{submitting ? "처리 중" : mode === "signin" ? "로그인" : "회원가입"}</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={tokens.primaryForeground} />
        </Pressable>
        <Pressable
          accessibilityLabel={mode === "signin" ? "회원가입 화면으로 전환" : "로그인 화면으로 전환"}
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
          disabled={false}
          focusable
          {...focus("auth-mode")}
          onPress={onToggleMode}
          style={({ pressed }) => [styles.textButton, getRepresentativeFocusStyle(focusedControl === "auth-mode", "light"), pressed && styles.pressed]}
        >
          <Text style={styles.textButtonLabel}>{mode === "signin" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.copy}>{user.email}</Text>
      {status ? <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{status}</Text> : null}
      <Pressable
        accessibilityLabel="계정 로그아웃"
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        disabled={false}
        focusable
        {...focus("logout")}
        onPress={onLogout}
        style={({ pressed }) => [styles.logoutButton, getRepresentativeFocusStyle(focusedControl === "logout", "light"), pressed && styles.pressed]}
      >
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 14, borderWidth: 1, gap: 9, marginHorizontal: 14, marginTop: 12, padding: 14 },
  loader: { marginVertical: 12 },
  copy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 10, borderWidth: 1, color: tokens.foreground, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  primaryButton: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 10, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 46, minWidth: 44 },
  primaryText: { color: tokens.primaryForeground, fontSize: 15, fontWeight: "700" },
  textButton: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 44, minWidth: 44 },
  textButtonLabel: { color: tokens.foreground, fontSize: 13, fontWeight: "600" },
  logoutButton: { alignItems: "center", borderColor: tokens.destructive, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, minWidth: 44 },
  logoutText: { color: tokens.destructive, fontSize: 14, fontWeight: "700" },
  errorText: { color: tokens.destructive, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
