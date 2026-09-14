import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { captureProtocolPresentation } from "@/lib/shooting-profile/capture-guidance";
import type { CaptureProtocolV2 } from "@/lib/shooting-profile/types";

type CaptureModePickerProps = {
  onSelect: (mode: CaptureProtocolV2) => void;
  disabled?: boolean;
};

const MODES: readonly CaptureProtocolV2[] = ["basic_1_plus_1", "high_accuracy_3_plus_3"];

/** Two rows: the mode name and one line of what it asks for. */
export function CaptureModePicker({ onSelect, disabled = false }: CaptureModePickerProps) {
  return (
    <View style={styles.options}>
      {MODES.map((mode) => {
        const presentation = captureProtocolPresentation(mode, "right");
        const evidence = mode === "basic_1_plus_1" ? "대표 스냅샷 추정 · 반복성 측정 아님" : "3회 반복 일치도를 확인하는 고정밀 모드";
        return (
          <Pressable
            key={mode}
            accessibilityLabel={`${presentation.modeTitle} · ${presentation.modeLine} 선택. ${evidence}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(mode)}
            style={({ pressed }) => [styles.option, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
          >
            <View style={styles.copy}>
              <Text style={styles.title}>{presentation.modeTitle}</Text>
              <Text numberOfLines={1} style={styles.line}>{presentation.modeLine}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={tokens.mutedForeground} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  option: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 12 },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.title, color: tokens.foreground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.7 },
});
