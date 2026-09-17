import { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/**
 * Life Map — mapa visual de como as áreas da vida do usuário se
 * conectam. Tudo aqui é derivado de relações REAIS já existentes no
 * banco (chaves estrangeiras) ou de correspondência de texto entre
 * campos que o próprio usuário preenche (ex.: `goals.category` e
 * `habits.category` iguais). Nunca inventamos uma conexão que não
 * exista nos dados — quando não há como ligar duas entidades com
 * segurança (ex.: livros e formações não têm nenhum campo em comum),
 * simplesmente não desenhamos essa aresta.
 */

export type LifeMapAreaId =
  | "metas"
  | "projetos"
  | "habitos"
  | "educacao"
  | "leitura"
  | "saude";

export interface LifeMapNode {
  id: string;
  kind: "center" | "area" | "goal" | "project" | "habit" | "education" | "academic_project" | "book" | "health";
  area: LifeMapAreaId | null;
  label: string;
  sublabel: string | null;
  progressPct: number | null;
  lastActivityAt: string | null;
  linkedCount: number;
  openPath: string | null;
}

export interface LifeMapEdge {
  from: string;
  to: string;
  kind: "goal_project" | "goal_habit" | "project_task" | "academic_education" | "academic_project" | "habit_health";
}

export interface LifeMapOrphans {
  tasksWithoutProject: number;
  goalsWithoutHabit: number;
  projectsWithoutDeadline: number;
  habitsUnlinked: number;
}

export interface LifeMapSuggestion {
  text: string;
}

export interface LifeMapSummary {
  areasCount: number;
  areasActiveCount: number;
  goalsConnectedCount: number;
  orphanItemsCount: number;
  structuralScorePct: number;
}

export interface LifeMapData {
  summary: LifeMapSummary;
  nodes: LifeMapNode[];
  edges: LifeMapEdge[];
  orphans: LifeMapOrphans;
  suggestions: LifeMapSuggestion[];
}

// Palavras-chave usadas só para decidir se um hábito "conversa" com a
// área de Saúde no mapa (aresta tracejada cruzando áreas) — não move
// o hábito de área, ele continua pertencendo a "Hábitos".
const HEALTH_KEYWORDS = ["saúde", "saude", "água", "agua", "sono", "exercíc", "exercic", "corrida", "treino", "bem-estar", "bem estar"];

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function isHealthRelated(category: string | null | undefined): boolean {
  const c = normalize(category);
  if (!c) return false;
  return HEALTH_KEYWORDS.some((kw) => c.includes(kw));
}

interface Row {
  [key: string]: unknown;
}

export async function getLifeMap(ownerId: string): Promise<LifeMapData> {
  const db: Db = getDb();

  const [goalsRes, projectsRes, tasksRes, habitsRes, educationsRes, academicProjectsRes, booksRes, waterRes, sleepRes, workoutsRes] =
    await Promise.all([
      db.execute({
        sql: "SELECT id, title, category, status, current_value, target_value, kind, updated_at FROM goals WHERE owner_id = ?",
        args: [ownerId],
      }),
      db.execute({
        sql: `SELECT id, name, kind, archived_at, updated_at,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id) AS task_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id AND t.status = 'Concluído') AS done_count
              FROM projects WHERE owner_id = ?`,
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, project_id, goal_id, title, status, due_date, completed_at FROM tasks WHERE owner_id = ?",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, name, category, icon, archived_at FROM habits WHERE owner_id = ?",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, course_name, kind, progress_pct FROM educations WHERE owner_id = ?",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, title, kind, project_id, education_id, progress_pct FROM academic_projects WHERE owner_id = ?",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, title, status, updated_at FROM books WHERE owner_id = ? AND status != 'Abandonado'",
        args: [ownerId],
      }),
      db.execute({ sql: "SELECT COUNT(*) AS n, MAX(recorded_at) AS last FROM water_entries WHERE owner_id = ?", args: [ownerId] }),
      db.execute({ sql: "SELECT COUNT(*) AS n, MAX(went_to_bed_at) AS last FROM sleep_entries WHERE owner_id = ?", args: [ownerId] }),
      db.execute({ sql: "SELECT COUNT(*) AS n, MAX(performed_at) AS last FROM workouts WHERE owner_id = ?", args: [ownerId] }),
    ]);

  const goals = goalsRes.rows as unknown as Row[];
  const projects = projectsRes.rows as unknown as Row[];
  const tasks = tasksRes.rows as unknown as Row[];
  const habits = habitsRes.rows as unknown as Row[];
  const educations = educationsRes.rows as unknown as Row[];
  const academicProjects = academicProjectsRes.rows as unknown as Row[];
  const books = booksRes.rows as unknown as Row[];

  const activeHabits = habits.filter((h) => !h.archived_at);
  const activeProjects = projects.filter((p) => !p.archived_at);

  // ---- Nós -----------------------------------------------------------
  const nodes: LifeMapNode[] = [
    { id: "voce", kind: "center", area: null, label: "Você", sublabel: null, progressPct: null, lastActivityAt: null, linkedCount: 0, openPath: null },
  ];

  const AREA_META: Record<LifeMapAreaId, { label: string }> = {
    metas: { label: "Metas" },
    projetos: { label: "Projetos" },
    habitos: { label: "Hábitos" },
    educacao: { label: "Educação" },
    leitura: { label: "Leitura" },
    saude: { label: "Saúde e bem-estar" },
  };

  // Contagem de itens ativos por área — usada tanto pros nós de área
  // (mostrar "N itens") quanto para o cálculo de força estrutural.
  const activeCountByArea: Record<LifeMapAreaId, number> = {
    metas: goals.filter((g) => g.status === "active").length,
    projetos: activeProjects.length,
    habitos: activeHabits.length,
    educacao: educations.length + academicProjects.length,
    leitura: books.filter((b) => b.status === "Lendo" || b.status === "Quero Ler").length,
    saude: Number(waterRes.rows[0]?.n ?? 0) + Number(sleepRes.rows[0]?.n ?? 0) + Number(workoutsRes.rows[0]?.n ?? 0) > 0 ? 1 : 0,
  };

  for (const areaId of Object.keys(AREA_META) as LifeMapAreaId[]) {
    nodes.push({
      id: `area:${areaId}`,
      kind: "area",
      area: areaId,
      label: AREA_META[areaId].label,
      sublabel: `${activeCountByArea[areaId]} ${activeCountByArea[areaId] === 1 ? "item ativo" : "itens ativos"}`,
      progressPct: null,
      lastActivityAt: null,
      linkedCount: 0,
      openPath: null,
    });
  }

  // Cap de nós de segunda camada por área — mantém o mapa legível
  // (o total real continua nos cards de estatística, mesmo quando
  // nem todo item aparece desenhado no grafo).
  const CAP = 6;

  const goalNodeId = (id: string) => `goal:${id}`;
  const projectNodeId = (id: string) => `project:${id}`;
  const taskLinkedCount = (kind: "project_id" | "goal_id", id: string) => tasks.filter((t) => t[kind] === id).length;

  for (const g of goals.filter((g) => g.status === "active").slice(0, CAP)) {
    nodes.push({
      id: goalNodeId(String(g.id)),
      kind: "goal",
      area: "metas",
      label: String(g.title),
      sublabel: g.category ? String(g.category) : null,
      progressPct:
        g.target_value && Number(g.target_value) > 0 ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100)) : null,
      lastActivityAt: g.updated_at ? String(g.updated_at) : null,
      linkedCount: taskLinkedCount("goal_id", String(g.id)),
      openPath: "/metas",
    });
  }

  for (const p of activeProjects.slice(0, CAP)) {
    nodes.push({
      id: projectNodeId(String(p.id)),
      kind: "project",
      area: "projetos",
      label: String(p.name),
      sublabel: `${p.done_count ?? 0}/${p.task_count ?? 0} tarefas`,
      progressPct: p.task_count ? Math.round((Number(p.done_count) / Number(p.task_count)) * 100) : null,
      lastActivityAt: p.updated_at ? String(p.updated_at) : null,
      linkedCount: Number(p.task_count ?? 0),
      openPath: "/projetos",
    });
  }

  const habitNodeId = (id: string) => `habit:${id}`;
  for (const h of activeHabits.slice(0, CAP)) {
    nodes.push({
      id: habitNodeId(String(h.id)),
      kind: "habit",
      area: "habitos",
      label: String(h.name),
      sublabel: h.category ? String(h.category) : null,
      progressPct: null,
      lastActivityAt: null,
      linkedCount: 0,
      openPath: "/habitos",
    });
  }

  const educationNodeId = (id: string) => `education:${id}`;
  for (const e of educations.slice(0, CAP)) {
    nodes.push({
      id: educationNodeId(String(e.id)),
      kind: "education",
      area: "educacao",
      label: String(e.course_name),
      sublabel: String(e.kind),
      progressPct: e.progress_pct != null ? Number(e.progress_pct) : null,
      lastActivityAt: null,
      linkedCount: academicProjects.filter((ap) => ap.education_id === e.id).length,
      openPath: `/educacao/${e.id}`,
    });
  }

  const academicNodeId = (id: string) => `academic:${id}`;
  for (const ap of academicProjects.slice(0, CAP)) {
    nodes.push({
      id: academicNodeId(String(ap.id)),
      kind: "academic_project",
      area: "educacao",
      label: String(ap.title),
      sublabel: String(ap.kind),
      progressPct: ap.progress_pct != null ? Number(ap.progress_pct) : null,
      lastActivityAt: null,
      linkedCount: ap.project_id ? 1 : 0,
      openPath: ap.education_id ? `/educacao/${ap.education_id}` : "/educacao",
    });
  }

  const bookNodeId = (id: string) => `book:${id}`;
  for (const b of books.filter((b) => b.status === "Lendo").slice(0, CAP)) {
    nodes.push({
      id: bookNodeId(String(b.id)),
      kind: "book",
      area: "leitura",
      label: String(b.title),
      sublabel: String(b.status),
      progressPct: null,
      lastActivityAt: b.updated_at ? String(b.updated_at) : null,
      linkedCount: 0,
      openPath: `/biblioteca/${b.id}`,
    });
  }

  // "Saúde e bem-estar" não tem uma tabela única de "itens" (água,
  // sono e treino são séries de registros, não entidades cadastráveis
  // como uma meta ou um livro) — por isso viram sub-nós de RESUMO,
  // com contagem real dos últimos registros, nunca um valor inventado.
  nodes.push(
    {
      id: "health:water",
      kind: "health",
      area: "saude",
      label: "Hidratação",
      sublabel: `${waterRes.rows[0]?.n ?? 0} registros`,
      progressPct: null,
      lastActivityAt: waterRes.rows[0]?.last ? String(waterRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    },
    {
      id: "health:sleep",
      kind: "health",
      area: "saude",
      label: "Sono",
      sublabel: `${sleepRes.rows[0]?.n ?? 0} registros`,
      progressPct: null,
      lastActivityAt: sleepRes.rows[0]?.last ? String(sleepRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    },
    {
      id: "health:workout",
      kind: "health",
      area: "saude",
      label: "Exercícios",
      sublabel: `${workoutsRes.rows[0]?.n ?? 0} registros`,
      progressPct: null,
      lastActivityAt: workoutsRes.rows[0]?.last ? String(workoutsRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    }
  );

  // ---- Arestas (só relações reais) ------------------------------------
  const edges: LifeMapEdge[] = [];

  // Meta ↔ Projeto: via tarefas que têm goal_id E project_id ao mesmo tempo.
  const goalProjectPairs = new Set<string>();
  for (const t of tasks) {
    if (t.goal_id && t.project_id) {
      const gId = goalNodeId(String(t.goal_id));
      const pId = projectNodeId(String(t.project_id));
      if (nodes.some((n) => n.id === gId) && nodes.some((n) => n.id === pId)) {
        const key = `${gId}|${pId}`;
        if (!goalProjectPairs.has(key)) {
          goalProjectPairs.add(key);
          edges.push({ from: gId, to: pId, kind: "goal_project" });
        }
      }
    }
  }

  // Meta ↔ Hábito: mesma categoria (texto que o usuário já preenche nos dois).
  for (const g of goals) {
    const gId = goalNodeId(String(g.id));
    if (!nodes.some((n) => n.id === gId) || !g.category) continue;
    for (const h of activeHabits) {
      const hId = habitNodeId(String(h.id));
      if (!nodes.some((n) => n.id === hId)) continue;
      if (h.category && normalize(String(h.category)) === normalize(String(g.category))) {
        edges.push({ from: gId, to: hId, kind: "goal_habit" });
      }
    }
  }

  // Projeto acadêmico ↔ Formação / Projeto (chaves estrangeiras reais).
  for (const ap of academicProjects) {
    const apId = academicNodeId(String(ap.id));
    if (!nodes.some((n) => n.id === apId)) continue;
    if (ap.education_id) {
      const eId = educationNodeId(String(ap.education_id));
      if (nodes.some((n) => n.id === eId)) edges.push({ from: eId, to: apId, kind: "academic_education" });
    }
    if (ap.project_id) {
      const pId = projectNodeId(String(ap.project_id));
      if (nodes.some((n) => n.id === pId)) edges.push({ from: apId, to: pId, kind: "academic_project" });
    }
  }

  // Hábito ↔ Saúde: categoria com palavra-chave de saúde (aresta
  // cruzando áreas, tracejada na UI — o hábito continua em "Hábitos").
  for (const h of activeHabits) {
    const hId = habitNodeId(String(h.id));
    if (!nodes.some((n) => n.id === hId)) continue;
    if (isHealthRelated(h.category as string | null)) {
      edges.push({ from: hId, to: "area:saude", kind: "habit_health" });
    }
  }

  // ---- Órfãos (contagens reais) ---------------------------------------
  const tasksWithoutProject = tasks.filter((t) => !t.project_id).length;

  const goalCategoriesWithHabit = new Set(
    activeHabits.filter((h) => h.category).map((h) => normalize(String(h.category)))
  );
  const goalsWithoutHabit = goals.filter((g) => g.status === "active" && (!g.category || !goalCategoriesWithHabit.has(normalize(String(g.category))))).length;

  const projectsWithoutDeadline = activeProjects.filter((p) => {
    const projectTasks = tasks.filter((t) => t.project_id === p.id);
    return projectTasks.length === 0 || projectTasks.every((t) => !t.due_date);
  }).length;

  const goalCategoriesSet = new Set(goals.filter((g) => g.category).map((g) => normalize(String(g.category))));
  const habitsUnlinked = activeHabits.filter((h) => !h.category || !goalCategoriesSet.has(normalize(String(h.category)))).length;

  const orphans: LifeMapOrphans = {
    tasksWithoutProject,
    goalsWithoutHabit,
    projectsWithoutDeadline,
    habitsUnlinked,
  };

  // ---- Sugestões (regras simples sobre os órfãos, sempre com dado real) --
  const suggestions: LifeMapSuggestion[] = [];
  const unlinkedHabit = activeHabits.find((h) => !h.category || !goalCategoriesSet.has(normalize(String(h.category))));
  const goalNeedingHabit = goals.find((g) => g.status === "active" && (!g.category || !goalCategoriesWithHabit.has(normalize(String(g.category)))));
  if (unlinkedHabit && goalNeedingHabit) {
    suggestions.push({
      text: `Vincule o hábito "${unlinkedHabit.name}" à meta "${goalNeedingHabit.title}" usando a mesma categoria.`,
    });
  }
  const projectNeedingDeadline = activeProjects.find((p) => {
    const projectTasks = tasks.filter((t) => t.project_id === p.id);
    return projectTasks.length > 0 && projectTasks.every((t) => !t.due_date);
  });
  if (projectNeedingDeadline) {
    suggestions.push({ text: `Defina um prazo para as tarefas do projeto "${projectNeedingDeadline.name}".` });
  }
  const looseTask = tasks.find((t) => !t.project_id && !t.goal_id);
  if (looseTask) {
    suggestions.push({ text: `A tarefa "${looseTask.title}" não está vinculada a nenhum projeto ou meta — considere organizá-la.` });
  }

  // ---- Resumo / força estrutural ---------------------------------------
  const activeGoals = goals.filter((g) => g.status === "active");
  const pctGoalsWithTask = activeGoals.length > 0 ? activeGoals.filter((g) => tasks.some((t) => t.goal_id === g.id)).length / activeGoals.length : 1;
  const pctProjectsWithTask = activeProjects.length > 0 ? activeProjects.filter((p) => tasks.some((t) => t.project_id === p.id)).length / activeProjects.length : 1;
  const pctGoalsWithHabit = activeGoals.length > 0 ? (activeGoals.length - orphans.goalsWithoutHabit) / activeGoals.length : 1;
  const pctTasksLinked = tasks.length > 0 ? tasks.filter((t) => t.project_id || t.goal_id).length / tasks.length : 1;
  const areaIds = Object.keys(AREA_META) as LifeMapAreaId[];
  const pctAreasActive = areaIds.filter((a) => activeCountByArea[a] > 0).length / areaIds.length;

  const structuralScorePct = Math.round(
    ((pctGoalsWithTask + pctProjectsWithTask + pctGoalsWithHabit + pctTasksLinked + pctAreasActive) / 5) * 100
  );

  const summary: LifeMapSummary = {
    areasCount: areaIds.length,
    areasActiveCount: areaIds.filter((a) => activeCountByArea[a] > 0).length,
    goalsConnectedCount: goalProjectPairs.size + edges.filter((e) => e.kind === "goal_habit").length,
    orphanItemsCount: orphans.tasksWithoutProject + orphans.goalsWithoutHabit + orphans.projectsWithoutDeadline + orphans.habitsUnlinked,
    structuralScorePct,
  };

  return { summary, nodes, edges, orphans, suggestions };
}
