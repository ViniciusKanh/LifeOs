import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Clock3, Sparkles, Swords, Target, Zap, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton, RPGPanel, rpgButtonClass } from "@/components/rpg";
import { rpgFieldClass } from "@/components/rpg/rpgAssets";
import { bottlenecksService, type FocusInput, type FocusPreview, type RecommendedAction } from "@/services/bottlenecksService";
import { TIME_SOURCE_LABEL, dayLabel } from "@/utils/bottleneckDisplay";

/** Próxima ação: concreta, com duração, horário e resultado esperado vindos dos dados. */
export function BottleneckRecommendedAction({ action, secondary, today, onSchedule }: { action: RecommendedAction; secondary: RecommendedAction[]; today: string; onSchedule: () => void }) {
  const rows: Array<{ icon: LucideIcon; label: string; value: string; hint?: string }> = [];
  if (action.estimatedMinutes !== null) rows.push({ icon: Clock3, label: "Duração sugerida", value: `${action.estimatedMinutes} minutos${action.preview?.durationSource === "default" ? " (padrão)" : ""}` });
  if (action.preview) rows.push({ icon: CalendarClock, label: "Melhor horário", value: `${dayLabel(action.preview.date, today)}, ${action.preview.start}`, hint: TIME_SOURCE_LABEL[action.preview.timeSource] });
  if (action.expected) rows.push({ icon: Target, label: "Resultado esperado", value: action.expected });
  return (
    <RPGPanel title="Próxima ação recomendada" icon={<Zap size={15} className="text-rpg-gold" />} variant="gold" className="h-full">
      <div className="flex items-start gap-3 border border-rpg-border/60 bg-rpg-bg-2/60 p-3" style={{ borderRadius: 3 }}>
        <Zap size={24} className="shrink-0 text-rpg-gold" aria-hidden />
        <p className="text-sm text-rpg-text">{action.reason}</p>
      </div>
      {rows.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <dt className="inline-flex items-center gap-1.5 text-rpg-muted">
                <r.icon size={14} aria-hidden /> {r.label}
              </dt>
              <dd className="text-right text-rpg-text" title={r.hint}>
                {r.value}
                {r.hint && <span className="block text-[10px] text-rpg-muted">{r.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3">
        {action.type === "SCHEDULE_FOCUS" ? (
          <RPGButton variant="primary" className="w-full justify-center" onClick={onSchedule}>
            <Swords size={15} aria-hidden /> Criar sessão Focus
          </RPGButton>
        ) : action.link ? (
          <Link to={action.link} className={rpgButtonClass("primary", "w-full justify-center")}>
            <Swords size={15} aria-hidden /> {action.label}
          </Link>
        ) : null}
      </div>
      {secondary.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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
      )}
    </RPGPanel>
  );
}

/**
 * Prévia + confirmação do Focus. Mostra tarefa, data, horário, duração,
 * agenda do dia, conflitos e carga antes/depois. Só cria ao confirmar.
 */
export function FocusScheduleModal({
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
      title="Criar sessão Focus"
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
              void onConfirm(form).catch((e: unknown) => setError(e instanceof Error ? e.message : "Não foi possível criar a sessão."))
            }
          >
            {saving ? "Criando…" : "Confirmar sessão"}
          </RPGButton>
        </>
      }
    >
      {form && (
        <div className="space-y-3">
          <p className="text-sm text-rpg-text">
            <Sparkles size={14} className="inline text-rpg-purple mr-1" aria-hidden />
            Missão vinculada: <strong>{taskTitle}</strong>
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
              <span className="text-xs text-rpg-muted">Duração (min)</span>
              <input type="number" min={15} max={240} step={15} className={`${rpgFieldClass} mt-1`} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) || 15 })} />
            </label>
          </div>
          {loading && <div className="h-16 rpg-bar animate-pulse" aria-label="Calculando prévia" />}
          {preview && !loading && (
            <div className="space-y-2 text-sm">
              <p className="text-rpg-text">
                {preview.start}–{preview.end} · bloco de trabalho profundo no Capacity Planner
              </p>
              <p className="text-xs text-rpg-muted">
                Carga do dia: {preview.capacity.before}% → {preview.capacity.after ?? "—"}%
              </p>
              {conflicts.length > 0 ? (
                <div className="border border-rpg-red/60 bg-rpg-red/10 p-2 text-xs text-rpg-red" role="alert">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle size={13} aria-hidden /> Conflitos com a agenda
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
                <p className="text-xs text-rpg-green">Sem conflitos na agenda.</p>
              )}
              {preview.agenda.length > 0 && (
                <details className="text-xs text-rpg-muted">
                  <summary className="cursor-pointer">Agenda planejada do dia ({preview.agenda.length})</summary>
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
