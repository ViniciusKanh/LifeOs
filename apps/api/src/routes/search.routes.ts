import { Router } from "express";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getGeminiConfig } from "../services/geminiService.js";
import { rankSemanticCandidates, type SearchEntityType } from "../services/embeddingsService.js";
import { stripHtml } from "../services/journalService.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

/**
 * Busca global do LifeOS: textual (SQL LIKE, sempre disponível) +
 * semântica (embeddings do Gemini + similaridade de cosseno, só
 * quando o Gemini está configurado — ver embeddingsService.ts para o
 * porquê de não usar `vector_distance_cos`/`libsql_vector_idx`
 * nativos aqui). Antes disso, o campo "Buscar algo no LifeOS..." no
 * topo do app era só um <input> decorativo, sem nenhuma lógica por
 * trás.
 *
 * A busca textual sempre roda primeiro e nunca depende do Gemini —
 * se a IA não estiver configurada (ou falhar), o usuário ainda tem
 * uma busca funcional por palavra exata, só sem a camada "por
 * significado".
 */
type SearchResult = {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle: string | null;
  link: string;
  matchType: "text" | "semantic";
};

interface EntityRow {
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
}

function toResult(type: SearchEntityType, row: EntityRow, matchType: "text" | "semantic"): SearchResult {
  return { id: row.id, type, title: row.title, subtitle: row.subtitle, link: row.link, matchType };
}

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

  const [tasks, goals, habits, books, academicProjects, projects, journalEntries, notes, lifeAdmin] = await Promise.all([
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
    // Diário (Fase 6): busca só textual — conteúdo do diário é sensível
    // demais pra mandar pro Gemini gerar embeddings, diferente de
    // título de tarefa/meta. As colunas têm HTML do editor rico
    // (Fase 3), então o LIKE roda direto no HTML (funciona porque as
    // tags não separam as palavras que o usuário buscaria) e o texto
    // é limpo só na hora de montar o preview do resultado.
    db.execute({
      sql: `SELECT id, entry_date, intention, thoughts, challenges, lighter_plan, feel_good, night_helped, night_takeaway
            FROM journal_entries
            WHERE owner_id = ? AND (
              intention LIKE ? OR thoughts LIKE ? OR challenges LIKE ? OR
              lighter_plan LIKE ? OR feel_good LIKE ? OR night_helped LIKE ? OR night_takeaway LIKE ?
            )
            ORDER BY entry_date DESC LIMIT ?`,
      args: [ownerId, like, like, like, like, like, like, like, limitEach],
    }),
    // Notas (segundo cérebro) e Administração da vida — só busca textual, como o Diário.
    db.execute({
      sql: `SELECT id, title, plain_text FROM notes WHERE owner_id = ? AND archived_at IS NULL AND (title LIKE ? OR plain_text LIKE ?)
            ORDER BY updated_at DESC LIMIT ?`,
      args: [ownerId, like, like, limitEach],
    }),
    db.execute({
      sql: `SELECT id, title, due_date FROM life_admin_items WHERE owner_id = ? AND status = 'active' AND (title LIKE ? OR reference LIKE ? OR notes LIKE ?) LIMIT ?`,
      args: [ownerId, like, like, like, limitEach],
    }),
  ]);

  const textResults: SearchResult[] = [
    ...tasks.rows.map((r) =>
      toResult("task", { id: String(r.id), title: String(r.title), subtitle: r.status ? `Tarefa · ${r.status}` : "Tarefa", link: `/tarefas?task=${String(r.id)}` }, "text")
    ),
    ...goals.rows.map((r) =>
      toResult("goal", { id: String(r.id), title: String(r.title), subtitle: r.status ? `Meta · ${r.status}` : "Meta", link: "/metas" }, "text")
    ),
    ...habits.rows.map((r) => toResult("habit", { id: String(r.id), title: String(r.name), subtitle: "Hábito", link: "/habitos" }, "text")),
    ...books.rows.map((r) =>
      toResult(
        "book",
        { id: String(r.id), title: String(r.title), subtitle: r.author ? `Livro · ${r.author}` : "Livro", link: `/biblioteca/${r.id}` },
        "text"
      )
    ),
    ...academicProjects.rows.map((r) =>
      toResult(
        "academic_project",
        { id: String(r.id), title: String(r.title), subtitle: `Educação · ${r.progress_pct ?? 0}% concluído`, link: "/educacao" },
        "text"
      )
    ),
    ...projects.rows.map((r) => toResult("project", { id: String(r.id), title: String(r.name), subtitle: "Projeto", link: `/projetos/${String(r.id)}` }, "text")),
    ...journalEntries.rows.map((r) => {
      const fields = ["intention", "thoughts", "challenges", "lighter_plan", "feel_good", "night_helped", "night_takeaway"] as const;
      const preview = fields.map((f) => stripHtml(r[f] as string | null)).find((p) => p.length > 0) ?? "";
      const date = String(r.entry_date);
      return toResult(
        "journal_entry",
        { id: date, title: `Diário · ${date}`, subtitle: preview.length > 0 ? preview.slice(0, 80) : null, link: `/diario?date=${date}` },
        "text"
      );
    }),
    ...notes.rows.map((r) =>
      toResult("note", { id: String(r.id), title: String(r.title), subtitle: `Nota · ${String(r.plain_text ?? "").slice(0, 70)}`, link: `/notas?nota=${String(r.id)}` }, "text")
    ),
    ...lifeAdmin.rows.map((r) =>
      toResult(
        "life_admin",
        { id: String(r.id), title: String(r.title), subtitle: r.due_date ? `Administração · vence ${String(r.due_date)}` : "Administração", link: `/administracao?item=${String(r.id)}` },
        "text"
      )
    ),
  ];

  // Busca semântica: só quando o Gemini está configurado. Roda depois
  // da textual e nunca a substitui — só adiciona resultados que a
  // busca por palavra exata não teria encontrado (ex.: "aquela ideia
  // sobre performance" encontrando uma tarefa cujo título é
  // "otimizar consulta lenta do relatório").
  const geminiConfig = await getGeminiConfig();
  let semanticResults: SearchResult[] = [];

  if (geminiConfig) {
    const textualKeys = new Set(textResults.map((r) => `${r.type}:${r.id}`));

    // Candidatos: os N itens mais recentes de cada tipo (não filtrados
    // por LIKE — é justamente o ponto da busca semântica) com seus
    // metadados de exibição já prontos, pra não precisar de uma
    // segunda rodada de queries depois do ranking.
    const [recentTasks, recentGoals, recentHabits, recentBooks, recentAcademic, recentProjects] = await Promise.all([
      db.execute({ sql: "SELECT id, title, status FROM tasks WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 60", args: [ownerId] }),
      db.execute({ sql: "SELECT id, title, status FROM goals WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 60", args: [ownerId] }),
      db.execute({
        sql: "SELECT id, name FROM habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 60",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, title, author, status FROM books WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 60",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, title, progress_pct FROM academic_projects WHERE owner_id = ? ORDER BY created_at DESC LIMIT 60",
        args: [ownerId],
      }),
      db.execute({
        sql: "SELECT id, name, kind FROM projects WHERE owner_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 60",
        args: [ownerId],
      }),
    ]);

    const entityLookup = new Map<string, SearchResult>();
    const candidates: Array<{ entityType: SearchEntityType; entityId: string; text: string }> = [];

    for (const r of recentTasks.rows as unknown as Array<{ id: string; title: string; status: string }>) {
      const key = `task:${r.id}`;
      entityLookup.set(key, toResult("task", { id: r.id, title: r.title, subtitle: `Tarefa · ${r.status}`, link: "/tarefas" }, "semantic"));
      candidates.push({ entityType: "task", entityId: r.id, text: r.title });
    }
    for (const r of recentGoals.rows as unknown as Array<{ id: string; title: string; status: string }>) {
      const key = `goal:${r.id}`;
      entityLookup.set(key, toResult("goal", { id: r.id, title: r.title, subtitle: `Meta · ${r.status}`, link: "/metas" }, "semantic"));
      candidates.push({ entityType: "goal", entityId: r.id, text: r.title });
    }
    for (const r of recentHabits.rows as unknown as Array<{ id: string; name: string }>) {
      const key = `habit:${r.id}`;
      entityLookup.set(key, toResult("habit", { id: r.id, title: r.name, subtitle: "Hábito", link: "/habitos" }, "semantic"));
      candidates.push({ entityType: "habit", entityId: r.id, text: r.name });
    }
    for (const r of recentBooks.rows as unknown as Array<{ id: string; title: string; author: string | null; status: string }>) {
      const key = `book:${r.id}`;
      entityLookup.set(
        key,
        toResult("book", { id: r.id, title: r.title, subtitle: r.author ? `Livro · ${r.author}` : "Livro", link: `/biblioteca/${r.id}` }, "semantic")
      );
      candidates.push({ entityType: "book", entityId: r.id, text: r.author ? `${r.title} — ${r.author}` : r.title });
    }
    for (const r of recentAcademic.rows as unknown as Array<{ id: string; title: string; progress_pct: number }>) {
      const key = `academic_project:${r.id}`;
      entityLookup.set(
        key,
        toResult("academic_project", { id: r.id, title: r.title, subtitle: `Educação · ${r.progress_pct ?? 0}% concluído`, link: "/educacao" }, "semantic")
      );
      candidates.push({ entityType: "academic_project", entityId: r.id, text: r.title });
    }
    for (const r of recentProjects.rows as unknown as Array<{ id: string; name: string }>) {
      const key = `project:${r.id}`;
      entityLookup.set(key, toResult("project", { id: r.id, title: r.name, subtitle: "Projeto", link: `/projetos/${r.id}` }, "semantic"));
      candidates.push({ entityType: "project", entityId: r.id, text: r.name });
    }

    const matches = await rankSemanticCandidates(ownerId, q, candidates);

    // Só considera semanticamente relevante acima de um piso de
    // similaridade (cosseno) — sem isso, qualquer busca devolveria
    // "melhores entre os candidatos" mesmo quando nada tem a ver.
    const SIMILARITY_FLOOR = 0.72;
    const MAX_SEMANTIC = 8;

    for (const match of matches) {
      if (semanticResults.length >= MAX_SEMANTIC) break;
      if (match.similarity < SIMILARITY_FLOOR) break; // matches já vem ordenado desc
      const key = `${match.entityType}:${match.entityId}`;
      if (textualKeys.has(key)) continue; // já apareceu na busca textual
      const entity = entityLookup.get(key);
      if (entity) semanticResults.push(entity);
    }
  }

  res.json({ results: [...textResults, ...semanticResults] });
});
