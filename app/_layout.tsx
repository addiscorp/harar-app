import "../src/lib/polyfill";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { ThemeProvider as NavigationThemeProvider, type Theme } from "@react-navigation/native";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext";
import { ToastProvider } from "../src/contexts/ToastContext";
import { BrandFrame } from "../src/components/BrandFrame";
import { Type } from "../src/components/Type";
import { fonts } from "../src/theme/fonts";

function RootLayoutContent() {
  const { colors, theme, ready } = useTheme();
  const [loaded, fontError] = useFonts({ SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold });
  const navigationTheme: Theme = {
    dark: theme === "dark",
    colors: { primary: colors.accent, background: colors.screen, card: colors.panel, text: colors.ink, border: colors.rule, notification: colors.red },
    fonts: {
      regular: { fontFamily: fonts.body, fontWeight: "400" },
      medium: { fontFamily: fonts.medium, fontWeight: "500" },
      bold: { fontFamily: fonts.semibold, fontWeight: "600" },
      heavy: { fontFamily: fonts.displayHeavy, fontWeight: "700" },
    },
  };
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <BrandFrame>
        {fontError ? (
          <View style={{ flex: 1, padding: 32, justifyContent: "center" }}>
            <Type>Could not load the fonts. Please reopen the app.</Type>
          </View>
        ) : !loaded || !ready ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.screen }, animation: "none" }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        )}
      </BrandFrame>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <RootLayoutContent />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
