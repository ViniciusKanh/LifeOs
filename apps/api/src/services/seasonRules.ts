/**
 * Regras PURAS das Temporadas mensais (sem I/O — testadas isoladamente).
 * Temporada = mês civil no fuso do usuário; nome temático fixo por mês;
 * trilha de recompensas COSMÉTICAS por limiares de XP do mês.
 */

import type { Rarity } from "../config/codex.js";

export interface SeasonTheme {
  name: string;
  /** Sufixo usado no nome das recompensas ("Insígnia de Prata da Colheita"). */
  suffix: string;
  motto: string;
}

/** Índice 0 = janeiro. Determinístico: o mesmo mês sempre tem o mesmo tema. */
export const SEASON_THEMES: SeasonTheme[] = [
  { name: "Temporada da Renovação", suffix: "da Renovação", motto: "Um novo mapa se abre." },
  { name: "Temporada das Chamas", suffix: "das Chamas", motto: "Mantenha a fogueira acesa." },
  { name: "Temporada dos Ventos", suffix: "dos Ventos", motto: "Ajuste as velas e siga." },
  { name: "Temporada da Floração", suffix: "da Floração", motto: "O que foi plantado começa a brotar." },
  { name: "Temporada das Forjas", suffix: "das Forjas", motto: "Disciplina se forja golpe a golpe." },
  { name: "Temporada do Solstício", suffix: "do Solstício", motto: "Meio do ano, meio do caminho." },
  { name: "Temporada das Geadas", suffix: "das Geadas", motto: "Constância vence o frio." },
  { name: "Temporada dos Lobos", suffix: "dos Lobos", motto: "A matilha caça em ritmo." },
  { name: "Temporada do Despertar", suffix: "do Despertar", motto: "Hora de acordar os projetos." },
  { name: "Temporada da Colheita", suffix: "da Colheita", motto: "Colha o que você cultivou." },
  { name: "Temporada das Estrelas Cadentes", suffix: "das Estrelas", motto: "Faça seus pedidos — e cumpra-os." },
  { name: "Temporada das Lanternas", suffix: "das Lanternas", motto: "Ilumine o fim da jornada do ano." },
];

export interface SeasonTier {
  tier: number;
  xp: number;
  /** Nome base do cosmético; o tema completa ("Flâmula" + " da Colheita"). */
  reward: string;
  rarity: Rarity;
}

/**
 * Trilha de recompensas. Limiares pensados para um mês de uso real:
 * ~3 missões médias por dia passam do tier 4; o tier 6 pede um mês intenso.
 */
export const SEASON_TIERS: SeasonTier[] = [
  { tier: 1, xp: 100, reward: "Flâmula", rarity: "common" },
  { tier: 2, xp: 300, reward: "Insígnia de Bronze", rarity: "common" },
  { tier: 3, xp: 600, reward: "Insígnia de Prata", rarity: "uncommon" },
  { tier: 4, xp: 1000, reward: "Insígnia de Ouro", rarity: "rare" },
  { tier: 5, xp: 1600, reward: "Estandarte", rarity: "epic" },
  { tier: 6, xp: 2500, reward: "Coroa", rarity: "legendary" },
];

export const seasonKeyOf = (dayKey: string) => dayKey.slice(0, 7);

export function seasonTheme(seasonKey: string): SeasonTheme {
  const month = Number(seasonKey.slice(5, 7));
  return SEASON_THEMES[(Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1) - 1];
}

/** Primeiro e último dia (YYYY-MM-DD) do mês da temporada. */
export function seasonRange(seasonKey: string): { from: string; to: string } {
  const [y, m] = seasonKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${seasonKey}-01`, to: `${seasonKey}-${String(last).padStart(2, "0")}` };
}

export function previousSeasonKey(seasonKey: string): string {
  const [y, m] = seasonKey.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Dias restantes depois de hoje (0 = último dia da temporada). */
export function daysLeftInSeason(today: string): number {
  const { to } = seasonRange(seasonKeyOf(today));
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function tierForXp(xp: number): number {
  let reached = 0;
  for (const t of SEASON_TIERS) if (xp >= t.xp) reached = t.tier;
  return reached;
}

export const seasonRewardKey = (seasonKey: string, tier: number) => `season:${seasonKey}:t${tier}`;

export function seasonRewardName(seasonKey: string, tier: number): string {
  const t = SEASON_TIERS.find((x) => x.tier === tier);
  return t ? `${t.reward} ${seasonTheme(seasonKey).suffix}` : `Recompensa de temporada ${tier}`;
}

/** Decodifica "season:YYYY-MM:tN" (usado pelo inventário para exibir o cosmético). */
export function parseSeasonRewardKey(key: string): { seasonKey: string; tier: number } | null {
  const m = /^season:(\d{4}-\d{2}):t(\d)$/.exec(key);
  return m ? { seasonKey: m[1], tier: Number(m[2]) } : null;
}
