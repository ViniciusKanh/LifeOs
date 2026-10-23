import type { DailyMetric } from "./dailyMetricsService.js";

/**
 * Regras PURAS do Quadro de Quests (sem I/O — testadas isoladamente).
 * Catálogo de modelos, sorteio determinístico e meta proporcional ao ritmo
 * recente do próprio usuário.
 */

export type QuestPeriod = "daily" | "weekly";

export interface QuestTemplate {
  key: string;
  period: QuestPeriod;
  metric: DailyMetric;
  /** Genérica = sempre alcançável (missões/XP/diário); as demais exigem uso recente do módulo. */
  generic: boolean;
  /** Módulo exibido na interface e usado como link. */
  module: "missions" | "projects" | "health" | "library" | "habits" | "journal" | "focus" | "xp";
  title: (target: number) => string;
  unit: string | null;
  /** Meta mínima e teto (ex.: diário 1x/dia → no máximo 7 na semana). */
  min: number;
  max: number;
  /** Arredondamento "bonito" da meta (água em 250 ml, minutos em 5...). */
  step: number;
  xp: number;
  /** Meta usada quando não há histórico (só genéricas chegam aqui sem dados). */
  fallback: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // ---------------- Diárias ----------------
  { key: "d_missions", period: "daily", metric: "missions", generic: true, module: "missions", title: (n) => `Conclua ${n} ${plural(n, "missão", "missões")}`, unit: null, min: 1, max: 15, step: 1, xp: 20, fallback: 1 },
  { key: "d_xp", period: "daily", metric: "xpOrganic", generic: true, module: "xp", title: (n) => `Ganhe ${n} XP`, unit: "XP", min: 10, max: 400, step: 5, xp: 15, fallback: 15 },
  { key: "d_project_mission", period: "daily", metric: "projectMissions", generic: false, module: "projects", title: (n) => `Conclua ${n} ${plural(n, "missão", "missões")} de projeto`, unit: null, min: 1, max: 10, step: 1, xp: 25, fallback: 1 },
  { key: "d_high_priority", period: "daily", metric: "highPriorityMissions", generic: false, module: "missions", title: (n) => `Conclua ${n} ${plural(n, "missão", "missões")} de prioridade alta`, unit: null, min: 1, max: 5, step: 1, xp: 25, fallback: 1 },
  { key: "d_workout", period: "daily", metric: "workouts", generic: false, module: "health", title: (n) => `Registre ${n} ${plural(n, "treino", "treinos")}`, unit: null, min: 1, max: 2, step: 1, xp: 25, fallback: 1 },
  { key: "d_pages", period: "daily", metric: "pages", generic: false, module: "library", title: (n) => `Leia ${n} ${plural(n, "página", "páginas")}`, unit: "pág.", min: 1, max: 150, step: 1, xp: 20, fallback: 5 },
  { key: "d_habits", period: "daily", metric: "habits", generic: false, module: "habits", title: (n) => `Cumpra ${n} ${plural(n, "hábito", "hábitos")}`, unit: null, min: 1, max: 15, step: 1, xp: 20, fallback: 1 },
  { key: "d_journal", period: "daily", metric: "journal", generic: true, module: "journal", title: () => "Escreva no diário", unit: null, min: 1, max: 1, step: 1, xp: 15, fallback: 1 },
  { key: "d_water", period: "daily", metric: "waterMl", generic: false, module: "health", title: (n) => `Beba ${n.toLocaleString("pt-BR")} ml de água`, unit: "ml", min: 250, max: 5000, step: 250, xp: 15, fallback: 1000 },
  { key: "d_focus", period: "daily", metric: "focusMinutes", generic: false, module: "focus", title: (n) => `Foque por ${n} minutos`, unit: "min", min: 15, max: 480, step: 5, xp: 20, fallback: 25 },
  // ---------------- Semanais ----------------
  { key: "w_missions", period: "weekly", metric: "missions", generic: true, module: "missions", title: (n) => `Conclua ${n} ${plural(n, "missão", "missões")} na semana`, unit: null, min: 3, max: 80, step: 1, xp: 70, fallback: 3 },
  { key: "w_xp", period: "weekly", metric: "xpOrganic", generic: true, module: "xp", title: (n) => `Ganhe ${n} XP na semana`, unit: "XP", min: 50, max: 2500, step: 10, xp: 60, fallback: 80 },
  { key: "w_project_missions", period: "weekly", metric: "projectMissions", generic: false, module: "projects", title: (n) => `Conclua ${n} ${plural(n, "missão", "missões")} de projeto na semana`, unit: null, min: 2, max: 50, step: 1, xp: 80, fallback: 2 },
  { key: "w_workouts", period: "weekly", metric: "workouts", generic: false, module: "health", title: (n) => `Registre ${n} ${plural(n, "treino", "treinos")} na semana`, unit: null, min: 1, max: 10, step: 1, xp: 80, fallback: 2 },
  { key: "w_workout_minutes", period: "weekly", metric: "workoutMinutes", generic: false, module: "health", title: (n) => `Acumule ${n} minutos de treino`, unit: "min", min: 30, max: 900, step: 10, xp: 75, fallback: 60 },
  { key: "w_pages", period: "weekly", metric: "pages", generic: false, module: "library", title: (n) => `Leia ${n} páginas na semana`, unit: "pág.", min: 10, max: 1000, step: 5, xp: 75, fallback: 30 },
  { key: "w_habits", period: "weekly", metric: "habits", generic: false, module: "habits", title: (n) => `Cumpra ${n} hábitos na semana`, unit: null, min: 3, max: 100, step: 1, xp: 70, fallback: 5 },
  { key: "w_journal", period: "weekly", metric: "journal", generic: true, module: "journal", title: (n) => `Escreva no diário em ${n} ${plural(n, "dia", "dias")}`, unit: "dias", min: 2, max: 7, step: 1, xp: 70, fallback: 3 },
  { key: "w_focus", period: "weekly", metric: "focusMinutes", generic: false, module: "focus", title: (n) => `Foque por ${n} minutos na semana`, unit: "min", min: 60, max: 2400, step: 15, xp: 80, fallback: 120 },
];

export const QUEST_RULES = {
  perPeriod: 3,
  /** Janela de "uso recente" e base do ritmo. */
  lookbackDays: 30,
  /** Bônus ao resgatar as 3 diárias do dia. */
  allDailyBonusXp: 30,
  /** Trocas permitidas por dia (só quests diárias não concluídas). */
  dailyRerolls: 1,
} as const;

export const templateByKey = (key: string) => QUEST_TEMPLATES.find((t) => t.key === key) ?? null;

/** Hash FNV-1a 32 bits — semente estável a partir de texto. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32 (determinístico por semente). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seedText: string): T[] {
  const rand = prng(hashSeed(seedText));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Totais por métrica na janela recente (lookbackDays dias antes do período). */
export type RecentTotals = Partial<Record<DailyMetric, number>>;

/**
 * Meta proporcional ao ritmo recente: média por dia (ou por semana) na
 * janela, arredondada para o "passo" do modelo, entre mínimo e máximo.
 * Sem histórico usa a meta de partida (fallback) — alcançável.
 */
export function targetFor(t: QuestTemplate, recentTotal: number, lookbackDays: number = QUEST_RULES.lookbackDays): number {
  const perDay = recentTotal / Math.max(1, lookbackDays);
  const pace = t.period === "daily" ? perDay : perDay * 7;
  const base = recentTotal > 0 ? pace : t.fallback;
  const stepped = Math.round(base / t.step) * t.step;
  return Math.min(t.max, Math.max(t.min, stepped));
}

/** Modelos elegíveis: módulos usados nos últimos 30 dias + genéricos (sempre). */
export function eligibleTemplates(period: QuestPeriod, recent: RecentTotals): QuestTemplate[] {
  return QUEST_TEMPLATES.filter((t) => t.period === period && (t.generic || (recent[t.metric] ?? 0) > 0));
}

export interface PlannedQuest {
  templateKey: string;
  target: number;
  xpReward: number;
}

/**
 * Sorteio determinístico por (usuário, período, chave do período): a mesma
 * entrada sempre gera as mesmas 3 quests. Preferência pelos módulos que o
 * usuário de fato usa; genéricas completam quando faltam módulos.
 */
export function drawQuests(ownerId: string, period: QuestPeriod, periodKey: string, recent: RecentTotals, count: number = QUEST_RULES.perPeriod): PlannedQuest[] {
  const pool = eligibleTemplates(period, recent);
  const seed = `${ownerId}:${period}:${periodKey}`;
  const modules = seededShuffle(pool.filter((t) => !t.generic), `${seed}:m`);
  const generics = seededShuffle(pool.filter((t) => t.generic), `${seed}:g`);
  // Até (count - 1) de módulos + genéricas completando: variedade sem deixar de ser alcançável.
  const picked = [...modules.slice(0, Math.max(0, count - Math.min(1, generics.length))), ...generics].slice(0, count);
  return picked.map((t) => toPlanned(t, recent));
}

/** Troca (reroll): outro modelo elegível do mesmo período, fora dos já usados no período. */
export function drawReplacement(ownerId: string, period: QuestPeriod, periodKey: string, recent: RecentTotals, usedKeys: readonly string[]): PlannedQuest | null {
  const pool = eligibleTemplates(period, recent).filter((t) => !usedKeys.includes(t.key));
  const next = seededShuffle(pool, `${ownerId}:${period}:${periodKey}:reroll:${usedKeys.length}`)[0];
  return next ? toPlanned(next, recent) : null;
}

function toPlanned(t: QuestTemplate, recent: RecentTotals): PlannedQuest {
  return { templateKey: t.key, target: targetFor(t, recent[t.metric] ?? 0), xpReward: t.xp };
}

/** Intervalo (dias locais, inclusive) de um período. */
export function periodRange(period: QuestPeriod, periodKey: string): { from: string; to: string } {
  if (period === "daily") return { from: periodKey, to: periodKey };
  const d = new Date(`${periodKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from: periodKey, to: d.toISOString().slice(0, 10) };
}
