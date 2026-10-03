import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

type FilmReelUnavailableProps = {
  /** "error": the device store could not be read (nothing is lost); "missing": the store was read and the shot is not in it. */
  kind: "error" | "missing";
  insets: { top: number; bottom: number };
  onRetry?: () => void;
  onClose: () => void;
};

/**
 * What a deep link to one of my film shots shows instead of the feed when the
 * shot cannot be opened. A store failure and a shot that is really not on this
 * device are different facts, so they get different words and only the first
 * offers a retry. Never falls through to some other reel.
 */
export function FilmReelUnavailable({ kind, insets, onRetry, onClose }: FilmReelUnavailableProps) {
  const error = kind === "error";
  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      testID={error ? "film-reel-storage-error" : "film-reel-missing"}
    >
      <MaterialCommunityIcons name={error ? "alert-circle-outline" : "filmstrip-off"} size={36} color={tokens.stageForeground} />
      <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={styles.title}>
        {error ? "이 기기에 보관한 영상을 읽지 못했습니다" : "이 영상은 이 기기에 없습니다"}
      </Text>
      <Text style={styles.copy}>
        {error
          ? "영상이 삭제된 것은 아닙니다. 기기 저장소를 다시 읽어 보세요."
          : "삭제되었거나 다른 기기의 브라우저에서 보관한 영상입니다. 내 영상은 어디에도 업로드되지 않습니다."}
      </Text>
      <View style={styles.actions}>
        {error && onRetry ? (
          <Pressable
            accessibilityLabel="다시 읽기"
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            disabled={false}
            onPress={onRetry}
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>다시 읽기</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
          disabled={false}
          onPress={onClose}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>닫기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", backgroundColor: tokens.stage, flex: 1, gap: 10, justifyContent: "center", paddingHorizontal: 24 },
  title: { ...typography.headline, color: tokens.stageForeground, textAlign: "center" },
  copy: { ...typography.callout, color: tokens.mutedForeground, maxWidth: 340, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { alignItems: "center", borderColor: tokens.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 48, minWidth: 96, paddingHorizontal: 18 },
  buttonText: { ...typography.headline, color: tokens.stageForeground },
  primary: { backgroundColor: tokens.primary, borderColor: tokens.primary },
  primaryText: { ...typography.headline, color: tokens.primaryForeground },
  pressed: { opacity: 0.7 },
});
