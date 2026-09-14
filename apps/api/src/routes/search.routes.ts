import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

/**
 * Busca global textual (SQL LIKE) do LifeOS.
 *
 * Antes disso, o campo "Buscar algo no LifeOS..." no topo do app era
 * só um <input> decorativo, sem nenhuma lógica por trás — este
 * endpoint resolve isso com busca textual simples por enquanto (item
 * 1 da lista de prioridades de docs/inteligencia-lifeos.md). Uma
 * segunda camada de busca semântica (embeddings + vetor nativo do
 * Turso/libSQL) pode ser adicionada depois sem quebrar este contrato:
 * o formato de retorno (id/type/title/subtitle/link) já é o mesmo que
 * a busca semântica usaria.
 */
type SearchResult = {
  id: string;
  type: "task" | "goal" | "habit" | "book" | "academic_project" | "project";
  title: string;
  subtitle: string | null;
  link: string;
};

/** GET /api/search?q=termo — busca por título/nome em tarefas, metas, hábitos, livros, projetos e itens acadêmicos do usuário. */
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    return res.json({ results: [] });
  }

  const db = getDb();
  const ownerId = req.user!.id;
  const like = `%${q}%`;
  const limitEach = 6;

  const [tasks, goals, habits, books, academicProjects, projects] = await Promise.all([
    db.execute({
      sql: `SELECT id, title, status FROM tasks WHERE owner_id = ? AND title LIKE ? ORDER BY updated_at DESC LIMIT ?`,
      args: [ownerId, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, title, status FROM goals WHERE owner_id = ? AND title LIKE ? ORDER BY updated_at DESC LIMIT ?`,
      args: [ownerId, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, name FROM habits WHERE owner_id = ? AND name LIKE ? AND archived_at IS NULL LIMIT ?`,
      args: [ownerId, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, title, author, status FROM books WHERE owner_id = ? AND (title LIKE ? OR author LIKE ?) LIMIT ?`,
      args: [ownerId, like, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, title, progress_pct FROM academic_projects WHERE owner_id = ? AND title LIKE ? LIMIT ?`,
      args: [ownerId, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, name, kind FROM projects WHERE owner_id = ? AND name LIKE ? AND archived_at IS NULL LIMIT ?`,
      args: [ownerId, like, limitEach],
    }),
  ]);

  const results: SearchResult[] = [
    ...tasks.rows.map((r) => ({
      id: String(r.id),
      type: "task" as const,
      title: String(r.title),
      subtitle: r.status ? `Tarefa · ${r.status}` : "Tarefa",
      link: "/tarefas",
    })),
    ...goals.rows.map((r) => ({
      id: String(r.id),
      type: "goal" as const,
      title: String(r.title),
      subtitle: r.status ? `Meta · ${r.status}` : "Meta",
      link: "/metas",
    })),
    ...habits.rows.map((r) => ({
      id: String(r.id),
      type: "habit" as const,
      title: String(r.name),
      subtitle: "Hábito",
      link: "/habitos",
    })),
    ...books.rows.map((r) => ({
      id: String(r.id),
      type: "book" as const,
      title: String(r.title),
      subtitle: r.author ? `Livro · ${r.author}` : "Livro",
      link: `/biblioteca/${r.id}`,
    })),
    ...academicProjects.rows.map((r) => ({
      id: String(r.id),
      type: "academic_project" as const,
      title: String(r.title),
      subtitle: `Educação · ${r.progress_pct ?? 0}% concluído`,
      link: "/educacao",
    })),
    ...projects.rows.map((r) => ({
      id: String(r.id),
      type: "project" as const,
      title: String(r.name),
      subtitle: "Projeto",
      link: "/projetos",
    })),
  ];

  res.json({ results });
});
