import { campaignGamificationConfig as C } from "../config/campaignGamification.js";

/**
 * Regras puras da Forja de Campanhas (sem I/O — testáveis isoladamente):
 * progresso ponderado, adesão de hábitos, sequência semanal, bônus e
 * estados da trilha de marcos.
 */

export interface ProgressInput {
  missions: { total: number; done: number };
  milestones: { total: number; done: number };
  /** Ciclos de hábito esperados até hoje e ciclos cumpridos (já limitados). */
  contracts: { expected: number; met: number };
}

export interface ProgressResult {
  pct: number;
  missionsPct: number | null;
  milestonesPct: number | null;
  contractsPct: number | null;
  /** Pesos efetivos após redistribuir dimensões inexistentes. */
  weights: { missions: number; milestones: number; contracts: number };
}

const ratio = (num: number, den: number) => (den > 0 ? Math.min(1, Math.max(0, num / den)) : null);

/**
 * Progresso = missões 50% + marcos 30% + contratos (hábitos) 20%.
 * Dimensão sem itens não penaliza: o peso dela é redistribuído
 * proporcionalmente entre as que existem. Sem nada, 0%.
 */
export function calculateCampaignProgress(input: ProgressInput): ProgressResult {
  const parts = {
    missions: ratio(input.missions.done, input.missions.total),
    milestones: ratio(input.milestones.done, input.milestones.total),
    contracts: ratio(input.contracts.met, input.contracts.expected),
  };
  const W = C.progressWeights;
  const active = (Object.keys(parts) as Array<keyof typeof parts>).filter((k) => parts[k] !== null);
  const sum = active.reduce((s, k) => s + W[k], 0);
  const weights = { missions: 0, milestones: 0, contracts: 0 };
  for (const k of active) weights[k] = sum > 0 ? W[k] / sum : 0;
  const value = active.reduce((s, k) => s + (parts[k] ?? 0) * weights[k], 0);
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
  return { pct: Math.round(value * 100), missionsPct: pct(parts.missions), milestonesPct: pct(parts.milestones), contractsPct: pct(parts.contracts), weights };
}

/** Segunda-feira (YYYY-MM-DD) da semana de uma data. */
export function weekStart(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Chave do ciclo de um hábito (mesma convenção do módulo Hábitos). */
export function habitCycleKey(frequency: string, day: string): string {
  if (frequency === "monthly") return day.slice(0, 7);
  if (frequency === "weekly" || frequency === "times_per_week") return `w${weekStart(day)}`;
  return day;
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end && out.length < 3700) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Adesão de um hábito na janela da campanha: ciclos (dia/semana/mês)
 * esperados até hoje × ciclos em que a meta do ciclo foi batida.
 * Nunca usa o histórico inteiro — só o período já transcorrido.
 */
export function habitAdherence(input: {
  frequency: string;
  targetCount: number;
  from: string;
  today: string;
  entries: Array<{ date: string; count: number }>;
}): { expected: number; met: number } {
  if (input.from > input.today) return { expected: 0, met: 0 };
  const cycles = new Set(eachDay(input.from, input.today).map((d) => habitCycleKey(input.frequency, d)));
  const sums = new Map<string, number>();
  for (const e of input.entries) {
    if (e.date < input.from || e.date > input.today) continue;
    const k = habitCycleKey(input.frequency, e.date);
    sums.set(k, (sums.get(k) ?? 0) + e.count);
  }
  const target = Math.max(1, input.targetCount);
  let met = 0;
  for (const k of cycles) if ((sums.get(k) ?? 0) >= target) met++;
  return { expected: cycles.size, met: Math.min(met, cycles.size) };
}

/**
 * Sequência semanal: semanas consecutivas com ao menos uma atividade
 * qualificável (missão concluída, check-in de hábito ligado ou marco
 * concluído). A semana atual ainda em aberto não quebra a sequência.
 */
export function weeklyStreak(activityDays: string[], today: string): number {
  const weeks = new Set(activityDays.map((d) => weekStart(d)));
  let cursor = weekStart(today);
  const step = (w: string) => {
    const d = new Date(`${w}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  };
  if (!weeks.has(cursor)) cursor = step(cursor);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = step(cursor);
  }
  return streak;
}

/** Bônus vigente para uma sequência (maior faixa atingida). */
export function streakBonus(weeks: number): { xpPct: number; coinsPct: number; nextTier: { weeks: number; xpPct: number; coinsPct: number } | null } {
  let current = { xpPct: 0, coinsPct: 0 };
  let nextTier: { weeks: number; xpPct: number; coinsPct: number } | null = null;
  for (const t of C.streak.tiers) {
    if (weeks >= t.weeks) current = { xpPct: t.xpPct, coinsPct: t.coinsPct };
    else if (!nextTier) nextTier = { ...t };
  }
  return { ...current, nextTier };
}

/** Aplica o bônus a uma recompensa base (arredondado para baixo; nunca reduz). */
export function applyBonus(base: { xp: number; coins: number }, bonus: { xpPct: number; coinsPct: number }) {
  return {
    // Aritmética inteira (evita 100 × 1,15 = 114,99…).
    xp: Math.floor((base.xp * (100 + bonus.xpPct)) / 100),
    coins: Math.floor((base.coins * (100 + bonus.coinsPct)) / 100),
    multiplier: Math.round((1 + bonus.xpPct / 100) * 100) / 100,
  };
}

export type TrailState = "completed" | "current" | "upcoming" | "blocked";

/**
 * Estados da trilha: ordem por posição (ou prazo); o 1º incompleto é o
 * "current"; incompletos cujo marco de dependência não está concluído
 * ficam "blocked"; os demais, "upcoming".
 */
export function trailStates<T extends { id: string; position: number; dueDate: string | null; status: string; dependencyId: string | null }>(milestones: T[]) {
  const ordered = [...milestones].sort((a, b) => a.position - b.position || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const done = new Set(ordered.filter((m) => m.status === "completed").map((m) => m.id));
  let currentSet = false;
  return ordered.map((m) => {
    let state: TrailState;
    if (done.has(m.id)) state = "completed";
    else if (m.dependencyId && !done.has(m.dependencyId)) state = "blocked";
    else if (!currentSet) {
      state = "current";
      currentSet = true;
    } else state = "upcoming";
    return { ...m, state };
  });
}

/** Recompensa sugerida de conclusão (sempre dentro dos limites). */
export function suggestedCompletion(term: keyof typeof C.completion.suggested, milestones: number) {
  const base = C.completion.suggested[term];
  return {
    xp: Math.min(C.completion.limits.xp, base.xp + milestones * C.completion.perMilestone.xp),
    coins: Math.min(C.completion.limits.coins, base.coins + milestones * C.completion.perMilestone.coins),
  };
}
