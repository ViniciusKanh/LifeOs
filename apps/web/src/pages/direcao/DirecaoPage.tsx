import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ArrowRight, CalendarCheck, Compass, Link2, RefreshCw } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { useDirection } from "@/hooks/useLifeOs";
import { VisionCard } from "@/components/direction/VisionCard";
import { WheelOfLife } from "@/components/direction/WheelOfLife";
import { CycleGoals } from "@/components/direction/CycleGoals";
import { AreaBalance } from "@/components/direction/AreaBalance";

/**
 * Direção — o "porquê" do LifeOS: visão e valores → roda da vida → metas do
 * ano/trimestre/mês → projetos → tarefas. O alinhamento mostra quanto do
 * que está aberto hoje serve a alguma meta.
 */
export function DirecaoPage() {
  const { data, isLoading, isError, refetch, saveVision, isSavingVision, saveWheel, isSavingWheel } = useDirection();

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8">
        <Card className="p-5 flex items-center gap-3">
          <AlertTriangle size={18} className="text-drop" />
          <p className="text-sm flex-1">Não foi possível carregar a Direção agora.</p>
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <RefreshCw size={13} /> Tentar de novo
          </button>
        </Card>
      </div>
    );
  }

  const a = data.alignment;
  const pct = a.alignedPct;

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
      <PageHeader icon={<Compass size={20} />} title="Direção" subtitle="Visão → metas do ano e do trimestre → projetos → tarefas. Cada coisa sabe por que existe." />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
        <VisionCard vision={data.vision} onSave={saveVision} isSaving={isSavingVision} />

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={16} className="text-cat-blue" />
            <p className="text-sm font-semibold">Alinhamento</p>
          </div>
          {a.openTasks === 0 ? (
            <p className="text-xs text-slate">Nenhuma tarefa aberta agora.</p>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <motion.p className="font-display text-4xl font-bold tabular-nums leading-none" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  {pct}%
                </motion.p>
                <p className="text-xs text-slate pb-1">
                  das {a.openTasks} tarefas abertas servem a uma meta ({a.alignedOpenTasks} com “porquê”).
                </p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.07] overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-cat-blue to-cat-purple" initial={{ width: 0 }} animate={{ width: `${pct ?? 0}%` }} transition={{ duration: 0.8 }} />
              </div>
            </>
          )}
          <ul className="mt-4 space-y-1.5 text-xs">
            {a.activeGoalsWithoutArea > 0 && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-signal" /> {a.activeGoalsWithoutArea} meta(s) ativa(s) sem área da vida — veja “Organizar” abaixo.
              </li>
            )}
            {a.activeGoalsWithoutWork > 0 && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-signal" /> {a.activeGoalsWithoutWork} meta(s) sem projeto nem tarefa ligada.
              </li>
            )}
            {pct != null && pct < 50 && (
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cat-blue" /> Dica: ligue tarefas soltas a um projeto que sirva a uma meta (no modal da tarefa ou no projeto).
              </li>
            )}
          </ul>
          <Link to="/revisoes" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
            <CalendarCheck size={13} /> Fazer revisão do mês, trimestre ou ano <ArrowRight size={12} />
          </Link>
        </Card>
      </div>

      <CycleGoals goals={data.goals} cycles={data.cycles} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <WheelOfLife wheel={data.wheel} onSave={(scores) => saveWheel({ scores })} isSaving={isSavingWheel} />
        <AreaBalance balance={data.balance} />
      </div>
    </div>
  );
}
