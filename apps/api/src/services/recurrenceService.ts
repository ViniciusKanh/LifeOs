/**
 * Recorrência de tarefas — o campo recurrence_rule já existia no
 * schema desde o início (`0003_projects_tasks.sql`), mas nada gerava
 * a próxima ocorrência nem validava o formato. Formato suportado
 * (subconjunto simples do RRULE do iCal, suficiente pro que o app
 * precisa — não é uma implementação completa de RFC 5545):
 *
 *   FREQ=DAILY
 *   FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU   (pelo menos um dia)
 *   FREQ=MONTHLY                              (mesmo dia do mês)
 */
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byDay?: WeekdayCode[];
}

/** Valida e faz o parse de uma regra — null se o formato não é reconhecido (nunca lança). */
export function parseRecurrenceRule(rule: string): RecurrenceRule | null {
  const parts = Object.fromEntries(
    rule
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [key, value] = p.split("=");
        return [key?.toUpperCase(), value];
      })
  ) as Record<string, string | undefined>;

  if (parts.FREQ === "DAILY") return { freq: "DAILY" };
  if (parts.FREQ === "MONTHLY") return { freq: "MONTHLY" };
  if (parts.FREQ === "WEEKLY") {
    const byDay = (parts.BYDAY ?? "")
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter((d): d is WeekdayCode => (WEEKDAY_CODES as readonly string[]).includes(d));
    if (byDay.length === 0) return null;
    return { freq: "WEEKLY", byDay };
  }
  return null;
}

/** true só se a string é uma regra reconhecida — usado na validação do zod. */
export function isValidRecurrenceRule(rule: string): boolean {
  return parseRecurrenceRule(rule) !== null;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Próxima ocorrência estritamente depois de `fromIso` (data de
 * referência — normalmente o due_date da tarefa concluída, ou hoje se
 * ela não tinha prazo). Nunca retorna a mesma data recebida.
 */
export function computeNextOccurrence(rule: RecurrenceRule, fromIso: string): string {
  if (rule.freq === "DAILY") return addDaysISO(fromIso, 1);

  if (rule.freq === "MONTHLY") {
    const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const day = d.getUTCDate();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const daysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, daysInNextMonth));
    return next.toISOString().slice(0, 10);
  }

  // WEEKLY: percorre os próximos 7 dias e para no primeiro que bate com BYDAY.
  const byDay = rule.byDay ?? [];
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDaysISO(fromIso, offset);
    const weekday = WEEKDAY_CODES[(new Date(`${candidate}T00:00:00Z`).getUTCDay() + 6) % 7];
    if (byDay.includes(weekday)) return candidate;
  }
  // Nunca deveria chegar aqui (byDay sempre tem >=1 item válido), mas garante um retorno.
  return addDaysISO(fromIso, 7);
}
