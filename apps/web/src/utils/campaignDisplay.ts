import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { Campaign, CampaignStatus, CampaignTerm } from "@/services/campaignsService";
import { LIFE_AREA_BY_KEY } from "@/utils/lifeOsLabels";
import type { LifeArea } from "@/types";

/**
 * Apresentação da Forja de Campanhas (sem regra de negócio): rótulos,
 * tons e a biblioteca INTERNA de artes — nunca URL remota.
 */
const BASE = "/assets/rpg";
export const CAMPAIGN_FORGE_BANNER = `${BASE}/campaign-forge-banner.webp`;

export const CAMPAIGN_ART = [
  { id: "castelo", label: "Castelo ao luar" },
  { id: "vale", label: "Vale da cascata" },
  { id: "ruina", label: "Portal em ruínas" },
  { id: "navio", label: "Navio ao entardecer" },
  { id: "torre", label: "Torre arcana" },
  { id: "forja", label: "Forja" },
] as const;
export type CampaignArt = (typeof CAMPAIGN_ART)[number]["id"];
export const campaignArtSrc = (id: string | null | undefined) => `${BASE}/campaigns/${CAMPAIGN_ART.some((a) => a.id === id) ? id : "castelo"}.webp`;

export const CAMPAIGN_ICONS = ["bandeira", "coroa", "livro", "espada", "escudo", "mapa", "chama", "joia"] as const;
export const ICON_EMOJI: Record<string, string> = { bandeira: "🚩", coroa: "👑", livro: "📖", espada: "⚔️", escudo: "🛡️", mapa: "🗺️", chama: "🔥", joia: "💎" };

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: RpgTone }> = {
  planned: { label: "Planejada", tone: "blue" },
  active: { label: "Em andamento", tone: "gold" },
  paused: { label: "Pausada", tone: "orange" },
  completed: { label: "Concluída", tone: "green" },
  archived: { label: "Arquivada", tone: "muted" },
};

export const TERM_LABEL: Record<CampaignTerm, string> = { curto: "Curto prazo", medio: "Médio prazo", longo: "Longo prazo" };
export const THEME_TONES: RpgTone[] = ["gold", "purple", "blue", "green", "orange", "red", "cyan", "pink"];

export function lifeAreaLabel(key: string | null | undefined): { label: string; emoji: string } | null {
  if (!key) return null;
  const a = LIFE_AREA_BY_KEY[key as LifeArea];
  return a ? { label: a.label, emoji: a.emoji } : null;
}

export function fmtMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Campanha em destaque quando nada foi escolhido: a ATIVA com prazo mais
 * próximo, depois maior prioridade (determinístico, sem sorteio).
 */
const PRI: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2 };
export function pickFeatured(list: Campaign[]): Campaign | null {
  const active = list.filter((c) => c.status === "active");
  const pool = active.length ? active : list.filter((c) => c.status !== "archived");
  return (
    [...pool].sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999") || (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || a.createdAt.localeCompare(b.createdAt))[0] ?? null
  );
}

export type CampaignSort = "recent" | "oldest" | "progress_desc" | "progress_asc" | "deadline";
export function sortCampaigns(list: Campaign[], sort: CampaignSort): Campaign[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "progress_desc":
      return arr.sort((a, b) => b.progress.pct - a.progress.pct);
    case "progress_asc":
      return arr.sort((a, b) => a.progress.pct - b.progress.pct);
    case "deadline":
      return arr.sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999"));
    default:
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** KPIs da Forja (só dados reais; recompensas = já conquistadas). */
export function forgeKpis(list: Campaign[]) {
  const active = list.filter((c) => c.status === "active");
  const notArchived = list.filter((c) => c.status !== "archived");
  const weight = (c: Campaign) => Math.max(1, c.counts.missions + c.counts.milestones);
  const wsum = active.reduce((s, c) => s + weight(c), 0);
  return {
    active: active.length,
    created: notArchived.length,
    openMissions: active.reduce((s, c) => s + (c.counts.missions - c.counts.missionsDone), 0),
    earnedXp: list.reduce((s, c) => s + c.earned.xp, 0),
    earnedCoins: list.reduce((s, c) => s + c.earned.coins, 0),
    // Média ponderada pelo tamanho (missões + marcos) das campanhas ativas.
    avgProgress: wsum > 0 ? Math.round(active.reduce((s, c) => s + c.progress.pct * weight(c), 0) / wsum) : null,
  };
}
