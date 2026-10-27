import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { restoreBackup } from "../src/services/backupRestoreService.js";

/** Monta uma teia real de dados cruzando os módulos do escopo V1 para o usuário `owner`. */
async function seedSourceData(ownerId: string) {
  const db = getDb();
  const id = () => nanoid();
  const ids = {
    goal1: id(), goal2: id(),
    habit1: id(), habit2: id(), habitEntry1: id(),
    project1: id(), project2: id(),
    taskStatus1: id(),
    task1: id(), task2: id(), subtask1: id(),
    tag1: id(),
    health1: id(), water1: id(), workout1: id(), workoutSet1: id(),
    book1: id(), bookNote1: id(), readingSession1: id(),
    education1: id(), course1: id(), subject1: id(), academicProject1: id(), academicDeadline1: id(), studySession1: id(), semesterItem1: id(),
    journal1: id(), journalEntry1: id(),
  };

  await db.batch(
    [
      { sql: "INSERT INTO goals (id, owner_id, title, kind, status) VALUES (?, ?, 'Meta raiz', 'task_based', 'active')", args: [ids.goal1, ownerId] },
      { sql: "INSERT INTO goals (id, owner_id, parent_goal_id, title, kind, status) VALUES (?, ?, ?, 'Sub-meta', 'task_based', 'active')", args: [ids.goal2, ownerId, ids.goal1] },

      { sql: "INSERT INTO habits (id, owner_id, name, frequency) VALUES (?, ?, 'Ler', 'daily')", args: [ids.habit1, ownerId] },
      { sql: "INSERT INTO habits (id, owner_id, name, frequency, after_habit_id) VALUES (?, ?, 'Meditar', 'daily', ?)", args: [ids.habit2, ownerId, ids.habit1] },
      { sql: "INSERT INTO habit_entries (id, habit_id, owner_id, entry_date, count) VALUES (?, ?, ?, '2026-10-01', 1)", args: [ids.habitEntry1, ids.habit1, ownerId] },

      { sql: "INSERT INTO projects (id, owner_id, name, kind, goal_id) VALUES (?, ?, 'Projeto raiz', 'personal', ?)", args: [ids.project1, ownerId, ids.goal1] },
      { sql: "INSERT INTO projects (id, owner_id, parent_id, name, kind) VALUES (?, ?, ?, 'Sub-projeto', 'personal')", args: [ids.project2, ownerId, ids.project1] },

      { sql: "INSERT INTO task_statuses (id, owner_id, name, position, is_default) VALUES (?, ?, 'Em revisão', 0, 0)", args: [ids.taskStatus1, ownerId] },
      { sql: "INSERT INTO tasks (id, owner_id, project_id, goal_id, habit_id, title, status, priority) VALUES (?, ?, ?, ?, ?, 'Tarefa principal', 'A Fazer', 'Média')", args: [ids.task1, ownerId, ids.project1, ids.goal1, ids.habit1] },
      { sql: "INSERT INTO tasks (id, owner_id, project_id, parent_task_id, title, status, priority) VALUES (?, ?, ?, ?, 'Subtarefa de verdade (task filha)', 'A Fazer', 'Média')", args: [ids.task2, ownerId, ids.project1, ids.task1] },
      { sql: "INSERT INTO subtasks (id, task_id, owner_id, title, done) VALUES (?, ?, ?, 'Checklist item', 0)", args: [ids.subtask1, ids.task1, ownerId] },
      { sql: "INSERT INTO tags (id, owner_id, name, color) VALUES (?, ?, 'importante', '#f00')", args: [ids.tag1, ownerId] },
      { sql: "INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", args: [ids.task1, ids.tag1] },
      { sql: "INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)", args: [ids.task2, ids.task1] },

      { sql: "INSERT INTO health_entries (id, owner_id, metric, value, recorded_at) VALUES (?, ?, 'weight', 70, '2026-10-01T10:00:00Z')", args: [ids.health1, ownerId] },
      { sql: "INSERT INTO water_entries (id, owner_id, amount_ml, recorded_at) VALUES (?, ?, 300, '2026-10-01T10:00:00Z')", args: [ids.water1, ownerId] },
      { sql: "INSERT INTO workouts (id, owner_id, kind, duration_minutes, performed_at, category) VALUES (?, ?, 'Treino A', 60, '2026-10-01T10:00:00Z', 'musculacao')", args: [ids.workout1, ownerId] },
      { sql: "INSERT INTO workout_sets (id, owner_id, workout_id, position, exercise, sets, reps, load_kg) VALUES (?, ?, ?, 1, 'Supino', 3, 10, 60)", args: [ids.workoutSet1, ownerId, ids.workout1] },

      { sql: "INSERT INTO books (id, owner_id, title, author, status) VALUES (?, ?, 'Livro X', 'Autor Y', 'Lendo')", args: [ids.book1, ownerId] },
      { sql: "INSERT INTO book_notes (id, book_id, owner_id, kind, content) VALUES (?, ?, ?, 'quote', 'Trecho marcante')", args: [ids.bookNote1, ids.book1, ownerId] },
      { sql: "INSERT INTO reading_sessions (id, book_id, owner_id, started_at, duration_minutes, pages_read) VALUES (?, ?, ?, '2026-10-01T10:00:00Z', 30, 20)", args: [ids.readingSession1, ids.book1, ownerId] },

      { sql: "INSERT INTO educations (id, owner_id, kind, course_name) VALUES (?, ?, 'mestrado', 'Ciência da Computação')", args: [ids.education1, ownerId] },
      { sql: "INSERT INTO courses (id, education_id, owner_id, name) VALUES (?, ?, ?, 'Período 1')", args: [ids.course1, ids.education1, ownerId] },
      { sql: "INSERT INTO subjects (id, course_id, owner_id, name) VALUES (?, ?, ?, 'IA Aplicada')", args: [ids.subject1, ids.course1, ownerId] },
      { sql: "INSERT INTO academic_projects (id, owner_id, project_id, kind, title, education_id) VALUES (?, ?, ?, 'dissertacao', 'Dissertação', ?)", args: [ids.academicProject1, ownerId, ids.project1, ids.education1] },
      { sql: "INSERT INTO academic_deadlines (id, owner_id, education_id, subject_id, title, due_date) VALUES (?, ?, ?, ?, 'Entrega parcial', '2026-12-01')", args: [ids.academicDeadline1, ownerId, ids.education1, ids.subject1] },
      { sql: "INSERT INTO study_sessions (id, owner_id, education_id, subject_id, occurred_at, duration_minutes) VALUES (?, ?, ?, ?, '2026-10-01T10:00:00Z', 90)", args: [ids.studySession1, ownerId, ids.education1, ids.subject1] },
      { sql: "INSERT INTO semester_checklist (id, owner_id, education_id, title, done) VALUES (?, ?, ?, 'Matricular disciplinas', 1)", args: [ids.semesterItem1, ownerId, ids.education1] },

      { sql: "INSERT INTO journals (id, owner_id, name) VALUES (?, ?, 'Diário principal')", args: [ids.journal1, ownerId] },
      {
        sql: "INSERT INTO journal_entries (id, owner_id, entry_date, thoughts, focus_task_ids) VALUES (?, ?, '2026-10-01', 'Dia produtivo', ?)",
        args: [ids.journalEntry1, ownerId, JSON.stringify([ids.task1, ids.task2, "id-que-nao-existe"])],
      },
      { sql: "INSERT INTO journal_entry_journals (entry_id, journal_id) VALUES (?, ?)", args: [ids.journalEntry1, ids.journal1] },
      { sql: "INSERT INTO journal_entry_links (id, entry_id, owner_id, target_type, target_id) VALUES (?, ?, ?, 'project', ?)", args: [id(), ids.journalEntry1, ownerId, ids.project1] },
    ],
    "write"
  );

  return ids;
}

describe("Restauração de backup (escopo V1)", () => {
  it("restaura num usuário diferente: ids novos, FKs remapeadas, auto-referência (2ª passada) e JSON de focus_task_ids", async () => {
    const { agent: source, userId: ownerA } = await createAuthenticatedAgent();
    const { agent: target, userId: ownerB } = await createAuthenticatedAgent();
    const sourceIds = await seedSourceData(ownerA);

    const exportRes = await source.get("/api/export/me");
    expect(exportRes.status).toBe(200);

    const restoreRes = await target.post("/api/import/restore").send({ data: exportRes.body.data });
    expect(restoreRes.status).toBe(200);
    const summary = restoreRes.body as { restored: Record<string, number>; skipped: Record<string, number> };

    // Cada tabela semeada restaurou exatamente a quantidade esperada.
    expect(summary.restored).toMatchObject({
      goals: 2, habits: 2, habit_entries: 1, projects: 2, task_statuses: 1, tasks: 2, subtasks: 1,
      tags: 1, task_tags: 1, task_dependencies: 1, health_entries: 1, water_entries: 1, workouts: 1,
      workout_sets: 1, books: 1, book_notes: 1, reading_sessions: 1, educations: 1, courses: 1,
      subjects: 1, academic_projects: 1, academic_deadlines: 1, study_sessions: 1, semester_checklist: 1,
      journals: 1, journal_entries: 1, journal_entry_journals: 1, journal_entry_links: 1,
    });

    const db = getDb();
    const one = async <T>(sql: string, args: unknown[] = []): Promise<T> => {
      const r = await db.execute({ sql, args: args as (string | number | null)[] });
      return r.rows[0] as unknown as T;
    };

    // Tudo pertence a B agora — nunca ao dono original do arquivo.
    const goal1New = await one<{ id: string; owner_id: string; parent_goal_id: string | null }>(
      "SELECT id, owner_id, parent_goal_id FROM goals WHERE owner_id = ? AND title = 'Meta raiz'", [ownerB]
    );
    const goal2New = await one<{ owner_id: string; parent_goal_id: string | null }>(
      "SELECT owner_id, parent_goal_id FROM goals WHERE owner_id = ? AND title = 'Sub-meta'", [ownerB]
    );
    expect(goal2New.owner_id).toBe(ownerB);
    // Auto-referência resolvida na 2ª passada: aponta pro NOVO id da meta raiz, nunca pro antigo.
    expect(goal2New.parent_goal_id).toBe(goal1New.id);

    const habit1New = await one<{ id: string }>("SELECT id FROM habits WHERE owner_id = ? AND name = 'Ler'", [ownerB]);
    const habit2New = await one<{ after_habit_id: string | null }>("SELECT after_habit_id FROM habits WHERE owner_id = ? AND name = 'Meditar'", [ownerB]);
    expect(habit2New.after_habit_id).toBe(habit1New.id);

    const project1New = await one<{ id: string; goal_id: string | null }>("SELECT id, goal_id FROM projects WHERE owner_id = ? AND name = 'Projeto raiz'", [ownerB]);
    const project2New = await one<{ parent_id: string | null }>("SELECT parent_id FROM projects WHERE owner_id = ? AND name = 'Sub-projeto'", [ownerB]);
    expect(project1New.goal_id).toBe(goal1New.id);
    expect(project2New.parent_id).toBe(project1New.id);

    const task1New = await one<{ id: string; project_id: string | null; goal_id: string | null; habit_id: string | null }>(
      "SELECT id, project_id, goal_id, habit_id FROM tasks WHERE owner_id = ? AND title = 'Tarefa principal'", [ownerB]
    );
    const task2New = await one<{ id: string; parent_task_id: string | null }>(
      "SELECT id, parent_task_id FROM tasks WHERE owner_id = ? AND title LIKE 'Subtarefa de verdade%'", [ownerB]
    );
    expect(task1New.project_id).toBe(project1New.id);
    expect(task1New.goal_id).toBe(goal1New.id);
    expect(task1New.habit_id).toBe(habit1New.id);
    expect(task2New.parent_task_id).toBe(task1New.id);

    const subtaskNew = await one<{ task_id: string }>("SELECT task_id FROM subtasks WHERE owner_id = ?", [ownerB]);
    expect(subtaskNew.task_id).toBe(task1New.id);

    const taskTagNew = await one<{ task_id: string; tag_id: string }>("SELECT task_id, tag_id FROM task_tags WHERE task_id = ?", [task1New.id]);
    expect(taskTagNew).toBeTruthy();

    const depNew = await one<{ task_id: string; depends_on_id: string }>("SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id = ?", [task2New.id]);
    expect(depNew.depends_on_id).toBe(task1New.id);

    const academicProjectNew = await one<{ project_id: string | null; education_id: string | null }>(
      "SELECT project_id, education_id FROM academic_projects WHERE owner_id = ?", [ownerB]
    );
    expect(academicProjectNew.project_id).toBe(project1New.id);

    const journalEntryNew = await one<{ focus_task_ids: string }>("SELECT focus_task_ids FROM journal_entries WHERE owner_id = ?", [ownerB]);
    const remappedFocusIds = JSON.parse(journalEntryNew.focus_task_ids) as string[];
    // Remapeia os 2 ids válidos e descarta silenciosamente o id inexistente do arquivo original.
    expect(remappedFocusIds.sort()).toEqual([task1New.id, task2New.id].sort());

    const linkNew = await one<{ target_id: string }>("SELECT target_id FROM journal_entry_links WHERE owner_id = ?", [ownerB]);
    expect(linkNew.target_id).toBe(project1New.id);

    // Dado original de A continua intacto e com o dono de sempre — a restauração em B nunca deve tocar os dados de A.
    const originalGoal = await one<{ owner_id: string }>("SELECT owner_id FROM goals WHERE id = ?", [sourceIds.goal1]);
    expect(originalGoal.owner_id).toBe(ownerA);
    // E o id original nunca é reaproveitado — o restaurado em B sempre recebe um id novo.
    expect(goal1New.id).not.toBe(sourceIds.goal1);
  });

  it("tabelas fora do escopo V1 no arquivo são ignoradas sem erro", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const res = await agent.post("/api/import/restore").send({
      data: {
        tasks: [],
        contracts: [{ id: "c1", owner_id: "outro-dono", title: "Fora de escopo" }],
        guild_shares: [{ id: "g1", owner_id: "outro-dono" }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.restored).toEqual({});
    void userId;
  });

  it("linha filha órfã (FK obrigatória sem pai no arquivo) é descartada, não derruba a restauração", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const summary = await restoreBackup(db, userId, {
      // Nenhum "tasks" no payload — subtasks.task_id é obrigatório, então a linha deve ser pulada.
      subtasks: [{ id: "s1", task_id: "tarefa-que-nao-veio", owner_id: "outro-dono", title: "Órfã", done: 0 }],
    });
    expect(summary.restored.subtasks).toBeUndefined();
    expect(summary.skipped.subtasks).toBe(1);
  });

  it("rodar a restauração duas vezes na mesma conta não duplica (UNIQUE) e não quebra", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({ sql: "INSERT INTO tags (id, owner_id, name) VALUES (?, ?, 'foco')", args: [nanoid(), userId] });
    const exportRes = await agent.get("/api/export/me");
    const first = await agent.post("/api/import/restore").send({ data: exportRes.body.data });
    expect(first.status).toBe(200);
    // Repetir com o MESMO arquivo: o nome da tag já existe pra este owner (UNIQUE owner_id+name) → ignorado, sem erro.
    const second = await agent.post("/api/import/restore").send({ data: exportRes.body.data });
    expect(second.status).toBe(200);
    expect(second.body.skipped.tags).toBeGreaterThanOrEqual(1);

    const countRes = await db.execute({ sql: "SELECT COUNT(*) as n FROM tags WHERE owner_id = ? AND name = 'foco'", args: [userId] });
    expect(Number((countRes.rows[0] as { n: number }).n)).toBe(1);
  });

  it("exige autenticação e rejeita payload malformado", async () => {
    const anon = await (await import("supertest")).default((await import("../src/app.js")).app).post("/api/import/restore").send({ data: {} });
    expect(anon.status).toBe(401);

    const { agent } = await createAuthenticatedAgent();
    const bad = await agent.post("/api/import/restore").send({ nope: true });
    expect(bad.status).toBe(400);
  });
});
