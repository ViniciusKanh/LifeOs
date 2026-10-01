import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Bot, Check, ChevronRight, Loader2, X } from "lucide-react";
import { useExperiment } from "@/hooks/useExperiment";
import { CATEGORY_ICON } from "./experimentDisplay";
import type { ExperimentCheckinStatus, ExperimentListItem, ExperimentPerception } from "@/types";

/**
 * Check-in de hoje com um toque, para cada experimento ativo.
 *  - Manual: "Cumpri" / "Não cumpri" + como se sentiu + nota rápida.
 *  - Automático: mostra o que o LifeOS já verificou; se ainda não há dado,
 *    leva ao módulo de origem (Saúde, Foco…), sem permitir "forjar" o check-in.
 */

const PERCEPTIONS: Array<{ value: ExperimentPerception; emoji: string; label: string }> = [
  { value: "muito_ruim", emoji: "😞", label: "Muito ruim" },
  { value: "ruim", emoji: "🙁", label: "Ruim" },
  { value: "neutro", emoji: "😐", label: "Neutro" },
  { value: "bom", emoji: "🙂", label: "Bom" },
  { value: "muito_bom", emoji: "😄", label: "Muito bom" },
];

/** Onde o dado que a regra automática lê é registrado. */
const RULE_SOURCE: Record<string, { path: string; label: string }> = {
  sleep_before: { path: "/saude", label: "Registrar sono" },
  water_target: { path: "/saude", label: "Registrar água" },
  exercise_minimum: { path: "/saude", label: "Registrar exercício" },
  focus_minimum: { path: "/foco", label: "Abrir Focus" },
  reading_pages_minimum: { path: "/biblioteca", label: "Registrar leitura" },
  study_minimum: { path: "/educacao", label: "Registrar estudo" },
  habit_completion: { path: "/habitos", label: "Marcar hábito" },
};

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function TodayRow({ experiment }: { experiment: ExperimentListItem }) {
  const { detail, upsertLog, isSavingLog } = useExperiment(experiment.id);
  const today = localToday();
  const day = detail?.checkins.find((c) => c.date === today) ?? null;
  const log = detail?.logs.find((l) => l.log_date === today) ?? null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const Icon = CATEGORY_ICON[experiment.category];
  const automatic = experiment.verification_type === "automatic";

  const save = (patch: { checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) =>
    upsertLog({ logDate: today, ...patch }).catch(() => undefined);

  const status = day?.status ?? "pending";

  return (
    <li className="rounded-xl border border-paper-border dark:border-ink-border p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-cat-purple/10 text-cat-purple flex items-center justify-center shrink-0">
          <Icon size={15} />
        </span>
        <Link to={`/experimentos/${experiment.id}`} className="min-w-0 flex-1 group">
          <p className="text-sm font-semibold truncate group-hover:text-cat-purple">{experiment.title}</p>
          <p className="text-[10px] text-slate">Dia {experiment.daysElapsed} de {experiment.durationDays}</p>
        </Link>

        {automatic && day?.source === "automatic" ? (
          <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", status === "done" ? "bg-cat-green/12 text-cat-green" : "bg-drop/10 text-drop")}>
            <Bot size={12} /> {status === "done" ? "Cumprido (automático)" : "Não cumprido (automático)"}
          </span>
        ) : automatic ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate">
            <Bot size={12} /> Aguardando registro do dia
          </span>
        ) : (
          <div className="flex gap-1.5" role="group" aria-label="Você cumpriu hoje?">
            {(["done", "missed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={isSavingLog}
                onClick={() => save({ checkinStatus: status === s ? null : s })}
                aria-pressed={status === s}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors",
                  s === "done"
                    ? status === "done"
                      ? "bg-cat-green text-white border-cat-green"
                      : "border-paper-border dark:border-ink-border hover:border-cat-green hover:text-cat-green"
                    : status === "missed"
                      ? "bg-drop text-white border-drop"
                      : "border-paper-border dark:border-ink-border hover:border-drop hover:text-drop"
                )}
              >
                {isSavingLog ? <Loader2 size={12} className="animate-spin" /> : s === "done" ? <Check size={12} /> : <X size={12} />}
                {s === "done" ? "Cumpri" : "Não cumpri"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 mt-2.5">
        <span className="text-[10px] text-slate mr-1">Como se sentiu?</span>
        {PERCEPTIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            title={p.label}
            aria-label={p.label}
            aria-pressed={log?.perception === p.value}
            onClick={() => save({ perception: log?.perception === p.value ? null : p.value })}
            className={clsx(
              "w-8 h-8 rounded-full text-base leading-none transition-transform hover:scale-110",
              log?.perception === p.value ? "bg-cat-pink/15 ring-2 ring-cat-pink/60" : "opacity-60 hover:opacity-100"
            )}
          >
            {p.emoji}
          </button>
        ))}
        <button type="button" onClick={() => { setNote(log?.notes ?? ""); setNoteOpen((v) => !v); }} className="ml-auto text-[11px] font-medium text-cat-purple hover:underline">
          {log?.notes ? "Editar nota" : "Adicionar nota"}
        </button>
        {automatic && day?.source !== "automatic" && experiment.verification_rule && RULE_SOURCE[experiment.verification_rule] && (
          <Link to={RULE_SOURCE[experiment.verification_rule].path} className="text-[11px] text-slate hover:text-inherit inline-flex items-center">
            {RULE_SOURCE[experiment.verification_rule].label} <ChevronRight size={12} />
          </Link>
        )}
      </div>

      <AnimatePresence initial={false}>
        {noteOpen && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              await save({ notes: note.trim() || null });
              setNoteOpen(false);
            }}
          >
            <div className="flex gap-2 mt-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="O que você notou hoje?"
                aria-label="Observação do dia"
                className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm bg-transparent border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple"
              />
              <button type="submit" disabled={isSavingLog} className="rounded-lg px-3 py-2 text-xs font-semibold bg-cat-purple text-white disabled:opacity-50">
                Salvar
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </li>
  );
}

export function ExperimentTodayCheckin({ experiments }: { experiments: ExperimentListItem[] }) {
  const active = experiments.filter((e) => e.status === "active");
  if (active.length === 0) return null;
  return (
    <section aria-labelledby="exp-today-title" className="rounded-2xl border border-cat-purple/25 bg-gradient-to-br from-cat-purple/[0.06] to-transparent p-4 md:p-5">
      <p id="exp-today-title" className="font-display font-semibold text-[15px]">Check-in de hoje</p>
      <p className="text-xs text-slate mb-3">Um toque por experimento. Os automáticos o LifeOS confere sozinho pelos seus registros.</p>
      <ul className="space-y-2">
        {active.map((e) => (
          <TodayRow key={e.id} experiment={e} />
        ))}
      </ul>
    </section>
  );
}
