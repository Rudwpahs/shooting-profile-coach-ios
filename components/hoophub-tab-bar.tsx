import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiquidPressable } from "@/components/ui/liquid";
import { tokens } from "@/constants/tokens";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type TabSpec = {
  name: "index" | "explore" | "profile";
  label: string;
  icon: IconName;
  outline: IconName;
};

export type HoopHubDockTabName = TabSpec["name"];

export type HoopHubDockProps = {
  selectedRoute?: string;
  bottomInset?: number;
  onSelectTab: (name: HoopHubDockTabName) => void;
  onCapture: () => void;
};

/**
 * Icon-only HoopHub dock with the shared Liquid interaction foundation.
 * The outer hit targets stay fixed at >=48px; only each inner surface moves,
 * ripples or drifts magnetically on web. Reduced Motion is inherited from
 * LiquidPressable, so the dock never implements a second motion policy.
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

export function HoopHubDock({ selectedRoute, bottomInset = 0, onSelectTab, onCapture }: HoopHubDockProps) {
  const renderTab = (tab: TabSpec) => {
    const selected = selectedRoute === tab.name;
    return (
      <LiquidPressable
        key={tab.name}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        aria-selected={selected}
        accessibilityLabel={tab.label}
        magnetic
        onPress={() => onSelectTab(tab.name)}
        rippleColor={selected ? tokens.primary : tokens.foreground}
        style={styles.item}
        surfaceStyle={[styles.itemSurface, selected && styles.selectedSurface]}
      >
        <MaterialCommunityIcons
          name={selected ? tab.icon : tab.outline}
          size={ICON_SIZE}
          color={selected ? tokens.primary : tokens.mutedForeground}
        />
      </LiquidPressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {renderTab(HOOPHUB_TABS[0])}
      {renderTab(HOOPHUB_TABS[1])}
      <LiquidPressable
        accessibilityRole="button"
        accessibilityLabel={CAPTURE_ACTION_LABEL}
        magnetic
        onPress={onCapture}
        pressScale={0.94}
        rippleColor={tokens.primaryForeground}
        style={styles.item}
        surfaceStyle={[styles.itemSurface, styles.captureSurface]}
      >
        <MaterialCommunityIcons name="plus-box-outline" size={ICON_SIZE} color={tokens.primaryForeground} />
      </LiquidPressable>
      {renderTab(HOOPHUB_TABS[2])}
    </View>
  );
}

export function HoopHubTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const selectedRoute = state.routes[state.index]?.name;
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <HoopHubDock
      bottomInset={bottomInset}
      selectedRoute={selectedRoute}
      onSelectTab={(name) => {
        haptic();
        navigation.navigate(name);
      }}
      onCapture={() => {
        haptic();
        router.push("/private-capture");
      }}
    />
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
  item: { flex: 1, minHeight: 48, minWidth: 48, paddingHorizontal: 3 },
  itemSurface: {
    alignItems: "center",
    borderRadius: 18,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  selectedSurface: { backgroundColor: tokens.elevatedSurface },
  captureSurface: { backgroundColor: tokens.primary },
});