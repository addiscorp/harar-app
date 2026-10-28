import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Type } from "../components/Type";
import { useTheme } from "./ThemeContext";

interface Toast { message: string; tone: "info" | "error" }
const ToastContext = createContext<((message: string, tone?: Toast["tone"]) => void) | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={{ position: "absolute", bottom: insets.bottom + 88, left: 32, right: 24, alignItems: "center" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${toast.message} Dismiss notification`} onPress={() => setToast(null)} style={{ maxWidth: 560, padding: 16, backgroundColor: colors.panel, borderWidth: 1, borderRadius: 4, borderColor: toast.tone === "error" ? colors.red : colors.rule }}>
            <Type accessibilityRole="alert" accessibilityLiveRegion="polite">{toast.message}</Type>
          </Pressable>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
