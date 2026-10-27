import type { Client } from "@libsql/client";

/**
 * Checagem central de acesso a projetos/tarefas compartilhados
 * ("Colaboração total" — ver projectSharingService.ts). Em vez de
 * espalhar "owner_id = ? OR existe em project_members" em cada rota,
 * todo o acesso compartilhado passa por aqui.
 *
 * Importante: dono e membro aceito têm os MESMOS direitos sobre
 * tarefas (ver, criar, editar, concluir) — não há diferenciação por
 * "role" nesta primeira versão (project_members.role existe no schema
 * para o futuro, mas hoje só é usado para saber "está dentro ou não").
 * Gerenciar quem é membro (convidar/remover) continua exclusivo do
 * dono — só a colaboração nas tarefas é total.
 */

type Row = Record<string, unknown>;

/** true se `userId` é membro aceito do projeto (não inclui o dono — ver isProjectAccessible). */
export async function isProjectMember(db: Client, userId: string, projectId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
    args: [projectId, userId],
  });
  return r.rows.length > 0;
}

/**
 * Projeto que `userId` pode acessar: é o dono OU é membro aceito.
 * Devolve a linha completa (com o owner_id REAL, usado para escopar as
 * tarefas do projeto) ou null se não existe/sem acesso.
 */
export async function getAccessibleProject(db: Client, userId: string, projectId: string): Promise<Row | null> {
  const r = await db.execute({
    sql: `SELECT p.* FROM projects p
          WHERE p.id = ?
            AND (p.owner_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?))`,
    args: [projectId, userId, userId],
  });
  return (r.rows[0] as unknown as Row) ?? null;
}

/**
 * Tarefa que `userId` pode acessar: é dona (owner_id) OU a tarefa
 * pertence a um projeto compartilhado com ele. Devolve a linha
 * completa da tarefa — `owner_id` nela é sempre o CRIADOR real da
 * tarefa, nunca trocado por quem está acessando via projeto
 * compartilhado. Rotas que escrevem devem usar esse owner_id (não
 * `req.user!.id`) em todo WHERE/serviço que dependa de ownership.
 */
export async function getAccessibleTask(db: Client, userId: string, taskId: string): Promise<Row | null> {
  const r = await db.execute({
    sql: `SELECT t.* FROM tasks t
          WHERE t.id = ?
            AND (
              t.owner_id = ?
              OR (t.project_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM project_members m WHERE m.project_id = t.project_id AND m.user_id = ?
              ))
            )`,
    args: [taskId, userId, userId],
  });
  return (r.rows[0] as unknown as Row) ?? null;
}

/** ids de todos os projetos em que `userId` é membro aceito (não inclui os que ele é dono). */
export async function sharedProjectIds(db: Client, userId: string): Promise<string[]> {
  const r = await db.execute({ sql: "SELECT project_id FROM project_members WHERE user_id = ?", args: [userId] });
  return (r.rows as unknown as Array<{ project_id: string }>).map((row) => row.project_id);
}
