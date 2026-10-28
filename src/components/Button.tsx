import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { fonts } from "../theme/fonts";
import { Type } from "./Type";

export function Button({ label, onPress, disabled = false, secondary = false, style }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, {
        backgroundColor: secondary ? colors.panel : colors.button,
        borderColor: pressed ? colors.ink : secondary ? colors.rule : colors.button,
      }, style]}
    >
      <Type style={{ fontFamily: fonts.semibold, color: disabled ? colors.inkSoft : secondary ? colors.ink : colors.buttonInk }}>{label}</Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { minHeight: 48, borderWidth: 1, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 12, alignItems: "center", justifyContent: "center" } });
