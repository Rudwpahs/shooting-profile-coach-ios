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
 * Flat, icon-only bottom bar: 홈 · 탐색 · 촬영 · 프로필. Every item is the
 * same weight, like a social app; the filled/outline pair shows the selected
 * tab, the accessibility state says it, and labels exist only for assistive
 * technology. Feedback lands on touch-down.
 */
export const HOOPHUB_TABS: readonly TabSpec[] = [
  { name: "index", label: "홈", icon: "home-variant", outline: "home-variant-outline" },
  { name: "explore", label: "탐색", icon: "compass", outline: "compass-outline" },
  { name: "profile", label: "프로필", icon: "human", outline: "human" },
];

export const CAPTURE_ACTION_LABEL = "슛폼 촬영";
const ICON_SIZE = 26;

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
        aria-selected={selected}
        accessibilityLabel={tab.label}
        onPress={() => {
          haptic();
          navigation.navigate(tab.name);
        }}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={selected ? tab.icon : tab.outline}
          size={ICON_SIZE}
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
        <MaterialCommunityIcons name="plus-box-outline" size={ICON_SIZE} color={tokens.foreground} />
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
    paddingTop: 8,
  },
  item: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 48, minWidth: 48 },
  pressed: { opacity: 0.45 },
});
