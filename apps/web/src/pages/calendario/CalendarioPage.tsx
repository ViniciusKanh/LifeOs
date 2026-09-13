import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import type { CalendarItem } from "@/types";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const SOURCE_TONE: Record<CalendarItem["sourceType"], "blue" | "purple" | "green" | "amber"> = {
  manual: "blue",
  task: "amber",
  goal: "purple",
  academic_project: "green",
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Grade de dias do mês, sempre começando na segunda-feira, com semanas completas (dias do mês vizinho incluídos e esmaecidos). */
function buildMonthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = segunda
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarioPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getUTCFullYear(), month: today.getUTCMonth() });
  const [newEventDate, setNewEventDate] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const rangeFrom = toISODate(grid[0]);
  const rangeTo = toISODate(grid[grid.length - 1]);

  const { items, isLoading, createEvent, removeEvent } = useEvents(rangeFrom, rangeTo);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const day = item.startsAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return map;
  }, [items]);

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const changeMonth = (delta: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  const handleCreate = async () => {
    if (!title.trim() || !newEventDate) return;
    await createEvent({ title: title.trim(), startsAt: newEventDate, allDay: true });
    setTitle("");
    setNewEventDate(null);
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-display font-bold text-2xl tracking-tight capitalize">{monthLabel}</p>
          <p className="text-sm text-slate mt-0.5">Prazos de tarefas, metas e TCC, mais os eventos que você criar aqui.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" onClick={() => setCursor({ year: today.getUTCFullYear(), month: today.getUTCMonth() })}>
            Hoje
          </Button>
          <Button variant="secondary" onClick={() => changeMonth(1)} aria-label="Próximo mês">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <Card className="p-3 md:p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[11px] font-semibold text-slate py-1.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getUTCMonth() === cursor.month;
            const isToday = iso === toISODate(today);
            const dayItems = itemsByDay.get(iso) ?? [];
            return (
              <button
                key={iso}
                onClick={() => setNewEventDate(iso)}
                className={`group text-left min-h-[86px] rounded-xl p-1.5 border transition-colors ${
                  inMonth
                    ? "border-paper-border dark:border-ink-border bg-paper dark:bg-ink"
                    : "border-transparent bg-transparent opacity-40"
                } hover:border-brand-500/40`}
              >
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                    isToday ? "bg-gradient-to-r from-brand-500 to-signal text-white font-semibold" : "text-slate"
                  }`}
                >
                  {d.getUTCDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={`block truncate text-[10px] px-1.5 py-0.5 rounded-md ${
                        item.sourceType === "task"
                          ? "bg-signal/15 text-signal-deep dark:text-signal"
                          : item.sourceType === "goal"
                            ? "bg-cat-purple/15 text-cat-purple dark:text-cat-purple-dark"
                            : item.sourceType === "academic_project"
                              ? "bg-cat-green/15 text-cat-green dark:text-cat-green-dark"
                              : "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                      }`}
                      title={item.title}
                    >
                      {item.title}
                    </span>
                  ))}
                  {dayItems.length > 3 && <span className="block text-[10px] text-slate pl-1">+{dayItems.length - 3} mais</span>}
                </div>
              </button>
            );
          })}
        </div>
        {isLoading && <p className="text-xs text-slate text-center mt-3">Carregando…</p>}
      </Card>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Evento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-signal" /> Tarefa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cat-purple" /> Meta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cat-green" /> Acadêmico
        </span>
      </div>

      {/* painel do dia selecionado */}
      {newEventDate && (
        <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center bg-black/40" onClick={() => setNewEventDate(null)}>
          <Card className="w-full md:max-w-md p-5 md:p-6 rounded-b-none md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display font-semibold text-lg">
                {new Date(`${newEventDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
              <button onClick={() => setNewEventDate(null)} className="text-slate">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {(itemsByDay.get(newEventDate) ?? []).length === 0 && (
                <p className="text-sm text-slate">Nada agendado ainda para este dia.</p>
              )}
              {(itemsByDay.get(newEventDate) ?? []).map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2">
                  <IconBadge icon={<span className="text-xs font-bold">{item.title.slice(0, 1).toUpperCase()}</span>} tone={SOURCE_TONE[item.sourceType]} size={28} />
                  <button
                    className="flex-1 text-left text-sm truncate"
                    onClick={() => item.link && navigate(item.link)}
                    disabled={!item.link}
                  >
                    {item.title}
                  </button>
                  {item.sourceType === "manual" && (
                    <button onClick={() => removeEvent(item.id)} className="text-slate hover:text-drop shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Novo evento" placeholder="Ex.: Consulta médica" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <Button onClick={handleCreate} disabled={!title.trim()}>
                <Plus size={15} /> Criar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
