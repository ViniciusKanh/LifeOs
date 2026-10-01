import { useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, AlertTriangle, Sparkles, Microscope } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import { useExperimentBaselinePreview, useExperimentMetricsCatalog, useExperimentVerificationRules } from "@/hooks/useExperiments";
import { useHabits } from "@/hooks/useHabits";
import { CATEGORY_LABEL } from "./experimentDisplay";
import type { CreateExperimentInput, ExperimentAISuggestion, ExperimentCategory, ExperimentMetricKey, ExperimentVerificationRule } from "@/types";

const DURATION_OPTIONS = [7, 14, 21, 28, 42] as const;
const STEP_TITLES = ["Comece por um modelo", "O que você quer testar?", "Qual é sua hipótese?", "O que vamos medir?", "Defina o período", "Comportamento a cumprir", "Critério de sucesso", "Resumo"];

/**
 * Modelos prontos (conteúdo do produto, não dados do usuário): cada um já
 * vem com hipótese, métricas, verificação e critério coerentes entre si.
 */
interface ExperimentTemplate {
  id: string;
  emoji: string;
  title: string;
  category: ExperimentCategory;
  hypothesis: string;
  primaryMetric: ExperimentMetricKey;
  secondaryMetrics: ExperimentMetricKey[];
  durationDays: number;
  verificationType: "automatic" | "manual";
  verificationRule?: ExperimentVerificationRule;
  configValue?: string;
  successCriteriaType: "consistency" | "metric_change" | "none";
  successCriteriaValue?: string;
}

const TEMPLATES: ExperimentTemplate[] = [
  { id: "sleep23", emoji: "🌙", title: "Dormir antes das 23h", category: "sono", hypothesis: "Se eu dormir antes das 23h, durmo mais e acordo com mais energia.", primaryMetric: "sleep_duration", secondaryMetrics: ["energy", "mood"], durationDays: 14, verificationType: "automatic", verificationRule: "sleep_before", configValue: "23:00", successCriteriaType: "consistency", successCriteriaValue: "80" },
  { id: "water", emoji: "💧", title: "2,5 L de água por dia", category: "hidratacao", hypothesis: "Bebendo 2,5 L de água por dia, minha energia ao longo do dia melhora.", primaryMetric: "energy", secondaryMetrics: ["water_ml", "mood"], durationDays: 14, verificationType: "automatic", verificationRule: "water_target", configValue: "2500", successCriteriaType: "consistency", successCriteriaValue: "80" },
  { id: "focus", emoji: "🎯", title: "50 min de foco profundo", category: "focus", hypothesis: "Fazendo 50 minutos de foco por dia, concluo mais tarefas.", primaryMetric: "tasks_completed", secondaryMetrics: ["focus_minutes", "stress"], durationDays: 21, verificationType: "automatic", verificationRule: "focus_minimum", configValue: "50", successCriteriaType: "metric_change", successCriteriaValue: "15" },
  { id: "exercise", emoji: "🏃", title: "30 min de exercício", category: "exercicio", hypothesis: "Me exercitando 30 minutos por dia, meu humor e meu sono melhoram.", primaryMetric: "mood", secondaryMetrics: ["energy", "sleep_quality"], durationDays: 21, verificationType: "automatic", verificationRule: "exercise_minimum", configValue: "30", successCriteriaType: "consistency", successCriteriaValue: "70" },
  { id: "reading", emoji: "📚", title: "Ler 20 páginas por dia", category: "leitura", hypothesis: "Lendo 20 páginas por dia, termino mais livros e fico menos estressado.", primaryMetric: "reading_pages", secondaryMetrics: ["stress", "mood"], durationDays: 21, verificationType: "automatic", verificationRule: "reading_pages_minimum", configValue: "20", successCriteriaType: "consistency", successCriteriaValue: "80" },
  { id: "study", emoji: "🎓", title: "1 hora de estudo diário", category: "educacao", hypothesis: "Estudando 1 hora por dia, mantenho o ritmo nas disciplinas.", primaryMetric: "study_minutes", secondaryMetrics: ["focus_minutes", "energy"], durationDays: 14, verificationType: "automatic", verificationRule: "study_minimum", configValue: "60", successCriteriaType: "consistency", successCriteriaValue: "80" },
  { id: "screens", emoji: "📵", title: "Sem telas 1h antes de dormir", category: "sono", hypothesis: "Sem telas na última hora antes de dormir, meu sono fica melhor.", primaryMetric: "sleep_quality", secondaryMetrics: ["sleep_duration", "energy"], durationDays: 14, verificationType: "manual", successCriteriaType: "consistency", successCriteriaValue: "80" },
  { id: "meditate", emoji: "🧘", title: "Meditar 10 minutos", category: "bem_estar", hypothesis: "Meditando 10 minutos por dia, meu estresse diminui.", primaryMetric: "stress", secondaryMetrics: ["mood", "energy"], durationDays: 21, verificationType: "manual", successCriteriaType: "metric_change", successCriteriaValue: "15" },
];

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
  // Vindo de uma sugestão da IA, o modelo já está escolhido: pula a galeria.
  const [step, setStep] = useState(initialSuggestion ? 1 : 0);
  const [state, setState] = useState<WizardState>(() => initialState(initialSuggestion));
  const [error, setError] = useState<string | null>(null);

  const { data: catalog = [] } = useExperimentMetricsCatalog();
  const { data: rules = [] } = useExperimentVerificationRules();
  const { habits } = useHabits();

  const endDate = state.durationDays === -1 ? state.customEndDate : addDays(state.startDate, state.durationDays - 1);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => setState((s) => ({ ...s, [key]: value }));

  const applyTemplate = (t: ExperimentTemplate) => {
    setState((s) => ({
      ...s,
      title: t.title,
      category: t.category,
      hypothesis: t.hypothesis,
      primaryMetric: t.primaryMetric,
      secondaryMetrics: t.secondaryMetrics,
      durationDays: t.durationDays,
      verificationType: t.verificationType,
      verificationRule: t.verificationRule ?? "",
      configValue: t.configValue ?? "",
      successCriteriaType: t.successCriteriaType,
      successCriteriaValue: t.successCriteriaValue ?? "",
    }));
    setStep(1);
  };

  const preview = useExperimentBaselinePreview(state.primaryMetric || null, state.linkedHabitId || null);
  const recommended = preview.data?.recommendedDurationDays ?? null;
  const baselineFrom = addDays(state.startDate, -((endDate ? Math.round((Date.parse(endDate) - Date.parse(state.startDate)) / 86_400_000) : 0) + 1));
  const baselineTo = addDays(state.startDate, -1);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return true;
      case 1: return state.title.trim().length > 0;
      case 2: return true; // hipótese é opcional
      case 4: return !!state.startDate && !!endDate && endDate > state.startDate;
      case 3: return !!state.primaryMetric;
      case 5: return state.verificationType === "manual" || (!!state.verificationRule && (state.verificationRule !== "habit_completion" || !!state.linkedHabitId));
      case 6: return true;
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
            <div>
              <p className="text-xs text-slate mb-3">Escolha um modelo pronto — tudo vem preenchido e você ajusta nas próximas etapas.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-left rounded-xl border border-paper-border dark:border-ink-border p-3 hover:border-cat-purple/60 hover:bg-cat-purple/[0.04] transition-colors"
                  >
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <span className="text-lg leading-none">{t.emoji}</span> {t.title}
                    </p>
                    <p className="text-[11px] text-slate mt-1 line-clamp-2">{t.hypothesis}</p>
                    <p className="text-[10px] text-cat-purple mt-1.5">
                      {t.durationDays} dias · {t.verificationType === "automatic" ? "verificação automática" : "check-in manual"}
                    </p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-3 w-full rounded-xl border border-dashed border-paper-border dark:border-ink-border p-3 text-sm font-medium text-slate hover:text-inherit hover:border-cat-purple/60"
              >
                <Sparkles size={14} className="inline mr-1.5 -mt-0.5" /> Começar do zero
              </button>
            </div>
          )}

          {step === 1 && (
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

          {step === 2 && (
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

          {step === 4 && (
            <>
              <Field label="Data inicial" type="date" value={state.startDate} onChange={(e) => set("startDate", e.target.value)} />
              {recommended && (
                <button
                  type="button"
                  onClick={() => set("durationDays", recommended)}
                  className="w-full text-left rounded-xl border border-cat-purple/30 bg-cat-purple/[0.05] px-3 py-2.5 text-xs hover:bg-cat-purple/10"
                >
                  <span className="font-semibold text-cat-purple">Recomendado para você: {recommended} dias.</span>{" "}
                  <span className="text-slate">Calculado pela variação real de {preview.data?.label.toLowerCase()} nos seus registros, para enxergar uma mudança de ~15%.</span>
                </button>
              )}
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
                {state.primaryMetric && (preview.isLoading ? (
                  <div className="mt-2 h-20 rounded-xl bg-paper dark:bg-ink animate-pulse" />
                ) : preview.data ? (
                  <div className="mt-2 rounded-xl border border-cat-purple/25 bg-cat-purple/[0.04] p-3">
                    <p className="text-[11px] font-semibold text-cat-purple flex items-center gap-1.5">
                      <Microscope size={13} /> Seus últimos {preview.data.days} dias
                    </p>
                    <div className="flex items-end gap-3 mt-1.5">
                      <div>
                        <p className="font-display font-bold text-lg leading-none">
                          {preview.data.mean === null ? "—" : `${String(preview.data.mean).replace(".", ",")}${preview.data.unit ? ` ${preview.data.unit}` : ""}`}
                        </p>
                        <p className="text-[10px] text-slate">média · {preview.data.daysWithData} dia(s) com registro</p>
                      </div>
                      <div className="flex-1 flex items-end gap-px h-8" aria-hidden>
                        {(() => {
                          const vals = preview.data.sparkline;
                          const max = Math.max(0.0001, ...vals.map((v) => Math.abs(v ?? 0)));
                          return vals.map((v, i) => (
                            <span key={i} className={v === null ? "flex-1 h-px bg-slate/30" : "flex-1 rounded-sm bg-cat-purple/60"} style={v === null ? undefined : { height: `${Math.max(8, (Math.abs(v) / max) * 100)}%` }} />
                          ));
                        })()}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate mt-1.5">{preview.data.message}</p>
                  </div>
                ) : null)}
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

          {step === 5 && (
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

          {step === 6 && (
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

          {step === 7 && (
            <div className="space-y-2 text-sm">
              <p><span className="text-slate">Nome: </span>{state.title}</p>
              {state.hypothesis && <p><span className="text-slate">Hipótese: </span>{state.hypothesis}</p>}
              <p><span className="text-slate">Período: </span>{state.startDate} → {endDate} ({state.durationDays === -1 ? "personalizado" : `${state.durationDays} dias`})</p>
              <p><span className="text-slate">Métrica principal: </span>{catalog.find((m) => m.key === state.primaryMetric)?.label ?? state.primaryMetric}</p>
              <p><span className="text-slate">Comportamento: </span>{state.verificationType === "automatic" ? "Verificação automática" : "Check-in manual"}</p>
              <p><span className="text-slate">Critério de sucesso: </span>{state.successCriteriaType === "none" ? "Nenhum" : `${state.successCriteriaType === "consistency" ? "Consistência" : "Mudança de métrica"} ≥ ${state.successCriteriaValue || "?"}%`}</p>
              <div className="mt-3 rounded-xl bg-paper dark:bg-ink p-3 text-xs text-slate space-y-1">
                <p className="font-semibold text-inherit flex items-center gap-1.5"><Microscope size={13} className="text-cat-purple" /> Como o LifeOS vai analisar</p>
                <p>
                  Vamos comparar {catalog.find((m) => m.key === state.primaryMetric)?.label.toLowerCase() ?? "a métrica principal"} durante o experimento com o período anterior de mesma duração
                  ({baselineFrom.split("-").reverse().join("/")} a {baselineTo.split("-").reverse().join("/")}), usando só os seus registros reais.
                </p>
                <p>Também comparamos os dias em que você cumpriu o comportamento com os que não cumpriu, semana a semana.</p>
                {preview.data && preview.data.daysWithData < 5 && (
                  <p className="text-signal-deep">Há poucos registros recentes dessa métrica — registre todos os dias para a análise ficar confiável.</p>
                )}
              </div>
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
