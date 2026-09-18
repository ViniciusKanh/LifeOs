import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Sparkles, TrendingUp, Quote, Bot, PenLine } from "lucide-react";
import { Button, Card, IconBadge } from "@/components/ui/primitives";
import { CATEGORY_ICON, CATEGORY_METRIC_LABEL, STATUS_LABEL_PT } from "./experimentDisplay";
import type { ExperimentListItem, ExperimentStatus } from "@/types";

const STATUS_TONE: Record<ExperimentStatus, string> = {
  draft: "bg-slate/10 text-slate",
  active: "bg-cat-purple/10 text-cat-purple",
  paused: "bg-signal/15 text-signal-deep",
  completed: "bg-cat-green/10 text-cat-green",
  cancelled: "bg-drop/10 text-drop",
};

/** Cartão do experimento em destaque (seção 6) — o experimento ativo mais recente. */
export function ActiveExperimentCard({
  experiment,
  onRegisterObservation,
  onChangeStatus,
}: {
  experiment: ExperimentListItem;
  onRegisterObservation: () => void;
  onChangeStatus: (status: ExperimentStatus) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const CategoryIcon = CATEGORY_ICON[experiment.category];

  return (
    <Card className="p-4 md:p-5 relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_TONE[experiment.status]}`}>{STATUS_LABEL_PT[experiment.status]}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate" title={experiment.verification_type === "automatic" ? "Verificação automática" : "Check-in manual"}>
            {experiment.verification_type === "automatic" ? <Bot size={11} /> : <PenLine size={11} />}
            {experiment.verification_type === "automatic" ? "Automático" : "Manual"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate">
            Dia {experiment.daysElapsed} de {experiment.durationDays}
          </p>
          <p className="text-sm font-bold text-cat-purple">{experiment.progressPct}%</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <IconBadge icon={<CategoryIcon size={16} />} tone="purple" size={34} />
        <div className="min-w-0">
          <Link to={`/experimentos/${experiment.id}`} className="block">
            <p className="font-display font-bold text-lg leading-tight hover:text-cat-purple transition-colors">{experiment.title}</p>
          </Link>
          {experiment.description && <p className="text-sm text-slate mt-1">{experiment.description}</p>}
        </div>
      </div>

      <div className="h-2 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden mt-3">
        <div className="h-full rounded-full bg-gradient-to-r from-cat-purple to-brand-500" style={{ width: `${experiment.progressPct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
        <div>
          <p className="text-slate">Métrica principal</p>
          <p className="font-medium mt-0.5">{CATEGORY_METRIC_LABEL[experiment.primary_metric] ?? experiment.primary_metric}</p>
        </div>
        <div>
          <p className="text-slate">Métricas secundárias</p>
          <p className="font-medium mt-0.5">
            {experiment.secondary_metrics.length > 0 ? experiment.secondary_metrics.map((m) => CATEGORY_METRIC_LABEL[m] ?? m).join(", ") : "Nenhuma"}
          </p>
        </div>
        <div>
          <p className="text-slate">Período</p>
          <p className="font-medium mt-0.5">
            {experiment.start_date.slice(8, 10)}/{experiment.start_date.slice(5, 7)} → {experiment.end_date.slice(8, 10)}/{experiment.end_date.slice(5, 7)}
          </p>
        </div>
        <div>
          <p className="text-slate">Duração</p>
          <p className="font-medium mt-0.5">{experiment.durationDays} dias</p>
        </div>
      </div>

      {experiment.hypothesis && (
        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-cat-purple/5 border border-cat-purple/10 text-xs">
          <Quote size={14} className="text-cat-purple shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold">Hipótese: </span>
            {experiment.hypothesis}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={onRegisterObservation} disabled={experiment.status !== "active"}>
          <TrendingUp size={15} /> Registrar observação
        </Button>
        <Link to={`/experimentos/${experiment.id}`}>
          <Button variant="secondary">
            <Sparkles size={15} /> Ver análise parcial
          </Button>
        </Link>
        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-paper-border dark:border-ink-border text-slate hover:bg-paper dark:hover:bg-ink-overlay"
            aria-label="Mais ações"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-44 rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card py-1 text-sm">
                {experiment.status === "active" && (
                  <button className="w-full text-left px-3 py-2 hover:bg-paper dark:hover:bg-ink-overlay" onClick={() => { onChangeStatus("paused"); setMenuOpen(false); }}>
                    Pausar
                  </button>
                )}
                {experiment.status === "paused" && (
                  <button className="w-full text-left px-3 py-2 hover:bg-paper dark:hover:bg-ink-overlay" onClick={() => { onChangeStatus("active"); setMenuOpen(false); }}>
                    Retomar
                  </button>
                )}
                <Link to={`/experimentos/${experiment.id}`} className="block px-3 py-2 hover:bg-paper dark:hover:bg-ink-overlay" onClick={() => setMenuOpen(false)}>
                  Editar / Encerrar
                </Link>
                {(experiment.status === "active" || experiment.status === "paused" || experiment.status === "draft") && (
                  <button
                    className="w-full text-left px-3 py-2 text-drop hover:bg-drop/5"
                    onClick={() => { onChangeStatus("cancelled"); setMenuOpen(false); }}
                  >
                    Cancelar experimento
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
