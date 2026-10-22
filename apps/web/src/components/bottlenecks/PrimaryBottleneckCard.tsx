import { AlertTriangle, ArrowRight, Clock3, Layers, Swords, TriangleAlert } from "lucide-react";
import { useReducedMotion } from "motion/react";
import clsx from "clsx";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { Candidate } from "@/services/bottlenecksService";
import { LEVEL_UI, TYPE_UI, bottleneckArt, urgencyMeaning } from "@/utils/bottleneckDisplay";

/** Gargalo principal: arte, tipo, descrição, nota/urgência explicadas e 4 indicadores reais. */
export function PrimaryBottleneckCard({ candidate: c, onDetail }: { candidate: Candidate; onDetail: () => void }) {
  const reduce = useReducedMotion();
  const level = LEVEL_UI[c.level];
  const type = TYPE_UI[c.type];
  // Cada indicador traz uma frase curta dizendo o que o número quer dizer.
  const kpis = [
    { icon: Layers, value: String(c.kpis.dependentTasks), unit: "", label: c.kpis.dependentTasks === 1 ? "tarefa esperando por isso" : "tarefas esperando por isso", hint: "Tarefas que só podem começar depois que este item andar.", tone: "blue" as const },
    { icon: Swords, value: String(c.kpis.affectedCampaigns), unit: "", label: c.kpis.affectedCampaigns === 1 ? "campanha atrasada por isso" : "campanhas atrasadas por isso", hint: "Campanhas (objetivos maiores) que não avançam enquanto isso estiver parado.", tone: "red" as const },
    { icon: Clock3, value: c.kpis.inactiveDays === null ? "—" : String(c.kpis.inactiveDays), unit: c.kpis.inactiveDays === null ? "" : c.kpis.inactiveDays === 1 ? "dia" : "dias", label: c.kpis.inactiveDays === null ? "sem histórico ainda" : "parado, sem avanço", hint: "Tempo desde a última edição, apontamento ou sessão registrada neste item.", tone: "orange" as const },
    { icon: TriangleAlert, value: String(c.kpis.deadlinesAtRisk), unit: "", label: c.kpis.deadlinesAtRisk === 1 ? "prazo que pode estourar" : "prazos que podem estourar", hint: "Prazos (deste item ou dos que dependem dele) que estão perto ou já passaram.", tone: "gold" as const },
  ];
  return (
    <RPGPanel title="O que mais está travando você" icon={<AlertTriangle size={16} className="text-rpg-red" />} variant="gold" className="h-full">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
        <button type="button" onClick={onDetail} className="relative block focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold" aria-label={`Ver detalhes de ${c.title}`}>
          <img src={bottleneckArt(c.type)} alt="" className="pixelated w-full aspect-[16/10] sm:aspect-[4/5] object-cover border-2 border-rpg-gold/70 bg-rpg-bg-2" style={{ borderRadius: 3 }} />
          <span className="absolute left-2 top-2">
            <RPGBadge tone={type.tone} className="bg-rpg-bg/90 text-[11px] px-2 py-1">
              {type.label}
            </RPGBadge>
          </span>
          {c.level === "critical" && <span className={clsx("absolute inset-0 border-2 border-rpg-red", !reduce && "animate-pulse")} style={{ borderRadius: 3 }} aria-hidden />}
        </button>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-rpg text-xl sm:text-2xl font-bold leading-tight text-rpg-text">{c.title}</h2>
              {c.context && <p className="text-xs text-rpg-muted mt-0.5">{c.context}</p>}
            </div>
            <span className={clsx("shrink-0 border px-2 py-0.5 text-xs font-semibold", RPG_TONE_TEXT[level.tone])} style={{ borderRadius: 3, borderColor: "currentColor" }}>
              {level.badge}
            </span>
          </div>
          <p className="text-sm text-rpg-text/85">{c.description}</p>
          <div>
            <RPGProgressBar value={c.score} tone="red" label="Quanto isso trava seu progresso" valueLabel={`${c.score}/100`} />
            <p className="mt-1 text-[11px] text-rpg-text/75">{level.meaning}</p>
          </div>
          <div>
            <RPGProgressBar value={c.urgency} tone="orange" label="Pressa (prazo)" valueLabel={`${c.urgency}/100`} />
            <p className="mt-1 text-[11px] text-rpg-text/75">{urgencyMeaning(c.urgency)}</p>
          </div>
          {(c.flags.noEstimate || c.flags.noDueDate) && c.type === "TASK" && (
            <p className="text-[11px] text-rpg-muted">
              {[c.flags.noEstimate && "Tempo não estimado", c.flags.noDueDate && "Sem prazo definido"].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2">
        {kpis.map((k) => (
          <li key={k.label} title={k.hint} className="flex items-center gap-2.5 border border-rpg-border/70 bg-rpg-bg-2/60 px-2.5 py-2 min-w-0" style={{ borderRadius: 3 }}>
            <k.icon size={22} className={clsx("shrink-0", RPG_TONE_TEXT[k.tone])} aria-hidden />
            <span className="min-w-0">
              <span className="block font-rpg text-xl font-bold leading-none text-rpg-text tabular-nums">
                {k.value} {k.unit && <span className="text-xs font-sans font-semibold text-rpg-gold-light">{k.unit}</span>}
              </span>
              <span className="block text-[11px] text-rpg-muted leading-tight mt-0.5">{k.label}</span>
              <span className="sr-only">. {k.hint}</span>
            </span>
          </li>
        ))}
      </ul>
      <RPGButton variant="ghost" className="mt-2 !px-2 !py-1 text-xs" onClick={onDetail}>
        Entender por que isso trava <ArrowRight size={13} aria-hidden />
      </RPGButton>
    </RPGPanel>
  );
}
