import { Umbrella, ChevronRight } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";

export function DicaDoDiaCard({ text }: { text: string }) {
  return (
    <Card className="p-4 bg-cat-green/5 border-cat-green/20">
      <div className="flex items-start gap-3">
        <IconBadge tone="green" icon={<Umbrella size={16} />} size={32} />
        <div className="flex-1">
          <p className="text-xs text-slate">Dica do dia</p>
          <p className="text-sm font-medium mt-0.5 leading-snug">{text}</p>
        </div>
        <ChevronRight size={16} className="text-slate mt-1 shrink-0" />
      </div>
    </Card>
  );
}
