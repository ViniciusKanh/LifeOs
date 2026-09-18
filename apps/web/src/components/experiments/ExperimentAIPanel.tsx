import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";

const QUICK_QUESTIONS = ["Resuma este experimento.", "Quais padrões apareceram?", "Vale a pena repetir?", "Sugira um próximo experimento."];

/** Botão "Analisar com Copilot" (seção 34) — só lê agregados já calculados, nunca ação destrutiva. */
export function ExperimentAIPanel({ onAnalyze, isAnalyzing, text, error }: { onAnalyze: (question?: string) => void; isAnalyzing: boolean; text: string | null; error: boolean }) {
  const [question, setQuestion] = useState("");

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-cat-purple" />
        <p className="text-sm font-semibold">Análise do LifeOS Copilot</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onAnalyze(q)}
            disabled={isAnalyzing}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-paper-border dark:border-ink-border text-slate hover:bg-paper dark:hover:bg-ink-overlay"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte algo sobre este experimento..."
          className="flex-1 rounded-lg px-3 py-2 text-xs bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
        />
        <Button onClick={() => onAnalyze(question || undefined)} disabled={isAnalyzing}>
          {isAnalyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Analisar
        </Button>
      </div>

      {error && <p className="text-xs text-drop">Não foi possível gerar a análise agora. Tente novamente.</p>}
      {text && (
        <div className="p-3 rounded-xl bg-cat-purple/5 border border-cat-purple/10 text-sm">
          <p>{text}</p>
          <p className="text-[10px] text-slate mt-2">Análise gerada por IA a partir dos seus dados reais — não é diagnóstico nem conselho médico.</p>
        </div>
      )}
    </Card>
  );
}
