import { useEffect, useRef } from "react";
import { getSprite, SPRITE_H, SPRITE_W, type Pose } from "./engine/sprites";
import { agentLookFor, type CharacterLook } from "./engine/looks";

/**
 * Retrato em pixel art de qualquer personagem do Meu Mundo: o mesmo sprite do
 * mapa, recortado no busto (`crop="bust"`) ou de corpo inteiro.
 */
export function CharacterPortrait({ look, size = 44, pose = "stand", crop = "bust", frame = 0, back = false }: { look: CharacterLook; size?: number; pose?: Pose; crop?: "bust" | "full"; frame?: number; back?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cropH = crop === "bust" ? Math.round(SPRITE_H * 0.56) : SPRITE_H;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const spr = getSprite(look, pose, frame, back);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(spr, 0, 0, SPRITE_W, cropH, 0, 0, c.width, c.height);
  }, [look, pose, frame, back, cropH]);
  const ratio = cropH / SPRITE_W;
  return <canvas ref={ref} width={SPRITE_W * 2} height={cropH * 2} style={{ width: crop === "bust" ? size : size / ratio, height: crop === "bust" ? size * ratio : size, imageRendering: "pixelated" }} aria-hidden />;
}

/** Retrato do agente: visual personalizado pelo usuário ou o padrão da especialidade. */
export function AgentPortrait({ agentKey, look, size = 44, working = false }: { agentKey: string; look?: Partial<CharacterLook> | null; size?: number; working?: boolean }) {
  const full = agentLookFor(agentKey, look);
  return <CharacterPortrait look={full} size={size} pose={working ? "typing" : "stand"} />;
}
