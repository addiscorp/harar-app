import { Text, type TextProps } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { fonts } from "../theme/fonts";

export function Type({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return <Text {...props} style={[{ fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.ink }, style]} />;
}
