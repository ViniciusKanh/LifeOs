import { useEffect, useState } from "react";

/**
 * Desktop largo (≥1280px) mostra detalhes na lateral; abaixo disso o
 * detalhe abre como folha/modal. Compartilhado por Inventário e Protocolos.
 */
export function useWide(query = "(min-width: 1280px)"): boolean {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return wide;
}
