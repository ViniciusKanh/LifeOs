import type { getDb } from "../db/client.js";

/**
 * Correlações de saúde automáticas — cruza as séries diárias que já
 * existem (sono, exercício, água, humor/energia/estresse) e calcula a
 * correlação de Pearson entre pares plausíveis, com uma frase em
 * português explicando o padrão. Não é diagnóstico nem conselho
 * médico: é uma observação estatística sobre os próprios dados do
 * usuário, e só aparece quando há amostra suficiente para não ser
 * ruído (MIN_SAMPLE_SIZE dias com os dois valores no mesmo dia).
 */
const MIN_SAMPLE_SIZE = 7;

export interface CorrelationResult {
  pair: string;
  label: string;
  r: number;
  n: number;
  strength: "fraca" | "moderada" | "forte" | "muito forte";
  direction: "positiva" | "negativa";
  description: string;
}

/** Correlação de Pearson entre duas séries de mesmo tamanho, pareadas por índice. Retorna null se variância zero (não há o que correlacionar). */
export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2) return null;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

function classifyStrength(absR: number): CorrelationResult["strength"] {
  if (absR >= 0.7) return "muito forte";
  if (absR >= 0.5) return "forte";
  if (absR >= 0.3) return "moderada";
  return "fraca";
}

/** Junta dois mapas data→valor pelas datas em comum, na mesma ordem. */
function pairByDate(a: Map<string, number>, b: Map<string, number>): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const [date, valueA] of a) {
    const valueB = b.get(date);
    if (valueB !== undefined) {
      x.push(valueA);
      y.push(valueB);
    }
  }
  return { x, y };
}

interface PairConfig {
  pair: string;
  label: string;
  xLabel: string;
  yLabel: string;
}

const PAIR_CONFIGS: PairConfig[] = [
  { pair: "sleep_vs_mood", label: "Horas de sono → Humor", xLabel: "sono", yLabel: "humor" },
  { pair: "sleep_vs_energy", label: "Horas de sono → Energia", xLabel: "sono", yLabel: "energia" },
  { pair: "sleep_quality_vs_energy", label: "Qualidade do sono → Energia", xLabel: "qualidade do sono", yLabel: "energia" },
  { pair: "workout_vs_mood", label: "Minutos de exercício → Humor", xLabel: "exercício", yLabel: "humor" },
  { pair: "workout_vs_energy", label: "Minutos de exercício → Energia", xLabel: "exercício", yLabel: "energia" },
  { pair: "water_vs_energy", label: "Água (ml) → Energia", xLabel: "água", yLabel: "energia" },
  { pair: "sleep_vs_stress", label: "Horas de sono → Estresse", xLabel: "sono", yLabel: "estresse" },
];

function describe(cfg: PairConfig, r: number, n: number): string {
  const strength = classifyStrength(Math.abs(r));
  const direction: CorrelationResult["direction"] = r >= 0 ? "positiva" : "negativa";
  if (direction === "positiva") {
    return `Correlação ${strength} e positiva (r=${r.toFixed(2)}, ${n} dias): quanto mais ${cfg.xLabel}, maior tende a ser o(a) ${cfg.yLabel} no mesmo dia.`;
  }
  return `Correlação ${strength} e negativa (r=${r.toFixed(2)}, ${n} dias): quanto mais ${cfg.xLabel}, menor tende a ser o(a) ${cfg.yLabel} no mesmo dia.`;
}

export async function computeHealthCorrelations(
  db: ReturnType<typeof getDb>,
  ownerId: string
): Promise<CorrelationResult[]> {
  const [sleepRows, moodRows, workoutRows, waterRows] = await Promise.all([
    db.execute({
      sql: `SELECT date(woke_up_at) AS d, AVG(duration_minutes) AS minutes, AVG(quality) AS quality
            FROM sleep_entries WHERE owner_id = ? AND duration_minutes IS NOT NULL GROUP BY d`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT date(recorded_at) AS d, AVG(mood) AS mood, AVG(energy) AS energy, AVG(stress) AS stress
            FROM mood_entries WHERE owner_id = ? GROUP BY d`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT date(performed_at) AS d, SUM(duration_minutes) AS minutes
            FROM workouts WHERE owner_id = ? AND duration_minutes IS NOT NULL GROUP BY d`,
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT date(recorded_at) AS d, SUM(amount_ml) AS ml
            FROM water_entries WHERE owner_id = ? GROUP BY d`,
      args: [ownerId],
    }),
  ]);

  const sleepMinutes = new Map<string, number>();
  const sleepQuality = new Map<string, number>();
  for (const row of sleepRows.rows as unknown as Array<{ d: string; minutes: number | null; quality: number | null }>) {
    if (row.minutes != null) sleepMinutes.set(row.d, Number(row.minutes));
    if (row.quality != null) sleepQuality.set(row.d, Number(row.quality));
  }

  const mood = new Map<string, number>();
  const energy = new Map<string, number>();
  const stress = new Map<string, number>();
  for (const row of moodRows.rows as unknown as Array<{ d: string; mood: number; energy: number; stress: number | null }>) {
    mood.set(row.d, Number(row.mood));
    energy.set(row.d, Number(row.energy));
    if (row.stress != null) stress.set(row.d, Number(row.stress));
  }

  const workoutMinutes = new Map<string, number>();
  for (const row of workoutRows.rows as unknown as Array<{ d: string; minutes: number | null }>) {
    if (row.minutes != null) workoutMinutes.set(row.d, Number(row.minutes));
  }

  const waterMl = new Map<string, number>();
  for (const row of waterRows.rows as unknown as Array<{ d: string; ml: number | null }>) {
    if (row.ml != null) waterMl.set(row.d, Number(row.ml));
  }

  const seriesByPair: Record<string, () => { x: number[]; y: number[] }> = {
    sleep_vs_mood: () => pairByDate(sleepMinutes, mood),
    sleep_vs_energy: () => pairByDate(sleepMinutes, energy),
    sleep_quality_vs_energy: () => pairByDate(sleepQuality, energy),
    workout_vs_mood: () => pairByDate(workoutMinutes, mood),
    workout_vs_energy: () => pairByDate(workoutMinutes, energy),
    water_vs_energy: () => pairByDate(waterMl, energy),
    sleep_vs_stress: () => pairByDate(sleepMinutes, stress),
  };

  const results: CorrelationResult[] = [];
  for (const cfg of PAIR_CONFIGS) {
    const { x, y } = seriesByPair[cfg.pair]();
    if (x.length < MIN_SAMPLE_SIZE) continue;
    const r = pearson(x, y);
    if (r === null) continue;
    results.push({
      pair: cfg.pair,
      label: cfg.label,
      r: Math.round(r * 100) / 100,
      n: x.length,
      strength: classifyStrength(Math.abs(r)),
      direction: r >= 0 ? "positiva" : "negativa",
      description: describe(cfg, r, x.length),
    });
  }

  // Mais forte primeiro — é o que vale a pena o usuário ver primeiro.
  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return results;
}
