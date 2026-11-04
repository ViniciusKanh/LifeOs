import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { extractJson, str } from "./aiJson.js";
import { notifyFromAutomation } from "./automationService.js";
import { ContractError, DIFFICULTY_GUIDE, getContract, listContracts, sanitizeTasks, type ContractProposal, type ContractView } from "./contractsService.js";
import { logContractEvent, STAGE_TEMPLATE, syncContractStages } from "./contractStages.js";
import { award, getDifficultyRewards, isDifficulty, type DifficultyKey } from "./gamificationService.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { bestStreak, streakEndingToday, tierRank } from "./planningHubService.js";

/**
 * Contratos 3.0 — Guilda dos Pactos. Camada derivada sobre `contracts`,
 * `contract_stages`, `contract_events`, `contract_seals` e as tarefas reais.
 *
 * - Estados novos (rascunho, pausado, pronto para selar, cumprido, cancelado)
 *   são derivados de colunas: o status oficial segue com o motor de XP.
 * - O bônus do contrato continua sendo pago UMA vez quando todas as tarefas são
 *   concluídas (gamificationService). Selar é o ritual de encerramento: confere
 *   os critérios dos selos e paga só o selo novo (idempotente por contrato+selo).
 * - Reputação da Guilda e risco de quebra são calculados com regras explícitas,
 *   mostradas na interface — nada de probabilidade inventada.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export type PactPhase = "rascunho" | "ativo" | "em_andamento" | "pausado" | "pronto_selar" | "cumprido" | "arquivado" | "cancelado";
export type SealCode = "disciplina" | "constancia" | "conhecimento" | "execucao" | "maestria";
export type RiskLevel = "baixo" | "moderado" | "alto" | "sem_dados";

export const SEALS: Array<{ code: SealCode; name: string; criterion: string }> = [
  { code: "disciplina", name: "Selo da Disciplina", criterion: "Todas as obrigações concluídas dentro do prazo do contrato e de cada tarefa." },
  { code: "constancia", name: "Selo da Constância", criterion: "Obrigações concluídas em pelo menos 5 dias diferentes." },
  { code: "conhecimento", name: "Selo do Conhecimento", criterion: "Contrato da categoria Estudos ou Leitura." },
  { code: "execucao", name: "Selo da Execução", criterion: "Pelo menos 8 obrigações concluídas no contrato." },
  { code: "maestria", name: "Selo da Maestria", criterion: "Contrato Difícil ou Épico com 3 ou mais etapas concluídas." },
];

export const GUILD_RANKS = [
  { min: 0, title: "Aprendiz dos Pactos" },
  { min: 300, title: "Cumpridor" },
  { min: 900, title: "Guardião dos Compromissos" },
  { min: 2000, title: "Mestre dos Pactos" },
  { min: 4000, title: "Lendário da Guilda" },
] as const;

/** Pontos de reputação (regra mostrada na UI). Não gera XP — é só a medida de cumprimento. */
export function guildPoints(p: { sealed: number; seals: number; stagesDone: number; tasksDone: number }): number {
  return p.sealed * 100 + p.seals * 40 + p.stagesDone * 10 + p.tasksDone * 2;
}

export function pactPhase(c: { isDraft: boolean; status: string; pausedAt: string | null; cancelledAt: string | null; sealedAt: string | null; doneTasks: number; stagesDone?: number }): PactPhase {
  if (c.isDraft) return "rascunho";
  if (c.status === "arquivado") return c.cancelledAt ? "cancelado" : "arquivado";
  if (c.status === "concluido") return c.sealedAt ? "cumprido" : "pronto_selar";
  if (c.pausedAt) return "pausado";
  return c.doneTasks > 0 || (c.stagesDone ?? 0) > 0 ? "em_andamento" : "ativo";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Selos merecidos por um contrato concluído (função pura, exportada para teste). */
export function evaluateSeals(p: { category: string | null; difficulty: string; dueDate: string | null; tasks: Array<{ dueDate: string | null; doneDay: string | null }>; stagesDone: number }): SealCode[] {
  const out: SealCode[] = [];
  const done = p.tasks.filter((t) => t.doneDay);
  const allDone = p.tasks.length > 0 && done.length === p.tasks.length;
  if (allDone && p.dueDate && done.every((t) => t.doneDay! <= p.dueDate! && (!t.dueDate || t.doneDay! <= t.dueDate.slice(0, 10)))) out.push("disciplina");
  if (new Set(done.map((t) => t.doneDay)).size >= 5) out.push("constancia");
  if (p.category === "estudos" || p.category === "leitura") out.push("conhecimento");
  if (done.length >= 8) out.push("execucao");
  if ((p.difficulty === "dificil" || p.difficulty === "epico") && p.stagesDone >= 3) out.push("maestria");
  return out;
}

/**
 * Risco de quebra (regra explícita, sem probabilidade inventada):
 * sem dados → sem prazo, sem obrigações ou menos de 3 dias de histórico sem nada feito;
 * alto → prazo vencido, 2+ tarefas atrasadas, ritmo necessário 2× maior que o atual
 * a 14 dias do fim, ou 14+ dias sem concluir nada;
 * moderado → 1 tarefa atrasada, ritmo necessário 1,2× maior, 7+ dias parado ou
 * reta final (3 dias) com 2+ obrigações abertas.
 */
export function pactRisk(p: { today: string; startDay: string; dueDate: string | null; total: number; done: number; overdueOpen: number; lastActivityDay: string | null }): { level: RiskLevel; reasons: string[] } {
  if (p.total === 0) return { level: "sem_dados", reasons: ["Sem obrigações cadastradas."] };
  const remaining = p.total - p.done;
  if (remaining === 0) return { level: "baixo", reasons: ["Todas as obrigações concluídas."] };
  if (!p.dueDate) return { level: "sem_dados", reasons: ["Sem prazo definido — não há como medir o ritmo."] };
  const due = p.dueDate.slice(0, 10);
  const daysLeft = daysBetween(p.today, due);
  const elapsed = Math.max(1, daysBetween(p.startDay, p.today) + 1);
  const actual = p.done / elapsed;
  const needed = remaining / Math.max(1, daysLeft + 1);
  const ratio = actual > 0 ? needed / actual : Infinity;
  const idle = daysBetween(p.lastActivityDay ?? p.startDay, p.today);
  const reasons: string[] = [];
  let level: RiskLevel = "baixo";
  const up = (l: RiskLevel) => {
    const order: RiskLevel[] = ["sem_dados", "baixo", "moderado", "alto"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
  };
  if (daysLeft < 0) (up("alto"), reasons.push(`Prazo vencido há ${-daysLeft} dia(s).`));
  if (p.overdueOpen >= 2) (up("alto"), reasons.push(`${p.overdueOpen} obrigações atrasadas.`));
  else if (p.overdueOpen === 1) (up("moderado"), reasons.push("1 obrigação atrasada."));
  if (elapsed >= 3 && daysLeft >= 0) {
    if (ratio >= 2 && daysLeft <= 14) (up("alto"), reasons.push("O ritmo necessário é mais que o dobro do ritmo atual."));
    else if (ratio >= 1.2) (up("moderado"), reasons.push("O ritmo necessário está acima do ritmo atual."));
  }
  if (idle >= 14) (up("alto"), reasons.push(`${idle} dias sem concluir nenhuma obrigação.`));
  else if (idle >= 7) (up("moderado"), reasons.push(`${idle} dias sem concluir nenhuma obrigação.`));
  if (daysLeft >= 0 && daysLeft <= 3 && remaining >= 2) (up("moderado"), reasons.push(`Reta final: ${remaining} obrigações em ${daysLeft + 1} dia(s).`));
  if (elapsed < 3 && p.done === 0 && reasons.length === 0) return { level: "sem_dados", reasons: ["Pacto recente: menos de 3 dias de histórico para medir o ritmo."] };
  const perWeek = (n: number) => (Math.round(n * 7 * 10) / 10).toLocaleString("pt-BR");
  reasons.push(`Ritmo atual: ${perWeek(actual)}/semana · necessário: ${perWeek(needed)}/semana.`);
  return { level, reasons };
}

/** Distribui N datas entre dois dias (inclusive), em ordem — usado no replanejamento. */
export function spreadDates(n: number, from: string, to: string): string[] {
  if (n <= 0) return [];
  const span = Math.max(0, daysBetween(from, to));
  return Array.from({ length: n }, (_, i) => shiftDayKey(from, n === 1 ? span : Math.round((span * (i + 1)) / n)));
}

interface PactTask {
  id: string;
  contractId: string;
  stageId: string | null;
  title: string;
  status: string;
  done: boolean;
  dueDate: string | null;
  doneDay: string | null;
  priority: string;
  difficulty: string | null;
}

async function loadTasks(db: Client, ownerId: string, tz: string, contractId?: string): Promise<PactTask[]> {
  const r = await db.execute({
    sql: `SELECT id, contract_id, contract_stage_id, title, status, due_date, completed_at, priority, difficulty FROM tasks
          WHERE owner_id = ? AND contract_id IS NOT NULL ${contractId ? "AND contract_id = ?" : ""}
          ORDER BY CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END, COALESCE(due_date, '9999'), created_at`,
    args: contractId ? [ownerId, contractId] : [ownerId],
  });
  return (r.rows as unknown as Row[]).map((t) => {
    const done = String(t.status) === "Concluído";
    return {
      id: String(t.id),
      contractId: String(t.contract_id),
      stageId: t.contract_stage_id == null ? null : String(t.contract_stage_id),
      title: String(t.title),
      status: String(t.status),
      done,
      dueDate: t.due_date == null ? null : String(t.due_date).slice(0, 10),
      doneDay: done && t.completed_at ? localDayOfStored(String(t.completed_at), tz) : null,
      priority: String(t.priority ?? "Média"),
      difficulty: t.difficulty == null ? null : String(t.difficulty),
    };
  });
}

interface StageView {
  id: string;
  contractId: string;
  position: number;
  name: string;
  objective: string | null;
  criterion: string | null;
  status: "pendente" | "ativa" | "concluida";
  completedAt: string | null;
  total: number;
  done: number;
}

async function loadStages(db: Client, ownerId: string, tasks: PactTask[], contractId?: string): Promise<StageView[]> {
  const r = await db.execute({
    sql: `SELECT * FROM contract_stages WHERE owner_id = ? ${contractId ? "AND contract_id = ?" : ""} ORDER BY contract_id, position, created_at`,
    args: contractId ? [ownerId, contractId] : [ownerId],
  });
  return (r.rows as unknown as Row[]).map((s) => {
    const mine = tasks.filter((t) => t.stageId === String(s.id));
    return {
      id: String(s.id),
      contractId: String(s.contract_id),
      position: Number(s.position ?? 0),
      name: String(s.name),
      objective: s.objective == null ? null : String(s.objective),
      criterion: s.criterion == null ? null : String(s.criterion),
      status: String(s.status) as StageView["status"],
      completedAt: s.completed_at == null ? null : String(s.completed_at),
      total: mine.length,
      done: mine.filter((t) => t.done).length,
    };
  });
}

function nextActionFor(phase: PactPhase, stages: StageView[], tasks: PactTask[]): string | null {
  if (phase === "rascunho") return "Revisar e ativar o rascunho.";
  if (phase === "pausado") return "Retomar o pacto quando estiver pronto.";
  if (phase === "pronto_selar") return "Selar o contrato e receber os selos merecidos.";
  if (phase === "cumprido" || phase === "arquivado" || phase === "cancelado") return null;
  const active = stages.find((s) => s.status === "ativa");
  const open = tasks.filter((t) => !t.done);
  const inStage = active ? open.find((t) => t.stageId === active.id) : undefined;
  const t = inStage ?? open[0];
  if (t) return `Concluir: ${t.title}`;
  if (active && active.total === 0) return `Conferir o critério da etapa “${active.name}” e concluí-la.`;
  return "Adicionar as obrigações do pacto.";
}

function pactCard(c: ContractView, stages: StageView[], tasks: PactTask[], seals: Array<{ code: SealCode }>, today: string, tz: string) {
  const stagesDone = stages.filter((s) => s.status === "concluida").length;
  const phase = pactPhase({ ...c, stagesDone });
  const doneDays = new Set(tasks.filter((t) => t.doneDay).map((t) => t.doneDay!));
  const last = [...doneDays].sort().at(-1) ?? null;
  const overdueOpen = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;
  const startDay = c.startDate ?? localDayOfStored(c.createdAt, tz);
  const risk = phase === "ativo" || phase === "em_andamento" ? pactRisk({ today, startDay, dueDate: c.dueDate, total: c.totalTasks, done: c.doneTasks, overdueOpen, lastActivityDay: last }) : null;
  return {
    ...c,
    phase,
    stages: stages.map((s) => ({ id: s.id, name: s.name, status: s.status, total: s.total, done: s.done })),
    stagesDone,
    streak: streakEndingToday(doneDays, today),
    bestStreak: bestStreak(doneDays),
    daysLeft: c.dueDate ? daysBetween(today, c.dueDate.slice(0, 10)) : null,
    overdueOpen,
    risk,
    seals: seals.map((s) => s.code),
    nextAction: nextActionFor(phase, stages, tasks),
  };
}

export type PactCard = ReturnType<typeof pactCard>;

export async function getGuildHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const [contracts, tasks, sealsR, rewards, goalsR, eventsR] = await Promise.all([
    listContracts(db, ownerId),
    loadTasks(db, ownerId, tz),
    db.execute({ sql: "SELECT contract_id, seal_code, contract_title, earned_at FROM contract_seals WHERE owner_id = ? ORDER BY earned_at DESC", args: [ownerId] }),
    getDifficultyRewards(db, ownerId),
    db.execute({
      sql: `SELECT g.id, g.title, g.due_date FROM goals g WHERE g.owner_id = ? AND g.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.owner_id = g.owner_id AND c.goal_id = g.id AND c.status != 'arquivado')
            ORDER BY g.due_date IS NULL, g.due_date LIMIT 3`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT e.contract_id, e.kind, e.detail, e.created_at, c.title FROM contract_events e JOIN contracts c ON c.id = e.contract_id WHERE e.owner_id = ? ORDER BY e.created_at DESC LIMIT 20", args: [ownerId] }),
  ]);
  const stages = await loadStages(db, ownerId, tasks);
  const seals = (sealsR.rows as unknown as Row[]).map((s) => ({ contractId: String(s.contract_id), code: String(s.seal_code) as SealCode, contractTitle: String(s.contract_title), earnedAt: String(s.earned_at) }));
  const cards = contracts.map((c) =>
    pactCard(
      c,
      stages.filter((s) => s.contractId === c.id),
      tasks.filter((t) => t.contractId === c.id),
      seals.filter((s) => s.contractId === c.id),
      today,
      tz,
    ),
  );
  const live = cards.filter((c) => c.phase === "ativo" || c.phase === "em_andamento" || c.phase === "pausado" || c.phase === "pronto_selar");
  const allDoneDays = new Set(tasks.filter((t) => t.doneDay).map((t) => t.doneDay!));
  const sealedCount = cards.filter((c) => c.sealedAt).length;
  const stagesDone = stages.filter((s) => s.status === "concluida").length;
  const tasksDone = tasks.filter((t) => t.done).length;
  const points = guildPoints({ sealed: sealedCount, seals: seals.length, stagesDone, tasksDone });
  const featured = cards.find((c) => c.featured && live.includes(c)) ?? [...live].filter((c) => c.phase !== "pausado").sort((a, b) => b.progressPct - a.progressPct)[0] ?? null;
  const ranked: RiskLevel[] = ["alto", "moderado", "baixo", "sem_dados"];
  const withRisk = live.filter((c) => c.risk);
  const worst = withRisk.sort((a, b) => ranked.indexOf(a.risk!.level) - ranked.indexOf(b.risk!.level))[0] ?? null;
  return {
    today,
    contracts: cards,
    indicators: {
      active: cards.filter((c) => c.phase === "ativo" || c.phase === "em_andamento").length,
      paused: cards.filter((c) => c.phase === "pausado").length,
      fulfilled: cards.filter((c) => c.phase === "cumprido" || c.phase === "pronto_selar").length,
      readyToSeal: cards.filter((c) => c.phase === "pronto_selar").length,
      openTasks: live.reduce((a, c) => a + (c.totalTasks - c.doneTasks), 0),
      xpEarned: cards.reduce((a, c) => a + c.earned.xp, 0),
      streak: streakEndingToday(allDoneDays, today),
      bestStreak: bestStreak(allDoneDays),
      seals: seals.length,
      sealKinds: new Set(seals.map((s) => s.code)).size,
    },
    reputation: { ...tierRank(GUILD_RANKS, points), breakdown: { sealed: sealedCount, seals: seals.length, stagesDone, tasksDone } },
    sealCatalog: SEALS.map((s) => ({ ...s, earned: seals.filter((x) => x.code === s.code).length })),
    sealHistory: seals.slice(0, 12),
    featured: featured ? { id: featured.id, auto: !featured.featured } : null,
    risk: worst ? { contractId: worst.id, title: worst.title, level: worst.risk!.level, reasons: worst.risk!.reasons } : null,
    rewards: {
      byDifficulty: (Object.keys(rewards) as DifficultyKey[]).map((d) => ({ difficulty: d, xp: rewards[d].contractXp, coins: rewards[d].contractCoins, taskXp: rewards[d].taskXp })),
      seal: GAMIFICATION_RULES.contract.seal,
      minTasks: GAMIFICATION_RULES.contract.minTasks,
    },
    suggestions: (goalsR.rows as unknown as Row[]).map((g) => ({ goalId: String(g.id), title: String(g.title), dueDate: g.due_date == null ? null : String(g.due_date).slice(0, 10) })),
    recentEvents: (eventsR.rows as unknown as Row[]).map((e) => ({ contractId: String(e.contract_id), title: String(e.title), kind: String(e.kind), detail: e.detail == null ? null : String(e.detail), at: String(e.created_at) })),
  };
}

export type GuildHub = Awaited<ReturnType<typeof getGuildHub>>;

export async function getPactDetail(db: Client, ownerId: string, id: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  await syncContractStages(db, ownerId, id).catch(() => undefined);
  const c = await getContract(db, ownerId, id);
  const [tasks, sealsR, eventsR] = await Promise.all([
    loadTasks(db, ownerId, tz, id),
    db.execute({ sql: "SELECT seal_code, earned_at FROM contract_seals WHERE owner_id = ? AND contract_id = ?", args: [ownerId, id] }),
    db.execute({ sql: "SELECT id, kind, detail, created_at FROM contract_events WHERE owner_id = ? AND contract_id = ? ORDER BY created_at DESC LIMIT 60", args: [ownerId, id] }),
  ]);
  const stages = await loadStages(db, ownerId, tasks, id);
  const seals = (sealsR.rows as unknown as Row[]).map((s) => ({ code: String(s.seal_code) as SealCode, earnedAt: String(s.earned_at) }));
  const card = pactCard(c, stages, tasks, seals, today, tz);
  const preview = card.phase === "pronto_selar" ? evaluateSeals({ category: c.category, difficulty: c.difficulty, dueDate: c.dueDate, tasks, stagesDone: stages.length }) : [];
  return {
    contract: card,
    stages: stages.map((s) => ({ ...s, tasks: tasks.filter((t) => t.stageId === s.id) })),
    unstagedTasks: tasks.filter((t) => !t.stageId || !stages.some((s) => s.id === t.stageId)),
    events: (eventsR.rows as unknown as Row[]).map((e) => ({ id: String(e.id), kind: String(e.kind), detail: e.detail == null ? null : String(e.detail), at: String(e.created_at) })),
    seals,
    sealPreview: preview.map((code) => SEALS.find((s) => s.code === code)!),
    sealRewardEach: GAMIFICATION_RULES.contract.seal,
    sealEligible: c.totalTasks >= GAMIFICATION_RULES.contract.minTasks,
    stageTemplate: STAGE_TEMPLATE,
  };
}

/* ─────────────────────────────── Ações ─────────────────────────────── */

export async function setPaused(db: Client, ownerId: string, id: string, pause: boolean) {
  const c = await getContract(db, ownerId, id);
  if (c.isDraft || c.status !== "ativo") throw new ContractError("Só contratos em andamento podem ser pausados.", 409);
  if (pause === !!c.pausedAt) return getContract(db, ownerId, id);
  await db.execute({ sql: `UPDATE contracts SET paused_at = ${pause ? "datetime('now')" : "NULL"}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  await logContractEvent(db, ownerId, id, pause ? "paused" : "resumed");
  return getContract(db, ownerId, id);
}

export async function cancelPact(db: Client, ownerId: string, id: string, reason: string | null) {
  const c = await getContract(db, ownerId, id);
  if (c.status === "arquivado") throw new ContractError("O contrato já está encerrado.", 409);
  if (c.sealedAt) throw new ContractError("Um contrato selado não pode ser cancelado — arquive se quiser tirá-lo da lista.", 409);
  await db.execute({ sql: "UPDATE contracts SET status = 'arquivado', cancelled_at = datetime('now'), paused_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  await logContractEvent(db, ownerId, id, "cancelled", reason);
  return getContract(db, ownerId, id);
}

export async function replanPact(db: Client, ownerId: string, id: string, input: { dueDate: string; spreadOverdue: boolean; reason?: string | null }) {
  const { today, tz } = await userDayContext(db, ownerId);
  const c = await getContract(db, ownerId, id);
  if (c.status !== "ativo" || c.isDraft) throw new ContractError("Só contratos em andamento podem ser replanejados.", 409);
  if (input.dueDate < today) throw new ContractError("O novo prazo precisa ser hoje ou depois.");
  const statements: Array<{ sql: string; args: Array<string | null> }> = [{ sql: "UPDATE contracts SET due_date = ?, paused_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [input.dueDate, id, ownerId] }];
  let moved = 0;
  if (input.spreadOverdue) {
    // Tarefas abertas atrasadas (ou além do novo prazo) são redistribuídas entre hoje e o novo prazo.
    const open = (await loadTasks(db, ownerId, tz, id)).filter((t) => !t.done && t.dueDate && (t.dueDate < today || t.dueDate > input.dueDate));
    const dates = spreadDates(open.length, today, input.dueDate);
    open.forEach((t, i) => statements.push({ sql: "UPDATE tasks SET due_date = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [dates[i]!, t.id, ownerId] }));
    moved = open.length;
  }
  await db.batch(statements, "write");
  await logContractEvent(db, ownerId, id, "replanned", `Novo prazo ${input.dueDate.split("-").reverse().join("/")}${moved ? ` · ${moved} obrigação(ões) redistribuída(s)` : ""}${input.reason ? ` · ${input.reason}` : ""}`);
  return { contract: await getContract(db, ownerId, id), moved };
}

export async function setFeatured(db: Client, ownerId: string, id: string, featured: boolean) {
  await getContract(db, ownerId, id);
  await db.batch(
    [
      ...(featured ? [{ sql: "UPDATE contracts SET featured = 0 WHERE owner_id = ? AND featured = 1", args: [ownerId] }] : []),
      { sql: "UPDATE contracts SET featured = ? WHERE id = ? AND owner_id = ?", args: [featured ? 1 : 0, id, ownerId] },
    ],
    "write",
  );
}

export async function saveStages(db: Client, ownerId: string, id: string, stages: Array<{ id?: string; name: string; objective?: string | null; criterion?: string | null }>) {
  const c = await getContract(db, ownerId, id);
  if (c.isDraft) throw new ContractError("No rascunho, edite as etapas pelo formulário.", 409);
  const current = await db.execute({ sql: "SELECT id FROM contract_stages WHERE owner_id = ? AND contract_id = ?", args: [ownerId, id] });
  const existing = new Set(current.rows.map((r) => String(r.id)));
  const keep = new Set(stages.map((s) => s.id).filter((x): x is string => !!x && existing.has(x)));
  const statements: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const old of existing) {
    if (keep.has(old)) continue;
    statements.push({ sql: "UPDATE tasks SET contract_stage_id = NULL WHERE contract_stage_id = ? AND owner_id = ?", args: [old, ownerId] });
    statements.push({ sql: "DELETE FROM contract_stages WHERE id = ? AND owner_id = ?", args: [old, ownerId] });
  }
  stages.slice(0, 10).forEach((s, i) => {
    const name = s.name.trim().slice(0, 80);
    const objective = s.objective?.trim().slice(0, 300) || null;
    const criterion = s.criterion?.trim().slice(0, 300) || null;
    if (s.id && keep.has(s.id)) statements.push({ sql: "UPDATE contract_stages SET name = ?, objective = ?, criterion = ?, position = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [name, objective, criterion, i, s.id, ownerId] });
    else statements.push({ sql: "INSERT INTO contract_stages (id, owner_id, contract_id, position, name, objective, criterion) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [nanoid(), ownerId, id, i, name, objective, criterion] });
  });
  if (statements.length) await db.batch(statements, "write");
  await syncContractStages(db, ownerId, id);
  await logContractEvent(db, ownerId, id, "stages_edited", `${stages.length} etapa(s) configurada(s).`);
}

export async function completeStage(db: Client, ownerId: string, id: string, stageId: string, done: boolean) {
  await getContract(db, ownerId, id);
  const r = await db.execute({
    sql: `SELECT s.name, s.status, (SELECT COUNT(*) FROM tasks t WHERE t.contract_stage_id = s.id AND t.owner_id = s.owner_id) AS total
          FROM contract_stages s WHERE s.id = ? AND s.contract_id = ? AND s.owner_id = ?`,
    args: [stageId, id, ownerId],
  });
  const s = r.rows[0];
  if (!s) throw new ContractError("Etapa não encontrada.", 404);
  if (Number(s.total ?? 0) > 0) throw new ContractError("Esta etapa tem tarefas: ela conclui sozinha quando todas forem concluídas.", 409);
  if (done === (String(s.status) === "concluida")) return;
  await db.execute({
    sql: `UPDATE contract_stages SET status = ?, completed_at = ${done ? "datetime('now')" : "NULL"}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
    args: [done ? "concluida" : "pendente", stageId, ownerId],
  });
  await logContractEvent(db, ownerId, id, done ? "stage_done" : "stage_reopened", String(s.name));
  await syncContractStages(db, ownerId, id);
}

export async function setTaskStage(db: Client, ownerId: string, id: string, taskId: string, stageId: string | null) {
  await getContract(db, ownerId, id);
  const t = await db.execute({ sql: "SELECT id FROM tasks WHERE id = ? AND owner_id = ? AND contract_id = ?", args: [taskId, ownerId, id] });
  if (!t.rows[0]) throw new ContractError("Tarefa não pertence a este contrato.", 404);
  if (stageId) {
    const s = await db.execute({ sql: "SELECT id FROM contract_stages WHERE id = ? AND owner_id = ? AND contract_id = ?", args: [stageId, ownerId, id] });
    if (!s.rows[0]) throw new ContractError("Etapa não encontrada.", 404);
  }
  await db.execute({ sql: "UPDATE tasks SET contract_stage_id = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [stageId, taskId, ownerId] });
  await syncContractStages(db, ownerId, id);
}

/**
 * Selar: só contratos com todas as obrigações concluídas. Fecha as etapas
 * restantes, confere os critérios dos selos e paga somente os selos novos
 * (UNIQUE em contract_seals + idempotência do ledger). O bônus do contrato já
 * foi creditado pelo motor oficial quando a última tarefa foi concluída.
 */
export async function sealPact(db: Client, ownerId: string, id: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const c = await getContract(db, ownerId, id);
  if (c.isDraft || c.status !== "concluido") throw new ContractError("Conclua todas as obrigações antes de selar o contrato.", 409);
  if (c.sealedAt) throw new ContractError("Este contrato já foi selado.", 409);
  await db.execute({ sql: "UPDATE contract_stages SET status = 'concluida', completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now') WHERE owner_id = ? AND contract_id = ? AND status != 'concluida'", args: [ownerId, id] });
  const tasks = await loadTasks(db, ownerId, tz, id);
  const stagesR = await db.execute({ sql: "SELECT COUNT(*) AS n FROM contract_stages WHERE owner_id = ? AND contract_id = ?", args: [ownerId, id] });
  const codes = evaluateSeals({ category: c.category, difficulty: c.difficulty, dueDate: c.dueDate, tasks, stagesDone: Number(stagesR.rows[0]?.n ?? 0) });
  const eligible = c.totalTasks >= GAMIFICATION_RULES.contract.minTasks;
  const R = GAMIFICATION_RULES.contract.seal;
  const granted: Array<{ code: SealCode; name: string; xp: number; coins: number }> = [];
  for (const code of codes) {
    const ins = await db.execute({ sql: "INSERT OR IGNORE INTO contract_seals (owner_id, contract_id, seal_code, contract_title) VALUES (?, ?, ?, ?)", args: [ownerId, id, code, c.title] });
    const seal = SEALS.find((s) => s.code === code)!;
    let paid = false;
    if (ins.rowsAffected > 0 && eligible) {
      paid = await award(db, ownerId, { sourceType: "contract", sourceId: id, eventType: `seal:${code}`, xp: R.xp, coins: R.coins, label: `${seal.name} — ${c.title}` }, today);
    }
    if (ins.rowsAffected > 0) granted.push({ code, name: seal.name, xp: paid ? R.xp : 0, coins: paid ? R.coins : 0 });
  }
  await db.execute({ sql: "UPDATE contracts SET sealed_at = datetime('now'), paused_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  await logContractEvent(db, ownerId, id, "sealed", granted.length ? `Selos: ${granted.map((g) => g.name).join(", ")}` : "Selado sem selos novos.");
  return { contract: await getContract(db, ownerId, id), seals: granted, eligible };
}

/* ─────────────────────────── Escriba dos Pactos (IA) ─────────────────────────── */

export interface PactProposal extends Omit<ContractProposal, "goal" | "project" | "tasks"> {
  category: string | null;
  priority: "Baixa" | "Média" | "Alta";
  successCriteria: string[];
  stages: Array<{ name: string; objective: string | null; criterion: string | null; tasks: Array<ContractProposal["tasks"][number] & { dependsOn: string | null }> }>;
}

export interface ProposePactInput {
  goal: string;
  why?: string;
  category?: string;
  difficulty?: DifficultyKey;
  startInDays?: number;
  deadlineDays?: number;
  weeklyHours?: number;
  stageCount?: number;
}

const CATEGORIES = ["estudos", "saude", "trabalho", "financas", "habitos", "leitura", "criatividade", "relacionamentos", "casa", "outro"];
const TASK_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    priority: { type: "STRING", enum: ["Baixa", "Média", "Alta"] },
    difficulty: { type: "STRING", enum: ["facil", "medio", "dificil", "epico"] },
    startInDays: { type: "INTEGER" },
    dueInDays: { type: "INTEGER" },
    estimateMinutes: { type: "INTEGER" },
    dependsOn: { type: "STRING" },
  },
  required: ["title", "description", "priority", "difficulty", "startInDays", "dueInDays", "estimateMinutes", "dependsOn"],
} as const;

/** Normaliza a proposta do Escriba (exportada para teste): respeita a vigência pedida e limita tamanhos. */
export function sanitizePactProposal(json: Record<string, unknown> | null, input: Pick<ProposePactInput, "difficulty" | "weeklyHours">, opts: { startIn: number; deadline: number | null }): { ok: true; data: PactProposal } | { ok: false; message: string } {
  const title = json ? str(json.title, 160) : null;
  if (!json || !title) return { ok: false, message: "O Escriba não devolveu um pacto válido. Descreva o objetivo de outra forma." };
  const difficulty = isDifficulty(json.difficulty) ? json.difficulty : input.difficulty ?? "medio";
  const aiDue = typeof json.dueInDays === "number" && Number.isFinite(json.dueInDays) ? Math.min(365, Math.max(1, Math.round(json.dueInDays))) : null;
  const dueInDays = opts.deadline ?? aiDue;
  const startInDays = Math.min(opts.startIn, dueInDays ?? opts.startIn);
  const rawStages = Array.isArray(json.stages) ? (json.stages as unknown[]).slice(0, 6) : [];
  let taskBudget = 30;
  const stages = rawStages
    .map((st) => {
      const o = (st && typeof st === "object" ? st : {}) as Record<string, unknown>;
      const name = str(o.name, 80);
      if (!name) return null;
      const rawTasks = Array.isArray(o.tasks) ? (o.tasks as unknown[]) : [];
      // Dependência por título (a sanitização pode descartar itens, então não dá para casar por índice).
      const deps = new Map<string, string | null>();
      for (const rt of rawTasks) {
        const ro = (rt && typeof rt === "object" ? rt : {}) as Record<string, unknown>;
        const tt = str(ro.title, 200);
        if (tt) deps.set(tt, str(ro.dependsOn, 200));
      }
      const tasks = sanitizeTasks(rawTasks, difficulty, Math.max(0, Math.min(8, taskBudget))).map((t) => {
        const due = t.dueInDays === null ? dueInDays : Math.max(startInDays, dueInDays === null ? t.dueInDays : Math.min(t.dueInDays, dueInDays));
        const start = t.startInDays === null ? null : Math.max(startInDays, Math.min(t.startInDays, due ?? t.startInDays));
        const dep = deps.get(t.title) ?? null;
        return { ...t, startInDays: start, dueInDays: due, dependsOn: dep && dep.toLowerCase() !== "nenhuma" ? dep : null };
      });
      taskBudget -= tasks.length;
      return { name, objective: str(o.objective, 300), criterion: str(o.criterion, 300), tasks };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  if (stages.length === 0 || stages.every((s) => s.tasks.length === 0)) return { ok: false, message: "O Escriba não sugeriu etapas utilizáveis. Tente novamente." };
  const hours = typeof json.weeklyHours === "number" && Number.isFinite(json.weeklyHours) ? Math.min(80, Math.max(1, Math.round(json.weeklyHours))) : null;
  const criteria = Array.isArray(json.successCriteria) ? (json.successCriteria as unknown[]).map((x) => str(x, 200)).filter((x): x is string => !!x).slice(0, 6) : [];
  const priority = ["Baixa", "Média", "Alta"].includes(String(json.priority)) ? (String(json.priority) as PactProposal["priority"]) : "Média";
  return {
    ok: true,
    data: {
      title,
      description: str(json.description, 600),
      objective: str(json.objective, 400),
      difficulty,
      startInDays,
      dueInDays,
      weeklyHours: input.weeklyHours ?? hours,
      why: str(json.why, 400),
      rewardText: str(json.rewardText, 200),
      stakes: str(json.stakes, 200),
      category: CATEGORIES.includes(String(json.category)) ? String(json.category) : null,
      priority,
      successCriteria: criteria,
      stages,
    },
  };
}

/** O Escriba dos Pactos propõe etapas, tarefas, prazos, dependências e critérios. Nada é salvo. */
export async function proposePact(db: Client, ownerId: string, input: ProposePactInput): Promise<{ ok: true; data: PactProposal } | { ok: false; message: string }> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "A IA do LifeOS ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini." };
  const { today } = await userDayContext(db, ownerId);
  const [open, active] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE owner_id = ? AND status != 'Concluído'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM contracts WHERE owner_id = ? AND status = 'ativo' AND is_draft = 0", args: [ownerId] }),
  ]);
  const startIn = Math.max(0, input.startInDays ?? 0);
  const deadline = input.deadlineDays ?? null;
  const stageCount = Math.min(5, Math.max(3, input.stageCount ?? 4));
  const prompt = `Você é o Escriba dos Pactos do LifeOS. Redija um CONTRATO pessoal em ETAPAS: um pacto verificável que o usuário firma consigo mesmo.

DADOS REAIS (use exatamente, não invente outros):
- Hoje é ${today}. Todas as datas da resposta são em DIAS A PARTIR DE HOJE.
- O usuário tem ${Number(open.rows[0]?.n ?? 0)} tarefas abertas e ${Number(active.rows[0]?.n ?? 0)} contratos ativos.

PEDIDO:
- Objetivo: """${input.goal.slice(0, 1200)}"""
${input.why ? `- Por que importa: """${input.why.slice(0, 600)}"""\n` : ""}${input.category ? `- Categoria: ${input.category}\n` : ""}- Vigência: começa em startInDays=${startIn}${deadline ? ` e termina em dueInDays=${deadline}` : "; estime um prazo realista em dueInDays"}.
${input.weeklyHours ? `- Dedicação: ${input.weeklyHours} h por semana. Dimensione as tarefas por isso.\n` : ""}${input.difficulty ? `- Dificuldade desejada: ${input.difficulty}.\n` : ""}
${DIFFICULTY_GUIDE}

COMO REDIGIR:
1. ${stageCount} etapas em ordem (ex.: Planejar, Iniciar, Manter, Consolidar, Selar), cada uma com objective (1 frase) e criterion (como saber que a etapa terminou).
2. Cada etapa com 1 a 4 tarefas executáveis (no total, no máximo 20). Títulos com verbo no infinitivo, descrição com o critério de pronto, datas dentro da vigência e em sequência lógica.
3. dependsOn: o título EXATO de uma tarefa anterior da qual esta depende, ou "nenhuma".
4. successCriteria: 2 a 4 critérios verificáveis de sucesso do pacto inteiro.
5. category: uma de ${CATEGORIES.join(", ")}. priority: Baixa, Média ou Alta.
6. why, rewardText (recompensa pessoal saudável, nada de comida ou gastos altos) e stakes (consequência construtiva, nunca punição).
Tom direto e sério. Sem promessas de resultado. Português do Brasil.`;
  const result = await generateText(prompt, config, {
    timeoutMs: 45_000,
    retries: 1,
    maxOutputTokens: 6144,
    responseSchema: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        objective: { type: "STRING" },
        why: { type: "STRING" },
        rewardText: { type: "STRING" },
        stakes: { type: "STRING" },
        category: { type: "STRING", enum: CATEGORIES },
        priority: { type: "STRING", enum: ["Baixa", "Média", "Alta"] },
        difficulty: { type: "STRING", enum: ["facil", "medio", "dificil", "epico"] },
        startInDays: { type: "INTEGER" },
        dueInDays: { type: "INTEGER" },
        weeklyHours: { type: "INTEGER" },
        successCriteria: { type: "ARRAY", items: { type: "STRING" } },
        stages: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { name: { type: "STRING" }, objective: { type: "STRING" }, criterion: { type: "STRING" }, tasks: { type: "ARRAY", items: TASK_SCHEMA } }, required: ["name", "objective", "criterion", "tasks"] },
        },
      },
      required: ["title", "description", "objective", "why", "rewardText", "stakes", "category", "priority", "difficulty", "startInDays", "dueInDays", "weeklyHours", "successCriteria", "stages"],
    },
  });
  if (!result.ok) return { ok: false, message: result.message };
  return sanitizePactProposal(extractJson(result.text) as Record<string, unknown> | null, input, { startIn, deadline });
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

/** B · Lembretes: contratos com prazo dentro da janela (do contrato ou da automação). */
export async function runPactReminders(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getGuildHub(db, ownerId);
  const fallback = Math.min(14, Math.max(1, Number(config.days ?? 3)));
  const due = hub.contracts.filter((c) => (c.phase === "ativo" || c.phase === "em_andamento") && c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= (c.reminderDays ?? fallback));
  if (!due.length) return { status: "skipped", summary: "Nenhum prazo de contrato próximo." };
  const body = due.slice(0, 3).map((c) => `${c.title} (${c.daysLeft === 0 ? "vence hoje" : `${c.daysLeft} dia(s)`}, ${c.totalTasks - c.doneTasks} aberta(s))`).join(" · ");
  await notifyFromAutomation(db, ownerId, { eventType: "contract_reminder", title: "📜 Prazos de contratos", body, url: "/contratos", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${due.length} contrato(s) com prazo próximo.` };
}

/** C · Replanejamento: avisa quando um pacto está em risco alto (o replanejamento é sempre feito pelo usuário). */
export async function runPactReplan(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getGuildHub(db, ownerId);
  const high = hub.contracts.filter((c) => c.risk?.level === "alto");
  if (!high.length) return { status: "skipped", summary: "Nenhum contrato em risco alto." };
  await notifyFromAutomation(db, ownerId, {
    eventType: "contract_replan",
    title: "⚠️ Pacto em risco de quebra",
    body: `${high.map((c) => c.title).slice(0, 3).join(", ")} — revise o prazo em “Replanejar”. Nada é alterado sem você.`,
    url: "/contratos",
    inApp: config.inApp !== false,
    push: config.push === true,
  });
  return { status: "ok", summary: `${high.length} contrato(s) com sugestão de replanejamento.` };
}

/** E · Selamento: lembra contratos prontos para selar (selar exige confirmação do usuário). */
export async function runPactSealReady(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getGuildHub(db, ownerId);
  const ready = hub.contracts.filter((c) => c.phase === "pronto_selar");
  if (!ready.length) return { status: "skipped", summary: "Nenhum contrato pronto para selar." };
  await notifyFromAutomation(db, ownerId, { eventType: "contract_seal_ready", title: "🔏 Pronto para selar", body: `${ready.map((c) => c.title).slice(0, 3).join(", ")} — confirme o selamento na Guilda.`, url: "/contratos", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${ready.length} contrato(s) aguardando selamento.` };
}
