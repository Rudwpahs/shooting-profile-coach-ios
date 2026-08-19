import { Tabs } from "expo-router";

import { ProfileProvider } from "@/lib/profile-store";

export default function TabLayout() {
  return (
    <ProfileProvider>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
        <Tabs.Screen name="index" options={{ title: "Shooting Form Analysis" }} />
        <Tabs.Screen name="assessment" options={{ href: null }} />
        <Tabs.Screen name="library" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </ProfileProvider>
  );
}
