import type { TimelineEvent } from "@/types";

/** Formatação e filtros da Timeline — compartilhados pelas visões clássica e RPG. */
export type EventType = TimelineEvent["type"];

export const TABS: Array<{ value: EventType | "todos"; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "task", label: "Tarefas" },
  { value: "habit", label: "Hábitos" },
  { value: "education", label: "Estudo" },
  { value: "work_note", label: "Profissional" },
  { value: "workout", label: "Saúde" },
  { value: "reading", label: "Leitura" },
  { value: "sleep", label: "Sono" },
  { value: "mood", label: "Humor" },
  { value: "water", label: "Água" },
  { value: "experiment", label: "Experimentos" },
  { value: "journal", label: "Diário" },
  // Marcos da jornada: aparecem como filtro só quando há registro no período.
  { value: "focus", label: "Foco" },
  { value: "project", label: "Campanhas" },
  { value: "contract", label: "Contratos" },
  { value: "achievement", label: "Conquistas" },
  { value: "reward", label: "Recompensas" },
  { value: "level_up", label: "Nível" },
  { value: "review", label: "Revisões" },
  { value: "life_admin", label: "Administração" },
];

/** Filtros que só aparecem quando existe ao menos um evento daquele tipo. */
export const OPTIONAL_TABS = new Set<string>(["focus", "project", "contract", "achievement", "reward", "level_up", "review", "life_admin"]);
export const DAYS_PAGE = 10;

export const RANGE_OPTIONS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 14, label: "Últimos 14 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
];

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** Título de ação + detalhe real do evento — nunca um texto genérico sem dado por trás. */
export function eventContent(e: TimelineEvent): { title: string; detail: string | null } {
  switch (e.type) {
    case "task":
      return { title: "Tarefa concluída", detail: e.project_name ? `${e.label} · ${e.project_name}` : (e.label as string) };
    case "mood":
      return {
        title: "Humor e energia",
        detail: `humor ${e.mood}/5 · energia ${e.energy}/5${e.stress ? ` · estresse ${e.stress}/5` : ""}`,
      };
    case "water":
      return { title: "Água", detail: `${e.amount_ml}ml` };
    case "habit":
      return { title: e.label, detail: Number(e.count ?? 1) > 1 ? `${e.count}x hoje` : "Hábito concluído" };
    case "workout": {
      const parts: string[] = [];
      if (e.duration_minutes) parts.push(formatMinutes(Number(e.duration_minutes)));
      if (e.distance_km) parts.push(`${e.distance_km} km`);
      return { title: e.label, detail: parts.length > 0 ? parts.join(" · ") : null };
    }
    case "reading":
      return { title: "Leitura", detail: `${e.pages_read ?? 0} páginas · ${e.label}` };
    case "education":
      return { title: "Disciplina concluída", detail: e.label };
    case "work_note":
      return { title: "Reunião/anotação profissional", detail: e.label };
    case "sleep":
      return { title: "Dormir", detail: e.duration_minutes ? `${formatMinutes(Number(e.duration_minutes))} de sono` : "Boa noite!" };
    case "experiment":
      return { title: "Experimento pessoal", detail: e.label as string };
    case "journal":
      return { title: "Entrada do diário", detail: "Registrado no Diário do dia" };
    case "focus":
      return { title: "Sessão de foco", detail: `${formatMinutes(Number(e.duration_minutes ?? 0))} · ${e.label}` };
    case "project":
      return { title: "Campanha concluída", detail: e.label };
    case "achievement":
      return { title: "Conquista desbloqueada", detail: e.label };
    case "contract":
      return { title: "Contrato cumprido", detail: e.label.replace(/^Contrato cumprido: /, "") };
    case "reward":
      return { title: "Recompensa resgatada", detail: `${e.label} · −${e.cost} moedas` };
    case "level_up":
      return { title: "Level up", detail: `Você chegou ao ${e.label}.` };
    case "review":
    case "life_admin":
      return { title: e.label, detail: null };
    default:
      return { title: e.label, detail: null };
  }
}

export function formatTime(at: string) {
  const iso = at.includes("T") ? at : at.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
export function yesterdayIso() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

export function dayHeaderLabel(day: string) {
  const formatted = new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  if (day === todayIso()) return `Hoje · ${formatted}`;
  if (day === yesterdayIso()) return `Ontem · ${formatted}`;
  return formatted;
}

/** Rótulo curto usado nos "Destaques" (sem a data completa) — "hoje", "ontem" ou "há N dias". */
export function relativeDayLabel(day: string) {
  if (day === todayIso()) return "hoje";
  if (day === yesterdayIso()) return "ontem";
  const diffDays = Math.round((Date.parse(todayIso()) - Date.parse(day)) / 86_400_000);
  return `há ${diffDays} dias`;
}

