/**
 * Signals — normalização e Radar do dia.
 *
 * Regra central do módulo: Signals é uma camada AGREGADORA. Nunca
 * lemos/gravamos dado novo aqui — só transformamos números que já
 * existem em outros módulos (sono, humor, energia, foco, exercício,
 * água) numa escala comum de 0 a 100 para poder comparar coisas
 * diferentes (minutos, nota de 1-5, ml) lado a lado no radar.
 *
 * Toda fórmula abaixo é documentada e determinística — nunca um
 * "chute" da IA. Metas de referência (8h de sono, 120min de foco,
 * 30min de exercício, 2000ml de água) são âncoras conceituais comuns
 * de bem-estar/produtividade, não recomendações médicas individuais.
 */

export type SignalScoreKey = "sleep" | "energy" | "mood" | "productivity" | "health" | "balance";

export interface RadarDimension {
  key: SignalScoreKey;
  label: string;
  /** 0-100, ou null quando não há dado suficiente no período (nunca vira 0 fabricado). */
  value: number | null;
}

export interface DayClassification {
  label: string;
  description: string;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Sono: 8h (480min) de duração média = 100. Nunca extrapola acima de 100 (dormir demais não é "mais pontos"). */
export function scoreSleep(avgDurationMinutes: number | null): number | null {
  if (avgDurationMinutes == null) return null;
  return clamp100((avgDurationMinutes / 480) * 100);
}

/** Energia/Humor: escala nativa já é 1-5 (mood_entries) — só reprojeta para 0-100. */
export function scoreFromFivePoint(avg: number | null): number | null {
  if (avg == null) return null;
  return clamp100(((avg - 1) / 4) * 100);
}

/** Produtividade: mistura minutos de foco (meta 120min/dia = 100) com tarefas concluídas (meta 5/dia = 100), 60/40. */
export function scoreProductivity(avgFocusMinutes: number | null, avgTasksCompleted: number | null): number | null {
  const focusScore = avgFocusMinutes == null ? null : clamp100((avgFocusMinutes / 120) * 100);
  const tasksScore = avgTasksCompleted == null ? null : clamp100((avgTasksCompleted / 5) * 100);
  if (focusScore == null && tasksScore == null) return null;
  if (focusScore == null) return tasksScore;
  if (tasksScore == null) return focusScore;
  return clamp100(focusScore * 0.6 + tasksScore * 0.4);
}

/** Saúde: média dos sub-scores disponíveis (sono, exercício meta 30min/dia, água meta 2000ml/dia). Ignora os ausentes em vez de zerar. */
export function scoreHealth(sleepScore: number | null, avgExerciseMinutes: number | null, avgWaterMl: number | null): number | null {
  const exerciseScore = avgExerciseMinutes == null ? null : clamp100((avgExerciseMinutes / 30) * 100);
  const waterScore = avgWaterMl == null ? null : clamp100((avgWaterMl / 2000) * 100);
  const parts = [sleepScore, exerciseScore, waterScore].filter((v): v is number => v != null);
  if (parts.length === 0) return null;
  return clamp100(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Equilíbrio: inverso do estresse médio (1-5). Sem registro de estresse no período, não há como estimar — fica null (nunca vira 50 "neutro" inventado). */
export function scoreBalance(avgStress: number | null): number | null {
  if (avgStress == null) return null;
  return clamp100(100 - ((avgStress - 1) / 4) * 100);
}

export function buildRadar(scores: {
  sleep: number | null;
  energy: number | null;
  mood: number | null;
  productivity: number | null;
  health: number | null;
  balance: number | null;
}): RadarDimension[] {
  return [
    { key: "sleep", label: "Sono", value: scores.sleep },
    { key: "energy", label: "Energia", value: scores.energy },
    { key: "mood", label: "Humor", value: scores.mood },
    { key: "productivity", label: "Produtividade", value: scores.productivity },
    { key: "health", label: "Saúde", value: scores.health },
    { key: "balance", label: "Equilíbrio", value: scores.balance },
  ];
}

/**
 * Classificação textual do dia/período — descritiva, nunca diagnóstica.
 * Precisa de pelo menos 3 das 6 dimensões preenchidas para não rotular
 * o dia com base em quase nada.
 */
export function classifyDay(radar: RadarDimension[]): DayClassification | null {
  const values = radar.map((d) => d.value).filter((v): v is number => v != null);
  if (values.length < 3) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const balance = radar.find((d) => d.key === "balance")?.value ?? null;
  const sleep = radar.find((d) => d.key === "sleep")?.value ?? null;

  if (avg >= 75) return { label: "Dia forte", description: "A maioria dos sinais registrados está em um nível alto neste período." };
  if (sleep != null && sleep < 40 && avg < 55) {
    return { label: "Dia de recuperação", description: "Sono abaixo do de costume parece estar puxando os outros sinais para baixo." };
  }
  if (balance != null && balance < 40) {
    return { label: "Dia de atenção", description: "Estresse relatado alto em relação aos demais sinais neste período." };
  }
  if (avg >= 55) return { label: "Dia equilibrado", description: "Os sinais registrados estão em níveis medianos a bons, sem grandes desvios." };
  return { label: "Dia abaixo do padrão", description: "Vários sinais registrados estão mais baixos que o de costume neste período." };
}
