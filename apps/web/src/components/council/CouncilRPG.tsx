import { Link } from "react-router-dom";
import clsx from "clsx";
import { Castle, History, Scale, Shield, Swords } from "lucide-react";
import type { CouncilHub } from "@/services/planningHubService";
import { RPGProgressBar } from "@/components/rpg";
import { AdvisorPanel, KitSection, MODULE_ART } from "@/components/rpg-modules/ModuleKit";

/** Conselho de Guerra — peças RPG (campanhas, equilíbrio de carga, versões do plano, General). */

const R = { borderRadius: 4 } as const;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`);
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Linha do fluxo estratégico — os 5 passos do Conselho com estado (feito/atual/pendente). */
export function StrategyFlow({ step, visited, sealed, onSelect, labels }: { step: number; visited: Set<number>; sealed: boolean; onSelect: (i: number) => void; labels: string[] }) {
  return (
    <ol className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-0" aria-label="Fluxo estratégico">
      {labels.map((label, i) => {
        const done = sealed || (visited.has(i) && i < step);
        const current = i === step;
        return (
          <li key={label} className="flex min-w-0 items-center gap-2 sm:flex-1 sm:flex-col sm:gap-1 sm:text-center">
            <div className="flex items-center sm:w-full">
              <span className={clsx("hidden h-0.5 flex-1 sm:block", i === 0 ? "invisible" : done || current ? "bg-rpg-gold" : "bg-rpg-border")} aria-hidden />
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                className={clsx(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-pixel text-sm transition-colors",
                  current && "border-rpg-gold bg-rpg-gold/25 text-rpg-gold-light shadow-[0_0_14px_rgb(var(--rpg-gold)/0.6)] motion-safe:animate-pulse",
                  done && !current && "border-rpg-green bg-rpg-green/20 text-rpg-green",
                  !done && !current && "border-rpg-border bg-rpg-bg-2 text-rpg-muted",
                )}
                aria-label={`Passo ${i + 1}: ${label}${done ? " (feito)" : ""}`}
              >
                {done && !current ? "✓" : i + 1}
              </button>
              <span className={clsx("hidden h-0.5 flex-1 sm:block", i === labels.length - 1 ? "invisible" : done ? "bg-rpg-gold" : "bg-rpg-border")} aria-hidden />
            </div>
            <span className={clsx("text-xs sm:px-1", current ? "text-rpg-gold-light" : "text-rpg-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CampaignsWeek({ hub }: { hub: CouncilHub }) {
  return (
    <KitSection title="Campanhas da semana" icon={<Castle size={16} />} action={<Link to="/forja-campanhas" className="text-xs text-rpg-gold-light underline">Forja</Link>}>
      {hub.campaigns.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma campanha ativa. Crie uma na Forja de Campanhas para agrupar metas, projetos e missões.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {hub.campaigns.map((c) => (
            <li key={c.id}>
              <Link to={`/forja-campanhas/${c.id}`} className="block border-2 border-rpg-border bg-rpg-bg-2/70 p-2 hover:border-rpg-gold/70" style={R}>
                <div className="flex items-center gap-2">
                  <Swords size={15} className="shrink-0 text-rpg-gold" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{c.title}</p>
                  <span className={clsx("shrink-0 font-pixel text-[9px] uppercase", c.status === "active" ? "text-rpg-green" : "text-rpg-muted")}>{c.status === "active" ? "Ativa" : "Planejada"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <RPGProgressBar className="flex-1" value={c.pct} tone="purple" label={`Progresso de ${c.title}`} showLabel={false} />
                  <span className="shrink-0 font-pixel text-[10px] text-rpg-text">{c.pct}%</span>
                </div>
                <p className="mt-0.5 text-[11px] text-rpg-muted">
                  {c.done}/{c.total} missões{c.lifeArea ? ` · ${c.lifeArea}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function PlanVersions({ hub }: { hub: CouncilHub }) {
  return (
    <KitSection title="Histórico de planos selados" icon={<History size={16} />}>
      {hub.versions.length === 0 ? (
        <p className="text-sm text-rpg-muted">As versões aparecem aqui a cada vez que você sela (ou resela) um plano.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {hub.versions.map((v) => (
            <li key={`${v.weekStart}-${v.version}`} className="flex items-center gap-2">
              <Shield size={13} className="text-rpg-gold" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-rpg-text">
                Semana {dayBr(v.weekStart)} · v{v.version}
              </span>
              <span className="shrink-0 text-[11px] text-rpg-muted">
                {v.planned} missão(ões) · {v.events} bloco(s) · {v.focus} foco(s)
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10.5px] text-rpg-muted">{hub.sealedTotal} plano(s) selado(s) no total.</p>
    </KitSection>
  );
}

export function CouncilGeneral() {
  return <AdvisorPanel module="council" title="General da Semana" avatar={`${MODULE_ART}/council/advisor.webp`} />;
}
