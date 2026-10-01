import { motion } from "motion/react";
import clsx from "clsx";
import { Activity, BatteryCharging, Dumbbell, Moon, Repeat, Users } from "lucide-react";
import type { ProfessionalComparison, ProfessionalOverview } from "@/types";

/**
 * Blocos de cruzamento de dados da área Profissional. Só apresentação:
 * todos os números chegam prontos de GET /api/professional/overview.
 */

function dayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    weekday: d.toLocaleDateString("pt-BR", { weekday: "narrow" }),
    day: d.toLocaleDateString("pt-BR", { day: "2-digit" }),
    full: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
  };
}

type RowDef = {
  key: string;
  label: string;
  color: string;
  value: (d: ProfessionalOverview["daily"][number]) => number | null;
  format: (v: number) => string;
};

const ROWS: RowDef[] = [
  { key: "done", label: "Tarefas", color: "124,77,255", value: (d) => d.done, format: (v) => String(v) },
  { key: "logged", label: "Horas", color: "47,128,255", value: (d) => d.loggedMinutes, format: (v) => (v >= 60 ? `${(v / 60).toFixed(1).replace(".", ",")}h` : `${v}m`) },
  { key: "meetings", label: "Reuniões", color: "255,61,147", value: (d) => d.meetings, format: (v) => String(v) },
  { key: "sleep", label: "Sono", color: "8,182,166", value: (d) => d.sleepHours, format: (v) => `${String(v).replace(".", ",")}h` },
  { key: "energy", label: "Energia", color: "18,183,106", value: (d) => d.energy, format: (v) => String(v).replace(".", ",") },
];

/** Matriz dia × área: intensidade da cor = valor relativo ao maior da linha. Vazio = sem registro (não zero). */
export function DayMatrix({ daily }: { daily: ProfessionalOverview["daily"] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[560px] border-separate" style={{ borderSpacing: 3 }}>
        <caption className="sr-only">Trabalho, sono e energia por dia nos últimos 14 dias</caption>
        <thead>
          <tr>
            <th className="w-16" />
            {daily.map((d) => {
              const h = dayHeader(d.day);
              return (
                <th key={d.day} scope="col" className="text-[10px] font-normal text-slate text-center" title={h.full}>
                  <span className="block uppercase">{h.weekday}</span>
                  <span className="block">{h.day}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const values = daily.map(row.value);
            const max = Math.max(0, ...values.filter((v): v is number => v !== null));
            return (
              <tr key={row.key}>
                <th scope="row" className="text-[11px] font-medium text-slate text-left pr-1 whitespace-nowrap">
                  {row.label}
                </th>
                {values.map((v, i) => {
                  const alpha = v === null || max === 0 ? 0 : 0.12 + (v / max) * 0.78;
                  return (
                    <motion.td
                      key={daily[i].day}
                      initial={{ opacity: 0, scale: 0.6 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.015 }}
                      title={`${dayHeader(daily[i].day).full} — ${row.label}: ${v === null ? "sem registro" : row.format(v)}`}
                      className={clsx(
                        "h-8 rounded-md text-center text-[10px] font-semibold tabular-nums",
                        v === null ? "border border-dashed border-paper-border dark:border-ink-border text-transparent" : "text-white"
                      )}
                      style={v === null ? undefined : { backgroundColor: `rgba(${row.color},${alpha.toFixed(2)})`, color: alpha < 0.45 ? `rgb(${row.color})` : "#fff" }}
                    >
                      {v === null ? "·" : v === 0 ? "" : row.format(v)}
                    </motion.td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const COMPARISON_ICON: Record<ProfessionalComparison["key"], JSX.Element> = {
  sleep: <Moon size={14} />,
  energy: <BatteryCharging size={14} />,
  workout: <Dumbbell size={14} />,
  habits: <Repeat size={14} />,
  meetings: <Users size={14} />,
};

function fmt(v: number | null) {
  return v === null ? "—" : String(v).replace(".", ",");
}

/** "Dias com X vs sem X": média de tarefas profissionais concluídas e horas registradas por dia. */
export function ComparisonGrid({ comparisons, windowDays }: { comparisons: ProfessionalComparison[]; windowDays: number }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
        {comparisons.map((c, i) => {
          const max = Math.max(c.withAvgDone ?? 0, c.withoutAvgDone ?? 0, 0.1);
          const positive = (c.deltaPct ?? 0) >= 0;
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl border border-paper-border dark:border-ink-border p-3"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="text-cat-purple">{COMPARISON_ICON[c.key]}</span> {c.label}
              </p>
              {c.reason ? (
                <p className="text-[11px] text-slate mt-2">{c.reason}</p>
              ) : (
                <>
                  {c.deltaPct !== null && (
                    <p className={clsx("font-display font-bold text-lg mt-1.5", positive ? "text-growth" : "text-drop")}>
                      {positive ? "+" : ""}
                      {c.deltaPct}%
                    </p>
                  )}
                  <div className="mt-1.5 space-y-1.5">
                    {[
                      { label: c.withLabel, done: c.withAvgDone, min: c.withAvgMinutes, days: c.withDays, tone: "bg-cat-purple" },
                      { label: c.withoutLabel, done: c.withoutAvgDone, min: c.withoutAvgMinutes, days: c.withoutDays, tone: "bg-slate/40" },
                    ].map((g) => (
                      <div key={g.label}>
                        <div className="flex justify-between text-[10px] text-slate">
                          <span>
                            {g.label} ({g.days}d)
                          </span>
                          <span className="font-semibold text-inherit">{fmt(g.done)} tarefas/dia</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden mt-0.5">
                          <motion.div
                            className={clsx("h-full rounded-full", g.tone)}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${((g.done ?? 0) / max) * 100}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                        {g.min !== null && g.min > 0 && <p className="text-[10px] text-slate mt-0.5">{Math.round(g.min)} min registrados/dia</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate mt-2 flex items-start gap-1">
        <Activity size={11} className="shrink-0 mt-px" />
        Comparação dos últimos {windowDays} dias, desde a sua primeira tarefa profissional. Mostra uma associação observada nos seus registros — não prova causa e efeito.
      </p>
    </div>
  );
}

/** Tarefas profissionais concluídas por dia da semana (janela da visão). */
export function WeekdayBars({ weekday, best }: { weekday: ProfessionalOverview["weekday"]; best: ProfessionalOverview["bestWeekday"] }) {
  const max = Math.max(1, ...weekday.map((w) => w.done));
  // Segunda a domingo, ordem de semana de trabalho.
  const ordered = [...weekday.slice(1), weekday[0]];
  return (
    <div>
      <div className="flex items-end gap-2 h-28" role="img" aria-label="Tarefas profissionais concluídas por dia da semana">
        {ordered.map((w, i) => (
          <div key={w.weekday} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
            <span className="text-[10px] text-slate tabular-nums">{w.done || ""}</span>
            <motion.div
              className={clsx("w-full rounded-t-md", best && w.label === best.label ? "bg-gradient-to-t from-cat-purple to-cat-blue" : "bg-cat-purple/35")}
              initial={{ height: 0 }}
              whileInView={{ height: `${Math.max((w.done / max) * 100, w.done > 0 ? 6 : 2)}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            />
            <span className="text-[10px] text-slate">{w.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate mt-2">
        {best ? (
          <>
            Seu dia mais produtivo no trabalho é <strong className="text-inherit">{best.label}</strong> ({best.done} tarefas no período).
          </>
        ) : (
          "Conclua pelo menos 5 tarefas profissionais para descobrir seu melhor dia."
        )}
      </p>
    </div>
  );
}
