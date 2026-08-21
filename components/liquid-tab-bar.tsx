import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABS = [
  { name: "index", icon: "home-filled" as const, label: "홈" },
  { name: "motion", icon: "accessibility-new" as const, label: "분석" },
  { name: "profile", icon: "account-circle" as const, label: "내 기록" },
];

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const selectedRoute = state.routes[state.index]?.name;
  const [dockWidth, setDockWidth] = useState(0);
  const selectedIndex = Math.max(0, TABS.findIndex((tab) => tab.name === selectedRoute));
  const tabWidth = dockWidth / TABS.length;
  const capsuleX = useSharedValue(0);
  const bottom = Platform.OS === "web" ? 14 : Math.max(insets.bottom, 12);
  useEffect(() => {
    if (!tabWidth) return;
    capsuleX.value = withTiming(selectedIndex * tabWidth, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [capsuleX, selectedIndex, tabWidth]);
  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: capsuleX.value }] }));
  return <View pointerEvents="box-none" style={[styles.shell, { bottom }]}> 
      <View style={styles.dock} onLayout={(event) => setDockWidth(event.nativeEvent.layout.width)}>
        {tabWidth ? <Animated.View pointerEvents="none" style={[styles.glassCapsule, { width: Math.max(0, tabWidth - 8) }, capsuleStyle]} /> : null}
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
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
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
  dock: { backgroundColor: "rgba(11,22,35,0.96)", borderColor: "rgba(172,200,220,0.28)", borderRadius: 22, borderWidth: 1, flexDirection: "row", minHeight: 68, overflow: "hidden", padding: 7, shadowColor: "#0B1623", shadowOffset: { height: 12, width: 0 }, shadowOpacity: 0.28, shadowRadius: 22 },
  glassCapsule: { backgroundColor: "rgba(249,115,22,0.94)", borderColor: "rgba(255,248,238,0.64)", borderRadius: 16, borderWidth: 1, bottom: 7, left: 4, position: "absolute", top: 7 },
  tab: { alignItems: "center", borderRadius: 16, flex: 1, gap: 3, justifyContent: "center", minHeight: 52, zIndex: 1 },
  tabLabel: { color: "#D7E2EB", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.65 },
  tabLabelActive: { color: "#0B1623" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
