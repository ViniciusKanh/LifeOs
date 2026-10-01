import type { ExperimentMetricKey, ExperimentVerificationRule } from "@/types";

/**
 * "Como você vai registrar" — plano diário derivado da configuração do
 * experimento (regra de negócio fora da UI). Diz ONDE cada dado é registrado
 * (o módulo de origem, para nunca duplicar dado) e QUANDO costuma fazer
 * sentido registrar. Determinístico: não depende de IA.
 */

export interface TrackingStep {
  key: string;
  emoji: string;
  title: string;
  detail: string;
  when: string;
  path: string | null;
}

interface MetricInfo {
  label: string;
  sourcePath: string;
  sourceLabel: string;
}

const WHEN: Partial<Record<ExperimentMetricKey, string>> = {
  sleep_duration: "Ao acordar",
  sleep_quality: "Ao acordar",
  energy: "No fim da tarde",
  mood: "No fim do dia",
  stress: "No fim do dia",
  water_ml: "A cada copo/garrafa",
  focus_minutes: "Ao iniciar uma sessão",
  focus_sessions: "Ao iniciar uma sessão",
  exercise_minutes: "Logo após o treino",
  exercise_sessions: "Logo após o treino",
  reading_pages: "Ao fechar o livro",
  reading_minutes: "Ao fechar o livro",
  study_minutes: "Ao terminar o estudo",
  tasks_completed: "Ao concluir cada tarefa",
  habit_consistency: "Quando cumprir o hábito",
};

const SOURCE_EMOJI: Record<string, string> = {
  "/saude": "❤️",
  "/foco": "🎯",
  "/biblioteca": "📚",
  "/educacao": "🎓",
  "/tarefas": "✅",
  "/habitos": "🔁",
};

const RULE_TEXT: Record<ExperimentVerificationRule, (v: string) => string> = {
  sleep_before: (v) => `Deitar antes das ${v || "23:00"}`,
  water_target: (v) => `Beber pelo menos ${v ? `${(Number(v) / 1000).toLocaleString("pt-BR")} L` : "a meta"} de água`,
  focus_minimum: (v) => `Fazer ${v || "?"} min de foco`,
  reading_pages_minimum: (v) => `Ler ${v || "?"} páginas`,
  exercise_minimum: (v) => `Fazer ${v || "?"} min de exercício`,
  study_minimum: (v) => `Estudar ${v || "?"} min`,
  habit_completion: () => "Cumprir o hábito vinculado",
};

export function buildTrackingPlan(input: {
  primaryMetric: ExperimentMetricKey | "";
  secondaryMetrics: ExperimentMetricKey[];
  verificationType: "automatic" | "manual";
  verificationRule: ExperimentVerificationRule | "";
  configValue: string;
  dailyAction?: string;
  metricInfo: (key: ExperimentMetricKey) => MetricInfo | undefined;
}): TrackingStep[] {
  const steps: TrackingStep[] = [];
  const behavior =
    input.verificationType === "automatic" && input.verificationRule
      ? RULE_TEXT[input.verificationRule](input.configValue)
      : input.dailyAction?.trim() || "Seguir o comportamento do experimento";

  steps.push(
    input.verificationType === "automatic" && input.verificationRule
      ? {
          key: "behavior",
          emoji: "🤖",
          title: behavior,
          detail: "Você não precisa marcar nada: o LifeOS confere sozinho pelo dado que você registrar abaixo.",
          when: "Todo dia",
          path: null,
        }
      : {
          key: "behavior",
          emoji: "✋",
          title: behavior,
          detail: 'No fim do dia, toque em "Cumpri" ou "Não cumpri" no check-in de Experimentos (ou conte como foi e deixe a IA preencher).',
          when: "Todo dia, à noite",
          path: "/experimentos",
        }
  );

  // Um passo por módulo de origem — agrupa métricas registradas no mesmo lugar.
  const keys = [input.primaryMetric, ...input.secondaryMetrics].filter((k): k is ExperimentMetricKey => !!k);
  const bySource = new Map<string, { info: MetricInfo; keys: ExperimentMetricKey[] }>();
  for (const k of keys) {
    const info = input.metricInfo(k);
    if (!info) continue;
    const entry = bySource.get(info.sourcePath) ?? { info, keys: [] };
    entry.keys.push(k);
    bySource.set(info.sourcePath, entry);
  }
  for (const [path, { info, keys: ks }] of bySource) {
    const labels = ks.map((k) => input.metricInfo(k)?.label.toLowerCase() ?? k);
    steps.push({
      key: `src-${path}`,
      emoji: SOURCE_EMOJI[path] ?? "📝",
      title: `Registrar ${labels.join(", ")}`,
      detail: `Em ${info.sourceLabel}. ${ks.includes(input.primaryMetric as ExperimentMetricKey) ? "É a métrica principal — sem esse registro, a análise não acontece." : "Métrica secundária: ajuda a ver efeitos colaterais."}`,
      when: WHEN[ks[0]] ?? "Todo dia",
      path,
    });
  }

  steps.push({
    key: "reflect",
    emoji: "💬",
    title: "Contar como foi (opcional)",
    detail: "Uma frase sobre o dia vira observação — e o Copilot usa isso nos insights.",
    when: "Quando quiser",
    path: "/experimentos",
  });
  return steps;
}
