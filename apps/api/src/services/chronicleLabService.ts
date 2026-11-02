import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { automationConfig, mondayKey, notifyFromAutomation } from "./automationService.js";
import { upsertLog } from "./experimentService.js";
import { tierRank, streakEndingToday, bestStreak } from "./planningHubService.js";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";

/**
 * Diário da Jornada 2.0 + Laboratório da Jornada 2.0 — camada derivada.
 *
 * Fonte única: journal_entries, journal_entry_media/links, personal_experiments
 * e personal_experiment_logs. Nada aqui concede XP (as recompensas seguem nas
 * rotas de origem, idempotentes). O texto do Diário só sai para a IA quando o
 * usuário pede explicitamente (flag `useAi` em cada chamada).
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

/** Texto puro de HTML do editor (sem tags, entidades básicas). */
export function plainText(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
const words = (s: string) => (s ? s.split(/\s+/).filter(Boolean).length : 0);
const parseArr = (v: unknown): string[] => {
  if (typeof v !== "string") return [];
  try {
    const x = JSON.parse(v) as unknown;
    return Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
};

// ============================================================
// DIÁRIO
// ============================================================

export const CHRONICLER_RANKS = [
  { min: 0, title: "Aprendiz das Crônicas" },
  { min: 100, title: "Guardião das Memórias" },
  { min: 350, title: "Cronista da Jornada" },
  { min: 900, title: "Mestre das Histórias" },
  { min: 2000, title: "Lendário Guardião do Tempo" },
] as const;

/** Estado do dia no mapa de consistência: sem registro, iniciado (texto) ou concluído (com fechamento). */
export type DayState = "none" | "started" | "done";

export function entryDayState(e: { thoughts: string; nightTakeaway: string | null; nightMood: number | null; gratitude: string[] } | null): DayState {
  if (!e) return "none";
  const hasText = words(e.thoughts) > 0 || e.gratitude.length > 0;
  if (!hasText) return "none";
  return (e.nightTakeaway && e.nightTakeaway.trim()) || e.nightMood != null ? "done" : "started";
}

/**
 * Pontos do Cronista (regra mostrada na UI): 10 por dia com crônica, 5 por dia
 * com fechamento, 2 por gratidão e 15 por retrospectiva salva. Não conta
 * palavras — texto longo ou mais exposição pessoal não rende mais.
 */
export function chroniclerPoints(p: { days: number; closedDays: number; gratitudes: number; retros: number }) {
  return p.days * 10 + p.closedDays * 5 + p.gratitudes * 2 + p.retros * 15;
}

export async function getChronicleHub(db: Client, ownerId: string) {
  const { tz, today } = await userDayContext(db, ownerId);
  const from = shiftDayKey(today, -364);
  const [entriesR, mediaR, linksR, retrosR, expR, journalsR, linkedExpR] = await Promise.all([
    db.execute({
      sql: `SELECT id, entry_date, thoughts, gratitude, night_takeaway, night_mood, focus_task_ids, is_favorite, tags, ai_title, ai_summary, ai_categories, location_label, updated_at
            FROM journal_entries WHERE owner_id = ? ORDER BY entry_date DESC`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT m.entry_id, COUNT(*) AS n FROM journal_entry_media m JOIN journal_entries e ON e.id = m.entry_id WHERE e.owner_id = ? GROUP BY m.entry_id", args: [ownerId] }),
    db.execute({ sql: "SELECT entry_id, target_type, target_id FROM journal_entry_links WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT week_start, content, source, saved_at, updated_at FROM journal_retrospectives WHERE owner_id = ? ORDER BY week_start DESC LIMIT 12", args: [ownerId] }),
    db.execute({ sql: "SELECT id, title, emoji, status, end_date FROM personal_experiments WHERE owner_id = ? AND status IN ('active', 'paused') ORDER BY end_date", args: [ownerId] }),
    db.execute({ sql: "SELECT j.id, j.name, (SELECT COUNT(*) FROM journal_entry_journals x WHERE x.journal_id = j.id) AS n FROM journals j WHERE j.owner_id = ? ORDER BY j.name", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(DISTINCT experiment_id) AS n FROM personal_experiment_logs WHERE owner_id = ? AND notes LIKE '[Diário%'", args: [ownerId] }),
  ]);
  const mediaBy = new Map((mediaR.rows as unknown as Row[]).map((r) => [String(r.entry_id), Number(r.n)]));
  const linksBy = new Map<string, Array<{ type: string; id: string }>>();
  for (const l of linksR.rows as unknown as Row[]) linksBy.set(String(l.entry_id), [...(linksBy.get(String(l.entry_id)) ?? []), { type: String(l.target_type), id: String(l.target_id) }]);

  const entries = (entriesR.rows as unknown as Row[]).map((r) => {
    const text = plainText(r.thoughts);
    const gratitude = parseArr(r.gratitude);
    const view = {
      id: String(r.id),
      date: String(r.entry_date),
      title: r.ai_title ? String(r.ai_title) : text.split(" ").slice(0, 8).join(" ") || "Crônica sem título",
      excerpt: (r.ai_summary ? String(r.ai_summary) : text).slice(0, 220),
      words: words(text),
      gratitude,
      nightTakeaway: r.night_takeaway ? String(r.night_takeaway) : null,
      nightMood: r.night_mood == null ? null : Number(r.night_mood),
      focusTasks: parseArr(r.focus_task_ids).length,
      favorite: Number(r.is_favorite ?? 0) === 1,
      tags: parseArr(r.tags),
      categories: parseArr(r.ai_categories),
      location: r.location_label ? String(r.location_label) : null,
      media: mediaBy.get(String(r.id)) ?? 0,
      links: linksBy.get(String(r.id)) ?? [],
      state: "none" as DayState,
    };
    view.state = entryDayState({ thoughts: text, nightTakeaway: view.nightTakeaway, nightMood: view.nightMood, gratitude });
    return view;
  });
  const written = entries.filter((e) => e.state !== "none");
  const writtenDays = new Set(written.map((e) => e.date));
  const closedDays = written.filter((e) => e.state === "done").length;
  const gratitudes = written.reduce((a, e) => a + e.gratitude.length, 0);
  const retros = (retrosR.rows as unknown as Row[]).filter((r) => r.saved_at).length;
  const points = chroniclerPoints({ days: writtenDays.size, closedDays, gratitudes, retros });

  // Mapa de consistência (365 dias): ausência é só "sem registro" — não zera nada.
  const byDate = new Map(entries.map((e) => [e.date, e.state]));
  const heatmap = Array.from({ length: 365 }, (_, i) => {
    const d = shiftDayKey(from, i);
    return { date: d, state: byDate.get(d) ?? ("none" as DayState) };
  });

  // Ritual de fechamento de hoje (etapas opcionais, derivadas do registro real).
  const t = entries.find((e) => e.date === today);
  const ritual = [
    { key: "day", title: "Registrar o dia", done: !!t && t.words > 0 },
    { key: "gratitude", title: "Registrar gratidão", done: !!t && t.gratitude.length > 0 },
    { key: "learning", title: "Identificar um aprendizado", done: !!t?.nightTakeaway },
    { key: "priorities", title: "Revisar prioridades (missão do dia)", done: !!t && t.focusTasks > 0 },
    { key: "mood", title: "Registrar humor da noite", done: t?.nightMood != null },
  ];

  // Temas recorrentes: categorias da IA (já salvas) + etiquetas do usuário (últimos 90 dias).
  const recent = written.filter((e) => e.date >= shiftDayKey(today, -89));
  const themes = new Map<string, number>();
  for (const e of recent) for (const c of [...e.categories, ...e.tags]) themes.set(c, (themes.get(c) ?? 0) + 1);
  const moodDist = [1, 2, 3, 4, 5].map((m) => ({ mood: m, count: recent.filter((e) => e.nightMood === m).length }));
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  for (const e of recent) weekdayCount[(new Date(`${e.date}T12:00:00Z`).getUTCDay() + 6) % 7]!++;

  return {
    today,
    timezone: tz,
    rank: tierRank(CHRONICLER_RANKS, points),
    rankBreakdown: { days: writtenDays.size, closedDays, gratitudes, retros },
    indicators: {
      streak: streakEndingToday(writtenDays, today),
      bestStreak: bestStreak(writtenDays),
      entries: written.length,
      words: written.reduce((a, e) => a + e.words, 0),
      daysWritten: writtenDays.size,
      gratitudes,
      reflectionsClosed: closedDays,
      experimentsLinked: Number(linkedExpR.rows[0]?.n ?? 0),
      favorites: written.filter((e) => e.favorite).length,
    },
    heatmap,
    ritual,
    timeline: written.slice(0, 120),
    insights: {
      themes: [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count })),
      moodDistribution: moodDist,
      writingByWeekday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label, i) => ({ label, count: weekdayCount[i]! })),
      last30: written.filter((e) => e.date >= shiftDayKey(today, -29)).length,
      prev30: written.filter((e) => e.date < shiftDayKey(today, -29) && e.date >= shiftDayKey(today, -59)).length,
      learnings: written.filter((e) => e.nightTakeaway).slice(0, 8).map((e) => ({ date: e.date, text: e.nightTakeaway!.slice(0, 200) })),
    },
    retrospectives: (retrosR.rows as unknown as Row[]).map((r) => ({ weekStart: String(r.week_start), content: String(r.content), source: String(r.source), savedAt: r.saved_at ? String(r.saved_at) : null })),
    journals: (journalsR.rows as unknown as Row[]).map((j) => ({ id: String(j.id), name: String(j.name), entries: Number(j.n) })),
    activeExperiments: (expR.rows as unknown as Row[]).map((e) => ({ id: String(e.id), title: String(e.title), emoji: e.emoji ? String(e.emoji) : null, status: String(e.status) })),
    missions: [
      { key: "write7", title: "Registrar 7 dias seguidos", description: "Sequência de escrita.", current: Math.min(streakEndingToday(writtenDays, today), 7), target: 7, done: streakEndingToday(writtenDays, today) >= 7 },
      { key: "close3", title: "Fechar o dia 3 vezes nesta semana", description: "Fechamento com aprendizado ou humor.", current: Math.min(written.filter((e) => e.state === "done" && e.date >= mondayKey(today)).length, 3), target: 3, done: written.filter((e) => e.state === "done" && e.date >= mondayKey(today)).length >= 3 },
      { key: "retro", title: "Salvar a retrospectiva da semana", description: "Revise e salve o resumo semanal.", current: (retrosR.rows as unknown as Row[]).some((r) => String(r.week_start) === mondayKey(today) && r.saved_at) ? 1 : 0, target: 1, done: (retrosR.rows as unknown as Row[]).some((r) => String(r.week_start) === mondayKey(today) && r.saved_at) },
    ],
  };
}

/** Contexto do dia (Estado do Dia): lê os módulos de origem, nada é copiado para o Diário. */
export async function getDayContext(db: Client, ownerId: string, date: string) {
  const { tz } = await userDayContext(db, ownerId);
  const next = shiftDayKey(date, 1);
  const [habits, habitsDone, tasks, workouts, water, sleep, mood, reading] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM habits WHERE owner_id = ? AND archived_at IS NULL", args: [ownerId] }).catch(() => ({ rows: [{ n: 0 }] })),
    db.execute({ sql: "SELECT COUNT(DISTINCT habit_id) AS n FROM habit_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, date] }),
    db.execute({ sql: "SELECT completed_at FROM tasks WHERE owner_id = ? AND status = 'Concluído' AND completed_at >= ? AND completed_at < ?", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }),
    db.execute({ sql: "SELECT performed_at, duration_minutes FROM workouts WHERE owner_id = ? AND performed_at >= ? AND performed_at < ?", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }),
    db.execute({ sql: "SELECT recorded_at, amount_ml FROM water_entries WHERE owner_id = ? AND recorded_at >= ? AND recorded_at < ?", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }),
    db.execute({ sql: "SELECT woke_up_at, duration_minutes FROM sleep_entries WHERE owner_id = ? AND woke_up_at >= ? AND woke_up_at < ?", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }),
    db.execute({ sql: "SELECT recorded_at, mood, energy FROM mood_entries WHERE owner_id = ? AND recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at DESC", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }),
    db.execute({ sql: "SELECT started_at, pages_read FROM reading_sessions WHERE owner_id = ? AND started_at >= ? AND started_at < ?", args: [ownerId, shiftDayKey(date, -1), shiftDayKey(date, 2)] }).catch(() => ({ rows: [] })),
  ]);
  const onDay = (rows: unknown[], col: string) => (rows as Row[]).filter((r) => r[col] != null && localDayOfStored(String(r[col]), tz) === date);
  const m = onDay(mood.rows, "recorded_at")[0];
  const sl = onDay(sleep.rows, "woke_up_at").filter((s) => Number(s.duration_minutes ?? 0) > 0 && Number(s.duration_minutes) <= 960);
  return {
    date,
    next,
    habits: { done: Number(habitsDone.rows[0]?.n ?? 0), total: Number((habits.rows[0] as Row | undefined)?.n ?? 0) },
    tasksDone: onDay(tasks.rows, "completed_at").length,
    workouts: { count: onDay(workouts.rows, "performed_at").length, minutes: onDay(workouts.rows, "performed_at").reduce((a, w) => a + Number(w.duration_minutes ?? 0), 0) },
    waterMl: onDay(water.rows, "recorded_at").reduce((a, w) => a + Number(w.amount_ml ?? 0), 0),
    sleepMinutes: sl.length ? Math.max(...sl.map((s) => Number(s.duration_minutes))) : null,
    mood: m ? { mood: Number(m.mood), energy: Number(m.energy) } : null,
    pages: onDay(reading.rows, "started_at").reduce((a, r) => a + Number(r.pages_read ?? 0), 0),
  };
}

// ---------------- Retrospectiva semanal ----------------

/** Rascunho determinístico da semana: só o que foi escrito (nada inventado). */
export async function buildRetrospectiveDraft(db: Client, ownerId: string, weekStart: string): Promise<string> {
  const weekEnd = shiftDayKey(weekStart, 6);
  const [entries, links, habits] = await Promise.all([
    db.execute({ sql: "SELECT id, entry_date, thoughts, gratitude, night_takeaway, ai_title, is_favorite FROM journal_entries WHERE owner_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date", args: [ownerId, weekStart, weekEnd] }),
    db.execute({
      sql: `SELECT DISTINCT COALESCE(g.title, p.name) AS t FROM journal_entry_links l JOIN journal_entries e ON e.id = l.entry_id
            LEFT JOIN goals g ON l.target_type = 'goal' AND g.id = l.target_id LEFT JOIN projects p ON l.target_type = 'project' AND p.id = l.target_id
            WHERE l.owner_id = ? AND e.entry_date BETWEEN ? AND ?`,
      args: [ownerId, weekStart, weekEnd],
    }),
    db.execute({ sql: "SELECT name FROM habits WHERE owner_id = ?", args: [ownerId] }).catch(() => ({ rows: [] })),
  ]);
  const rows = entries.rows as unknown as Row[];
  if (rows.length === 0) return "";
  const allText = rows.map((r) => plainText(r.thoughts).toLowerCase()).join(" ");
  const habitNames = (habits.rows as unknown as Row[]).map((h) => String(h.name)).filter((n) => n.length > 2 && allText.includes(n.toLowerCase()));
  const lines: string[] = [`Semana de ${weekStart.split("-").reverse().join("/")} a ${weekEnd.split("-").reverse().join("/")} — ${rows.length} dia(s) registrados.`, "", "Acontecimentos registrados:"];
  for (const r of rows) {
    const text = plainText(r.thoughts);
    const title = r.ai_title ? String(r.ai_title) : text.split(" ").slice(0, 10).join(" ");
    if (title) lines.push(`- ${String(r.entry_date).slice(8, 10)}/${String(r.entry_date).slice(5, 7)}: ${title}${Number(r.is_favorite) === 1 ? " ★" : ""}`);
  }
  const goals = (links.rows as unknown as Row[]).map((l) => String(l.t)).filter(Boolean);
  if (goals.length) lines.push("", `Objetivos trabalhados: ${goals.join(", ")}.`);
  if (habitNames.length) lines.push("", `Hábitos mencionados: ${habitNames.join(", ")}.`);
  const learnings = rows.map((r) => (r.night_takeaway ? String(r.night_takeaway) : "")).filter(Boolean);
  if (learnings.length) lines.push("", "Aprendizados:", ...learnings.map((l) => `- ${l}`));
  const gratitude = rows.flatMap((r) => parseArr(r.gratitude));
  if (gratitude.length) lines.push("", `Gratidão: ${gratitude.slice(0, 8).join("; ")}.`);
  lines.push("", "Desafios e memórias importantes: (complete com o que quiser registrar)");
  return lines.join("\n");
}

/** Gera (ou regera) o rascunho. A IA só é usada com `useAi` explícito e só reescreve o rascunho determinístico. */
export async function generateRetrospective(db: Client, ownerId: string, weekStart: string, useAi: boolean) {
  const draft = await buildRetrospectiveDraft(db, ownerId, weekStart);
  if (!draft) throw new ChronicleError("Nenhuma crônica registrada nessa semana.", 404);
  let content = draft;
  let source: "auto" | "ai" = "auto";
  if (useAi) {
    const config = await getGeminiConfig();
    if (config) {
      const prompt = `Reescreva a retrospectiva semanal abaixo em português do Brasil, em 1ª pessoa, de forma clara e acolhedora (até 250 palavras).
Use SOMENTE o que está escrito. Não invente acontecimentos, sentimentos, nomes ou números. Não faça diagnósticos.
Mantenha as seções: acontecimentos, objetivos, hábitos, aprendizados, desafios e memórias (omita as vazias).
TEXTO:
${draft.slice(0, 6000)}`;
      const r = await generateText(prompt, config, { timeoutMs: 20_000, retries: 1, maxOutputTokens: 900 });
      if (r.ok && r.text.trim()) {
        content = r.text.trim().slice(0, 8000);
        source = "ai";
      }
    }
  }
  // Rascunho NÃO salvo: só vira "salvo" quando o usuário confirma (saveRetrospective).
  await db.execute({
    sql: `INSERT INTO journal_retrospectives (id, owner_id, week_start, content, source) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (owner_id, week_start) DO UPDATE SET content = excluded.content, source = excluded.source, updated_at = datetime('now')
          WHERE journal_retrospectives.saved_at IS NULL`,
    args: [nanoid(), ownerId, weekStart, content, source],
  });
  return { weekStart, content, source, saved: false };
}

export async function saveRetrospective(db: Client, ownerId: string, weekStart: string, content: string) {
  await db.execute({
    sql: `INSERT INTO journal_retrospectives (id, owner_id, week_start, content, source, saved_at) VALUES (?, ?, ?, ?, 'edited', datetime('now'))
          ON CONFLICT (owner_id, week_start) DO UPDATE SET content = excluded.content, source = 'edited', saved_at = datetime('now'), updated_at = datetime('now')`,
    args: [nanoid(), ownerId, weekStart, content.slice(0, 8000)],
  });
}

export async function deleteRetrospective(db: Client, ownerId: string, weekStart: string) {
  const r = await db.execute({ sql: "DELETE FROM journal_retrospectives WHERE owner_id = ? AND week_start = ?", args: [ownerId, weekStart] });
  return r.rowsAffected > 0;
}

// ---------------- Diário → Laboratório (seleção explícita) ----------------

/** Envia um trecho escolhido pelo usuário como observação do experimento naquele dia (origem marcada). */
export async function sendNoteToExperiment(db: Client, ownerId: string, date: string, experimentId: string, text: string) {
  const clean = text.trim().slice(0, 1500);
  if (!clean) throw new ChronicleError("Escreva a observação a enviar.");
  const existing = await db.execute({ sql: "SELECT notes FROM personal_experiment_logs WHERE owner_id = ? AND experiment_id = ? AND log_date = ?", args: [ownerId, experimentId, date] });
  const prev = existing.rows[0]?.notes ? String(existing.rows[0].notes) : "";
  const tagged = `[Diário ${date.slice(8, 10)}/${date.slice(5, 7)}] ${clean}`;
  if (prev.includes(tagged)) return { duplicated: true };
  // upsertLog valida a posse do experimento; o check-in do dia (se houver) é preservado.
  await upsertLog(db, ownerId, experimentId, { logDate: date, notes: prev ? `${prev}\n${tagged}` : tagged });
  return { duplicated: false };
}

// ---------------- Automações do Diário ----------------

export async function runWriteReminder(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const y = shiftDayKey(today, -1);
  const r = await db.execute({ sql: "SELECT thoughts FROM journal_entries WHERE owner_id = ? AND entry_date = ?", args: [ownerId, y] });
  const wrote = r.rows[0] && plainText(r.rows[0].thoughts).length > 0;
  const body = wrote ? `Sua crônica de ontem está guardada. Que tal registrar hoje, no seu horário (${Number(config.preferredHour ?? 21)}h)?` : `Ontem ficou sem crônica. Hoje, às ${Number(config.preferredHour ?? 21)}h, reserve uns minutos para escrever.`;
  await notifyFromAutomation(db, ownerId, { eventType: "diary_reminder", title: "Diário da Jornada", body, url: "/diario", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export async function runWeeklyRetro(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const week = shiftDayKey(mondayKey(today), -7);
  try {
    // Automação nunca usa IA sobre o texto do Diário: só o rascunho por regras.
    await generateRetrospective(db, ownerId, week, false);
  } catch (e) {
    if (e instanceof ChronicleError) return { status: "skipped", summary: "Nenhuma crônica na semana passada." };
    throw e;
  }
  await notifyFromAutomation(db, ownerId, { eventType: "diary_retro", title: "Retrospectiva pronta para revisar", body: "O rascunho da semana passada está no Diário — edite e salve se quiser.", url: "/diario?aba=insights", inApp: config.inApp !== false, push: false });
  return { status: "ok", summary: `Rascunho da semana de ${week} preparado (ainda não salvo).` };
}

export async function runMemories(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const md = today.slice(5);
  const r = await db.execute({ sql: "SELECT entry_date FROM journal_entries WHERE owner_id = ? AND substr(entry_date, 6) = ? AND entry_date < ? AND thoughts IS NOT NULL AND thoughts <> '' ORDER BY entry_date DESC LIMIT 3", args: [ownerId, md, today] });
  if (r.rows.length === 0) return { status: "skipped", summary: "Nenhuma crônica neste dia em anos anteriores." };
  const years = r.rows.map((x) => String(x.entry_date).slice(0, 4)).join(", ");
  await notifyFromAutomation(db, ownerId, { eventType: "diary_memory", title: "Memórias da Jornada", body: `Neste dia você escreveu em ${years}. Quer revisitar?`, url: "/diario", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `Memória sugerida (${years}).` };
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
