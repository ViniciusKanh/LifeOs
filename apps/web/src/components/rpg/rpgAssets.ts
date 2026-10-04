/**
 * Catálogo dos assets aprovados do tema RPG (public/assets/rpg).
 * Componentes nunca montam caminhos de imagem à mão: tudo passa por aqui,
 * para trocar um asset sem caçar referências pelo app.
 */
const BASE = "/assets/rpg";

export const RPG_LOGO = {
  icon: `${BASE}/logo/logo-icon.webp`,
  full: `${BASE}/logo/logo-full.webp`,
};

export type RpgAvatarId = "aventureiro" | "alquimista" | "inventor" | "cavaleiro" | "arqueiro" | "mago";

/** Avatares são só cosméticos: escolher um não muda nenhuma regra do app. */
export const RPG_AVATARS: Array<{ id: RpgAvatarId; label: string; src: string; srcSm: string }> = (
  [
    ["aventureiro", "Aventureiro"],
    ["alquimista", "Alquimista"],
    ["inventor", "Inventor"],
    ["cavaleiro", "Cavaleiro"],
    ["arqueiro", "Arqueiro"],
    ["mago", "Mago"],
  ] as const
).map(([id, label]) => ({ id, label, src: `${BASE}/avatars/${id}.webp`, srcSm: `${BASE}/avatars/${id}-sm.webp` }));

export const DEFAULT_RPG_AVATAR: RpgAvatarId = "aventureiro";

export function rpgAvatar(id: RpgAvatarId | null | undefined) {
  return RPG_AVATARS.find((a) => a.id === id) ?? RPG_AVATARS[0];
}

export type RpgBanner = "dashboard" | "hoje" | "tarefas" | "saude" | "diario" | "notas" | "habitos" | "biblioteca" | "educacao" | "administracao" | "revisoes" | "analytics" | "missoes" | "contratos" | "reino" | "conquistas" | "perfil" | "laboratorio" | "loja";
export const RPG_BANNERS: Record<RpgBanner, string> = {
  dashboard: `${BASE}/banners/dashboard.webp`,
  hoje: `${BASE}/banners/hoje.webp`,
  tarefas: `${BASE}/banners/tarefas.webp`,
  saude: `${BASE}/banners/saude.webp`,
  diario: `${BASE}/banners/diario.webp`,
  notas: `${BASE}/banners/notas.webp`,
  habitos: `${BASE}/banners/habitos.webp`,
  biblioteca: `${BASE}/banners/biblioteca.webp`,
  educacao: `${BASE}/banners/educacao.webp`,
  administracao: `${BASE}/banners/administracao.webp`,
  revisoes: `${BASE}/banners/revisoes.webp`,
  analytics: `${BASE}/banners/analytics.webp`,
  missoes: `${BASE}/banners/missoes.webp`,
  contratos: `${BASE}/banners/contratos.webp`,
  reino: `${BASE}/banners/reino.webp`,
  conquistas: `${BASE}/banners/conquistas.webp`,
  perfil: `${BASE}/banners/perfil.webp`,
  laboratorio: `${BASE}/banners/laboratorio.webp`,
  loja: `${BASE}/banners/loja.webp`,
};

/** Tons do design system RPG → classes Tailwind dos tokens (sem hex solto). */
export type RpgTone = "gold" | "purple" | "blue" | "green" | "red" | "orange" | "cyan" | "pink" | "muted";

export const RPG_TONE_TEXT: Record<RpgTone, string> = {
  gold: "text-rpg-gold-light",
  purple: "text-rpg-purple",
  blue: "text-rpg-blue",
  green: "text-rpg-green",
  red: "text-rpg-red",
  orange: "text-rpg-orange",
  cyan: "text-rpg-cyan",
  pink: "text-rpg-pink",
  muted: "text-rpg-muted",
};

export const RPG_TONE_BG: Record<RpgTone, string> = {
  gold: "bg-rpg-gold",
  purple: "bg-rpg-purple",
  blue: "bg-rpg-blue",
  green: "bg-rpg-green",
  red: "bg-rpg-red",
  orange: "bg-rpg-orange",
  cyan: "bg-rpg-cyan",
  pink: "bg-rpg-pink",
  muted: "bg-rpg-muted",
};

export const RPG_TONE_SOFT: Record<RpgTone, string> = {
  gold: "bg-rpg-gold/15 border-rpg-gold/50 text-rpg-gold-light",
  purple: "bg-rpg-purple/15 border-rpg-purple/50 text-rpg-purple",
  blue: "bg-rpg-blue/15 border-rpg-blue/50 text-rpg-blue",
  green: "bg-rpg-green/15 border-rpg-green/50 text-rpg-green",
  red: "bg-rpg-red/15 border-rpg-red/55 text-rpg-red",
  orange: "bg-rpg-orange/15 border-rpg-orange/50 text-rpg-orange",
  cyan: "bg-rpg-cyan/15 border-rpg-cyan/50 text-rpg-cyan",
  pink: "bg-rpg-pink/15 border-rpg-pink/50 text-rpg-pink",
  muted: "bg-rpg-panel-light border-rpg-border text-rpg-muted",
};

/** Prioridade de tarefa → tom (Baixa verde, Média âmbar, Alta vermelho). */
export const PRIORITY_TONE: Record<string, RpgTone> = { Alta: "red", Média: "orange", Baixa: "green", Crítica: "red" };

/** Classes de título de seção no tema RPG (pixel, dourado, caixa alta) — somadas ao título clássico. */
export const RPG_SECTION_TITLE = "rpg:font-pixel rpg:uppercase rpg:tracking-[0.08em] rpg:text-[13px] rpg:text-rpg-gold-light";

/** Cor de token para SVG/gráficos (recharts aceita a string direto). */
export const rpgColor = (tone: RpgTone | "text" | "muted-text" | "border" | "panel" | "bg") =>
  tone === "muted-text" || tone === "muted" ? "rgb(var(--rpg-text-muted))" : `rgb(var(--rpg-${tone}))`;

/** Campo de formulário/filtro do tema RPG (input, select, textarea). */
export const rpgFieldClass = "w-full min-w-0 px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";
