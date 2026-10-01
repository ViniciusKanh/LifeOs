/**
 * Estatística descritiva e de efeito para os Experimentos Pessoais.
 * Funções puras (sem banco) para serem testadas isoladamente.
 *
 * Escolhas deliberadas para amostras pequenas (7–30 dias):
 *  - Hedges g (Cohen d corrigido para n pequeno) como tamanho de efeito;
 *  - intervalo de 90% da diferença de médias por Welch (variâncias diferentes);
 *  - a "evidência" combina tamanho do efeito, intervalo e tamanho da amostra
 *    — nunca é um p-valor apresentado como verdade.
 */

export interface Describe {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export function describe(values: number[]): Describe {
  const n = values.length;
  if (n === 0) return { n, mean: null, sd: null, median: null, min: null, max: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n, mean, sd, median, min: sorted[0], max: sorted[n - 1] };
}

/** Valor crítico t (bicaudal, 90%) aproximado pela expansão de Cornish-Fisher — erro < 1% para df ≥ 3. */
export function tCritical90(df: number): number {
  const z = 1.6449;
  if (!Number.isFinite(df) || df <= 0) return z;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
}

export type EvidenceLevel = "strong" | "moderate" | "weak" | "none" | "insufficient";

export interface EffectResult {
  /** Diferença durante − antes, na unidade da métrica. */
  diff: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  /** Hedges g com sinal "favorável" (positivo = melhora, já considerando métricas inversas). */
  effectSize: number | null;
  evidence: EvidenceLevel;
  /** A média durante saiu da faixa de variação natural (média ± 1 desvio) do período anterior? */
  outsideNaturalRange: boolean | null;
}

export function effect(before: Describe, during: Describe, inverse: boolean): EffectResult {
  const empty: EffectResult = { diff: null, ciLow: null, ciHigh: null, effectSize: null, evidence: "insufficient", outsideNaturalRange: null };
  if (before.n < 3 || during.n < 3 || before.mean === null || during.mean === null) return empty;
  const s1 = before.sd ?? 0;
  const s2 = during.sd ?? 0;
  const diff = during.mean - before.mean;

  const pooled = Math.sqrt(((before.n - 1) * s1 ** 2 + (during.n - 1) * s2 ** 2) / (before.n + during.n - 2));
  const j = 1 - 3 / (4 * (before.n + during.n) - 9);
  // Sem variação nenhuma nos dois períodos: qualquer diferença é "infinita"; trata como efeito grande só se houver diferença.
  const rawG = pooled > 0 ? (diff / pooled) * j : diff === 0 ? 0 : Math.sign(diff) * 2;
  const g = inverse ? -rawG : rawG;

  const v1 = s1 ** 2 / before.n;
  const v2 = s2 ** 2 / during.n;
  const se = Math.sqrt(v1 + v2);
  const df = se > 0 ? (v1 + v2) ** 2 / ((v1 ** 2) / Math.max(before.n - 1, 1) + (v2 ** 2) / Math.max(during.n - 1, 1)) : before.n + during.n - 2;
  const half = tCritical90(df) * se;
  const ciLow = diff - half;
  const ciHigh = diff + half;
  const ciExcludesZero = ciLow > 0 || ciHigh < 0;

  const abs = Math.abs(g);
  let evidence: EvidenceLevel;
  if (abs < 0.2) evidence = "none";
  else if (!ciExcludesZero) evidence = "weak";
  else if (abs >= 0.8 && Math.min(before.n, during.n) >= 7) evidence = "strong";
  else if (abs >= 0.5) evidence = "moderate";
  else evidence = "weak";

  const outsideNaturalRange = before.sd !== null ? Math.abs(diff) > before.sd : null;
  return { diff, ciLow, ciHigh, effectSize: Math.round(g * 100) / 100, evidence, outsideNaturalRange };
}

/**
 * Duração recomendada para enxergar uma mudança de ~15% com a variabilidade
 * real do usuário (aproximação de poder 80%, α 5% unilateral). Limitada a
 * 7–42 dias e arredondada para semanas inteiras.
 */
export function recommendedDuration(mean: number | null, sd: number | null): number | null {
  if (mean === null || sd === null || mean === 0) return null;
  const effectAbs = Math.abs(mean) * 0.15;
  const n = 2 * ((2.486 * sd) / effectAbs) ** 2;
  const days = Math.min(42, Math.max(7, Math.ceil(n)));
  return Math.ceil(days / 7) * 7;
}
