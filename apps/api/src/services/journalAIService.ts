import type { getDb } from "../db/client.js";
import { extractJson, str } from "./aiJson.js";
import { getGeminiConfig, generateText } from "./geminiService.js";
import { getJournalAutoData, getJournalMedia, stripHtml } from "./journalService.js";
import type { JournalAiApplyInput } from "../validators/journal.schema.js";

/**
 * IA do Diário: o Gemini lê SOMENTE os textos que o usuário escreveu no dia
 * (campos do diário + histórias/legendas das mídias) e sugere uma
 * organização por temas — título, resumo, temas com pontos e a categoria
 * de cada mídia.
 *
 * Nada é salvo aqui: organizeJournalDay devolve uma SUGESTÃO; só
 * applyJournalOrganization (chamado depois da confirmação do usuário)
 * grava. Arquivos (imagens, vídeos, PDFs) nunca são enviados ao modelo —
 * apenas o texto que o próprio usuário escreveu sobre eles.
 */

type Db = ReturnType<typeof getDb>;

export interface JournalOrganizationSuggestion {
  title: string | null;
  summary: string | null;
  categories: Array<{ name: string; points: string[] }>;
  mediaCategories: Array<{ id: string; category: string }>;
  suggestedTags: string[];
}

export type JournalOrganizeResult =
  | { ok: true; suggestion: JournalOrganizationSuggestion }
  | { ok: false; status: number; message: string };

// Desde a 0050 o diário é texto corrido: as perguntas guiadas antigas foram
// fundidas dentro de thoughts ("Como foi meu dia").
const TEXT_FIELDS: Array<[string, string]> = [
  ["thoughts", "Como foi meu dia"],
  ["night_takeaway", "O que levo para amanhã"],
];

const MEDIA_LABEL: Record<string, string> = { photo: "foto", video: "vídeo", document: "PDF", audio: "nota de voz" };

/** Valida e poda a resposta do modelo — ids de mídia inexistentes são descartados. */
export function sanitizeSuggestion(raw: unknown, validMediaIds: Set<string>): JournalOrganizationSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const categories = Array.isArray(o.categories)
    ? o.categories
        .map((c) => {
          const cc = c as Record<string, unknown>;
          const name = str(cc?.name, 60);
          const points = Array.isArray(cc?.points) ? cc.points.map((p) => str(p, 400)).filter((p): p is string => !!p).slice(0, 12) : [];
          return name && points.length > 0 ? { name, points } : null;
        })
        .filter((c): c is { name: string; points: string[] } => !!c)
        .slice(0, 10)
    : [];
  const mediaCategories = Array.isArray(o.mediaCategories)
    ? o.mediaCategories
        .map((m) => {
          const mm = m as Record<string, unknown>;
          const id = typeof mm?.id === "string" ? mm.id : null;
          const category = str(mm?.category, 60);
          return id && category && validMediaIds.has(id) ? { id, category } : null;
        })
        .filter((m): m is { id: string; category: string } => !!m)
    : [];
  const suggestedTags = Array.isArray(o.suggestedTags)
    ? o.suggestedTags.map((t) => str(t, 40)?.toLowerCase().replace(/^#/, "")).filter((t): t is string => !!t).slice(0, 8)
    : [];
  if (categories.length === 0 && mediaCategories.length === 0) return null;
  return { title: str(o.title, 120), summary: str(o.summary, 1200), categories, mediaCategories, suggestedTags };
}

export async function organizeJournalDay(db: Db, ownerId: string, date: string): Promise<JournalOrganizeResult> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, status: 503, message: "A IA do LifeOS ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const entryRes = await db.execute({ sql: "SELECT * FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] });
  const row = entryRes.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return { ok: false, status: 404, message: "Ainda não há registro neste dia para organizar." };

  const lines: string[] = [];
  for (const [col, label] of TEXT_FIELDS) {
    const text = stripHtml(row[col] as string | null);
    if (text) lines.push(`[${label}] ${text.slice(0, 3000)}`);
  }
  try {
    const gratitude = JSON.parse((row.gratitude as string) || "[]") as unknown[];
    const items = gratitude.filter((g): g is string => typeof g === "string" && g.trim().length > 0);
    if (items.length > 0) lines.push(`[Gratidão] ${items.join("; ")}`);
  } catch {
    // gratidão malformada: segue sem ela
  }

  const media = await getJournalMedia(db, row.id as string);
  const mediaLines = media
    .filter((m) => m.story || m.caption)
    .map((m) => `- id=${m.id} (${MEDIA_LABEL[m.kind] ?? m.kind}${m.fileName ? `, arquivo "${m.fileName}"` : ""}): ${[m.caption, m.story].filter(Boolean).join(" — ").slice(0, 1500)}`);

  if (lines.length === 0 && mediaLines.length === 0) {
    return { ok: false, status: 422, message: "Escreva algo no dia ou conte a história de uma mídia antes de pedir a organização." };
  }

  const prompt = [
    "Você é o LifeOS Copilot organizando uma entrada de diário pessoal.",
    "",
    "Regras obrigatórias:",
    "- Use SOMENTE o texto abaixo. Nunca invente fatos, pessoas, lugares, números ou sentimentos que não estejam escritos.",
    "- Agrupe o conteúdo em 2 a 6 temas (ex.: Trabalho, Estudos, Família, Saúde, Lazer, Finanças, Relacionamentos, Espiritualidade, Aprendizados) — use só temas presentes no texto.",
    "- Em cada tema, liste pontos curtos reescritos com clareza, preservando o sentido e a voz do usuário (primeira pessoa).",
    "- Para cada mídia listada, escolha UMA categoria curta (pode repetir o nome de um tema).",
    "- Não dê diagnóstico médico nem conselhos. Não julgue.",
    "- Responda em português do Brasil.",
    "",
    "Responda APENAS com JSON válido neste formato:",
    '{"title":"título curto do dia","summary":"resumo de 1 a 3 frases","categories":[{"name":"Tema","points":["ponto"]}],"mediaCategories":[{"id":"id da mídia","category":"Categoria"}],"suggestedTags":["etiqueta"]}',
    "",
    `Entrada do dia ${date}:`,
    ...lines,
    mediaLines.length > 0 ? "\nMídias com a história contada pelo usuário:" : "",
    ...mediaLines,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, status: 502, message: result.message };

  const suggestion = sanitizeSuggestion(extractJson(result.text), new Set(media.map((m) => m.id)));
  if (!suggestion) return { ok: false, status: 502, message: "A IA respondeu em um formato inesperado. Tente novamente." };
  return { ok: true, suggestion };
}

/** Grava a organização que o usuário confirmou. Categorias de mídia só valem para mídias do próprio dono. */
export async function applyJournalOrganization(db: Db, ownerId: string, date: string, input: JournalAiApplyInput): Promise<boolean> {
  const entryRes = await db.execute({ sql: "SELECT id, tags FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] });
  const row = entryRes.rows[0] as unknown as { id: string; tags: string | null } | undefined;
  if (!row) return false;

  let tags: string[] = [];
  try {
    tags = row.tags ? (JSON.parse(row.tags) as string[]) : [];
  } catch {
    tags = [];
  }
  const mergedTags = Array.from(new Set([...tags, ...(input.tagsToAdd ?? [])])).slice(0, 15);

  await db.execute({
    sql: `UPDATE journal_entries
          SET ai_title = ?, ai_summary = ?, ai_categories = ?, ai_organized_at = datetime('now'), tags = ?, updated_at = datetime('now')
          WHERE id = ? AND owner_id = ?`,
    args: [input.title ?? null, input.summary ?? null, JSON.stringify(input.categories), JSON.stringify(mergedTags), row.id, ownerId],
  });

  for (const m of input.mediaCategories ?? []) {
    await db.execute({
      sql: "UPDATE journal_entry_media SET ai_category = ? WHERE id = ? AND entry_id = ? AND owner_id = ?",
      args: [m.category, m.id, row.id, ownerId],
    });
  }
  return true;
}

/** Remove a organização por IA do dia (o texto original do usuário nunca é tocado). */
export async function clearJournalOrganization(db: Db, ownerId: string, date: string): Promise<void> {
  await db.execute({
    sql: `UPDATE journal_entries SET ai_title = NULL, ai_summary = NULL, ai_categories = NULL, ai_organized_at = NULL
          WHERE owner_id = ? AND entry_date = ?`,
    args: [ownerId, date],
  });
  await db.execute({
    sql: `UPDATE journal_entry_media SET ai_category = NULL
          WHERE owner_id = ? AND entry_id IN (SELECT id FROM journal_entries WHERE owner_id = ? AND entry_date = ?)`,
    args: [ownerId, ownerId, date],
  });
}

// ------------------------------------------------------------
// Assistente de escrita do Diário
// ------------------------------------------------------------

export interface JournalWritingAssist {
  /** Perguntas sobre o que DE FATO aconteceu no dia (tarefas, treino, leitura…) — substituem as perguntas genéricas. */
  questions: string[];
  /** Rascunho em primeira pessoa só com fatos registrados + o que o usuário escreveu. Nunca é salvo sem confirmação. */
  draft: string | null;
  /** Sugestões para "O que levo para amanhã". */
  takeaways: string[];
  /** Fatos reais que a IA recebeu — montados aqui no backend, não pelo modelo, para a UI mostrar a procedência. */
  dataUsed: string[];
}

export type JournalAssistResult = { ok: true; assist: JournalWritingAssist } | { ok: false; status: number; message: string };

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m} min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

const MOOD_WORD = ["muito baixo", "baixo", "neutro", "bom", "ótimo"];

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Fatos do dia vindos dos outros módulos, em frases curtas e verificáveis. */
async function collectDayFacts(db: Db, ownerId: string, date: string): Promise<{ facts: string[]; pendingTomorrow: string[] }> {
  const auto = await getJournalAutoData(db, ownerId, date);
  const [doneTasks, habits, workouts, focus, tomorrow] = await Promise.all([
    db.execute({
      sql: `SELECT title FROM tasks WHERE owner_id = ? AND status = 'Concluído'
            AND date(COALESCE(completed_at, updated_at)) = date(?) ORDER BY COALESCE(completed_at, updated_at) LIMIT 8`,
      args: [ownerId, date],
    }),
    db.execute({
      sql: `SELECT h.name AS name FROM habit_entries he JOIN habits h ON h.id = he.habit_id
            WHERE he.owner_id = ? AND he.entry_date = ? AND he.count >= h.target_count LIMIT 10`,
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT kind, duration_minutes FROM workouts WHERE owner_id = ? AND (performed_at >= date(?2) AND performed_at < date(?2, '+1 day')) LIMIT 5",
      args: [ownerId, date],
    }),
    db.execute({
      sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS total, COUNT(*) AS n FROM focus_sessions WHERE owner_id = ? AND (started_at >= date(?2) AND started_at < date(?2, '+1 day')) AND actual_minutes > 0",
      args: [ownerId, date],
    }),
    db.execute({
      sql: `SELECT title FROM tasks WHERE owner_id = ? AND status != 'Concluído' AND due_date < date(?, '+1 day')
            ORDER BY CASE priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, due_date ASC LIMIT 5`,
      args: [ownerId, nextDay(date)],
    }),
  ]);

  const facts: string[] = [];
  const taskTitles = (doneTasks.rows as unknown as Array<{ title: string }>).map((r) => r.title);
  if (taskTitles.length > 0) facts.push(`Tarefas concluídas: ${taskTitles.join("; ")}`);
  const habitNames = (habits.rows as unknown as Array<{ name: string }>).map((r) => r.name);
  if (habitNames.length > 0) facts.push(`Hábitos cumpridos: ${habitNames.join(", ")}`);
  for (const w of workouts.rows as unknown as Array<{ kind: string; duration_minutes: number | null }>) {
    facts.push(`Exercício: ${w.kind}${w.duration_minutes ? ` (${minutesLabel(Number(w.duration_minutes))})` : ""}`);
  }
  const focusRow = focus.rows[0] as unknown as { total: number; n: number } | undefined;
  if (focusRow && Number(focusRow.total) > 0) facts.push(`Foco: ${Number(focusRow.n)} sessão(ões), ${minutesLabel(Number(focusRow.total))}`);
  if (auto.reading.pages > 0 || auto.reading.minutes > 0) {
    const book = auto.currentBook ? ` de "${auto.currentBook.title}"` : "";
    facts.push(`Leitura: ${auto.reading.pages} páginas${book}${auto.reading.minutes > 0 ? ` em ${minutesLabel(auto.reading.minutes)}` : ""}`);
  }
  if (auto.waterMl > 0) facts.push(`Água: ${(auto.waterMl / 1000).toFixed(1)} L`);
  if (auto.sleep?.durationMinutes) facts.push(`Sono: ${minutesLabel(auto.sleep.durationMinutes)}${auto.sleep.qualityScore ? `, qualidade ${auto.sleep.qualityScore}/5` : ""}`);
  if (auto.mood) facts.push(`Humor registrado em Saúde: ${auto.mood.mood}/5 (${MOOD_WORD[auto.mood.mood - 1]}), energia ${auto.mood.energy}/5`);

  const pendingTomorrow = (tomorrow.rows as unknown as Array<{ title: string }>).map((r) => r.title);
  return { facts, pendingTomorrow };
}

const asStrings = (v: unknown, max: number, limit: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, limit) : [];

/**
 * Ajuda a escrever o dia: perguntas sobre o que realmente aconteceu, um
 * rascunho opcional e sugestões para amanhã. Não grava nada — a UI insere
 * o rascunho no texto só quando o usuário clica.
 */
export async function assistJournalDay(db: Db, ownerId: string, date: string, notes: string | null): Promise<JournalAssistResult> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, status: 503, message: "A IA do LifeOS ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini em Configurações." };
  }

  const entryRes = await db.execute({ sql: "SELECT thoughts, night_takeaway FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] });
  const row = entryRes.rows[0] as unknown as { thoughts: string | null; night_takeaway: string | null } | undefined;
  const written = stripHtml(row?.thoughts).slice(0, 4000);
  const quickNotes = (notes ?? "").trim().slice(0, 2000);
  const { facts, pendingTomorrow } = await collectDayFacts(db, ownerId, date);

  if (facts.length === 0 && !written && !quickNotes) {
    return {
      ok: false,
      status: 422,
      message: "Ainda não há registros deste dia nem texto escrito. Anote umas palavras soltas e a IA ajuda a transformar em texto.",
    };
  }

  const prompt = [
    "Você é o LifeOS Copilot ajudando o usuário a escrever o diário do dia, em primeira pessoa.",
    "",
    "Regras obrigatórias:",
    "- Use SOMENTE os fatos registrados, o texto já escrito e as anotações rápidas abaixo. Nunca invente acontecimentos, pessoas, lugares, números ou sentimentos.",
    "- Sentimentos só podem aparecer se o usuário escreveu ou se o humor foi registrado em Saúde (cite-o como registro).",
    "- questions: 2 a 4 perguntas curtas e específicas sobre coisas que de fato aconteceram (cite a tarefa, o treino, o livro). Nada genérico como 'como foi seu dia'. Não pergunte o que já está respondido no texto.",
    "- draft: rascunho natural de 1 a 3 parágrafos curtos que una anotações + fatos, na voz do usuário. Se já houver texto escrito, o rascunho deve CONTINUAR o texto sem repeti-lo. Se não houver nada além dos fatos, faça um rascunho factual e curto. Use null se não fizer sentido.",
    "- takeaways: 1 a 3 itens curtos para 'O que levo para amanhã', baseados no texto e nas pendências reais listadas.",
    "- Sem diagnósticos, conselhos médicos ou julgamentos. Português do Brasil.",
    "",
    "Responda APENAS com JSON válido:",
    '{"questions":["…"],"draft":"…","takeaways":["…"]}',
    "",
    `Dia: ${date}`,
    facts.length > 0 ? `Fatos registrados no LifeOS:\n- ${facts.join("\n- ")}` : "Fatos registrados no LifeOS: nenhum.",
    pendingTomorrow.length > 0 ? `Pendências reais até amanhã: ${pendingTomorrow.join("; ")}` : "",
    written ? `Texto já escrito pelo usuário:\n${written}` : "Texto já escrito pelo usuário: (vazio)",
    quickNotes ? `Anotações rápidas do usuário:\n${quickNotes}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, status: 502, message: result.message };
  const raw = extractJson(result.text) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { ok: false, status: 502, message: "A IA respondeu em um formato inesperado. Tente novamente." };

  const assist: JournalWritingAssist = {
    questions: asStrings(raw.questions, 240, 4),
    draft: str(raw.draft, 3000),
    takeaways: asStrings(raw.takeaways, 240, 3),
    dataUsed: facts,
  };
  if (assist.questions.length === 0 && !assist.draft && assist.takeaways.length === 0) {
    return { ok: false, status: 502, message: "A IA não conseguiu montar uma sugestão agora. Tente novamente." };
  }
  return { ok: true, assist };
}
