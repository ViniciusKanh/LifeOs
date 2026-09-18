import { useState } from "react";
import { BarChart3, Loader2, Sparkles } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { experimentService } from "@/services/experimentService";
import type { ExperimentAISuggestion, ExperimentInsightStat } from "@/types";

/** Cartão "Insights dos seus experimentos" (seção 36) — só aparece com experimentos concluídos reais. */
export function ExperimentInsightsCard({ insights }: { insights: ExperimentInsightStat[] }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 size={16} className="text-cat-purple" />
        <p className="text-sm font-semibold">Insights dos seus experimentos</p>
      </div>
      <p className="text-xs text-slate mb-4">Baseado nos seus experimentos concluídos.</p>

      {insights.length === 0 ? (
        <p className="text-xs text-slate">Conclua seu primeiro experimento para começar a ver padrões aqui.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {insights.map((stat) => (
            <div key={stat.label}>
              <p className="font-display font-bold text-lg text-cat-purple">{stat.value}</p>
              <p className="text-[11px] text-slate mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Cartão "Criar um novo experimento" com sugestão via IA (seção 35) — a IA nunca cria sozinha, só propõe um rascunho. */
export function ExperimentAISuggestionCard({ onUseSuggestion }: { onUseSuggestion: (suggestion: ExperimentAISuggestion) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ExperimentAISuggestion | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await experimentService.aiSuggestion();
      setSuggestion(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar uma sugestão agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 md:p-5 bg-gradient-to-br from-cat-purple/5 to-signal/5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-cat-purple" />
        <p className="text-sm font-semibold">Criar um novo experimento</p>
      </div>

      {!suggestion ? (
        <>
          <p className="text-xs text-slate mb-4">Não sabe por onde começar? Use a IA para sugerir um experimento baseado nos seus dados.</p>
          {error && <p className="text-xs text-drop mb-2">{error}</p>}
          <Button onClick={generate} disabled={loading} className="w-full">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Gerar sugestão com IA
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="font-semibold text-sm">{suggestion.title}</p>
          <p className="text-xs text-slate italic">"{suggestion.hypothesis}"</p>
          <p className="text-[11px] text-slate">{suggestion.motivation}</p>
          <p className="text-[11px] text-slate">Duração sugerida: {suggestion.durationDays} dias</p>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => onUseSuggestion(suggestion)}>Usar esta sugestão</Button>
            <Button variant="secondary" onClick={() => setSuggestion(null)}>Descartar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ExperimentsEmptyState({ onCreate, onAskCopilot }: { onCreate: () => void; onAskCopilot: () => void }) {
  return (
    <Card className="py-4">
      <EmptyState
        title="Você ainda não criou nenhum experimento."
        description="Teste uma pequena mudança e descubra o que seus próprios dados mostram."
        ctaLabel="Criar primeiro experimento"
        onCta={onCreate}
      />
      <div className="flex justify-center -mt-4 pb-6">
        <Button variant="ghost" onClick={onAskCopilot}>
          <Sparkles size={15} /> Pedir sugestão ao Copilot
        </Button>
      </div>
    </Card>
  );
}
