/**
 * Motor de repetição espaçada do Grimório (SM-2, SuperMemo 2) — funções
 * puras, sem I/O, testadas isoladamente em tests/grimorio.test.ts.
 *
 * Qualidade da resposta (0-5), como no SM-2 original. A interface expõe
 * só quatro botões, mapeados para valores fixos (GRADE_BUTTONS).
 */

export interface SrsState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface SrsResult extends SrsState {
  /** Dia local (YYYY-MM-DD) da próxima revisão. */
  dueDate: string;
}

export const SRS_DEFAULTS = { ease: 2.5, minEase: 1.3, maxIntervalDays: 3650 } as const;

/** Botões da sessão de estudo → qualidade SM-2. Teclas 1-4 seguem esta ordem. */
export const GRADE_BUTTONS = [
  { key: "errei", label: "Errei", quality: 1 },
  { key: "dificil", label: "Difícil", quality: 3 },
  { key: "bom", label: "Bom", quality: 4 },
  { key: "facil", label: "Fácil", quality: 5 },
] as const;

export type GradeKey = (typeof GRADE_BUTTONS)[number]["key"];

export function qualityForGrade(key: GradeKey): number {
  return GRADE_BUTTONS.find((g) => g.key === key)!.quality;
}

export function addDaysToKey(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Aplica uma revisão ao estado do cartão.
 * - q < 3: lapso — repetições zeram e o cartão volta amanhã (intervalo 1).
 *   Só conta como lapso se o cartão já tinha sido aprendido (repetições > 0).
 * - q >= 3: 1ª repetição → 1 dia, 2ª → 6 dias, depois intervalo × ease.
 * - ease é ajustado em toda revisão pela fórmula do SM-2, com piso de 1,3.
 */
export function sm2(state: SrsState, quality: number, todayKey: string): SrsResult {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const prevEase = Number.isFinite(state.ease) && state.ease > 0 ? state.ease : SRS_DEFAULTS.ease;
  const ease = Math.max(SRS_DEFAULTS.minEase, round2(prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));

  let repetitions: number;
  let intervalDays: number;
  let lapses = Math.max(0, state.lapses);

  if (q < 3) {
    if (state.repetitions > 0) lapses += 1;
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = Math.max(0, state.repetitions) + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    // O intervalo cresce pelo ease ANTERIOR (como no SM-2 original).
    else intervalDays = Math.round(Math.max(1, state.intervalDays) * prevEase);
  }
  intervalDays = Math.min(SRS_DEFAULTS.maxIntervalDays, Math.max(1, intervalDays));

  return { ease, intervalDays, repetitions, lapses, dueDate: addDaysToKey(todayKey, intervalDays) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Monta a fila do dia a partir dos cartões já carregados: todos os vencidos
 * (revisados antes e com vencimento até hoje) + novos até o limite que ainda
 * resta hoje. Vencidos mais antigos primeiro; novos na ordem de criação.
 */
export function buildDailyQueue<T extends { dueDate: string; isNew: boolean; createdAt: string }>(
  cards: T[],
  todayKey: string,
  newRemaining: number,
): T[] {
  const due = cards.filter((c) => !c.isNew && c.dueDate <= todayKey).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const fresh = cards
    .filter((c) => c.isNew)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(0, newRemaining));
  return [...due, ...fresh];
}
