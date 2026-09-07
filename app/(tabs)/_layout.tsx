import { Tabs } from "expo-router";

import { HoopHubTabBar } from "@/components/hoophub-tab-bar";
import { ProfileProvider } from "@/lib/profile-store";

export default function TabLayout() {
  return <ProfileProvider><Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <HoopHubTabBar {...props} />}>
    <Tabs.Screen name="index" options={{ title: "홈" }} />
    <Tabs.Screen name="explore" options={{ title: "탐색" }} />
    <Tabs.Screen name="profile" options={{ title: "프로필" }} />
    <Tabs.Screen name="motion" options={{ href: null }} />
    <Tabs.Screen name="assessment" options={{ href: null }} />
    <Tabs.Screen name="library" options={{ href: null }} />
    <Tabs.Screen name="settings" options={{ href: null }} />
  </Tabs></ProfileProvider>;
}
