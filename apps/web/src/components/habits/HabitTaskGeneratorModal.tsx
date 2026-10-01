import { useMemo, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { CalendarRange, Clock, ListChecks, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/Switch";
import { useProjects } from "@/hooks/useProjects";
import { localIsoDate } from "@/utils/dashboardMetrics";
import type { Habit, HabitTaskGenerationInput, HabitTaskGenerationResult, TaskPriority } from "@/types";

/**
 * Gerador de tarefas a partir de hábitos (parametrizável). Cada tarefa
 * nasce com início e término no próprio dia, carga estimada (30 min por
 * padrão) e descrição indicando a origem — o texto final é montado no
 * backend (habitTaskDescription), aqui só há a pré-visualização.
 */

const MAX_DAYS = 31;
const LOAD_PRESETS = [15, 30, 45, 60];

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIsoDate(d);
}

function daysInclusive(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000) + 1;
}

function formatBr(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const FREQ_LABEL: Record<Habit["frequency"], string> = {
  daily: "diário",
  specific_days: "dias específicos",
  times_per_week: "x por semana",
  weekly: "semanal",
  monthly: "mensal",
};

export function HabitTaskGeneratorModal({
  habits,
  onClose,
  onGenerate,
}: {
  habits: Habit[];
  onClose: () => void;
  onGenerate: (input: HabitTaskGenerationInput) => Promise<HabitTaskGenerationResult>;
}) {
  const today = localIsoDate();
  const { projects } = useProjects();
  const presets = useMemo(() => {
    const mondayOffset = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
    return [
      { key: "today", label: "Hoje", from: today, to: today },
      { key: "tomorrow", label: "Amanhã", from: addDays(today, 1), to: addDays(today, 1) },
      { key: "next7", label: "Próximos 7 dias", from: today, to: addDays(today, 6) },
      { key: "week", label: "Esta semana", from: today, to: addDays(today, 6 - mondayOffset) },
    ];
  }, [today]);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(habits.map((h) => h.id)));
  const [estimate, setEstimate] = useState(30);
  const [priority, setPriority] = useState<TaskPriority>("Média");
  const [status, setStatus] = useState<"A Fazer" | "Backlog">("A Fazer");
  const [projectId, setProjectId] = useState("");
  const [respectFrequency, setRespectFrequency] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = from && to && to >= from ? daysInclusive(from, to) : 0;
  const rangeError = !from || !to ? "Informe as duas datas." : to < from ? "A data final precisa ser igual ou posterior à inicial." : days > MAX_DAYS ? `Gere no máximo ${MAX_DAYS} dias por vez.` : null;
  const estimateError = !Number.isFinite(estimate) || estimate < 5 || estimate > 480 ? "A carga deve ficar entre 5 e 480 minutos." : null;
  const maxTasks = selected.size * days;
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.key ?? null;
  const sampleHabit = habits.find((h) => selected.has(h.id));

  const toggleHabit = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (rangeError || estimateError || selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onGenerate({
        from,
        to,
        habitIds: [...selected],
        estimateMinutes: Math.round(estimate),
        priority,
        status,
        projectId: projectId || null,
        respectFrequency,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar as tarefas.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border focus:border-brand-500";

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-gen-title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p id="habit-gen-title" className="font-display font-semibold text-lg flex items-center gap-2">
              <ListChecks size={18} className="text-growth" /> Gerar tarefas dos hábitos
            </p>
            <p className="text-xs text-slate mt-0.5">Cada hábito vira uma tarefa por dia, com início e término no próprio dia. Concluir a tarefa marca o hábito.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 -mr-1.5 rounded-lg text-slate hover:bg-black/5 dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Período */}
          <fieldset>
            <legend className="text-xs font-semibold flex items-center gap-1.5 mb-2">
              <CalendarRange size={13} /> Período
            </legend>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                  aria-pressed={activePreset === p.key}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-xs border transition-colors",
                    activePreset === p.key ? "border-growth bg-growth/10 text-growth font-semibold" : "border-paper-border dark:border-ink-border text-slate hover:text-inherit"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-xs text-slate">
                Início
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={clsx(inputCls, "mt-1")} />
              </label>
              <label className="text-xs text-slate">
                Término
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={clsx(inputCls, "mt-1")} />
              </label>
            </div>
            {rangeError && <p className="text-[11px] text-drop mt-1.5">{rangeError}</p>}
          </fieldset>

          {/* Hábitos */}
          <fieldset>
            <div className="flex items-center justify-between mb-2">
              <legend className="text-xs font-semibold">Hábitos ({selected.size}/{habits.length})</legend>
              <button
                type="button"
                className="text-[11px] font-medium text-brand-600 dark:text-brand-100 hover:underline"
                onClick={() => setSelected(selected.size === habits.length ? new Set() : new Set(habits.map((h) => h.id)))}
              >
                {selected.size === habits.length ? "Limpar seleção" : "Selecionar todos"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {habits.map((h) => (
                <label
                  key={h.id}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer text-sm transition-colors",
                    selected.has(h.id) ? "border-growth/50 bg-growth/5" : "border-paper-border dark:border-ink-border"
                  )}
                >
                  <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleHabit(h.id)} className="accent-[#12B76A] w-4 h-4" />
                  <span className="truncate flex-1">
                    {h.icon ? `${h.icon} ` : ""}
                    {h.name}
                  </span>
                  <span className="text-[10px] text-slate shrink-0">{FREQ_LABEL[h.frequency]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Carga + prioridade + status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate sm:col-span-1">
              <span className="flex items-center gap-1 font-semibold text-inherit">
                <Clock size={12} /> Carga por tarefa
              </span>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={estimate}
                  onChange={(e) => setEstimate(Number(e.target.value))}
                  className={clsx(inputCls, "pr-10")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">min</span>
              </div>
              <div className="flex gap-1 mt-1.5">
                {LOAD_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEstimate(m)}
                    className={clsx("flex-1 rounded-md py-1 text-[10px] border", estimate === m ? "border-growth text-growth font-semibold" : "border-paper-border dark:border-ink-border")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {estimateError && <p className="text-[11px] text-drop mt-1">{estimateError}</p>}
            </label>
            <label className="text-xs text-slate">
              <span className="font-semibold text-inherit">Prioridade</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={clsx(inputCls, "mt-1")}>
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </label>
            <label className="text-xs text-slate">
              <span className="font-semibold text-inherit">Coluna inicial</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as "A Fazer" | "Backlog")} className={clsx(inputCls, "mt-1")}>
                <option value="A Fazer">A Fazer</option>
                <option value="Backlog">Backlog</option>
              </select>
            </label>
          </div>

          <label className="block text-xs text-slate">
            <span className="font-semibold text-inherit">Projeto (opcional)</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={clsx(inputCls, "mt-1")}>
              <option value="">Sem projeto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-start justify-between gap-3 rounded-xl bg-paper dark:bg-ink p-3">
            <div>
              <p className="text-xs font-semibold">Respeitar a frequência do hábito</p>
              <p className="text-[11px] text-slate">Hábitos semanais/mensais geram uma tarefa por semana/mês, não uma por dia.</p>
            </div>
            <Switch checked={respectFrequency} onChange={() => setRespectFrequency((v) => !v)} label="Respeitar a frequência do hábito" />
          </div>

          {/* Pré-visualização */}
          <div className="rounded-xl border border-dashed border-growth/40 p-3">
            <p className="text-xs font-semibold">
              {selected.size === 0 ? "Selecione pelo menos um hábito." : `Até ${maxTasks} tarefa(s): ${selected.size} hábito(s) × ${days || 0} dia(s)`}
            </p>
            <p className="text-[11px] text-slate mt-0.5">Dias em que o hábito já foi cumprido ou que já têm tarefa gerada são pulados.</p>
            {sampleHabit && !rangeError && (
              <p className="text-[11px] text-slate mt-2 whitespace-pre-line border-l-2 border-growth/40 pl-2">
                <strong className="text-inherit">{sampleHabit.name}</strong> · início e término {formatBr(from)} · {estimate} min
                {"\n"}Tarefa gerada automaticamente a partir do hábito “{sampleHabit.name}” (módulo Hábitos do LifeOS)…
              </p>
            )}
          </div>

          {error && <p className="text-xs text-drop bg-drop/10 rounded-lg px-3 py-2.5">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving || !!rangeError || !!estimateError || selected.size === 0}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Gerar tarefas
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
