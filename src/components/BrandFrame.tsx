import type { CSSProperties, ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { transparent } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { Mark } from "./mark";
import { Type } from "./Type";

export function BrandFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = Platform.OS !== "web" || width <= 720;
  const wordmarkScale = narrow ? 28 / styles.wordmark.fontSize : 1;
  return (
    <View style={[styles.frame, { backgroundColor: colors.ground }]}>
      <SafeAreaView style={[styles.body, { backgroundColor: colors.screen }]} edges={["top", "left", "right"]}>
        <View testID="brand-header" style={[styles.header, { backgroundColor: colors.ground, borderBottomColor: colors.rule, paddingHorizontal: narrow ? 24 : 32 }]}>
          {Platform.OS === "web" ? (
            <div style={{ display: "flex", "--ink": colors.ink, "--accent": colors.accent } as CSSProperties}><Mark size={32} /></div>
          ) : <Mark size={32} />}
          <Type style={[styles.wordmark, {
            fontSize: styles.wordmark.fontSize * wordmarkScale,
            lineHeight: styles.wordmark.lineHeight * wordmarkScale,
            letterSpacing: styles.wordmark.letterSpacing * wordmarkScale,
          }]}>zega</Type>
          <View style={{ width: 1, height: 20, backgroundColor: colors.rule }} />
          <Type style={{ color: colors.inkSoft, fontSize: 12 }}>control</Type>
        </View>
        <View testID="brand-content" style={styles.body}>
          {children}
          {Platform.OS === "web" ? (
            <div
              data-testid="brand-grid"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                pointerEvents: "none",
                backgroundImage: `linear-gradient(to right, ${colors.grid} 1px, ${transparent} 1px), linear-gradient(to bottom, ${colors.grid} 1px, ${transparent} 1px)`,
                backgroundSize: "28px 28px",
              }}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  body: { flex: 1, minWidth: 0 },
  header: { minHeight: 76, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: 1 },
  wordmark: { fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 42, letterSpacing: -1.5 },
});
