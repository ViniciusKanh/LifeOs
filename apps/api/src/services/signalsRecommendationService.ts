/**
 * Signals — "Sugestão do LifeOS".
 *
 * Regra determinística primeiro: sempre existe uma sugestão baseada em
 * regras simples e explicáveis sobre os cards/padrões já calculados.
 * O Gemini é só um COMPLEMENTO opcional (texto mais natural) sobre os
 * mesmos dados agregados — nunca substitui a regra, nunca inventa
 * métrica, nunca executa nada sozinho (é sempre texto para o usuário
 * ler, sem ação automática).
 */
import { getGeminiConfig, generateText } from "./geminiService.js";
import type { SignalCard } from "./signalsService.js";
import type { DetectedPattern } from "./signalsPatternService.js";
import type { RadarDimension } from "./signalsScoreService.js";

export interface SignalsRecommendation {
  source: "rule" | "ai";
  title: string;
  message: string;
}

function ruleBasedRecommendation(signals: SignalCard[], patterns: DetectedPattern[]): SignalsRecommendation {
  const attention = signals.find((s) => s.status === "attention");
  if (attention) {
    return {
      source: "rule",
      title: `Atenção em ${attention.label}`,
      message: `${attention.description} Pode valer a pena observar esse sinal nos próximos dias.`,
    };
  }

  const negativeAssoc = patterns.find((p) => p.type === "negative_association");
  if (negativeAssoc) {
    return { source: "rule", title: "Associação para observar", message: negativeAssoc.description };
  }

  const positiveTrend = patterns.find((p) => p.type === "trend");
  if (positiveTrend) {
    return { source: "rule", title: "Tendência positiva", message: positiveTrend.description };
  }

  const withData = signals.filter((s) => s.status === "ok" || s.status === "attention").length;
  if (withData < 3) {
    return {
      source: "rule",
      title: "Poucos registros neste período",
      message: "Ainda não há dados suficientes na maioria dos sinais deste período para uma sugestão mais específica. Registrar sono, humor e foco com mais regularidade ajuda o Signals a detectar padrões reais.",
    };
  }

  return {
    source: "rule",
    title: "Sinais estáveis",
    message: "Os sinais registrados neste período estão dentro do padrão observado, sem alertas nem tendências fortes.",
  };
}

const SAFETY_PREFIX = `Você é o LifeOS Copilot, analisando sinais pessoais agregados (nunca dados brutos individuais) de um usuário do LifeOS.
Regras obrigatórias:
- Nunca afirme causalidade (não use "causou", "provou", "demonstrou cientificamente"); use "sugere", "associação", "tendência", "durante este período".
- Nunca invente números além dos fornecidos abaixo.
- Nunca dê diagnóstico médico.
- Responda em português, em no máximo 2 frases curtas, tom observacional e prático.
`;

export async function complementWithAI(base: SignalsRecommendation, signals: SignalCard[], radar: RadarDimension[]): Promise<SignalsRecommendation> {
  const config = await getGeminiConfig();
  if (!config) return base;

  const dataSummary = signals
    .filter((s) => s.status !== "not_connected")
    .map((s) => `${s.label}: ${s.value ?? "sem dado"}${s.unit ?? ""} (${s.comparisonLabel ?? "sem comparação"})`)
    .join("; ");
  const radarSummary = radar.map((r) => `${r.label}: ${r.value ?? "sem dado"}`).join("; ");

  const prompt = `${SAFETY_PREFIX}\nSugestão-base (regra determinística): "${base.title}: ${base.message}"\nSinais do período: ${dataSummary}\nRadar (0-100): ${radarSummary}\n\nReescreva a sugestão-base de forma mais natural, mantendo o mesmo sentido e sem adicionar fatos novos.`;

  const result = await generateText(prompt, config);
  if (!result.ok) return base;
  return { source: "ai", title: base.title, message: result.text };
}

export function buildRecommendation(signals: SignalCard[], patterns: DetectedPattern[], _radar: RadarDimension[]): SignalsRecommendation {
  // Fica síncrono e determinístico no agregador principal — o complemento
  // opcional de IA é chamado à parte (endpoint dedicado), nunca bloqueando
  // o carregamento do dashboard principal com uma chamada de rede externa.
  return ruleBasedRecommendation(signals, patterns);
}
