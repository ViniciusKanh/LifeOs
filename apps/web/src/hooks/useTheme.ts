import { useCallback, useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "lifeos:theme";

function resolveSystemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? "system"
  );

  const isDark = mode === "dark" || (mode === "system" && resolveSystemPrefersDark());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => document.documentElement.classList.toggle("dark", resolveSystemPrefersDark());
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  return { mode, isDark, setMode };
}
