import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import type { ActionType, Protocol, ProtocolInput, ProtocolsData, Trigger } from "@/services/protocolsService";
import { MODE_UI, PROTOCOL_ARTS, protocolArtUrl } from "@/utils/protocolDisplay";

type StepDraft = ProtocolInput["steps"][number] & { key: string };
type Draft = Omit<ProtocolInput, "steps"> & { steps: StepDraft[] };
type Catalog = ProtocolsData["catalog"];

const STEPS = ["Identidade", "Gatilho", "Ações", "Ordem", "Preferências", "Revisão"] as const;
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const OPS: Array<{ id: "lt" | "lte" | "gt" | "gte"; label: string }> = [
  { id: "lt", label: "menor que" },
  { id: "lte", label: "até" },
  { id: "gt", label: "maior que" },
  { id: "gte", label: "a partir de" },
];

/** Configuração inicial válida para cada tipo (o servidor valida de novo). */
const DEFAULT_CONFIG: Record<ActionType, Record<string, unknown>> = {
  OPEN_SCREEN: { path: "/hoje" },
  CREATE_TASK: { title: "Nova missão", priority: "Média", dueInDays: 0 },
  CREATE_HABIT: { name: "Novo hábito", frequency: "daily", targetCount: 1 },
  ADJUST_CAPACITY: { reducePct: 20 },
  SET_DAILY_PRIORITY: {},
  ACTIVATE_RECOVERY: {},
  ADD_REMINDER: { time: "21:00", title: "Lembrete" },
  START_FOCUS: { minutes: 25 },
  SHOW_INSTRUCTION: { text: "Respire fundo e siga o plano." },
  CHECKLIST: { items: ["Primeiro item"] },
  DEFER_TASK: { scope: "deep_work" },
  CUSTOM: {},
};

let seq = 0;
const key = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

export function describeTrigger(t: Trigger, catalog: Catalog): string {
  if (t.type === "manual") return "Quando você decidir";
  if (t.type === "time") return `Toda ${WEEKDAYS[t.weekday]}`;
  if (t.type === "event") return `Quando houver ${t.min}+ compromissos amanhã`;
  const m = catalog.metrics.find((x) => x.id === t.metric);
  return `${m?.label ?? t.metric} ${OPS.find((o) => o.id === t.op)?.label ?? t.op} ${t.value}${m?.unit ?? ""}`;
}

const toDraft = (p: Protocol | null): Draft =>
  p
    ? {
        name: p.name,
        description: p.description,
        category: p.category,
        triggerDescription: p.triggerDescription,
        trigger: p.trigger,
        art: p.art,
        settings: p.settings,
        steps: p.steps.map((s) => ({ key: key(), title: s.title, description: s.description, actionType: s.actionType, config: s.config, optional: s.optional, minutes: s.minutes })),
      }
    : { name: "", description: "", category: "pessoal", triggerDescription: "", trigger: { type: "manual" }, art: "map", settings: { suggestAuto: true, showToday: true }, steps: [] };

const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

// Fora do componente: redefinir a cada render faria o input perder o foco.
function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] text-rpg-muted">{label}</span>
      {children}
    </label>
  );
}

/** Campos específicos do tipo de ação — sem URL ou SQL livres. */
function ConfigFields({ step, catalog, onChange }: { step: StepDraft; catalog: Catalog; onChange: (c: Record<string, unknown>) => void }) {
  const c = step.config;
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v });
  const field = clsx(rpgFieldClass, "mt-1");
  switch (step.actionType) {
    case "OPEN_SCREEN":
      return (
        <L label="Tela">
          <select className={field} value={str(c.path, "/hoje")} onChange={(e) => set("path", e.target.value)}>
            {catalog.screens.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </L>
      );
    case "CREATE_TASK":
      return (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px]">
          <L label="Título da missão">
            <input className={field} maxLength={120} value={str(c.title)} onChange={(e) => set("title", e.target.value)} />
          </L>
          <L label="Prioridade">
            <select className={field} value={str(c.priority, "Média")} onChange={(e) => set("priority", e.target.value)}>
              {["Baixa", "Média", "Alta"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </L>
          <L label="Prazo (dias)">
            <input type="number" min={0} max={30} className={field} value={num(c.dueInDays, 0)} onChange={(e) => set("dueInDays", Number(e.target.value))} />
          </L>
        </div>
      );
    case "CREATE_HABIT":
      return (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_90px]">
          <L label="Nome do hábito">
            <input className={field} maxLength={80} value={str(c.name)} onChange={(e) => set("name", e.target.value)} />
          </L>
          <L label="Frequência">
            <select className={field} value={str(c.frequency, "daily")} onChange={(e) => set("frequency", e.target.value)}>
              <option value="daily">Diário</option>
              <option value="times_per_week">X vezes/semana</option>
              <option value="weekly">Semanal</option>
            </select>
          </L>
          <L label="Meta">
            <input type="number" min={1} max={14} className={field} value={num(c.targetCount, 1)} onChange={(e) => set("targetCount", Number(e.target.value))} />
          </L>
        </div>
      );
    case "ADJUST_CAPACITY":
      return (
        <L label={`Reduzir carga do dia em ${num(c.reducePct, 20)}%`}>
          <input type="range" min={5} max={60} step={5} className="w-full accent-rpg-gold mt-1" value={num(c.reducePct, 20)} onChange={(e) => set("reducePct", Number(e.target.value))} />
        </L>
      );
    case "ADD_REMINDER":
      return (
        <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
          <L label="Horário">
            <input type="time" className={field} value={str(c.time, "21:00")} onChange={(e) => set("time", e.target.value)} />
          </L>
          <L label="Texto">
            <input className={field} maxLength={80} value={str(c.title)} onChange={(e) => set("title", e.target.value)} />
          </L>
        </div>
      );
    case "START_FOCUS":
      return (
        <L label="Minutos de foco">
          <input type="number" min={5} max={120} className={field} value={num(c.minutes, 25)} onChange={(e) => set("minutes", Number(e.target.value))} />
        </L>
      );
    case "SHOW_INSTRUCTION":
      return (
        <L label="Instrução">
          <textarea className={field} rows={2} maxLength={300} value={str(c.text)} onChange={(e) => set("text", e.target.value)} />
        </L>
      );
    case "CHECKLIST":
      return (
        <L label="Itens (um por linha, até 10)">
          <textarea
            className={field}
            rows={3}
            value={(Array.isArray(c.items) ? (c.items as string[]) : []).join("\n")}
            onChange={(e) =>
              set(
                "items",
                e.target.value
                  .split("\n")
                  .map((x) => x.slice(0, 80))
                  .slice(0, 10),
              )
            }
          />
        </L>
      );
    case "DEFER_TASK":
      return (
        <L label="O que adiar para amanhã">
          <select className={field} value={str(c.scope, "deep_work")} onChange={(e) => set("scope", e.target.value)}>
            <option value="deep_work">Missões longas (trabalho profundo)</option>
            <option value="low">Missões de prioridade baixa</option>
          </select>
        </L>
      );
    default:
      return <p className="text-[11px] text-rpg-muted">Sem configuração extra.</p>;
  }
}

/**
 * Assistente de criação/edição em 6 etapas. Ordenação por arrastar e
 * soltar com alternativa por teclado (botões subir/descer).
 */
export function ProtocolWizard({
  open,
  editing,
  catalog,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Protocol | null;
  catalog: Catalog;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ProtocolInput) => Promise<void>;
}) {
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => toDraft(editing));
  const [newType, setNewType] = useState<ActionType>("CREATE_TASK");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(editing));
    setStage(0);
    setError(null);
  }, [open, editing]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchStep = (k: string, p: Partial<StepDraft>) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.key === k ? { ...s, ...p } : s)) }));
  const move = (from: number, to: number) =>
    setDraft((d) => {
      if (to < 0 || to >= d.steps.length) return d;
      const steps = [...d.steps];
      const [it] = steps.splice(from, 1);
      steps.splice(to, 0, it);
      return { ...d, steps };
    });
  const addStep = () => {
    const label = catalog.actions.find((a) => a.id === newType)?.label ?? newType;
    setDraft((d) => (d.steps.length >= 15 ? d : { ...d, steps: [...d.steps, { key: key(), title: label, actionType: newType, config: { ...DEFAULT_CONFIG[newType] }, optional: false, minutes: 0 }] }));
  };
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    const from = draft.steps.findIndex((s) => s.key === dragKey);
    if (from >= 0) move(from, to);
    setDragKey(null);
  };

  const validate = (s: number): string | null => {
    if (s === 0 && !draft.name.trim()) return "Dê um nome ao protocolo.";
    if (s === 2 && draft.steps.length === 0) return "Adicione pelo menos uma ação.";
    if (s === 2 && draft.steps.some((x) => !x.title.trim())) return "Toda ação precisa de um nome.";
    return null;
  };
  const next = () => {
    const err = validate(stage);
    setError(err);
    if (!err) setStage((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const save = async () => {
    const err = validate(0) ?? validate(2);
    if (err) return setError(err);
    try {
      await onSave({
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        category: draft.category,
        triggerDescription: draft.triggerDescription?.trim() || describeTrigger(draft.trigger, catalog),
        trigger: draft.trigger,
        art: draft.art,
        settings: draft.settings,
        steps: draft.steps.map(({ key: _k, ...s }) => s),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o protocolo.");
    }
  };

  const t = draft.trigger;
  const setTrigger = (type: Trigger["type"]) =>
    patch({ trigger: type === "manual" ? { type } : type === "time" ? { type, weekday: 1 } : type === "event" ? { type, metric: "events_tomorrow", min: 2 } : { type, metric: "sleep_hours", op: "lt", value: 6 } });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar protocolo" : "Novo protocolo"}
      size="lg"
      footer={
        <>
          <RPGButton variant="secondary" onClick={() => (stage === 0 ? onClose() : setStage((s) => s - 1))}>
            {stage === 0 ? "Cancelar" : "Voltar"}
          </RPGButton>
          {stage < STEPS.length - 1 ? (
            <RPGButton variant="primary" onClick={next}>
              Continuar
            </RPGButton>
          ) : (
            <RPGButton variant="gold" onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar protocolo"}
            </RPGButton>
          )}
        </>
      }
    >
      <ol className="mb-4 flex gap-1 overflow-x-auto" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === stage ? "step" : undefined} className={clsx("shrink-0 border px-2 py-1 text-[11px]", i === stage ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : i < stage ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {stage === 0 && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-rpg-muted">Nome</span>
            <input className={clsx(rpgFieldClass, "mt-1")} maxLength={60} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Dormi mal" />
          </label>
          <label className="block">
            <span className="text-xs text-rpg-muted">Descrição</span>
            <textarea className={clsx(rpgFieldClass, "mt-1")} rows={2} maxLength={300} value={draft.description ?? ""} onChange={(e) => patch({ description: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-rpg-muted">Situação</span>
            <select className={clsx(rpgFieldClass, "mt-1")} value={draft.category} onChange={(e) => patch({ category: e.target.value })}>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="text-xs text-rpg-muted mb-1">Arte</legend>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {PROTOCOL_ARTS.map((a) => (
                <button key={a} type="button" aria-pressed={draft.art === a} aria-label={`Arte ${a}`} onClick={() => patch({ art: a })} className={clsx("border-2 overflow-hidden", draft.art === a ? "border-rpg-gold" : "border-rpg-border")} style={{ borderRadius: 3 }}>
                  <img src={protocolArtUrl(a)} alt="" className="pixelated w-full aspect-[16/10] object-cover" />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {stage === 1 && (
        <div className="space-y-3">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="text-xs text-rpg-muted mb-1">Quando este protocolo deve ser lembrado?</legend>
            {(
              [
                ["manual", "Só quando eu escolher"],
                ["data", "Quando um dado real indicar"],
                ["time", "Em um dia da semana"],
                ["event", "Antes de um dia cheio de compromissos"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className={clsx("flex items-center gap-2 border-2 px-3 py-2 text-sm cursor-pointer", t.type === id ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-text")} style={{ borderRadius: 3 }}>
                <input type="radio" name="trigger" className="accent-rpg-gold" checked={t.type === id} onChange={() => setTrigger(id)} /> {label}
              </label>
            ))}
          </fieldset>
          {t.type === "data" && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_100px]">
              <select aria-label="Métrica" className={rpgFieldClass} value={t.metric} onChange={(e) => patch({ trigger: { ...t, metric: e.target.value as typeof t.metric } })}>
                {catalog.metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select aria-label="Comparação" className={rpgFieldClass} value={t.op} onChange={(e) => patch({ trigger: { ...t, op: e.target.value as typeof t.op } })}>
                {OPS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input aria-label="Valor" type="number" min={0} max={1000} step="0.5" className={rpgFieldClass} value={t.value} onChange={(e) => patch({ trigger: { ...t, value: Number(e.target.value) } })} />
            </div>
          )}
          {t.type === "time" && (
            <select aria-label="Dia da semana" className={rpgFieldClass} value={t.weekday} onChange={(e) => patch({ trigger: { ...t, weekday: Number(e.target.value) } })}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          )}
          {t.type === "event" && (
            <label className="block">
              <span className="text-xs text-rpg-muted">Mínimo de compromissos amanhã</span>
              <input type="number" min={1} max={20} className={clsx(rpgFieldClass, "mt-1")} value={t.min} onChange={(e) => patch({ trigger: { ...t, min: Number(e.target.value) } })} />
            </label>
          )}
          <label className="block">
            <span className="text-xs text-rpg-muted">Descrição do gatilho (opcional)</span>
            <input className={clsx(rpgFieldClass, "mt-1")} maxLength={160} value={draft.triggerDescription ?? ""} placeholder={describeTrigger(t, catalog)} onChange={(e) => patch({ triggerDescription: e.target.value })} />
          </label>
          <p className="text-[11px] text-rpg-muted">Gatilho só sugere o protocolo — a execução continua dependendo da sua confirmação.</p>
        </div>
      )}

      {stage === 2 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select aria-label="Tipo de ação" className={clsx(rpgFieldClass, "flex-1 min-w-[200px]")} value={newType} onChange={(e) => setNewType(e.target.value as ActionType)}>
              {catalog.actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({MODE_UI[a.mode].label.toLowerCase()})
                </option>
              ))}
            </select>
            <RPGButton variant="secondary" onClick={addStep} disabled={draft.steps.length >= 15}>
              <Plus size={14} aria-hidden /> Adicionar ação
            </RPGButton>
          </div>
          {draft.steps.length === 0 && <p className="text-sm text-rpg-muted">Nenhuma ação ainda.</p>}
          <ul className="space-y-2">
            {draft.steps.map((s) => {
              const mode = catalog.actions.find((a) => a.id === s.actionType)?.mode ?? "manual";
              return (
                <li key={s.key} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-3 space-y-2" style={{ borderRadius: 3 }}>
                  <div className="flex items-center gap-2">
                    <RPGBadge tone={MODE_UI[mode].tone}>{catalog.actions.find((a) => a.id === s.actionType)?.label ?? s.actionType}</RPGBadge>
                    <button type="button" className="ml-auto text-rpg-red p-1" aria-label={`Remover ${s.title}`} onClick={() => patch({ steps: draft.steps.filter((x) => x.key !== s.key) })}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  <input aria-label="Nome da ação" className={rpgFieldClass} maxLength={120} value={s.title} onChange={(e) => patchStep(s.key, { title: e.target.value })} />
                  <ConfigFields step={s} catalog={catalog} onChange={(config) => patchStep(s.key, { config })} />
                  <div className="flex flex-wrap items-center gap-4 text-xs text-rpg-muted">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" className="accent-rpg-gold" checked={!!s.optional} onChange={(e) => patchStep(s.key, { optional: e.target.checked })} /> Opcional
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      Minutos
                      <input type="number" min={0} max={240} className={clsx(rpgFieldClass, "!w-20 !py-1")} value={s.minutes ?? 0} onChange={(e) => patchStep(s.key, { minutes: Number(e.target.value) })} />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stage === 3 && (
        <div>
          <p className="text-sm text-rpg-muted mb-2">Arraste para reordenar ou use os botões de subir/descer.</p>
          <ol className="space-y-1.5">
            {draft.steps.map((s, i) => (
              <li
                key={s.key}
                draggable
                onDragStart={() => setDragKey(s.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, i)}
                className={clsx("flex items-center gap-2 border bg-rpg-bg-2/60 px-2 py-2 text-sm", dragKey === s.key ? "border-rpg-gold opacity-60" : "border-rpg-border/70")}
                style={{ borderRadius: 3 }}
              >
                <GripVertical size={16} className="text-rpg-muted cursor-grab shrink-0" aria-hidden />
                <span className="font-pixel text-[10px] text-rpg-gold-light w-5">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-rpg-text">{s.title}</span>
                <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-text disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Subir ${s.title}`}>
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-text disabled:opacity-30" disabled={i === draft.steps.length - 1} onClick={() => move(i, i + 1)} aria-label={`Descer ${s.title}`}>
                  <ArrowDown size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {stage === 4 && (
        <div className="space-y-2">
          {(
            [
              ["suggestAuto", "Sugerir automaticamente quando o gatilho acontecer"],
              ["showToday", "Mostrar a sugestão na tela Hoje"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-rpg-text">
              <input type="checkbox" className="accent-rpg-gold" checked={draft.settings?.[k] ?? true} onChange={(e) => patch({ settings: { ...draft.settings, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
          <p className="text-[11px] text-rpg-muted">Sugestões nunca executam ações sozinhas.</p>
        </div>
      )}

      {stage === 5 && (
        <div className="space-y-2 text-sm">
          <p className="font-rpg text-lg font-bold text-rpg-text">{draft.name || "Sem nome"}</p>
          <p className="text-rpg-muted">
            {catalog.categories.find((c) => c.id === draft.category)?.label} · {draft.triggerDescription?.trim() || describeTrigger(t, catalog)}
          </p>
          <ol className="list-decimal pl-5 space-y-0.5 text-rpg-text">
            {draft.steps.map((s) => (
              <li key={s.key}>{s.title}</li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-rpg-red" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
