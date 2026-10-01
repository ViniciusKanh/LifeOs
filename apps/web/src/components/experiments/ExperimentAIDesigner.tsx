import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bot, CalendarDays, PenLine, RefreshCw, Sparkles, Target, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useExperimentAIDesign } from "@/hooks/useExperiments";
import { AiThinking, ProvenanceBadge } from "./AiThinking";
import { CATEGORY_ICON, CATEGORY_METRIC_LABEL } from "./experimentDisplay";
import { formatMetricValue } from "./ExperimentComparison";
import type { ExperimentProposal } from "@/types";

/**
 * "Desenhe com IA": o usuário descreve o que quer melhorar e o Copilot
 * propõe 2–3 experimentos já configurados (métrica, verificação, duração,
 * critério). Os números ao lado de cada proposta vêm do servidor (dado
 * real); a ideia em si é sugestão da IA. Nada é criado aqui — escolher uma
 * proposta só preenche o assistente de criação para revisão.
 */

const GOAL_IDEAS = [
  "Ter mais energia à tarde",
  "Dormir melhor durante a semana",
  "Ler com mais constância",
  "Diminuir o estresse no trabalho",
  "Concluir mais tarefas importantes",
  "Estudar sem procrastinar",
];

const THINKING = ["Lendo seus últimos 30 dias de registros…", "Vendo quais métricas você já acompanha…", "Desenhando hipóteses testáveis…", "Escolhendo como medir cada uma…"];

function ProposalCard({ p, index, onPick }: { p: ExperimentProposal; index: number; onPick: () => void }) {
  const Icon = CATEGORY_ICON[p.category];
  const hasBase = p.baseline.daysWithData > 0;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24, delay: index * 0.12 }}
      whileHover={{ y: -3 }}
      className="group relative flex flex-col rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-4 shadow-card dark:shadow-card-dark overflow-hidden"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cat-purple via-cat-blue to-cat-pink opacity-70" aria-hidden />
      <div className="flex items-start gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-cat-purple/10 text-cat-purple flex items-center justify-center shrink-0">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="font-display font-semibold leading-tight">{p.title}</p>
          <p className="text-xs text-slate mt-0.5 italic">“{p.hypothesis}”</p>
        </div>
      </div>

      {p.dailyAction && (
        <p className="mt-3 text-xs rounded-xl bg-paper dark:bg-ink px-3 py-2">
          <span className="font-semibold">Todo dia: </span>
          {p.dailyAction}
        </p>
      )}

      <dl className="mt-3 space-y-1.5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Target size={12} className="text-cat-purple shrink-0" />
          <dt className="text-slate">Mede</dt>
          <dd className="font-medium truncate">
            {CATEGORY_METRIC_LABEL[p.primaryMetric]}
            {p.secondaryMetrics.length > 0 && <span className="text-slate"> + {p.secondaryMetrics.map((m) => CATEGORY_METRIC_LABEL[m]).join(", ")}</span>}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          {p.verificationType === "automatic" ? <Bot size={12} className="text-cat-blue shrink-0" /> : <PenLine size={12} className="text-cat-blue shrink-0" />}
          <dt className="text-slate">Verificação</dt>
          <dd className="font-medium">{p.verificationType === "automatic" ? "automática pelos seus registros" : "check-in manual"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays size={12} className="text-cat-green shrink-0" />
          <dt className="text-slate">Duração</dt>
          <dd className="font-medium">
            {p.durationDays} dias
            {p.baseline.recommendedDurationDays && p.baseline.recommendedDurationDays !== p.durationDays && (
              <span className="text-slate"> (seus dados sugerem {p.baseline.recommendedDurationDays})</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-cat-blue/20 bg-cat-blue/[0.05] px-3 py-2">
        <ProvenanceBadge kind="dado" />
        <p className="text-[11px] text-slate">
          {hasBase
            ? `Sua média de ${CATEGORY_METRIC_LABEL[p.primaryMetric].toLowerCase()} nos últimos 30 dias: ${formatMetricValue(p.baseline.mean, p.baseline.unit)} (${p.baseline.daysWithData} dias com registro).`
            : `Você ainda não registra ${CATEGORY_METRIC_LABEL[p.primaryMetric].toLowerCase()} — comece antes do início para ter um "antes".`}
        </p>
      </div>
      {p.rationale && (
        <div className="mt-2 flex items-start gap-2 px-1">
          <ProvenanceBadge kind="sugestao" />
          <p className="text-[11px] text-slate">{p.rationale}</p>
        </div>
      )}

      <Button onClick={onPick} className="mt-4 w-full group-hover:shadow-glow-signal">
        Usar esta proposta <ArrowRight size={14} />
      </Button>
    </motion.article>
  );
}

export function ExperimentAIDesigner({ onPick, compact = false }: { onPick: (p: ExperimentProposal) => void; compact?: boolean }) {
  const design = useExperimentAIDesign();
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [showConstraints, setShowConstraints] = useState(false);
  const proposals = design.data?.proposals ?? [];

  const run = () => {
    if (goal.trim().length < 5) return;
    design.mutate({ goal: goal.trim(), constraints: constraints.trim() || null });
  };

  return (
    <div>
      <div className="rounded-2xl border border-cat-purple/25 bg-gradient-to-br from-cat-purple/[0.08] via-cat-blue/[0.04] to-transparent p-4">
        <label htmlFor="exp-ai-goal" className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 size={16} className="text-cat-purple" /> O que você quer melhorar?
        </label>
        <textarea
          id="exp-ai-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={compact ? 2 : 3}
          maxLength={400}
          placeholder="Ex.: Quero ter mais disposição à tarde sem depender de café."
          className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple resize-none"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {GOAL_IDEAS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className="rounded-full px-2.5 py-1 text-[11px] border border-paper-border dark:border-ink-border text-slate hover:text-cat-purple hover:border-cat-purple/50 transition-colors"
            >
              {g}
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {showConstraints && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <input
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                maxLength={300}
                placeholder="Restrições (opcional): ex. trabalho até 19h, não gosto de correr…"
                aria-label="Restrições"
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <button type="button" onClick={() => setShowConstraints((v) => !v)} className="text-[11px] font-medium text-slate hover:text-inherit">
            {showConstraints ? "Ocultar restrições" : "+ Adicionar restrições"}
          </button>
          <Button onClick={run} disabled={design.isPending || goal.trim().length < 5}>
            {proposals.length > 0 ? <RefreshCw size={14} /> : <Sparkles size={14} />} {proposals.length > 0 ? "Gerar outras" : "Desenhar com IA"}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {design.isPending ? (
          <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-6 flex justify-center">
            <AiThinking messages={THINKING} />
          </motion.div>
        ) : design.isError ? (
          <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-xs text-drop bg-drop/10 rounded-xl px-3 py-2.5">
            {design.error instanceof Error ? design.error.message : "Não foi possível gerar propostas agora."}
          </motion.p>
        ) : proposals.length > 0 ? (
          <motion.div key="results" className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
            {proposals.map((p, i) => (
              <ProposalCard key={`${p.title}-${i}`} p={p} index={i} onPick={() => onPick(p)} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {proposals.length > 0 && (
        <p className="text-[10px] text-slate mt-2">Propostas geradas por IA. Você revisa tudo no assistente antes de iniciar — nada é criado automaticamente.</p>
      )}
    </div>
  );
}
