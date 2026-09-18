import { Card } from "@/components/ui/primitives";
import { EFFORT_COLOR } from "./capacityColors";
import type { CapacityPlannedBlock, CapacityConflict } from "@/types";

export function DayTimeline({ blocks, conflicts }: { blocks: CapacityPlannedBlock[]; conflicts: CapacityConflict[] }) {
  const conflictIds = new Set(conflicts.map((c) => c.blockId).filter(Boolean));
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-4">Planejamento do dia</p>
      {blocks.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">Nada planejado ainda. Adicione tarefas com horário ou use o ajuste automático.</p>
      ) : (
        <ol className="space-y-3">
          {blocks
            .slice()
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((b) => {
              const hasConflict = conflictIds.has(b.id);
              return (
                <li key={b.id} className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-slate w-12 shrink-0 pt-0.5">{b.startTime}</span>
                  <div
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 border-l-4"
                    style={{
                      borderColor: b.projectColor ?? EFFORT_COLOR[b.blockType],
                      background: `${b.projectColor ?? EFFORT_COLOR[b.blockType]}14`,
                    }}
                  >
                    <p className="text-sm font-medium truncate">{b.title}</p>
                    <p className="text-[11px] text-slate">
                      {b.startTime}–{b.endTime}
                    </p>
                    {hasConflict && (
                      <p className="text-[11px] text-drop font-medium mt-1">
                        {conflicts.find((c) => c.blockId === b.id)?.reason}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      )}
    </Card>
  );
}
