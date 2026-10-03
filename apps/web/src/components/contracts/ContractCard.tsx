import { CalendarClock, ScrollText, Sparkles } from "lucide-react";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import { difficultyLabel } from "@/services/gamificationService";
import type { Contract } from "@/services/contractsService";
import { DIFFICULTY_TONE, STATUS_LABEL, STATUS_TONE, fmtDate } from "./contractUi";

/** Card de contrato: progresso real (tarefas concluídas) e bônus previsto pela Balança do usuário. */
export function ContractCard({ contract: c, onOpen }: { contract: Contract; onOpen: () => void }) {
  const due = fmtDate(c.dueDate);
  const overdue = c.status === "ativo" && !!c.dueDate && c.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rpg-panel ${c.status === "concluido" ? "rpg-panel-success" : "rpg-panel-gold"} w-full text-left p-4 flex flex-col gap-3 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold`}
      aria-label={`Abrir contrato ${c.title}`}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 flex items-center justify-center border-2 border-rpg-gold/60 bg-rpg-parchment/10 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
          <ScrollText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-rpg font-bold text-rpg-text leading-snug line-clamp-2">{c.title}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <RPGBadge tone={DIFFICULTY_TONE[c.difficulty]}>{difficultyLabel(c.difficulty)}</RPGBadge>
            <RPGBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</RPGBadge>
            {c.aiGenerated && <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />}>IA</RPGBadge>}
          </div>
        </div>
      </div>
      {c.objective && <p className="text-xs text-rpg-muted line-clamp-2">🎯 {c.objective}</p>}
      <RPGProgressBar
        value={c.doneTasks}
        max={Math.max(1, c.totalTasks)}
        tone={c.status === "concluido" ? "green" : "gold"}
        label="Tarefas do contrato"
        valueLabel={c.totalTasks === 0 ? "sem tarefas" : `${c.doneTasks}/${c.totalTasks}`}
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 ${overdue ? "text-rpg-red" : "text-rpg-muted"}`}>
          {due && <><CalendarClock size={12} aria-hidden /> {overdue ? "Atrasado · " : ""}{due}</>}
        </span>
        <span className="font-pixel text-rpg-gold-light">
          {c.status === "concluido" ? `Ganho: +${c.earned.xp} XP` : `Bônus: +${c.reward.xp} XP · +${c.reward.coins} 🪙`}
        </span>
      </div>
    </button>
  );
}
