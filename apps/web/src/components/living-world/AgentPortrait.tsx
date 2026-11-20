import { useEffect, useRef } from "react";
import { getSprite, SPRITE_H, SPRITE_W, type Look } from "./engine/sprites";

const VARIANT: Record<string, Look["variant"]> = { planejador: "planner", mentor: "mentor", analista: "analyst", habitos: "habits" };

/** Retrato em pixel art do agente: o mesmo sprite do mapa, recortado no busto. */
export function AgentPortrait({ agentKey, color, size = 44, working = false }: { agentKey: string; color: string; size?: number; working?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const look: Look = { kind: "robot", skin: "#cfd6e6", hair: "#000", shirt: color, pants: "#8e97ab", accent: color, variant: VARIANT[agentKey] };
    const spr = getSprite(look, working ? "typing" : "stand", 0, false);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    // busto: metade de cima do sprite, ampliado
    ctx.drawImage(spr, 0, 0, SPRITE_W, SPRITE_H * 0.62, 0, 0, c.width, c.height);
  }, [agentKey, color, working]);
  return <canvas ref={ref} width={SPRITE_W * 2} height={Math.round(SPRITE_H * 0.62 * 2)} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-hidden />;
}
