import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGProgressBar, RPGTabs, rpgButtonClass } from "@/components/rpg";
import { useBottleneckDetail, useBottleneckGraph } from "@/hooks/useBottlenecks";
import type { AnalysisPeriod, Candidate, RecommendedAction, ScoreDim } from "@/services/bottlenecksService";
import { LEVEL_UI, TYPE_UI, urgencyMeaning } from "@/utils/bottleneckDisplay";
import { GraphCanvas, GraphLegend, GraphList } from "./BottleneckDependencyGraph";
import { SCHEDULE_LABEL, isScheduleAction } from "./BottleneckRecommendedAction";
import { BottleneckImpactForecast } from "./BottleneckImpactForecast";

/** Cada parte da nota em linguagem simples (o peso vem da configuração do servidor). */
const DIM_LABEL: Record<ScoreDim, { label: string; hint: string }> = {
  dependency: { label: "Coisas esperando por ele", hint: "Quantas tarefas, projetos e campanhas só andam depois dele." },
  urgency: { label: "Pressa do prazo", hint: "Quanto mais perto (ou vencido) o prazo, maior." },
  inactivity: { label: "Tempo parado", hint: "Dias sem nenhum avanço registrado." },
  strategic: { label: "Importância", hint: "Prioridade e ligação com metas e campanhas." },
  capacity: { label: "Agenda apertada", hint: "Quanto sua agenda dos próximos dias já está cheia." },
  downstream: { label: "Efeito dominó", hint: "Prazos de outros itens que podem estourar em cadeia." },
};

/** Detalhe completo de um item: nota explicada, motivos, mapa, histórico, ação e simulação. */
export function BottleneckDetailModal({ itemKey, period, today, onClose, onSchedule }: { itemKey: string | null; period: AnalysisPeriod; today: string; onClose: () => void; onSchedule: (action: RecommendedAction, title: string) => void }) {
  const { data, isLoading, isError } = useBottleneckDetail(itemKey, period);
  const c = data?.candidate;
  return (
    <Modal open={!!itemKey} onClose={onClose} title={c ? c.title : "Por que isso trava"} size="lg">
      {isLoading && <div className="h-64 rpg-bar animate-pulse" aria-label="Carregando detalhe" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar o detalhe.</p>}
      {data && c && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RPGBadge tone={TYPE_UI[c.type].tone}>{TYPE_UI[c.type].label}</RPGBadge>
            <RPGBadge tone={LEVEL_UI[c.level].tone}>
              {LEVEL_UI[c.level].badge} · nota {c.score}/100
            </RPGBadge>
            {c.dueDate && <span className="text-xs text-rpg-muted">Prazo: {c.dueDate.split("-").reverse().join("/")}</span>}
            {c.flags.noEstimate && c.type === "TASK" && <span className="text-xs text-rpg-muted">Tempo não estimado</span>}
          </div>
          <p className="text-sm text-rpg-text/85">{c.description}</p>
          <p className="text-xs text-rpg-text/75">
            {LEVEL_UI[c.level].meaning} {c.dueDate ? urgencyMeaning(c.urgency) : ""}
          </p>

          <section aria-label="Como a nota foi calculada">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-1">De onde vem a nota {c.score}</h3>
            {c.scores ? (
              <>
                <p className="mb-2 text-[11px] text-rpg-muted">A nota junta seis sinais (cada um de 0 a 100). Barras mais cheias pesam mais no resultado.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(DIM_LABEL) as ScoreDim[]).map((k) => (
                    <div key={k}>
                      <RPGProgressBar value={c.scores![k]} tone="purple" label={DIM_LABEL[k].label} valueLabel={`${c.scores![k]}`} />
                      <p className="mt-0.5 text-[10px] text-rpg-muted">{DIM_LABEL[k].hint}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-rpg-muted">Sinal de saúde: entra só como padrão observado nos seus registros, sem fórmula e sem diagnóstico.</p>
            )}
          </section>

          <section aria-label="Causas">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Por que está travado</h3>
            {data.causes.length === 0 ? (
              <p className="text-xs text-rpg-muted">Ainda não há registros suficientes para apontar o motivo.</p>
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
            <section aria-label="O que está ligado a isso">
              <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">O que está ligado a isso</h3>
              <GraphCanvas graph={data.graph} />
              <GraphLegend />
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

          <section aria-label="O que fazer agora">
            <h3 className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">O que fazer agora</h3>
            <p className="text-sm text-rpg-text mb-2">{data.action.reason}</p>
            <div className="flex flex-wrap gap-2">
              {isScheduleAction(data.action) && data.action.targetId ? (
                <button type="button" className={rpgButtonClass("gold")} onClick={() => onSchedule(data.action, c.title)}>
                  {SCHEDULE_LABEL}
                </button>
              ) : (
                data.action.link && (
                  <Link to={data.action.link} className={rpgButtonClass("gold")} onClick={onClose}>
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
  { value: "TASK", label: "Tarefas" },
  { value: "PROJECT", label: "Projetos" },
  { value: "CAMPAIGN", label: "Campanhas" },
  { value: "HABIT", label: "Hábitos" },
  { value: "HEALTH_SIGNAL", label: "Saúde" },
  { value: "critical", label: "Mais urgentes" },
  { value: "risk", label: "Prazo em risco" },
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
    <Modal open={open} onClose={onClose} title="Tudo o que foi analisado" size="lg">
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
                <RPGProgressBar value={c.score} tone={LEVEL_UI[c.level].tone} label={`${c.title}: nota ${c.score} de 100`} valueLabel={`${c.score}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** "Ampliar": o mesmo mapa com mais profundidade (até 4 níveis). */
export function BottleneckMapModal({ itemKey, period, onClose }: { itemKey: string | null; period: AnalysisPeriod; onClose: () => void }) {
  const { data, isLoading } = useBottleneckGraph(itemKey, period);
  return (
    <Modal open={!!itemKey} onClose={onClose} title="Mapa do que está ligado" size="lg">
      {isLoading && <div className="h-64 rpg-bar animate-pulse" />}
      {data && (
        <div className="space-y-3">
          <GraphCanvas graph={data} large />
          <GraphLegend />
          <details className="text-sm">
            <summary className="cursor-pointer text-rpg-muted">Ver como lista</summary>
            <div className="mt-2">
              <GraphList graph={data} />
            </div>
          </details>
          {data.truncated && <p className="text-[11px] text-rpg-muted">Há mais ligações além do que cabe neste mapa.</p>}
        </div>
      )}
    </Modal>
  );
}
