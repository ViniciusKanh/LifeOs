import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Dumbbell,
  GraduationCap,
  Moon,
  Repeat,
  Target,
} from "lucide-react";
import { useTimeline } from "@/hooks/useAnalytics";
import { Card, EmptyState, IconBadge } from "@/components/ui/primitives";
import type { TimelineEvent } from "@/types";

type EventType = TimelineEvent["type"];

const TYPE_CONFIG: Record<
  EventType,
  { tab: string; tag: string; tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber"; icon: typeof CheckCircle2 }
> = {
  task: { tab: "Tarefas", tag: "Tarefas", tone: "blue", icon: CheckCircle2 },
  habit: { tab: "Hábitos", tag: "Hábitos", tone: "pink", icon: Repeat },
  workout: { tab: "Saúde", tag: "Saúde", tone: "green", icon: Dumbbell },
  reading: { tab: "Leitura", tag: "Leitura", tone: "teal", icon: BookOpen },
  focus: { tab: "Foco", tag: "Foco", tone: "purple", icon: Target },
  education: { tab: "Estudo", tag: "Estudo", tone: "amber", icon: GraduationCap },
  sleep: { tab: "Sono", tag: "Sono", tone: "purple", icon: Moon },
};

const TAG_PILL: Record<string, string> = {
  blue: "bg-cat-blue/10 text-cat-blue",
  purple: "bg-cat-purple/10 text-cat-purple",
  green: "bg-cat-green/10 text-cat-green",
  pink: "bg-cat-pink/10 text-cat-pink",
  teal: "bg-cat-teal/10 text-cat-teal",
  amber: "bg-signal/15 text-signal-deep",
};

const TABS: Array<{ value: EventType | "todos"; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "task", label: "Tarefas" },
  { value: "habit", label: "Hábitos" },
  { value: "education", label: "Estudo" },
  { value: "workout", label: "Saúde" },
  { value: "focus", label: "Foco" },
  { value: "reading", label: "Leitura" },
  { value: "sleep", label: "Sono" },
];

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** Título de ação + detalhe real do evento — nunca um texto genérico sem dado por trás. */
function eventContent(e: TimelineEvent): { title: string; detail: string | null } {
  switch (e.type) {
    case "task":
      return { title: "Tarefa concluída", detail: e.label };
    case "habit":
      return { title: e.label, detail: Number(e.count ?? 1) > 1 ? `${e.count}x hoje` : null };
    case "workout": {
      const parts: string[] = [];
      if (e.duration_minutes) parts.push(formatMinutes(Number(e.duration_minutes)));
      if (e.distance_km) parts.push(`${e.distance_km} km`);
      return { title: e.label, detail: parts.length > 0 ? parts.join(" · ") : null };
    }
    case "reading":
      return { title: "Leitura", detail: `${e.pages_read ?? 0} páginas · ${e.label}` };
    case "focus":
      return { title: "Sessão de foco", detail: e.actual_minutes ? `${e.actual_minutes} minutos` : null };
    case "education":
      return { title: "Disciplina concluída", detail: e.label };
    case "sleep":
      return { title: "Dormir", detail: e.duration_minutes ? `${formatMinutes(Number(e.duration_minutes))} de sono` : "Boa noite!" };
    default:
      return { title: e.label, detail: null };
  }
}

function formatTime(at: string) {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayHeaderLabel(day: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const formatted = new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  if (day === today) return `Hoje · ${formatted}`;
  if (day === yesterday) return `Ontem · ${formatted}`;
  return formatted;
}

export function TimelinePage() {
  const [filter, setFilter] = useState<EventType | "todos">("todos");
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = useMemo(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10), []);
  const { events, isLoading } = useTimeline({ from, to });

  const filtered = filter === "todos" ? events : events.filter((e) => e.type === filter);

  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of filtered) {
    const day = String(e.at).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto space-y-4">
      <div>
        <p className="font-display font-semibold text-2xl">Timeline</p>
        <p className="text-sm text-slate mt-1">Histórico cronológico das suas atividades, hábitos, leitura, exercícios, foco e educação.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.value === "todos" ? events.length : events.filter((e) => e.type === t.value).length;
          const active = filter === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active ? "bg-brand-500 text-white border-brand-500" : "border-paper-border dark:border-ink-border text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              {t.label} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {!isLoading && days.length === 0 && (
        <EmptyState
          title="Ainda sem atividade registrada"
          description="Conclua tarefas, registre hábitos, leituras e exercícios para ver sua linha do tempo aparecer aqui."
          ctaLabel="Ver Hoje"
          onCta={() => (window.location.href = "/hoje")}
        />
      )}

      <div className="space-y-4">
        {days.map((day) => {
          const dayEvents = [...byDay.get(day)!].sort((a, b) => String(b.at).localeCompare(String(a.at)));
          return (
            <Card key={day} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">{dayHeaderLabel(day)}</p>
                <span className="text-[11px] text-slate">
                  {dayEvents.length} {dayEvents.length === 1 ? "atividade" : "atividades"}
                </span>
              </div>
              <div className="space-y-3">
                {dayEvents.map((e) => {
                  const cfg = TYPE_CONFIG[e.type];
                  const Icon = cfg.icon;
                  const { title, detail } = eventContent(e);
                  return (
                    <div key={`${e.type}-${e.id}`} className="flex items-center gap-3">
                      <span className="text-xs text-slate w-11 shrink-0 tabular-nums">{formatTime(String(e.at))}</span>
                      <IconBadge icon={<Icon size={16} />} tone={cfg.tone} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{title}</p>
                        {detail && <p className="text-xs text-slate truncate">{detail}</p>}
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-full ${TAG_PILL[cfg.tone]}`}>{cfg.tag}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
