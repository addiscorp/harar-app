import { useState } from "react";
import { Pressable, View } from "react-native";
import { Card } from "../../src/components/Card";
import { Screen } from "../../src/components/Screen";
import { Type } from "../../src/components/Type";
import { useTheme, type ThemeMode } from "../../src/contexts/ThemeContext";
import { useToast } from "../../src/contexts/ToastContext";
import { fonts } from "../../src/theme/fonts";

const modes: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const toast = useToast();
  const [savingTheme, setSavingTheme] = useState(false);

  const chooseTheme = async (next: ThemeMode) => {
    setSavingTheme(true);
    try { await setMode(next); }
    catch { toast("Could not save your appearance preference. Please try again.", "error"); }
    finally { setSavingTheme(false); }
  };
  return (
    <Screen title="Settings" subtitle="How Simien looks on this phone.">
      <Card>
        <Type accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 32 }}>Appearance</Type>
        <Type style={{ color: colors.inkSoft }}>Follow your device, or choose a theme for this app.</Type>
        <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {modes.map((option) => (
            <Pressable key={option.value} accessibilityRole="radio" aria-checked={mode === option.value} accessibilityState={{ checked: mode === option.value, disabled: savingTheme }} disabled={savingTheme} onPress={() => { void chooseTheme(option.value); }} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderRadius: 4, borderColor: mode === option.value || pressed ? colors.accent : colors.rule, backgroundColor: mode === option.value ? colors.ground : colors.panel })}>
              <Type style={{ fontFamily: mode === option.value ? fonts.semibold : fonts.body }}>{option.label}</Type>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
