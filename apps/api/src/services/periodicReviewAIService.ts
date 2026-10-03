import type { getDb } from "../db/client.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { computePeriodMetrics, shiftPeriodKey, type PeriodMetrics, type PeriodicKind } from "./periodicReviewService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Copilot da revisão: o Gemini recebe SÓ o retrato real do período (e do
 * anterior, para comparação) e devolve listas curtas. A resposta é sempre
 * rotulada: "dados" vêm do banco; padrões são inferência; sugestões são da IA.
 * Nada é salvo — o usuário decide o que levar para a reflexão.
 */
export interface PeriodicReviewAnalysis {
  /** Fatos do período, citados dos dados reais. */
  achievements: string[];
  /** Inferências: padrões observados (associação, nunca causa). */
  patterns: string[];
  /** Pontos de atenção derivados dos dados. */
  attention: string[];
  /** Sugestões da IA para o próximo ciclo. */
  suggestions: string[];
  basedOn: { label: string; from: string; to: string };
}

function metricsBlock(m: PeriodMetrics): string {
  return [
    `Tarefas concluídas: ${m.tasksCompleted}`,
    `Metas concluídas: ${m.goalsCompleted}`,
    `Check-ins de hábito cumpridos: ${m.habitCheckins}`,
    `Dias com Diário: ${m.journalEntries}`,
    `Páginas lidas: ${m.pagesRead}`,
    `Treinos: ${m.workouts} (${m.workoutMinutes} min)`,
    `Humor médio (1-5): ${m.avgMood ?? "sem registro"}`,
    `Sono médio (min): ${m.avgSleepMinutes ?? "sem registro"}`,
    `Itens de vida resolvidos: ${m.lifeAdminDone}`,
    `Metas do ciclo: ${m.goals.length === 0 ? "nenhuma" : m.goals.map((g) => `${g.title} (${g.progressPct ?? "?"}%, ${g.status})`).join("; ")}`,
  ].join("\n");
}

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 240)).filter((x): x is string => !!x).slice(0, 4) : [];

export async function analyzePeriodicReview(
  db: Db,
  ownerId: string,
  kind: PeriodicKind,
  key: string,
): Promise<{ ok: true; analysis: PeriodicReviewAnalysis } | { ok: false; message: string }> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini." };

  const [current, previous] = await Promise.all([
    computePeriodMetrics(db, ownerId, kind, key),
    computePeriodMetrics(db, ownerId, kind, shiftPeriodKey(kind, key, -1)),
  ]);
  const total = current.tasksCompleted + current.habitCheckins + current.journalEntries + current.pagesRead + current.workouts + current.goalsCompleted;
  if (total === 0) return { ok: false, message: "Ainda não há registros suficientes neste período para uma análise." };

  const prompt = `Você é o LifeOS Copilot ajudando a fechar um ciclo (${current.label}).
Use EXCLUSIVAMENTE os números abaixo. Não invente métricas, datas ou fatos. Não afirme causalidade — use "coincidiu com", "junto com".
Responda em português do Brasil, em JSON puro:
{"achievements": [até 4 frases curtas citando números reais do período],
 "patterns": [até 3 padrões observados comparando com o período anterior],
 "attention": [até 3 pontos de atenção baseados nos números],
 "suggestions": [até 3 sugestões práticas para o próximo ciclo]}

PERÍODO ATUAL (${current.from} a ${current.to}):
${metricsBlock(current)}

PERÍODO ANTERIOR (${previous.from} a ${previous.to}):
${metricsBlock(previous)}`;

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, message: result.message };
  const parsed = extractJson(result.text) as Record<string, unknown> | null;
  if (!parsed) return { ok: false, message: "Não foi possível interpretar a resposta da IA. Tente novamente." };
  return {
    ok: true,
    analysis: {
      achievements: list(parsed.achievements),
      patterns: list(parsed.patterns),
      attention: list(parsed.attention),
      suggestions: list(parsed.suggestions),
      basedOn: { label: current.label, from: current.from, to: current.to },
    },
  };
}
