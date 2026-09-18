import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

export function DateNavigator({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="secondary" className="!px-2.5" onClick={() => onChange(addDays(date, -1))} aria-label="Dia anterior">
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-semibold capitalize min-w-[132px] text-center">{formatLabel(date)}</span>
      <Button variant="secondary" className="!px-2.5" onClick={() => onChange(addDays(date, 1))} aria-label="Dia seguinte">
        <ChevronRight size={16} />
      </Button>
      <Button variant={date === today ? "primary" : "secondary"} onClick={() => onChange(today)}>
        Hoje
      </Button>
      <Button variant={date === tomorrow ? "primary" : "secondary"} onClick={() => onChange(tomorrow)}>
        Amanhã
      </Button>
    </div>
  );
}
