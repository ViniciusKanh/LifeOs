import { motion, useReducedMotion } from "motion/react";

/**
 * Símbolo do LifeOS desenhado em SVG (seta circular de progresso + "L" +
 * barras crescentes), animado: o anel se desenha, a seta aparece e as
 * barras sobem em sequência. Usado como peça visual nas telas públicas.
 */
export function LogoMark({ size = 220, color = "#fff", loop = true }: { size?: number; color?: string; loop?: boolean }) {
  const reduce = useReducedMotion();
  const repeat = loop && !reduce ? Infinity : 0;
  const bars = [
    { x: 92, h: 22 },
    { x: 111, h: 33 },
    { x: 130, h: 46 },
  ];
  const draw = (delay: number) => ({
    initial: { pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { duration: 1.2, delay, ease: "easeInOut" as const, repeat, repeatDelay: 3.2, repeatType: "loop" as const },
  });

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      {/* anel de progresso: sai do topo, contorna pela esquerda e por baixo e sobe pela direita até a seta (arco anti-horário) */}
      <motion.path d="M 118 22 A 80 80 0 1 0 168 58" stroke={color} strokeWidth={17} strokeLinecap="round" {...draw(0)} />
      <motion.path
        d="M 154 36 L 183 53.5 L 157 69 Z"
        fill={color}
        initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.05, type: "spring", stiffness: 320, damping: 14, repeat, repeatDelay: 3.95 }}
        style={{ transformOrigin: "165px 53px" }}
      />
      {/* "L" */}
      <motion.path d="M 70 46 L 70 118 Q 70 136 88 136 L 150 136" stroke={color} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" {...draw(0.35)} />
      {/* barras crescentes */}
      {bars.map((b, i) => (
        <motion.rect
          key={b.x}
          x={b.x}
          width={13}
          rx={6.5}
          fill={color}
          initial={{ y: 122, height: reduce ? b.h : 0, opacity: reduce ? 1 : 0.4 }}
          animate={{ y: 122 - b.h, height: b.h, opacity: 1 }}
          transition={{ delay: 0.9 + i * 0.18, type: "spring", stiffness: 200, damping: 16, repeat, repeatDelay: 3.3 }}
          fillOpacity={0.6 + i * 0.2}
        />
      ))}
    </svg>
  );
}
