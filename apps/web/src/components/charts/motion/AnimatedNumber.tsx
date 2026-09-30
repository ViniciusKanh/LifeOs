import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

/**
 * Número que "sobe" até o valor real quando entra na tela. Respeita
 * "reduzir movimento" (mostra o valor final direto). Só anima número já
 * calculado — nunca inventa valor intermediário persistente.
 */
export function AnimatedNumber({ value, decimals = 0, suffix = "", className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const last = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const format = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    if (reduce) {
      el.textContent = format(value);
      last.current = value;
      return;
    }
    if (!inView) {
      el.textContent = format(last.current);
      return;
    }
    const controls = animate(last.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = format(v)),
    });
    last.current = value;
    return () => controls.stop();
  }, [value, decimals, suffix, inView, reduce]);

  return <span ref={ref} className={className} />;
}
