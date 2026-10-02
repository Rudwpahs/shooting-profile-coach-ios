import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Redirect } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LiquidPressable } from "@/components/ui/liquid";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

/**
 * Developer-only lab for the liquid interaction foundation (Slice 2). It puts
 * a plain button, the spring press, the ripple, web magnetic attraction and
 * the Reduce Motion fallback side by side. It is not linked from any screen
 * and redirects home unless the same build-time opt-ins as the UI demo are set.
 */
const LIQUID_LAB_ENABLED: boolean =
  (__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1") ||
  process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const DOCK: readonly { label: string; icon: IconName }[] = [
  { label: "홈", icon: "home-variant-outline" },
  { label: "탐색", icon: "compass-outline" },
  { label: "슛폼 촬영", icon: "plus-box-outline" },
  { label: "프로필", icon: "human" },
];

export default function LiquidLabRoute() {
  if (!LIQUID_LAB_ENABLED) return <Redirect href="/" />;
  return <LiquidLab />;
}

function LiquidLab() {
  const [forceReduced, setForceReduced] = useState(false);
  const [last, setLast] = useState<{ label: string; count: number } | null>(null);

  const record = (label: string) => () =>
    setLast((previous) => ({ label, count: previous?.label === label ? previous.count + 1 : 1 }));

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView testID="liquid-lab" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Liquid 인터랙션 랩
          </Text>
          <Text style={styles.lede}>
            Slice 2 기반 요소를 한 화면에서 비교합니다. 개발용 빌드에서만 열리고 앱 내비게이션에는 없습니다.
          </Text>
        </View>

        <View role="group" aria-label="모션 설정" style={styles.segmented}>
          {[
            { label: "시스템 설정 따름", value: false },
            { label: "모션 줄이기 강제", value: true },
          ].map((option) => {
            const selected = forceReduced === option.value;
            return (
              <LiquidPressable
                key={option.label}
                accessibilityState={{ selected }}
                aria-selected={selected}
                accessibilityLabel={option.label}
                onPress={() => setForceReduced(option.value)}
                forceReducedMotion={forceReduced}
                style={styles.segment}
                surfaceStyle={[styles.segmentSurface, selected && styles.segmentSelected]}
                rippleColor={selected ? tokens.primaryForeground : tokens.foreground}
              >
                <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{option.label}</Text>
              </LiquidPressable>
            );
          })}
        </View>

        <Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.status}>
          {last ? `마지막 입력: ${last.label} (${last.count}회)` : "버튼을 눌러 반응을 비교해 보세요."}
        </Text>

        <Section title="기존 버튼" note="지금 앱의 탭 버튼처럼 누르면 투명도만 바뀝니다.">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="기존 버튼"
            onPress={record("기존 버튼")}
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.legacyPressed]}
          >
            <Text style={styles.secondaryLabel}>기존 버튼</Text>
          </Pressable>
        </Section>

        <Section title="스프링 프레스" note="누르는 순간 눌린 쪽으로 살짝 기울며 압축되고, 놓으면 한 번 부드럽게 되돌아옵니다.">
          <LiquidPressable
            accessibilityLabel="스프링 프레스"
            onPress={record("스프링 프레스")}
            ripple={false}
            forceReducedMotion={forceReduced}
            surfaceStyle={[styles.button, styles.secondary]}
          >
            <Text style={styles.secondaryLabel}>스프링 프레스</Text>
          </LiquidPressable>
        </Section>

        <Section title="스프링과 리플" note="누른 지점에서 액체처럼 번지는 리플이 표면 안에서만 퍼집니다.">
          <View style={styles.stack}>
            <LiquidPressable
              accessibilityLabel="분석 시작"
              onPress={record("분석 시작")}
              forceReducedMotion={forceReduced}
              rippleColor={tokens.primaryForeground}
              surfaceStyle={[styles.button, styles.primary]}
            >
              <Text style={styles.primaryLabel}>분석 시작</Text>
            </LiquidPressable>
            <LiquidPressable
              accessibilityLabel="최근 분석 열기"
              onPress={record("최근 분석 열기")}
              forceReducedMotion={forceReduced}
              surfaceStyle={styles.card}
            >
              <Text style={styles.cardTitle}>최근 분석 열기</Text>
              <Text style={styles.cardBody}>카드처럼 넓은 표면에서도 리플은 가장 먼 모서리까지만 번집니다.</Text>
            </LiquidPressable>
          </View>
        </Section>

        <Section title="마그네틱 호버" note="웹에서 마우스를 버튼 가까이 가져가 보세요. 누를 수 있는 영역은 그대로이고 모양만 3px 이내로 끌려옵니다. 네이티브는 터치 위치로 기우는 반응만 씁니다.">
          <DockRow onPress={record} forceReducedMotion={forceReduced} />
        </Section>

        <Section title="모션 줄이기" note="같은 요소를 모션 줄이기로 고정했습니다. 튕김, 끌림, 번짐 없이 짧게 어두워지고 아주 조금 작아집니다.">
          <View style={styles.stack}>
            <LiquidPressable
              accessibilityLabel="모션 줄이기 분석 시작"
              onPress={record("모션 줄이기 분석 시작")}
              forceReducedMotion
              rippleColor={tokens.primaryForeground}
              surfaceStyle={[styles.button, styles.primary]}
            >
              <Text style={styles.primaryLabel}>분석 시작</Text>
            </LiquidPressable>
            <DockRow onPress={record} forceReducedMotion labelPrefix="모션 줄이기" />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function DockRow({
  onPress,
  forceReducedMotion = false,
  labelPrefix,
}: {
  onPress: (label: string) => () => void;
  forceReducedMotion?: boolean;
  labelPrefix?: string;
}) {
  return (
    <View style={styles.dock}>
      {DOCK.map((item) => (
        <LiquidPressable
          key={item.label}
          accessibilityLabel={labelPrefix ? `${labelPrefix} ${item.label}` : item.label}
          onPress={onPress(item.label)}
          magnetic
          forceReducedMotion={forceReducedMotion}
          style={styles.dockItem}
          surfaceStyle={styles.dockSurface}
        >
          <MaterialCommunityIcons name={item.icon} size={26} color={tokens.foreground} />
        </LiquidPressable>
      ))}
    </View>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text style={styles.sectionNote}>{note}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.background, flex: 1 },
  content: { alignSelf: "center", gap: 28, maxWidth: 560, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 24, width: "100%" },
  header: { gap: 6 },
  title: { ...typography.wordmark, color: tokens.foreground },
  lede: { ...typography.callout, color: tokens.mutedForeground },
  segmented: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 4, padding: 4 },
  segment: { flex: 1 },
  segmentSurface: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  segmentSelected: { backgroundColor: tokens.primary },
  segmentLabel: { ...typography.headline, color: tokens.mutedForeground },
  segmentLabelSelected: { color: tokens.primaryForeground },
  status: { ...typography.callout, color: tokens.foreground },
  section: { gap: 10 },
  sectionTitle: { ...typography.title, color: tokens.foreground },
  sectionNote: { ...typography.caption, color: tokens.mutedForeground },
  stack: { gap: 12 },
  button: { alignItems: "center", borderRadius: 16, justifyContent: "center", minHeight: 52, paddingHorizontal: 20 },
  primary: { backgroundColor: tokens.primary },
  primaryLabel: { ...typography.headline, color: tokens.primaryForeground },
  secondary: { backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderWidth: StyleSheet.hairlineWidth },
  secondaryLabel: { ...typography.headline, color: tokens.foreground },
  legacyPressed: { opacity: 0.45 },
  card: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 4, padding: 18 },
  cardTitle: { ...typography.headline, color: tokens.foreground },
  cardBody: { ...typography.callout, color: tokens.mutedForeground },
  dock: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingHorizontal: 8, paddingVertical: 6 },
  dockItem: { flex: 1 },
  dockSurface: { alignItems: "center", borderRadius: 16, justifyContent: "center", minHeight: 48, minWidth: 48 },
});
