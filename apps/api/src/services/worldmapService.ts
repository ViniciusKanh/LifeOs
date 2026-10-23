import type { Client } from "@libsql/client";
import { HABIT_KEYWORDS } from "../config/codex.js";
import { achievementCategory } from "./achievementsService.js";
import { todayKeyFor } from "./gamificationService.js";
import { trendPct } from "./codexEngine.js";

/**
 * Mapa do Mundo — cada região é uma área da vida com nível próprio.
 *
 * Regra central: o XP de região é uma CLASSIFICAÇÃO do ledger real
 * (xp_events). Cada evento vai INTEIRO para exatamente uma região, então a
 * soma das regiões é sempre o XP global — nenhum XP é criado. Nada é
 * gravado: tudo é derivado na leitura. Toda query filtra owner_id.
 *
 * Classificação (determinística, em ordem de precedência):
 *  - task / focus / project: tipo do projeto (academic → Estudos;
 *    professional/workspace → Trabalho); senão life_area da meta da tarefa
 *    (tasks.goal_id) ou da meta do projeto (projects.goal_id); senão Encruzilhada.
 *  - habit_entry / habit_streak: palavras do nome+categoria do hábito
 *    (HABIT_KEYWORDS do Códex: saúde → Saúde; conhecimento → Estudos;
 *    bem-estar/criatividade → Mente; + FINANCE_WORDS → Finanças & Lar);
 *    sem palavra reconhecida → Encruzilhada.
 *  - journal, review, experiment → Mente.
 *  - life_admin → Finanças & Lar.
 *  - achievement: categoria da conquista (saude → Saúde; leitura/educacao →
 *    Estudos; revisoes/experimentos → Mente; demais → Encruzilhada).
 *  - contract: projeto vinculado (regra de projeto) → meta vinculada
 *    (life_area) → Encruzilhada.
 *  - campaign (conclusão ou marco): meta da campanha (life_area) →
 *    campaigns.life_area → Encruzilhada.
 *  - day (bônus diário) e qualquer outra origem → Encruzilhada.
 *
 * life_area → região: saude → Saúde; carreira → Trabalho; financas → Finanças
 * & Lar; desenvolvimento/educacao → Estudos; relacionamentos, familia,
 * espiritualidade, lazer → Mente.
 *
 * Curva de nível da região (explícita): o nível n começa em 100·(n−1)² XP
 * (Nv.1 = 0, Nv.2 = 100, Nv.3 = 400, Nv.4 = 900…).
 */

export const REGION_KEYS = ["estudos", "trabalho", "saude", "financas", "mente", "encruzilhada"] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

const REGION_META: Record<RegionKey, { name: string; description: string; href: string; unlockHint: string }> = {
  estudos: {
    name: "Torre dos Estudos",
    description: "Educação, leitura, idiomas e projetos acadêmicos.",
    href: "/educacao",
    unlockHint: "Conclua uma tarefa de um projeto acadêmico ou cumpra um hábito de estudo/leitura.",
  },
  trabalho: {
    name: "Cidadela do Trabalho",
    description: "Projetos profissionais e área Profissional.",
    href: "/profissional",
    unlockHint: "Conclua uma tarefa de um projeto profissional ou workspace.",
  },
  saude: {
    name: "Vale da Vitalidade",
    description: "Treino, água, sono e hábitos de saúde.",
    href: "/saude",
    unlockHint: "Cumpra um hábito de saúde (água, treino, sono) ou registre um treino.",
  },
  financas: {
    name: "Vila do Tesouro",
    description: "Finanças, contas, documentos e o lar.",
    href: "/administracao",
    unlockHint: "Resolva um item da Administração ou conclua uma tarefa de meta financeira.",
  },
  mente: {
    name: "Bosque da Mente",
    description: "Diário, revisões, experimentos e bem-estar.",
    href: "/diario",
    unlockHint: "Escreva a crônica de hoje no Diário ou feche uma revisão.",
  },
  encruzilhada: {
    name: "Encruzilhada",
    description: "O centro do mapa: missões gerais, bônus do dia e conquistas sem área.",
    href: "/tarefas",
    unlockHint: "Conclua qualquer missão para acender o centro do mapa.",
  },
};

/** life_area (metas/campanhas) → região. Inclui 'educacao' de dados legados. */
export const LIFE_AREA_REGION: Record<string, RegionKey> = {
  saude: "saude",
  carreira: "trabalho",
  financas: "financas",
  desenvolvimento: "estudos",
  educacao: "estudos",
  relacionamentos: "mente",
  familia: "mente",
  espiritualidade: "mente",
  lazer: "mente",
};

/** Palavras de hábito financeiro/doméstico (complementam HABIT_KEYWORDS, que não cobre finanças). */
export const FINANCE_WORDS = ["finan", "gasto", "orçament", "orcament", "econom", "invest", "poupa", "dinheiro", "faxina", "limpeza", "arrumar casa"];

const HABIT_MAPPING_REGION: Record<string, RegionKey> = {
  HABIT_HEALTH: "saude",
  HABIT_KNOWLEDGE: "estudos",
  HABIT_WELLBEING: "mente",
  HABIT_CREATIVITY: "mente",
};

const ACHIEVEMENT_REGION: Record<string, RegionKey> = {
  saude: "saude",
  leitura: "estudos",
  educacao: "estudos",
  revisoes: "mente",
  experimentos: "mente",
};

const SOURCE_LABEL: Record<string, string> = {
  task: "Missões",
  day: "Bônus do dia",
  focus: "Tempo de missão",
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

/* ------------------------------ Regras puras ------------------------------ */

export function regionForLifeArea(area: string | null | undefined): RegionKey | null {
  return area ? (LIFE_AREA_REGION[area] ?? null) : null;
}

export function regionForProjectKind(kind: string | null | undefined): RegionKey | null {
  if (kind === "academic") return "estudos";
  if (kind === "professional" || kind === "workspace") return "trabalho";
  return null;
}

export function regionForHabit(text: string | null | undefined): RegionKey | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (FINANCE_WORDS.some((w) => t.includes(w))) return "financas";
  for (const k of HABIT_KEYWORDS) if (k.words.some((w) => t.includes(w))) return HABIT_MAPPING_REGION[k.mapping] ?? null;
  return null;
}

/** Contexto já resolvido (via joins) para classificar um evento do ledger. */
export interface RegionContext {
  projectKind?: string | null;
  projectGoalArea?: string | null;
  taskGoalArea?: string | null;
  habitText?: string | null;
  achievementMetric?: string | null;
  contractProjectKind?: string | null;
  contractProjectGoalArea?: string | null;
  contractGoalArea?: string | null;
  campaignGoalArea?: string | null;
  campaignLifeArea?: string | null;
}

/** Região de um evento do ledger (função pura e determinística). */
export function classifyRegion(sourceType: string, ctx: RegionContext = {}): RegionKey {
  switch (sourceType) {
    case "task":
    case "focus":
    case "project":
      return regionForProjectKind(ctx.projectKind) ?? regionForLifeArea(ctx.taskGoalArea) ?? regionForLifeArea(ctx.projectGoalArea) ?? "encruzilhada";
    case "habit_entry":
    case "habit_streak":
      return regionForHabit(ctx.habitText) ?? "encruzilhada";
    case "journal":
    case "review":
    case "experiment":
      return "mente";
    case "life_admin":
      return "financas";
    case "achievement":
      return ACHIEVEMENT_REGION[achievementCategory(ctx.achievementMetric ?? null)] ?? "encruzilhada";
    case "contract":
      return regionForProjectKind(ctx.contractProjectKind) ?? regionForLifeArea(ctx.contractProjectGoalArea) ?? regionForLifeArea(ctx.contractGoalArea) ?? "encruzilhada";
    case "campaign":
      return regionForLifeArea(ctx.campaignGoalArea) ?? regionForLifeArea(ctx.campaignLifeArea) ?? "encruzilhada";
    default:
      return "encruzilhada";
  }
}

/** XP necessário para ALCANÇAR o nível n da região: 100·(n−1)². */
export function xpForRegionLevel(level: number): number {
  return level <= 1 ? 0 : 100 * (level - 1) ** 2;
}

export function regionLevel(xpRaw: number) {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const start = xpForRegionLevel(level);
  const next = xpForRegionLevel(level + 1);
  return {
    level,
    xp,
    levelStartXp: start,
    nextLevelXp: next,
    progressPct: Math.round(((xp - start) / (next - start)) * 100),
  };
}

/* ------------------------------ Leitura ------------------------------ */

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v == null ? null : String(v));

function shiftDay(day: string, delta: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Primeiro segmento do source_id (campanha usa "campanha:marco"; hábito usa "habito:data"). */
const headId = (sourceId: string) => sourceId.split(":")[0];

export interface RegionActivity {
  /** Dias distintos com registro nos últimos 30 dias (não é XP). */
  activeDays30: number;
  windowDays: number;
  items: Array<{ label: string; count: number }>;
}

export interface NextStep {
  kind: "goal" | "task" | "life_admin" | "journal" | "contract";
  label: string;
  detail: string;
  href: string;
}

export interface RegionView {
  key: RegionKey;
  name: string;
  description: string;
  href: string;
  unlockHint: string;
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressPct: number;
  last30: number;
  prev30: number;
  trendPct: number | null;
  events: number;
  topSources: Array<{ source: string; label: string; xp: number }>;
  lastFeat: { label: string | null; xp: number; dayKey: string } | null;
  activity: RegionActivity | null;
  nextStep: NextStep | null;
  /** Sem XP nem atividade real: aparece "em névoa". */
  fogged: boolean;
}

export interface WorldMap {
  regions: RegionView[];
  totalXp: number;
  hasData: boolean;
  today: string;
  rules: { levelCurve: string; trendWindowDays: number };
}

interface Agg {
  xp: number;
  last: number;
  prev: number;
  events: number;
  bySource: Record<string, number>;
  lastFeat: RegionView["lastFeat"];
}

const TREND_DAYS = 30;

async function loadEvents(db: Client, ownerId: string) {
  // Um único SELECT com joins (todos amarrados ao mesmo owner_id) — sem N+1.
  const r = await db.execute({
    sql: `SELECT x.source_type, x.source_id, x.xp, x.day_key, x.label,
                 COALESCE(p.kind, tp.kind) AS project_kind,
                 COALESCE(pg.life_area, tpg.life_area) AS project_goal_area,
                 tg.life_area AS task_goal_area,
                 a.metric AS ach_metric
          FROM xp_events x
          LEFT JOIN tasks t ON x.source_type = 'task' AND t.id = x.source_id AND t.owner_id = x.owner_id
          LEFT JOIN projects p ON p.id = x.project_id AND p.owner_id = x.owner_id
          LEFT JOIN goals pg ON pg.id = p.goal_id AND pg.owner_id = x.owner_id
          LEFT JOIN projects tp ON x.project_id IS NULL AND tp.id = t.project_id AND tp.owner_id = x.owner_id
          LEFT JOIN goals tpg ON tpg.id = tp.goal_id AND tpg.owner_id = x.owner_id
          LEFT JOIN goals tg ON tg.id = t.goal_id AND tg.owner_id = x.owner_id
          LEFT JOIN achievements a ON x.source_type = 'achievement' AND a.id = x.source_id
          WHERE x.owner_id = ?
          ORDER BY x.day_key DESC, x.created_at DESC, x.rowid DESC`,
    args: [ownerId],
  });
  return r.rows as unknown as Row[];
}

async function loadLookups(db: Client, ownerId: string) {
  const [habits, contracts, campaigns] = await Promise.all([
    db.execute({
      sql: "SELECT id, name, category FROM habits WHERE owner_id = ?",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT c.id, c.title, c.status, c.due_date, p.kind AS project_kind, pg.life_area AS project_goal_area, g.life_area AS goal_area
            FROM contracts c
            LEFT JOIN projects p ON p.id = c.project_id AND p.owner_id = c.owner_id
            LEFT JOIN goals pg ON pg.id = p.goal_id AND pg.owner_id = c.owner_id
            LEFT JOIN goals g ON g.id = c.goal_id AND g.owner_id = c.owner_id
            WHERE c.owner_id = ?`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT c.id, c.life_area, g.life_area AS goal_area
            FROM campaigns c LEFT JOIN goals g ON g.id = c.goal_id AND g.owner_id = c.owner_id
            WHERE c.owner_id = ?`,
      args: [ownerId],
    }),
  ]);
  return {
    habitText: new Map(habits.rows.map((h) => [String(h.id), `${String(h.name)} ${h.category ?? ""}`])),
    contracts: new Map(contracts.rows.map((c) => [String(c.id), c as unknown as Row])),
    campaigns: new Map(campaigns.rows.map((c) => [String(c.id), c as unknown as Row])),
  };
}

/** Réguas de atividade real (registros sem XP), por região, nos últimos 30 dias. */
async function loadActivity(db: Client, ownerId: string, from: string): Promise<Partial<Record<RegionKey, RegionActivity>>> {
  // Datas gravadas em UTC: a janela de 30 dias é aproximada pelo prefixo YYYY-MM-DD.
  const q = (sql: string) => db.execute({ sql, args: [ownerId, from] });
  const [workouts, water, sleep, study, reading, journal, mood] = await Promise.all([
    q("SELECT substr(performed_at, 1, 10) AS d, COUNT(*) AS c FROM workouts WHERE owner_id = ? AND substr(performed_at, 1, 10) >= ? GROUP BY d"),
    q("SELECT substr(recorded_at, 1, 10) AS d, COUNT(*) AS c FROM water_entries WHERE owner_id = ? AND substr(recorded_at, 1, 10) >= ? GROUP BY d"),
    q("SELECT substr(woke_up_at, 1, 10) AS d, COUNT(*) AS c FROM sleep_entries WHERE owner_id = ? AND substr(woke_up_at, 1, 10) >= ? GROUP BY d"),
    q("SELECT substr(occurred_at, 1, 10) AS d, COUNT(*) AS c FROM study_sessions WHERE owner_id = ? AND substr(occurred_at, 1, 10) >= ? GROUP BY d"),
    q("SELECT substr(started_at, 1, 10) AS d, COUNT(*) AS c FROM reading_sessions WHERE owner_id = ? AND substr(started_at, 1, 10) >= ? GROUP BY d"),
    q("SELECT entry_date AS d, COUNT(*) AS c FROM journal_entries WHERE owner_id = ? AND entry_date >= ? GROUP BY d"),
    q("SELECT substr(recorded_at, 1, 10) AS d, COUNT(*) AS c FROM mood_entries WHERE owner_id = ? AND substr(recorded_at, 1, 10) >= ? GROUP BY d"),
  ]);
  const build = (parts: Array<{ label: string; rows: Row[] }>): RegionActivity | undefined => {
    const days = new Set<string>();
    const items = parts.map((p) => {
      for (const r of p.rows) days.add(String(r.d));
      return {
        label: p.label,
        count: p.rows.reduce((acc, r) => acc + n(r.c), 0),
      };
    });
    return { activeDays30: days.size, windowDays: TREND_DAYS, items };
  };
  const rows = (r: { rows: unknown[] }) => r.rows as Row[];
  return {
    saude: build([
      { label: "Treinos", rows: rows(workouts) },
      { label: "Registros de água", rows: rows(water) },
      { label: "Noites de sono", rows: rows(sleep) },
    ]),
    estudos: build([
      { label: "Sessões de estudo", rows: rows(study) },
      { label: "Sessões de leitura", rows: rows(reading) },
    ]),
    mente: build([
      { label: "Crônicas no Diário", rows: rows(journal) },
      { label: "Registros de humor", rows: rows(mood) },
    ]),
  };
}

const AREAS_OF: Record<RegionKey, string[]> = {
  estudos: ["desenvolvimento", "educacao"],
  trabalho: ["carreira"],
  saude: ["saude"],
  financas: ["financas"],
  mente: ["relacionamentos", "familia", "espiritualidade", "lazer"],
  encruzilhada: [],
};

/** YYYY-MM-DD → DD/MM/AAAA (exibição). */
const br = (d: unknown) => String(d).slice(0, 10).split("-").reverse().join("/");

const pct = (cur: unknown, target: unknown) => (n(target) > 0 ? Math.round((n(cur) / n(target)) * 100) : null);

/** Próximo passo por região, sempre a partir de registros reais (nunca inventado). */
async function loadNextSteps(db: Client, ownerId: string, today: string): Promise<Partial<Record<RegionKey, NextStep>>> {
  const [goals, academicTask, proTask, lifeAdmin, journalToday, contract, looseTask] = await Promise.all([
    db.execute({
      sql: `SELECT id, title, life_area, current_value, target_value, due_date FROM goals
            WHERE owner_id = ? AND status = 'active' AND life_area IS NOT NULL`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT t.title, t.due_date, p.name AS project FROM tasks t JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND p.kind = 'academic' AND t.status <> 'Concluído' AND t.parent_task_id IS NULL
            ORDER BY t.due_date IS NULL, t.due_date, t.priority_score DESC LIMIT 1`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT t.title, t.due_date, p.name AS project FROM tasks t JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND p.kind IN ('professional', 'workspace') AND t.status <> 'Concluído' AND t.parent_task_id IS NULL
            ORDER BY t.due_date IS NULL, t.due_date, t.priority_score DESC LIMIT 1`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT title, due_date FROM life_admin_items WHERE owner_id = ? AND status = 'active' AND due_date IS NOT NULL
            ORDER BY due_date LIMIT 1`,
      args: [ownerId],
    }),
    db.execute({
      sql: "SELECT 1 FROM journal_entries WHERE owner_id = ? AND entry_date = ? LIMIT 1",
      args: [ownerId, today],
    }),
    db.execute({
      // Só contratos sem projeto/meta: os vinculados pertencem à região da área deles.
      sql: "SELECT title, due_date FROM contracts WHERE owner_id = ? AND status = 'ativo' AND project_id IS NULL AND goal_id IS NULL ORDER BY due_date IS NULL, due_date LIMIT 1",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT title, due_date FROM tasks WHERE owner_id = ? AND status <> 'Concluído' AND parent_task_id IS NULL
              AND project_id IS NULL AND goal_id IS NULL
            ORDER BY due_date IS NULL, due_date, priority_score DESC LIMIT 1`,
      args: [ownerId],
    }),
  ]);
  const out: Partial<Record<RegionKey, NextStep>> = {};
  const due = (d: unknown) => (d ? ` · prazo ${br(d)}` : "");

  // Meta ativa da área com MENOR progresso (sem alvo numérico fica por último).
  for (const key of REGION_KEYS) {
    const areas = AREAS_OF[key];
    if (!areas.length) continue;
    const candidates = (goals.rows as unknown as Row[])
      .filter((g) => areas.includes(String(g.life_area)))
      .map((g) => ({ g, p: pct(g.current_value, g.target_value) }))
      .sort((a, b) => (a.p ?? 101) - (b.p ?? 101));
    const top = candidates[0];
    if (top) {
      out[key] = {
        kind: "goal",
        label: `Avançar a meta "${String(top.g.title)}"`,
        detail: top.p == null ? `Meta ativa da área${due(top.g.due_date)}` : `${top.p}% concluída${due(top.g.due_date)}`,
        href: "/metas",
      };
    }
  }
  const task = (r: { rows: unknown[] }, href: string): NextStep | null => {
    const t = r.rows[0] as Row | undefined;
    return t
      ? {
          kind: "task",
          label: `Concluir "${String(t.title)}"`,
          detail: `${t.project ? `Projeto ${String(t.project)}` : "Missão aberta"}${due(t.due_date)}`,
          href,
        }
      : null;
  };
  // Tarefa aberta de projeto da área tem prioridade sobre a meta (é a ação mais concreta).
  out.estudos = task(academicTask, "/tarefas") ?? out.estudos;
  out.trabalho = task(proTask, "/tarefas") ?? out.trabalho;
  const la = lifeAdmin.rows[0] as Row | undefined;
  if (la)
    out.financas = {
      kind: "life_admin",
      label: `Resolver "${String(la.title)}"`,
      detail: `Vence em ${br(la.due_date)}`,
      href: "/administracao",
    };
  if (!journalToday.rows.length)
    out.mente = {
      kind: "journal",
      label: "Escrever a crônica de hoje",
      detail: "Ainda não há entrada no Diário hoje.",
      href: "/diario",
    };
  const c = contract.rows[0] as Row | undefined;
  out.encruzilhada = c
    ? {
        kind: "contract",
        label: `Cumprir o contrato "${String(c.title)}"`,
        detail: `Contrato ativo${due(c.due_date)}`,
        href: "/contratos",
      }
    : (task(looseTask, "/tarefas") ?? undefined);
  for (const k of REGION_KEYS) if (!out[k]) delete out[k];
  return out;
}

export async function getWorldMap(db: Client, ownerId: string): Promise<WorldMap> {
  const today = await todayKeyFor(db, ownerId);
  const lastFrom = shiftDay(today, -(TREND_DAYS - 1));
  const prevFrom = shiftDay(today, -(2 * TREND_DAYS - 1));
  const [events, lookups, activity, nextSteps] = await Promise.all([
    loadEvents(db, ownerId),
    loadLookups(db, ownerId),
    loadActivity(db, ownerId, lastFrom),
    loadNextSteps(db, ownerId, today),
  ]);

  const agg = Object.fromEntries(REGION_KEYS.map((k) => [k, { xp: 0, last: 0, prev: 0, events: 0, bySource: {}, lastFeat: null }])) as unknown as Record<RegionKey, Agg>;
  let totalXp = 0;
  for (const r of events) {
    const sourceType = String(r.source_type);
    const sourceId = String(r.source_id);
    const contract = sourceType === "contract" ? lookups.contracts.get(sourceId) : undefined;
    const campaign = sourceType === "campaign" ? lookups.campaigns.get(headId(sourceId)) : undefined;
    const region = classifyRegion(sourceType, {
      projectKind: s(r.project_kind),
      projectGoalArea: s(r.project_goal_area),
      taskGoalArea: s(r.task_goal_area),
      habitText: sourceType.startsWith("habit_") ? (lookups.habitText.get(headId(sourceId)) ?? null) : null,
      achievementMetric: s(r.ach_metric),
      contractProjectKind: s(contract?.project_kind),
      contractProjectGoalArea: s(contract?.project_goal_area),
      contractGoalArea: s(contract?.goal_area),
      campaignGoalArea: s(campaign?.goal_area),
      campaignLifeArea: s(campaign?.life_area),
    });
    const xp = n(r.xp);
    const day = String(r.day_key);
    const a = agg[region];
    totalXp += xp;
    a.xp += xp;
    a.events += 1;
    a.bySource[sourceType] = (a.bySource[sourceType] ?? 0) + xp;
    if (day >= lastFrom) a.last += xp;
    else if (day >= prevFrom) a.prev += xp;
    // Eventos vêm do mais recente para o mais antigo.
    if (!a.lastFeat) a.lastFeat = { label: s(r.label), xp, dayKey: day };
  }

  // Contrato ativo VINCULADO (projeto/meta) vira próximo passo da sua região quando ela não tem outro.
  for (const c of lookups.contracts.values()) {
    if (String(c.status) !== "ativo") continue;
    const key = classifyRegion("contract", {
      contractProjectKind: s(c.project_kind),
      contractProjectGoalArea: s(c.project_goal_area),
      contractGoalArea: s(c.goal_area),
    });
    if (key === "encruzilhada" || nextSteps[key]) continue;
    nextSteps[key] = {
      kind: "contract",
      label: `Cumprir o contrato "${String(c.title)}"`,
      detail: `Contrato ativo${c.due_date ? ` · prazo ${br(c.due_date)}` : ""}`,
      href: "/contratos",
    };
  }

  const regions: RegionView[] = REGION_KEYS.map((key) => {
    const a = agg[key];
    const act = activity[key] ?? null;
    return {
      key,
      ...REGION_META[key],
      ...regionLevel(a.xp),
      last30: a.last,
      prev30: a.prev,
      trendPct: trendPct(a.last, a.prev),
      events: a.events,
      topSources: Object.entries(a.bySource)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 4)
        .map(([source, xp]) => ({
          source,
          label: SOURCE_LABEL[source] ?? source,
          xp,
        })),
      lastFeat: a.lastFeat,
      activity: act,
      nextStep: nextSteps[key] ?? null,
      fogged: a.xp === 0 && (act?.activeDays30 ?? 0) === 0,
    };
  });

  return {
    regions,
    totalXp,
    hasData: totalXp > 0,
    today,
    rules: {
      levelCurve: "O nível n começa em 100·(n−1)² XP",
      trendWindowDays: TREND_DAYS,
    },
  };
}
