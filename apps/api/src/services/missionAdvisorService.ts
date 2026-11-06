import { nanoid } from "nanoid";
import type { Client } from "@libsql/client";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { extractJson, str } from "./aiJson.js";
import { userDayContext } from "./localDayService.js";
import { buildTaskGrants, getDifficultyRewards, getPriorityRewards, isDifficulty, syncContractStatus } from "./gamificationService.js";
import { insertTask, recomputePriorityScore } from "./taskWriteService.js";
import { getAccessibleProject } from "./projectAccessService.js";
import { computeCapacitySummary, getFreeWindows } from "./capacityPlannerService.js";
import { rankSemanticCandidates, type SearchEntityType } from "./embeddingsService.js";
import { automationConfig } from "./automationService.js";

/**
 * Conselheiro de Missões — agente que transforma um pedido em linguagem
 * natural numa missão completa e vinculada às entidades REAIS do usuário.
 *
 * Regras centrais:
 * - Vínculos só podem apontar para projetos/metas/contratos/campanhas que
 *   existem e pertencem ao usuário (a IA escolhe entre candidatos pré-filtrados;
 *   o servidor revalida cada id). A pontuação de aderência é uma medida de
 *   correspondência de texto, não uma probabilidade.
 * - XP e moedas vêm do motor oficial (buildTaskGrants + valores configurados).
 * - Nada é criado sem aprovação: propor (propose) e aplicar (apply) são
 *   chamadas separadas; a sessão guarda o que foi sugerido e o que foi gravado.
 * - Sem IA configurada, a proposta é montada por regras locais e isso é dito.
 */

export class AdvisorError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type AdvisorMode = "create" | "improve" | "sequence" | "breakdown";
export type DetailLevel = "rapido" | "padrao" | "tecnico" | "academico";
export type LinkType = "project" | "goal" | "contract" | "campaign";
type Priority = "Baixa" | "Média" | "Alta";
type Difficulty = "facil" | "medio" | "dificil" | "epico";

export interface LinkCandidate {
  type: LinkType;
  id: string;
  title: string;
  status: string;
  text: string;
  score: number;
  matched: string[];
}
export interface ProposalLink {
  id: string | null;
  title: string | null;
  score: number | null;
  reason: string;
  alternatives: Array<{ id: string; title: string; score: number }>;
}
export interface ProposalSubtask {
  title: string;
  description: string | null;
  estimateMinutes: number | null;
  dependsOn: number | null;
  dueDate: string | null;
}
export interface ScheduleBlock {
  date: string;
  start: string;
  end: string;
  minutes: number;
}
export interface MissionProposal {
  title: string;
  context: string;
  objective: string;
  scope: string;
  deliverable: string;
  expectedResult: string;
  steps: string[];
  acceptanceCriteria: string[];
  category: string;
  tags: string[];
  lifeArea: string | null;
  priority: Priority;
  difficulty: Difficulty;
  estimateMinutes: number;
  startDate: string;
  dueDate: string | null;
  status: "Backlog" | "A Fazer";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  subtasks: ProposalSubtask[];
  dependsOn: number | null;
  links: Record<LinkType, ProposalLink>;
  schedule: {
    feasible: boolean;
    hypothesis: boolean;
    finishDate: string | null;
    blocks: ScheduleBlock[];
    freeMinutesUntilDue: number | null;
    conflicts: string[];
    alternatives: Array<{ label: string; dueDate?: string; estimateMinutes?: number }>;
  };
  reward: { xp: number; coins: number; basis: string; bonuses: string[] };
  justification: Array<{ field: string; text: string }>;
  confirmed: string[];
}
export interface AdvisorResult {
  sessionId: string;
  mode: AdvisorMode;
  message: string;
  items: MissionProposal[];
  targetTaskId: string | null;
  ai: { used: boolean; status: "ok" | "indisponivel" | "erro"; detail: string };
  context: { projects: number; goals: number; contracts: number; campaigns: number; linksEnabled: boolean; scheduleEnabled: boolean };
}

/* ───────────────────────────── texto ───────────────────────────── */

const STOP = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para pra pro com sem sobre e ou que se meu minha meus minhas seu sua seus suas eu voce hoje amanha preciso quero vou tenho fazer ter ser estar mais menos muito pouco ao aos ate como quando onde isso essa esse este esta dia dias hora horas min minutos semana mes ano melhorar organizar".split(
    " ",
  ),
);
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
/** Tokens com radical curto (corta sufixos comuns do português) para casar "estudar"/"estudos". */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .map((t) => (t.length > 6 ? t.slice(0, 6) : t.replace(/(oes|aes|es|s)$/, "")));
}

/**
 * Aderência lexical: fração da "informação" (idf) do pedido que aparece no
 * texto da entidade. 0–1, comparável entre entidades do mesmo pedido.
 */
export function lexicalScores(query: string, docs: Array<{ key: string; text: string; title: string }>) {
  const q = [...new Set(tokens(query))];
  const docTokens = docs.map((d) => ({ key: d.key, all: new Set(tokens(`${d.title} ${d.title} ${d.text}`)) }));
  const N = Math.max(1, docs.length);
  const idf = (t: string) => {
    const df = docTokens.filter((d) => d.all.has(t)).length;
    return Math.log(1 + (N + 1) / (df + 0.5));
  };
  const total = q.reduce((s, t) => s + idf(t), 0) || 1;
  return docTokens.map((d) => {
    const matched = q.filter((t) => d.all.has(t));
    return { key: d.key, score: matched.reduce((s, t) => s + idf(t), 0) / total, matched };
  });
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dowOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** Duração citada no texto ("2 horas", "1h30", "45 min", "meia hora"). */
export function parseDuration(text: string): number | null {
  const t = normalize(text);
  if (/meia hora/.test(t)) return 30;
  const hm = t.match(/(\d+)\s*h\s*(\d{1,2})\b/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hr|hrs|hora|horas)/);
  const words: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };
  const hw = t.match(/\b(uma|um|duas|dois|tres|quatro|cinco|seis)\s+horas?\b/);
  const m = t.match(/(\d+)\s*(?:min|minutos?)\b/);
  let total = 0;
  if (h) total += Math.round(Number(h[1].replace(",", ".")) * 60);
  else if (hw) total += words[hw[1]] * 60;
  if (m) total += Number(m[1]);
  return total > 0 ? Math.min(total, 60 * 40) : null;
}

/** Prazo citado no texto, relativo ao dia local do usuário. */
export function parseDue(text: string, today: string): { date: string; time: string | null } | null {
  const t = normalize(text);
  const time = (() => {
    const m = t.match(/\b(?:ate|as|até)\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/) ?? t.match(/\b(\d{1,2})h(\d{2})?\b/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2] ?? m[3] ?? 0);
    return hh <= 23 && mm <= 59 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
  })();
  if (/depois de amanha/.test(t)) return { date: addDays(today, 2), time };
  if (/\bamanha\b/.test(t)) return { date: addDays(today, 1), time };
  if (/\bhoje\b/.test(t)) return { date: today, time };
  const inN = t.match(/em\s+(\d+)\s+dias?/);
  if (inN) return { date: addDays(today, Number(inN[1])), time };
  if (/semana que vem|proxima semana/.test(t)) return { date: addDays(today, 7), time };
  if (/fim do mes|final do mes/.test(t)) {
    const d = new Date(`${today}T12:00:00Z`);
    return { date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10), time };
  }
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : Number(today.slice(0, 4));
    const iso = `${y}-${String(Number(dm[2])).padStart(2, "0")}-${String(Number(dm[1])).padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(iso))) return { date: iso < today && !dm[3] ? `${y + 1}${iso.slice(4)}` : iso, time };
  }
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}(-feira)?\\b`).test(t)) {
      let delta = (dow - dowOf(today) + 7) % 7;
      if (delta === 0) delta = 7;
      return { date: addDays(today, delta), time };
    }
  }
  return null;
}

export function parseRecurrence(text: string): MissionProposal["recurrence"] {
  const t = normalize(text);
  if (/todo dia|todos os dias|diariamente|diaria\b/.test(t)) return "daily";
  if (/toda semana|todas as semanas|semanalmente|toda (segunda|terca|quarta|quinta|sexta|sabado|domingo)/.test(t)) return "weekly";
  if (/todo mes|todos os meses|mensalmente/.test(t)) return "monthly";
  return "none";
}
const RECURRENCE_RULE: Record<MissionProposal["recurrence"], string | null> = { none: null, daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY;BYDAY=MO", monthly: "FREQ=MONTHLY" };

/** Dificuldade pelo esforço e escopo (complexidade). */
export function difficultyFor(estimate: number, subtasks: number): Difficulty {
  const bump = subtasks >= 6 ? 1 : 0;
  const base = estimate <= 30 ? 0 : estimate <= 120 ? 1 : estimate <= 360 ? 2 : 3;
  return (["facil", "medio", "dificil", "epico"] as const)[Math.min(3, base + bump)];
}

/** Prioridade guiada por prazo e relevância (não pela dificuldade). */
export function priorityFor(input: { text: string; due: string | null; today: string; linkedToGoalOrContract: boolean }): { value: Priority; reason: string } {
  const t = normalize(input.text);
  if (/urgente|prioridade alta|muito importante|critico/.test(t)) return { value: "Alta", reason: "Você indicou urgência no pedido." };
  if (/sem pressa|quando der|baixa prioridade/.test(t)) return { value: "Baixa", reason: "Você indicou que não há pressa." };
  if (input.due) {
    const days = Math.round((Date.parse(`${input.due}T12:00:00Z`) - Date.parse(`${input.today}T12:00:00Z`)) / 86_400_000);
    if (days <= 1) return { value: "Alta", reason: "O prazo é hoje ou amanhã." };
    if (days <= 4) return { value: "Média", reason: `O prazo é em ${days} dias.` };
  }
  if (input.linkedToGoalOrContract) return { value: "Média", reason: "Contribui para uma meta ou contrato ativo." };
  return { value: input.due ? "Média" : "Baixa", reason: input.due ? "Há prazo, mas com folga." : "Sem prazo nem vínculo estratégico." };
}

function categoryOf(text: string): { category: string; area: string | null } {
  const t = normalize(text);
  if (/estud|aula|curso|prova|machine|learning|aprend|ler artigo|revisar materia|disciplina/.test(t)) return { category: "Estudo", area: "Educação" };
  if (/treino|academia|corrida|caminhada|exercicio|alongamento/.test(t)) return { category: "Saúde", area: "Saúde" };
  if (/readme|documenta|relatorio|artigo|escrever|texto|post|publicacao|linkedin|tcc|dissertacao/.test(t)) return { category: "Escrita", area: "Profissional" };
  if (/codigo|bug|deploy|api|sistema|refator|implementar|teste/.test(t)) return { category: "Desenvolvimento", area: "Profissional" };
  if (/reuniao|cliente|apresenta|slides/.test(t)) return { category: "Trabalho", area: "Profissional" };
  if (/livro|leitura|ler\b/.test(t)) return { category: "Leitura", area: "Leitura" };
  if (/conta|pagar|banco|financ|imposto/.test(t)) return { category: "Administração", area: "Finanças" };
  return { category: "Geral", area: null };
}

const STEP_LIBRARY: Record<string, string[]> = {
  Estudo: ["Separar o material e definir o tópico da sessão", "Estudar a teoria principal com anotações", "Praticar com exercícios ou código", "Registrar dúvidas e o que aprendeu", "Lançar a sessão em Educação"],
  Escrita: ["Levantar o conteúdo e as referências", "Montar a estrutura (tópicos e seções)", "Escrever a primeira versão", "Revisar clareza, links e formatação", "Publicar ou entregar a versão final"],
  Desenvolvimento: ["Entender o requisito e o comportamento esperado", "Implementar a mudança", "Escrever ou ajustar testes", "Revisar o código e a documentação", "Validar o resultado final"],
  Trabalho: ["Definir o objetivo e a pauta", "Preparar o material de apoio", "Executar a atividade", "Registrar decisões e próximos passos"],
  Saúde: ["Preparar o necessário", "Executar a atividade", "Registrar em Saúde"],
  Leitura: ["Escolher o trecho da leitura", "Ler com anotações", "Registrar páginas e aprendizados na Biblioteca"],
  Administração: ["Reunir documentos e informações", "Executar o procedimento", "Guardar comprovantes e registrar"],
  Geral: ["Definir o resultado esperado", "Executar a parte principal", "Revisar e ajustar", "Registrar a conclusão"],
};

/** Título objetivo a partir do pedido (sem "preciso", "quero"...). */
export function titleFrom(text: string): string {
  let t = text.trim().replace(/\s+/g, " ");
  t = t.replace(/^(eu\s+)?(preciso|quero|tenho que|vou|gostaria de|devo)\s+/i, "");
  t = t.split(/[.!?]/)[0] ?? t;
  t = t.replace(/\s+(hoje|amanh[ãa]|at[ée] .+)$/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 90 ? `${t.slice(0, 87).trimEnd()}...` : t;
}

/** Descrição profissional montada a partir das seções (o texto salvo na tarefa). */
export function composeDescription(p: Pick<MissionProposal, "context" | "objective" | "scope" | "deliverable" | "expectedResult" | "steps" | "acceptanceCriteria">): string {
  const lines: string[] = [];
  if (p.context) lines.push(`Contexto: ${p.context}`);
  if (p.objective) lines.push(`Objetivo: ${p.objective}`);
  if (p.scope) lines.push(`Escopo: ${p.scope}`);
  if (p.deliverable) lines.push(`Entregável: ${p.deliverable}`);
  if (p.expectedResult) lines.push(`Resultado esperado: ${p.expectedResult}`);
  if (p.steps.length) lines.push("", "Passos de execução:", ...p.steps.map((s, i) => `${i + 1}. ${s}`));
  if (p.acceptanceCriteria.length) lines.push("", "Critérios de conclusão:", ...p.acceptanceCriteria.map((c) => `- ${c}`));
  return lines.join("\n").slice(0, 5000);
}

/* ───────────────────────────── contexto ───────────────────────────── */

interface Ctx {
  today: string;
  candidates: LinkCandidate[];
  all: Record<LinkType, Array<{ id: string; title: string; status: string; text: string }>>;
}

async function loadEntities(db: Client, ownerId: string): Promise<Ctx["all"]> {
  const [p, g, c, k] = await Promise.all([
    db.execute({
      sql: `SELECT id, name AS title, status, COALESCE(description,'') || ' ' || COALESCE(objective,'') || ' ' || COALESCE(tags,'') || ' ' || COALESCE(area,'') || ' ' || COALESCE(kind,'') AS text
            FROM projects WHERE owner_id = ? AND archived_at IS NULL AND COALESCE(status,'active') NOT IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 80`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, title, status, COALESCE(description,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(life_area,'') || ' ' || COALESCE(next_action,'') AS text
            FROM goals WHERE owner_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 80`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, title, status, COALESCE(description,'') || ' ' || COALESCE(objective,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(why,'') AS text
            FROM contracts WHERE owner_id = ? AND COALESCE(is_draft,0) = 0 AND status = 'ativo' AND cancelled_at IS NULL ORDER BY updated_at DESC LIMIT 60`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, title, status, COALESCE(description,'') || ' ' || COALESCE(life_area,'') AS text
            FROM campaigns WHERE owner_id = ? AND status IN ('planned','active') ORDER BY updated_at DESC LIMIT 40`,
      args: [ownerId],
    }),
  ]);
  const rows = (r: { rows: unknown[] }) => (r.rows as Array<Record<string, unknown>>).map((x) => ({ id: String(x.id), title: String(x.title ?? ""), status: String(x.status ?? ""), text: String(x.text ?? "") }));
  return { project: rows(p), goal: rows(g), contract: rows(c), campaign: rows(k) };
}

const SEMANTIC_TYPE: Record<LinkType, SearchEntityType> = { project: "project", goal: "goal", contract: "contract", campaign: "campaign" };

/** Recuperação híbrida: aderência lexical + similaridade semântica (quando o Gemini está configurado). */
async function rankCandidates(ownerId: string, query: string, all: Ctx["all"], useSemantic: boolean): Promise<LinkCandidate[]> {
  const flat = (Object.keys(all) as LinkType[]).flatMap((type) => all[type].map((e) => ({ ...e, type, key: `${type}:${e.id}` })));
  if (!flat.length) return [];
  const lex = new Map(lexicalScores(query, flat.map((f) => ({ key: f.key, text: f.text, title: f.title }))).map((s) => [s.key, s]));
  const sem = new Map<string, number>();
  if (useSemantic) {
    const matches = await rankSemanticCandidates(
      ownerId,
      query,
      flat.map((f) => ({ entityType: SEMANTIC_TYPE[f.type], entityId: f.id, text: `${f.title}. ${f.text}`.slice(0, 1500) })),
      30,
    ).catch(() => []);
    for (const m of matches) sem.set(`${m.entityType}:${m.entityId}`, m.similarity);
  }
  return flat
    .map((f) => {
      const l = lex.get(f.key)!;
      const s = sem.get(f.key);
      // Similaridade de embeddings costuma ficar entre 0,5 e 0,9: reescala para 0–1 antes de combinar.
      const semN = s == null ? null : Math.max(0, Math.min(1, (s - 0.55) / 0.35));
      const score = semN == null ? l.score : 0.55 * l.score + 0.45 * semN;
      return { type: f.type, id: f.id, title: f.title, status: f.status, text: f.text.slice(0, 300), score: Math.round(score * 1000) / 1000, matched: l.matched };
    })
    .sort((a, b) => b.score - a.score);
}

/** Limiar mínimo: pelo menos um termo relevante em comum e aderência ≥ 0,2. */
const LINK_MIN = 0.2;

function pickLink(type: LinkType, cands: LinkCandidate[], chosenId: string | null, aiReason: string | null): ProposalLink {
  const list = cands.filter((c) => c.type === type);
  const alternatives = list.filter((c) => c.score >= LINK_MIN * 0.75).slice(0, 3).map((c) => ({ id: c.id, title: c.title, score: c.score }));
  const chosen = chosenId ? list.find((c) => c.id === chosenId) : list[0];
  if (!chosen || chosen.score < (chosenId ? LINK_MIN * 0.75 : LINK_MIN) || !chosen.matched.length) {
    return { id: null, title: null, score: null, reason: list.length ? "Não encontrei um vínculo suficientemente adequado." : `Você não tem ${LABEL[type]} ativo para vincular.`, alternatives };
  }
  return {
    id: chosen.id,
    title: chosen.title,
    score: chosen.score,
    reason: aiReason ?? `O pedido fala do mesmo assunto de “${chosen.title}” (${chosen.matched.length} termo(s) em comum, aderência ${Math.round(chosen.score * 100)}%).`,
    alternatives: alternatives.filter((a) => a.id !== chosen.id),
  };
}
const LABEL: Record<LinkType, string> = { project: "projeto", goal: "meta", contract: "contrato", campaign: "campanha" };

/* ───────────────────────────── prazos e capacidade ───────────────────────────── */

/**
 * Distribui a duração nos dias livres a partir do início, respeitando a janela
 * de trabalho, eventos fixos e carga já planejada. Se o prazo pedido não couber,
 * devolve o conflito e alternativas — nunca altera a Agenda.
 */
export async function planSchedule(db: Client, ownerId: string, input: { start: string; due: string | null; minutes: number; hypothesis: boolean; today: string }): Promise<MissionProposal["schedule"]> {
  const horizon = Math.min(21, Math.max(3, input.due ? Math.round((Date.parse(input.due) - Date.parse(input.start)) / 86_400_000) + 4 : 10));
  const blocks: ScheduleBlock[] = [];
  let remaining = input.minutes;
  let freeUntilDue = 0;
  let finish: string | null = null;
  const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const toHH = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (let i = 0; i < horizon && (remaining > 0 || (input.due && addDays(input.start, i) <= input.due)); i++) {
    const day = addDays(input.start, i);
    const [cap, windows] = await Promise.all([computeCapacitySummary(db, ownerId, day), getFreeWindows(db, ownerId, day)]);
    // Capacidade real do dia = livre na agenda − carga já planejada.
    let dayFree = Math.max(0, cap.freeMinutes - cap.plannedMinutes);
    if (input.due && day <= input.due) freeUntilDue += dayFree;
    for (const w of windows) {
      if (remaining <= 0 || dayFree <= 0) break;
      let s = toMin(w.start);
      if (day === input.today) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        s = Math.max(s, Math.ceil(nowMin / 15) * 15);
      }
      const e = toMin(w.end);
      const len = Math.min(e - s, remaining, dayFree, 120);
      if (len < 25) continue;
      blocks.push({ date: day, start: toHH(s), end: toHH(s + len), minutes: len });
      remaining -= len;
      dayFree -= len;
      if (remaining <= 0) finish = day;
    }
  }
  const conflicts: string[] = [];
  const alternatives: MissionProposal["schedule"]["alternatives"] = [];
  const feasible = remaining <= 0 && (!input.due || (finish !== null && finish <= input.due));
  if (!feasible) {
    if (input.due) {
      conflicts.push(`Até ${input.due} há cerca de ${freeUntilDue} min livres na sua capacidade cadastrada, para ${input.minutes} min de esforço.`);
      if (finish) alternatives.push({ label: `Mover o prazo para ${finish}`, dueDate: finish });
      if (freeUntilDue >= 25) alternatives.push({ label: `Reduzir o escopo para ~${Math.max(25, Math.floor(freeUntilDue / 5) * 5)} min`, estimateMinutes: Math.max(25, Math.floor(freeUntilDue / 5) * 5) });
      alternatives.push({ label: "Manter o prazo e aceitar sobrecarga" });
    } else {
      conflicts.push(`Não encontrei espaço suficiente nos próximos ${horizon} dias para ${input.minutes} min.`);
    }
  }
  return { feasible, hypothesis: input.hypothesis, finishDate: finish, blocks: blocks.slice(0, 12), freeMinutesUntilDue: input.due ? freeUntilDue : null, conflicts, alternatives };
}

/* ───────────────────────────── recompensa oficial ───────────────────────────── */

export async function estimateReward(db: Client, ownerId: string, p: { priority: Priority; difficulty: Difficulty; dueDate: string | null; title: string }, today: string): Promise<MissionProposal["reward"]> {
  const diff = (await getDifficultyRewards(db, ownerId))[p.difficulty];
  const pr = await getPriorityRewards(db, ownerId);
  const grants = buildTaskGrants({
    taskId: "preview",
    title: p.title,
    priority: p.priority,
    dueDate: p.dueDate,
    projectId: null,
    dayKey: today,
    isMainMission: false,
    difficultyReward: diff ? { xp: diff.taskXp, coins: diff.taskCoins } : null,
    priorityReward: pr[p.priority] ?? null,
  });
  const [base, ...rest] = grants;
  return {
    xp: base?.xp ?? 0,
    coins: base?.coins ?? 0,
    basis: `Valor da dificuldade “${p.difficulty}” nas suas configurações de recompensa.`,
    bonuses: rest.map((g) => `+${g.xp} XP ${g.eventType === "daily_mission" ? "se concluída no dia do prazo" : g.eventType === "before_deadline" ? "se concluída antes do prazo" : g.label}`),
  };
}

/* ───────────────────────────── IA ───────────────────────────── */

const MISSION_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    missions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          context: { type: "string" },
          objective: { type: "string" },
          scope: { type: "string" },
          deliverable: { type: "string" },
          expectedResult: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
          category: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          priority: { type: "string", enum: ["Baixa", "Média", "Alta"] },
          difficulty: { type: "string", enum: ["facil", "medio", "dificil", "epico"] },
          estimateMinutes: { type: "integer" },
          dueDate: { type: "string" },
          recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
          subtasks: {
            type: "array",
            items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, estimateMinutes: { type: "integer" }, dependsOn: { type: "integer" } }, required: ["title"] },
          },
          projectId: { type: "string" },
          goalId: { type: "string" },
          contractId: { type: "string" },
          campaignId: { type: "string" },
          projectReason: { type: "string" },
          goalReason: { type: "string" },
          contractReason: { type: "string" },
          campaignReason: { type: "string" },
          difficultyReason: { type: "string" },
          estimateReason: { type: "string" },
          dependsOnPrevious: { type: "boolean" },
        },
        required: ["title", "objective", "steps", "acceptanceCriteria", "estimateMinutes", "difficulty"],
      },
    },
  },
  required: ["reply", "missions"],
};

const DETAIL_TEXT: Record<DetailLevel, string> = {
  rapido: "Seja breve: descrição curta, 2 a 3 passos e 2 critérios.",
  padrao: "Nível padrão: contexto, objetivo, escopo, entregável, 3 a 6 passos e 3 a 5 critérios verificáveis.",
  tecnico: "Nível técnico: termos técnicos precisos, passos detalhados e critérios verificáveis (testes, métricas, artefatos).",
  academico: "Nível acadêmico: linguagem formal, metodologia, referências a buscar e critérios de rigor (citações, revisão).",
};

interface AiMission {
  title?: unknown;
  context?: unknown;
  objective?: unknown;
  scope?: unknown;
  deliverable?: unknown;
  expectedResult?: unknown;
  steps?: unknown;
  acceptanceCriteria?: unknown;
  category?: unknown;
  tags?: unknown;
  priority?: unknown;
  difficulty?: unknown;
  estimateMinutes?: unknown;
  dueDate?: unknown;
  recurrence?: unknown;
  subtasks?: unknown;
  projectId?: unknown;
  goalId?: unknown;
  contractId?: unknown;
  campaignId?: unknown;
  projectReason?: unknown;
  goalReason?: unknown;
  contractReason?: unknown;
  campaignReason?: unknown;
  difficultyReason?: unknown;
  estimateReason?: unknown;
  dependsOnPrevious?: unknown;
}

const strList = (v: unknown, max: number, len = 300) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter((x): x is string => !!x).slice(0, max) : []);

function buildPrompt(input: { mode: AdvisorMode; message: string; detail: DetailLevel; today: string; candidates: LinkCandidate[]; current: MissionProposal[] | null; task: Record<string, unknown> | null; history: Array<{ role: string; text: string }> }) {
  const byType = (t: LinkType) =>
    input.candidates
      .filter((c) => c.type === t)
      .slice(0, 6)
      .map((c) => `  - id=${c.id} | ${c.title} | status=${c.status} | aderência=${c.score} | ${c.text.replace(/\s+/g, " ").slice(0, 160)}`)
      .join("\n") || "  (nenhum candidato)";
  const modeText: Record<AdvisorMode, string> = {
    create: "Crie UMA missão completa a partir do pedido.",
    improve: "Melhore a missão existente abaixo: título mais objetivo, descrição profissional, critérios, estimativa e vínculos. Mantenha o propósito original.",
    sequence: "Planeje uma SEQUÊNCIA de 2 a 6 missões encadeadas para atingir o objetivo do pedido. Marque dependsOnPrevious quando uma depender da anterior.",
    breakdown: "Quebre a missão em 3 a 8 etapas (subtasks) concretas, com estimativa e dependência (índice da etapa anterior, base 0) quando houver. Devolva UMA missão com as etapas.",
  };
  return `Você é o Conselheiro de Missões do LifeOS (app de produtividade pessoal em português do Brasil).
${modeText[input.mode]}
${DETAIL_TEXT[input.detail]}
Hoje é ${input.today}. Datas no formato YYYY-MM-DD. Estimativas em minutos.
REGRAS:
- Use SOMENTE ids dos candidatos listados para projectId/goalId/contractId/campaignId. Se nenhum combinar de verdade com o objetivo, devolva "" — não vincule só por palavras parecidas.
- Justifique cada vínculo escolhido em uma frase (projectReason etc.).
- Não invente fatos, resultados ou trabalho já realizado. Descreva o que será feito.
- Título objetivo com verbo no infinitivo. Critérios de conclusão verificáveis.
- Dificuldade pela complexidade, esforço, dependências e escopo (facil/medio/dificil/epico).
- Se o pedido citar duração ou prazo, respeite.
- "reply": 1 a 2 frases dizendo o que foi proposto (sem markdown).
CANDIDATOS (aderência é correspondência de texto, não probabilidade):
PROJETOS:
${byType("project")}
METAS:
${byType("goal")}
CONTRATOS:
${byType("contract")}
CAMPANHAS:
${byType("campaign")}
${input.task ? `MISSÃO EXISTENTE: ${JSON.stringify(input.task).slice(0, 2500)}` : ""}
${input.current ? `PROPOSTA ATUAL (o usuário pede um ajuste; mantenha os campos confirmados ${JSON.stringify(input.current[0]?.confirmed ?? [])} exatamente iguais): ${JSON.stringify(input.current.map((m) => ({ ...m, schedule: undefined, reward: undefined, links: Object.fromEntries(Object.entries(m.links).map(([k, l]) => [k, l.id])) }))).slice(0, 5000)}` : ""}
${input.history.length ? `CONVERSA ANTERIOR:\n${input.history.slice(-6).map((h) => `${h.role}: ${h.text.slice(0, 400)}`).join("\n")}` : ""}
PEDIDO DO USUÁRIO: ${input.message.slice(0, 2000)}`;
}

/* ───────────────────────────── montagem da proposta ───────────────────────────── */

async function finalize(
  db: Client,
  ownerId: string,
  raw: AiMission,
  ctx: { today: string; message: string; candidates: LinkCandidate[]; linksEnabled: boolean; scheduleEnabled: boolean; detail: DetailLevel; ai: boolean; index: number; prev: MissionProposal | null; confirmed: string[] },
): Promise<MissionProposal> {
  const cat = categoryOf(`${ctx.message} ${str(raw.title, 200) ?? ""}`);
  const title = str(raw.title, 200) ?? titleFrom(ctx.message);
  const parsedDur = ctx.index === 0 ? parseDuration(ctx.message) : null;
  const aiEst = typeof raw.estimateMinutes === "number" && raw.estimateMinutes > 0 ? Math.round(Math.min(2400, raw.estimateMinutes)) : null;
  const subtasks: ProposalSubtask[] = (Array.isArray(raw.subtasks) ? raw.subtasks : [])
    .slice(0, 12)
    .map((s) => s as Record<string, unknown>)
    .map((s, i) => ({
      title: str(s.title, 200) ?? `Etapa ${i + 1}`,
      description: str(s.description, 800),
      estimateMinutes: typeof s.estimateMinutes === "number" && s.estimateMinutes > 0 ? Math.round(Math.min(960, s.estimateMinutes)) : null,
      dependsOn: typeof s.dependsOn === "number" && s.dependsOn >= 0 && s.dependsOn < i ? s.dependsOn : null,
      dueDate: null,
    }));
  const subSum = subtasks.reduce((s, x) => s + (x.estimateMinutes ?? 0), 0);
  // Duração dita pelo usuário vence a estimativa da IA; sem nenhuma fonte, é hipótese.
  const estimate = parsedDur ?? aiEst ?? (subSum > 0 ? subSum : 60);
  const hypothesis = parsedDur == null && aiEst == null && subSum === 0;
  const due = ctx.index === 0 ? parseDue(ctx.message, ctx.today) : null;
  const aiDue = typeof raw.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) && raw.dueDate >= ctx.today ? raw.dueDate : null;
  const dueDate = due?.date ?? aiDue;

  const links = {} as Record<LinkType, ProposalLink>;
  for (const t of ["project", "goal", "contract", "campaign"] as LinkType[]) {
    const id = str((raw as Record<string, unknown>)[`${t}Id`], 64);
    const reason = str((raw as Record<string, unknown>)[`${t}Reason`], 300);
    links[t] = ctx.linksEnabled ? pickLink(t, ctx.candidates, id, id ? reason : null) : { id: null, title: null, score: null, reason: "Vínculo inteligente desativado nas automações. Escolha manualmente.", alternatives: [] };
  }
  const pr = priorityFor({ text: ctx.message, due: dueDate, today: ctx.today, linkedToGoalOrContract: !!(links.goal.id || links.contract.id) });
  const aiPriority = raw.priority === "Baixa" || raw.priority === "Média" || raw.priority === "Alta" ? raw.priority : null;
  // Prazo e relevância decidem; a sugestão da IA só vale quando não há prazo nem pedido explícito.
  const priority: Priority = dueDate || /urgente|sem pressa|quando der|prioridade/i.test(normalize(ctx.message)) ? pr.value : (aiPriority ?? pr.value);
  const difficulty: Difficulty = isDifficulty(raw.difficulty) ? (raw.difficulty as Difficulty) : difficultyFor(estimate, subtasks.length);
  const steps = strList(raw.steps, 10);
  const criteria = strList(raw.acceptanceCriteria, 8);
  const objective = str(raw.objective, 600) ?? `Concluir: ${title}.`;
  const recurrence = ((): MissionProposal["recurrence"] => {
    const fromText = parseRecurrence(ctx.message);
    if (fromText !== "none") return fromText;
    return raw.recurrence === "daily" || raw.recurrence === "weekly" || raw.recurrence === "monthly" ? raw.recurrence : "none";
  })();
  const start = ctx.prev?.schedule.finishDate && raw.dependsOnPrevious ? ctx.prev.schedule.finishDate : ctx.today;
  const schedule = ctx.scheduleEnabled
    ? await planSchedule(db, ownerId, { start, due: dueDate, minutes: estimate, hypothesis, today: ctx.today })
    : { feasible: true, hypothesis: true, finishDate: null, blocks: [], freeMinutesUntilDue: null, conflicts: ["Planejamento de prazos desativado nas automações."], alternatives: [] };
  const reward = await estimateReward(db, ownerId, { priority, difficulty, dueDate, title }, ctx.today);
  const justification: MissionProposal["justification"] = [
    { field: "Prioridade", text: pr.reason },
    { field: "Dificuldade", text: str(raw.difficultyReason, 300) ?? `Esforço de ${estimate} min${subtasks.length ? ` em ${subtasks.length} etapas` : ""}.` },
    { field: "Duração", text: parsedDur != null ? "Duração informada por você." : (str(raw.estimateReason, 300) ?? (hypothesis ? "Hipótese inicial de 60 min — ajuste se souber o tamanho real." : "Estimativa a partir das etapas.")) },
    { field: "Prazo", text: due ? "Prazo citado no pedido." : aiDue ? "Prazo sugerido pelo conselheiro — confirme." : "Sem prazo informado: defina se houver compromisso." },
  ];
  for (const t of ["project", "goal", "contract", "campaign"] as LinkType[]) if (links[t].id) justification.push({ field: LABEL[t][0].toUpperCase() + LABEL[t].slice(1), text: links[t].reason });
  return {
    title,
    context: str(raw.context, 800) ?? "",
    objective,
    scope: str(raw.scope, 800) ?? "",
    deliverable: str(raw.deliverable, 400) ?? "",
    expectedResult: str(raw.expectedResult, 400) ?? "",
    steps,
    acceptanceCriteria: criteria,
    category: str(raw.category, 40) ?? cat.category,
    tags: strList(raw.tags, 6, 30),
    lifeArea: cat.area,
    priority,
    difficulty,
    estimateMinutes: estimate,
    startDate: schedule.blocks[0]?.date ?? start,
    dueDate,
    status: ctx.index === 0 && (dueDate === ctx.today || schedule.blocks[0]?.date === ctx.today) ? "A Fazer" : "Backlog",
    recurrence,
    subtasks,
    dependsOn: raw.dependsOnPrevious && ctx.index > 0 ? ctx.index - 1 : null,
    links,
    schedule,
    reward,
    justification,
    confirmed: ctx.confirmed,
  };
}

/** Proposta sem IA: regras locais + biblioteca de passos por categoria. */
function ruleBasedMission(mode: AdvisorMode, message: string, detail: DetailLevel, task: Record<string, unknown> | null): AiMission[] {
  const base = task ? `${String(task.title ?? "")}. ${String(task.description ?? "")}` : message;
  const { category } = categoryOf(`${base} ${message}`);
  const steps = STEP_LIBRARY[category] ?? STEP_LIBRARY.Geral!;
  const n = detail === "rapido" ? 3 : detail === "padrao" ? 4 : steps.length;
  const title = task ? String(task.title ?? titleFrom(message)) : titleFrom(message);
  const mission: AiMission = {
    title,
    context: task ? `Missão existente revisada pelo conselheiro.` : `Pedido registrado no Conselheiro de Missões: “${message.slice(0, 200)}”.`,
    objective: `Concluir “${title}” com um resultado verificável.`,
    scope: detail === "rapido" ? "" : "Inclui as etapas listadas; ajustes fora disso viram nova missão.",
    deliverable: category === "Estudo" ? "Sessão registrada com anotações do que foi aprendido." : category === "Escrita" ? "Versão final revisada e publicada/entregue." : "Resultado da missão registrado como concluído.",
    expectedResult: "",
    steps: steps.slice(0, n),
    acceptanceCriteria: ["As etapas planejadas foram executadas", "O resultado foi revisado", ...(detail === "tecnico" || detail === "academico" ? ["Há evidência (anotação, arquivo ou link) do que foi feito"] : [])],
    subtasks: mode === "breakdown" || (mode !== "improve" && detail !== "rapido") ? steps.map((s, i) => ({ title: s, dependsOn: i > 0 ? i - 1 : undefined })) : [],
  };
  if (mode === "sequence") {
    return steps.slice(0, 4).map((s, i) => ({ ...mission, title: `${s}${i === 0 ? ` — ${title}` : ""}`.slice(0, 200), subtasks: [], steps: [s], dependsOnPrevious: i > 0 }));
  }
  return [mission];
}

/* ───────────────────────────── sessões ───────────────────────────── */

async function loadTask(db: Client, ownerId: string, taskId: string) {
  const r = await db.execute({ sql: "SELECT id, title, description, priority, difficulty, estimate_minutes, due_date, start_date, status, project_id, goal_id, contract_id FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
  if (!r.rows[0]) throw new AdvisorError("Missão não encontrada.", 404);
  return r.rows[0] as unknown as Record<string, unknown>;
}

export interface ProposeInput {
  mode: AdvisorMode;
  message: string;
  detail: DetailLevel;
  sessionId?: string | null;
  taskId?: string | null;
  current?: MissionProposal[] | null;
  confirmed?: string[];
  source?: "missions" | "review";
  sourceRef?: string | null;
}

/** Gera (ou refina) a proposta. Não grava nenhuma missão: só a sessão do conselheiro. */
export async function propose(db: Client, ownerId: string, input: ProposeInput): Promise<AdvisorResult> {
  const { today } = await userDayContext(db, ownerId);
  if ((input.mode === "improve" || input.mode === "breakdown") && !input.taskId) throw new AdvisorError("Escolha a missão a melhorar ou quebrar.");
  const task = input.taskId ? await loadTask(db, ownerId, input.taskId) : null;
  const [linkCfg, scheduleCfg] = await Promise.all([automationConfig(db, ownerId, "missions", "smart_links"), automationConfig(db, ownerId, "missions", "deadline_planning")]);
  const all = await loadEntities(db, ownerId);
  const config = await getGeminiConfig();
  const query = `${input.message} ${task ? `${task.title ?? ""} ${task.description ?? ""}` : ""}`;
  const candidates = linkCfg.enabled ? await rankCandidates(ownerId, query, all, !!config) : [];

  let session: { id: string; messages: Array<{ role: string; text: string }> };
  if (input.sessionId) {
    const s = await db.execute({ sql: "SELECT id, messages_json FROM mission_advisor_sessions WHERE id = ? AND owner_id = ?", args: [input.sessionId, ownerId] });
    if (!s.rows[0]) throw new AdvisorError("Sessão do conselheiro não encontrada.", 404);
    session = { id: String(s.rows[0].id), messages: JSON.parse(String(s.rows[0].messages_json ?? "[]")) as Array<{ role: string; text: string }> };
  } else {
    session = { id: nanoid(), messages: [] };
  }

  let rawMissions: AiMission[] = [];
  let reply = "";
  let ai: AdvisorResult["ai"] = { used: false, status: "indisponivel", detail: "IA não configurada pelo administrador: proposta montada por regras locais. Revise antes de criar." };
  if (config) {
    const prompt = buildPrompt({ mode: input.mode, message: input.message, detail: input.detail, today, candidates, current: input.current ?? null, task, history: session.messages });
    const out = await generateText(prompt, config, { responseSchema: MISSION_SCHEMA, timeoutMs: 35_000, retries: 1, maxOutputTokens: 4000 });
    if (out.ok) {
      const parsed = extractJson(out.text) as { reply?: unknown; missions?: unknown } | null;
      rawMissions = Array.isArray(parsed?.missions) ? (parsed!.missions as AiMission[]).slice(0, input.mode === "sequence" ? 6 : 1) : [];
      reply = str(parsed?.reply, 400) ?? "";
      ai = rawMissions.length ? { used: true, status: "ok", detail: "Proposta elaborada pela IA configurada no LifeOS a partir dos seus dados." } : { used: false, status: "erro", detail: "A IA respondeu num formato inesperado: proposta montada por regras locais." };
    } else {
      ai = { used: false, status: "erro", detail: `A IA não respondeu (${out.message.slice(0, 160)}): proposta montada por regras locais.` };
    }
  }
  if (!rawMissions.length) rawMissions = ruleBasedMission(input.mode, input.message, input.detail, task);

  const confirmed = input.confirmed ?? [];
  const items: MissionProposal[] = [];
  for (let i = 0; i < rawMissions.length; i++) {
    let p = await finalize(db, ownerId, rawMissions[i]!, { today, message: input.message, candidates, linksEnabled: linkCfg.enabled, scheduleEnabled: scheduleCfg.enabled, detail: input.detail, ai: ai.used, index: i, prev: items[i - 1] ?? null, confirmed });
    // Campos confirmados pelo usuário nunca são sobrescritos por um refinamento.
    const cur = input.current?.[i];
    if (cur && confirmed.length) p = { ...p, ...Object.fromEntries(confirmed.filter((k) => k in cur).map((k) => [k, (cur as unknown as Record<string, unknown>)[k]])) } as MissionProposal;
    // Melhorar: vínculos atuais da missão continuam como padrão quando o conselheiro não achou nada melhor.
    if (task && input.mode === "improve") {
      for (const [t, col] of [["project", "project_id"], ["goal", "goal_id"], ["contract", "contract_id"]] as const) {
        if (!p.links[t].id && task[col]) {
          const own = all[t].find((e) => e.id === String(task[col]));
          if (own) p.links[t] = { id: own.id, title: own.title, score: null, reason: "Vínculo atual da missão mantido.", alternatives: p.links[t].alternatives };
        }
      }
    }
    items.push(p);
  }
  if (input.mode === "breakdown" && task) items[0] = { ...items[0]!, title: String(task.title ?? items[0]!.title) };
  const message = reply || (input.mode === "sequence" ? `Planejei uma sequência de ${items.length} missões.` : input.mode === "breakdown" ? `Quebrei a missão em ${items[0]?.subtasks.length ?? 0} etapas.` : input.mode === "improve" ? "Preparei uma versão melhorada da missão." : "Preparei a proposta da missão.");

  const messages = [...session.messages, { role: "user", text: input.message.slice(0, 2000) }, { role: "assistant", text: message }].slice(-20);
  await db.execute({
    sql: `INSERT INTO mission_advisor_sessions (id, owner_id, mode, source, source_ref, messages_json, proposal_json, ai_used)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET mode = excluded.mode, messages_json = excluded.messages_json, proposal_json = excluded.proposal_json,
            ai_used = excluded.ai_used, updated_at = datetime('now')`,
    args: [session.id, ownerId, input.mode, input.source ?? "missions", input.sourceRef ?? null, JSON.stringify(messages), JSON.stringify({ items, targetTaskId: input.taskId ?? null }), ai.used ? 1 : 0],
  });

  return {
    sessionId: session.id,
    mode: input.mode,
    message,
    items,
    targetTaskId: input.taskId ?? null,
    ai,
    context: { projects: all.project.length, goals: all.goal.length, contracts: all.contract.length, campaigns: all.campaign.length, linksEnabled: linkCfg.enabled, scheduleEnabled: scheduleCfg.enabled },
  };
}

/** Recalcula prazos e recompensa de uma proposta editada à mão (sem IA). */
export async function recalc(db: Client, ownerId: string, p: MissionProposal): Promise<MissionProposal> {
  const { today } = await userDayContext(db, ownerId);
  const scheduleCfg = await automationConfig(db, ownerId, "missions", "deadline_planning");
  const schedule = scheduleCfg.enabled ? await planSchedule(db, ownerId, { start: p.startDate >= today ? p.startDate : today, due: p.dueDate, minutes: p.estimateMinutes, hypothesis: p.schedule.hypothesis, today }) : p.schedule;
  const reward = await estimateReward(db, ownerId, p, today);
  return { ...p, schedule, reward };
}

/* ───────────────────────────── aplicar (com aprovação) ───────────────────────────── */

async function assertLinks(db: Client, ownerId: string, p: MissionProposal) {
  if (p.links.project.id && !(await getAccessibleProject(db, ownerId, p.links.project.id))) throw new AdvisorError("Projeto inválido.");
  for (const [t, table] of [["goal", "goals"], ["contract", "contracts"], ["campaign", "campaigns"]] as const) {
    const id = p.links[t].id;
    if (!id) continue;
    const r = await db.execute({ sql: `SELECT id FROM ${table} WHERE id = ? AND owner_id = ?`, args: [id, ownerId] });
    if (!r.rows.length) throw new AdvisorError(`${LABEL[t][0].toUpperCase()}${LABEL[t].slice(1)} inválido.`);
  }
}

async function insertSubtasks(db: Client, ownerId: string, taskId: string, subtasks: ProposalSubtask[]) {
  const pos = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) AS p FROM subtasks WHERE task_id = ? AND owner_id = ?", args: [taskId, ownerId] });
  let position = Number(pos.rows[0]?.p ?? -1) + 1;
  const ids: string[] = [];
  for (const s of subtasks.slice(0, 20)) {
    const id = nanoid();
    await db.execute({
      sql: "INSERT INTO subtasks (id, task_id, owner_id, title, position, description, estimate_minutes, due_date, depends_on_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, taskId, ownerId, s.title.slice(0, 200), position++, s.description, s.estimateMinutes, s.dueDate, s.dependsOn != null ? (ids[s.dependsOn] ?? null) : null],
    });
    ids.push(id);
  }
  return ids;
}

export interface ApplyInput {
  sessionId: string;
  items: MissionProposal[];
  targetTaskId?: string | null;
  mode: AdvisorMode;
  reserveBlocks?: boolean;
}

/**
 * Grava o que o usuário aprovou. Recompensa NÃO é concedida aqui (só ao
 * concluir a missão, pelo motor oficial) — criar etapas não paga XP.
 */
export async function apply(db: Client, ownerId: string, input: ApplyInput) {
  const s = await db.execute({ sql: "SELECT id, status, task_ids_json FROM mission_advisor_sessions WHERE id = ? AND owner_id = ?", args: [input.sessionId, ownerId] });
  const row = s.rows[0];
  if (!row) throw new AdvisorError("Sessão do conselheiro não encontrada.", 404);
  // Idempotência: aplicar duas vezes (clique duplo, reenvio) não duplica missões.
  if (String(row.status) === "applied") return { taskIds: JSON.parse(String(row.task_ids_json ?? "[]")) as string[], duplicated: true, eventsCreated: 0 };
  if (!input.items.length) throw new AdvisorError("Nada para aplicar.");
  const taskIds: string[] = [];
  let eventsCreated = 0;

  if (input.mode === "breakdown" || input.mode === "improve") {
    if (!input.targetTaskId) throw new AdvisorError("Missão alvo ausente.");
    const task = await loadTask(db, ownerId, input.targetTaskId);
    const p = input.items[0]!;
    if (input.mode === "improve") {
      await assertLinks(db, ownerId, p);
      const prevContract = task.contract_id ? String(task.contract_id) : null;
      await db.execute({
        sql: `UPDATE tasks SET title = ?, description = ?, priority = ?, difficulty = ?, estimate_minutes = ?, start_date = ?, due_date = ?,
                project_id = ?, goal_id = ?, contract_id = ?, recurrence_rule = COALESCE(?, recurrence_rule), updated_at = datetime('now')
              WHERE id = ? AND owner_id = ?`,
        args: [p.title.slice(0, 200), composeDescription(p), p.priority, p.difficulty, p.estimateMinutes, p.startDate, p.dueDate, p.links.project.id, p.links.goal.id, p.links.contract.id, RECURRENCE_RULE[p.recurrence], input.targetTaskId, ownerId],
      });
      await recomputePriorityScore(db, input.targetTaskId, ownerId);
      for (const c of new Set([prevContract, p.links.contract.id].filter((x): x is string => !!x))) await syncContractStatus(db, ownerId, c);
    }
    if (p.subtasks.length) await insertSubtasks(db, ownerId, input.targetTaskId, p.subtasks);
    taskIds.push(String(task.id));
  } else {
    for (const p of input.items) await assertLinks(db, ownerId, p);
    for (const [i, p] of input.items.entries()) {
      const created = (await insertTask(db, ownerId, {
        title: p.title.slice(0, 200),
        description: composeDescription(p),
        projectId: p.links.project.id,
        goalId: p.links.goal.id,
        contractId: p.links.contract.id,
        status: p.status,
        priority: p.priority,
        difficulty: p.difficulty,
        dueDate: p.dueDate,
        startDate: p.startDate,
        estimateMinutes: p.estimateMinutes,
        recurrenceRule: RECURRENCE_RULE[p.recurrence],
      } as Parameters<typeof insertTask>[2])) as unknown as { id: string };
      taskIds.push(String(created.id));
      if (p.subtasks.length) await insertSubtasks(db, ownerId, created.id, p.subtasks);
      if (p.links.campaign.id) await db.execute({ sql: "INSERT OR IGNORE INTO campaign_tasks (campaign_id, task_id, owner_id) VALUES (?, ?, ?)", args: [p.links.campaign.id, created.id, ownerId] });
      if (p.dependsOn != null && taskIds[p.dependsOn] && p.dependsOn < i) await db.execute({ sql: "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)", args: [created.id, taskIds[p.dependsOn]] });
      // Blocos na Agenda só com marcação explícita na aprovação.
      if (input.reserveBlocks) {
        for (const b of p.schedule.blocks.slice(0, 6)) {
          const dup = await db.execute({ sql: "SELECT 1 FROM events WHERE owner_id = ? AND source_type = 'task' AND source_id = ? AND starts_at = ?", args: [ownerId, created.id, `${b.date}T${b.start}:00`] });
          if (dup.rows.length) continue;
          await db.execute({
            sql: "INSERT INTO events (id, owner_id, title, description, starts_at, ends_at, all_day, source_type, source_id, category) VALUES (?, ?, ?, ?, ?, ?, 0, 'task', ?, 'foco')",
            args: [nanoid(), ownerId, p.title.slice(0, 200), "Bloco reservado pelo Conselheiro de Missões.", `${b.date}T${b.start}:00`, `${b.date}T${b.end}:00`, created.id],
          });
          eventsCreated++;
        }
      }
    }
  }
  // H — Crônica: missões difíceis/épicas aceitas viram marco (a conclusão já aparece na Crônica por conta própria).
  if ((input.mode === "create" || input.mode === "sequence") && (await automationConfig(db, ownerId, "missions", "chronicle_marks")).enabled) {
    for (const [i, p] of input.items.entries()) {
      if (!taskIds[i] || (p.difficulty !== "dificil" && p.difficulty !== "epico")) continue;
      await db
        .execute({ sql: "INSERT OR IGNORE INTO chronicle_marks (owner_id, event_key, label, event_at) VALUES (?, ?, ?, datetime('now'))", args: [ownerId, `mission:${taskIds[i]}`, `Missão ${p.difficulty === "epico" ? "épica" : "difícil"} aceita: ${p.title.slice(0, 150)}`] })
        .catch(() => undefined);
    }
  }
  await db.execute({
    sql: "UPDATE mission_advisor_sessions SET status = 'applied', task_ids_json = ?, proposal_json = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [JSON.stringify(taskIds), JSON.stringify({ items: input.items, targetTaskId: input.targetTaskId ?? null, approved: true }), input.sessionId, ownerId],
  });
  return { taskIds, duplicated: false, eventsCreated };
}

export async function discard(db: Client, ownerId: string, sessionId: string) {
  await db.execute({ sql: "UPDATE mission_advisor_sessions SET status = 'discarded', updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'draft'", args: [sessionId, ownerId] });
}

export async function listSessions(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: "SELECT id, mode, source, status, messages_json, task_ids_json, ai_used, updated_at FROM mission_advisor_sessions WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 15",
    args: [ownerId],
  });
  return (r.rows as Array<Record<string, unknown>>).map((x) => {
    const msgs = JSON.parse(String(x.messages_json ?? "[]")) as Array<{ role: string; text: string }>;
    return { id: String(x.id), mode: String(x.mode), source: String(x.source), status: String(x.status), firstMessage: msgs.find((m) => m.role === "user")?.text ?? "", tasks: (JSON.parse(String(x.task_ids_json ?? "[]")) as string[]).length, aiUsed: Number(x.ai_used) === 1, updatedAt: String(x.updated_at) };
  });
}

export async function getSession(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "SELECT * FROM mission_advisor_sessions WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const x = r.rows[0];
  if (!x) throw new AdvisorError("Sessão não encontrada.", 404);
  const proposal = x.proposal_json ? (JSON.parse(String(x.proposal_json)) as { items: MissionProposal[]; targetTaskId: string | null }) : { items: [], targetTaskId: null };
  return { id: String(x.id), mode: String(x.mode) as AdvisorMode, status: String(x.status), messages: JSON.parse(String(x.messages_json ?? "[]")) as Array<{ role: string; text: string }>, items: proposal.items, targetTaskId: proposal.targetTaskId, taskIds: JSON.parse(String(x.task_ids_json ?? "[]")) as string[] };
}
