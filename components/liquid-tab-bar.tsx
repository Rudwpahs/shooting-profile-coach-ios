import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { GlassView } from "expo-glass-effect";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABS = [
  { name: "index", icon: "home-filled" as const, label: "홈" },
  { name: "motion", icon: "accessibility-new" as const, label: "모션 스튜디오" },
  { name: "profile", icon: "account-circle" as const, label: "프로필" },
];

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const selectedRoute = state.routes[state.index]?.name;
  const bottom = Platform.OS === "web" ? 14 : Math.max(insets.bottom, 12);
  return <View pointerEvents="box-none" style={[styles.shell, { bottom }]}>
    <GlassView glassEffectStyle="regular" style={styles.glass}>
      <View style={styles.fallbackGlass}>
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
            style={({ pressed }) => [styles.tab, tab.name === "motion" && styles.motionTab, active && styles.tabActive, pressed && styles.pressed]}
          >
            <MaterialIcons name={tab.icon} size={tab.name === "motion" ? 28 : 25} color={active || tab.name === "motion" ? "#F97316" : "#102C46"} />
          </Pressable>;
        })}
      </View>
    </GlassView>
  </View>;
}

const styles = StyleSheet.create({
  shell: { alignSelf: "center", left: 16, maxWidth: 460, position: "absolute", right: 16, zIndex: 30 },
  glass: { borderColor: "rgba(255,255,255,0.96)", borderRadius: 34, borderWidth: 1, overflow: "hidden", shadowColor: "#102C46", shadowOffset: { height: 12, width: 0 }, shadowOpacity: 0.2, shadowRadius: 24 },
  fallbackGlass: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.76)", flexDirection: "row", justifyContent: "space-around", minHeight: 64, paddingHorizontal: 8, paddingVertical: 6 },
  tab: { alignItems: "center", borderRadius: 26, height: 50, justifyContent: "center", width: 68 },
  motionTab: { backgroundColor: "rgba(249,115,22,0.10)", borderColor: "rgba(249,115,22,0.38)", borderWidth: 1 },
  tabActive: { backgroundColor: "rgba(255,255,255,0.92)" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
