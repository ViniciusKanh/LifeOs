import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { userDayContext, shiftDayKey } from "./localDayService.js";
import { mondayKey, notifyFromAutomation } from "./automationService.js";

/**
 * Jornada do Conhecimento — camada RPG da Educação.
 *
 * O Rank Acadêmico é um rank DE JOGO calculado só por atividade verificável
 * (sessões de estudo, disciplinas/prazos/etapas concluídos). Não representa
 * título, nota ou grau acadêmico real — a UI deixa isso explícito.
 */

type Row = Record<string, unknown>;
type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export const ACADEMIC_RANKS = [
  { min: 0, title: "Aprendiz" },
  { min: 300, title: "Estudante Dedicado" },
  { min: 900, title: "Pesquisador" },
  { min: 2000, title: "Mestre do Conhecimento" },
  { min: 4000, title: "Sábio da Academia" },
] as const;

/** Pontos: 10 por hora de estudo, 30 por disciplina concluída, 15 por prazo cumprido, 40 por etapa da campanha concluída. */
export function academicPoints(p: { studyMinutes: number; subjectsDone: number; deadlinesDone: number; stagesDone: number }): number {
  return Math.floor(p.studyMinutes / 6) + p.subjectsDone * 30 + p.deadlinesDone * 15 + p.stagesDone * 40;
}

export function academicRank(points: number) {
  let idx = 0;
  for (let i = 0; i < ACADEMIC_RANKS.length; i++) if (points >= ACADEMIC_RANKS[i]!.min) idx = i;
  const cur = ACADEMIC_RANKS[idx]!;
  const next = ACADEMIC_RANKS[idx + 1] ?? null;
  return {
    level: idx + 1,
    title: cur.title,
    points,
    currentMin: cur.min,
    next: next ? { title: next.title, min: next.min } : null,
    pct: next ? Math.round(((points - cur.min) / (next.min - cur.min)) * 100) : 100,
  };
}

/** Etapas sugeridas por tipo de formação — só usadas quando o usuário pede (botão), nunca automaticamente. */
export const STAGE_TEMPLATES: Record<string, string[]> = {
  mestrado: ["Disciplinas obrigatórias", "Definição do tema", "Projeto de pesquisa", "Qualificação", "Coleta e experimentos", "Escrita da dissertação", "Defesa", "Entrega da versão final"],
  doutorado: ["Disciplinas", "Projeto de tese", "Qualificação", "Pesquisa e publicações", "Escrita da tese", "Defesa", "Entrega da versão final"],
  graduacao: ["Ciclo básico", "Ciclo profissional", "Estágio", "TCC", "Colação de grau"],
  pos_graduacao: ["Módulos", "Trabalho final", "Certificado"],
  curso_online: ["Módulos", "Projeto prático", "Avaliação", "Certificado"],
  certificacao: ["Estudo do conteúdo", "Simulados", "Exame", "Certificado"],
  curso_livre: ["Módulos", "Projeto prático", "Conclusão"],
};

export interface EducationStage {
  id: string;
  educationId: string;
  title: string;
  position: number;
  status: "pending" | "active" | "done";
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
}

function mapStage(r: Row): EducationStage {
  return {
    id: String(r.id),
    educationId: String(r.education_id),
    title: String(r.title),
    position: Number(r.position),
    status: (["pending", "active", "done"].includes(String(r.status)) ? String(r.status) : "pending") as EducationStage["status"],
    dueDate: r.due_date ? String(r.due_date) : null,
    notes: r.notes ? String(r.notes) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

export async function listStages(db: Client, ownerId: string, educationId?: string): Promise<EducationStage[]> {
  const r = await db.execute({
    sql: `SELECT * FROM education_stages WHERE owner_id = ? ${educationId ? "AND education_id = ?" : ""} ORDER BY education_id, position, created_at`,
    args: educationId ? [ownerId, educationId] : [ownerId],
  });
  return (r.rows as unknown as Row[]).map(mapStage);
}

async function ownsEducation(db: Client, ownerId: string, educationId: string): Promise<{ kind: string } | null> {
  const r = await db.execute({ sql: "SELECT kind FROM educations WHERE id = ? AND owner_id = ?", args: [educationId, ownerId] });
  return r.rows[0] ? { kind: String(r.rows[0].kind) } : null;
}

export async function createStage(db: Client, ownerId: string, input: { educationId: string; title: string; dueDate?: string | null }): Promise<EducationStage | null> {
  if (!(await ownsEducation(db, ownerId, input.educationId))) return null;
  const pos = await db.execute({ sql: "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM education_stages WHERE owner_id = ? AND education_id = ?", args: [ownerId, input.educationId] });
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO education_stages (id, owner_id, education_id, title, position, due_date) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, ownerId, input.educationId, input.title, Number(pos.rows[0]?.p ?? 0), input.dueDate ?? null],
  });
  return (await listStages(db, ownerId, input.educationId)).find((s) => s.id === id) ?? null;
}

/** Cria as etapas do modelo do tipo de formação. Só se a formação ainda não tem etapas (não duplica). */
export async function applyStageTemplate(db: Client, ownerId: string, educationId: string): Promise<EducationStage[] | null> {
  const edu = await ownsEducation(db, ownerId, educationId);
  if (!edu) return null;
  const existing = await listStages(db, ownerId, educationId);
  if (existing.length > 0) return existing;
  const titles = STAGE_TEMPLATES[edu.kind] ?? STAGE_TEMPLATES.curso_livre!;
  await db.batch(
    titles.map((title, i) => ({
      sql: "INSERT INTO education_stages (id, owner_id, education_id, title, position, status) VALUES (?, ?, ?, ?, ?, ?)",
      args: [nanoid(), ownerId, educationId, title, i, i === 0 ? "active" : "pending"],
    })),
    "write",
  );
  return listStages(db, ownerId, educationId);
}

export async function updateStage(
  db: Client,
  ownerId: string,
  id: string,
  patch: { title?: string; status?: EducationStage["status"]; dueDate?: string | null; notes?: string | null; position?: number },
): Promise<EducationStage | null> {
  const cur = await db.execute({ sql: "SELECT * FROM education_stages WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  const row = cur.rows[0] as unknown as Row | undefined;
  if (!row) return null;
  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  if (patch.title !== undefined) (sets.push("title = ?"), args.push(patch.title));
  if (patch.dueDate !== undefined) (sets.push("due_date = ?"), args.push(patch.dueDate));
  if (patch.notes !== undefined) (sets.push("notes = ?"), args.push(patch.notes));
  if (patch.position !== undefined) (sets.push("position = ?"), args.push(patch.position));
  if (patch.status !== undefined) {
    sets.push("status = ?", "completed_at = ?");
    args.push(patch.status, patch.status === "done" ? (row.completed_at ? String(row.completed_at) : new Date().toISOString()) : null);
  }
  if (sets.length === 0) return mapStage(row);
  args.push(id, ownerId);
  await db.execute({ sql: `UPDATE education_stages SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, args });
  const r = await db.execute({ sql: "SELECT * FROM education_stages WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return mapStage(r.rows[0] as unknown as Row);
}

export async function deleteStage(db: Client, ownerId: string, id: string): Promise<boolean> {
  const r = await db.execute({ sql: "DELETE FROM education_stages WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  return r.rowsAffected > 0;
}

// ------------------------------------------------------------
// Hub
// ------------------------------------------------------------

export interface EducationHubSubject {
  id: string;
  educationId: string;
  name: string;
  status: string;
  progressPct: number;
  professor: string | null;
  decks: Array<{ id: string; name: string }>;
  studyMinutesWeek: number;
}

export async function getEducationHub(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const weekStart = mondayKey(today);
  const in14 = shiftDayKey(today, 14);
  const [eduR, subjR, deckR, sessR, sessWeekR, dlR, projR, counts, stages, plan] = await Promise.all([
    db.execute({ sql: "SELECT id, kind, institution, course_name, started_at, expected_end_at, progress_pct, weekly_study_goal_minutes FROM educations WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] }),
    db.execute({
      sql: `SELECT s.id, s.name, s.status, s.progress_pct, s.professor, c.education_id FROM subjects s JOIN courses c ON c.id = s.course_id AND c.owner_id = s.owner_id
            WHERE s.owner_id = ? ORDER BY CASE s.status WHEN 'Em andamento' THEN 0 WHEN 'Planejada' THEN 1 ELSE 2 END, s.name`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, name, subject_id FROM flashcard_decks WHERE owner_id = ? AND subject_id IS NOT NULL AND archived_at IS NULL", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS v FROM study_sessions WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT education_id, subject_id, COALESCE(SUM(duration_minutes), 0) AS v FROM study_sessions WHERE owner_id = ? AND occurred_at >= ? GROUP BY education_id, subject_id", args: [ownerId, weekStart] }),
    db.execute({
      sql: `SELECT d.id, d.education_id, d.subject_id, d.title, d.due_date, s.name AS subject_name FROM academic_deadlines d LEFT JOIN subjects s ON s.id = d.subject_id
            WHERE d.owner_id = ? AND d.done = 0 AND d.due_date <= ? ORDER BY d.due_date LIMIT 30`,
      args: [ownerId, in14],
    }),
    db.execute({ sql: "SELECT id, education_id, kind, title, progress_pct, defense_date, advisor FROM academic_projects WHERE owner_id = ? ORDER BY created_at DESC", args: [ownerId] }),
    db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM subjects WHERE owner_id = ? AND status = 'Concluída') AS subjects_done,
                   (SELECT COUNT(*) FROM academic_deadlines WHERE owner_id = ? AND done = 1) AS deadlines_done,
                   (SELECT COUNT(*) FROM education_stages WHERE owner_id = ? AND status = 'done') AS stages_done`,
      args: [ownerId, ownerId, ownerId],
    }),
    listStages(db, ownerId),
    db.execute({ sql: "SELECT id, payload_json, period_key, created_at FROM module_plan_suggestions WHERE owner_id = ? AND module = 'education' AND kind = 'weekly_study' AND status = 'pending' ORDER BY created_at DESC LIMIT 1", args: [ownerId] }),
  ]);

  const decksBySubject = new Map<string, Array<{ id: string; name: string }>>();
  for (const d of deckR.rows as unknown as Row[]) {
    const k = String(d.subject_id);
    decksBySubject.set(k, [...(decksBySubject.get(k) ?? []), { id: String(d.id), name: String(d.name) }]);
  }
  const weekBySubject = new Map<string, number>();
  const weekByEdu = new Map<string, number>();
  for (const s of sessWeekR.rows as unknown as Row[]) {
    if (s.subject_id) weekBySubject.set(String(s.subject_id), (weekBySubject.get(String(s.subject_id)) ?? 0) + Number(s.v));
    weekByEdu.set(String(s.education_id), (weekByEdu.get(String(s.education_id)) ?? 0) + Number(s.v));
  }

  const subjects: EducationHubSubject[] = (subjR.rows as unknown as Row[]).map((s) => ({
    id: String(s.id),
    educationId: String(s.education_id),
    name: String(s.name),
    status: String(s.status),
    progressPct: Number(s.progress_pct ?? 0),
    professor: s.professor ? String(s.professor) : null,
    decks: decksBySubject.get(String(s.id)) ?? [],
    studyMinutesWeek: weekBySubject.get(String(s.id)) ?? 0,
  }));

  const educations = (eduR.rows as unknown as Row[]).map((e) => ({
    id: String(e.id),
    kind: String(e.kind),
    institution: e.institution ? String(e.institution) : null,
    courseName: String(e.course_name),
    startedAt: e.started_at ? String(e.started_at) : null,
    expectedEndAt: e.expected_end_at ? String(e.expected_end_at) : null,
    progressPct: Number(e.progress_pct ?? 0),
    weeklyGoalMinutes: Number(e.weekly_study_goal_minutes ?? 0),
    studyMinutesWeek: weekByEdu.get(String(e.id)) ?? 0,
  }));
  const active = educations.filter((e) => e.progressPct < 100);
  const c = (counts.rows[0] ?? {}) as Row;
  const totalMinutes = Number(sessR.rows[0]?.v ?? 0);
  const points = academicPoints({
    studyMinutes: totalMinutes,
    subjectsDone: Number(c.subjects_done ?? 0),
    deadlinesDone: Number(c.deadlines_done ?? 0),
    stagesDone: Number(c.stages_done ?? 0),
  });
  const projects = (projR.rows as unknown as Row[]).map((p) => ({
    id: String(p.id),
    educationId: p.education_id ? String(p.education_id) : null,
    kind: String(p.kind),
    title: String(p.title),
    progressPct: Number(p.progress_pct ?? 0),
    defenseDate: p.defense_date ? String(p.defense_date) : null,
    advisor: p.advisor ? String(p.advisor) : null,
  }));
  const deadlines = (dlR.rows as unknown as Row[]).map((d) => ({
    id: String(d.id),
    educationId: String(d.education_id),
    subjectName: d.subject_name ? String(d.subject_name) : null,
    title: String(d.title),
    dueDate: String(d.due_date),
    overdue: String(d.due_date) < today,
  }));
  const planRow = plan.rows[0] as unknown as Row | undefined;

  return {
    today,
    rank: academicRank(points),
    breakdown: { studyMinutes: totalMinutes, subjectsDone: Number(c.subjects_done ?? 0), deadlinesDone: Number(c.deadlines_done ?? 0), stagesDone: Number(c.stages_done ?? 0) },
    indicators: {
      activeEducations: active.length,
      subjectsInProgress: subjects.filter((s) => s.status === "Em andamento").length,
      studyMinutesWeek: [...weekByEdu.values()].reduce((a, b) => a + b, 0),
      studyMinutesTotal: totalMinutes,
      academicProjectsOpen: projects.filter((p) => p.progressPct < 100).length,
      upcomingDeadlines: deadlines.length,
      overdueDeadlines: deadlines.filter((d) => d.overdue).length,
      avgProgressPct: active.length ? Math.round(active.reduce((a, e) => a + e.progressPct, 0) / active.length) : null,
    },
    educations,
    subjects,
    stages,
    deadlines,
    projects,
    pendingPlan: planRow ? { id: String(planRow.id), weekStart: String(planRow.period_key), payload: JSON.parse(String(planRow.payload_json)) as StudyPlanPayload } : null,
  };
}

// ------------------------------------------------------------
// Automações
// ------------------------------------------------------------

export async function runSmartDeadlines(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  const until = shiftDayKey(today, Number(config.daysBefore ?? 5));
  const r = await db.execute({ sql: "SELECT title, due_date FROM academic_deadlines WHERE owner_id = ? AND done = 0 AND due_date <= ? ORDER BY due_date", args: [ownerId, until] });
  const rows = r.rows as unknown as Row[];
  if (rows.length === 0) return { status: "skipped", summary: "Nenhum prazo acadêmico nos próximos dias." };
  const overdue = rows.filter((x) => String(x.due_date) < today).length;
  const next = rows.find((x) => String(x.due_date) >= today);
  const body = `${rows.length - overdue} prazo(s) chegando${next ? ` — o próximo: ${String(next.title)} (${String(next.due_date)})` : ""}${overdue ? `. ${overdue} já passou sem conclusão.` : "."}`;
  await notifyFromAutomation(db, ownerId, { eventType: "education_deadlines", title: "Prazos da Academia", body, url: "/educacao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

export interface StudyPlanPayload {
  weekStart: string;
  goalMinutes: number;
  items: Array<{ date: string; subjectId: string | null; subjectName: string; minutes: number; title: string; reason: string }>;
}

/** Plano semanal (B): distribui a meta de horas entre disciplinas em andamento, priorizando as com prazo próximo. */
export async function runWeeklyStudyPlan(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const { today } = await userDayContext(db, ownerId);
  // De segunda a quinta planeja a semana atual (a partir de hoje); de sexta em diante, a próxima.
  const mon = mondayKey(today);
  const dow = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${mon}T00:00:00Z`)) / 86_400_000);
  const weekStart = dow >= 4 ? shiftDayKey(mon, 7) : mon;
  const [subj, goal, dl] = await Promise.all([
    db.execute({
      sql: `SELECT s.id, s.name FROM subjects s JOIN courses c ON c.id = s.course_id JOIN educations e ON e.id = c.education_id
            WHERE s.owner_id = ? AND s.status = 'Em andamento' AND e.progress_pct < 100 ORDER BY s.name`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COALESCE(SUM(weekly_study_goal_minutes), 0) AS v FROM educations WHERE owner_id = ? AND progress_pct < 100", args: [ownerId] }),
    db.execute({ sql: "SELECT subject_id, MIN(due_date) AS due FROM academic_deadlines WHERE owner_id = ? AND done = 0 AND subject_id IS NOT NULL AND due_date >= ? GROUP BY subject_id", args: [ownerId, today] }),
  ]);
  const subjects = subj.rows as unknown as Row[];
  if (subjects.length === 0) return { status: "skipped", summary: "Nenhuma disciplina em andamento para planejar." };
  const dueBy = new Map((dl.rows as unknown as Row[]).map((r) => [String(r.subject_id), String(r.due)]));
  // Disciplinas com prazo mais próximo primeiro (recebem as primeiras sessões da semana).
  const ordered = [...subjects].sort((a, b) => (dueBy.get(String(a.id)) ?? "9999").localeCompare(dueBy.get(String(b.id)) ?? "9999"));
  const sessionMinutes = Number(config.sessionMinutes ?? 50);
  const perDay = Number(config.sessionsPerDay ?? 2);
  const days = Array.from({ length: config.includeWeekend === true ? 7 : 5 }, (_, i) => shiftDayKey(weekStart, i)).filter((d) => d >= today);
  const goalMinutes = Number(goal.rows[0]?.v ?? 0) || 600;
  const totalSessions = Math.min(days.length * perDay, Math.ceil(goalMinutes / sessionMinutes));
  const items: StudyPlanPayload["items"] = [];
  for (let i = 0; i < totalSessions; i++) {
    const s = ordered[i % ordered.length]!;
    const due = dueBy.get(String(s.id));
    items.push({
      date: days[Math.floor(i / perDay)]!,
      subjectId: String(s.id),
      subjectName: String(s.name),
      minutes: sessionMinutes,
      title: `Estudar ${String(s.name)}`,
      reason: due ? `prazo em ${due}` : "disciplina em andamento",
    });
  }
  if (items.length === 0) return { status: "skipped", summary: "Não há dias restantes nesta semana para planejar." };
  const payload: StudyPlanPayload = { weekStart, goalMinutes, items };
  await db.execute({
    sql: `INSERT INTO module_plan_suggestions (id, owner_id, module, kind, period_key, payload_json) VALUES (?, ?, 'education', 'weekly_study', ?, ?)
          ON CONFLICT (owner_id, module, kind, period_key) DO UPDATE SET payload_json = excluded.payload_json, created_at = datetime('now')
          WHERE module_plan_suggestions.status = 'pending'`,
    args: [nanoid(), ownerId, weekStart, JSON.stringify(payload)],
  });
  return { status: "ok", summary: `Plano sugerido: ${items.length} sessão(ões) de ${sessionMinutes} min a partir de ${weekStart}. Revise e aprove na Educação.` };
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Aplica (com as edições do usuário) o plano sugerido: cria uma tarefa por sessão. */
export async function decideStudyPlan(
  db: Client,
  ownerId: string,
  id: string,
  decision: "apply" | "reject",
  items?: Array<{ date: string; subjectId?: string | null; minutes: number; title: string }>,
): Promise<{ ok: boolean; created: number; message?: string }> {
  const r = await db.execute({ sql: "SELECT id, status FROM module_plan_suggestions WHERE id = ? AND owner_id = ? AND module = 'education'", args: [id, ownerId] });
  const row = r.rows[0] as unknown as Row | undefined;
  if (!row) return { ok: false, created: 0, message: "Plano não encontrado." };
  if (String(row.status) !== "pending") return { ok: false, created: 0, message: "Este plano já foi decidido." };
  if (decision === "reject") {
    await db.execute({ sql: "UPDATE module_plan_suggestions SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
    return { ok: true, created: 0 };
  }
  // Marca como aplicado ANTES de criar tarefas: um segundo clique não duplica nada.
  const claim = await db.execute({ sql: "UPDATE module_plan_suggestions SET status = 'applied', decided_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'pending'", args: [id, ownerId] });
  if (claim.rowsAffected === 0) return { ok: false, created: 0, message: "Este plano já foi decidido." };
  let created = 0;
  for (const it of (items ?? []).slice(0, 42)) {
    const title = String(it.title ?? "").trim().slice(0, 200);
    if (!title || !isDate(it.date)) continue;
    await db.execute({
      sql: "INSERT INTO tasks (id, owner_id, title, description, status, priority, due_date, estimate_minutes) VALUES (?, ?, ?, ?, 'A Fazer', 'Média', ?, ?)",
      args: [nanoid(), ownerId, title, "Sessão do plano semanal de estudo (Educação).", it.date, Math.max(5, Math.min(240, Math.round(Number(it.minutes) || 50)))],
    });
    created++;
  }
  return { ok: true, created };
}

export async function runGrimoireLink(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const r = await db.execute({
    sql: `SELECT s.name, (SELECT COUNT(*) FROM flashcard_decks d WHERE d.owner_id = s.owner_id AND d.subject_id = s.id AND d.archived_at IS NULL) AS decks
          FROM subjects s WHERE s.owner_id = ? AND s.status = 'Em andamento'`,
    args: [ownerId],
  });
  const rows = r.rows as unknown as Row[];
  if (rows.length === 0) return { status: "skipped", summary: "Nenhuma disciplina em andamento." };
  const missing = rows.filter((x) => Number(x.decks) === 0).map((x) => String(x.name));
  if (missing.length > 0 && config.inApp !== false) {
    await notifyFromAutomation(db, ownerId, {
      eventType: "education_grimoire",
      title: "Disciplinas sem tomo no Grimório",
      body: `${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` e mais ${missing.length - 3}` : ""} ainda não têm baralho. Criar um ajuda a revisar.`,
      url: "/grimorio",
      inApp: true,
      push: false,
    });
  }
  return { status: "ok", summary: `${rows.length - missing.length}/${rows.length} disciplina(s) em andamento com baralho no Grimório.` };
}

/** Progresso automático (D): média das partes disponíveis (disciplinas, etapas, projetos). Só grava se mudou. */
export async function runAutoProgress(db: Client, ownerId: string): Promise<Outcome> {
  const edus = await db.execute({ sql: "SELECT id, progress_pct FROM educations WHERE owner_id = ?", args: [ownerId] });
  let changed = 0;
  for (const e of edus.rows as unknown as Row[]) {
    const id = String(e.id);
    const [s, st, p] = await Promise.all([
      db.execute({ sql: "SELECT COUNT(*) AS n, SUM(CASE WHEN s.status = 'Concluída' THEN 1 ELSE 0 END) AS d FROM subjects s JOIN courses c ON c.id = s.course_id WHERE s.owner_id = ? AND c.education_id = ? AND s.status <> 'Trancada'", args: [ownerId, id] }),
      db.execute({ sql: "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS d FROM education_stages WHERE owner_id = ? AND education_id = ?", args: [ownerId, id] }),
      db.execute({ sql: "SELECT AVG(progress_pct) AS v, COUNT(*) AS n FROM academic_projects WHERE owner_id = ? AND education_id = ?", args: [ownerId, id] }),
    ]);
    const parts: number[] = [];
    const sr = s.rows[0] as unknown as Row;
    if (Number(sr.n) > 0) parts.push((Number(sr.d ?? 0) / Number(sr.n)) * 100);
    const str = st.rows[0] as unknown as Row;
    if (Number(str.n) > 0) parts.push((Number(str.d ?? 0) / Number(str.n)) * 100);
    const pr = p.rows[0] as unknown as Row;
    if (Number(pr.n) > 0) parts.push(Number(pr.v ?? 0));
    if (parts.length === 0) continue;
    const pct = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    if (pct !== Number(e.progress_pct)) {
      await db.execute({ sql: "UPDATE educations SET progress_pct = ? WHERE id = ? AND owner_id = ?", args: [pct, id, ownerId] });
      changed++;
    }
  }
  return changed > 0 ? { status: "ok", summary: `${changed} formação(ões) com progresso recalculado.` } : { status: "skipped", summary: "Progresso já está em dia." };
}
