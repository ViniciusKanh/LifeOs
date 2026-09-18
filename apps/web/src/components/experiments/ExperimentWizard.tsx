import { useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { useExperimentMetricsCatalog, useExperimentVerificationRules } from "@/hooks/useExperiments";
import { useHabits } from "@/hooks/useHabits";
import { CATEGORY_LABEL } from "./experimentDisplay";
import type { CreateExperimentInput, ExperimentAISuggestion, ExperimentCategory, ExperimentMetricKey, ExperimentVerificationRule } from "@/types";

const DURATION_OPTIONS = [7, 14, 21, 30] as const;
const STEP_TITLES = ["O que você quer testar?", "Qual é sua hipótese?", "Defina o período", "O que vamos medir?", "Comportamento a cumprir", "Critério de sucesso", "Resumo"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface WizardState {
  title: string;
  category: ExperimentCategory;
  description: string;
  motivation: string;
  hypothesis: string;
  startDate: string;
  durationDays: number;
  customEndDate: string;
  primaryMetric: ExperimentMetricKey | "";
  secondaryMetrics: ExperimentMetricKey[];
  linkedHabitId: string;
  verificationType: "automatic" | "manual";
  verificationRule: ExperimentVerificationRule | "";
  configValue: string;
  successCriteriaType: "consistency" | "metric_change" | "none";
  successCriteriaValue: string;
}

function initialState(suggestion?: ExperimentAISuggestion | null): WizardState {
  return {
    title: suggestion?.title ?? "",
    category: "personalizado",
    description: "",
    motivation: suggestion?.motivation ?? "",
    hypothesis: suggestion?.hypothesis ?? "",
    startDate: today(),
    durationDays: suggestion?.durationDays ?? 14,
    customEndDate: "",
    primaryMetric: suggestion?.primaryMetric ?? "",
    secondaryMetrics: [],
    linkedHabitId: "",
    verificationType: "manual",
    verificationRule: "",
    configValue: "",
    successCriteriaType: "none",
    successCriteriaValue: "",
  };
}

/** Wizard de criação em etapas (seções 23-30) — nunca um formulário único gigante. */
export function ExperimentWizard({
  onClose,
  onSubmit,
  isSubmitting,
  initialSuggestion,
}: {
  onClose: () => void;
  onSubmit: (input: CreateExperimentInput) => Promise<unknown>;
  isSubmitting?: boolean;
  initialSuggestion?: ExperimentAISuggestion | null;
}) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => initialState(initialSuggestion));
  const [error, setError] = useState<string | null>(null);

  const { data: catalog = [] } = useExperimentMetricsCatalog();
  const { data: rules = [] } = useExperimentVerificationRules();
  const { habits } = useHabits();

  const endDate = state.durationDays === -1 ? state.customEndDate : addDays(state.startDate, state.durationDays - 1);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => setState((s) => ({ ...s, [key]: value }));

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return state.title.trim().length > 0;
      case 1: return true; // hipótese é opcional
      case 2: return !!state.startDate && !!endDate && endDate > state.startDate;
      case 3: return !!state.primaryMetric;
      case 4: return state.verificationType === "manual" || (!!state.verificationRule && (state.verificationRule !== "habit_completion" || !!state.linkedHabitId));
      case 5: return true;
      default: return true;
    }
  }, [step, state, endDate]);

  const handleSubmit = async () => {
    if (!state.primaryMetric) return;
    setError(null);
    try {
      const verificationConfig: Record<string, unknown> | null = (() => {
        if (state.verificationType !== "automatic" || !state.verificationRule) return null;
        if (state.verificationRule === "sleep_before") return { beforeTime: state.configValue || "23:00" };
        if (state.verificationRule === "water_target") return { targetMl: Number(state.configValue) || 3000 };
        if (state.verificationRule === "focus_minimum") return { minMinutes: Number(state.configValue) || 25 };
        if (state.verificationRule === "reading_pages_minimum") return { minPages: Number(state.configValue) || 20 };
        if (state.verificationRule === "exercise_minimum") return { minMinutes: Number(state.configValue) || 30 };
        if (state.verificationRule === "study_minimum") return { minMinutes: Number(state.configValue) || 60 };
        return null;
      })();

      const input: CreateExperimentInput = {
        title: state.title.trim(),
        description: state.description.trim() || undefined,
        category: state.category,
        hypothesis: state.hypothesis.trim() || undefined,
        motivation: state.motivation.trim() || undefined,
        startDate: state.startDate,
        endDate,
        primaryMetric: state.primaryMetric,
        secondaryMetrics: state.secondaryMetrics,
        linkedHabitId: state.linkedHabitId || undefined,
        verificationType: state.verificationType,
        verificationRule: state.verificationType === "automatic" && state.verificationRule ? state.verificationRule : undefined,
        verificationConfig: verificationConfig ?? undefined,
        successCriteriaType: state.successCriteriaType,
        successCriteriaValue: state.successCriteriaValue ? Number(state.successCriteriaValue) : undefined,
      };
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o experimento.");
    }
  };

  const primaryDef = catalog.find((m) => m.key === state.primaryMetric);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <div>
            <p className="text-[11px] text-slate">Etapa {step + 1} de {STEP_TITLES.length}</p>
            <p className="text-sm font-semibold">{STEP_TITLES[step]}</p>
          </div>
          <button onClick={onClose} className="text-slate" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="h-1 bg-paper-border dark:bg-ink-border">
          <div className="h-full bg-cat-purple transition-all" style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }} />
        </div>

        <div className="p-5 md:p-6 space-y-4 min-h-[280px]">
          {step === 0 && (
            <>
              <Field label="Nome do experimento" value={state.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Dormir antes das 23h" />
              <div>
                <label className="text-xs text-slate">Categoria</label>
                <select
                  value={state.category}
                  onChange={(e) => set("category", e.target.value as ExperimentCategory)}
                  className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate">Descrição</label>
                <textarea
                  value={state.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={2}
                  placeholder="Por que você quer testar isso?"
                  className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="text-xs text-slate">Hipótese</label>
                <textarea
                  value={state.hypothesis}
                  onChange={(e) => set("hypothesis", e.target.value)}
                  rows={3}
                  placeholder='Ex.: "Se eu dormir antes das 23h, minha energia e foco durante o dia tendem a melhorar."'
                  className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
                />
                <p className="text-[11px] text-slate mt-1.5">Não precisa ser científica. Apenas descreva o que você espera observar.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Data inicial" type="date" value={state.startDate} onChange={(e) => set("startDate", e.target.value)} />
              <div>
                <label className="text-xs text-slate">Duração</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set("durationDays", d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${state.durationDays === d ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border"}`}
                    >
                      {d} dias
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => set("durationDays", -1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${state.durationDays === -1 ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border"}`}
                  >
                    Personalizado
                  </button>
                </div>
              </div>
              {state.durationDays === -1 ? (
                <Field label="Data final" type="date" value={state.customEndDate} min={state.startDate} onChange={(e) => set("customEndDate", e.target.value)} />
              ) : (
                <p className="text-xs text-slate">Termina em {endDate.slice(8, 10)}/{endDate.slice(5, 7)}/{endDate.slice(0, 4)}.</p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="text-xs text-slate">Métrica principal</label>
                <select
                  value={state.primaryMetric}
                  onChange={(e) => set("primaryMetric", e.target.value as ExperimentMetricKey)}
                  className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
                >
                  <option value="">Selecione...</option>
                  {catalog.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}{!m.hasHistory ? " (sem histórico ainda)" : ""}
                    </option>
                  ))}
                </select>
                {primaryDef && !primaryDef.hasHistory && (
                  <p className="flex items-start gap-1.5 text-[11px] text-signal-deep mt-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Você ainda não tem histórico dessa métrica — a comparação "antes" ficará indisponível até haver dados.
                  </p>
                )}
                {primaryDef?.requiresHabit && (
                  <div className="mt-2">
                    <label className="text-xs text-slate">Hábito</label>
                    <select
                      value={state.linkedHabitId}
                      onChange={(e) => set("linkedHabitId", e.target.value)}
                      className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
                    >
                      <option value="">Selecione um hábito...</option>
                      {habits.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-slate">Métricas secundárias</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {catalog.filter((m) => m.key !== state.primaryMetric && !m.requiresHabit).map((m) => {
                    const active = state.secondaryMetrics.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => set("secondaryMetrics", active ? state.secondaryMetrics.filter((k) => k !== m.key) : [...state.secondaryMetrics, m.key])}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${active ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border text-slate"}`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-xs text-slate">Qual comportamento você quer cumprir todos os dias?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set("verificationType", "automatic")}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border ${state.verificationType === "automatic" ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border"}`}
                >
                  Automático (o LifeOS já sabe)
                </button>
                <button
                  type="button"
                  onClick={() => set("verificationType", "manual")}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border ${state.verificationType === "manual" ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border"}`}
                >
                  Manual (eu confirmo)
                </button>
              </div>

              {state.verificationType === "automatic" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate">Regra</label>
                    <select
                      value={state.verificationRule}
                      onChange={(e) => set("verificationRule", e.target.value as ExperimentVerificationRule)}
                      className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
                    >
                      <option value="">Selecione...</option>
                      {rules.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  {state.verificationRule && state.verificationRule !== "habit_completion" && (
                    <Field
                      label={rules.find((r) => r.key === state.verificationRule)?.configLabel ?? "Valor"}
                      value={state.configValue}
                      onChange={(e) => set("configValue", e.target.value)}
                      placeholder={state.verificationRule === "sleep_before" ? "23:00" : undefined}
                      type={state.verificationRule === "sleep_before" ? "time" : "number"}
                    />
                  )}
                  {state.verificationRule === "habit_completion" && (
                    <div>
                      <label className="text-xs text-slate">Hábito</label>
                      <select
                        value={state.linkedHabitId}
                        onChange={(e) => set("linkedHabitId", e.target.value)}
                        className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
                      >
                        <option value="">Selecione um hábito...</option>
                        {habits.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {state.verificationType === "manual" && (
                <p className="text-xs text-slate">Você vai confirmar diariamente na tela do experimento se seguiu o comportamento.</p>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <p className="text-xs text-slate">Critério de sucesso (opcional).</p>
              <div className="grid grid-cols-1 gap-2">
                {([
                  ["none", "Sem critério definido"],
                  ["consistency", "Por consistência (% de dias cumpridos)"],
                  ["metric_change", "Por mudança de métrica (% de variação)"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("successCriteriaType", value)}
                    className={`text-left px-3 py-2 rounded-lg text-xs font-medium border ${state.successCriteriaType === value ? "border-cat-purple bg-cat-purple/10 text-cat-purple" : "border-paper-border dark:border-ink-border"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state.successCriteriaType !== "none" && (
                <Field
                  label={state.successCriteriaType === "consistency" ? "Mínimo de dias cumpridos (%)" : "Mudança mínima na métrica (%)"}
                  type="number"
                  value={state.successCriteriaValue}
                  onChange={(e) => set("successCriteriaValue", e.target.value)}
                  placeholder="80"
                />
              )}
            </>
          )}

          {step === 6 && (
            <div className="space-y-2 text-sm">
              <p><span className="text-slate">Nome: </span>{state.title}</p>
              {state.hypothesis && <p><span className="text-slate">Hipótese: </span>{state.hypothesis}</p>}
              <p><span className="text-slate">Período: </span>{state.startDate} → {endDate} ({state.durationDays === -1 ? "personalizado" : `${state.durationDays} dias`})</p>
              <p><span className="text-slate">Métrica principal: </span>{catalog.find((m) => m.key === state.primaryMetric)?.label ?? state.primaryMetric}</p>
              <p><span className="text-slate">Comportamento: </span>{state.verificationType === "automatic" ? "Verificação automática" : "Check-in manual"}</p>
              <p><span className="text-slate">Critério de sucesso: </span>{state.successCriteriaType === "none" ? "Nenhum" : `${state.successCriteriaType === "consistency" ? "Consistência" : "Mudança de métrica"} ≥ ${state.successCriteriaValue || "?"}%`}</p>
              {error && <p className="text-drop text-xs">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 px-5 md:px-6 py-4 border-t border-paper-border dark:border-ink-border sticky bottom-0 bg-paper-raised dark:bg-ink-raised">
          <Button variant="secondary" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>
            <ChevronLeft size={15} /> {step === 0 ? "Cancelar" : "Voltar"}
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
              Avançar <ChevronRight size={15} />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              Iniciar experimento
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
