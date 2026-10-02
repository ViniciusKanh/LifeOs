import { Moon, Swords, SunMedium } from "lucide-react";
import { THEME_LABEL, nextThemeMode as nextMode, type ThemeMode } from "@/hooks/useTheme";

export function themeCycleLabel(mode: ThemeMode) {
  return `Tema ${THEME_LABEL[nextMode(mode)].toLowerCase()}`;
}

/** Ícone do tema que será ativado ao clicar. */
export function ThemeCycleIcon({ mode, size }: { mode: ThemeMode; size: number }) {
  const next = nextMode(mode);
  if (next === "rpg") return <Swords size={size} />;
  return next === "dark" ? <Moon size={size} /> : <SunMedium size={size} />;
}
