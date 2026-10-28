import { View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { fonts } from "../theme/fonts";
import { Type } from "./Type";

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "good" | "warn" | "neutral" }) {
  const { colors } = useTheme();
  const color = tone === "good" ? colors.green : tone === "warn" ? colors.yellow : colors.inkSoft;
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.ground }}>
      <Type style={{ color, fontFamily: fonts.medium, fontSize: 11, lineHeight: 18 }}>{label}</Type>
    </View>
  );
}
