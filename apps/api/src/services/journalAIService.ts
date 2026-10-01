import type { getDb } from "../db/client.js";
import { extractJson, str } from "./aiJson.js";
import { getGeminiConfig, generateText } from "./geminiService.js";
import { getJournalMedia, stripHtml } from "./journalService.js";
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

const TEXT_FIELDS: Array<[string, string]> = [
  ["intention", "Intenção do dia"],
  ["thoughts", "Reflexões"],
  ["feel_good", "O que me fez bem"],
  ["challenges", "Desafios"],
  ["lighter_plan", "Plano para um dia mais leve"],
  ["night_helped", "O que ajudou hoje"],
  ["night_takeaway", "Aprendizado do dia"],
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
