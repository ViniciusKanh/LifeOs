import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGProgressBar, RPGTabs, rpgButtonClass } from "@/components/rpg";
import { useBottleneckDetail, useBottleneckGraph } from "@/hooks/useBottlenecks";
import type { AnalysisPeriod, Candidate, RecommendedAction, ScoreDim } from "@/services/bottlenecksService";
import { LEVEL_UI, TYPE_UI } from "@/utils/bottleneckDisplay";
import { GraphCanvas, GraphList } from "./BottleneckDependencyGraph";
import { BottleneckImpactForecast } from "./BottleneckImpactForecast";

const DIM_LABEL: Record<ScoreDim, string> = {
  dependency: "Impacto em dependências",
  urgency: "Urgência",
  inactivity: "Inatividade",
  strategic: "Importância estratégica",
  capacity: "Pressão de capacidade",
  downstream: "Risco em cadeia",
};

/** Detalhe completo de um item: score explicado, causas, grafo, histórico, ações e simulação. */
export function BottleneckDetailModal({ itemKey, period, today, onClose, onSchedule }: { itemKey: string | null; period: AnalysisPeriod; today: string; onClose: () => void; onSchedule: (action: RecommendedAction, title: string) => void }) {
  const { data, isLoading, isError } = useBottleneckDetail(itemKey, period);
  const c = data?.candidate;
  return (
    <Modal open={!!itemKey} onClose={onClose} title={c ? c.title : "Detalhe do gargalo"} size="lg">
      {isLoading && <div className="h-64 rpg-bar animate-pulse" aria-label="Carregando detalhe" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar o detalhe.</p>}
      {data && c && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RPGBadge tone={TYPE_UI[c.type].tone}>{TYPE_UI[c.type].label}</RPGBadge>
            <RPGBadge tone={LEVEL_UI[c.level].tone}>
              {LEVEL_UI[c.level].label} · {c.score}/100
            </RPGBadge>
            {c.dueDate && <span className="text-xs text-rpg-muted">Prazo: {c.dueDate.split("-").reverse().join("/")}</span>}
            {c.flags.noEstimate && c.type === "TASK" && <span className="text-xs text-rpg-muted">Tempo não estimado</span>}
          </div>
          <p className="text-sm text-rpg-text/85">{c.description}</p>

          <section aria-label="Composição do score">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Como o score foi calculado</h3>
            {c.scores ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(DIM_LABEL) as ScoreDim[]).map((k) => (
                  <RPGProgressBar key={k} value={c.scores![k]} tone="purple" label={DIM_LABEL[k]} valueLabel={`${c.scores![k]}`} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-rpg-muted">Sinal de saúde: entra só como padrão observado nos registros (Signals), sem fórmula operacional nem diagnóstico.</p>
            )}
          </section>

          <section aria-label="Causas">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Causas com evidência</h3>
            {data.causes.length === 0 ? (
              <p className="text-xs text-rpg-muted">Não há evidência suficiente para determinar a causa principal.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.causes.map((x) => (
                  <li key={x.type}>
                    <strong className="text-rpg-text">{x.label}:</strong> <span className="text-rpg-text/85">{x.evidence}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.graph.nodes.length > 1 && (
            <section aria-label="Dependências">
              <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Dependências</h3>
              <GraphCanvas graph={data.graph} />
              <div className="sr-only">
                <GraphList graph={data.graph} />
              </div>
            </section>
          )}

          {data.recent && data.recent.length > 0 && (
            <section aria-label="Atividade recente">
              <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Atividade recente</h3>
              <ul className="text-xs text-rpg-text/85 space-y-0.5">
                {data.recent.map((r) => (
                  <li key={`${r.at}-${r.label}`}>
                    {r.at.slice(0, 10).split("-").reverse().join("/")} — {r.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Ações possíveis">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Ações possíveis</h3>
            <p className="text-sm text-rpg-text mb-2">{data.action.reason}</p>
            <div className="flex flex-wrap gap-2">
              {data.action.type === "SCHEDULE_FOCUS" && data.action.targetId ? (
                <button type="button" className={rpgButtonClass("primary")} onClick={() => onSchedule(data.action, c.title)}>
                  Criar sessão Focus
                </button>
              ) : (
                data.action.link && (
                  <Link to={data.action.link} className={rpgButtonClass("primary")} onClick={onClose}>
                    {data.action.label}
                  </Link>
                )
              )}
              {data.secondaryActions.map((a) =>
                a.link ? (
                  <Link key={a.label} to={a.link} className={rpgButtonClass("secondary")} onClick={onClose}>
                    {a.label}
                  </Link>
                ) : null,
              )}
            </div>
          </section>

          <BottleneckImpactForecast impact={data.impact} />
          <p className="text-[10px] text-rpg-muted">Análise de {today.split("-").reverse().join("/")}.</p>
        </div>
      )}
    </Modal>
  );
}

type Filter = "all" | "TASK" | "PROJECT" | "CAMPAIGN" | "HABIT" | "HEALTH_SIGNAL" | "critical" | "risk";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "TASK", label: "Missões" },
  { value: "PROJECT", label: "Projetos" },
  { value: "CAMPAIGN", label: "Campanhas" },
  { value: "HABIT", label: "Contratos" },
  { value: "HEALTH_SIGNAL", label: "Saúde" },
  { value: "critical", label: "Críticos" },
  { value: "risk", label: "Em risco" },
];

/** Lista completa (todos os candidatos analisados) com filtros. */
export function BottleneckAllModal({ open, onClose, all, onSelect }: { open: boolean; onClose: () => void; all: Candidate[]; onSelect: (c: Candidate) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = useMemo(
    () =>
      all.filter((c) => {
        if (filter === "all") return true;
        if (filter === "critical") return c.level === "critical" || c.level === "high";
        if (filter === "risk") return c.kpis.deadlinesAtRisk > 0;
        if (filter === "CAMPAIGN") return c.type === "CAMPAIGN" || c.type === "MILESTONE";
        return c.type === filter;
      }),
    [all, filter],
  );
  return (
    <Modal open={open} onClose={onClose} title="Todos os gargalos analisados" size="lg">
      <RPGTabs size="sm" label="Filtrar gargalos" tabs={FILTERS} value={filter} onChange={setFilter} className="mb-3" />
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum item neste filtro.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={() => onSelect(c)} className="grid w-full grid-cols-[minmax(0,1fr)_100px] items-center gap-3 border border-rpg-border/60 bg-rpg-bg-2/50 px-2.5 py-2 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-rpg-text">{c.title}</span>
                  <span className="block text-[11px] text-rpg-muted">
                    {TYPE_UI[c.type].label} · {LEVEL_UI[c.level].label}
                    {c.context ? ` · ${c.context}` : ""}
                  </span>
                </span>
                <RPGProgressBar value={c.score} tone={LEVEL_UI[c.level].tone} label={`${c.title}: ${c.score}%`} valueLabel={`${c.score}%`} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** "Ver mapa": o mesmo grafo com mais profundidade (até 4 níveis) + atalho para o Life Map. */
export function BottleneckMapModal({ itemKey, period, onClose }: { itemKey: string | null; period: AnalysisPeriod; onClose: () => void }) {
  const { data, isLoading } = useBottleneckGraph(itemKey, period);
  return (
    <Modal open={!!itemKey} onClose={onClose} title="Mapa de dependências" size="lg">
      {isLoading && <div className="h-64 rpg-bar animate-pulse" />}
      {data && (
        <div className="space-y-3">
          <GraphCanvas graph={data} large />
          <details className="text-sm">
            <summary className="cursor-pointer text-rpg-muted">Ver como lista</summary>
            <div className="mt-2">
              <GraphList graph={data} />
            </div>
          </details>
          {data.truncated && <p className="text-[11px] text-rpg-muted">Há dependências mais profundas além do que cabe neste mapa.</p>}
        </div>
      )}
    </Modal>
  );
}
