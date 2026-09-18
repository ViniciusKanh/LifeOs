import type { getDb } from "../db/client.js";
import { getGeminiConfig, generateText } from "./geminiService.js";
import { getExperimentDetail } from "./experimentService.js";
import { METRIC_CATALOG, getDailySeries, aggregateSeries, type ExperimentMetricKey } from "./experimentMetricsService.js";

/**
 * Camada de IA dos Experimentos Pessoais. Só envia ao Gemini agregados
 * já calculados (médias, diferenças percentuais, hipótese, contagem de
 * observações) — nunca a lista bruta de registros de outros módulos, e
 * nunca segredos. O prompt instrui explicitamente a nunca afirmar
 * causalidade nem dar diagnóstico médico (seções 33/61/63 do briefing).
 */

type Db = ReturnType<typeof getDb>;

const SAFETY_RULES = [
  "Baseie-se SOMENTE nos dados agregados fornecidos abaixo — nunca invente números, hábitos ou eventos que não estejam listados.",
  "NUNCA afirme causalidade (não diga \"isso causou\", \"isso aumentou\" de forma definitiva). Use linguagem como \"os registros sugerem\", \"foi observada uma tendência\", \"houve associação entre\", \"durante este período\".",
  "NUNCA dê diagnóstico médico ou conselho de saúde clínico.",
  "Se os dados forem insuficientes para uma conclusão, diga isso claramente em vez de forçar uma resposta.",
  "Responda em português do Brasil, de forma direta e objetiva.",
].map((r) => `- ${r}`).join("\n");

export async function analyzeExperiment(db: Db, ownerId: string, experimentId: string, question?: string) {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false as const, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const detail = await getExperimentDetail(db, ownerId, experimentId);
  const { experiment, comparison, logs, consistencyPct, daysElapsed, durationDays } = detail;

  const metricLines = comparison.map((c) => {
    if (c.trend === "insufficient_data") return `- ${c.label}: dados insuficientes para comparar (${c.insufficientDataReason}).`;
    return `- ${c.label}: antes ${c.beforeAvg?.toFixed(2)}${c.unit ?? ""}, durante ${c.duringAvg?.toFixed(2)}${c.unit ?? ""} (diferença: ${c.diffPct! > 0 ? "+" : ""}${c.diffPct}%).`;
  });

  const notes = logs.filter((l) => l.notes).slice(-10).map((l) => `- ${l.log_date}: "${l.notes}"${l.perception ? ` (percepção: ${l.perception})` : ""}`);

  const context = [
    `Experimento: "${experiment.title}" (categoria: ${experiment.category}).`,
    experiment.hypothesis ? `Hipótese do usuário: "${experiment.hypothesis}"` : "",
    `Período: ${experiment.start_date} a ${experiment.end_date} (dia ${daysElapsed} de ${durationDays}).`,
    consistencyPct !== null ? `Consistência do comportamento: ${consistencyPct}% dos dias.` : "Consistência do comportamento: ainda sem dados suficientes.",
    "",
    "Comparação antes x durante (dados reais do LifeOS):",
    ...metricLines,
    notes.length > 0 ? "\nObservações do usuário durante o experimento:" : "",
    ...notes,
  ].filter(Boolean).join("\n");

  const task = question?.trim() || "Resuma este experimento em um parágrafo curto, destacando os padrões observados e se parece valer a pena repetir ou manter o comportamento.";

  const prompt = [
    "Você é o LifeOS Copilot, analisando um Experimento Pessoal do usuário.",
    "",
    "Regras obrigatórias:",
    SAFETY_RULES,
    "",
    "Dados do experimento:",
    context,
    "",
    `Tarefa: ${task}`,
    "",
    "Responda em no máximo 5 frases.",
  ].join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false as const, message: result.message };
  return { ok: true as const, text: result.text };
}

/* ---------------------------- Sugestão de novo experimento ---------------------------- */

async function scalarAvg(db: Db, metric: ExperimentMetricKey, ownerId: string, days: number): Promise<number | null> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const series = await getDailySeries(db, ownerId, metric, from, to, null);
  const { avg } = aggregateSeries(series);
  return avg;
}

export async function suggestExperiment(db: Db, ownerId: string) {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false as const, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const [sleepAvg, energyAvg, moodAvg, stressAvg, waterAvg, focusAvg, exerciseAvg, readingPagesAvg, studyAvg] = await Promise.all([
    scalarAvg(db, "sleep_duration", ownerId, 30),
    scalarAvg(db, "energy", ownerId, 30),
    scalarAvg(db, "mood", ownerId, 30),
    scalarAvg(db, "stress", ownerId, 30),
    scalarAvg(db, "water_ml", ownerId, 30),
    scalarAvg(db, "focus_minutes", ownerId, 30),
    scalarAvg(db, "exercise_minutes", ownerId, 30),
    scalarAvg(db, "reading_pages", ownerId, 30),
    scalarAvg(db, "study_minutes", ownerId, 30),
  ]);

  const existing = await db.execute({ sql: "SELECT title FROM personal_experiments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 8", args: [ownerId] });
  const existingTitles = (existing.rows as unknown as Array<{ title: string }>).map((r) => r.title);

  const facts = [
    sleepAvg !== null ? `Sono médio (30 dias): ${sleepAvg.toFixed(1)}h/noite.` : "Sem registros de sono suficientes.",
    energyAvg !== null ? `Energia média: ${energyAvg.toFixed(1)}/5.` : "Sem registros de energia suficientes.",
    moodAvg !== null ? `Humor médio: ${moodAvg.toFixed(1)}/5.` : "",
    stressAvg !== null ? `Estresse médio: ${stressAvg.toFixed(1)}/5.` : "",
    waterAvg !== null ? `Água média: ${(waterAvg / 1000).toFixed(1)}L/dia.` : "Sem registros de água suficientes.",
    focusAvg !== null ? `Foco médio: ${Math.round(focusAvg)} min/dia.` : "Sem registros de Focus suficientes.",
    exerciseAvg !== null ? `Exercício médio: ${Math.round(exerciseAvg)} min/dia.` : "Sem registros de exercício suficientes.",
    readingPagesAvg !== null ? `Leitura média: ${Math.round(readingPagesAvg)} páginas/dia.` : "Sem registros de leitura suficientes.",
    studyAvg !== null ? `Estudo médio: ${Math.round(studyAvg)} min/dia.` : "",
    existingTitles.length > 0 ? `Experimentos recentes já feitos (evite repetir): ${existingTitles.join("; ")}.` : "",
  ].filter(Boolean);

  const metricKeys = Object.keys(METRIC_CATALOG).filter((k) => k !== "habit_consistency").join(", ");

  const prompt = [
    "Você é o LifeOS Copilot. Com base SOMENTE nos dados reais abaixo, sugira UM experimento pessoal simples e mensurável para o usuário testar na própria rotina.",
    "",
    "Dados do usuário (últimos 30 dias):",
    ...facts.map((f) => `- ${f}`),
    "",
    `A métrica principal sugerida deve ser uma destas chaves exatas: ${metricKeys}.`,
    "",
    "Responda APENAS com um JSON válido, sem markdown, no formato exato:",
    '{"title": "string curta", "hypothesis": "frase no formato \\"Se eu ... , então ...\\"", "durationDays": 7 | 14 | 21 | 30, "primaryMetric": "uma das chaves acima", "motivation": "1 frase explicando por que essa sugestão faz sentido para os dados do usuário"}',
    "",
    "Nunca dê diagnóstico médico. Nunca afirme causalidade — é apenas uma sugestão para o usuário testar e observar.",
  ].join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false as const, message: result.message };

  try {
    const cleaned = result.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned) as { title?: string; hypothesis?: string; durationDays?: number; primaryMetric?: string; motivation?: string };
    if (!parsed.title || !parsed.hypothesis || !parsed.primaryMetric || !(parsed.primaryMetric in METRIC_CATALOG)) {
      return { ok: false as const, message: "Não foi possível gerar uma sugestão válida agora. Tente novamente." };
    }
    const durationDays = [7, 14, 21, 30].includes(Number(parsed.durationDays)) ? Number(parsed.durationDays) : 14;
    return {
      ok: true as const,
      suggestion: {
        title: parsed.title,
        hypothesis: parsed.hypothesis,
        durationDays,
        primaryMetric: parsed.primaryMetric as ExperimentMetricKey,
        motivation: parsed.motivation ?? "",
      },
    };
  } catch {
    return { ok: false as const, message: "Não foi possível interpretar a sugestão da IA agora. Tente novamente." };
  }
}
