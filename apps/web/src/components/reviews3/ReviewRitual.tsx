import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  Compass,
  FlaskConical,
  Flag,
  Loader2,
  NotebookPen,
  Plus,
  Repeat,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { RichTextEditor } from "@/components/journal/RichTextEditor";
import { Tag } from "@/components/forge3/ForgeShared";
import { useProjects } from "@/hooks/useProjects";
import { useGoals } from "@/hooks/useGoals";
import { useCampaigns } from "@/hooks/useCampaigns";
import { STEP_LABEL, type FocusRef, type JourneyReview, type ReviewAction, type ReviewPlan } from "@/services/journeyReviewService";
import { fmtMin } from "@/services/missions3Service";
import { Delta, FIELD, IND_META, KIND_UNIT, Panel, fmtIndicator, plain, uid } from "./ReviewShared";

export interface Draft {
  steps: string[];
  answers: Record<string, string>;
  reflection: string;
  actions: ReviewAction[];
  plan: ReviewPlan;
}
export type SetDraft = (fn: (d: Draft) => Draft) => void;
export type ConvertKind = NonNullable<ReviewAction["convertedTo"]>;

const STEP_ICON: Record<string, ReactNode> = {
  retrato: <ScrollText size={15} />,
  funcionou: <CheckCircle2 size={15} />,
  nao_funcionou: <X size={15} />,
  melhorar: <Repeat size={15} />,
  proxima: <Compass size={15} />,
};

/* ═════════════ Ritual semanal (5 passos) ═════════════ */

export function WeeklyRitual({
  d,
  draft,
  set,
  readOnly,
  onAiDraft,
  aiBusy,
  onConvert,
  converting,
  onSuggestBlocks,
  onApplyPlan,
  applying,
  onOpenDiary,
  flush,
}: RitualProps) {
  const steps = d.steps;
  const firstOpen = steps.find((s) => !draft.steps.includes(s)) ?? steps[steps.length - 1]!;
  const [cur, setCur] = useState<string>(firstOpen);
  const idx = steps.indexOf(cur);
  const markDone = () => {
    if (!draft.steps.includes(cur)) set((x) => ({ ...x, steps: [...x.steps, cur] }));
    if (idx < steps.length - 1) setCur(steps[idx + 1]!);
  };
  const q = (key: string) => d.questions.find((x) => x.key === key)!;
  return (
    <section className="rpg-panel rpg-panel-gold p-3 sm:p-4" aria-label="Ritual semanal">
      <ol className="mb-4 grid grid-cols-5 gap-1" aria-label="Passos do ritual">
        {steps.map((s, i) => {
          const done = draft.steps.includes(s);
          return (
            <li key={s}>
              <button
                onClick={() => setCur(s)}
                aria-current={cur === s ? "step" : undefined}
                className={clsx("flex w-full flex-col items-center gap-1 border-2 px-1 py-2 text-center", cur === s ? "border-rpg-gold bg-rpg-gold/15" : done ? "border-rpg-green/60 bg-rpg-green/10" : "border-rpg-border bg-rpg-bg-2/60")}
                style={{ borderRadius: 3 }}
              >
                <span className={clsx("flex h-7 w-7 items-center justify-center border-2", done ? "border-rpg-green text-rpg-green" : cur === s ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }} aria-hidden>
                  {done ? <Check size={14} /> : STEP_ICON[s]}
                </span>
                <span className="hidden text-[10.5px] font-semibold leading-tight text-rpg-text sm:block">{STEP_LABEL[s] ?? s}</span>
                <span className="text-[10px] text-rpg-muted sm:hidden">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <h2 className="mb-2 flex items-center gap-2 font-pixel text-[13px] uppercase tracking-wider text-rpg-gold-light">
        <span className="text-rpg-gold" aria-hidden>
          {STEP_ICON[cur]}
        </span>
        Passo {idx + 1} · {STEP_LABEL[cur]}
      </h2>

      {cur === "retrato" && <WeekSnapshot d={d} />}
      {cur === "funcionou" && <Answer q={q("worked")} value={draft.answers.worked ?? ""} onChange={(v) => set((x) => ({ ...x, answers: { ...x.answers, worked: v } }))} readOnly={readOnly} flush={flush} tall />}
      {cur === "nao_funcionou" && <Answer q={q("didnt")} value={draft.answers.didnt ?? ""} onChange={(v) => set((x) => ({ ...x, answers: { ...x.answers, didnt: v } }))} readOnly={readOnly} flush={flush} tall />}
      {cur === "melhorar" && (
        <div className="space-y-3">
          <Answer q={q("learned")} value={draft.answers.learned ?? ""} onChange={(v) => set((x) => ({ ...x, answers: { ...x.answers, learned: v } }))} readOnly={readOnly} flush={flush} />
          <ActionsEditor draft={draft} set={set} readOnly={readOnly} onConvert={onConvert} converting={converting} unit={KIND_UNIT.weekly.next} />
        </div>
      )}
      {cur === "proxima" && (
        <div className="space-y-3">
          <PlanEditor d={d} draft={draft} set={set} readOnly={readOnly} onSuggestBlocks={onSuggestBlocks} onApplyPlan={onApplyPlan} applying={applying} />
          <Reflection d={d} draft={draft} set={set} readOnly={readOnly} onAiDraft={onAiDraft} aiBusy={aiBusy} onOpenDiary={onOpenDiary} flush={flush} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rpg-border pt-3">
        <RPGButton variant="secondary" disabled={idx === 0} onClick={() => setCur(steps[idx - 1]!)}>
          <ArrowLeft size={14} aria-hidden /> Anterior
        </RPGButton>
        <span className="text-xs text-rpg-muted">
          {draft.steps.length}/{steps.length} passos concluídos
        </span>
        {!readOnly && (
          <RPGButton variant="primary" className="ml-auto" onClick={markDone}>
            {idx < steps.length - 1 ? (
              <>
                Concluir passo <ArrowRight size={14} aria-hidden />
              </>
            ) : (
              <>
                <Check size={14} aria-hidden /> Concluir ritual
              </>
            )}
          </RPGButton>
        )}
      </div>
    </section>
  );
}

function WeekSnapshot({ d }: { d: JourneyReview }) {
  const keys = ["tasksDone", "habitsDone", "focusMinutes", "workouts", "pagesRead", "sleepAvgMinutes", "journalDays", "xp"];
  return (
    <div className="space-y-3">
      <p className="text-sm text-rpg-text">Olhe a semana com os números reais antes de responder. Nada aqui é estimado.</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keys.map((k) => {
          const i = d.indicators.find((x) => x.key === k);
          if (!i) return null;
          return (
            <li key={k} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
              <p className="flex items-center gap-1.5 text-[10.5px] text-rpg-muted">
                <span className="text-rpg-gold" aria-hidden>
                  {IND_META[k]?.icon}
                </span>
                {i.label}
              </p>
              <p className="text-lg font-bold tabular-nums text-rpg-text">{fmtIndicator(i)}</p>
              <Delta i={i} compact />
            </li>
          );
        })}
      </ul>
      {d.goals.some((g) => g.status === "active" && g.openTasks === 0) && (
        <p className="text-xs text-rpg-orange">
          Metas sem próxima missão: {d.goals.filter((g) => g.status === "active" && g.openTasks === 0).map((g) => g.title).join(", ")}.
        </p>
      )}
    </div>
  );
}

/* ═════════════ Perguntas dos ciclos maiores ═════════════ */

export function CycleQuestions({ d, draft, set, readOnly, flush }: { d: JourneyReview; draft: Draft; set: SetDraft; readOnly: boolean; flush: () => void }) {
  const filled = d.questions.filter((q) => plain(draft.answers[q.key] ?? "").length > 0).length;
  return (
    <Panel title={`Perguntas ${KIND_UNIT[d.kind].this}`} icon={<NotebookPen size={15} />} tone="gold" action={<Tag tone={filled >= d.seal.required ? "green" : "orange"}>{filled}/{d.questions.length} respondidas</Tag>}>
      <div className="grid gap-3 md:grid-cols-2">
        {d.questions.map((q) => (
          <Answer key={q.key} q={q} value={draft.answers[q.key] ?? ""} onChange={(v) => set((x) => ({ ...x, answers: { ...x.answers, [q.key]: v } }))} readOnly={readOnly} flush={flush} />
        ))}
      </div>
    </Panel>
  );
}

function Answer({ q, value, onChange, readOnly, flush, tall }: { q: { key: string; label: string; hint: string }; value: string; onChange: (v: string) => void; readOnly: boolean; flush: () => void; tall?: boolean }) {
  const id = `q-${q.key}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold text-rpg-text">
        {plain(value) ? <CheckCircle2 size={14} className="text-rpg-green" aria-hidden /> : <span className="h-3.5 w-3.5 rotate-45 border border-rpg-gold" aria-hidden />}
        {q.label}
      </label>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        placeholder={q.hint}
        maxLength={4000}
        rows={tall ? 6 : 3}
        className={clsx(FIELD, "mt-1 resize-y leading-relaxed")}
        style={{ borderRadius: 3 }}
      />
    </div>
  );
}

/* ═════════════ Reflexão ═════════════ */

export function Reflection({ d, draft, set, readOnly, onAiDraft, aiBusy, onOpenDiary, flush }: Pick<RitualProps, "d" | "draft" | "set" | "readOnly" | "onAiDraft" | "aiBusy" | "onOpenDiary" | "flush">) {
  const len = plain(draft.reflection).length;
  return (
    <Panel title={`Sua reflexão ${KIND_UNIT[d.kind].this}`} icon={<ScrollText size={15} />}>
      {readOnly ? (
        <div className="prose-sm max-w-none text-sm text-rpg-text" dangerouslySetInnerHTML={{ __html: draft.reflection || "<p><em>Sem reflexão escrita.</em></p>" }} />
      ) : (
        <div className="border border-rpg-border bg-rpg-bg-2 text-rpg-text [&>div]:!rounded-none [&>div]:!border-0 [&>div]:!bg-rpg-bg-2" style={{ borderRadius: 3 }}>
          <RichTextEditor
            key={`${d.kind}:${d.key}`}
            value={draft.reflection}
            onChange={(html) => set((x) => ({ ...x, reflection: html }))}
            onBlur={flush}
            placeholder="Registre sua análise: o que viveu, aprendeu, como se sentiu, o que mudou…"
            minHeightClass="min-h-[130px]"
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!readOnly && (
          <RPGButton variant="secondary" onClick={onAiDraft} disabled={aiBusy} title="A IA escreve um rascunho das respostas a partir dos números; você revisa antes de guardar.">
            {aiBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} Escrever com IA
          </RPGButton>
        )}
        <RPGButton variant="secondary" onClick={onOpenDiary}>
          <BookOpen size={14} aria-hidden /> Abrir no Diário
        </RPGButton>
        <span className="ml-auto text-[11px] tabular-nums text-rpg-muted">{len}/6000</span>
      </div>
    </Panel>
  );
}

/* ═════════════ Ações de melhoria ═════════════ */

const CONVERT: Array<{ to: ConvertKind; label: string; icon: ReactNode }> = [
  { to: "missao", label: "Missão", icon: <Swords size={12} /> },
  { to: "habito", label: "Hábito", icon: <Repeat size={12} /> },
  { to: "meta", label: "Meta", icon: <Target size={12} /> },
  { to: "experimento", label: "Experimento", icon: <FlaskConical size={12} /> },
  { to: "protocolo", label: "Protocolo", icon: <Workflow size={12} /> },
];
const CONVERTED_LABEL: Record<ConvertKind, string> = { missao: "Virou missão", habito: "Virou hábito", meta: "Virou meta", experimento: "Levada ao Laboratório", protocolo: "Levada a Protocolos" };

export function ActionsEditor({ draft, set, readOnly, onConvert, converting, unit }: { draft: Draft; set: SetDraft; readOnly: boolean; onConvert: (a: ReviewAction, to: ConvertKind) => void; converting: string | null; unit: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t.length < 3) return;
    set((x) => ({ ...x, actions: [...x.actions, { id: uid(), text: t.slice(0, 300), convertedTo: null, refId: null }].slice(0, 12) }));
    setText("");
  };
  return (
    <Panel title="O que vou ajustar?" icon={<Flag size={15} />}>
      {draft.actions.length === 0 && <p className="mb-2 text-sm text-rpg-muted">Liste ações concretas para {unit}. Cada uma pode virar missão, hábito, meta, experimento ou protocolo.</p>}
      <ul className="space-y-2">
        {draft.actions.map((a) => (
          <li key={a.id} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
            <div className="flex items-start gap-2">
              <span className={clsx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border", a.convertedTo ? "border-rpg-green bg-rpg-green text-rpg-bg" : "border-rpg-gold")} style={{ borderRadius: 2 }} aria-hidden>
                {a.convertedTo && <Check size={11} strokeWidth={3} />}
              </span>
              <p className="min-w-0 flex-1 text-sm text-rpg-text">{a.text}</p>
              {!readOnly && !a.convertedTo && (
                <button onClick={() => set((x) => ({ ...x, actions: x.actions.filter((y) => y.id !== a.id) }))} className="text-rpg-muted hover:text-rpg-red" aria-label={`Remover “${a.text}”`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
              {a.convertedTo ? (
                <Tag tone="green">{CONVERTED_LABEL[a.convertedTo]}</Tag>
              ) : (
                CONVERT.map((c) => (
                  <button
                    key={c.to}
                    disabled={!!converting}
                    onClick={() => onConvert(a, c.to)}
                    className="flex items-center gap-1 border border-rpg-border px-1.5 py-0.5 text-[11px] text-rpg-text hover:border-rpg-gold hover:text-rpg-gold-light disabled:opacity-50"
                    style={{ borderRadius: 2 }}
                  >
                    {converting === `${a.id}:${c.to}` ? <Loader2 size={12} className="animate-spin" aria-hidden /> : c.icon} {c.label}
                  </button>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-2 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Ex.: Definir bloco fixo para treinos (3x/semana)" maxLength={300} aria-label="Nova ação de melhoria" className={FIELD} style={{ borderRadius: 3 }} />
          <RPGButton variant="secondary" onClick={add} disabled={text.trim().length < 3}>
            <Plus size={14} aria-hidden /> Adicionar
          </RPGButton>
        </div>
      )}
    </Panel>
  );
}

/* ═════════════ Plano do próximo ciclo ═════════════ */

export function PlanEditor({ d, draft, set, readOnly, onSuggestBlocks, onApplyPlan, applying }: Pick<RitualProps, "d" | "draft" | "set" | "readOnly" | "onSuggestBlocks" | "onApplyPlan" | "applying">) {
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { campaigns } = useCampaigns();
  const [prio, setPrio] = useState("");
  const [focusSel, setFocusSel] = useState("");
  const p = draft.plan;
  const setPlan = (patch: Partial<ReviewPlan>) => set((x) => ({ ...x, plan: { ...x.plan, ...patch } }));
  const options: Array<{ v: string; label: string; ref: FocusRef }> = [
    ...campaigns.filter((c) => c.status === "active" || c.status === "planned").map((c) => ({ v: `campaign:${c.id}`, label: `Campanha · ${c.title}`, ref: { type: "campaign" as const, id: c.id } })),
    ...projects.filter((x) => !x.archived_at && x.status !== "completed" && x.status !== "cancelled").map((x) => ({ v: `project:${x.id}`, label: `Projeto · ${x.name}`, ref: { type: "project" as const, id: x.id } })),
    ...goals.filter((g) => g.status === "active").map((g) => ({ v: `goal:${g.id}`, label: `Meta · ${g.title}`, ref: { type: "goal" as const, id: g.id } })),
  ];
  const labelOf = (f: FocusRef) => options.find((o) => o.v === `${f.type}:${f.id}`)?.label ?? `${f.type} (indisponível)`;
  const addPrio = () => {
    const t = prio.trim();
    if (t.length < 3 || p.priorities.length >= 5) return;
    setPlan({ priorities: [...p.priorities, t.slice(0, 200)] });
    setPrio("");
  };
  return (
    <Panel
      title={`Plano para ${KIND_UNIT[d.kind].next}`}
      icon={<Compass size={15} />}
      tone="gold"
      action={d.review.planAppliedAt ? <Tag tone="green">Plano aplicado</Tag> : undefined}
    >
      <label className="block text-xs font-semibold text-rpg-muted" htmlFor="plan-obj">
        Foco principal
      </label>
      <input id="plan-obj" value={p.objective} readOnly={readOnly} onChange={(e) => setPlan({ objective: e.target.value.slice(0, 300) })} placeholder="Ex.: Concluir 80% da meta “Evoluir em ML”" className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />

      <p className="mt-3 text-xs font-semibold text-rpg-muted">Prioridades ({p.priorities.length}/5)</p>
      <ul className="mt-1 space-y-1">
        {p.priorities.map((x, i) => (
          <li key={i} className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-sm text-rpg-text" style={{ borderRadius: 3 }}>
            <span className="font-pixel text-[11px] text-rpg-gold">{i + 1}</span>
            <span className="min-w-0 flex-1">{x}</span>
            {!readOnly && (
              <button onClick={() => setPlan({ priorities: p.priorities.filter((_, j) => j !== i) })} className="text-rpg-muted hover:text-rpg-red" aria-label={`Remover prioridade ${i + 1}`}>
                <X size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && p.priorities.length < 5 && (
        <div className="mt-1.5 flex gap-2">
          <input value={prio} onChange={(e) => setPrio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPrio())} placeholder="Nova prioridade" aria-label="Nova prioridade" className={FIELD} style={{ borderRadius: 3 }} />
          <RPGButton variant="secondary" onClick={addPrio} disabled={prio.trim().length < 3}>
            <Plus size={14} aria-hidden />
          </RPGButton>
        </div>
      )}

      <p className="mt-3 text-xs font-semibold text-rpg-muted">Focos (campanhas, projetos e metas reais)</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {p.focus.map((f) => (
          <li key={`${f.type}${f.id}`} className="flex items-center gap-1 border border-rpg-purple/60 bg-rpg-purple/10 px-1.5 py-0.5 text-[11.5px] text-rpg-text" style={{ borderRadius: 2 }}>
            {labelOf(f)}
            {!readOnly && (
              <button onClick={() => setPlan({ focus: p.focus.filter((y) => !(y.type === f.type && y.id === f.id)) })} aria-label={`Remover foco ${labelOf(f)}`} className="text-rpg-muted hover:text-rpg-red">
                <X size={11} />
              </button>
            )}
          </li>
        ))}
        {p.focus.length === 0 && <li className="text-[11.5px] text-rpg-muted">Nenhum foco escolhido.</li>}
      </ul>
      {!readOnly && p.focus.length < 6 && (
        <select
          aria-label="Adicionar foco"
          value={focusSel}
          onChange={(e) => {
            const o = options.find((x) => x.v === e.target.value);
            if (o && !p.focus.some((f) => f.type === o.ref.type && f.id === o.ref.id)) setPlan({ focus: [...p.focus, o.ref] });
            setFocusSel("");
          }}
          className={clsx(FIELD, "mt-1.5 text-xs")}
          style={{ borderRadius: 3 }}
        >
          <option value="">+ Adicionar foco…</option>
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <label className="mt-3 block text-xs font-semibold text-rpg-muted" htmlFor="plan-notes">
        Notas do plano
      </label>
      <textarea id="plan-notes" value={p.notes} readOnly={readOnly} onChange={(e) => setPlan({ notes: e.target.value.slice(0, 2000) })} rows={2} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />

      <div className="mt-3 flex flex-wrap gap-2">
        <RPGButton variant="secondary" onClick={onSuggestBlocks} disabled={p.priorities.length === 0} title="Procura horários livres na Agenda (só cria eventos se você confirmar)">
          <CalendarPlus size={14} aria-hidden /> Sugerir blocos na Agenda
        </RPGButton>
        <RPGButton variant="primary" onClick={onApplyPlan} disabled={applying || readOnly || p.priorities.length + p.focus.length === 0} title={d.kind === "weekly" ? "Leva prioridades e focos ao Conselho de Guerra da próxima semana (rascunho)" : "Registra o plano como aplicado"}>
          {applying ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ArrowRight size={14} aria-hidden />} {d.kind === "weekly" ? "Enviar ao Conselho de Guerra" : "Aplicar no planejamento"}
        </RPGButton>
      </div>
    </Panel>
  );
}

export function BlocksList({ blocks, onReserve, reserving }: { blocks: Array<{ title: string; date: string; start: string; minutes: number }>; onReserve: (b: { title: string; date: string; start: string; minutes: number }) => void; reserving: string | null }) {
  if (!blocks.length) return <p className="text-sm text-rpg-muted">Não encontrei janelas livres suficientes nos próximos dias.</p>;
  return (
    <ul className="space-y-1.5">
      {blocks.map((b) => {
        const k = `${b.date}${b.start}${b.title}`;
        return (
          <li key={k} className="flex flex-wrap items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-sm" style={{ borderRadius: 3 }}>
            <span className="min-w-0 flex-1 truncate font-semibold text-rpg-text">{b.title}</span>
            <span className="text-xs text-rpg-muted">
              {new Date(`${b.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {b.start} · {fmtMin(b.minutes)}
            </span>
            <RPGButton variant="secondary" onClick={() => onReserve(b)} disabled={!!reserving}>
              {reserving === k ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CalendarPlus size={13} aria-hidden />} Reservar
            </RPGButton>
          </li>
        );
      })}
    </ul>
  );
}

export interface RitualProps {
  d: JourneyReview;
  draft: Draft;
  set: SetDraft;
  readOnly: boolean;
  onAiDraft: () => void;
  aiBusy: boolean;
  onConvert: (a: ReviewAction, to: ConvertKind) => void;
  converting: string | null;
  onSuggestBlocks: () => void;
  onApplyPlan: () => void;
  applying: boolean;
  onOpenDiary: () => void;
  flush: () => void;
}
