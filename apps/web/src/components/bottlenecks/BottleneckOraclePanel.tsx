import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { useBottleneckOracle } from "@/hooks/useBottlenecks";
import type { AnalysisPeriod, OracleQuestion } from "@/services/bottlenecksService";
import { ORACLE_ART } from "@/utils/bottleneckDisplay";

/**
 * Análise do Oráculo. Por padrão mostra a leitura da engine (dados reais).
 * A IA só roda quando o usuário pede e apenas explica o resultado já
 * calculado — com rótulos de inferência/sugestão. O pai usa `key` para
 * zerar a resposta quando o gargalo muda.
 */
export function BottleneckOraclePanel({
  text,
  targetKey,
  period,
  questions,
}: {
  text: string | null;
  targetKey: string | null;
  period: AnalysisPeriod;
  questions: Record<OracleQuestion, string>;
}) {
  const oracle = useBottleneckOracle();
  const [question, setQuestion] = useState<OracleQuestion>("why");
  const ask = (q: OracleQuestion) => {
    setQuestion(q);
    oracle.mutate({ key: targetKey ?? undefined, question: q, period });
  };
  const a = oracle.data?.answer;
  return (
    <RPGPanel title="Análise do Oráculo" icon={<Sparkles size={15} className="text-rpg-purple" />} variant="gold">
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
        <img src={ORACLE_ART} alt="Oráculo do LifeOS" className="pixelated w-full aspect-[3/4] object-cover border-2 border-rpg-purple/70 bg-rpg-bg-2" style={{ borderRadius: 3 }} />
        <div className="min-w-0">
          {text ? <p className="text-sm text-rpg-text/90">{text}</p> : <p className="text-sm text-rpg-muted">Sem gargalo identificado para interpretar agora.</p>}
          <RPGBadge tone="blue" className="mt-2">
            Dado real · engine
          </RPGBadge>
        </div>
      </div>

      {targetKey && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Perguntas ao Oráculo">
            {(Object.keys(questions) as OracleQuestion[]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                disabled={oracle.isPending}
                aria-pressed={oracle.data && question === q ? true : undefined}
                className={clsx("border px-2 py-1 text-[11px] transition-colors disabled:opacity-50", oracle.data && question === q ? "border-rpg-purple text-rpg-text bg-rpg-purple/15" : "border-rpg-border text-rpg-muted hover:text-rpg-text")}
                style={{ borderRadius: 3 }}
              >
                {questions[q]}
              </button>
            ))}
          </div>
          {!a && (
            <RPGButton variant="primary" className="mt-3 w-full justify-center" onClick={() => ask(question)} disabled={oracle.isPending}>
              <Wand2 size={15} aria-hidden /> {oracle.isPending ? "Consultando o Oráculo…" : "Ver análise completa com IA"}
            </RPGButton>
          )}
        </>
      )}

      {oracle.isPending && <div className="mt-3 h-20 rpg-bar animate-pulse motion-reduce:animate-none" aria-label="Oráculo analisando" />}
      {oracle.isError && (
        <div className="mt-3 border border-rpg-border/70 p-2.5 text-sm" role="alert">
          <p className="text-rpg-muted">{oracle.error instanceof Error ? oracle.error.message : "Análise avançada indisponível agora."}</p>
          <RPGButton variant="secondary" className="mt-2 !py-1 text-xs" onClick={() => ask(question)}>
            Tentar novamente
          </RPGButton>
        </div>
      )}
      {a && !oracle.isPending && (
        <div className="mt-3 space-y-2 border-t border-rpg-border/60 pt-3 text-sm" aria-live="polite">
          <p className="text-[11px] text-rpg-muted">{oracle.data?.question}</p>
          <p className="text-rpg-text">
            <RPGBadge tone="purple" className="mr-1.5">
              Inferência
            </RPGBadge>
            {a.summary}
          </p>
          {a.whyItMatters && <p className="text-rpg-text/85">{a.whyItMatters}</p>}
          {a.recommendedStrategy && (
            <p className="text-rpg-text">
              <RPGBadge tone="gold" className="mr-1.5">
                Sugestão
              </RPGBadge>
              {a.recommendedStrategy}
            </p>
          )}
          {a.risks.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-rpg-red">Riscos</p>
              <ul className="list-disc pl-4 text-xs text-rpg-text/85">
                {a.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {a.alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-rpg-blue">Alternativas</p>
              <ul className="list-disc pl-4 text-xs text-rpg-text/85">
                {a.alternatives.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {a.confidenceNote && <p className="text-[11px] italic text-rpg-muted">{a.confidenceNote}</p>}
          <p className="text-[10px] text-rpg-muted">Gerado por IA a partir do resultado da engine. Nenhuma ação é executada sem você.</p>
        </div>
      )}
    </RPGPanel>
  );
}
