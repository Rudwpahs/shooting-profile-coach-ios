import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "@/constants/tokens";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type TabSpec = {
  name: "index" | "explore" | "profile";
  label: string;
  icon: IconName;
  outline: IconName;
};

/**
 * Icon-only bottom bar: 홈 · 탐색 · [촬영] · 프로필. Labels exist only for
 * assistive technology; the filled/outline icon pair and colour carry the
 * selected state visually, the accessibility state carries it semantically.
 */
export const HOOPHUB_TABS: readonly TabSpec[] = [
  { name: "index", label: "홈", icon: "home-variant", outline: "home-variant-outline" },
  { name: "explore", label: "탐색", icon: "compass", outline: "compass-outline" },
  { name: "profile", label: "프로필", icon: "human", outline: "human" },
];

export const CAPTURE_ACTION_LABEL = "슛폼 촬영";

function haptic() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function HoopHubTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const selectedRoute = state.routes[state.index]?.name;

  const renderTab = (tab: TabSpec) => {
    const selected = selectedRoute === tab.name;
    return (
      <Pressable
        key={tab.name}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
        onPress={() => {
          haptic();
          navigation.navigate(tab.name);
        }}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={selected ? tab.icon : tab.outline}
          size={26}
          color={selected ? tokens.foreground : tokens.mutedForeground}
        />
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {renderTab(HOOPHUB_TABS[0])}
      {renderTab(HOOPHUB_TABS[1])}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CAPTURE_ACTION_LABEL}
        onPress={() => {
          haptic();
          router.push("/private-capture");
        }}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <View style={styles.capture}>
          <MaterialCommunityIcons name="video" size={22} color={tokens.primaryForeground} />
        </View>
      </Pressable>
      {renderTab(HOOPHUB_TABS[2])}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: tokens.background,
    borderTopColor: tokens.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  item: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 48, minWidth: 48 },
  capture: {
    alignItems: "center",
    backgroundColor: tokens.primary,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  pressed: { opacity: 0.6 },
});
