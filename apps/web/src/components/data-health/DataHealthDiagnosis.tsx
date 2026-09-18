import { Sparkles } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";

export function DataHealthDiagnosis({ diagnosis }: { diagnosis: string }) {
  return (
    <Card className="p-5 flex items-start gap-3">
      <IconBadge tone="purple" icon={<Sparkles size={18} />} size={36} />
      <div className="min-w-0">
        <p className="text-sm font-semibold mb-1">🩺 Diagnóstico do LifeOS</p>
        <p className="text-xs text-slate leading-relaxed">{diagnosis}</p>
      </div>
    </Card>
  );
}
