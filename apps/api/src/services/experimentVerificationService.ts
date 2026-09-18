import type { getDb } from "../db/client.js";

/**
 * Verificação automática de check-in (seção 15/43 do briefing): sempre
 * que o LifeOS já sabe se o comportamento aconteceu (dado real de
 * outro módulo), o usuário não precisa confirmar manualmente. As
 * regras aqui só LEEM dados de Saúde/Foco/Biblioteca/Educação/Hábitos
 * — nunca gravam nada.
 */

type Db = ReturnType<typeof getDb>;

export type VerificationRule =
  | "sleep_before"
  | "water_target"
  | "focus_minimum"
  | "reading_pages_minimum"
  | "exercise_minimum"
  | "study_minimum"
  | "habit_completion";

export interface VerificationRuleInfo {
  key: VerificationRule;
  label: string;
  configLabel: string;
  configUnit: string;
  metric: string; // ExperimentMetricKey correspondente, para sugerir a métrica principal coerente
}

export const VERIFICATION_RULES: Record<VerificationRule, VerificationRuleInfo> = {
  sleep_before: { key: "sleep_before", label: "Dormir antes de um horário", configLabel: "Horário limite", configUnit: "hh:mm", metric: "sleep_duration" },
  water_target: { key: "water_target", label: "Beber uma meta de água por dia", configLabel: "Meta diária", configUnit: "ml", metric: "water_ml" },
  focus_minimum: { key: "focus_minimum", label: "Mínimo de minutos de Focus por dia", configLabel: "Mínimo diário", configUnit: "min", metric: "focus_minutes" },
  reading_pages_minimum: { key: "reading_pages_minimum", label: "Mínimo de páginas lidas por dia", configLabel: "Mínimo diário", configUnit: "pág.", metric: "reading_pages" },
  exercise_minimum: { key: "exercise_minimum", label: "Mínimo de minutos de exercício por dia", configLabel: "Mínimo diário", configUnit: "min", metric: "exercise_minutes" },
  study_minimum: { key: "study_minimum", label: "Mínimo de minutos de estudo por dia", configLabel: "Mínimo diário", configUnit: "min", metric: "study_minutes" },
  habit_completion: { key: "habit_completion", label: "Cumprir um hábito existente", configLabel: "Hábito", configUnit: "", metric: "habit_consistency" },
};

/** Verifica, para uma única data, se o comportamento configurado foi cumprido segundo dados reais. Retorna null se a regra não se aplica/config incompleta. */
export async function checkAutomaticRule(
  db: Db,
  ownerId: string,
  rule: VerificationRule,
  config: Record<string, unknown> | null,
  linkedHabitId: string | null,
  date: string
): Promise<boolean | null> {
  switch (rule) {
    case "sleep_before": {
      const beforeTime = String(config?.beforeTime ?? "23:00");
      const r = await db.execute({
        sql: "SELECT strftime('%H:%M', went_to_bed_at) AS t FROM sleep_entries WHERE owner_id = ? AND date(went_to_bed_at) = date(?) ORDER BY went_to_bed_at ASC LIMIT 1",
        args: [ownerId, date],
      });
      const row = r.rows[0] as unknown as { t?: string } | undefined;
      if (!row?.t) return null;
      return row.t <= beforeTime;
    }
    case "water_target": {
      const targetMl = Number(config?.targetMl ?? 3000);
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(amount_ml), 0) AS v FROM water_entries WHERE owner_id = ? AND date(recorded_at) = date(?)",
        args: [ownerId, date],
      });
      const total = Number((r.rows[0] as unknown as { v?: number })?.v ?? 0);
      return total > 0 ? total >= targetMl : null;
    }
    case "focus_minimum": {
      const minMinutes = Number(config?.minMinutes ?? 25);
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(actual_minutes), 0) AS v FROM focus_sessions WHERE owner_id = ? AND ended_at IS NOT NULL AND date(started_at) = date(?)",
        args: [ownerId, date],
      });
      const total = Number((r.rows[0] as unknown as { v?: number })?.v ?? 0);
      return total > 0 ? total >= minMinutes : null;
    }
    case "reading_pages_minimum": {
      const minPages = Number(config?.minPages ?? 20);
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(pages_read), 0) AS v FROM reading_sessions WHERE owner_id = ? AND date(started_at) = date(?)",
        args: [ownerId, date],
      });
      const total = Number((r.rows[0] as unknown as { v?: number })?.v ?? 0);
      return total > 0 ? total >= minPages : null;
    }
    case "exercise_minimum": {
      const minMinutes = Number(config?.minMinutes ?? 30);
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS v FROM workouts WHERE owner_id = ? AND date(performed_at) = date(?)",
        args: [ownerId, date],
      });
      const total = Number((r.rows[0] as unknown as { v?: number })?.v ?? 0);
      return total > 0 ? total >= minMinutes : null;
    }
    case "study_minimum": {
      const minMinutes = Number(config?.minMinutes ?? 60);
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(duration_minutes), 0) AS v FROM study_sessions WHERE owner_id = ? AND date(occurred_at) = date(?)",
        args: [ownerId, date],
      });
      const total = Number((r.rows[0] as unknown as { v?: number })?.v ?? 0);
      return total > 0 ? total >= minMinutes : null;
    }
    case "habit_completion": {
      if (!linkedHabitId) return null;
      const habitRow = await db.execute({ sql: "SELECT target_count FROM habits WHERE id = ? AND owner_id = ?", args: [linkedHabitId, ownerId] });
      const targetCount = Number((habitRow.rows[0] as unknown as { target_count?: number })?.target_count ?? 1);
      const r = await db.execute({
        sql: "SELECT count FROM habit_entries WHERE owner_id = ? AND habit_id = ? AND entry_date = ?",
        args: [ownerId, linkedHabitId, date],
      });
      const row = r.rows[0] as unknown as { count?: number } | undefined;
      if (!row) return false; // hábito existe, sem registro no dia = não cumpriu (diferente das métricas de série, aqui ausência é "não fez")
      return Number(row.count) >= targetCount;
    }
    default:
      return null;
  }
}
