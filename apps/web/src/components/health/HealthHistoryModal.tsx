import { Dumbbell, Droplets, Edit2, Moon, Smile, Trash2, X } from "lucide-react";
import type React from "react";
import type { MoodEntry, SleepEntry, WaterEntry, Workout } from "@/types";
import { fmtDateTime, formatHM } from "./healthUtils";

export type HealthHistoryKind = "water" | "sleep" | "workouts" | "mood";

export type HealthEditTarget =
  | { kind: "water"; entry: WaterEntry }
  | { kind: "sleep"; entry: SleepEntry }
  | { kind: "workouts"; entry: Workout }
  | { kind: "mood"; entry: MoodEntry };

export function HealthHistoryModal({
  kind,
  water,
  sleep,
  workouts,
  mood,
  onClose,
  onEdit,
  onDelete,
}: {
  kind: HealthHistoryKind;
  water: WaterEntry[];
  sleep: SleepEntry[];
  workouts: Workout[];
  mood: MoodEntry[];
  onClose: () => void;
  onEdit: (target: HealthEditTarget) => void;
  onDelete: (kind: HealthHistoryKind, id: string) => void;
}) {
  const title =
    kind === "water"
      ? "Historico de agua"
      : kind === "sleep"
        ? "Historico de sono"
        : kind === "workouts"
          ? "Historico de exercicios"
          : "Historico de humor e energia";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-paper-border bg-paper-raised p-5 shadow-card-dark dark:border-ink-border dark:bg-ink-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-display text-base font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate transition-colors hover:text-inherit" title="Fechar">
            <X size={18} />
          </button>
        </div>

        {kind === "water" && (
          <HistoryList
            empty="Nenhum registro de agua ainda."
            items={water.map((entry) => ({
              id: entry.id,
              icon: <Droplets size={14} className="text-cat-blue" />,
              title: `${entry.amount_ml}ml`,
              meta: fmtDateTime(entry.recorded_at),
              onEdit: () => onEdit({ kind: "water", entry }),
              onDelete: () => onDelete("water", entry.id),
            }))}
          />
        )}

        {kind === "sleep" && (
          <HistoryList
            empty="Nenhum registro de sono ainda."
            items={sleep.map((entry) => ({
              id: entry.id,
              icon: <Moon size={14} className="text-cat-purple" />,
              title: `${entry.duration_minutes ? formatHM(entry.duration_minutes) : "Sem duracao"}${entry.quality ? ` · qualidade ${entry.quality}/5` : ""}`,
              meta: fmtDateTime(entry.went_to_bed_at),
              onEdit: () => onEdit({ kind: "sleep", entry }),
              onDelete: () => onDelete("sleep", entry.id),
            }))}
          />
        )}

        {kind === "workouts" && (
          <HistoryList
            empty="Nenhum exercicio registrado ainda."
            items={workouts.map((entry) => ({
              id: entry.id,
              icon: <Dumbbell size={14} className="text-cat-green" />,
              title: `${entry.kind}${entry.duration_minutes ? ` · ${entry.duration_minutes}min` : ""}${entry.distance_km ? ` · ${entry.distance_km}km` : ""}`,
              meta: fmtDateTime(entry.performed_at),
              onEdit: () => onEdit({ kind: "workouts", entry }),
              onDelete: () => onDelete("workouts", entry.id),
            }))}
          />
        )}

        {kind === "mood" && (
          <HistoryList
            empty="Nenhum registro de humor ainda."
            items={mood.map((entry) => ({
              id: entry.id,
              icon: <Smile size={14} className="text-signal-deep" />,
              title: `humor ${entry.mood}/5 · energia ${entry.energy}/5${entry.stress ? ` · estresse ${entry.stress}/5` : ""}`,
              meta: fmtDateTime(entry.recorded_at),
              onEdit: () => onEdit({ kind: "mood", entry }),
              onDelete: () => onDelete("mood", entry.id),
            }))}
          />
        )}
      </div>
    </div>
  );
}

function HistoryList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{
    id: string;
    icon: React.ReactNode;
    title: string;
    meta: string;
    onEdit: () => void;
    onDelete: () => void;
  }>;
}) {
  if (items.length === 0) return <p className="text-sm text-slate">{empty}</p>;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-paper-border px-3 py-2.5 text-sm dark:border-ink-border"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{item.icon}</span>
            <span className="truncate font-medium">{item.title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-slate sm:inline">{item.meta}</span>
            <button onClick={item.onEdit} className="text-slate transition-colors hover:text-brand-600" title="Editar registro">
              <Edit2 size={14} />
            </button>
            <button onClick={item.onDelete} className="text-slate transition-colors hover:text-drop" title="Excluir registro">
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
