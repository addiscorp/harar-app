import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { fonts } from "../theme/fonts";
import { Type } from "./Type";

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.screen }} contentContainerStyle={styles.scroll}>
      <View style={[styles.content, { padding: width < 768 ? 24 : 48 }]}>
        <View style={styles.header}>
          <Type accessibilityRole="header" style={[styles.title, { fontSize: width < 768 ? 32 : 40 }]}>{title}</Type>
          {subtitle ? <Type style={{ color: colors.inkSoft, maxWidth: 620 }}>{subtitle}</Type> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  content: { width: "100%", maxWidth: 1080, alignSelf: "center", gap: 28 },
  header: { gap: 12 },
  title: { fontFamily: fonts.displayHeavy, lineHeight: 50, letterSpacing: -1 },
});
