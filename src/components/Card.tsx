import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.rule }, style]} />;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 6, padding: 24, gap: 16 } });
