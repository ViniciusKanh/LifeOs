import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

/**
 * Life Map — mapa visual de como as áreas da vida do usuário se
 * conectam. Tudo aqui é derivado de relações REAIS já existentes no
 * banco (chaves estrangeiras), de correspondência de texto entre
 * campos que o próprio usuário preenche (ex.: `goals.category` e
 * `habits.category` iguais) ou de vínculos manuais que o próprio
 * usuário criou explicitamente pelo Life Map (`life_map_links`).
 * Nunca inventamos uma conexão que não exista nos dados — quando não
 * há como ligar duas entidades com segurança, simplesmente não
 * desenhamos essa aresta.
 */

export type LifeMapAreaId =
  | "metas"
  | "projetos"
  | "habitos"
  | "educacao"
  | "leitura"
  | "saude"
  | "profissional";

export type LifeMapNodeKind =
  | "center"
  | "area"
  | "goal"
  | "project"
  | "habit"
  | "education"
  | "academic_project"
  | "book"
  | "health";

/** Tipos de entidade que podem ser origem/destino de um vínculo manual. */
export const LINKABLE_TYPES = ["goal", "project", "habit", "education", "academic_project", "book"] as const;
export type LinkableType = (typeof LINKABLE_TYPES)[number];

export const RELATIONSHIP_TYPES = ["supports", "belongs_to", "related_to", "contributes_to"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface LifeMapNode {
  id: string;
  kind: LifeMapNodeKind;
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
  kind: "hub" | "goal_project" | "goal_habit" | "project_task" | "academic_education" | "academic_project" | "habit_health" | "manual";
  linkId?: string;
  relationshipType?: RelationshipType;
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

export interface LifeMapDistributionItem {
  area: LifeMapAreaId;
  label: string;
  count: number;
  pct: number;
}

export interface LifeMapData {
  summary: LifeMapSummary;
  nodes: LifeMapNode[];
  edges: LifeMapEdge[];
  orphans: LifeMapOrphans;
  suggestions: LifeMapSuggestion[];
  distribution: LifeMapDistributionItem[];
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

// Tabela (e coluna de dono) por tipo de entidade vinculável — usada
// tanto para validar ownership ao criar um vínculo manual quanto para
// checar se os dois lados de um vínculo salvo ainda existem.
const LINKABLE_TABLE: Record<LinkableType, { table: string; ownerColumn: string }> = {
  goal: { table: "goals", ownerColumn: "owner_id" },
  project: { table: "projects", ownerColumn: "owner_id" },
  habit: { table: "habits", ownerColumn: "owner_id" },
  education: { table: "educations", ownerColumn: "owner_id" },
  academic_project: { table: "academic_projects", ownerColumn: "owner_id" },
  book: { table: "books", ownerColumn: "owner_id" },
};

function nodeIdFor(type: LinkableType, id: string): string {
  return `${type}:${id}`;
}

export async function getLifeMap(ownerId: string): Promise<LifeMapData> {
  const db: Db = getDb();

  const [
    goalsRes,
    projectsRes,
    tasksRes,
    habitsRes,
    educationsRes,
    academicProjectsRes,
    booksRes,
    waterRes,
    sleepRes,
    workoutsRes,
    workNotesRes,
    manualLinksRes,
  ] = await Promise.all([
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
    db.execute({ sql: "SELECT COUNT(*) AS n, MAX(occurred_at) AS last FROM work_notes WHERE owner_id = ?", args: [ownerId] }),
    db.execute({
      sql: "SELECT id, source_type, source_id, target_type, target_id, relationship_type FROM life_map_links WHERE user_id = ?",
      args: [ownerId],
    }),
  ]);

  const goals = goalsRes.rows as unknown as Row[];
  const projects = projectsRes.rows as unknown as Row[];
  const tasks = tasksRes.rows as unknown as Row[];
  const habits = habitsRes.rows as unknown as Row[];
  const educations = educationsRes.rows as unknown as Row[];
  const academicProjects = academicProjectsRes.rows as unknown as Row[];
  const books = booksRes.rows as unknown as Row[];
  const manualLinks = manualLinksRes.rows as unknown as Row[];

  const activeHabits = habits.filter((h) => !h.archived_at);
  const activeProjects = projects.filter((p) => !p.archived_at);
  const professionalProjects = activeProjects.filter((p) => p.kind === "professional");
  const personalProjects = activeProjects.filter((p) => p.kind !== "professional");
  const careerGoals = goals.filter((g) => g.status === "active" && normalize(String(g.category)) === "carreira");

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
    profissional: { label: "Profissional" },
  };

  const workNotesCount = Number(workNotesRes.rows[0]?.n ?? 0);

  // Contagem de itens ativos por área — usada tanto pros nós de área
  // (mostrar "N itens") quanto para o cálculo de força estrutural e
  // para a distribuição por área.
  const activeCountByArea: Record<LifeMapAreaId, number> = {
    metas: goals.filter((g) => g.status === "active" && normalize(String(g.category)) !== "carreira").length,
    projetos: personalProjects.length,
    habitos: activeHabits.length,
    educacao: educations.length + academicProjects.length,
    leitura: books.filter((b) => b.status === "Lendo" || b.status === "Quero Ler").length,
    saude: Number(waterRes.rows[0]?.n ?? 0) + Number(sleepRes.rows[0]?.n ?? 0) + Number(workoutsRes.rows[0]?.n ?? 0) > 0 ? 1 : 0,
    profissional: professionalProjects.length + careerGoals.length + (workNotesCount > 0 ? 1 : 0),
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

  for (const g of goals.filter((g) => g.status === "active" && normalize(String(g.category)) !== "carreira").slice(0, CAP)) {
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

  // Metas de carreira entram como itens da área Profissional (mesma
  // tabela `goals`, só reclassificadas visualmente pela categoria que
  // o próprio usuário já escolhe em Metas).
  for (const g of careerGoals.slice(0, CAP)) {
    nodes.push({
      id: goalNodeId(String(g.id)),
      kind: "goal",
      area: "profissional",
      label: String(g.title),
      sublabel: g.category ? String(g.category) : null,
      progressPct:
        g.target_value && Number(g.target_value) > 0 ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100)) : null,
      lastActivityAt: g.updated_at ? String(g.updated_at) : null,
      linkedCount: taskLinkedCount("goal_id", String(g.id)),
      openPath: "/metas",
    });
  }

  for (const p of personalProjects.slice(0, CAP)) {
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

  // Projetos de kind='professional' (ex.: o próprio LifeOS) entram na
  // área Profissional em vez de Projetos — é a mesma distinção que a
  // rota /tasks/professional já usa.
  for (const p of professionalProjects.slice(0, CAP)) {
    nodes.push({
      id: projectNodeId(String(p.id)),
      kind: "project",
      area: "profissional",
      label: String(p.name),
      sublabel: `${p.done_count ?? 0}/${p.task_count ?? 0} tarefas`,
      progressPct: p.task_count ? Math.round((Number(p.done_count) / Number(p.task_count)) * 100) : null,
      lastActivityAt: p.updated_at ? String(p.updated_at) : null,
      linkedCount: Number(p.task_count ?? 0),
      openPath: "/projetos",
    });
  }

  if (workNotesCount > 0) {
    nodes.push({
      id: "professional:work-notes",
      kind: "health",
      area: "profissional",
      label: "Anotações de trabalho",
      sublabel: `${workNotesCount} ${workNotesCount === 1 ? "registro" : "registros"}`,
      progressPct: null,
      lastActivityAt: workNotesRes.rows[0]?.last ? String(workNotesRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/profissional",
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
  // Sub-nós de resumo de Saúde só aparecem quando existe pelo menos um
  // registro real — evita nó "fantasma" (0 registros) boiando sem
  // nenhuma conexão real no mapa, que é exatamente o tipo de item
  // "desconexo" que o mapa deve evitar.
  const waterCount = Number(waterRes.rows[0]?.n ?? 0);
  const sleepCount = Number(sleepRes.rows[0]?.n ?? 0);
  const workoutCount = Number(workoutsRes.rows[0]?.n ?? 0);
  if (waterCount > 0) {
    nodes.push({
      id: "health:water",
      kind: "health",
      area: "saude",
      label: "Hidratação",
      sublabel: `${waterCount} registros`,
      progressPct: null,
      lastActivityAt: waterRes.rows[0]?.last ? String(waterRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    });
  }
  if (sleepCount > 0) {
    nodes.push({
      id: "health:sleep",
      kind: "health",
      area: "saude",
      label: "Sono",
      sublabel: `${sleepCount} registros`,
      progressPct: null,
      lastActivityAt: sleepRes.rows[0]?.last ? String(sleepRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    });
  }
  if (workoutCount > 0) {
    nodes.push({
      id: "health:workout",
      kind: "health",
      area: "saude",
      label: "Exercícios",
      sublabel: `${workoutCount} registros`,
      progressPct: null,
      lastActivityAt: workoutsRes.rows[0]?.last ? String(workoutsRes.rows[0].last) : null,
      linkedCount: 0,
      openPath: "/saude",
    });
  }

  // ---- Arestas (só relações reais) ------------------------------------
  const edges: LifeMapEdge[] = [];

  // Espinha estrutural do mapa: Você → área (quando a área tem algum
  // item desenhado) e área → cada item dela. Sem essas arestas o mapa
  // ficava com nós boiando sem nenhuma linha visível, mesmo pertencendo
  // claramente a uma área — esse era o principal motivo do mapa parecer
  // "desconexo". É pura estrutura, não uma relação inventada: todo item
  // já pertence a uma área por definição (campo `area` do próprio nó).
  const areasWithChildren = new Set(
    nodes.filter((n) => n.kind !== "center" && n.kind !== "area" && n.area).map((n) => n.area as LifeMapAreaId)
  );
  for (const areaId of areasWithChildren) {
    edges.push({ from: "voce", to: `area:${areaId}`, kind: "hub" });
  }
  for (const n of nodes) {
    if (n.kind !== "center" && n.kind !== "area" && n.area) {
      edges.push({ from: `area:${n.area}`, to: n.id, kind: "hub" });
    }
  }

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

  // Vínculos manuais criados pelo usuário no próprio Life Map — só
  // viram aresta quando os dois lados existem como nó no mapa atual
  // (evita apontar pra um item fora do CAP ou já excluído).
  for (const link of manualLinks) {
    const fromId = `${String(link.source_type)}:${String(link.source_id)}`;
    const toId = `${String(link.target_type)}:${String(link.target_id)}`;
    if (nodes.some((n) => n.id === fromId) && nodes.some((n) => n.id === toId)) {
      edges.push({
        from: fromId,
        to: toId,
        kind: "manual",
        linkId: String(link.id),
        relationshipType: link.relationship_type as RelationshipType,
      });
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
    goalsConnectedCount:
      goalProjectPairs.size + edges.filter((e) => e.kind === "goal_habit" || (e.kind === "manual" && e.from.startsWith("goal:"))).length,
    orphanItemsCount: orphans.tasksWithoutProject + orphans.goalsWithoutHabit + orphans.projectsWithoutDeadline + orphans.habitsUnlinked,
    structuralScorePct,
  };

  // ---- Distribuição por área (a partir dos itens ativos reais) ----------
  const totalActiveItems = areaIds.reduce((sum, a) => sum + activeCountByArea[a], 0);
  const distribution: LifeMapDistributionItem[] = areaIds
    .map((area) => ({
      area,
      label: AREA_META[area].label,
      count: activeCountByArea[area],
      pct: totalActiveItems > 0 ? Math.round((activeCountByArea[area] / totalActiveItems) * 100) : 0,
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  return { summary, nodes, edges, orphans, suggestions, distribution };
}

/** Garante que a entidade (tipo + id) pertence ao usuário autenticado antes de criar/ler um vínculo manual. */
async function assertOwnsEntity(db: Db, ownerId: string, type: LinkableType, id: string): Promise<void> {
  const meta = LINKABLE_TABLE[type];
  const result = await db.execute({
    sql: `SELECT id FROM ${meta.table} WHERE id = ? AND ${meta.ownerColumn} = ?`,
    args: [id, ownerId],
  });
  if (result.rows.length === 0) {
    throw new LifeMapError(`Item de origem/destino não encontrado ou não pertence ao usuário.`, 404);
  }
}

export class LifeMapError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface CreateLifeMapLinkInput {
  sourceType: LinkableType;
  sourceId: string;
  targetType: LinkableType;
  targetId: string;
  relationshipType: RelationshipType;
}

/** Cria um vínculo manual entre duas entidades do usuário autenticado, validando ownership dos dois lados. */
export async function createLifeMapLink(ownerId: string, input: CreateLifeMapLinkInput) {
  const db = getDb();

  if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
    throw new LifeMapError("Não é possível conectar um item a ele mesmo.", 400);
  }

  await assertOwnsEntity(db, ownerId, input.sourceType, input.sourceId);
  await assertOwnsEntity(db, ownerId, input.targetType, input.targetId);

  const id = nanoid();
  try {
    await db.execute({
      sql: `INSERT INTO life_map_links (id, user_id, source_type, source_id, target_type, target_id, relationship_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, ownerId, input.sourceType, input.sourceId, input.targetType, input.targetId, input.relationshipType],
    });
  } catch (err) {
    // Índice único: mesmo vínculo já existe.
    throw new LifeMapError("Esse vínculo já existe.", 409);
  }

  return {
    id,
    from: nodeIdFor(input.sourceType, input.sourceId),
    to: nodeIdFor(input.targetType, input.targetId),
    relationshipType: input.relationshipType,
  };
}

/** Remove um vínculo manual — nunca uma relação estrutural (essas não têm linha em life_map_links). */
export async function deleteLifeMapLink(ownerId: string, linkId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM life_map_links WHERE id = ? AND user_id = ?",
    args: [linkId, ownerId],
  });
  return (result.rowsAffected ?? 0) > 0;
}
