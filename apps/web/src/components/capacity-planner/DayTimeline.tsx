import { X } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { EFFORT_COLOR } from "./capacityColors";
import type { CapacityPlannedBlock, CapacityConflict } from "@/types";

export function DayTimeline({
  blocks,
  conflicts,
  onRemoveBlock,
}: {
  blocks: CapacityPlannedBlock[];
  conflicts: CapacityConflict[];
  onRemoveBlock: (blockId: string) => void;
}) {
  const conflictIds = new Set(conflicts.map((c) => c.blockId).filter(Boolean));
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold mb-4">Planejamento do dia</p>
      {blocks.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">Nada planejado ainda. Agende uma tarefa ou use o ajuste automático.</p>
      ) : (
        <ol className="space-y-3">
          {blocks
            .slice()
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((b) => {
              const hasConflict = conflictIds.has(b.id);
              const removable = b.entityType !== "event";
              return (
                <li key={b.id} className="flex items-start gap-3 group">
                  <span className="text-xs font-semibold text-slate w-12 shrink-0 pt-0.5">{b.startTime}</span>
                  <div
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 border-l-4 flex items-start justify-between gap-2"
                    style={{
                      borderColor: b.projectColor ?? EFFORT_COLOR[b.blockType],
                      background: `${b.projectColor ?? EFFORT_COLOR[b.blockType]}14`,
                    }}
                  >
                    <div className="min-w-0">
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
                    {removable && (
                      <button
                        onClick={() => onRemoveBlock(b.id)}
                        className="shrink-0 p-1 rounded-lg text-slate opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-drop/10 hover:text-drop transition-all"
                        aria-label={`Remover "${b.title}" do planejamento`}
                        title="Remover"
                      >
                        <X size={14} />
                      </button>
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
