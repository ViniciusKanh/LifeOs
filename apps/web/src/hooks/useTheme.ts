import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Tema visual do LifeOS: Claro, Escuro, Automático (sistema) e RPG.
 *
 * O RPG é um tema escuro com identidade própria (pixel art, painéis navy,
 * bordas douradas). Por isso ele liga a classe "dark" (as telas ainda não
 * migradas continuam legíveis com os estilos escuros) e a classe "rpg", que
 * habilita a variante `rpg:` do Tailwind e remapeia os tokens (ver index.css).
 *
 * O estado fica num store de módulo: Sidebar, cabeçalho e Perfil usam o
 * hook ao mesmo tempo e precisam enxergar a mesma escolha na hora.
 * A preferência é só de interface (localStorage), nunca dado do usuário.
 */
export type ThemeMode = "light" | "dark" | "system" | "rpg";

const STORAGE_KEY = "lifeos:theme";
const MODES: ThemeMode[] = ["light", "dark", "system", "rpg"];
/** Ordem do botão de alternância rápida (Sidebar e cabeçalho mobile). */
export const THEME_CYCLE: ThemeMode[] = ["light", "dark", "rpg"];
export const THEME_LABEL: Record<ThemeMode, string> = { light: "Claro", dark: "Escuro", system: "Automático (sistema)", rpg: "RPG" };

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return v && MODES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

let current: ThemeMode = typeof window === "undefined" ? "system" : readMode();
const listeners = new Set<() => void>();

function prefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  const rpg = mode === "rpg";
  root.classList.toggle("rpg", rpg);
  root.classList.toggle("dark", rpg || mode === "dark" || (mode === "system" && prefersDark()));
  root.style.colorScheme = root.classList.contains("dark") ? "dark" : "light";
}

if (typeof window !== "undefined") {
  apply(current);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") apply(current);
  });
}

/** Próximo tema da alternância rápida; "Automático" parte do tema que está visível. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const from = mode === "system" ? (typeof window !== "undefined" && prefersDark() ? "dark" : "light") : mode;
  return THEME_CYCLE[(THEME_CYCLE.indexOf(from) + 1) % THEME_CYCLE.length];
}

function setThemeMode(next: ThemeMode) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage bloqueado: o tema vale só nesta sessão.
  }
  apply(next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, () => current, () => "system" as ThemeMode);
  // Garante a classe certa mesmo se algo externo mexer no <html>.
  useEffect(() => apply(mode), [mode]);

  const setMode = useCallback((next: ThemeMode) => setThemeMode(next), []);
  const cycle = useCallback(() => setThemeMode(nextThemeMode(current)), []);

  const isRpg = mode === "rpg";
  const isDark = isRpg || mode === "dark" || (mode === "system" && typeof window !== "undefined" && prefersDark());
  return { mode, isDark, isRpg, setMode, cycle };
}
