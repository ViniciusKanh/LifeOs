import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { SCENE_H, SCENE_W } from "./engine/scenes";

/**
 * Moldura de uma cena pixel art desenhada por código (engine/scenes.ts).
 * Anima a ~30 fps só enquanto visível; com "reduzir movimento" desenha um
 * quadro parado.
 */
export function PixelScene({ draw, label, className }: { draw: (ctx: CanvasRenderingContext2D, t: number, still: boolean) => void; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    if (reduce) {
      drawRef.current(ctx, 0, true);
      return;
    }
    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    const loop = (t: number) => {
      raf = 0;
      if (!visible) return;
      if (t - last > 33) {
        last = t;
        drawRef.current(ctx, t, false);
      }
      raf = requestAnimationFrame(loop);
    };
    io.observe(c);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduce]);
  return <canvas ref={ref} width={SCENE_W} height={SCENE_H} role="img" aria-label={label} className={className} style={{ imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "cover" }} />;
}
