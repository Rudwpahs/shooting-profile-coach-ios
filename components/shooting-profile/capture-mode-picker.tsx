import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CaptureProtocolV2 } from "@/lib/shooting-profile/types";

type CaptureModePickerProps = {
  onSelect: (mode: CaptureProtocolV2) => void;
  disabled?: boolean;
};

const modes = [
  {
    mode: "basic_1_plus_1" as const,
    icon: "filter-2" as const,
    title: "Basic · 정면 1 + 측면 1",
    evidence: "대표 스냅샷 추정 · 반복성 측정 아님",
    detail: "평소 슛 두 클립으로 빠르게 대표 동작을 추정합니다.",
  },
  {
    mode: "high_accuracy_3_plus_3" as const,
    icon: "filter-6" as const,
    title: "High accuracy · 정면 3 + 측면 3",
    evidence: "3회 반복 일치도를 확인하는 고정밀 모드",
    detail: "각 시점의 반복 슛을 먼저 비교한 뒤 일치하는 동작만 결합합니다.",
  },
];

export function CaptureModePicker({ onSelect, disabled = false }: CaptureModePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>1 / 4 · 모드</Text>
      <Text style={styles.title}>어떤 방식으로 만들까요?</Text>
      <Text style={styles.intro}>두 모드 모두 정면과 슈팅 측면을 따로 촬영합니다.</Text>
      <View style={styles.options}>
        {modes.map((item) => (
          <Pressable
            key={item.mode}
            accessibilityLabel={`${item.title} 선택. ${item.evidence}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(item.mode)}
            style={({ pressed }) => [
              styles.option,
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <View style={styles.optionTop}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon} size={22} color="#F97316" />
              </View>
              <MaterialIcons name="arrow-forward" size={21} color="#102235" />
            </View>
            <Text style={styles.optionTitle}>{item.title}</Text>
            <Text style={styles.evidence}>{item.evidence}</Text>
            <Text style={styles.detail}>{item.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  eyebrow: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.2 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 34, lineHeight: 38, marginTop: 4 },
  intro: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 6 },
  options: { gap: 12, marginTop: 20 },
  option: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 18, borderWidth: 1, minHeight: 44, padding: 16 },
  optionTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconWrap: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 12, height: 44, justifyContent: "center", width: 44 },
  optionTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 21, marginTop: 12 },
  evidence: { color: "#C24122", fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19, marginTop: 4 },
  detail: { color: "#61738A", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 5 },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.76 },
});
