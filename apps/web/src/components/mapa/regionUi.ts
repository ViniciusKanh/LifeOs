import { Briefcase, Brain, Coins, GraduationCap, HeartPulse, Milestone, type LucideIcon } from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { RegionKey, WorldRegion } from "@/services/worldmapService";

/**
 * Apresentação das regiões do Mapa do Mundo (só visual: nome, XP, nível e
 * classificação vêm da API). `pos` é o centro da ilha no viewBox 1000×620.
 * As classes de preenchimento ficam escritas por extenso para o Tailwind
 * enxergá-las (sem montar nome de classe dinamicamente).
 */
export interface RegionUi {
  icon: LucideIcon;
  tone: RpgTone;
  pos: { x: number; y: number };
  size: { rx: number; ry: number };
  seed: number;
  land: string;
  shore: string;
}

export const MAP_W = 1000;
export const MAP_H = 620;

export const REGION_UI: Record<RegionKey, RegionUi> = {
  estudos: {
    icon: GraduationCap,
    tone: "purple",
    pos: { x: 190, y: 150 },
    size: { rx: 150, ry: 96 },
    seed: 1.3,
    land: "fill-rpg-purple/35",
    shore: "fill-rpg-purple/15",
  },
  trabalho: {
    icon: Briefcase,
    tone: "blue",
    pos: { x: 500, y: 112 },
    size: { rx: 150, ry: 88 },
    seed: 2.1,
    land: "fill-rpg-blue/35",
    shore: "fill-rpg-blue/15",
  },
  mente: {
    icon: Brain,
    tone: "pink",
    pos: { x: 810, y: 150 },
    size: { rx: 150, ry: 96 },
    seed: 3.7,
    land: "fill-rpg-pink/30",
    shore: "fill-rpg-pink/10",
  },
  saude: {
    icon: HeartPulse,
    tone: "green",
    pos: { x: 200, y: 468 },
    size: { rx: 160, ry: 100 },
    seed: 4.4,
    land: "fill-rpg-green/30",
    shore: "fill-rpg-green/10",
  },
  financas: {
    icon: Coins,
    tone: "gold",
    pos: { x: 800, y: 468 },
    size: { rx: 160, ry: 100 },
    seed: 5.9,
    land: "fill-rpg-gold/30",
    shore: "fill-rpg-gold/10",
  },
  encruzilhada: {
    icon: Milestone,
    tone: "orange",
    pos: { x: 500, y: 378 },
    size: { rx: 128, ry: 84 },
    seed: 6.6,
    land: "fill-rpg-orange/30",
    shore: "fill-rpg-orange/10",
  },
};

/** Ordem de leitura (teclado e lista do celular): centro primeiro, depois as regiões. */
export const REGION_ORDER: RegionKey[] = ["encruzilhada", "estudos", "trabalho", "mente", "saude", "financas"];

/** Texto da tendência (30 dias × 30 anteriores). Cor nunca é o único sinal. */
export function trendInfo(r: Pick<WorldRegion, "trendPct" | "last30" | "prev30">): { text: string; tone: RpgTone; aria: string } {
  if (r.trendPct == null) {
    return r.last30 > 0
      ? {
          text: "Novo",
          tone: "cyan",
          aria: `${r.last30} XP nos últimos 30 dias, sem base anterior`,
        }
      : { text: "Parado", tone: "muted", aria: "Sem XP nos últimos 30 dias" };
  }
  if (r.trendPct > 0)
    return {
      text: `▲ +${r.trendPct}%`,
      tone: "green",
      aria: `Subiu ${r.trendPct}% em relação aos 30 dias anteriores`,
    };
  if (r.trendPct < 0)
    return {
      text: `▼ ${r.trendPct}%`,
      tone: "red",
      aria: `Caiu ${Math.abs(r.trendPct)}% em relação aos 30 dias anteriores`,
    };
  return {
    text: "= Estável",
    tone: "muted",
    aria: "Igual aos 30 dias anteriores",
  };
}

/**
 * Ilha "pixelada": células de uma elipse com borda ondulada determinística
 * (senos com semente fixa). Devolve um único path (barato de desenhar).
 */
export function islandPath(cx: number, cy: number, rx: number, ry: number, seed: number, scale = 1, cell = 16): string {
  const parts: string[] = [];
  const nx = Math.ceil((rx * scale * 1.3) / cell);
  const ny = Math.ceil((ry * scale * 1.3) / cell);
  for (let gy = -ny; gy <= ny; gy++) {
    for (let gx = -nx; gx <= nx; gx++) {
      const x = (gx + 0.5) * cell;
      const y = (gy + 0.5) * cell;
      const theta = Math.atan2(y / ry, x / rx);
      const wobble = 1 + 0.12 * Math.sin(3 * theta + seed) + 0.07 * Math.sin(5 * theta + seed * 2.3) + 0.04 * Math.sin(9 * theta + seed * 0.7);
      const d = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
      if (d <= wobble * scale) parts.push(`M${Math.round(cx + gx * cell)} ${Math.round(cy + gy * cell)}h${cell}v${cell}h-${cell}z`);
    }
  }
  return parts.join("");
}
