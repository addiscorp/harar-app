import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { fonts } from "../theme/fonts";
import { Type } from "./Type";

export function DashboardTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 768;
  return (
    <View style={{ flexDirection: wide ? "column" : "row", width: wide ? 220 : undefined, padding: wide ? 20 : 8, paddingBottom: Math.max(insets.bottom, wide ? 20 : 8), gap: 8, borderRightWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: colors.rule, backgroundColor: colors.ground }}>
      {state.routes.map((route, index) => {
        const selected = state.index === index;
        const title = descriptors[route.key].options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={title}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            style={({ pressed }) => ({ flex: wide ? undefined : 1, minHeight: 48, padding: 12, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: wide ? "flex-start" : "center", borderWidth: 1, borderRadius: 4, borderColor: selected || pressed ? colors.rule : colors.ground, backgroundColor: selected ? colors.panel : colors.ground })}
          >
            <Feather name={route.name === "index" ? "shield" : route.name === "machines" ? "server" : "settings"} size={18} color={selected ? colors.accent : colors.inkSoft} />
            <Type style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 12 }}>{title}</Type>
          </Pressable>
        );
      })}
    </View>
  );
}
