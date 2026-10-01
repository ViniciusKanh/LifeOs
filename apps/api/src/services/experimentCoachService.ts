import { nanoid } from "nanoid";
import type { getDb } from "../db/client.js";
import { getGeminiConfig, generateText } from "./geminiService.js";
import { extractJson, str } from "./aiJson.js";
import { METRIC_CATALOG, METRIC_KEYS, getDailySeries, type ExperimentMetricKey } from "./experimentMetricsService.js";
import { VERIFICATION_RULES, type VerificationRule } from "./experimentVerificationService.js";
import { CATEGORY_LABEL, ExperimentError, getExperimentDetail, type ExperimentCategory } from "./experimentService.js";
import { getExperimentAnalysis } from "./experimentAnalysisService.js";
import { describe, recommendedDuration } from "./experimentStats.js";

type Db = ReturnType<typeof getDb>;

/**
 * LifeOS Copilot nos Experimentos Pessoais — três usos:
 *  1. Desenhar experimentos a partir de um objetivo em texto livre.
 *  2. Ler o check-in do dia escrito em linguagem natural.
 *  3. Gerar insights do experimento (salvos em experiment_ai_reports).
 *
 * Regras de segurança/honestidade (valem para todos):
 *  - o modelo recebe só agregados reais já calculados (nunca registros brutos
 *    de outros módulos nem dados de outras pessoas);
 *  - toda resposta é validada contra os catálogos do servidor (métricas,
 *    regras de verificação, categorias) — chave inventada é descartada;
 *  - números exibidos ao lado das propostas (média atual, dias com dado,
 *    duração recomendada) são calculados aqui, não pelo modelo;
 *  - nada é criado ou salvo sem o usuário confirmar na interface.
 */

const NO_AI = "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações.";

const SAFETY = [
  "Use SOMENTE os dados fornecidos. Nunca invente números, registros, hábitos ou eventos.",
  "Nunca afirme causalidade; fale em associação, tendência ou observação.",
  "Nunca dê diagnóstico médico ou orientação clínica. Para saúde, sugira apenas mudanças de rotina leves e seguras.",
  "Se os dados forem insuficientes, diga isso claramente.",
  "Responda em português do Brasil, com frases curtas e diretas.",
].map((r) => `- ${r}`).join("\n");

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExperimentCategory[];
const fmt = (v: number | null, digits = 1) => (v === null ? "sem dado" : (Math.round(v * 10 ** digits) / 10 ** digits).toString());

/* ============================================================
   1) Desenhar experimentos a partir de um objetivo
   ============================================================ */

export interface ExperimentProposal {
  title: string;
  category: ExperimentCategory;
  hypothesis: string;
  rationale: string;
  dailyAction: string;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics: ExperimentMetricKey[];
  durationDays: number;
  linkedHabitId: string | null;
  verificationType: "automatic" | "manual";
  verificationRule: VerificationRule | null;
  verificationConfig: Record<string, unknown> | null;
  successCriteriaType: "consistency" | "metric_change" | "none";
  successCriteriaValue: number | null;
  /** Calculado pelo servidor a partir dos registros reais — não vem da IA. */
  baseline: { mean: number | null; daysWithData: number; unit: string | null; recommendedDurationDays: number | null };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Valida a configuração da regra automática dentro de limites razoáveis; null = regra inutilizável. */
function sanitizeRuleConfig(rule: VerificationRule, raw: Record<string, unknown> | null): Record<string, unknown> | null {
  const c = raw ?? {};
  switch (rule) {
    case "sleep_before": {
      const t = typeof c.beforeTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.beforeTime) ? c.beforeTime : "23:00";
      return { beforeTime: t };
    }
    case "water_target":
      return { targetMl: clampInt(c.targetMl, 500, 6000, 2500) };
    case "focus_minimum":
      return { minMinutes: clampInt(c.minMinutes, 5, 480, 50) };
    case "reading_pages_minimum":
      return { minPages: clampInt(c.minPages, 1, 300, 20) };
    case "exercise_minimum":
      return { minMinutes: clampInt(c.minMinutes, 5, 300, 30) };
    case "study_minimum":
      return { minMinutes: clampInt(c.minMinutes, 5, 600, 60) };
    case "habit_completion":
      return {};
    default:
      return null;
  }
}

async function metricContext(db: Db, ownerId: string) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const keys = METRIC_KEYS.filter((k) => !METRIC_CATALOG[k].requiresHabit);
  const rows = await Promise.all(
    keys.map(async (key) => {
      const s = await getDailySeries(db, ownerId, key, from, to, null);
      const d = describe(s.values.filter((p) => p.value !== null).map((p) => p.value as number));
      return { key, label: METRIC_CATALOG[key].label, unit: METRIC_CATALOG[key].unit, mean: d.mean, sd: d.sd, daysWithData: s.daysWithData };
    })
  );
  return new Map(rows.map((r) => [r.key, r]));
}

export async function designExperiments(db: Db, ownerId: string, goal: string, constraints?: string | null) {
  const config = await getGeminiConfig();
  if (!config) return { ok: false as const, message: NO_AI };

  const [metrics, habitsRes, activeRes, pastRes] = await Promise.all([
    metricContext(db, ownerId),
    db.execute({ sql: "SELECT id, name FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 20", args: [ownerId] }),
    db.execute({ sql: "SELECT title, primary_metric FROM personal_experiments WHERE owner_id = ? AND status IN ('active', 'paused')", args: [ownerId] }),
    db.execute({
      sql: "SELECT title, perceived_result, worth_continuing FROM personal_experiments WHERE owner_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 8",
      args: [ownerId],
    }),
  ]);
  const habits = habitsRes.rows as unknown as Array<{ id: string; name: string }>;
  const habitIds = new Set(habits.map((h) => h.id));

  const metricLines = [...metrics.values()].map(
    (m) => `- ${m.key} (${m.label}${m.unit ? `, ${m.unit}` : ""}): média 30d ${fmt(m.mean)}, ${m.daysWithData} dia(s) com registro`
  );
  const ruleLines = Object.values(VERIFICATION_RULES).map((r) => `- ${r.key}: ${r.label} (config: ${r.configLabel}${r.configUnit ? ` em ${r.configUnit}` : ""})`);

  const prompt = [
    "Você é o LifeOS Copilot e vai DESENHAR experimentos pessoais (testes de rotina com começo e fim) para o objetivo do usuário.",
    "",
    "Regras obrigatórias:",
    SAFETY,
    "- Prefira métricas principais que o usuário JÁ registra (mais dias com registro). Se usar uma métrica sem registros, diga no rationale que ele precisará começar a registrar.",
    "- Um comportamento por experimento, simples, diário e verificável.",
    "- Use verificação automática quando houver regra compatível; senão use manual.",
    "",
    `Objetivo do usuário: "${goal}"`,
    constraints ? `Restrições/contexto informado pelo usuário: "${constraints}"` : "",
    "",
    "Métricas disponíveis (chave exata, últimos 30 dias, DADOS REAIS):",
    ...metricLines,
    "",
    "Regras de verificação automática disponíveis (chave exata):",
    ...ruleLines,
    habits.length ? `Hábitos ativos (para a regra habit_completion, use o id): ${habits.map((h) => `${h.id} = "${h.name}"`).join("; ")}` : "O usuário não tem hábitos ativos.",
    `Categorias válidas: ${CATEGORIES.join(", ")}.`,
    (activeRes.rows as unknown[]).length
      ? `Experimentos em andamento (evite medir a mesma métrica principal ao mesmo tempo): ${(activeRes.rows as unknown as Array<{ title: string; primary_metric: string }>).map((r) => `${r.title} [${r.primary_metric}]`).join("; ")}`
      : "",
    (pastRes.rows as unknown[]).length
      ? `Experimentos já concluídos: ${(pastRes.rows as unknown as Array<{ title: string; perceived_result: string | null; worth_continuing: string | null }>)
          .map((r) => `${r.title} (resultado percebido: ${r.perceived_result ?? "?"}, vale continuar: ${r.worth_continuing ?? "?"})`)
          .join("; ")}`
      : "",
    "",
    "Responda APENAS com JSON válido, sem markdown, exatamente neste formato:",
    '{"proposals":[{"title":"curto","category":"uma categoria válida","hypothesis":"Se eu ..., então ...","rationale":"por que faz sentido para os dados dele (1-2 frases)","dailyAction":"o que fazer todo dia, em 1 frase","primaryMetric":"chave","secondaryMetrics":["chave"],"durationDays":14,"verificationRule":"chave ou null","verificationConfig":{},"linkedHabitId":"id ou null","successCriteriaType":"consistency|metric_change|none","successCriteriaValue":80}]}',
    "Gere de 2 a 3 propostas diferentes entre si (abordagens distintas para o mesmo objetivo).",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false as const, message: result.message };
  const raw = extractJson(result.text) as { proposals?: unknown[] } | null;
  const list = Array.isArray(raw?.proposals) ? raw!.proposals : [];

  const proposals: ExperimentProposal[] = [];
  for (const item of list.slice(0, 3)) {
    const p = (item ?? {}) as Record<string, unknown>;
    const title = str(p.title, 80);
    const hypothesis = str(p.hypothesis, 300);
    const primary = typeof p.primaryMetric === "string" && p.primaryMetric in METRIC_CATALOG ? (p.primaryMetric as ExperimentMetricKey) : null;
    if (!title || !hypothesis || !primary) continue;

    let linkedHabitId = typeof p.linkedHabitId === "string" && habitIds.has(p.linkedHabitId) ? p.linkedHabitId : null;
    if (METRIC_CATALOG[primary].requiresHabit && !linkedHabitId) continue;

    const rule = typeof p.verificationRule === "string" && p.verificationRule in VERIFICATION_RULES ? (p.verificationRule as VerificationRule) : null;
    let verificationConfig = rule ? sanitizeRuleConfig(rule, (p.verificationConfig as Record<string, unknown>) ?? null) : null;
    let verificationRule = rule && verificationConfig ? rule : null;
    if (verificationRule === "habit_completion" && !linkedHabitId) {
      verificationRule = null;
      verificationConfig = null;
    }
    // O hábito só fica vinculado quando a métrica ou a regra realmente dependem dele.
    if (!METRIC_CATALOG[primary].requiresHabit && verificationRule !== "habit_completion") linkedHabitId = null;

    const secondary = (Array.isArray(p.secondaryMetrics) ? p.secondaryMetrics : [])
      .filter((k): k is ExperimentMetricKey => typeof k === "string" && k in METRIC_CATALOG && k !== primary && !METRIC_CATALOG[k as ExperimentMetricKey].requiresHabit)
      .filter((k, i, arr) => arr.indexOf(k) === i)
      .slice(0, 3);
    const successType = p.successCriteriaType === "consistency" || p.successCriteriaType === "metric_change" ? p.successCriteriaType : "none";
    const ctx = metrics.get(primary);
    const recommended = ctx && ctx.daysWithData >= 5 ? recommendedDuration(ctx.mean, ctx.sd) : null;
    const durationDays = Math.ceil(clampInt(p.durationDays, 7, 42, recommended ?? 14) / 7) * 7;

    proposals.push({
      title,
      category: typeof p.category === "string" && CATEGORIES.includes(p.category as ExperimentCategory) ? (p.category as ExperimentCategory) : "personalizado",
      hypothesis,
      rationale: str(p.rationale, 320) ?? "",
      dailyAction: str(p.dailyAction, 160) ?? "",
      primaryMetric: primary,
      secondaryMetrics: secondary,
      durationDays,
      linkedHabitId,
      verificationType: verificationRule ? "automatic" : "manual",
      verificationRule,
      verificationConfig,
      successCriteriaType: successType,
      successCriteriaValue: successType === "none" ? null : clampInt(p.successCriteriaValue, 1, 100, successType === "consistency" ? 80 : 15),
      baseline: {
        mean: ctx?.mean ?? null,
        daysWithData: ctx?.daysWithData ?? 0,
        unit: METRIC_CATALOG[primary].unit,
        recommendedDurationDays: recommended,
      },
    });
  }

  if (proposals.length === 0) return { ok: false as const, message: "A IA não devolveu propostas válidas agora. Reformule o objetivo ou tente de novo." };
  return { ok: true as const, proposals };
}

/* ============================================================
   2) Check-in em linguagem natural
   ============================================================ */

const PERCEPTIONS = ["muito_ruim", "ruim", "neutro", "bom", "muito_bom"] as const;

export async function parseDailyLog(db: Db, ownerId: string, experimentId: string, text: string, date: string) {
  const config = await getGeminiConfig();
  if (!config) return { ok: false as const, message: NO_AI };
  const detail = await getExperimentDetail(db, ownerId, experimentId);
  const e = detail.experiment;
  const today = new Date().toISOString().slice(0, 10);
  if (date < e.start_date || date > e.end_date || date > today) throw new ExperimentError("A data precisa estar dentro do período do experimento e não pode ser futura.");

  const automatic = e.verification_type === "automatic";
  const rule = automatic && e.verification_rule ? VERIFICATION_RULES[e.verification_rule as VerificationRule] : null;
  const prompt = [
    "Você é o LifeOS Copilot. O usuário descreveu o dia dele em texto livre; extraia um check-in estruturado do experimento abaixo.",
    "",
    "Regras:",
    SAFETY,
    automatic
      ? "- Este experimento tem verificação AUTOMÁTICA pelos dados do app: devolva checkinStatus = null (o app decide sozinho)."
      : "- checkinStatus = \"done\" só se o texto disser claramente que o comportamento foi cumprido; \"missed\" se disser que não foi; null se não der para saber.",
    "- perception: como a pessoa se sentiu no dia, se der para inferir do texto; senão null.",
    "- notes: reescreva o relato em 1-2 frases objetivas, em primeira pessoa, sem inventar nada que não esteja no texto.",
    "",
    `Experimento: "${e.title}". ${e.hypothesis ? `Hipótese: "${e.hypothesis}".` : ""} ${rule ? `Comportamento verificado automaticamente: ${rule.label}.` : "Comportamento confirmado manualmente pelo usuário."}`,
    `Relato do usuário: """${text}"""`,
    "",
    'Responda APENAS com JSON: {"checkinStatus":"done|missed|null","perception":"muito_ruim|ruim|neutro|bom|muito_bom|null","notes":"...","reasoning":"em 1 frase, o trecho do relato que justificou"}',
  ].join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false as const, message: result.message };
  const raw = (extractJson(result.text) ?? {}) as Record<string, unknown>;
  const checkinStatus = !automatic && (raw.checkinStatus === "done" || raw.checkinStatus === "missed") ? raw.checkinStatus : null;
  const perception = typeof raw.perception === "string" && (PERCEPTIONS as readonly string[]).includes(raw.perception) ? raw.perception : null;
  return {
    ok: true as const,
    proposal: {
      logDate: date,
      checkinStatus,
      perception,
      notes: str(raw.notes, 1000) ?? text.trim().slice(0, 1000),
      reasoning: str(raw.reasoning, 240),
    },
  };
}

/* ============================================================
   3) Insights do experimento (com histórico)
   ============================================================ */

export type InsightKind = "dado" | "inferencia" | "sugestao";

export interface InsightReportContent {
  headline: string;
  summary: string;
  items: Array<{ kind: InsightKind; text: string }>;
  todayFocus: string | null;
  question: string | null;
}

interface ReportRow {
  id: string;
  kind: "insight" | "final";
  content_json: string;
  logs_count: number;
  created_at: string;
}

const toReport = (r: ReportRow) => ({ id: r.id, kind: r.kind, createdAt: r.created_at, logsCount: Number(r.logs_count), content: JSON.parse(r.content_json) as InsightReportContent });

export async function listInsightReports(db: Db, ownerId: string, experimentId: string) {
  await getExperimentDetail(db, ownerId, experimentId); // valida dono
  const r = await db.execute({
    sql: "SELECT id, kind, content_json, logs_count, created_at FROM experiment_ai_reports WHERE owner_id = ? AND experiment_id = ? ORDER BY created_at DESC LIMIT 10",
    args: [ownerId, experimentId],
  });
  return (r.rows as unknown as ReportRow[]).map(toReport);
}

export async function generateInsightReport(db: Db, ownerId: string, experimentId: string, opts: { refresh?: boolean; final?: boolean } = {}) {
  const [detail, analysis] = await Promise.all([getExperimentDetail(db, ownerId, experimentId), getExperimentAnalysis(db, ownerId, experimentId)]);
  const logsCount = detail.logs.length;

  // Reaproveita o relatório de hoje se nada mudou desde então (evita custo e respostas repetidas).
  if (!opts.refresh) {
    const latest = await db.execute({
      sql: "SELECT id, kind, content_json, logs_count, created_at FROM experiment_ai_reports WHERE owner_id = ? AND experiment_id = ? AND date(created_at) = date('now') ORDER BY created_at DESC LIMIT 1",
      args: [ownerId, experimentId],
    });
    const row = latest.rows[0] as unknown as ReportRow | undefined;
    if (row && Number(row.logs_count) === logsCount) return { ok: true as const, cached: true, report: toReport(row) };
  }

  const config = await getGeminiConfig();
  if (!config) return { ok: false as const, message: NO_AI };

  const e = detail.experiment;
  const metricLines = analysis.metrics.map((m) => {
    const ci = m.effect.ciLow !== null ? `, faixa provável da diferença ${fmt(m.effect.ciLow, 2)} a ${fmt(m.effect.ciHigh, 2)}` : "";
    const adh =
      m.adherence && m.adherence.favorableDiff !== null
        ? `; dias cumpridos média ${fmt(m.adherence.doneMean, 2)} (${m.adherence.doneDays}d) × não cumpridos ${fmt(m.adherence.missedMean, 2)} (${m.adherence.missedDays}d)`
        : "";
    return `- ${m.label}${m.isPrimary ? " [PRINCIPAL]" : ""}${m.inverse ? " (menor é melhor)" : ""}: antes ${fmt(m.before.mean, 2)} (${m.before.n}d), durante ${fmt(m.during.mean, 2)} (${m.during.n}d), evidência ${m.effect.evidence}${ci}${adh}`;
  });
  const notes = detail.logs
    .filter((l) => l.notes)
    .slice(-14)
    .map((l) => `- ${l.log_date}: "${String(l.notes).slice(0, 240)}"${l.perception ? ` (percepção ${l.perception})` : ""}`);

  const prompt = [
    `Você é o LifeOS Copilot e está ${opts.final ? "escrevendo o RELATÓRIO FINAL" : "acompanhando"} um experimento pessoal do usuário.`,
    "",
    "Regras obrigatórias:",
    SAFETY,
    "- Classifique cada item: \"dado\" = fato que está literalmente nos números abaixo; \"inferencia\" = interpretação sua dos números; \"sugestao\" = recomendação sua.",
    "- Itens do tipo \"dado\" devem citar o número exato fornecido.",
    "",
    `Experimento: "${e.title}" (${CATEGORY_LABEL[e.category as ExperimentCategory] ?? e.category}).`,
    e.hypothesis ? `Hipótese: "${e.hypothesis}".` : "",
    `Período: ${e.start_date} a ${e.end_date}; dia ${detail.daysElapsed} de ${detail.durationDays}; faltam ${analysis.daysRemaining} dia(s).`,
    `Consistência do comportamento: ${detail.consistencyPct === null ? "sem check-ins ainda" : `${detail.consistencyPct}%`}; sequência atual ${analysis.streak.current}, recorde ${analysis.streak.best}.`,
    `Critério de sucesso: ${analysis.success.message}`,
    `Leitura automática do LifeOS: ${analysis.verdict.title} — ${analysis.verdict.text}`,
    analysis.perception.total ? `Percepção média ${fmt(analysis.perception.avg)}/5 em ${analysis.perception.total} registros (1ª metade ${fmt(analysis.perception.firstHalfAvg)}, 2ª metade ${fmt(analysis.perception.secondHalfAvg)}).` : "Sem registros de percepção.",
    analysis.overlaps.length ? `Experimentos simultâneos: ${analysis.overlaps.map((o) => `${o.title}${o.sharesMetric ? " (mesma métrica)" : ""}`).join("; ")}.` : "",
    "",
    "Métricas (antes = período anterior de mesma duração):",
    ...metricLines,
    notes.length ? "\nObservações escritas pelo usuário:" : "",
    ...notes,
    "",
    "Responda APENAS com JSON válido, sem markdown:",
    '{"headline":"título de até 8 palavras","summary":"2-3 frases","items":[{"kind":"dado|inferencia|sugestao","text":"..."}],"todayFocus":"uma ação concreta para hoje (ou null se o experimento acabou)","question":"uma pergunta reflexiva curta para o usuário responder no check-in"}',
    `Gere de 4 a 7 itens, com pelo menos um de cada tipo.${opts.final ? " Inclua uma sugestão sobre manter, ajustar ou abandonar o comportamento e uma ideia de próximo experimento." : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false as const, message: result.message };
  const raw = (extractJson(result.text) ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const kind = o.kind === "dado" || o.kind === "inferencia" || o.kind === "sugestao" ? (o.kind as InsightKind) : null;
      const text = str(o.text, 400);
      return kind && text ? { kind, text } : null;
    })
    .filter((x): x is { kind: InsightKind; text: string } => !!x)
    .slice(0, 8);
  const headline = str(raw.headline, 90);
  const summary = str(raw.summary, 600);
  if (!headline || !summary || items.length === 0) return { ok: false as const, message: "A IA não conseguiu montar os insights agora. Tente novamente." };

  const content: InsightReportContent = {
    headline,
    summary,
    items,
    todayFocus: analysis.daysRemaining > 0 && !opts.final ? str(raw.todayFocus, 200) : null,
    question: str(raw.question, 200),
  };
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO experiment_ai_reports (id, owner_id, experiment_id, kind, content_json, logs_count) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, ownerId, experimentId, opts.final ? "final" : "insight", JSON.stringify(content), logsCount],
  });
  const saved = await db.execute({ sql: "SELECT id, kind, content_json, logs_count, created_at FROM experiment_ai_reports WHERE id = ?", args: [id] });
  return { ok: true as const, cached: false, report: toReport(saved.rows[0] as unknown as ReportRow) };
}
