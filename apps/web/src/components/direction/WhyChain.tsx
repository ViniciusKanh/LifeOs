import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronRight, Compass, FolderKanban, HelpCircle, ListChecks, Target } from "lucide-react";
import { useWhy } from "@/hooks/useLifeOs";
import { LIFE_AREA_BY_KEY, cycleLabel } from "@/utils/lifeOsLabels";
import type { LifeArea, WhyStep } from "@/types";

const ICON: Record<WhyStep["type"], JSX.Element> = {
  task: <ListChecks size={12} />,
  project: <FolderKanban size={12} />,
  goal: <Target size={12} />,
  value: <span className="text-[11px] leading-none">✦</span>,
  vision: <Compass size={12} />,
};

/**
 * "Por que isto existe?" — a cadeia real tarefa → projeto → meta(s) → área →
 * visão, só por vínculos gravados. Se ela parar na própria tarefa, mostra um
 * convite para ligar a uma meta em vez de inventar um motivo.
 */
export function WhyChain({ type, id, compact = false }: { type: "task" | "project" | "goal"; id: string | null | undefined; compact?: boolean }) {
  const { data, isLoading } = useWhy(type, id);
  if (!id) return null;
  if (isLoading) return <div className="h-8 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" aria-busy="true" />;
  if (!data) return null;

  // O primeiro passo é o próprio item — o que interessa é o que vem acima dele.
  const above = data.slice(1);
  const hasGoal = data.some((s) => s.type === "goal");

  return (
    <div className={`rounded-xl border border-cat-purple/20 bg-cat-purple/[0.05] ${compact ? "px-2.5 py-2" : "p-3"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cat-purple mb-1.5">
        <HelpCircle size={12} /> Por que isto existe?
      </p>
      {!hasGoal ? (
        <p className="text-[11px] text-slate">
          Ainda não está ligado a nenhuma meta.{" "}
          <Link to="/direcao" className="text-brand-600 dark:text-brand-400 font-medium">
            Ligue a um projeto ou meta
          </Link>{" "}
          para saber o porquê.
        </p>
      ) : (
        <ol className="flex flex-wrap items-center gap-1">
          {above.map((s, i) => {
            const area = s.type === "value" ? LIFE_AREA_BY_KEY[s.label as LifeArea] : null;
            const label = area ? `${area.emoji} ${area.label}` : s.label;
            const to = s.type === "project" ? `/projetos/${s.id}` : s.type === "goal" ? "/metas" : "/direcao";
            return (
              <motion.li key={`${s.type}-${s.id ?? i}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} className="text-slate/60" />}
                <Link
                  to={to}
                  className="inline-flex items-center gap-1 rounded-lg bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border px-2 py-1 text-[11px] font-medium max-w-[220px] hover:border-cat-purple/50"
                  title={s.type === "vision" ? s.label : undefined}
                >
                  <span className="text-cat-purple shrink-0">{ICON[s.type]}</span>
                  <span className="truncate">{s.type === "vision" ? "Sua visão" : label}</span>
                  {s.type === "goal" && s.detail && <span className="text-slate shrink-0">· {cycleLabel(s.detail)}</span>}
                </Link>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
