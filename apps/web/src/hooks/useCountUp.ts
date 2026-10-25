import { useEffect, useRef, useState } from "react";

/**
 * Anima um número inteiro subindo (ou descendo) até o valor real mais
 * recente -- puramente visual, nunca inventa o valor: começa sempre do
 * último valor real exibido e termina exatamente no novo valor real vindo
 * do servidor. Respeita prefers-reduced-motion (pula direto pro valor final).
 */
export function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === fromRef.current) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out: desacelera no final, mais parecido com um placar de verdade.
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return display;
}
