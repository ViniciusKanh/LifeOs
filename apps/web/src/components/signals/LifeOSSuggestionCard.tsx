import { Sparkles, Wand2 } from "lucide-react";
import { Card, Button, IconBadge } from "@/components/ui/primitives";
import { useSignalsAISuggestion } from "@/hooks/useSignals";
import type { SignalPeriod, SignalsRecommendation } from "@/types";

export function LifeOSSuggestionCard({ period, recommendation }: { period: SignalPeriod; recommendation: SignalsRecommendation }) {
  const aiSuggestion = useSignalsAISuggestion();
  const display = aiSuggestion.data ?? recommendation;

  return (
    <Card className="p-5 bg-gradient-to-br from-brand-500/5 to-signal/5">
      <div className="flex items-start gap-3">
        <IconBadge tone="purple" icon={<Sparkles size={18} />} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate">Sugestão do LifeOS</p>
          <p className="text-sm font-semibold mt-0.5">{display.title}</p>
          <p className="text-sm text-slate mt-1.5 leading-snug">{display.message}</p>
          <p className="text-[11px] text-slate mt-2">
            {display.source === "ai" ? "Texto reescrito pelo LifeOS Copilot (Gemini) sobre a mesma sugestão determinística." : "Sugestão baseada em regras a partir dos seus dados reais."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="secondary" onClick={() => aiSuggestion.mutate(period)} disabled={aiSuggestion.isPending}>
          <Wand2 size={15} />
          {aiSuggestion.isPending ? "Consultando Copilot..." : "Pedir análise do Copilot"}
        </Button>
      </div>
    </Card>
  );
}
