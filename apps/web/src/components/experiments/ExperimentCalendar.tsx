import { motion } from "motion/react";
import clsx from "clsx";
import { Bot, PenLine } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { ExperimentCheckinDay, ExperimentLog } from "@/types";

/**
 * Calendário do experimento inteiro (semanas de seg a dom). Cada dia mostra
 * se o comportamento foi cumprido, a origem do check-in (automático/manual)
 * e um ponto rosa quando há observação. Clicar abre o registro daquele dia.
 */

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];
const PERCEPTION_EMOJI: Record<string, string> = { muito_ruim: "😞", ruim: "🙁", neutro: "😐", bom: "🙂", muito_bom: "😄" };

function eachDay(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function ExperimentCalendar({
  startDate,
  endDate,
  checkins,
  logs,
  onSelectDay,
}: {
  startDate: string;
  endDate: string;
  checkins: ExperimentCheckinDay[];
  logs: ExperimentLog[];
  onSelectDay?: (date: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const logByDate = new Map(logs.map((l) => [l.log_date, l]));
  const days = eachDay(startDate, endDate);
  const lead = (new Date(`${startDate}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  const done = checkins.filter((c) => c.status === "done").length;
  const missed = checkins.filter((c) => c.status === "missed").length;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold">Calendário do experimento</p>
        <span className="text-[11px] text-slate">
          <strong className="text-cat-green">{done}</strong> cumpridos · <strong className="text-drop">{missed}</strong> não cumpridos
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[10px] text-slate font-medium">{w}</span>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {days.map((date, i) => {
          const c = byDate.get(date);
          const log = logByDate.get(date);
          const future = date > today;
          const status = future ? "future" : c?.status ?? "pending";
          return (
            <motion.button
              key={date}
              type="button"
              disabled={future || !onSelectDay}
              onClick={() => onSelectDay?.(date)}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.012, 0.4) }}
              title={`${date.split("-").reverse().join("/")} — ${status === "done" ? "cumprido" : status === "missed" ? "não cumprido" : status === "future" ? "ainda não chegou" : "sem registro"}${log?.notes ? ` · "${log.notes.slice(0, 60)}"` : ""}`}
              className={clsx(
                "relative aspect-square rounded-lg text-[11px] font-semibold flex items-center justify-center border transition-colors",
                status === "done" && "bg-cat-green/15 border-cat-green/50 text-cat-green hover:bg-cat-green/25",
                status === "missed" && "bg-drop/10 border-drop/35 text-drop hover:bg-drop/20",
                status === "pending" && "border-dashed border-paper-border dark:border-ink-border text-slate hover:border-cat-purple/60",
                status === "future" && "border-paper-border/50 dark:border-ink-border/50 text-slate/40",
                date === today && "ring-2 ring-cat-purple ring-offset-1 ring-offset-paper-raised dark:ring-offset-ink-raised"
              )}
            >
              {log?.perception ? <span className="text-sm leading-none">{PERCEPTION_EMOJI[log.perception]}</span> : Number(date.slice(8, 10))}
              {c && c.source !== "none" && (
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border flex items-center justify-center text-slate">
                  {c.source === "automatic" ? <Bot size={8} /> : <PenLine size={8} />}
                </span>
              )}
              {log?.notes && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-cat-pink" aria-hidden />}
            </motion.button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-slate">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cat-green/40" /> Cumprido</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-drop/35" /> Não cumprido</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-dashed border-slate/50" /> Sem registro</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cat-pink" /> Observação</span>
        <span className="inline-flex items-center gap-1"><Bot size={10} /> Automático</span>
        <span className="inline-flex items-center gap-1"><PenLine size={10} /> Manual</span>
      </div>
    </Card>
  );
}
