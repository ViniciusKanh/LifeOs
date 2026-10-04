import {
  ATTRIBUTES,
  ATTRIBUTE_LEVEL_THRESHOLDS,
  CLASSES,
  HABIT_KEYWORDS,
  attributeMappings,
  codexConfig,
  type AttributeKey,
  type Distribution,
  type UnlockRule,
} from "../config/codex.js";

/**
 * Regras puras do Códex (sem I/O). O XP de atributo é uma CLASSIFICAÇÃO
 * do XP global já concedido: a soma das partes é sempre igual ao XP do
 * evento — nunca há XP extra.
 */

export interface XpEventLike {
  sourceType: string;
  sourceId: string;
  eventType: string;
  xp: number;
}

export interface ClassifyContext {
  /** Tipo do projeto da tarefa (academic/professional/workspace/personal), quando houver. */
  projectKind?: string | null;
  /** Nome + categoria do hábito (para palavras-chave). */
  habitText?: string | null;
  /** Categoria da conquista (achievementCategory). */
  achievementCategory?: string | null;
}

export function habitMapping(text: string | null | undefined): Distribution {
  const t = (text ?? "").toLowerCase();
  for (const k of HABIT_KEYWORDS) if (k.words.some((w) => t.includes(w))) return attributeMappings[k.mapping] as Distribution;
  return attributeMappings.HABIT_DEFAULT;
}

/** Distribuição (soma 1) de um evento do ledger conforme a origem registrada. */
export function distributionFor(e: XpEventLike, ctx: ClassifyContext = {}): Distribution {
  const M = attributeMappings;
  switch (e.sourceType) {
    case "task":
      if (ctx.projectKind === "academic") return M.TASK_ACADEMIC;
      if (ctx.projectKind === "professional" || ctx.projectKind === "workspace") return M.TASK_PROFESSIONAL;
      return M.TASK_DEFAULT;
    case "day":
      return M.DAY_BONUS;
    case "focus":
      return M.FOCUS_SESSION;
    case "habit_entry":
      return habitMapping(ctx.habitText);
    case "habit_streak":
      return M.HABIT_STREAK;
    case "journal":
      return M.JOURNAL_ENTRY;
    case "review":
      return M.REVIEW;
    case "experiment":
      return M.EXPERIMENT;
    case "life_admin":
      return M.LIFE_ADMIN;
    case "project":
      return M.PROJECT;
    case "campaign":
      return M.CAMPAIGN;
    case "contract":
      return M.CONTRACT;
    case "achievement":
      return M.ACHIEVEMENT[ctx.achievementCategory ?? "outros"] ?? M.ACHIEVEMENT.outros;
    default:
      return M.DAY_BONUS;
  }
}

/**
 * Divide o XP inteiro pelos pesos com "maior resto": a soma das partes é
 * EXATAMENTE o XP original (sem arredondamento criando ou sumindo XP).
 */
export function allocateXp(xp: number, dist: Distribution): Partial<Record<AttributeKey, number>> {
  const total = Math.max(0, Math.floor(xp));
  const entries = (Object.entries(dist) as Array<[AttributeKey, number]>).filter(([, w]) => w > 0);
  const wsum = entries.reduce((s, [, w]) => s + w, 0);
  if (total === 0 || wsum <= 0) return {};
  const raw = entries.map(([k, w]) => ({ k, exact: (total * w) / wsum }));
  const out: Partial<Record<AttributeKey, number>> = {};
  let used = 0;
  for (const r of raw) {
    out[r.k] = Math.floor(r.exact);
    used += out[r.k]!;
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || ATTRIBUTES.indexOf(a.k) - ATTRIBUTES.indexOf(b.k));
  for (let i = 0; used < total; i++, used++) out[order[i % order.length].k]! += 1;
  return out;
}

/** XP para alcançar um nível de atributo. */
export function xpForAttributeLevel(level: number): number {
  if (level <= 1) return 0;
  const T = ATTRIBUTE_LEVEL_THRESHOLDS;
  if (level - 1 < T.length) return T[level - 1];
  return T[T.length - 1] + (level - T.length) * 1000;
}

/** Nível e progresso derivados só do XP do atributo (nada é gravado). */
export function calculateAttributeLevel(attributeXpRaw: number) {
  const xp = Math.max(0, Math.floor(attributeXpRaw || 0));
  let level = 1;
  while (xpForAttributeLevel(level + 1) <= xp) level++;
  const start = xpForAttributeLevel(level);
  const next = xpForAttributeLevel(level + 1);
  return { level, xp, levelStartXp: start, nextLevelXp: next, progressPct: Math.round(((xp - start) / (next - start)) * 100) };
}

/** Variação % real entre períodos; sem base anterior → null ("sem comparação"). */
export function trendPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Sinergia: média dos atributos normalizados (0–100) penalizada pelo
 * desequilíbrio (desvio-padrão). Atributos iguais = fator 1.
 */
export function calculateAttributeSynergy(attributeXp: Partial<Record<AttributeKey, number>>) {
  const ref = codexConfig.synergyReferenceXp;
  const scores = ATTRIBUTES.map((a) => Math.min(100, ((attributeXp[a] ?? 0) / ref) * 100));
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
  const balance = Math.max(0, 1 - std / codexConfig.synergyStdCap);
  return { synergy: Math.round(Math.min(100, Math.max(0, mean * balance))), mean: Math.round(mean), balance: Math.round(balance * 100) / 100, scores: scores.map((v) => Math.round(v)) };
}

/** Classe sugerida pelos 2 atributos mais fortes (cosmética; sem dados → null). */
export function suggestClass(attributeXp: Partial<Record<AttributeKey, number>>) {
  const ranked = [...ATTRIBUTES].sort((a, b) => (attributeXp[b] ?? 0) - (attributeXp[a] ?? 0));
  if ((attributeXp[ranked[0]] ?? 0) <= 0) return null;
  const top = new Set(ranked.slice(0, 2));
  const exact = CLASSES.find((c) => c.attributes.every((x) => top.has(x)));
  const partial = CLASSES.find((c) => c.attributes[0] === ranked[0]) ?? CLASSES.find((c) => c.attributes.includes(ranked[0]));
  const chosen = exact ?? partial ?? null;
  return chosen ? { ...chosen, basedOn: ranked.slice(0, 2) } : null;
}

/** Fatos usados para avaliar regras de desbloqueio (todos do ledger/dados reais). */
export interface UnlockFacts {
  globalLevel: number;
  attributeXp: Partial<Record<AttributeKey, number>>;
  sourceCounts: Record<string, number>;
  tasksDone: number;
  campaignsCompleted: number;
  bestHabitStreak: number;
}

export function ruleMet(rule: UnlockRule, f: UnlockFacts): boolean {
  switch (rule.type) {
    case "global_level":
      return f.globalLevel >= rule.min;
    case "attribute_xp":
      return (f.attributeXp[rule.attribute] ?? 0) >= rule.min;
    case "xp_source_count":
      return (f.sourceCounts[rule.eventType ? `${rule.source}:${rule.eventType}` : rule.source] ?? 0) >= rule.min;
    case "tasks_done":
      return f.tasksDone >= rule.min;
    case "campaigns_completed":
      return f.campaignsCompleted >= rule.min;
    case "habit_streak_days":
      return f.bestHabitStreak >= rule.min;
    case "all":
      return rule.rules.every((r) => ruleMet(r, f));
  }
}

/** Progresso (0–1) da regra, para "falta pouco" (média das sub-regras). */
export function ruleProgress(rule: UnlockRule, f: UnlockFacts): number {
  const ratio = (v: number, min: number) => Math.min(1, min > 0 ? v / min : 1);
  switch (rule.type) {
    case "global_level":
      return ratio(f.globalLevel, rule.min);
    case "attribute_xp":
      return ratio(f.attributeXp[rule.attribute] ?? 0, rule.min);
    case "xp_source_count":
      return ratio(f.sourceCounts[rule.eventType ? `${rule.source}:${rule.eventType}` : rule.source] ?? 0, rule.min);
    case "tasks_done":
      return ratio(f.tasksDone, rule.min);
    case "campaigns_completed":
      return ratio(f.campaignsCompleted, rule.min);
    case "habit_streak_days":
      return ratio(f.bestHabitStreak, rule.min);
    case "all":
      return rule.rules.reduce((s, r) => s + ruleProgress(r, f), 0) / rule.rules.length;
  }
}
