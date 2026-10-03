import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Gem, Loader2, Sparkles, Wand2 } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel, RPG_TONE_SOFT, type RpgTone } from "@/components/rpg";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import { periodDelta } from "@/utils/reviewMetrics";
import type { PeriodicReviewAnalysis } from "@/types";

/** Campo de texto no visual RPG (input moderno: navy, borda bronze, foco dourado). */
export const rpgFieldClass =
  "w-full px-3 py-2.5 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70 resize-y";

/** Métrica do "Retrato do período": valor, ícone e variação real vs período anterior. */
export function RpgMetricTile({
  icon,
  tone,
  label,
  value,
  current,
  previous,
  previousLabel = "vs. período anterior",
}: {
  icon: ReactNode;
  tone: RpgTone;
  label: string;
  value: string;
  current: number | null;
  previous: number | null | undefined;
  previousLabel?: string;
}) {
  const d = periodDelta(current, previous);
  return (
    <div className="flex items-start gap-3 border border-rpg-border/80 bg-rpg-bg/50 p-3 min-w-0" style={{ borderRadius: 4 }}>
      <span className={`w-10 h-10 shrink-0 flex items-center justify-center border ${RPG_TONE_SOFT[tone]}`} style={{ borderRadius: 4 }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-pixel text-xl leading-none text-rpg-text tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-rpg-muted leading-tight">{label}</p>
        {current != null && (
          <p className="mt-1 text-[11px] leading-tight">
            {d.hasBase ? (
              <span className={`inline-flex items-center gap-0.5 font-semibold ${d.pct! >= 0 ? "text-rpg-green" : "text-rpg-red"}`}>
                {d.pct! >= 0 ? <ArrowUpRight size={11} aria-hidden /> : <ArrowDownRight size={11} aria-hidden />}
                {d.pct! >= 0 ? "+" : ""}
                {d.pct}% <span className="font-normal text-rpg-muted ml-1">{previousLabel}</span>
              </span>
            ) : (
              <span className="text-rpg-muted">Sem base anterior</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** Energia do período 1–10 em "cristais" — cada valor continua numerado e legível. */
export function RpgEnergySelector({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5" role="radiogroup" aria-label="Energia do período de 1 a 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Energia ${n}`}
              onClick={() => onChange(active ? null : n)}
              className={`h-9 flex items-center justify-center gap-1 border text-sm font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold ${
                active ? "border-rpg-purple bg-rpg-purple text-rpg-text" : value != null && n < value ? "border-rpg-purple/50 bg-rpg-purple/15 text-rpg-text" : "border-rpg-border bg-rpg-bg-2 text-rpg-muted hover:text-rpg-text"
              }`}
              style={{ borderRadius: 3 }}
            >
              {active && <Gem size={12} aria-hidden />}
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-rpg-muted">
        <span>Muito baixa</span>
        <span>Equilibrada</span>
        <span>Muito alta</span>
      </div>
    </div>
  );
}

/** Selo de fechamento de ciclo — só aparece quando o XP foi de fato concedido pelo backend. */
export function RpgCycleSeal({ label, xp, coins }: { label: string; xp: number; coins: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { scale: 1.6, rotate: -10, opacity: 0 }}
      animate={{ scale: 1, rotate: -3, opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 18 }}
      className="relative inline-flex flex-col items-center border-2 border-rpg-gold px-4 py-2 text-center bg-rpg-gold/10"
      style={{ borderRadius: 4 }}
      role="status"
    >
      {!reduce && <motion.span className="absolute inset-0 bg-rpg-gold/30" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} aria-hidden />}
      <span className="font-pixel text-xs tracking-wider text-rpg-gold-light">CICLO CONCLUÍDO</span>
      <span className="text-xs text-rpg-text capitalize">{label}</span>
      <span className="font-pixel text-xs text-rpg-purple">
        +{xp} XP · +{coins} 🪙
      </span>
    </motion.div>
  );
}

/** Copilot da revisão: a análise vem do backend e cada bloco mostra a proveniência. */
export function RpgReviewCopilot({
  reward,
  analysis,
  isAnalyzing,
  error,
  onAnalyze,
  basedOnLabel,
}: {
  reward: { xp: number; awarded: boolean; eligible: boolean } | null;
  analysis: PeriodicReviewAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  basedOnLabel: string;
}) {
  type Block = { title: string; kind: "dado" | "inferencia" | "sugestao"; items: string[] };
  const blocks: Block[] = analysis
    ? ([
        { title: "Principais conquistas", kind: "dado", items: analysis.achievements },
        { title: "Padrões observados", kind: "inferencia", items: analysis.patterns },
        { title: "Pontos de atenção", kind: "inferencia", items: analysis.attention },
        { title: "Sugestões para o próximo ciclo", kind: "sugestao", items: analysis.suggestions },
      ] as Block[]).filter((b) => b.items.length > 0)
    : [];
  return (
    <RPGPanel
      title="Copilot da revisão"
      icon={<Sparkles size={16} />}
      actions={
        reward && (reward.eligible || reward.awarded) ? (
          <RPGBadge tone={reward.awarded ? "green" : "purple"}>{reward.awarded ? `Selo da rodada · +${reward.xp} XP` : `+${reward.xp} XP ao fechar o ciclo`}</RPGBadge>
        ) : undefined
      }
    >
      <p className="text-sm text-rpg-muted">O Gemini analisa seus registros reais do período para identificar padrões e sugerir prioridades. Nada é salvo automaticamente.</p>
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <ul className="flex-1 space-y-1 text-xs text-rpg-text/90">
          <li>• Principais conquistas do período</li>
          <li>• Padrões e comportamentos recorrentes</li>
          <li>• Sugestões práticas para o próximo ciclo</li>
        </ul>
        <div className="flex flex-col items-stretch sm:items-end gap-1">
          <RPGButton variant="primary" onClick={onAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />} Analisar meu período
          </RPGButton>
          <span className="text-[11px] text-rpg-muted">Baseado nos seus dados de {basedOnLabel}</span>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-rpg-red">{error}</p>}
      {blocks.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {blocks.map((b) => (
            <section key={b.title} className="border border-rpg-border/70 bg-rpg-bg/40 p-3" style={{ borderRadius: 4 }}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs font-semibold text-rpg-gold-light">{b.title}</p>
                <ProvenanceBadge kind={b.kind} />
              </div>
              <ul className="space-y-1 text-xs text-rpg-text/90">
                {b.items.map((it, i) => (
                  <li key={i}>• {it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </RPGPanel>
  );
}
