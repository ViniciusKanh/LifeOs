import type { getDb } from "../db/client.js";
import { stripHtml } from "./journalService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Evidências reais de um período (semana, mês…) para os prompts de revisão.
 *
 * As revisões antigas só enviavam contagens ao Gemini ("12 tarefas
 * concluídas"), e o texto saía genérico. Aqui juntamos O QUE de fato
 * aconteceu — títulos das tarefas concluídas e por projeto, pendências
 * atrasadas, o que o usuário escreveu no Diário e a consistência de cada
 * hábito — para a IA escrever com base na vida real do usuário.
 *
 * Tudo filtrado por owner_id. Os limites de volume protegem o custo do
 * prompt: num mês cheio, o Diário entra pelo resumo da IA (quando existe)
 * ou por um trecho curto do texto.
 */
export interface ReviewEvidence {
  /** Bloco de texto pronto para o prompt. */
  block: string;
  /** Quantidades usadas — exibidas na UI como procedência ("baseado em…"). */
  counts: { tasksDone: number; journalDays: number; projects: number; habits: number; overdue: number };
}

interface Options {
  /** Máximo de tarefas concluídas listadas pelo título. */
  maxTasks: number;
  /** Máximo de dias do Diário incluídos. */
  maxJournalDays: number;
  /** Caracteres por dia do Diário. */
  journalChars: number;
}

const WEEK: Options = { maxTasks: 40, maxJournalDays: 7, journalChars: 900 };
const MONTH: Options = { maxTasks: 80, maxJournalDays: 31, journalChars: 420 };
const LONG: Options = { maxTasks: 60, maxJournalDays: 40, journalChars: 220 };

export function evidenceOptionsFor(days: number): Options {
  if (days <= 8) return WEEK;
  if (days <= 31) return MONTH;
  return LONG;
}

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Período [from, toExclusive) em datas locais YYYY-MM-DD. */
export async function collectReviewEvidence(db: Db, ownerId: string, from: string, toExclusive: string, opts: Options = WEEK): Promise<ReviewEvidence> {
  const [done, overdue, journal, habits] = await Promise.all([
    db.execute({
      sql: `SELECT t.title AS title, p.name AS project, date(COALESCE(t.completed_at, t.updated_at)) AS day, t.priority AS priority
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status = 'Concluído' AND t.parent_task_id IS NULL
              AND date(COALESCE(t.completed_at, t.updated_at)) >= date(?) AND date(COALESCE(t.completed_at, t.updated_at)) < date(?)
            ORDER BY day ASC LIMIT 400`,
      args: [ownerId, from, toExclusive],
    }),
    db.execute({
      sql: `SELECT t.title AS title, p.name AS project, t.due_date AS due, t.priority AS priority
            FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
            WHERE t.owner_id = ? AND t.status != 'Concluído' AND t.parent_task_id IS NULL AND t.due_date IS NOT NULL AND date(t.due_date) < date(?)
            ORDER BY CASE t.priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END, t.due_date ASC LIMIT 12`,
      args: [ownerId, toExclusive],
    }),
    db.execute({
      sql: `SELECT entry_date, thoughts, night_takeaway, ai_title, ai_summary, ai_highlights, tags
            FROM journal_entries WHERE owner_id = ? AND entry_date >= ? AND entry_date < ?
            ORDER BY entry_date ASC LIMIT ?`,
      args: [ownerId, from, toExclusive, opts.maxJournalDays],
    }),
    db.execute({
      sql: `SELECT h.name AS name, COUNT(*) AS n FROM habit_entries he JOIN habits h ON h.id = he.habit_id AND h.owner_id = he.owner_id
            WHERE he.owner_id = ? AND he.entry_date >= ? AND he.entry_date < ? AND he.count >= h.target_count
            GROUP BY h.id ORDER BY n DESC LIMIT 12`,
      args: [ownerId, from, toExclusive],
    }),
  ]);

  const lines: string[] = [];
  const doneRows = done.rows as unknown as Array<{ title: string; project: string | null; day: string; priority: string }>;

  // Tarefas agrupadas por projeto: a IA enxerga em que frentes o período avançou.
  const byProject = new Map<string, number>();
  for (const t of doneRows) byProject.set(t.project ?? "Sem projeto", (byProject.get(t.project ?? "Sem projeto") ?? 0) + 1);
  if (doneRows.length > 0) {
    lines.push(`TAREFAS CONCLUÍDAS (${doneRows.length}) — por projeto: ${[...byProject.entries()].map(([p, n]) => `${p} ${n}`).join("; ")}`);
    const listed = doneRows.slice(-opts.maxTasks);
    for (const t of listed) lines.push(`- ${shortDate(t.day)} · ${t.title}${t.project ? ` [${t.project}]` : ""}${t.priority === "Alta" ? " (alta prioridade)" : ""}`);
    if (doneRows.length > listed.length) lines.push(`- (+${doneRows.length - listed.length} tarefas mais antigas no período)`);
  } else {
    lines.push("TAREFAS CONCLUÍDAS: nenhuma registrada no período.");
  }

  const overdueRows = overdue.rows as unknown as Array<{ title: string; project: string | null; due: string; priority: string }>;
  if (overdueRows.length > 0) {
    lines.push("", `PENDÊNCIAS ATRASADAS NO FIM DO PERÍODO (${overdueRows.length}):`);
    for (const t of overdueRows) lines.push(`- ${t.title}${t.project ? ` [${t.project}]` : ""} — prazo ${shortDate(t.due)}, prioridade ${t.priority}`);
  }

  const habitRows = habits.rows as unknown as Array<{ name: string; n: number }>;
  if (habitRows.length > 0) {
    lines.push("", "HÁBITOS (check-ins cumpridos no período):", habitRows.map((h) => `${h.name}: ${Number(h.n)}`).join("; "));
  }

  const journalRows = journal.rows as unknown as Array<Record<string, unknown>>;
  if (journalRows.length > 0) {
    lines.push("", `DIÁRIO — o que o usuário escreveu (${journalRows.length} dia(s)):`);
    for (const r of journalRows) {
      const title = typeof r.ai_title === "string" && r.ai_title ? ` "${r.ai_title}"` : "";
      const summary = typeof r.ai_summary === "string" ? r.ai_summary.trim() : "";
      const text = stripHtml(r.thoughts as string | null);
      // Resumo da IA (já confirmado pelo usuário) é mais denso; senão, um trecho do próprio texto.
      const body = (summary || text).replace(/\s+/g, " ").slice(0, opts.journalChars);
      const highlights = parseList(r.ai_highlights).slice(0, 3);
      const takeaway = stripHtml(r.night_takeaway as string | null).replace(/\s+/g, " ").slice(0, 200);
      const tags = parseList(r.tags).slice(0, 5);
      if (!body && highlights.length === 0 && !takeaway) continue;
      lines.push(`- ${shortDate(String(r.entry_date))}${title}: ${body || "(sem texto)"}`);
      if (highlights.length > 0) lines.push(`  destaques: ${highlights.join(" | ")}`);
      if (takeaway) lines.push(`  levo para amanhã: ${takeaway}`);
      if (tags.length > 0) lines.push(`  etiquetas: ${tags.join(", ")}`);
    }
  } else {
    lines.push("", "DIÁRIO: nenhum dia escrito no período.");
  }

  return {
    block: lines.join("\n"),
    counts: { tasksDone: doneRows.length, journalDays: journalRows.length, projects: byProject.size, habits: habitRows.length, overdue: overdueRows.length },
  };
}
