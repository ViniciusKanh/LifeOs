import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  ATTRIBUTES,
  ATTRIBUTE_META,
  AREA_ATTRIBUTE,
  CLASSES,
  KNOWLEDGE,
  RELICS,
  TITLES,
  codexConfig,
  type AttributeKey,
} from "../config/codex.js";
import { achievementCategory } from "./achievementsService.js";
import { coinBalance, levelForXp, todayKeyFor } from "./gamificationService.js";
import {
  allocateXp,
  calculateAttributeLevel,
  calculateAttributeSynergy,
  distributionFor,
  ruleMet,
  ruleProgress,
  suggestClass,
  trendPct,
  type UnlockFacts,
} from "./codexEngine.js";
import { computeInsights } from "./metricsService.js";

/**
 * Códex da Jornada — camada de leitura/organização sobre dados reais.
 * Atributos = XP do ledger CLASSIFICADO por regra (soma = XP global).
 * Relíquias, títulos e conhecimentos são cosméticos e gravados uma única
 * vez em codex_unlocks. Descobertas só existem com evidência mínima.
 * Toda query filtra owner_id.
 */

export class CodexError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

const SOURCE_LABEL: Record<string, string> = {
  task: "Missões",
  day: "Bônus do dia",
  focus: "Foco",
  habit_entry: "Hábitos",
  habit_streak: "Sequências",
  journal: "Diário",
  review: "Revisões",
  experiment: "Laboratório",
  life_admin: "Administração",
  project: "Projetos",
  campaign: "Campanhas",
  contract: "Contratos",
  achievement: "Conquistas",
};

function shiftDay(day: string, delta: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------ Atributos ------------------------------ */

export interface AttributeAggregate {
  xp: Record<AttributeKey, number>;
  last: Record<AttributeKey, number>;
  prev: Record<AttributeKey, number>;
  bySource: Record<AttributeKey, Record<string, number>>;
  daily: Record<AttributeKey, Record<string, number>>;
  /** XP por atributo por dia em todo o histórico (base da evolução do Build do Personagem). */
  dailyAll: Record<AttributeKey, Record<string, number>>;
  recent: Record<AttributeKey, Array<{ label: string | null; xp: number; dayKey: string }>>;
  totalXp: number;
  sourceCounts: Record<string, number>;
  bestHabitStreak: number;
  today: string;
}

const zero = () => Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<AttributeKey, number>;

/** Lê o ledger uma vez e classifica cada evento (sem N+1, sem gravar nada). */
export async function aggregateAttributes(db: Client, ownerId: string): Promise<AttributeAggregate> {
  const [events, habits, today] = await Promise.all([
    db.execute({
      sql: `SELECT x.source_type, x.source_id, x.event_type, x.xp, x.day_key, x.label, p.kind AS project_kind, a.metric AS ach_metric
            FROM xp_events x
            LEFT JOIN projects p ON p.id = x.project_id AND p.owner_id = x.owner_id
            LEFT JOIN achievements a ON x.source_type = 'achievement' AND a.id = x.source_id
            WHERE x.owner_id = ?
            ORDER BY x.created_at DESC, x.rowid DESC`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, name, category FROM habits WHERE owner_id = ?", args: [ownerId] }),
    todayKeyFor(db, ownerId),
  ]);
  const habitText = new Map(habits.rows.map((h) => [String(h.id), `${String(h.name)} ${h.category ?? ""}`]));
  const D = codexConfig.trendDays;
  const lastFrom = shiftDay(today, -(D - 1));
  const prevFrom = shiftDay(today, -(2 * D - 1));
  const agg: AttributeAggregate = {
    xp: zero(),
    last: zero(),
    prev: zero(),
    bySource: Object.fromEntries(ATTRIBUTES.map((a) => [a, {}])) as AttributeAggregate["bySource"],
    daily: Object.fromEntries(ATTRIBUTES.map((a) => [a, {}])) as AttributeAggregate["daily"],
    dailyAll: Object.fromEntries(ATTRIBUTES.map((a) => [a, {}])) as AttributeAggregate["dailyAll"],
    recent: Object.fromEntries(ATTRIBUTES.map((a) => [a, []])) as unknown as AttributeAggregate["recent"],
    totalXp: 0,
    sourceCounts: {},
    bestHabitStreak: 0,
    today,
  };
  for (const r of events.rows as unknown as Row[]) {
    const sourceType = String(r.source_type);
    const sourceId = String(r.source_id);
    const eventType = String(r.event_type);
    const xp = n(r.xp);
    const day = String(r.day_key);
    agg.totalXp += xp;
    agg.sourceCounts[sourceType] = (agg.sourceCounts[sourceType] ?? 0) + 1;
    agg.sourceCounts[`${sourceType}:${eventType}`] = (agg.sourceCounts[`${sourceType}:${eventType}`] ?? 0) + 1;
    if (sourceType === "habit_streak") agg.bestHabitStreak = Math.max(agg.bestHabitStreak, Number(sourceId.split(":").pop()) || 0);
    const dist = distributionFor(
      { sourceType, sourceId, eventType, xp },
      {
        projectKind: r.project_kind == null ? null : String(r.project_kind),
        habitText: sourceType === "habit_entry" ? habitText.get(sourceId.split(":")[0]) ?? null : null,
        achievementCategory: sourceType === "achievement" ? achievementCategory(r.ach_metric == null ? null : String(r.ach_metric)) : null,
      },
    );
    const parts = allocateXp(xp, dist);
    for (const [k, v] of Object.entries(parts) as Array<[AttributeKey, number]>) {
      if (!v) continue;
      agg.xp[k] += v;
      agg.bySource[k][sourceType] = (agg.bySource[k][sourceType] ?? 0) + v;
      agg.dailyAll[k][day] = (agg.dailyAll[k][day] ?? 0) + v;
      if (day >= lastFrom) {
        agg.last[k] += v;
        agg.daily[k][day] = (agg.daily[k][day] ?? 0) + v;
      } else if (day >= prevFrom) agg.prev[k] += v;
      if (agg.recent[k].length < 8) agg.recent[k].push({ label: r.label == null ? null : String(r.label), xp: v, dayKey: day });
    }
  }
  return agg;
}

function attributeViews(agg: AttributeAggregate) {
  return ATTRIBUTES.map((key) => {
    const lv = calculateAttributeLevel(agg.xp[key]);
    const sources = Object.entries(agg.bySource[key])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([source, xp]) => ({ source, label: SOURCE_LABEL[source] ?? source, xp }));
    return {
      key,
      ...ATTRIBUTE_META[key],
      ...lv,
      last30: agg.last[key],
      prev30: agg.prev[key],
      trendPct: trendPct(agg.last[key], agg.prev[key]),
      topSources: sources,
    };
  });
}

/* ------------------------------ Desbloqueios ------------------------------ */

async function unlockFacts(db: Client, ownerId: string, agg: AttributeAggregate): Promise<UnlockFacts> {
  const [tasks, camps] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM campaigns WHERE owner_id = ? AND status = 'completed'", args: [ownerId] }),
  ]);
  return {
    globalLevel: levelForXp(agg.totalXp).level,
    attributeXp: agg.xp,
    sourceCounts: agg.sourceCounts,
    tasksDone: n(tasks.rows[0]?.n),
    campaignsCompleted: n(camps.rows[0]?.n),
    bestHabitStreak: agg.bestHabitStreak,
  };
}

/** Grava (uma única vez) relíquias, títulos e conhecimentos cujas condições foram atingidas. */
async function syncUnlocks(db: Client, ownerId: string, facts: UnlockFacts) {
  const stmts: Array<{ sql: string; args: string[] }> = [];
  const add = (kind: string, id: string) =>
    stmts.push({ sql: "INSERT INTO codex_unlocks (owner_id, kind, item_id, source_type) VALUES (?, ?, ?, 'rule') ON CONFLICT DO NOTHING", args: [ownerId, kind, id] });
  for (const r of RELICS) if (ruleMet(r.rule, facts)) add("relic", r.id);
  for (const t of TITLES) if (ruleMet(t.rule, facts)) add("title", t.id);
  for (const k of KNOWLEDGE) if (k.unlock.type === "attribute_xp" && (facts.attributeXp[k.attribute] ?? 0) >= k.unlock.min) add("knowledge", k.id);
  if (stmts.length) await db.batch(stmts, "write");
  const r = await db.execute({ sql: "SELECT kind, item_id, unlocked_at, seen_at, source_type FROM codex_unlocks WHERE owner_id = ?", args: [ownerId] });
  const map = new Map<string, { unlockedAt: string; seen: boolean; source: string | null }>();
  for (const row of r.rows) map.set(`${row.kind}:${row.item_id}`, { unlockedAt: String(row.unlocked_at), seen: row.seen_at != null, source: row.source_type == null ? null : String(row.source_type) });
  return map;
}

/** Título equipável? (usado também ao salvar o perfil — nunca confia no frontend). */
export async function isTitleUnlocked(db: Client, ownerId: string, titleId: string): Promise<boolean> {
  if (!TITLES.some((t) => t.id === titleId)) return false;
  const agg = await aggregateAttributes(db, ownerId);
  const unlocks = await syncUnlocks(db, ownerId, await unlockFacts(db, ownerId, agg));
  return unlocks.has(`title:${titleId}`);
}

async function equippedTitle(db: Client, ownerId: string): Promise<string | null> {
  const r = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [ownerId] });
  try {
    const p = JSON.parse(String(r.rows[0]?.rpg_prefs_json ?? "{}")) as { title?: unknown };
    return typeof p.title === "string" ? p.title : null;
  } catch {
    return null;
  }
}

/* ------------------------------ Descobertas ------------------------------ */

interface DetectedDiscovery {
  key: string;
  title: string;
  description: string;
  category: string;
  sourceType: string;
  sourceId: string | null;
  evidence: Record<string, unknown>;
  confidence: "low" | "medium" | "high";
}

/**
 * Detecta padrões REAIS com amostra mínima. Nenhuma descoberta nasce de
 * texto livre de IA: cada uma carrega período, amostra e números.
 */
export async function detectDiscoveries(db: Client, ownerId: string, today: string): Promise<DetectedDiscovery[]> {
  const from = shiftDay(today, -89);
  const out: DetectedDiscovery[] = [];
  const [insights, focus, exps, streaks, activeDays, tzRow] = await Promise.all([
    computeInsights(ownerId, from, today),
    db.execute({
      sql: "SELECT ended_at, duration_minutes FROM time_entries WHERE owner_id = ? AND ended_at IS NOT NULL AND duration_minutes >= 10 AND date(ended_at) >= date(?)",
      args: [ownerId, from],
    }),
    db.execute({
      sql: `SELECT e.id, e.title, (SELECT COUNT(*) FROM personal_experiment_logs l WHERE l.experiment_id = e.id AND l.owner_id = e.owner_id) AS logs
            FROM personal_experiments e WHERE e.owner_id = ? AND e.status = 'completed' AND e.perceived_result = 'improved'`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT x.source_id, x.label FROM xp_events x WHERE x.owner_id = ? AND x.source_type = 'habit_streak'`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(DISTINCT date(updated_at)) AS n FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND date(updated_at) >= date(?)", args: [ownerId, from] }),
    db.execute({ sql: "SELECT timezone FROM users WHERE id = ?", args: [ownerId] }),
  ]);
  const period = { from, to: today };

  // 1) Sono × tarefas do dia seguinte (associação, não causa).
  const s = insights.sleepVsNextDayProductivity;
  if (s.r !== null && s.pairs >= 14 && s.r >= 0.3) {
    out.push({
      key: "sleep_productivity",
      title: "Sono e rendimento caminham juntos",
      description: `Nas noites em que você dormiu mais, tendeu a concluir mais tarefas no dia seguinte (r = ${s.r.toFixed(2).replace(".", ",")} em ${s.pairs} pares de dias). É uma associação nos seus dados, não uma prova de causa.`,
      category: "Saúde",
      sourceType: "analytics",
      sourceId: null,
      evidence: { ...period, metric: "correlação sono × tarefas do dia seguinte", r: s.r, sample: s.pairs },
      confidence: s.pairs >= 30 && s.r >= 0.5 ? "high" : s.pairs >= 20 ? "medium" : "low",
    });
  }

  // 2) Dia da semana de maior rendimento.
  const days = n(activeDays.rows[0]?.n);
  const withData = insights.weekdayBreakdown.filter((w) => w.avgCompleted > 0);
  const avg = withData.length ? withData.reduce((a, w) => a + w.avgCompleted, 0) / withData.length : 0;
  if (insights.bestWeekday && days >= 20 && avg > 0 && insights.bestWeekday.avgCompleted >= avg * 1.3) {
    const pct = Math.round((insights.bestWeekday.avgCompleted / avg - 1) * 100);
    out.push({
      key: "best_weekday",
      title: `Dia de maior rendimento: ${insights.bestWeekday.label}`,
      description: `Às ${insights.bestWeekday.label.toLowerCase()}s você conclui em média ${insights.bestWeekday.avgCompleted.toFixed(1).replace(".", ",")} tarefas — ${pct}% acima da média dos outros dias.`,
      category: "Produtividade",
      sourceType: "analytics",
      sourceId: null,
      evidence: { ...period, metric: "tarefas concluídas por dia da semana", best: insights.bestWeekday, average: Math.round(avg * 10) / 10, sample: days },
      confidence: days >= 45 ? "high" : days >= 30 ? "medium" : "low",
    });
  }

  // 3) Horário de ouro do foco (manhã × tarde/noite, no fuso do usuário).
  const tz = typeof tzRow.rows[0]?.timezone === "string" && tzRow.rows[0]?.timezone ? String(tzRow.rows[0].timezone) : "America/Sao_Paulo";
  const morning: number[] = [];
  const later: number[] = [];
  for (const f of focus.rows) {
    const ended = new Date(String(f.ended_at).includes("T") ? String(f.ended_at) : `${String(f.ended_at).replace(" ", "T")}Z`);
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(ended));
    (hour < 12 ? morning : later).push(n(f.duration_minutes));
  }
  if (morning.length >= 4 && later.length >= 4 && morning.length + later.length >= 10) {
    const am = morning.reduce((a, b) => a + b, 0) / morning.length;
    const pm = later.reduce((a, b) => a + b, 0) / later.length;
    const best = am >= pm ? "manhã" : "tarde/noite";
    const diff = Math.round((Math.max(am, pm) / Math.min(am, pm) - 1) * 100);
    if (diff >= 15) {
      out.push({
        key: "focus_time_of_day",
        title: `Horário de ouro do foco: ${best}`,
        description: `Suas sessões de foco ${best === "manhã" ? "antes do meio-dia" : "depois do meio-dia"} duraram em média ${Math.round(Math.max(am, pm))} min — ${diff}% a mais que as do outro período.`,
        category: "Produtividade",
        sourceType: "focus",
        sourceId: null,
        evidence: { ...period, metric: "duração média das sessões de foco", morningAvg: Math.round(am), laterAvg: Math.round(pm), sample: morning.length + later.length },
        confidence: morning.length + later.length >= 30 ? "high" : "medium",
      });
    }
  }

  // 4) Experimentos concluídos com melhora percebida e registros suficientes.
  for (const e of exps.rows) {
    const logs = n(e.logs);
    if (logs < 3) continue;
    out.push({
      key: `experiment_${String(e.id)}`,
      title: `Experimento validado: ${String(e.title)}`,
      description: `Você concluiu este experimento relatando melhora, com ${logs} registros no laboratório.`,
      category: "Laboratório",
      sourceType: "experiment",
      sourceId: String(e.id),
      evidence: { metric: "resultado percebido na conclusão", perceived: "improved", sample: logs },
      confidence: logs >= 10 ? "medium" : "low",
    });
  }

  // 5) Hábitos consolidados (marco de sequência de 14+ dias).
  const bestByHabit = new Map<string, { days: number; label: string }>();
  for (const r of streaks.rows) {
    const [habitId, d] = String(r.source_id).split(":");
    const days = Number(d) || 0;
    if (days >= 14 && days > (bestByHabit.get(habitId)?.days ?? 0)) bestByHabit.set(habitId, { days, label: String(r.label ?? "") });
  }
  for (const [habitId, v] of bestByHabit) {
    const name = v.label.replace(/^Sequência de \d+ dias: /, "") || "hábito";
    out.push({
      key: `habit_${habitId}`,
      title: `Rotina consolidada: ${name}`,
      description: `Você manteve ${name} por ${v.days} dias seguidos — uma rotina que já faz parte da sua jornada.`,
      category: "Hábitos",
      sourceType: "habit",
      sourceId: habitId,
      evidence: { metric: "sequência de dias cumpridos", sample: v.days },
      confidence: v.days >= 30 ? "high" : "medium",
    });
  }
  return out;
}

async function syncDiscoveries(db: Client, ownerId: string, today: string) {
  const found = await detectDiscoveries(db, ownerId, today);
  if (found.length) {
    await db.batch(
      found.map((d) => ({
        sql: `INSERT INTO codex_discoveries (id, owner_id, key, title, description, category, source_type, source_id, evidence_json, confidence)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (owner_id, key) DO UPDATE SET title = excluded.title, description = excluded.description,
                evidence_json = excluded.evidence_json, confidence = excluded.confidence, updated_at = datetime('now')`,
        args: [nanoid(), ownerId, d.key, d.title, d.description, d.category, d.sourceType, d.sourceId, JSON.stringify(d.evidence), d.confidence],
      })),
      "write",
    );
  }
  const r = await db.execute({ sql: "SELECT * FROM codex_discoveries WHERE owner_id = ? AND status = 'active' ORDER BY discovered_at DESC", args: [ownerId] });
  return r.rows.map((row) => ({
    id: String(row.id),
    key: String(row.key),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    source: String(row.source_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    evidence: JSON.parse(String(row.evidence_json)) as Record<string, unknown>,
    confidence: String(row.confidence) as "low" | "medium" | "high",
    discoveredAt: String(row.discovered_at),
    seen: row.seen_at != null,
  }));
}

/* ------------------------------ Visão completa ------------------------------ */

/** Grava relíquias/títulos/conhecimentos já conquistados (idempotente) — usado também pelo Inventário. */
export async function syncCodexUnlocks(db: Client, ownerId: string): Promise<void> {
  const agg = await aggregateAttributes(db, ownerId);
  await syncUnlocks(db, ownerId, await unlockFacts(db, ownerId, agg));
}

export async function getCodex(db: Client, ownerId: string) {
  const agg = await aggregateAttributes(db, ownerId);
  const facts = await unlockFacts(db, ownerId, agg);
  const [unlocks, discoveries, equipped, balance] = await Promise.all([
    syncUnlocks(db, ownerId, facts),
    syncDiscoveries(db, ownerId, agg.today),
    equippedTitle(db, ownerId),
    coinBalance(db, ownerId),
  ]);
  const attributes = attributeViews(agg);
  const u = (kind: string, id: string) => unlocks.get(`${kind}:${id}`) ?? null;

  const relics = RELICS.map((r) => {
    const x = u("relic", r.id);
    return { id: r.id, name: r.name, description: r.description, rarity: r.rarity, obtainedBy: r.obtainedBy, unlocked: !!x, unlockedAt: x?.unlockedAt ?? null, seen: x?.seen ?? true, progress: x ? 1 : ruleProgress(r.rule, facts) };
  });
  const titles = TITLES.map((t) => {
    const x = u("title", t.id);
    return { id: t.id, name: t.name, description: t.description, rarity: t.rarity, unlocked: !!x, unlockedAt: x?.unlockedAt ?? null, seen: x?.seen ?? true, equipped: !!x && equipped === t.id, progress: x ? 1 : ruleProgress(t.rule, facts) };
  });
  const knowledge = KNOWLEDGE.map((k) => {
    const x = u("knowledge", k.id);
    const progress = x ? 1 : k.unlock.type === "attribute_xp" ? Math.min(1, (agg.xp[k.attribute] ?? 0) / k.unlock.min) : 0;
    return {
      id: k.id,
      title: k.title,
      category: k.category,
      attribute: k.attribute,
      summary: k.summary,
      unlock: k.unlock,
      unlocked: !!x,
      unlockedAt: x?.unlockedAt ?? null,
      seen: x?.seen ?? true,
      progress,
      // O conteúdo só sai do servidor depois do desbloqueio.
      content: x ? k.content : null,
    };
  });
  const totalItems = relics.length + titles.length + knowledge.length;
  const unlockedItems = [...relics, ...titles, ...knowledge].filter((i) => i.unlocked).length;
  const suggested = suggestClass(agg.xp);

  return {
    global: { ...levelForXp(agg.totalXp), coins: balance },
    attributes,
    synergy: calculateAttributeSynergy(agg.xp),
    suggestedClass: suggested,
    classes: CLASSES.map((c) => ({ ...c, score: Math.round(((agg.xp[c.attributes[0]] ?? 0) + (agg.xp[c.attributes[1]] ?? 0)) / 2) })),
    discoveries,
    relics,
    titles,
    knowledge,
    areaAttribute: AREA_ATTRIBUTE,
    completion: { unlocked: unlockedItems, total: totalItems, pct: Math.round((unlockedItems / totalItems) * 100) },
    hasData: agg.totalXp > 0,
  };
}

/** Detalhe do atributo: série de 30 dias, fontes, últimas ações e itens relacionados. */
export async function getAttributeDetail(db: Client, ownerId: string, key: string) {
  if (!(ATTRIBUTES as readonly string[]).includes(key)) throw new CodexError("Atributo inválido.", 404);
  const attr = key as AttributeKey;
  const agg = await aggregateAttributes(db, ownerId);
  const view = attributeViews(agg).find((a) => a.key === attr)!;
  const series = Array.from({ length: codexConfig.trendDays }, (_, i) => {
    const day = shiftDay(agg.today, -(codexConfig.trendDays - 1 - i));
    return { date: day, xp: agg.daily[attr][day] ?? 0 };
  });
  const relatesTo = (rule: unknown): boolean => JSON.stringify(rule).includes(`"attribute":"${attr}"`);
  return {
    ...view,
    series,
    recent: agg.recent[attr],
    relatedRelics: RELICS.filter((r) => relatesTo(r.rule)).map((r) => r.id),
    relatedTitles: TITLES.filter((t) => relatesTo(t.rule)).map((t) => t.id),
    relatedKnowledge: KNOWLEDGE.filter((k) => k.attribute === attr).map((k) => k.id),
    classes: CLASSES.filter((c) => c.attributes.includes(attr)).map((c) => c.name),
  };
}

/** Marca desbloqueios/descobertas como vistos (os avisos não reaparecem). */
export async function markSeen(db: Client, ownerId: string, kind: "relic" | "title" | "knowledge" | "discovery", ids: string[]) {
  if (!ids.length) return;
  const ph = ids.map(() => "?").join(", ");
  if (kind === "discovery") {
    await db.execute({ sql: `UPDATE codex_discoveries SET seen_at = datetime('now') WHERE owner_id = ? AND id IN (${ph}) AND seen_at IS NULL`, args: [ownerId, ...ids] });
  } else {
    await db.execute({ sql: `UPDATE codex_unlocks SET seen_at = datetime('now') WHERE owner_id = ? AND kind = ? AND item_id IN (${ph}) AND seen_at IS NULL`, args: [ownerId, kind, ...ids] });
  }
}

/**
 * Compra de conhecimento opcional com MOEDAS (XP nunca é gasto). Débito
 * e desbloqueio na mesma transação; chave única impede cobrança dupla.
 */
export async function buyKnowledge(db: Client, ownerId: string, id: string) {
  const k = KNOWLEDGE.find((x) => x.id === id);
  if (!k) throw new CodexError("Conhecimento não encontrado.", 404);
  if (k.unlock.type !== "coins") throw new CodexError("Este conhecimento é liberado pelo XP do atributo, não por moedas.");
  const owned = await db.execute({ sql: "SELECT 1 FROM codex_unlocks WHERE owner_id = ? AND kind = 'knowledge' AND item_id = ?", args: [ownerId, id] });
  if (owned.rows.length) return { ok: true as const, already: true };
  const balance = await coinBalance(db, ownerId);
  if (balance < k.unlock.cost) throw new CodexError(`Moedas insuficientes: faltam ${k.unlock.cost - balance}.`, 409);
  await db.batch(
    [
      {
        sql: `INSERT INTO coin_ledger (id, owner_id, amount, source_type, source_id, event_type, label) VALUES (?, ?, ?, 'codex_knowledge', ?, 'purchase', ?)
              ON CONFLICT (owner_id, source_type, source_id, event_type) DO NOTHING`,
        args: [nanoid(), ownerId, -k.unlock.cost, id, `Códex: ${k.title}`],
      },
      { sql: "INSERT INTO codex_unlocks (owner_id, kind, item_id, source_type) VALUES (?, 'knowledge', ?, 'coins') ON CONFLICT DO NOTHING", args: [ownerId, id] },
    ],
    "write",
  );
  return { ok: true as const, already: false };
}

/** Catálogo leve de títulos (nome + desbloqueio) para HUD/Perfil. */
export async function getTitles(db: Client, ownerId: string) {
  const agg = await aggregateAttributes(db, ownerId);
  const unlocks = await syncUnlocks(db, ownerId, await unlockFacts(db, ownerId, agg));
  return TITLES.map((t) => ({ id: t.id, name: t.name, rarity: t.rarity, description: t.description, unlocked: unlocks.has(`title:${t.id}`) }));
}

/** Marcos da jornada (cronológico): marcos de campanha, metas, projetos, níveis e grandes conquistas. */
export async function getMilestones(db: Client, ownerId: string) {
  const [ms, goals, projects, ach, levels] = await Promise.all([
    db.execute({
      sql: `SELECT m.title, m.completed_at AS at, c.title AS campaign, c.id AS campaign_id, m.is_major FROM campaign_milestones m
            JOIN campaigns c ON c.id = m.campaign_id AND c.owner_id = m.owner_id WHERE m.owner_id = ? AND m.status = 'completed'`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, title, completed_at AS at FROM goals WHERE owner_id = ? AND status = 'done' AND completed_at IS NOT NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name, completed_at AS at FROM projects WHERE owner_id = ? AND status = 'completed' AND completed_at IS NOT NULL", args: [ownerId] }),
    db.execute({
      sql: `SELECT a.title, a.tier, ua.unlocked_at AS at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
            WHERE ua.owner_id = ? AND a.tier IN ('gold', 'platinum')`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT xp, created_at, day_key FROM xp_events WHERE owner_id = ? ORDER BY created_at ASC, rowid ASC", args: [ownerId] }),
  ]);
  const items: Array<{ kind: string; title: string; detail: string | null; at: string; link: string | null }> = [];
  for (const r of ms.rows) items.push({ kind: "campaign_milestone", title: String(r.title), detail: `Campanha: ${String(r.campaign)}`, at: String(r.at), link: `/forja-campanhas/${String(r.campaign_id)}` });
  for (const r of goals.rows) items.push({ kind: "goal", title: String(r.title), detail: "Meta concluída", at: String(r.at), link: "/metas" });
  for (const r of projects.rows) items.push({ kind: "project", title: String(r.name), detail: "Projeto concluído", at: String(r.at), link: `/projetos/${String(r.id)}` });
  for (const r of ach.rows) items.push({ kind: "achievement", title: String(r.title), detail: r.tier === "platinum" ? "Conquista de platina" : "Conquista de ouro", at: String(r.at), link: "/conquistas" });
  let total = 0;
  let level = 1;
  for (const r of levels.rows) {
    total += n(r.xp);
    while (levelForXp(total).level > level) {
      level++;
      items.push({ kind: "level", title: `Nível ${level}`, detail: "Subida de nível", at: String(r.created_at), link: null });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

