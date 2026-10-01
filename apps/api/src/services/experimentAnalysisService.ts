import type { getDb } from "../db/client.js";
import { METRIC_CATALOG, getDailySeries, type ExperimentMetricKey } from "./experimentMetricsService.js";
import { getExperimentDetail, ExperimentError } from "./experimentService.js";
import { describe, effect, recommendedDuration, type Describe, type EffectResult, type EvidenceLevel } from "./experimentStats.js";

type Db = ReturnType<typeof getDb>;

/**
 * Análise aprofundada de um Experimento Pessoal (GET /experiments/:id/analysis).
 * Tudo é derivado das séries reais (experimentMetricsService) e dos check-ins
 * calculados em getExperimentDetail — nada é estimado.
 *
 * Linguagem: o veredito fala em associação/tendência; o "próximo passo" é
 * marcado como sugestão do LifeOS (regra determinística, não IA).
 */

const PERCEPTION_SCORE: Record<string, number> = { muito_ruim: 1, ruim: 2, neutro: 3, bom: 4, muito_bom: 5 };
const MIN_SPLIT_DAYS = 2;

export interface MetricAnalysis {
  metric: ExperimentMetricKey;
  label: string;
  unit: string | null;
  inverse: boolean;
  isPrimary: boolean;
  before: Describe;
  during: Describe;
  effect: EffectResult;
  coveragePct: number;
  /** Dias em que o comportamento foi cumprido × não cumprido, dentro do experimento. */
  adherence: { doneMean: number | null; doneDays: number; missedMean: number | null; missedDays: number; favorableDiff: number | null } | null;
}

export type SuccessStatus = "met" | "not_met" | "on_track" | "at_risk" | "unreachable" | "pending" | "none";

export interface ExperimentAnalysis {
  verdict: { tone: "positive" | "negative" | "neutral" | "collecting" | "warning"; title: string; text: string; nextStep: string };
  metrics: MetricAnalysis[];
  weekly: Array<{ week: number; from: string; to: string; primaryMean: number | null; consistencyPct: number | null; daysWithData: number }>;
  success: {
    type: "consistency" | "metric_change" | "none";
    target: number | null;
    current: number | null;
    status: SuccessStatus;
    message: string;
    doneDaysNeeded: number | null;
  };
  perception: { avg: number | null; firstHalfAvg: number | null; secondHalfAvg: number | null; counts: Record<string, number>; total: number };
  streak: { current: number; best: number };
  overlaps: Array<{ id: string; title: string; status: string; sharesMetric: boolean }>;
  daysRemaining: number;
}

function round(v: number | null, digits = 2) {
  return v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;
}

function roundDescribe(d: Describe): Describe {
  return { n: d.n, mean: round(d.mean), sd: round(d.sd), median: round(d.median), min: round(d.min), max: round(d.max) };
}

function computeStreaks(checkins: Array<{ date: string; status: string }>) {
  let best = 0;
  let run = 0;
  for (const c of checkins) {
    if (c.status === "done") run += 1;
    else if (c.status === "missed") run = 0;
    best = Math.max(best, run);
  }
  // Sequência atual: conta de trás pra frente, ignorando o "pendente" de hoje.
  let current = 0;
  for (let i = checkins.length - 1; i >= 0; i--) {
    const s = checkins[i].status;
    if (s === "pending" && i === checkins.length - 1) continue;
    if (s !== "done") break;
    current += 1;
  }
  return { current, best };
}

const EVIDENCE_PT: Record<EvidenceLevel, string> = {
  strong: "forte",
  moderate: "moderada",
  weak: "fraca",
  none: "sem diferença clara",
  insufficient: "insuficiente",
};

export async function getExperimentAnalysis(db: Db, ownerId: string, id: string): Promise<ExperimentAnalysis> {
  const detail = await getExperimentDetail(db, ownerId, id);
  const { experiment, checkins, logs, consistencyPct, durationDays, daysElapsed } = detail;
  const today = new Date().toISOString().slice(0, 10);
  const duringTo = today < experiment.end_date ? today : experiment.end_date;

  // Período anterior com a mesma duração, imediatamente antes do início (mesma regra do detalhe).
  const startMs = Date.parse(`${experiment.start_date}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const beforeTo = iso(startMs - 86_400_000);
  const beforeFrom = iso(startMs - durationDays * 86_400_000);

  const statusByDate = new Map(checkins.map((c) => [c.date, c.status]));
  const metricKeys: ExperimentMetricKey[] = [experiment.primary_metric, ...experiment.secondary_metrics.filter((m: ExperimentMetricKey) => m !== experiment.primary_metric)];

  const metrics: MetricAnalysis[] = [];
  let primaryDuringValues: Array<{ date: string; value: number | null }> = [];
  for (const key of metricKeys) {
    const def = METRIC_CATALOG[key];
    if (!def) continue;
    const [beforeSeries, duringSeries] = await Promise.all([
      getDailySeries(db, ownerId, key, beforeFrom, beforeTo, experiment.linked_habit_id),
      getDailySeries(db, ownerId, key, experiment.start_date, duringTo, experiment.linked_habit_id),
    ]);
    const beforeVals = beforeSeries.values.filter((p) => p.value !== null).map((p) => p.value as number);
    const duringVals = duringSeries.values.filter((p) => p.value !== null).map((p) => p.value as number);
    const b = describe(beforeVals);
    const d = describe(duringVals);
    const eff = effect(b, d, def.inverse);
    if (key === experiment.primary_metric) primaryDuringValues = duringSeries.values;

    const doneVals = duringSeries.values.filter((p) => p.value !== null && statusByDate.get(p.date) === "done").map((p) => p.value as number);
    const missedVals = duringSeries.values.filter((p) => p.value !== null && statusByDate.get(p.date) === "missed").map((p) => p.value as number);
    const dm = describe(doneVals).mean;
    const mm = describe(missedVals).mean;
    const adherence =
      doneVals.length >= MIN_SPLIT_DAYS && missedVals.length >= MIN_SPLIT_DAYS && dm !== null && mm !== null
        ? { doneMean: round(dm), doneDays: doneVals.length, missedMean: round(mm), missedDays: missedVals.length, favorableDiff: round(def.inverse ? mm - dm : dm - mm) }
        : { doneMean: round(dm), doneDays: doneVals.length, missedMean: round(mm), missedDays: missedVals.length, favorableDiff: null };

    metrics.push({
      metric: key,
      label: def.label,
      unit: def.unit,
      inverse: def.inverse,
      isPrimary: key === experiment.primary_metric,
      before: roundDescribe(b),
      during: roundDescribe(d),
      effect: { ...eff, diff: round(eff.diff), ciLow: round(eff.ciLow), ciHigh: round(eff.ciHigh) },
      coveragePct: daysElapsed > 0 ? Math.round((d.n / daysElapsed) * 100) : 0,
      adherence,
    });
  }

  // Semana a semana dentro do experimento.
  const weekly: ExperimentAnalysis["weekly"] = [];
  for (let w = 0; w * 7 < checkins.length; w++) {
    const slice = checkins.slice(w * 7, w * 7 + 7);
    const vals = primaryDuringValues.slice(w * 7, w * 7 + 7).filter((p) => p.value !== null).map((p) => p.value as number);
    const decided = slice.filter((c) => c.status !== "pending");
    weekly.push({
      week: w + 1,
      from: slice[0].date,
      to: slice[slice.length - 1].date,
      primaryMean: round(describe(vals).mean),
      consistencyPct: decided.length ? Math.round((decided.filter((c) => c.status === "done").length / decided.length) * 100) : null,
      daysWithData: vals.length,
    });
  }

  // Critério de sucesso.
  const daysRemaining = Math.max(0, durationDays - daysElapsed);
  const doneCount = checkins.filter((c) => c.status === "done").length;
  const decidedCount = checkins.filter((c) => c.status !== "pending").length;
  const finished = experiment.status === "completed" || daysRemaining === 0;
  const primary = metrics.find((m) => m.isPrimary) ?? null;
  let success: ExperimentAnalysis["success"] = { type: "none", target: null, current: null, status: "none", message: "Sem critério de sucesso definido.", doneDaysNeeded: null };
  const target = experiment.success_criteria_value;
  if (experiment.success_criteria_type === "consistency" && target != null) {
    const needed = Math.max(0, Math.ceil((target / 100) * durationDays) - doneCount);
    const maxPossible = durationDays > 0 ? ((doneCount + daysRemaining) / durationDays) * 100 : 0;
    let status: SuccessStatus;
    if (consistencyPct === null) status = "pending";
    else if (finished) status = consistencyPct >= target ? "met" : "not_met";
    else if (maxPossible < target) status = "unreachable";
    else status = consistencyPct >= target ? "on_track" : "at_risk";
    const message =
      status === "pending"
        ? "Ainda não há check-ins decididos."
        : status === "met"
          ? `Meta atingida: ${consistencyPct}% dos dias cumpridos (meta ${target}%).`
          : status === "not_met"
            ? `Meta não atingida: ${consistencyPct}% dos dias (meta ${target}%).`
            : status === "unreachable"
              ? `Mesmo cumprindo todos os ${daysRemaining} dias restantes, a consistência não chega a ${target}%.`
              : status === "on_track"
                ? `No caminho: ${consistencyPct}% até agora. Faltam ${needed} dia(s) cumprido(s) para garantir ${target}%.`
                : `Abaixo da meta: ${consistencyPct}% até agora. Você precisa cumprir ${needed} dos ${daysRemaining} dias restantes.`;
    success = { type: "consistency", target, current: consistencyPct, status, message, doneDaysNeeded: finished ? null : needed };
  } else if (experiment.success_criteria_type === "metric_change" && target != null) {
    const before = primary?.before.mean ?? null;
    const diff = primary?.effect.diff ?? null;
    const pct = before && diff !== null && before !== 0 ? (diff / Math.abs(before)) * 100 : null;
    const favorablePct = pct === null || !primary ? null : Math.round((primary.inverse ? -pct : pct) * 10) / 10;
    let status: SuccessStatus;
    if (favorablePct === null) status = "pending";
    else if (finished) status = favorablePct >= target ? "met" : "not_met";
    else status = favorablePct >= target ? "on_track" : "at_risk";
    const message =
      favorablePct === null
        ? "Ainda não há dados suficientes antes e durante para medir a mudança."
        : `${primary!.label}: ${favorablePct > 0 ? "+" : ""}${favorablePct}% de mudança favorável (meta ${target}%).`;
    success = { type: "metric_change", target, current: favorablePct, status, message, doneDaysNeeded: null };
  }

  // Percepção registrada nos check-ins.
  const scored = logs.filter((l) => l.perception && PERCEPTION_SCORE[l.perception]).map((l) => ({ date: l.log_date, v: PERCEPTION_SCORE[l.perception as string] }));
  const counts: Record<string, number> = { muito_ruim: 0, ruim: 0, neutro: 0, bom: 0, muito_bom: 0 };
  for (const l of logs) if (l.perception && counts[l.perception] !== undefined) counts[l.perception] += 1;
  const half = Math.floor(scored.length / 2);
  const perception = {
    avg: round(describe(scored.map((s) => s.v)).mean, 1),
    firstHalfAvg: scored.length >= 4 ? round(describe(scored.slice(0, half).map((s) => s.v)).mean, 1) : null,
    secondHalfAvg: scored.length >= 4 ? round(describe(scored.slice(half).map((s) => s.v)).mean, 1) : null,
    counts,
    total: scored.length,
  };

  // Outros experimentos no mesmo período — podem confundir a leitura do efeito.
  const overlapRes = await db.execute({
    sql: `SELECT id, title, status, primary_metric, secondary_metrics_json FROM personal_experiments
          WHERE owner_id = ? AND id != ? AND status IN ('active', 'paused', 'completed')
            AND start_date <= ? AND end_date >= ?`,
    args: [ownerId, id, duringTo, experiment.start_date],
  });
  const myMetrics = new Set(metricKeys);
  const overlaps = (overlapRes.rows as unknown as Array<{ id: string; title: string; status: string; primary_metric: string; secondary_metrics_json: string | null }>).map((o) => {
    const theirs = [o.primary_metric, ...(o.secondary_metrics_json ? (JSON.parse(o.secondary_metrics_json) as string[]) : [])];
    return { id: o.id, title: o.title, status: o.status, sharesMetric: theirs.some((m) => myMetrics.has(m as ExperimentMetricKey)) };
  });

  const verdict = buildVerdict({ primary, consistencyPct, decidedCount, daysElapsed, durationDays, overlaps });

  return { verdict, metrics, weekly, success, perception, streak: computeStreaks(checkins), overlaps, daysRemaining };
}

function buildVerdict(p: {
  primary: MetricAnalysis | null;
  consistencyPct: number | null;
  decidedCount: number;
  daysElapsed: number;
  durationDays: number;
  overlaps: Array<{ sharesMetric: boolean }>;
}): ExperimentAnalysis["verdict"] {
  const confounded = p.overlaps.some((o) => o.sharesMetric);
  const caveat = confounded ? " Atenção: outro experimento no mesmo período mede a mesma métrica, então parte do efeito pode vir dele." : "";
  const primary = p.primary;
  if (!primary || primary.effect.evidence === "insufficient") {
    const beforeN = primary?.before.n ?? 0;
    const duringN = primary?.during.n ?? 0;
    const need = beforeN < 3 ? "registros do período anterior" : `mais ${Math.max(0, 3 - duringN)} dia(s) com dado durante o experimento`;
    return {
      tone: "collecting",
      title: "Coletando dados",
      text: `Ainda não dá para comparar: faltam ${need} de ${primary?.label.toLowerCase() ?? "métrica principal"}.`,
      nextStep: beforeN < 3 ? `Registre ${primary?.label.toLowerCase() ?? "a métrica"} todos os dias — sem o "antes", a análise usará só a evolução durante o experimento.` : "Continue registrando normalmente; a análise aparece sozinha.",
    };
  }
  if (p.consistencyPct !== null && p.decidedCount >= 5 && p.consistencyPct < 50) {
    return {
      tone: "warning",
      title: "Comportamento pouco seguido",
      text: `Você cumpriu o comportamento em ${p.consistencyPct}% dos dias. Com essa consistência, qualquer diferença na métrica diz pouco sobre a mudança testada.${caveat}`,
      nextStep: "Sugestão: reduza a meta (ex.: menos dias por semana ou um alvo menor) e reinicie o teste.",
    };
  }
  const g = primary.effect.effectSize ?? 0;
  const ev = EVIDENCE_PT[primary.effect.evidence];
  const favorable = g > 0;
  const adherenceNote =
    primary.adherence?.favorableDiff != null
      ? primary.adherence.favorableDiff > 0
        ? " E nos dias em que você cumpriu o comportamento, o resultado foi melhor do que nos dias em que não cumpriu — reforça a associação."
        : " Mas nos dias em que você cumpriu o comportamento o resultado não foi melhor que nos outros — a mudança pode ter outra origem."
      : "";
  const progress = p.daysElapsed < p.durationDays ? ` (dia ${p.daysElapsed} de ${p.durationDays})` : "";

  if (primary.effect.evidence === "none") {
    return {
      tone: "neutral",
      title: "Sem diferença clara",
      text: `${primary.label} ficou dentro da sua variação normal em relação ao período anterior${progress}.${adherenceNote}${caveat}`,
      nextStep: p.daysElapsed < p.durationDays ? "Sugestão: mantenha até o fim — efeitos pequenos levam mais dias para aparecer." : "Sugestão: se o comportamento não te faz bem por outros motivos, talvez não valha manter.",
    };
  }
  if (favorable) {
    const strongish = primary.effect.evidence === "strong" || primary.effect.evidence === "moderate";
    return {
      tone: "positive",
      title: strongish ? "Sinal promissor" : "Tendência positiva, ainda incerta",
      text: `${primary.label} melhorou em relação ao período anterior, com evidência ${ev}${progress}.${adherenceNote}${caveat}`,
      nextStep: strongish ? "Sugestão: considere transformar o comportamento em hábito fixo e repetir o teste mais tarde para confirmar." : "Sugestão: continue — mais dias de dado reduzem a incerteza.",
    };
  }
  return {
    tone: "negative",
    title: primary.effect.evidence === "weak" ? "Leve piora, ainda incerta" : "Efeito contrário observado",
    text: `${primary.label} piorou em relação ao período anterior, com evidência ${ev}${progress}.${adherenceNote}${caveat}`,
    nextStep: "Sugestão: revise se algo mais mudou no período (rotina, saúde, carga de trabalho) antes de concluir.",
  };
}

/**
 * Prévia para o assistente de criação: como a métrica se comporta hoje
 * (últimos N dias) e quantos dias o teste precisa para enxergar ~15% de mudança.
 */
export async function getMetricBaselinePreview(db: Db, ownerId: string, metric: string, days: number, habitId: string | null) {
  const def = METRIC_CATALOG[metric as ExperimentMetricKey];
  if (!def) throw new ExperimentError("Métrica inválida.");
  if (def.requiresHabit && habitId) {
    const owned = await db.execute({ sql: "SELECT id FROM habits WHERE id = ? AND owner_id = ?", args: [habitId, ownerId] });
    if (owned.rows.length === 0) throw new ExperimentError("Hábito não encontrado.", 404);
  }
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const series = await getDailySeries(db, ownerId, metric as ExperimentMetricKey, from, to, habitId);
  const vals = series.values.filter((p) => p.value !== null).map((p) => p.value as number);
  const d = describe(vals);
  const rec = d.n >= 5 ? recommendedDuration(d.mean, d.sd) : null;
  const cv = d.mean && d.sd ? Math.round((d.sd / Math.abs(d.mean)) * 100) : null;
  let message: string;
  if (series.daysWithData === 0) message = `Você ainda não registrou ${def.label.toLowerCase()} nos últimos ${days} dias. Comece a registrar antes do início para ter um "antes" para comparar.`;
  else if (d.n < 5) message = `Só ${series.daysWithData} dia(s) com registro nos últimos ${days} dias — a comparação "antes x durante" ficará frágil.`;
  else if (cv !== null && cv > 50) message = `Seus valores variam bastante (±${cv}% da média). Testes mais longos dão leituras mais confiáveis.`;
  else message = `Boa base: ${series.daysWithData} dias com registro e variação de ±${cv ?? 0}% da média.`;
  return {
    metric,
    label: def.label,
    unit: def.unit,
    days,
    daysWithData: series.daysWithData,
    mean: round(d.mean),
    sd: round(d.sd),
    cvPct: cv,
    recommendedDurationDays: rec,
    sourcePath: def.sourcePath,
    sourceLabel: def.sourceLabel,
    message,
    sparkline: series.values.map((p) => p.value),
  };
}
