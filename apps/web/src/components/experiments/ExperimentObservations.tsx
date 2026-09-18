import { Plus } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import type { ExperimentLog, ExperimentPerception } from "@/types";

const PERCEPTION_EMOJI: Record<ExperimentPerception, string> = {
  muito_ruim: "😞",
  ruim: "🙁",
  neutro: "😐",
  bom: "🙂",
  muito_bom: "😄",
};

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
}

/** Observações recentes (seção 16) — só as que têm texto, mais recentes primeiro. */
export function ExperimentObservations({ logs, onNewObservation, limit }: { logs: ExperimentLog[]; onNewObservation: () => void; limit?: number }) {
  const withNotes = [...logs].filter((l) => l.notes).sort((a, b) => b.log_date.localeCompare(a.log_date));
  const visible = limit ? withNotes.slice(0, limit) : withNotes;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Observações recentes</p>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-slate py-4 text-center">Nenhuma observação registrada ainda.</p>
      ) : (
        <ul className="space-y-3 mb-3">
          {visible.map((log) => (
            <li key={log.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0">{log.perception ? PERCEPTION_EMOJI[log.perception] : "📝"}</span>
              <div>
                <p className="text-slate">{formatShortDate(log.log_date)}</p>
                <p className="text-inherit mt-0.5">{log.notes}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" className="w-full" onClick={onNewObservation}>
        <Plus size={15} /> Nova observação
      </Button>
    </Card>
  );
}

export function ExperimentObservationsEmpty({ onCreate }: { onCreate: () => void }) {
  return <EmptyState title="Sem observações" description="Registre como você tem se sentido durante o experimento." ctaLabel="Nova observação" onCta={onCreate} />;
}
