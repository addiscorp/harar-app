import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getSecureItem, setSecureItem } from "../lib/secureStorage";
import { dark, light, type ThemeColors } from "../theme/colors";

export type ThemeMode = "system" | "light" | "dark";
const THEME_KEY = "zega-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  theme: "light" | "dark";
  colors: ThemeColors;
  ready: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemTheme = useColorScheme();
  const [mode, setStoredMode] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getSecureItem(THEME_KEY)
      .then((stored) => {
        if (active && (stored === "light" || stored === "dark")) setStoredMode(stored);
      })
      // Appearance is optional. Unavailable storage must not hide the sign-in screen.
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    await setSecureItem(THEME_KEY, next);
    setStoredMode(next);
  }, []);
  const theme = mode === "system" ? (systemTheme ?? "light") : mode;
  const value = useMemo(() => ({ mode, theme, colors: theme === "dark" ? dark : light, ready, setMode }), [mode, theme, ready, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
