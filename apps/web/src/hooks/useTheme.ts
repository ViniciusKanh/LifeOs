/**
 * Tema visual do LifeOS: o RPG é o tema nativo e único do app.
 *
 * Os temas Claro, Escuro e Automático foram removidos. O RPG continua ligando
 * as classes "dark" (telas antigas seguem legíveis com os estilos escuros) e
 * "rpg" (variante `rpg:` do Tailwind e tokens do tema, ver index.css). O
 * index.html já sai com essas classes, então não há "piscada" de tema claro.
 *
 * A assinatura do hook foi mantida (mode/isDark/isRpg/setMode/cycle) para não
 * quebrar quem ainda consulta `isRpg`; setMode e cycle não fazem mais nada.
 */
export type ThemeMode = "rpg";

export const THEME_LABEL: Record<ThemeMode, string> = { rpg: "RPG" };

function apply() {
  const root = document.documentElement;
  root.classList.add("rpg", "dark");
  root.style.colorScheme = "dark";
}

if (typeof window !== "undefined") {
  apply();
  try {
    // Preferência antiga de tema (claro/escuro/sistema) não vale mais.
    localStorage.removeItem("lifeos:theme");
  } catch {
    // Storage bloqueado: nada a limpar.
  }
}

const noop = () => undefined;

export function useTheme() {
  return { mode: "rpg" as ThemeMode, isDark: true, isRpg: true, setMode: noop as (next: ThemeMode) => void, cycle: noop };
}
