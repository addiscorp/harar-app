import { Tabs } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { DashboardTabBar } from "../../src/components/DashboardTabBar";
import { useTheme } from "../../src/contexts/ThemeContext";

export default function TabLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 768;
  return (
    <Tabs tabBar={(props) => <DashboardTabBar {...props} />} screenOptions={{ headerShown: false, tabBarPosition: wide ? "left" : "bottom", sceneStyle: { backgroundColor: colors.screen } }}>
      <Tabs.Screen name="index" options={{ title: "Approvals" }} />
      <Tabs.Screen name="machines" options={{ title: "Machines" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
