import { useEffect, useState } from "react";
import { todayKey } from "@/utils/localDate";

/**
 * "Hoje" (YYYY-MM-DD, fuso local) que se atualiza sozinho quando o dia vira.
 * Sem isso, uma tela aberta desde a noite anterior (PWA/desktop ficam abertos
 * por horas) continuava tratando "ontem" como hoje e gravava registros no dia
 * errado.
 */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => todayKey());
  useEffect(() => {
    const refresh = () => setKey((current) => {
      const next = todayKey();
      return next === current ? current : next;
    });
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return key;
}
