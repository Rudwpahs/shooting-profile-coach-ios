import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABS = [
  { name: "index", icon: "home-filled" as const, label: "홈" },
  { name: "motion", icon: "accessibility-new" as const, label: "분석" },
  { name: "profile", icon: "account-circle" as const, label: "내 기록" },
];

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const selectedRoute = state.routes[state.index]?.name;
  const bottom = Platform.OS === "web" ? 14 : Math.max(insets.bottom, 12);
  return <View pointerEvents="box-none" style={[styles.shell, { bottom }]}>
      <View style={styles.dock}>
        {TABS.map((tab) => {
          const active = selectedRoute === tab.name;
          return <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate(tab.name);
            }}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
          >
            <MaterialIcons name={tab.icon} size={22} color={active ? "#0B1623" : "#D7E2EB"} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>;
        })}
      </View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { alignSelf: "center", left: 16, maxWidth: 460, position: "absolute", right: 16, zIndex: 30 },
  dock: { backgroundColor: "#0B1623", borderColor: "#2B4357", borderRadius: 22, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 68, padding: 7, shadowColor: "#0B1623", shadowOffset: { height: 12, width: 0 }, shadowOpacity: 0.28, shadowRadius: 22 },
  tab: { alignItems: "center", borderRadius: 16, flex: 1, gap: 3, justifyContent: "center", minHeight: 52 },
  tabActive: { backgroundColor: "#F97316" },
  tabLabel: { color: "#D7E2EB", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.65 },
  tabLabelActive: { color: "#0B1623" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
