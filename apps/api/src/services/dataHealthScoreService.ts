/**
 * Data Health Score — média ponderada das 6 dimensões de qualidade.
 * Puro cálculo determinístico, nunca IA: a fórmula fica visível
 * (SCORE_FORMULA_EXPLANATION) para o tooltip "Como calculamos?" no
 * front, exatamente como o resultado que ela produz.
 */

export type DataHealthDimension = "completeness" | "consistency" | "integrity" | "freshness" | "sync" | "history";

export type DataHealthDimensionScores = Record<DataHealthDimension, number>;

export const DIMENSION_WEIGHTS: DataHealthDimensionScores = {
  completeness: 0.25,
  consistency: 0.2,
  integrity: 0.2,
  freshness: 0.15,
  sync: 0.1,
  history: 0.1,
};

export const DIMENSION_LABEL: Record<DataHealthDimension, string> = {
  completeness: "Completude",
  consistency: "Consistência",
  integrity: "Integridade",
  freshness: "Atualização",
  sync: "Sincronização",
  history: "Histórico",
};

export type DataHealthLabel = "Crítico" | "Atenção" | "Bom" | "Saudável";

export function classifyScore(score: number): DataHealthLabel {
  if (score >= 90) return "Saudável";
  if (score >= 75) return "Bom";
  if (score >= 60) return "Atenção";
  return "Crítico";
}

export function computeDataHealthScore(dimensions: DataHealthDimensionScores): { score: number; label: DataHealthLabel } {
  const raw = (Object.keys(DIMENSION_WEIGHTS) as DataHealthDimension[]).reduce(
    (sum, dim) => sum + dimensions[dim] * DIMENSION_WEIGHTS[dim],
    0
  );
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, label: classifyScore(score) };
}

export const SCORE_FORMULA_EXPLANATION =
  "Média ponderada de 6 dimensões calculadas a partir dos seus dados reais: " +
  "Completude 25% + Consistência 20% + Integridade 20% + Atualização 15% + Sincronização 10% + Histórico 10%. " +
  "0–59 Crítico · 60–74 Atenção · 75–89 Bom · 90–100 Saudável.";
