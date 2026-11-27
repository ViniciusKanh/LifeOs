import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { notifyFromAutomation } from "./automationService.js";
import { tierRank } from "./planningHubService.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";

/**
 * Laboratório da Jornada 2.0 — camada derivada sobre personal_experiments e
 * personal_experiment_logs. Nada aqui concede XP (as recompensas seguem nas
 * rotas de origem, idempotentes). (O Diário da Jornada foi removido do LifeOS.)
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export class ChronicleError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}


// ============================================================
// LABORATÓRIO
// ============================================================

export const RESEARCHER_RANKS = [
  { min: 0, title: "Aprendiz Alquimista" },
  { min: 60, title: "Observador" },
  { min: 200, title: "Investigador" },
  { min: 500, title: "Cientista da Rotina" },
  { min: 1200, title: "Mestre da Experimentação" },
] as const;

/**
 * Pontos do Pesquisador: reconhecem MÉTODO, não resultado — 3 por dia com
 * observação registrada, 5 por hipótese escrita, 40 por experimento concluído
 * com conclusão documentada (apoiado, não apoiado ou inconclusivo valem igual)
 * e 15 por experimento interrompido com justificativa.
 */
export function researcherPoints(p: { logDays: number; hypotheses: number; documented: number; stoppedDocumented: number }) {
  return p.logDays * 3 + p.hypotheses * 5 + p.documented * 40 + p.stoppedDocumented * 15;
}

export type CycleStage = "ideia" | "hipotese" | "planejamento" | "execucao" | "coleta" | "analise" | "conclusao";
export const CYCLE: CycleStage[] = ["ideia", "hipotese", "planejamento", "execucao", "coleta", "analise", "conclusao"];

/** Etapa atual do ciclo, derivada do estado real do experimento. */
export function cycleStage(e: { status: string; hypothesis: string | null; startDate: string; endDate: string; logs: number; conclusion: string | null }, today: string): CycleStage {
  if (e.status === "completed" && e.conclusion) return "conclusao";
  if (e.status === "completed" || e.status === "cancelled" || (e.status === "active" && today > e.endDate)) return "analise";
  if (e.status === "active" || e.status === "paused") return e.logs > 0 ? "coleta" : "execucao";
  if (!e.hypothesis) return "ideia";
  return e.startDate && e.endDate ? "planejamento" : "hipotese";
}

export type DiscoveryVerdict = "apoiada" | "nao_apoiada" | "inconclusiva" | "interrompida";

/** Veredito da descoberta: usa a percepção registrada pelo usuário (nunca "comprovado"). */
export function discoveryVerdict(e: { status: string; perceivedResult: string | null }): DiscoveryVerdict {
  if (e.status === "cancelled") return "interrompida";
  if (e.perceivedResult === "improved") return "apoiada";
  if (e.perceivedResult === "worsened") return "nao_apoiada";
  return "inconclusiva";
}

export async function getLabHub(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [expR, logsR, logDaysR, xpR, changesR] = await Promise.all([
    db.execute({ sql: "SELECT * FROM personal_experiments WHERE owner_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, end_date", args: [ownerId] }),
    db.execute({ sql: "SELECT experiment_id, COUNT(*) AS n, SUM(CASE WHEN checkin_status = 'done' THEN 1 ELSE 0 END) AS done, MAX(log_date) AS last FROM personal_experiment_logs WHERE owner_id = ? GROUP BY experiment_id", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(DISTINCT log_date) AS n FROM personal_experiment_logs WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'experiment'", args: [ownerId] }),
    db.execute({ sql: "SELECT experiment_id, field, old_value, new_value, after_start, created_at FROM experiment_protocol_changes WHERE owner_id = ? ORDER BY created_at DESC LIMIT 40", args: [ownerId] }),
  ]);
  const logsBy = new Map((logsR.rows as unknown as Row[]).map((r) => [String(r.experiment_id), { n: Number(r.n), done: Number(r.done ?? 0), last: r.last ? String(r.last) : null }]));
  const exps = (expR.rows as unknown as Row[]).map((e) => {
    const logs = logsBy.get(String(e.id)) ?? { n: 0, done: 0, last: null };
    const start = String(e.start_date);
    const end = String(e.end_date);
    const totalDays = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
    const elapsed = Math.max(0, Math.min(totalDays, Math.round((Date.parse(`${(today < end ? today : end)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1));
    const view = {
      id: String(e.id),
      title: String(e.title),
      emoji: e.emoji ? String(e.emoji) : null,
      category: String(e.category),
      hypothesis: e.hypothesis ? String(e.hypothesis) : null,
      motivation: e.motivation ? String(e.motivation) : null,
      status: String(e.status),
      startDate: start,
      endDate: end,
      primaryMetric: String(e.primary_metric),
      successCriteria: String(e.success_criteria_type),
      goalId: e.goal_id ? String(e.goal_id) : null,
      conclusion: e.personal_conclusion ? String(e.personal_conclusion) : null,
      perceivedResult: e.perceived_result ? String(e.perceived_result) : null,
      worthContinuing: e.worth_continuing ? String(e.worth_continuing) : null,
      totalDays,
      // Dias decorridos ≠ dias cumpridos: os dois aparecem separados.
      elapsedDays: e.status === "draft" ? 0 : elapsed,
      loggedDays: logs.n,
      doneDays: logs.done,
      lastLog: logs.last,
      adherencePct: elapsed > 0 && e.status !== "draft" ? Math.round((logs.done / elapsed) * 100) : null,
      missingDays: e.status === "active" && elapsed > 0 ? Math.max(0, elapsed - logs.n) : 0,
      stage: "ideia" as CycleStage,
      verdict: null as DiscoveryVerdict | null,
      nextAction: "",
    };
    view.stage = cycleStage({ status: view.status, hypothesis: view.hypothesis, startDate: start, endDate: end, logs: logs.n, conclusion: view.conclusion }, today);
    if (view.status === "completed" || view.status === "cancelled") view.verdict = discoveryVerdict(view);
    view.nextAction =
      view.status === "draft"
        ? "Revisar o protocolo e iniciar"
        : view.status === "paused"
          ? "Retomar quando estiver pronto"
          : view.stage === "analise" && view.status === "active"
            ? "Período terminou — analisar e concluir"
            : view.status === "active"
              ? view.lastLog === today
                ? "Observação de hoje registrada"
                : "Registrar a observação de hoje"
              : view.conclusion
                ? "Descoberta documentada"
                : "Documentar a conclusão";
    return view;
  });

  const documented = exps.filter((e) => e.status === "completed" && e.conclusion).length;
  const stoppedDocumented = exps.filter((e) => e.status === "cancelled" && e.conclusion).length;
  const hypotheses = exps.filter((e) => e.hypothesis).length;
  const logDays = Number(logDaysR.rows[0]?.n ?? 0);
  const active = exps.filter((e) => e.status === "active");
  const consistency = active.length ? Math.round(active.reduce((a, e) => a + (e.adherencePct ?? 0), 0) / active.length) : null;

  // Taxa de sucesso: só entre concluídos com critério de sucesso definido E veredito registrado (mín. 3).
  const withCriteria = exps.filter((e) => e.status === "completed" && e.successCriteria !== "none" && e.perceivedResult);
  const successRate = withCriteria.length >= 3 ? Math.round((withCriteria.filter((e) => e.perceivedResult === "improved").length / withCriteria.length) * 100) : null;

  const featured = active.sort((a, b) => a.endDate.localeCompare(b.endDate))[0] ?? exps.find((e) => e.status === "paused") ?? exps.find((e) => e.status === "draft") ?? null;

  return {
    today,
    rank: tierRank(RESEARCHER_RANKS, researcherPoints({ logDays, hypotheses, documented, stoppedDocumented })),
    rankBreakdown: { logDays, hypotheses, documented, stoppedDocumented },
    indicators: {
      active: active.length,
      completed: exps.filter((e) => e.status === "completed").length,
      inAnalysis: exps.filter((e) => e.stage === "analise").length,
      paused: exps.filter((e) => e.status === "paused").length,
      hypotheses,
      discoveries: documented + stoppedDocumented,
      xp: Number(xpR.rows[0]?.xp ?? 0),
      consistencyPct: consistency,
      successRatePct: successRate,
      successRateBase: withCriteria.length,
    },
    featured,
    experiments: exps,
    discoveries: exps.filter((e) => e.verdict).map((e) => ({ id: e.id, title: e.title, emoji: e.emoji, verdict: e.verdict!, conclusion: e.conclusion, endDate: e.endDate, worthContinuing: e.worthContinuing })),
    protocolChanges: (changesR.rows as unknown as Row[]).map((c) => ({
      experimentId: String(c.experiment_id),
      field: String(c.field),
      oldValue: c.old_value == null ? null : String(c.old_value),
      newValue: c.new_value == null ? null : String(c.new_value),
      afterStart: Number(c.after_start) === 1,
      createdAt: String(c.created_at),
    })),
  };
}

const TRACKED_FIELDS: Array<[string, string]> = [
  ["hypothesis", "Hipótese"],
  ["primary_metric", "Métrica principal"],
  ["secondary_metrics_json", "Métricas secundárias"],
  ["success_criteria_type", "Critério de sucesso"],
  ["success_criteria_value", "Valor do critério"],
  ["start_date", "Início"],
  ["end_date", "Término"],
  ["verification_rule", "Regra de verificação"],
  ["verification_config_json", "Configuração da verificação"],
];

/** Snapshot dos campos de protocolo (antes de um PATCH). */
export async function protocolSnapshot(db: Client, ownerId: string, id: string): Promise<Row | null> {
  const r = await db.execute({ sql: `SELECT status, ${TRACKED_FIELDS.map(([f]) => f).join(", ")} FROM personal_experiments WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
  return (r.rows[0] as unknown as Row | undefined) ?? null;
}

/** Registra cada campo de protocolo alterado (comparando com o snapshot anterior). */
export async function recordProtocolChanges(db: Client, ownerId: string, id: string, before: Row | null) {
  if (!before) return 0;
  const after = await protocolSnapshot(db, ownerId, id);
  if (!after) return 0;
  const started = String(before.status) !== "draft";
  const stmts = TRACKED_FIELDS.filter(([f]) => String(before[f] ?? "") !== String(after[f] ?? "")).map(([f, label]) => ({
    sql: "INSERT INTO experiment_protocol_changes (id, owner_id, experiment_id, field, old_value, new_value, after_start) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [nanoid(), ownerId, id, label, before[f] == null ? null : String(before[f]).slice(0, 500), after[f] == null ? null : String(after[f]).slice(0, 500), started ? 1 : 0],
  }));
  if (stmts.length) await db.batch(stmts, "write");
  return stmts.length;
}

export async function setExperimentGoal(db: Client, ownerId: string, id: string, goalId: string | null) {
  if (goalId) {
    const g = await db.execute({ sql: "SELECT 1 FROM goals WHERE id = ? AND owner_id = ?", args: [goalId, ownerId] });
    if (!g.rows[0]) throw new ChronicleError("Meta não encontrada.", 404);
  }
  const r = await db.execute({ sql: "UPDATE personal_experiments SET goal_id = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [goalId, id, ownerId] });
  if (r.rowsAffected === 0) throw new ChronicleError("Experimento não encontrado.", 404);
}

/** Exportação dos dados brutos + conclusões (CSV simples). */
export async function exportExperimentCsv(db: Client, ownerId: string, id: string) {
  const e = await db.execute({ sql: "SELECT title, hypothesis, start_date, end_date, primary_metric, personal_conclusion, perceived_result FROM personal_experiments WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = e.rows[0] as unknown as Row | undefined;
  if (!row) throw new ChronicleError("Experimento não encontrado.", 404);
  const logs = await db.execute({ sql: "SELECT log_date, checkin_status, perception, notes FROM personal_experiment_logs WHERE owner_id = ? AND experiment_id = ? ORDER BY log_date", args: [ownerId, id] });
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    `# ${String(row.title)}`,
    `# Hipótese: ${String(row.hypothesis ?? "")}`,
    `# Período: ${String(row.start_date)} a ${String(row.end_date)} · métrica: ${String(row.primary_metric)}`,
    `# Conclusão: ${String(row.personal_conclusion ?? "")} (${String(row.perceived_result ?? "sem veredito")})`,
    "data,checkin,percepcao,notas",
    ...(logs.rows as unknown as Row[]).map((l) => [l.log_date, l.checkin_status, l.perception, l.notes].map(q).join(",")),
  ];
  return lines.join("\n");
}

// ---------------- Automações do Laboratório ----------------

export async function runLabCheckin(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const r = await db.execute({
    sql: `SELECT e.title FROM personal_experiments e WHERE e.owner_id = ? AND e.status = 'active' AND e.start_date <= ? AND e.end_date >= ?
          AND NOT EXISTS (SELECT 1 FROM personal_experiment_logs l WHERE l.experiment_id = e.id AND l.log_date = ?)`,
    args: [ownerId, today, today, shiftDayKey(today, -1)],
  });
  if (r.rows.length === 0) return { status: "skipped", summary: "Todos os experimentos ativos têm observação de ontem." };
  const body = `${r.rows.length} experimento(s) sem observação ontem: ${r.rows.map((x) => String(x.title)).slice(0, 3).join(", ")}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "lab_checkin", title: "Laboratório: check-in", body, url: "/experimentos", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export async function runLabMissingData(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getLabHub(db, ownerId);
  const gaps = hub.experiments.filter((e) => e.status === "active" && e.missingDays >= Number(config.gapDays ?? 3));
  if (gaps.length === 0) return { status: "skipped", summary: "Sem lacunas relevantes de coleta." };
  const body = gaps.map((g) => `${g.title}: ${g.missingDays} dia(s) sem registro`).slice(0, 3).join(" · ");
  await notifyFromAutomation(db, ownerId, { eventType: "lab_missing", title: "Dados ausentes no Laboratório", body, url: "/experimentos?aba=resultados", inApp: config.inApp !== false, push: false });
  return { status: "ok", summary: body };
}

export async function runLabCycleEnd(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const r = await db.execute({ sql: "SELECT title FROM personal_experiments WHERE owner_id = ? AND status = 'active' AND end_date < ?", args: [ownerId, today] });
  if (r.rows.length === 0) return { status: "skipped", summary: "Nenhum ciclo encerrado aguardando análise." };
  const body = `Período encerrado: ${r.rows.map((x) => String(x.title)).slice(0, 3).join(", ")}. Revise os resultados e documente a conclusão.`;
  await notifyFromAutomation(db, ownerId, { eventType: "lab_cycle_end", title: "Ciclo de experimento encerrado", body, url: "/experimentos?aba=resultados", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

// ---------------- IA Cientista (proposta → revisão → criação pelo assistente) ----------------

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    hypothesis: { type: "string" },
    motivation: { type: "string" },
    durationDays: { type: "number" },
    primaryMetric: { type: "string" },
    protocol: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["title", "hypothesis", "durationDays", "primaryMetric"],
};

/** Explica um resultado/gráfico ou dados ausentes, só com os números enviados (análise do servidor). */
export async function explainLabResult(facts: string[], question: string | undefined) {
  const config = await getGeminiConfig();
  const base = { ai: false, text: facts.join("\n") };
  if (!config || facts.length === 0) return base;
  const prompt = `Você é a IA Cientista do LifeOS. Explique em português do Brasil, em até 6 frases simples, os fatos abaixo de um experimento pessoal.
Regras: diferencie correlação de causalidade; com poucos dias diga que a amostra é pequena; não invente números nem significância estatística; não use "comprovado"; cite limitações (ex.: fatores de confusão, observações repetidas não independentes).
FATOS:
${facts.join("\n").slice(0, 4000)}
${question ? `PERGUNTA: ${str(question, 300)}` : ""}`;
  const r = await generateText(prompt, config, { timeoutMs: 20_000, retries: 1, maxOutputTokens: 700 });
  return r.ok && r.text.trim() ? { ai: true, text: r.text.trim().slice(0, 3000) } : base;
}

export { SCHEMA as SCIENTIST_SCHEMA, extractJson };
