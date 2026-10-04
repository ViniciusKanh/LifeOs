import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { ATTRIBUTE_META, type AttributeKey } from "../config/codex.js";
import {
  ARCHETYPES,
  ATTRIBUTE_GUIDES,
  BUILD_ATTRIBUTES,
  BUILD_PRESETS,
  DEFAULT_PRESET,
  buildConfig,
  normalizeAttributeScore,
  type ArchetypeDef,
  type PlanItem,
} from "../config/build.js";
import { aggregateAttributes, type AttributeAggregate } from "./codexService.js";

/**
 * Build do Personagem. Reaproveita o motor de atributos do Códex (XP real
 * classificado por origem) e só INTERPRETA: pontuação 0–100, arquétipo por
 * afinidade, distância até a build desejada, insights e plano — tudo por
 * regras determinísticas. Nada aqui grava dados sem confirmação.
 */

export type Scores = Record<AttributeKey, number>;

const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** XP de cada atributo numa janela que termina em `endDay` (inclusive). */
export function windowXp(agg: AttributeAggregate, endDay: string, days: number = buildConfig.windowDays): Scores {
  const from = shiftDay(endDay, -(days - 1));
  const out = {} as Scores;
  for (const a of BUILD_ATTRIBUTES) {
    let sum = 0;
    for (const [day, xp] of Object.entries(agg.dailyAll[a])) if (day >= from && day <= endDay) sum += xp;
    out[a] = sum;
  }
  return out;
}

export function scoresFromXp(xp: Scores): Scores {
  return Object.fromEntries(BUILD_ATTRIBUTES.map((a) => [a, normalizeAttributeScore(xp[a], buildConfig.referenceXp[a])])) as Scores;
}

/** Similaridade de cosseno entre a pontuação atual e o perfil do arquétipo (0–100). */
export function affinity(scores: Scores, archetype: ArchetypeDef): number {
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (const k of BUILD_ATTRIBUTES) {
    dot += scores[k] * archetype.profile[k];
    a2 += scores[k] ** 2;
    b2 += archetype.profile[k] ** 2;
  }
  if (a2 === 0 || b2 === 0) return 0;
  return Math.round((dot / Math.sqrt(a2 * b2)) * 100);
}

export function rankArchetypes(scores: Scores) {
  return ARCHETYPES.map((a) => ({ id: a.id, name: a.name, affinity: affinity(scores, a) })).sort((x, y) => y.affinity - x.affinity || x.id.localeCompare(y.id));
}

/* ------------------------------ Build desejada ------------------------------ */

export interface DesiredBuild {
  presetId: string | null;
  name: string;
  targets: Scores;
  isDefault: boolean;
}

export async function getDesiredBuild(db: Client, ownerId: string): Promise<DesiredBuild> {
  const r = await db.execute({ sql: "SELECT preset_id, name, targets_json FROM character_build_targets WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  if (!row) return { presetId: DEFAULT_PRESET.id, name: DEFAULT_PRESET.name, targets: { ...DEFAULT_PRESET.targets }, isDefault: true };
  let parsed: Partial<Scores> = {};
  try {
    parsed = JSON.parse(String(row.targets_json)) as Partial<Scores>;
  } catch {
    parsed = {};
  }
  const targets = Object.fromEntries(BUILD_ATTRIBUTES.map((a) => [a, clampScore(parsed[a] ?? DEFAULT_PRESET.targets[a])])) as Scores;
  return { presetId: row.preset_id == null ? null : String(row.preset_id), name: String(row.name), targets, isDefault: false };
}

const clampScore = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));

export async function saveDesiredBuild(db: Client, ownerId: string, input: { presetId?: string | null; name: string; targets: Partial<Scores> }) {
  const preset = input.presetId ? BUILD_PRESETS.find((p) => p.id === input.presetId) : null;
  const targets = Object.fromEntries(BUILD_ATTRIBUTES.map((a) => [a, clampScore(input.targets[a] ?? preset?.targets[a] ?? DEFAULT_PRESET.targets[a])])) as Scores;
  await db.execute({
    sql: `INSERT INTO character_build_targets (owner_id, preset_id, name, targets_json, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET preset_id = excluded.preset_id, name = excluded.name, targets_json = excluded.targets_json, updated_at = datetime('now')`,
    args: [ownerId, preset ? preset.id : null, input.name.trim().slice(0, 60) || "Build personalizada", JSON.stringify(targets)],
  });
  const sum = BUILD_ATTRIBUTES.reduce((s, a) => s + targets[a], 0);
  return { ...(await getDesiredBuild(db, ownerId)), warning: sum > buildConfig.desiredSumWarning ? "Metas muito altas em todas as áreas ao mesmo tempo costumam ser difíceis de sustentar." : null };
}

export async function resetDesiredBuild(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM character_build_targets WHERE owner_id = ?", args: [ownerId] });
  return getDesiredBuild(db, ownerId);
}

/* ------------------------------ Leituras derivadas ------------------------------ */

export interface Gap {
  key: AttributeKey;
  label: string;
  current: number;
  target: number;
  gap: number; // meta − atual (positivo = falta)
  status: "above" | "near" | "below";
}

export function calculateGaps(current: Scores, targets: Scores): Gap[] {
  return BUILD_ATTRIBUTES.map((k) => {
    const gap = targets[k] - current[k];
    return { key: k, label: ATTRIBUTE_META[k].label, current: current[k], target: targets[k], gap, status: Math.abs(gap) < buildConfig.nearGap ? "near" : gap < 0 ? "above" : "below" };
  });
}

export interface Insight {
  tone: "up" | "down" | "neutral";
  text: string;
}

/** Insights 100% derivados dos gaps (sem IA, sem invenção). */
export function buildInsights(gaps: Gap[], current: Scores): Insight[] {
  const out: Insight[] = [];
  const above = gaps.filter((g) => g.status === "above").sort((a, b) => a.gap - b.gap);
  const below = gaps.filter((g) => g.status === "below").sort((a, b) => b.gap - a.gap);
  for (const g of above.slice(0, 2)) out.push({ tone: "up", text: `${g.label} está ${-g.gap} ponto${-g.gap > 1 ? "s" : ""} acima da meta.` });
  const top = [...BUILD_ATTRIBUTES].sort((a, b) => current[b] - current[a]).slice(0, 2);
  if (current[top[0]] > 0 && current[top[1]] > 0) out.push({ tone: "up", text: `${ATTRIBUTE_META[top[0]].label} e ${ATTRIBUTE_META[top[1]].label} formam hoje seu maior diferencial.` });
  for (const g of below.slice(0, 3)) out.push({ tone: "down", text: `${g.label} precisa de +${g.gap} ponto${g.gap > 1 ? "s" : ""} para a meta.` });
  const near = gaps.filter((g) => g.status === "near");
  if (near.length) out.push({ tone: "neutral", text: `${near.map((g) => g.label).join(", ")} ${near.length > 1 ? "estão" : "está"} na meta.` });
  return out;
}

export interface Recommendation {
  key: AttributeKey;
  label: string;
  gap: number;
  text: string;
  actions: Array<{ id: string; label: string; item: PlanItem }>;
}

export function buildRecommendations(gaps: Gap[]): Recommendation[] {
  return gaps
    .filter((g) => g.status === "below")
    .sort((a, b) => b.gap - a.gap)
    .map((g) => ({ key: g.key, label: g.label, gap: g.gap, text: ATTRIBUTE_GUIDES[g.key].recommendation, actions: ATTRIBUTE_GUIDES[g.key].actions }));
}

export interface PlanStep {
  title: string;
  kind: "improve" | "maintain";
  bullets: string[];
  actions: Array<{ id: string; label: string; item: PlanItem }>;
}

/** Plano de evolução: até 2 áreas a fortalecer + manter o ponto mais forte. */
export function buildEvolutionPlan(gaps: Gap[], current: Scores): PlanStep[] {
  const recs = buildRecommendations(gaps).slice(0, 2);
  const steps: PlanStep[] = recs.map((r) => ({
    title: `Fortalecer ${r.label}`,
    kind: "improve",
    bullets: [`+${r.gap} pontos para a meta`, r.text],
    actions: r.actions,
  }));
  const strongest = [...BUILD_ATTRIBUTES].sort((a, b) => current[b] - current[a])[0];
  if (current[strongest] > 0) {
    steps.push({
      title: `Manter ${ATTRIBUTE_META[strongest].label}`,
      kind: "maintain",
      bullets: ["Continue as missões prioritárias", "Revise a semana para não perder o ritmo"],
      actions: [],
    });
  }
  return steps;
}

function sufficiency(agg: AttributeAggregate, xp: Scores) {
  const total = BUILD_ATTRIBUTES.reduce((s, a) => s + xp[a], 0);
  const missing = BUILD_ATTRIBUTES.filter((a) => xp[a] === 0).map((a) => ({ key: a, label: ATTRIBUTE_META[a].label, sources: ATTRIBUTE_GUIDES[a].sources }));
  return { enough: total >= buildConfig.minWindowXp, windowXp: total, minWindowXp: buildConfig.minWindowXp, totalXp: agg.totalXp, missing };
}

/* ------------------------------ Visão completa ------------------------------ */

export async function getBuildOverview(db: Client, ownerId: string) {
  const [agg, desired] = await Promise.all([aggregateAttributes(db, ownerId), getDesiredBuild(db, ownerId)]);
  const today = agg.today;
  const xpNow = windowXp(agg, today);
  const current = scoresFromXp(xpNow);
  const ranking = rankArchetypes(current);
  const primary = ARCHETYPES.find((a) => a.id === ranking[0].id)!;
  const gaps = calculateGaps(current, desired.targets);
  const ago = (d: number) => scoresFromXp(windowXp(agg, shiftDay(today, -d)));
  const suff = sufficiency(agg, xpNow);
  return {
    today,
    windowDays: buildConfig.windowDays,
    sufficiency: suff,
    attributes: BUILD_ATTRIBUTES.map((k) => ({ key: k, label: ATTRIBUTE_META[k].label, description: ATTRIBUTE_META[k].description, score: current[k], xp: xpNow[k], referenceXp: buildConfig.referenceXp[k] })),
    archetype: suff.enough
      ? {
          id: primary.id,
          name: primary.name,
          avatar: primary.avatar,
          description: primary.description,
          tags: primary.tags,
          affinity: ranking[0].affinity,
          secondary: ranking[1] ? { id: ranking[1].id, name: ranking[1].name, affinity: ranking[1].affinity } : null,
          ranking,
        }
      : null,
    desired,
    presets: BUILD_PRESETS,
    gaps,
    insights: suff.enough ? buildInsights(gaps, current) : [],
    recommendations: buildRecommendations(gaps),
    plan: buildEvolutionPlan(gaps, current),
    comparisons: { now: current, d30: ago(30), d90: ago(90) },
  };
}

const PERIODS: Record<string, { days: number; step: number }> = { "30d": { days: 30, step: 3 }, "90d": { days: 90, step: 7 }, "180d": { days: 180, step: 14 }, "365d": { days: 365, step: 30 } };

export async function getBuildEvolution(db: Client, ownerId: string, period: keyof typeof PERIODS) {
  const p = PERIODS[period] ?? PERIODS["90d"];
  const agg = await aggregateAttributes(db, ownerId);
  const points: Array<{ day: string; scores: Scores; archetype: string | null }> = [];
  for (let back = p.days; back >= 0; back -= p.step) {
    const day = shiftDay(agg.today, -back);
    const xp = windowXp(agg, day);
    const scores = scoresFromXp(xp);
    const total = BUILD_ATTRIBUTES.reduce((s, a) => s + xp[a], 0);
    points.push({ day, scores, archetype: total >= buildConfig.minWindowXp ? rankArchetypes(scores)[0].id : null });
  }
  if (points[points.length - 1].day !== agg.today) {
    const xp = windowXp(agg, agg.today);
    const scores = scoresFromXp(xp);
    points.push({ day: agg.today, scores, archetype: BUILD_ATTRIBUTES.reduce((s, a) => s + xp[a], 0) >= buildConfig.minWindowXp ? rankArchetypes(scores)[0].id : null });
  }
  const first = points[0].scores;
  const last = points[points.length - 1].scores;
  const deltas = BUILD_ATTRIBUTES.map((k) => ({ key: k, label: ATTRIBUTE_META[k].label, from: first[k], to: last[k], delta: last[k] - first[k] }));
  const changes: Array<{ day: string; from: string | null; to: string | null }> = [];
  for (let i = 1; i < points.length; i++) if (points[i].archetype !== points[i - 1].archetype) changes.push({ day: points[i].day, from: points[i - 1].archetype, to: points[i].archetype });
  return {
    period,
    points,
    gains: deltas.filter((d) => d.delta >= 3).sort((a, b) => b.delta - a.delta),
    drops: deltas.filter((d) => d.delta <= -3).sort((a, b) => a.delta - b.delta),
    stagnant: deltas.filter((d) => Math.abs(d.delta) < 3),
    archetypeChanges: changes,
  };
}

/* ------------------------------ Aplicar plano ------------------------------ */

/**
 * Cria SOMENTE os itens escolhidos no preview. O plano é recalculado no
 * servidor: o cliente manda só ids, nunca o conteúdo a criar. Contratos com
 * o mesmo nome não são duplicados.
 */
export async function applyEvolutionPlan(db: Client, ownerId: string, itemIds: string[]) {
  const overview = await getBuildOverview(db, ownerId);
  const available = new Map(overview.plan.flatMap((s) => s.actions).map((a) => [a.id, a]));
  const created: Array<{ id: string; label: string; kind: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of [...new Set(itemIds)]) {
    const action = available.get(id);
    if (!action) {
      skipped.push({ id, reason: "Item não faz parte do plano atual." });
      continue;
    }
    const it = action.item;
    if (it.kind === "habit") {
      const exists = await db.execute({ sql: "SELECT 1 FROM habits WHERE owner_id = ? AND lower(name) = lower(?) LIMIT 1", args: [ownerId, it.name] });
      if (exists.rows.length) {
        skipped.push({ id, reason: "Você já tem um contrato com esse nome." });
        continue;
      }
      const hid = nanoid();
      await db.execute({
        sql: "INSERT INTO habits (id, owner_id, name, icon, category, frequency, target_count) VALUES (?, ?, ?, NULL, ?, ?, ?)",
        args: [hid, ownerId, it.name, it.category, it.frequency, it.targetCount],
      });
      created.push({ id: hid, label: action.label, kind: "habit" });
    } else if (it.kind === "task") {
      const tid = nanoid();
      const due = shiftDay(overview.today, it.dueInDays);
      await db.execute({
        sql: "INSERT INTO tasks (id, owner_id, title, status, priority, due_date) VALUES (?, ?, ?, 'A Fazer', ?, ?)",
        args: [tid, ownerId, it.title, it.priority, due],
      });
      created.push({ id: tid, label: action.label, kind: "task" });
    } else {
      skipped.push({ id, reason: "Atalho de navegação — abra pela tela." });
    }
  }
  return { created, skipped };
}
