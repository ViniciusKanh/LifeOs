import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

/**
 * Restauração do próprio backup (GET /api/export/me) — item 8 da análise
 * de 27/10. Escopo V1, decidido com o usuário: só os módulos centrais
 * (tarefas, projetos, metas, hábitos, saúde, diário, biblioteca e
 * educação). Fora do V1, de propósito: fotos (journal_entry_media,
 * task_attachments — tamanho), Guilda/convites e Banco/gamificação
 * (dados de/entre outros usuários ou derivados, não "dados pessoais"
 * no sentido de um backup).
 *
 * Regras de segurança não-negociáveis:
 * - TODO id é regenerado (nanoid) — nunca reaproveita o id do arquivo.
 *   Evita colisão com dados que já existam na conta E evita que um
 *   arquivo alterado force um id específico.
 * - owner_id é SEMPRE sobrescrito para o usuário autenticado que está
 *   restaurando — o valor do arquivo nunca é confiado, do contrário um
 *   arquivo trocado entre contas escreveria dado isolado de um usuário
 *   dentro de outro.
 * - Toda referência a outra tabela (FK) é remapeada pelo id novo através
 *   de um mapa construído durante a própria restauração, na ordem de
 *   dependência (pai antes do filho). Se o pai referenciado não foi
 *   restaurado (fora de escopo, ou não veio no arquivo) e a coluna é
 *   opcional, vira NULL; se é obrigatória (ex.: subtasks.task_id), a
 *   linha filha é ignorada (nunca falha a restauração inteira por causa
 *   de uma linha órfã).
 * - INSERT OR IGNORE em tudo: colisão de UNIQUE (ex.: habit_entries por
 *   dia, journal_entries por data) descarta só aquela linha, nunca
 *   aborta o lote. O id só entra no mapa de remapeamento se a linha
 *   realmente foi inserida (rowsAffected > 0) — senão os filhos dela
 *   seriam órfãos de um pai fantasma.
 */

type Db = ReturnType<typeof getDb>;

interface FkSpec {
  /** Coluna desta tabela que guarda um id de outra tabela. */
  column: string;
  /** Tabela referenciada — o mapa de ids dela precisa já estar pronto (ordem de RESTORE_TABLES). */
  refTable: string;
  /** true: linha é descartada se o id não resolver. false: coluna vira NULL. */
  required: boolean;
}

interface RestoreTableSpec {
  table: string;
  /** false só para tabelas de junção puras (chave composta, sem coluna `id`). */
  hasOwnId: boolean;
  /** Todas as colunas a copiar do arquivo, na ordem do INSERT (allowlist — nunca vem do payload). */
  columns: string[];
  fks?: FkSpec[];
  /** Coluna que referencia um id da PRÓPRIA tabela (ex.: parent_task_id) — resolvida numa 2ª passada, sempre opcional. */
  selfRefColumn?: string;
  /** Ajuste extra depois do remap padrão (ex.: JSON de ids, ou FK condicional). Retorna false para descartar a linha. */
  postProcess?: (row: Record<string, unknown>, idMaps: Map<string, Map<string, string>>) => boolean;
}

/** Ordem de dependência: cada tabela só referencia tabelas que já aparecem antes dela nesta lista. */
const RESTORE_TABLES: RestoreTableSpec[] = [
  { table: "goals", hasOwnId: true, columns: ["id","owner_id","parent_goal_id","title","description","category","kind","target_value","current_value","unit","due_date","status","created_at","updated_at","period","next_action","next_action_due","completed_at","life_area","cycle"], selfRefColumn: "parent_goal_id" },
  { table: "goal_progress", hasOwnId: true, columns: ["id","goal_id","owner_id","value","recorded_at","note"], fks: [{ column: "goal_id", refTable: "goals", required: true }] },
  { table: "habits", hasOwnId: true, columns: ["id","owner_id","name","icon","frequency","frequency_config","target_count","archived_at","created_at","category","auto_source","auto_threshold","after_habit_id"], selfRefColumn: "after_habit_id" },
  { table: "habit_entries", hasOwnId: true, columns: ["id","habit_id","owner_id","entry_date","count","created_at","source"], fks: [{ column: "habit_id", refTable: "habits", required: true }] },
  { table: "projects", hasOwnId: true, columns: ["id","owner_id","parent_id","name","description","kind","color","archived_at","created_at","updated_at","status","priority","start_date","due_date","objective","scope","success_criteria","client","area","budget","repository_url","links","tags","completed_at","goal_id"], fks: [{ column: "goal_id", refTable: "goals", required: false }], selfRefColumn: "parent_id" },
  { table: "task_statuses", hasOwnId: true, columns: ["id","owner_id","name","position","is_default"] },
  { table: "tasks", hasOwnId: true, columns: ["id","owner_id","project_id","parent_task_id","goal_id","title","description","status","priority","impact","urgency","effort","priority_score","due_date","start_date","estimate_minutes","time_spent_minutes","recurrence_rule","notes","completed_at","created_at","updated_at","habit_id","contract_id","difficulty","planned_date"], fks: [
    { column: "project_id", refTable: "projects", required: false },
    { column: "goal_id", refTable: "goals", required: false },
    { column: "habit_id", refTable: "habits", required: false },
    { column: "contract_id", refTable: "contracts", required: false }, // contracts fora do escopo V1 — sempre vira NULL.
  ], selfRefColumn: "parent_task_id" },
  { table: "subtasks", hasOwnId: true, columns: ["id","task_id","owner_id","title","done","position","created_at"], fks: [{ column: "task_id", refTable: "tasks", required: true }] },
  { table: "tags", hasOwnId: true, columns: ["id","owner_id","name","color"] },
  { table: "task_tags", hasOwnId: false, columns: ["task_id","tag_id"], fks: [{ column: "task_id", refTable: "tasks", required: true }, { column: "tag_id", refTable: "tags", required: true }] },
  { table: "task_dependencies", hasOwnId: false, columns: ["task_id","depends_on_id"], fks: [{ column: "task_id", refTable: "tasks", required: true }, { column: "depends_on_id", refTable: "tasks", required: true }] },
  { table: "time_entries", hasOwnId: true, columns: ["id","owner_id","task_id","project_id","started_at","ended_at","duration_minutes","kind","perceived_productivity","distractions","notes","created_at"], fks: [{ column: "task_id", refTable: "tasks", required: false }, { column: "project_id", refTable: "projects", required: false }] },
  { table: "health_entries", hasOwnId: true, columns: ["id","owner_id","metric","value","unit","recorded_at","notes"] },
  { table: "water_entries", hasOwnId: true, columns: ["id","owner_id","amount_ml","recorded_at"] },
  { table: "sleep_entries", hasOwnId: true, columns: ["id","owner_id","went_to_bed_at","woke_up_at","duration_minutes","quality","notes","created_at"] },
  { table: "workouts", hasOwnId: true, columns: ["id","owner_id","kind","duration_minutes","distance_km","calories","intensity","notes","performed_at","category","modality","rpe","muscle_groups","rounds","round_minutes"] },
  { table: "workout_sets", hasOwnId: true, columns: ["id","owner_id","workout_id","position","exercise","sets","reps","load_kg","created_at"], fks: [{ column: "workout_id", refTable: "workouts", required: true }] },
  { table: "mood_entries", hasOwnId: true, columns: ["id","owner_id","mood","energy","stress","note","recorded_at"] },
  { table: "books", hasOwnId: true, columns: ["id","owner_id","isbn","title","author","publisher","cover_url","published_year","total_pages","current_page","categories","description","status","rating","personal_note","started_at","finished_at","source","created_at","updated_at"] },
  { table: "book_notes", hasOwnId: true, columns: ["id","book_id","owner_id","kind","content","page","created_at"], fks: [{ column: "book_id", refTable: "books", required: true }] },
  { table: "reading_sessions", hasOwnId: true, columns: ["id","book_id","owner_id","started_at","ended_at","duration_minutes","pages_read","created_at"], fks: [{ column: "book_id", refTable: "books", required: true }] },
  { table: "reading_year_goals", hasOwnId: true, columns: ["id","owner_id","year","books_target","pages_target","created_at","updated_at"] },
  { table: "educations", hasOwnId: true, columns: ["id","owner_id","kind","institution","course_name","started_at","expected_end_at","progress_pct","notes","created_at","weekly_study_goal_minutes"] },
  { table: "courses", hasOwnId: true, columns: ["id","education_id","owner_id","name","semester","created_at"], fks: [{ column: "education_id", refTable: "educations", required: true }] },
  { table: "subjects", hasOwnId: true, columns: ["id","course_id","owner_id","name","professor","workload_hours","status","grades","files","notes","created_at","progress_pct"], fks: [{ column: "course_id", refTable: "courses", required: true }] },
  { table: "academic_projects", hasOwnId: true, columns: ["id","owner_id","project_id","kind","title","advisor","progress_pct","defense_date","created_at","education_id"], fks: [{ column: "project_id", refTable: "projects", required: false }, { column: "education_id", refTable: "educations", required: false }] },
  { table: "academic_deadlines", hasOwnId: true, columns: ["id","owner_id","education_id","subject_id","title","due_date","done","created_at"], fks: [{ column: "education_id", refTable: "educations", required: true }, { column: "subject_id", refTable: "subjects", required: false }] },
  { table: "study_sessions", hasOwnId: true, columns: ["id","owner_id","education_id","subject_id","occurred_at","duration_minutes","created_at"], fks: [{ column: "education_id", refTable: "educations", required: true }, { column: "subject_id", refTable: "subjects", required: false }] },
  { table: "semester_checklist", hasOwnId: true, columns: ["id","owner_id","education_id","title","done","due_date","position","created_at"], fks: [{ column: "education_id", refTable: "educations", required: true }] },
  { table: "journals", hasOwnId: true, columns: ["id","owner_id","name","icon","color","description","sort_order","archived_at","created_at","updated_at"] },
  { table: "journal_entries", hasOwnId: true, columns: ["id","owner_id","entry_date","intention","thoughts","gratitude","self_care","self_care_other","challenges","lighter_plan","feel_good","night_mood","night_helped","night_takeaway","focus_task_ids","created_at","updated_at","is_favorite","location_label","location_lat","location_lng","tags","ai_title","ai_summary","ai_categories","ai_organized_at","ai_highlights","ai_gratitude"],
    postProcess: (row, idMaps) => {
      // focus_task_ids é um array JSON de ids de tasks — remapeia, descartando quem não restaurou.
      if (typeof row.focus_task_ids === "string" && row.focus_task_ids) {
        try {
          const ids = JSON.parse(row.focus_task_ids as string);
          if (Array.isArray(ids)) {
            const taskMap = idMaps.get("tasks");
            const remapped = ids.map((id) => taskMap?.get(String(id))).filter((id): id is string => !!id);
            row.focus_task_ids = JSON.stringify(remapped);
          }
        } catch {
          row.focus_task_ids = "[]";
        }
      }
      return true;
    },
  },
  { table: "journal_entry_journals", hasOwnId: false, columns: ["entry_id","journal_id"], fks: [{ column: "entry_id", refTable: "journal_entries", required: true }, { column: "journal_id", refTable: "journals", required: true }] },
  { table: "journal_entry_links", hasOwnId: true, columns: ["id","entry_id","owner_id","target_type","target_id","created_at"], fks: [{ column: "entry_id", refTable: "journal_entries", required: true }],
    postProcess: (row, idMaps) => {
      // target_id aponta pra projects OU goals, dependendo de target_type (sem FK de banco) — remap manual, descarta se não resolver.
      const targetTable = row.target_type === "project" ? "projects" : row.target_type === "goal" ? "goals" : null;
      const resolved = targetTable ? idMaps.get(targetTable)?.get(String(row.target_id)) : undefined;
      if (!resolved) return false;
      row.target_id = resolved;
      return true;
    },
  },
];

export interface RestoreSummary {
  restored: Record<string, number>;
  skipped: Record<string, number>;
}

function remap(idMaps: Map<string, Map<string, string>>, table: string, oldId: unknown): string | null {
  if (oldId === null || oldId === undefined) return null;
  return idMaps.get(table)?.get(String(oldId)) ?? null;
}

/** Restaura as tabelas do payload do export (GET /api/export/me) para o usuário autenticado. Tabelas fora de RESTORE_TABLES são ignoradas silenciosamente. */
export async function restoreBackup(db: Db, ownerId: string, data: Record<string, unknown>): Promise<RestoreSummary> {
  const idMaps = new Map<string, Map<string, string>>();
  const summary: RestoreSummary = { restored: {}, skipped: {} };

  for (const spec of RESTORE_TABLES) {
    const rawRows = Array.isArray(data[spec.table]) ? (data[spec.table] as Array<Record<string, unknown>>) : [];
    const map = new Map<string, string>();
    if (spec.hasOwnId) idMaps.set(spec.table, map);
    if (rawRows.length === 0) continue;

    let restoredCount = 0;
    let skippedCount = 0;
    const selfRefPending: Array<{ newId: string; oldSelfRef: string }> = [];

    for (let i = 0; i < rawRows.length; i += 200) {
      const chunk = rawRows.slice(i, i + 200);
      const statements: Array<{ sql: string; args: unknown[]; oldId: string | null; newId: string | null; selfRefOld: string | null }> = [];

      for (const raw of chunk) {
        const oldId = spec.hasOwnId ? String(raw.id) : null;
        const newId = spec.hasOwnId ? nanoid() : null;
        const row: Record<string, unknown> = {};
        for (const col of spec.columns) row[col] = raw[col] ?? null;

        if (spec.hasOwnId) row.id = newId;
        if ("owner_id" in row) row.owner_id = ownerId;

        let drop = false;
        for (const fk of spec.fks ?? []) {
          const resolved = remap(idMaps, fk.refTable, row[fk.column]);
          if (resolved) row[fk.column] = resolved;
          else if (fk.required) { drop = true; break; }
          else row[fk.column] = null;
        }
        if (drop) { skippedCount += 1; continue; }

        let selfRefOld: string | null = null;
        if (spec.selfRefColumn) {
          selfRefOld = row[spec.selfRefColumn] != null ? String(row[spec.selfRefColumn]) : null;
          row[spec.selfRefColumn] = null; // resolvido na 2ª passada, depois que a tabela inteira existir.
        }

        if (spec.postProcess && spec.postProcess(row, idMaps) === false) { skippedCount += 1; continue; }

        const cols = spec.columns;
        statements.push({
          sql: `INSERT OR IGNORE INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          args: cols.map((c) => row[c] ?? null),
          oldId,
          newId,
          selfRefOld,
        });
      }

      if (statements.length === 0) continue;
      const results = await db.batch(
        statements.map((s) => ({ sql: s.sql, args: s.args as (string | number | null)[] })),
        "write"
      );

      results.forEach((result, idx) => {
        const s = statements[idx];
        if (result.rowsAffected > 0) {
          restoredCount += 1;
          if (spec.hasOwnId && s.oldId && s.newId) map.set(s.oldId, s.newId);
          if (spec.selfRefColumn && s.selfRefOld && s.newId) selfRefPending.push({ newId: s.newId, oldSelfRef: s.selfRefOld });
        } else {
          skippedCount += 1;
        }
      });
    }

    // 2ª passada: auto-referência (parent_id, parent_goal_id, after_habit_id, parent_task_id) —
    // só agora o mapa de ids desta MESMA tabela está completo.
    if (spec.selfRefColumn && selfRefPending.length) {
      const col = spec.selfRefColumn;
      for (let i = 0; i < selfRefPending.length; i += 200) {
        const chunk = selfRefPending.slice(i, i + 200);
        const stmts = chunk
          .map((p) => ({ resolved: map.get(p.oldSelfRef), newId: p.newId }))
          .filter((p): p is { resolved: string; newId: string } => !!p.resolved)
          .map((p) => ({ sql: `UPDATE ${spec.table} SET ${col} = ? WHERE id = ?`, args: [p.resolved, p.newId] }));
        if (stmts.length) await db.batch(stmts, "write");
      }
    }

    if (restoredCount) summary.restored[spec.table] = restoredCount;
    if (skippedCount) summary.skipped[spec.table] = skippedCount;
  }

  return summary;
}
