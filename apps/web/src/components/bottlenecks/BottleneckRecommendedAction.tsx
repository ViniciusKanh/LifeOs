import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarPlus, Clock3, Sparkles, Target, Zap, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton, RPGPanel, rpgButtonClass } from "@/components/rpg";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import { bottlenecksService, type FocusInput, type FocusPreview, type RecommendedAction } from "@/services/bottlenecksService";
import { TIME_SOURCE_LABEL, dayLabel } from "@/utils/bottleneckDisplay";

/** Ação que cria um bloco de tempo na agenda (o servidor ainda a chama de SCHEDULE_FOCUS). */
export const isScheduleAction = (a: RecommendedAction) => a.type === "SCHEDULE_FOCUS";
export const SCHEDULE_LABEL = "Reservar horário na agenda";

/**
 * "O que fazer agora": UMA ação clara, com duração, horário e resultado
 * esperado vindos dos dados. Outras opções ficam discretas embaixo.
 */
export function BottleneckRecommendedAction({ action, secondary, today, onSchedule }: { action: RecommendedAction; secondary: RecommendedAction[]; today: string; onSchedule: () => void }) {
  const schedule = isScheduleAction(action);
  const rows: Array<{ icon: LucideIcon; label: string; value: string; hint?: string }> = [];
  if (action.estimatedMinutes !== null) rows.push({ icon: Clock3, label: "Quanto tempo", value: `${action.estimatedMinutes} min${action.preview?.durationSource === "default" ? " (tempo padrão — a tarefa não tem estimativa)" : ""}` });
  if (action.preview) rows.push({ icon: CalendarClock, label: "Quando", value: `${dayLabel(action.preview.date, today)}, ${action.preview.start}–${action.preview.end}`, hint: TIME_SOURCE_LABEL[action.preview.timeSource] });
  if (action.expected) rows.push({ icon: Target, label: "O que você ganha", value: action.expected });
  return (
    <RPGPanel title="O que fazer agora" icon={<Zap size={15} className="text-rpg-gold" />} variant="gold" className="h-full">
      <div className="flex items-start gap-3 border-2 border-rpg-gold/60 bg-rpg-gold/10 p-3" style={{ borderRadius: 3 }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-rpg-gold bg-rpg-bg font-pixel text-xs text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
          1
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-gold-light">{schedule ? SCHEDULE_LABEL : action.label}</p>
          <p className="mt-0.5 text-sm text-rpg-text">{action.reason}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              <dt className="inline-flex items-center gap-1.5 text-rpg-muted">
                <r.icon size={14} aria-hidden /> {r.label}
              </dt>
              <dd className="text-right text-rpg-text">
                {r.value}
                {r.hint && <span className="block text-[10px] text-rpg-muted">{r.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3">
        {schedule ? (
          <>
            <RPGButton variant="gold" className="w-full justify-center" onClick={onSchedule}>
              <CalendarPlus size={15} aria-hidden /> {SCHEDULE_LABEL}
            </RPGButton>
            <p className="mt-1.5 text-[11px] text-rpg-muted">Cria um bloco de tempo para esta tarefa na sua agenda planejada (Capacity Planner). Você confere data, horário e conflitos antes de confirmar.</p>
          </>
        ) : action.link ? (
          <Link to={action.link} className={rpgButtonClass("gold", "w-full justify-center")}>
            <ArrowRight size={15} aria-hidden /> {action.label}
          </Link>
        ) : null}
      </div>
      {secondary.length > 0 && (
        <div className="mt-3 border-t border-rpg-border/50 pt-2">
          <p className="text-[11px] text-rpg-muted">Outras opções</p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {secondary.map((a) =>
              a.link ? (
                <li key={a.label}>
                  <Link to={a.link} className="text-xs text-rpg-blue hover:underline">
                    {a.label}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}
    </RPGPanel>
  );
}

/**
 * Prévia + confirmação da reserva na agenda. Mostra tarefa, data, horário,
 * duração, agenda do dia, conflitos e carga antes/depois. Só cria ao confirmar
 * (POST /bottlenecks/focus/schedule → um bloco em planned_time_blocks).
 */
export function ScheduleBlockModal({
  open,
  onClose,
  initial,
  taskTitle,
  saving,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  initial: FocusInput | null;
  taskTitle: string;
  saving: boolean;
  onConfirm: (input: FocusInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FocusInput | null>(initial);
  const [preview, setPreview] = useState<FocusPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
  useEffect(() => {
    if (!open || !form) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(() => {
      bottlenecksService
        .focusPreview(form)
        .then((p) => alive && setPreview(p))
        .catch((e: unknown) => alive && (setPreview(null), setError(e instanceof Error ? e.message : "Não foi possível calcular a prévia.")))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open, form]);

  const conflicts = preview?.conflicts ?? [];
  return (
    <Modal
      open={open && !!form}
      onClose={onClose}
      title={SCHEDULE_LABEL}
      footer={
        <>
          <RPGButton variant="secondary" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton
            variant="primary"
            disabled={!preview || conflicts.length > 0 || saving || loading}
            onClick={() =>
              form &&
              void onConfirm(form).catch((e: unknown) => setError(e instanceof Error ? e.message : "Não foi possível reservar o horário."))
            }
          >
            {saving ? "Reservando…" : "Confirmar reserva"}
          </RPGButton>
        </>
      }
    >
      {form && (
        <div className="space-y-3">
          <p className="text-sm text-rpg-text">
            <Sparkles size={14} className="inline text-rpg-purple mr-1" aria-hidden />
            Tarefa: <strong>{taskTitle}</strong>
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-rpg-muted">Data</span>
              <input type="date" className={`${rpgFieldClass} mt-1`} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Início</span>
              <input type="time" step={900} className={`${rpgFieldClass} mt-1`} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Duração (minutos)</span>
              <input type="number" min={15} max={240} step={15} className={`${rpgFieldClass} mt-1`} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) || 15 })} />
            </label>
          </div>
          {loading && <div className="h-16 rpg-bar animate-pulse" aria-label="Calculando prévia" />}
          {preview && !loading && (
            <div className="space-y-2 text-sm">
              <p className="text-rpg-text">
                {preview.start}–{preview.end} · bloco de trabalho reservado na sua agenda planejada
              </p>
              <p className="text-xs text-rpg-muted">
                Agenda do dia ocupada: {preview.capacity.before}% → {preview.capacity.after ?? "—"}%
                {preview.capacity.after !== null && preview.capacity.after > 100 && <span className="block text-rpg-orange">Isso significa que o dia passaria do seu tempo disponível — considere outra data.</span>}
              </p>
              {conflicts.length > 0 ? (
                <div className="border border-rpg-red/60 bg-rpg-red/10 p-2 text-xs text-rpg-red" role="alert">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle size={13} aria-hidden /> Esse horário já está ocupado
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {conflicts.map((c) => (
                      <li key={`${c.start}-${c.title}`}>
                        {c.start}–{c.end} {c.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-rpg-green">Horário livre na agenda.</p>
              )}
              {preview.agenda.length > 0 && (
                <details className="text-xs text-rpg-muted">
                  <summary className="cursor-pointer">O que já está na agenda deste dia ({preview.agenda.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {preview.agenda.map((a) => (
                      <li key={`${a.start}-${a.title}`}>
                        {a.start}–{a.end} {a.title}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {error && (
            <p className="text-xs text-rpg-red" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
