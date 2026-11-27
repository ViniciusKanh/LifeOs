import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { awardTaskCompletion } from "./gamificationService.js";
import { syncAutoHabitsAfterWrite } from "./habitAutoService.js";
import { decryptSecret, encryptSecret } from "./cryptoService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Quadro do ClickUp (Profissional) — importa as tarefas atribuídas ao usuário
 * para um projeto profissional do LifeOS, sem digitar duas vezes.
 *
 * Direção única (ClickUp → LifeOS), com regras simples e previsíveis:
 *  - título, prazo e prioridade seguem o ClickUp a cada sincronização;
 *  - fechada no ClickUp → "Concluído" no LifeOS com o XP normal de missão
 *    (awardTaskCompletion, idempotente). Fechamentos anteriores à conexão
 *    entram como concluídos SEM XP (não pagamos trabalho retroativo);
 *  - concluída no LifeOS nunca é reaberta por uma sincronização;
 *  - tarefa apagada no LifeOS não volta (o vínculo fica sem task_id);
 *  - nada é escrito no ClickUp (o token só precisa ler).
 */

export class ClickUpError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

const API = "https://api.clickup.com/api/v2";
const BUDGET_MS = 22_000;
const MAX_PAGES = 5;
const FIRST_CLOSED_DAYS = 14;

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 401 || err.status === 403) throw new ClickUpError("O ClickUp recusou o token. Gere um token pessoal em ClickUp → Settings → Apps (começa com pk_).", 422);
    if (err.status === 429) throw new ClickUpError("O ClickUp limitou as consultas. Tente em alguns minutos.", 429);
    throw new ClickUpError(err.message, 502);
  }
  throw err;
}

const get = <T>(path: string, token: string) => fetchJson<T>(`${API}${path}`, { headers: { Authorization: token, Accept: "application/json" } }, { label: "ClickUp", timeoutMs: 12_000 }).catch(friendly);

export interface CuTask {
  id: string;
  custom_id?: string | null;
  name: string;
  text_content?: string | null;
  status: { status: string; type: string };
  priority: { priority: string } | null;
  due_date: string | null;
  date_updated: string;
  date_closed?: string | null;
  date_done?: string | null;
  url: string;
  list?: { name: string } | null;
  folder?: { name: string; hidden?: boolean } | null;
}

/** Status do ClickUp → coluna do LifeOS. */
export function mapClickUpStatus(s: CuTask["status"]): "A Fazer" | "Em Andamento" | "Concluído" {
  if (s.type === "closed" || s.type === "done") return "Concluído";
  const name = s.status.toLowerCase();
  if (/progress|andamento|doing|fazendo|review|revis|qa|teste|bloq|aguard|wait/.test(name)) return "Em Andamento";
  return "A Fazer";
}

export function mapClickUpPriority(p: CuTask["priority"]): "Alta" | "Média" | "Baixa" {
  const v = p?.priority?.toLowerCase();
  if (v === "urgent" || v === "high") return "Alta";
  if (v === "low") return "Baixa";
  return "Média";
}

interface Conn {
  token_enc: string;
  clickup_user_id: string;
  username: string | null;
  team_id: string | null;
  team_name: string | null;
  project_id: string | null;
  last_cursor_ms: number | null;
  created_at: string;
}

async function getConn(db: Client, ownerId: string): Promise<Conn | null> {
  const r = await db.execute({ sql: "SELECT * FROM clickup_connections WHERE owner_id = ?", args: [ownerId] });
  return (r.rows[0] as unknown as Conn | undefined) ?? null;
}

export async function connectClickUp(db: Client, ownerId: string, tokenRaw: string) {
  const token = tokenRaw.trim();
  const me = await get<{ user: { id: number; username: string | null } }>("/user", token);
  const teams = await get<{ teams: Array<{ id: string; name: string }> }>("/team", token);
  const team = teams?.teams?.[0];
  if (!team) throw new ClickUpError("Esse token não tem acesso a nenhum Workspace do ClickUp.", 422);
  await db.execute({
    sql: `INSERT INTO clickup_connections (owner_id, token_enc, clickup_user_id, username, team_id, team_name) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET token_enc = excluded.token_enc, clickup_user_id = excluded.clickup_user_id, username = excluded.username,
            team_id = excluded.team_id, team_name = excluded.team_name, last_cursor_ms = NULL, last_sync_status = NULL, last_sync_error = NULL, updated_at = datetime('now')`,
    args: [ownerId, encryptSecret(token), String(me.user.id), me.user.username, team.id, team.name],
  });
  await recordWorldEvent(db, ownerId, { type: "clickup.connected", title: "O Quadro do ClickUp foi conectado à área Profissional", detail: team.name });
  return { username: me.user.username, team: { id: team.id, name: team.name }, teams: teams.teams.map((t) => ({ id: t.id, name: t.name })) };
}

export async function listClickUpTeams(db: Client, ownerId: string) {
  const c = await getConn(db, ownerId);
  if (!c) throw new ClickUpError("Conecte o ClickUp primeiro.", 404);
  const teams = await get<{ teams: Array<{ id: string; name: string }> }>("/team", decryptSecret(c.token_enc));
  return (teams?.teams ?? []).map((t) => ({ id: t.id, name: t.name }));
}

export async function updateClickUpSettings(db: Client, ownerId: string, s: { teamId?: string; projectId?: string | null }) {
  const c = await getConn(db, ownerId);
  if (!c) throw new ClickUpError("Conecte o ClickUp primeiro.", 404);
  if (s.teamId && s.teamId !== c.team_id) {
    const teams = await listClickUpTeams(db, ownerId);
    const t = teams.find((x) => x.id === s.teamId);
    if (!t) throw new ClickUpError("Workspace não encontrado.", 404);
    await db.execute({ sql: "UPDATE clickup_connections SET team_id = ?, team_name = ?, last_cursor_ms = NULL, updated_at = datetime('now') WHERE owner_id = ?", args: [t.id, t.name, ownerId] });
  }
  if (s.projectId !== undefined) {
    if (s.projectId) {
      const p = await db.execute({ sql: "SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND kind = 'professional' AND archived_at IS NULL", args: [s.projectId, ownerId] });
      if (!p.rows.length) throw new ClickUpError("Escolha um projeto profissional ativo.", 404);
    }
    await db.execute({ sql: "UPDATE clickup_connections SET project_id = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [s.projectId, ownerId] });
  }
}

/** Desconecta e apaga o token. Tarefas importadas continuam (são suas). */
export async function disconnectClickUp(db: Client, ownerId: string) {
  await db.execute({ sql: "DELETE FROM clickup_connections WHERE owner_id = ?", args: [ownerId] });
}

async function ensureProject(db: Client, ownerId: string, c: Conn): Promise<string> {
  if (c.project_id) {
    const p = await db.execute({ sql: "SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND archived_at IS NULL", args: [c.project_id, ownerId] });
    if (p.rows.length) return c.project_id;
  }
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO projects (id, owner_id, name, description, kind, color) VALUES (?, ?, ?, ?, 'professional', '#7B68EE')",
    args: [id, ownerId, `ClickUp · ${c.team_name ?? "Trabalho"}`.slice(0, 80), "Tarefas importadas do ClickUp (atribuídas a você)."],
  });
  await db.execute({ sql: "UPDATE clickup_connections SET project_id = ? WHERE owner_id = ?", args: [id, ownerId] });
  return id;
}

const msIso = (ms: string | null | undefined) => (ms && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

/**
 * Aplica uma lista de tarefas do ClickUp. Exportada para testes: aplicar a
 * mesma lista de novo não cria tarefas nem XP.
 */
export async function applyClickUpTasks(db: Client, ownerId: string, tasks: CuTask[], ctx: { projectId: string; tz: string; connectedAt: string; firstSync: boolean }) {
  let created = 0;
  let updated = 0;
  let completed = 0;
  const closedFloor = Date.now() - FIRST_CLOSED_DAYS * 86_400_000;
  for (const t of tasks) {
    const status = mapClickUpStatus(t.status);
    const priority = mapClickUpPriority(t.priority);
    const dueIso = msIso(t.due_date);
    const due = dueIso ? localDayOfStored(dueIso, ctx.tz) : null;
    const closedAt = msIso(t.date_closed ?? t.date_done) ?? (status === "Concluído" ? new Date().toISOString() : null);
    const title = (t.custom_id ? `[${t.custom_id}] ${t.name}` : t.name).slice(0, 200);
    const description = t.text_content ? t.text_content.slice(0, 2000) : null;
    const link = await db.execute({ sql: "SELECT task_id FROM clickup_task_links WHERE owner_id = ? AND clickup_id = ?", args: [ownerId, t.id] });
    let taskId: string | null = null;
    if (link.rows[0]) {
      taskId = link.rows[0].task_id == null ? null : String(link.rows[0].task_id);
      if (taskId) {
        const cur = await db.execute({ sql: "SELECT status FROM tasks WHERE id = ? AND owner_id = ?", args: [taskId, ownerId] });
        const local = cur.rows[0] ? String(cur.rows[0].status) : null;
        if (local === null) taskId = null;
        else {
          // Concluída no LifeOS não reabre; aberta vira concluída quando o ClickUp fecha.
          const nextStatus = local === "Concluído" ? "Concluído" : status;
          await db.execute({
            sql: `UPDATE tasks SET title = ?, due_date = ?, priority = ?, status = ?, completed_at = CASE WHEN ? = 'Concluído' THEN COALESCE(completed_at, ?) ELSE NULL END,
                    updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
            args: [title, due, priority, nextStatus, nextStatus, closedAt, taskId, ownerId],
          });
          updated++;
          if (local !== "Concluído" && nextStatus === "Concluído") {
            completed++;
            await awardTaskCompletion(db, ownerId, taskId);
          }
        }
      }
    } else {
      // Fechadas há muito tempo não entram na primeira importação.
      if (status === "Concluído" && closedAt && Date.parse(closedAt) < closedFloor) continue;
      taskId = nanoid();
      await db.execute({
        sql: `INSERT INTO tasks (id, owner_id, project_id, title, description, status, priority, due_date, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [taskId, ownerId, ctx.projectId, title, description, status, priority, due, status === "Concluído" ? closedAt : null],
      });
      created++;
      // Só paga XP de fechamento que aconteceu depois da conexão (sincronizações seguintes).
      if (status === "Concluído" && !ctx.firstSync && closedAt && closedAt >= ctx.connectedAt) {
        completed++;
        await awardTaskCompletion(db, ownerId, taskId);
      }
    }
    await db.execute({
      sql: `INSERT INTO clickup_task_links (owner_id, clickup_id, task_id, list_name, url, clickup_status, status_type, date_updated_ms, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (owner_id, clickup_id) DO UPDATE SET task_id = excluded.task_id, list_name = excluded.list_name, url = excluded.url,
              clickup_status = excluded.clickup_status, status_type = excluded.status_type, date_updated_ms = excluded.date_updated_ms, synced_at = excluded.synced_at`,
      args: [ownerId, t.id, taskId, t.list?.name ?? null, t.url, t.status.status, t.status.type, Number(t.date_updated) || null],
    });
  }
  if (completed > 0) await syncAutoHabitsAfterWrite(db, ownerId);
  return { created, updated, completed };
}

export async function syncClickUp(db: Client, ownerId: string) {
  const c = await getConn(db, ownerId);
  if (!c) throw new ClickUpError("Conecte o ClickUp primeiro.", 404);
  if (!c.team_id) throw new ClickUpError("Escolha um Workspace do ClickUp.", 422);
  const deadline = Date.now() + BUDGET_MS;
  const token = decryptSecret(c.token_enc);
  const { tz } = await userDayContext(db, ownerId);
  const projectId = await ensureProject(db, ownerId, c);
  const firstSync = c.last_cursor_ms == null;
  const startedMs = Date.now();
  const base = `/team/${encodeURIComponent(c.team_id)}/task?assignees[]=${encodeURIComponent(c.clickup_user_id)}&subtasks=true&order_by=updated&reverse=true`;
  // Primeira vez: todas as abertas + fechadas recentes. Depois: só o que mudou.
  const passes = firstSync
    ? [`${base}&include_closed=false`, `${base}&include_closed=true&date_updated_gt=${startedMs - FIRST_CLOSED_DAYS * 86_400_000}`]
    : [`${base}&include_closed=true&date_updated_gt=${Number(c.last_cursor_ms) - 5 * 60_000}`];
  const seen = new Map<string, CuTask>();
  let complete = true;
  try {
    for (const pass of passes) {
      for (let page = 0; page < MAX_PAGES; page++) {
        if (Date.now() > deadline) {
          complete = false;
          break;
        }
        const r = await get<{ tasks: CuTask[]; last_page?: boolean }>(`${pass}&page=${page}`, token);
        for (const t of r?.tasks ?? []) seen.set(t.id, t);
        if (!r?.tasks?.length || r.last_page !== false) break;
        if (page === MAX_PAGES - 1) complete = false;
      }
    }
    const out = await applyClickUpTasks(db, ownerId, [...seen.values()], { projectId, tz, connectedAt: new Date(c.created_at.replace(" ", "T") + "Z").toISOString(), firstSync });
    await db.execute({
      sql: "UPDATE clickup_connections SET last_cursor_ms = ?, last_sync_at = ?, last_sync_status = ?, last_sync_error = NULL, updated_at = datetime('now') WHERE owner_id = ?",
      args: [complete ? startedMs : c.last_cursor_ms ?? startedMs - FIRST_CLOSED_DAYS * 86_400_000, new Date().toISOString(), complete ? "ok" : "parcial", ownerId],
    });
    if (out.created > 0 && firstSync) await recordWorldEvent(db, ownerId, { type: "clickup.imported", title: `${out.created} contrato(s) do ClickUp chegaram ao Quadro Profissional` });
    return { ok: true as const, complete, ...out };
  } catch (err) {
    await db.execute({ sql: "UPDATE clickup_connections SET last_sync_status = 'erro', last_sync_error = ? WHERE owner_id = ?", args: [(err instanceof Error ? err.message : "Falha.").slice(0, 300), ownerId] });
    throw err;
  }
}

export async function getClickUpOverview(db: Client, ownerId: string) {
  const c = await getConn(db, ownerId);
  const { today } = await userDayContext(db, ownerId);
  const weekAgo = shiftDayKey(today, -6);
  const weekAhead = shiftDayKey(today, 7);
  const base = `FROM clickup_task_links l JOIN tasks t ON t.id = l.task_id AND t.owner_id = l.owner_id WHERE l.owner_id = ?`;
  const [counts, upcoming, recentDone, xp, project, sync] = await Promise.all([
    db.execute({
      sql: `SELECT SUM(CASE WHEN t.status <> 'Concluído' THEN 1 ELSE 0 END) AS open,
                   SUM(CASE WHEN t.status = 'Em Andamento' THEN 1 ELSE 0 END) AS doing,
                   SUM(CASE WHEN t.status <> 'Concluído' AND t.due_date IS NOT NULL AND date(t.due_date) < date(?) THEN 1 ELSE 0 END) AS overdue,
                   SUM(CASE WHEN t.status <> 'Concluído' AND t.due_date IS NOT NULL AND date(t.due_date) >= date(?) AND date(t.due_date) <= date(?) THEN 1 ELSE 0 END) AS due_week,
                   SUM(CASE WHEN t.status = 'Concluído' THEN 1 ELSE 0 END) AS done_total ${base}`,
      args: [today, today, weekAhead, ownerId],
    }),
    db.execute({
      sql: `SELECT t.id, t.title, t.status, t.priority, t.due_date, l.url, l.list_name, l.clickup_status ${base} AND t.status <> 'Concluído'
            ORDER BY t.due_date IS NULL, date(t.due_date), CASE t.priority WHEN 'Alta' THEN 0 WHEN 'Média' THEN 1 ELSE 2 END LIMIT 12`,
      args: [ownerId],
    }),
    db.execute({ sql: `SELECT t.id, t.title, t.completed_at, l.url ${base} AND t.status = 'Concluído' AND t.completed_at IS NOT NULL ORDER BY t.completed_at DESC LIMIT 6`, args: [ownerId] }),
    db.execute({
      sql: `SELECT COALESCE(SUM(x.xp), 0) AS xp, COUNT(DISTINCT CASE WHEN x.day_key >= ? THEN x.source_id END) AS week_done
              FROM xp_events x JOIN clickup_task_links l ON l.task_id = x.source_id AND l.owner_id = x.owner_id
             WHERE x.owner_id = ? AND x.source_type = 'task'`,
      args: [weekAgo, ownerId],
    }),
    c?.project_id ? db.execute({ sql: "SELECT id, name FROM projects WHERE id = ? AND owner_id = ?", args: [c.project_id, ownerId] }) : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    db.execute({ sql: "SELECT last_sync_at, last_sync_status, last_sync_error FROM clickup_connections WHERE owner_id = ?", args: [ownerId] }),
  ]);
  const k = counts.rows[0];
  const s = sync.rows[0];
  const p = project.rows[0];
  return {
    connected: !!c,
    connection: c
      ? {
          username: c.username,
          team: c.team_id ? { id: c.team_id, name: c.team_name ?? "" } : null,
          project: p ? { id: String(p.id), name: String(p.name) } : null,
          lastSyncAt: s?.last_sync_at == null ? null : String(s.last_sync_at),
          lastSyncStatus: s?.last_sync_status == null ? null : (String(s.last_sync_status) as "ok" | "parcial" | "erro"),
          lastSyncError: s?.last_sync_error == null ? null : String(s.last_sync_error),
        }
      : null,
    counts: { open: Number(k?.open ?? 0), doing: Number(k?.doing ?? 0), overdue: Number(k?.overdue ?? 0), dueWeek: Number(k?.due_week ?? 0), doneTotal: Number(k?.done_total ?? 0), doneWeek: Number(xp.rows[0]?.week_done ?? 0) },
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    today,
    upcoming: upcoming.rows.map((r) => ({ id: String(r.id), title: String(r.title), status: String(r.status), priority: String(r.priority), dueDate: r.due_date == null ? null : String(r.due_date).slice(0, 10), url: r.url == null ? null : String(r.url), list: r.list_name == null ? null : String(r.list_name), clickupStatus: r.clickup_status == null ? null : String(r.clickup_status) })),
    recentDone: recentDone.rows.map((r) => ({ id: String(r.id), title: String(r.title), completedAt: String(r.completed_at), url: r.url == null ? null : String(r.url) })),
  };
}

/** Cron: sincroniza quem tem ClickUp conectado (incremental, poucos usuários por vez). */
export async function clickUpDailySync(db: Client, limit = 5) {
  const r = await db.execute({ sql: "SELECT owner_id FROM clickup_connections ORDER BY last_sync_at ASC LIMIT ?", args: [limit] });
  let n = 0;
  for (const row of r.rows) if (await syncClickUp(db, String(row.owner_id)).then(() => true).catch(() => false)) n++;
  return n;
}
