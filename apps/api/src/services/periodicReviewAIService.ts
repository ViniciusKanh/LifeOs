import type { getDb } from "../db/client.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { computePeriodMetrics, shiftPeriodKey, type PeriodMetrics, type PeriodicKind } from "./periodicReviewService.js";
import { collectReviewEvidence, evidenceOptionsFor } from "./reviewEvidenceService.js";

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
  const evidence = await collectReviewEvidence(db, ownerId, current.from, dayAfter(current.to), evidenceOptionsFor(daysBetween(current.from, current.to)));

  const prompt = `Você é o LifeOS Copilot ajudando a fechar um ciclo (${current.label}).
Use EXCLUSIVAMENTE os números, as tarefas e o diário abaixo. Não invente métricas, datas ou fatos. Não afirme causalidade — use "coincidiu com", "junto com".
Cite tarefas, projetos e situações do diário pelo nome quando isso tornar a frase mais concreta.
Responda em português do Brasil, em JSON puro:
{"achievements": [até 4 frases curtas citando números reais do período],
 "patterns": [até 3 padrões observados comparando com o período anterior],
 "attention": [até 3 pontos de atenção baseados nos números],
 "suggestions": [até 3 sugestões práticas para o próximo ciclo]}

PERÍODO ATUAL (${current.from} a ${current.to}):
${metricsBlock(current)}

PERÍODO ANTERIOR (${previous.from} a ${previous.to}):
${metricsBlock(previous)}

O QUE ACONTECEU NO PERÍODO ATUAL:
${evidence.block}`;

  const result = await generateText(prompt, config, { timeoutMs: 50_000, retries: 1, maxOutputTokens: 4096 });
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

const dayAfter = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Rascunho da reflexão do ciclo (mensal/trimestral/anual) — nunca salvo sem o usuário revisar. */
export interface PeriodicReviewDraft {
  wins: string;
  lessons: string;
  focusNext: string;
  basedOn: { label: string; tasksDone: number; journalDays: number; projects: number };
}

const KIND_WORD: Record<PeriodicKind, { cycle: string; next: string }> = {
  monthly: { cycle: "mês", next: "próximo mês" },
  quarterly: { cycle: "trimestre", next: "próximo trimestre" },
  annual: { cycle: "ano", next: "próximo ano" },
};

/**
 * Escreve, na voz do usuário, as três reflexões do fechamento do ciclo a
 * partir das tarefas concluídas, pendências, hábitos, metas e do Diário.
 */
export async function draftPeriodicReview(
  db: Db,
  ownerId: string,
  kind: PeriodicKind,
  key: string,
): Promise<{ ok: true; draft: PeriodicReviewDraft } | { ok: false; message: string }> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini." };

  const [current, previous] = await Promise.all([
    computePeriodMetrics(db, ownerId, kind, key),
    computePeriodMetrics(db, ownerId, kind, shiftPeriodKey(kind, key, -1)),
  ]);
  const evidence = await collectReviewEvidence(db, ownerId, current.from, dayAfter(current.to), evidenceOptionsFor(daysBetween(current.from, current.to)));
  if (evidence.counts.tasksDone + evidence.counts.journalDays + current.habitCheckins + current.workouts + current.pagesRead === 0) {
    return { ok: false, message: "Ainda não há tarefas, diário ou hábitos registrados neste período para escrever a revisão." };
  }
  const w = KIND_WORD[kind];

  const prompt = [
    `Você é o LifeOS Copilot escrevendo, NA VOZ DO USUÁRIO (primeira pessoa), o rascunho da revisão do ${w.cycle} ${current.label}.`,
    "Fontes reais: números do período (e do anterior, para comparar), a lista de tarefas concluídas por projeto, pendências atrasadas, hábitos e o que ele escreveu no Diário.",
    "",
    "COMO ESCREVER:",
    `- Primeiro entenda a HISTÓRIA do ${w.cycle}: em quais projetos ele avançou, o que entregou, o que travou, o que o diário mostra sobre o período (fases, mudanças, dificuldades, alegrias).`,
    "- Escreva como alguém relembrando o próprio período: concreto, cita entregas e situações pelo nome, agrupa tarefas parecidas em uma frase.",
    "- Números entram como apoio (comparando com o período anterior quando houver diferença relevante), nunca como lista de métricas.",
    "- O diário traz contexto e sentimentos: use com fidelidade, sem dramatizar nem inventar.",
    "",
    "CAMPOS:",
    `- wins (O que deu certo): 1 a 2 parágrafos curtos. Principais conquistas e avanços do ${w.cycle}, por projeto/área, e bons momentos do diário.`,
    "- lessons (O que não funcionou e por quê): 1 parágrafo. Lacunas reais — pendências atrasadas (cite as principais), hábitos que caíram, quedas em relação ao período anterior, dificuldades relatadas no diário — e o padrão por trás delas, só se os dados mostrarem. Sem culpa, sem autoajuda.",
    `- focusNext (Foco do ${w.next}): 3 a 5 prioridades concretas, uma por linha começando com "- ", derivadas das pendências, projetos em andamento e intenções escritas no diário.`,
    "",
    "REGRAS:",
    "- Use SOMENTE os dados abaixo. Nunca invente tarefas, projetos, pessoas, números ou sentimentos. Não afirme causalidade.",
    "- Se houver poucos registros, reconheça com honestidade.",
    "- Sem markdown (exceto os hífens do focusNext), sem emojis. Português do Brasil.",
    "",
    `PERÍODO ATUAL (${current.from} a ${current.to}):`,
    metricsBlock(current),
    "",
    `PERÍODO ANTERIOR (${previous.from} a ${previous.to}):`,
    metricsBlock(previous),
    "",
    "O QUE ACONTECEU NO PERÍODO ATUAL:",
    evidence.block,
  ].join("\n");

  const result = await generateText(prompt, config, {
    responseSchema: {
      type: "OBJECT",
      properties: { wins: { type: "STRING" }, lessons: { type: "STRING" }, focusNext: { type: "STRING" } },
      required: ["wins", "lessons", "focusNext"],
    },
    timeoutMs: 60_000,
    retries: 1,
    maxOutputTokens: 6144,
  });
  if (!result.ok) return { ok: false, message: result.message };
  const parsed = extractJson(result.text) as Record<string, unknown> | null;
  const wins = str(parsed?.wins, 5000);
  const lessons = str(parsed?.lessons, 5000);
  const focusNext = str(parsed?.focusNext, 5000);
  if (!wins || !lessons || !focusNext) return { ok: false, message: "Não foi possível interpretar a resposta da IA. Tente novamente." };
  return {
    ok: true,
    draft: {
      wins,
      lessons,
      focusNext,
      basedOn: { label: current.label, tasksDone: evidence.counts.tasksDone, journalDays: evidence.counts.journalDays, projects: evidence.counts.projects },
    },
  };
}
