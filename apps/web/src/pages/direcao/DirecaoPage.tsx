import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ArrowRight, CalendarCheck, Compass, Flag, Lightbulb, Link2, RefreshCw } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { RPGPanel, RPGProgressBar } from "@/components/rpg";
import { LIFE_AREA_BY_KEY } from "@/utils/lifeOsLabels";
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
  const { isRpg } = useTheme();

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

  if (isRpg) {
    const unaligned = a.openTasks - a.alignedOpenTasks;
    const activeAreas = data.balance.filter((x) => x.activeGoals > 0).map((x) => LIFE_AREA_BY_KEY[x.area]?.label ?? x.area);
    const attention = [
      unaligned > 0 && `${unaligned} tarefa(s) aberta(s) sem meta definida.`,
      a.activeGoalsWithoutArea > 0 && `${a.activeGoalsWithoutArea} meta(s) ativa(s) sem área da vida — veja “Organizar”.`,
      a.activeGoalsWithoutWork > 0 && `${a.activeGoalsWithoutWork} meta(s) sem projeto nem tarefa ligada.`,
    ].filter(Boolean) as string[];
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <PageHeader
          icon={<Compass size={22} />}
          title="Direção"
          subtitle="Visão, propósito, metas e ciclos — um plano para a vida que você quer construir."
          actions={<p className="hidden md:block font-rpg italic text-rpg-gold-light/90 text-sm">&ldquo;Direção transforma esforço em significado.&rdquo;</p>}
        />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
          <VisionCard vision={data.vision} onSave={saveVision} isSaving={isSavingVision} activeAreas={activeAreas} />

          <RPGPanel title="Alinhamento" icon={<Link2 size={14} />} variant="gold">
            {a.openTasks === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhuma tarefa aberta agora — nada para medir.</p>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <p className="font-pixel text-5xl font-bold tabular-nums leading-none text-rpg-gold-light">{pct}%</p>
                  <p className="text-xs text-rpg-muted pb-1">das {a.openTasks} tarefas abertas servem a uma meta.</p>
                </div>
                <RPGProgressBar className="mt-3" tone="purple" label="Alinhamento" value={pct ?? 0} showLabel={false} />
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <div className="border-2 border-rpg-border bg-rpg-bg/50 px-3 py-2" style={{ borderRadius: 3 }}>
                    <dd className="font-pixel text-xl font-bold text-rpg-green">{a.alignedOpenTasks}</dd>
                    <dt className="text-[11px] text-rpg-muted">Alinhadas a uma meta</dt>
                  </div>
                  <div className="border-2 border-rpg-border bg-rpg-bg/50 px-3 py-2" style={{ borderRadius: 3 }}>
                    <dd className="font-pixel text-xl font-bold text-rpg-orange">{unaligned}</dd>
                    <dt className="text-[11px] text-rpg-muted">Sem meta</dt>
                  </div>
                </dl>
              </>
            )}
            {attention.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold mb-1.5">
                  <Flag size={14} className="text-rpg-red" /> Pontos de atenção
                </p>
                <ul className="space-y-1 text-xs">
                  {attention.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-rpg-red" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pct != null && pct < 50 && (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold mb-1.5">
                  <Lightbulb size={14} className="text-rpg-gold-light" /> Para alinhar melhor
                </p>
                <p className="text-xs text-rpg-muted">Ligue tarefas soltas a um projeto que sirva a uma meta (no modal da tarefa ou no projeto).</p>
              </div>
            )}
            <Link to="/revisoes" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-rpg-purple hover:underline">
              <CalendarCheck size={13} /> Fazer revisão do mês, trimestre ou ano <ArrowRight size={12} />
            </Link>
          </RPGPanel>
        </div>

        <CycleGoals goals={data.goals} cycles={data.cycles} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <AreaBalance balance={data.balance} title="Por área da vida" />
          <WheelOfLife wheel={data.wheel} onSave={(scores) => saveWheel({ scores })} isSaving={isSavingWheel} />
        </div>
      </div>
    );
  }

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
