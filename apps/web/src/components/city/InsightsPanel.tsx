import type { ReactNode } from "react";
import clsx from "clsx";
import { BarChart3, Database, LineChart, Trophy } from "lucide-react";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { useCityInsights } from "@/hooks/useCity";
import type { CityApi, CityDomain, ColumnKind, Insights, Params } from "@/services/cityService";
import { CityError, DOMAIN, LoadingBlock, R, formatValue } from "./CityKit";

/**
 * Leituras de um recurso (somas, rankings, série no tempo) calculadas pelo servidor sobre uma
 * amostra grande da base. Tudo aqui é rotulado como cálculo do LifeOS na amostra — nunca como
 * número oficial da Prefeitura, exceto o total de registros da base.
 */

const BAR_BG: Record<string, string> = { gold: "bg-rpg-gold", green: "bg-rpg-green", blue: "bg-rpg-blue", purple: "bg-rpg-purple", cyan: "bg-rpg-cyan", orange: "bg-rpg-orange", red: "bg-rpg-red", pink: "bg-rpg-pink", muted: "bg-rpg-muted" };
const BY_LABEL = { day: "por dia", month: "por mês", hour: "por horário", weekday: "por dia da semana" } as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const xLabel = (by: string, x: string) => (by === "month" ? `${MONTHS[Number(x.slice(5, 7)) - 1] ?? x}/${x.slice(2, 4)}` : by === "day" ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : x);
const fmt = (kind: ColumnKind | "count", v: number, short = false) => (kind === "count" ? v.toLocaleString("pt-BR") : formatValue(kind, v, { short }));

export function Kpi({ label, value, hint, tone = "gold" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof BAR_BG }) {
  return (
    <div className="min-w-0 border-2 border-rpg-border bg-rpg-panel p-2.5" style={R}>
      <span className={clsx("mb-1.5 block h-1 w-8", BAR_BG[tone])} style={R} aria-hidden />
      <p className="truncate font-pixel text-[10px] uppercase text-rpg-muted" title={label}>
        {label}
      </p>
      <p className="truncate font-rpg text-xl font-bold leading-tight text-rpg-text tabular-nums">{value}</p>
      {hint && <p className="truncate text-[11px] text-rpg-muted">{hint}</p>}
    </div>
  );
}

export function BarList({ title, items, format, tone, onPick, note }: { title: string; items: Array<{ label: string; value: number }>; format: (v: number) => string; tone: string; onPick?: (label: string) => void; note?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
        <span className="font-pixel text-[10px] uppercase text-rpg-gold">{title}</span>
        {note && <span className="text-[11px] text-rpg-muted">{note}</span>}
      </figcaption>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const inner = (
            <>
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-rpg-text/90" title={it.label}>
                  {it.label}
                </span>
                <span className="shrink-0 tabular-nums text-rpg-muted">{format(it.value)}</span>
              </div>
              <div className="mt-0.5 h-2 bg-rpg-bg-2" style={R}>
                <div className={clsx("h-2", BAR_BG[tone] ?? "bg-rpg-gold")} style={{ ...R, width: `${Math.max(3, (it.value / max) * 100)}%` }} />
              </div>
            </>
          );
          return (
            <li key={it.label}>
              {onPick ? (
                <button type="button" onClick={() => onPick(it.label)} className="block w-full text-left hover:opacity-90" aria-label={`Explorar ${it.label}`}>
                  {inner}
                </button>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function InsightsView({ insights, total, domain, onDimPick, totalLabel = "Registros na base" }: { insights: Insights; total: number | null; domain: CityDomain; onDimPick?: (dim: string, value: string) => void; totalLabel?: string }) {
  const tone = DOMAIN[domain].tone;
  const s = insights.series;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        {total != null && <Kpi label={totalLabel} value={total.toLocaleString("pt-BR")} hint="dado oficial da base" tone={tone} />}
        {insights.measures.map((m) => (
          <Kpi key={m.label} label={m.label} value={formatValue(m.kind, m.value, { short: true })} hint={`${m.filled.toLocaleString("pt-BR")} registro(s) · amostra`} tone={tone} />
        ))}
      </div>
      {(s || insights.ranking) && (
        <div className={clsx("grid gap-3", s && insights.ranking && "lg:grid-cols-2")}>
          {s && (
            <section className="rpg-panel min-w-0 p-3" aria-label={s.label}>
              <p className="mb-2 flex items-center gap-1.5 font-pixel text-[10px] uppercase text-rpg-gold">
                <LineChart size={13} aria-hidden /> {s.label}
              </p>
              <AnimatedLineChart
                labels={s.points.map((p) => xLabel(s.by, p.x))}
                series={[{ key: "y", label: s.column, color: DOMAIN[domain].to, values: s.points.map((p) => p.y) }]}
                formatValue={(v) => fmt(s.kind, v, true)}
                ariaLabel={`${s.label} ${BY_LABEL[s.by]}`}
              />
            </section>
          )}
          {insights.ranking && (
            <section className="rpg-panel min-w-0 p-3" aria-label={insights.ranking.label}>
              <BarList
                title={insights.ranking.label}
                items={insights.ranking.items}
                format={(v) => fmt(insights.ranking!.kind, v, true)}
                tone={tone}
                note={`soma de “${insights.ranking.measure}”`}
                onPick={onDimPick ? (v) => onDimPick(insights.ranking!.dim, v) : undefined}
              />
            </section>
          )}
        </div>
      )}
      {!!insights.dims.length && (
        <section className="rpg-panel grid min-w-0 gap-4 p-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Distribuições">
          {insights.dims.map((d) => (
            <BarList
              key={d.label}
              title={d.label}
              items={d.items.map((i) => ({ label: i.label, value: i.count }))}
              format={(v) => v.toLocaleString("pt-BR")}
              tone={tone}
              note={`${d.distinct} valor(es)`}
              onPick={onDimPick ? (v) => onDimPick(d.column, v) : undefined}
            />
          ))}
        </section>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-rpg-muted">
        <Database size={12} aria-hidden /> Leituras calculadas pelo LifeOS sobre {insights.sampleSize.toLocaleString("pt-BR")} registro(s) carregados
        {total != null && total > insights.sampleSize ? ` de ${total.toLocaleString("pt-BR")} na base` : ""}. O total da base é o número oficial.
      </p>
    </div>
  );
}

/** Painel completo: busca as leituras do recurso e mostra (ou some, se o recurso não tem leituras). */
export function InsightsPanel({ apiId, resource, params, domain, enabled = true, onDimPick, totalLabel }: { apiId: CityApi; resource: string; params: Params; domain: CityDomain; enabled?: boolean; onDimPick?: (dim: string, value: string) => void; totalLabel?: string }) {
  const q = useCityInsights(apiId, resource, params, enabled);
  if (!enabled) return null;
  if (q.isLoading) return <LoadingBlock label="Calculando as leituras da amostra…" rows={2} />;
  if (q.isError) return <CityError error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data?.insights) return null;
  if (!q.data.insights.sampleSize)
    return (
      <p className="flex items-center gap-1.5 text-sm text-rpg-muted">
        <BarChart3 size={14} aria-hidden /> A base não trouxe registros para este filtro.
      </p>
    );
  return (
    <section className="space-y-2" aria-label="Leituras">
      <h2 className="rpg-title flex items-center gap-2 text-sm font-bold uppercase">
        <Trophy size={16} className={DOMAIN[domain].text} aria-hidden /> Panorama
      </h2>
      <InsightsView insights={q.data.insights} total={q.data.total} domain={domain} onDimPick={onDimPick} totalLabel={totalLabel} />
    </section>
  );
}
