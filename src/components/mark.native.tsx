import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "../contexts/ThemeContext";

// Native rendering of the same paths in zegadb/site's mark.tsx.
export function Mark({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return <Svg viewBox="0 0 32 32" width={size} height={size} accessibilityRole="image" accessibilityLabel="zega">
    <Path d="M8 7 H24 L8 25 H24" fill="none" stroke={colors.ink} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="24" cy="7" r="4.2" fill={colors.accent} />
    <Circle cx="8" cy="25" r="4.2" fill={colors.accent} />
  </Svg>;
}
