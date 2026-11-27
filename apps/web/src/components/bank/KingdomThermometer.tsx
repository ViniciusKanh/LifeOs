import clsx from "clsx";
import { Info, Landmark, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { R } from "@/components/adventures/AdventureKit";
import { IntegrationBanner } from "@/components/integrations/IntegrationKit";
import { fmtNum, shortDay } from "@/components/integrations/PublicApiKit";
import { useThermometer } from "@/hooks/usePublicApis";
import type { SgsPoint } from "@/services/publicApisService";

const pct = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${fmtNum(n, d)}%`);
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const monthLabel = (d: string) => `${d.slice(5, 7)}/${d.slice(2, 4)}`;

/** Linha simples (SVG) de uma série mensal, com o primeiro e o último valor anotados. */
function Spark({ points, tone, label }: { points: SgsPoint[]; tone: string; label: string }) {
  if (points.length < 2) return <p className="text-[11px] text-rpg-muted">Histórico insuficiente.</p>;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = 70;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 6 - ((p.value - min) / span) * (H - 16)] as const);
  return (
    <figure aria-label={`${label}: de ${fmtNum(vals[0]!)}% em ${monthLabel(points[0]!.date)} para ${fmtNum(vals[vals.length - 1]!)}% em ${monthLabel(points[points.length - 1]!.date)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} className={tone} />
        <circle cx={xy[xy.length - 1]![0]} cy={xy[xy.length - 1]![1]} r={3} className={clsx("fill-current", tone)} />
      </svg>
      <figcaption className="flex justify-between text-[10px] text-rpg-muted">
        <span>
          {monthLabel(points[0]!.date)} · {fmtNum(vals[0]!)}%
        </span>
        <span>
          {monthLabel(points[points.length - 1]!.date)} · <b className="text-rpg-text">{fmtNum(vals[vals.length - 1]!)}%</b>
        </span>
      </figcaption>
    </figure>
  );
}

function Rate({ label, value, sub, tone = "text-rpg-text", border = "border-rpg-border" }: { label: string; value: string; sub: string; tone?: string; border?: string }) {
  return (
    <div className={clsx("border bg-rpg-bg-2/60 p-2.5", border)} style={R}>
      <p className="text-[10px] uppercase tracking-wide text-rpg-muted">{label}</p>
      <p className={clsx("font-rpg text-xl font-bold leading-tight sm:text-2xl", tone)}>{value}</p>
      <p className="truncate text-[10px] text-rpg-muted">{sub}</p>
    </div>
  );
}

function SimBar({ label, value, max, tone, note }: { label: string; value: number | null; max: number; tone: string; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-rpg-text">{label}</span>
        <span className="font-semibold tabular-nums text-rpg-text">{brl(value)}</span>
      </div>
      <div className="h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 3 }} aria-hidden>
        <span className={clsx("block h-full", tone)} style={{ width: `${value == null ? 0 : Math.max(2, (value / max) * 100)}%` }} />
      </div>
      {note && <p className="text-[10px] text-rpg-muted">{note}</p>}
    </div>
  );
}

/**
 * Termômetro do Reino — Selic, CDI, IPCA e poupança oficiais (Banco Central,
 * SGS) ao lado dos planos do Cofrinho, que pagam moeda do jogo. Painel
 * educativo: mostra o mundo real para comparar, sem prometer rendimento.
 */
export function KingdomThermometer() {
  const q = useThermometer();
  const o = q.data;
  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Termômetro do Reino (Banco Central)">
      <IntegrationBanner icon={<Percent size={22} />} tone="green" title="Termômetro do Reino" subtitle="Selic, CDI, IPCA e poupança oficiais do Banco Central para comparar com o Cofrinho." />
      {q.isLoading ? (
        <div className="h-48 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível ler as taxas do Banco Central.
        </p>
      ) : !o.available ? (
        <p className="text-sm text-rpg-orange" role="status">
          {o.message}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 [&>*]:min-w-0">
            <Rate label="Selic meta" value={pct(o.selic?.value)} sub={o.selic ? `ao ano · ${shortDay(o.selic.date)}` : "sem dado"} />
            <Rate label="CDI" value={pct(o.cdi?.value)} sub={o.cdi ? `ao ano · ${shortDay(o.cdi.date)}` : "sem dado"} />
            <Rate label="IPCA 12 meses" value={pct(o.ipca12?.value)} sub={o.ipcaMonth ? `último mês ${pct(o.ipcaMonth.value)}` : "inflação oficial"} tone="text-rpg-orange" />
            <Rate label="Poupança" value={pct(o.poupancaYear)} sub={o.poupancaMonth ? `${pct(o.poupancaMonth.value, 4)} ao mês` : "sem dado"} tone="text-rpg-blue" />
            <Rate label="Juro real" value={pct(o.realRate, 1)} sub="CDI descontada a inflação" tone={o.realRate != null && o.realRate >= 0 ? "text-rpg-green" : "text-rpg-red"} border={o.realRate != null && o.realRate >= 0 ? "border-rpg-green/60" : "border-rpg-red/60"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                <TrendingUp size={13} className="text-rpg-green" aria-hidden /> Selic (fim de cada mês)
              </p>
              <Spark points={o.history.selic} tone="text-rpg-green" label="Selic" />
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                <TrendingDown size={13} className="text-rpg-orange" aria-hidden /> IPCA acumulado em 12 meses
              </p>
              <Spark points={o.history.ipca12} tone="text-rpg-orange" label="IPCA 12 meses" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-rpg-text">Quanto R$ 1.000 rendem em 1 ano</p>
              {(() => {
                const max = Math.max(o.sim.cdiGross ?? 0, o.sim.poupanca ?? 0, o.sim.inflation ?? 0, 1);
                return (
                  <div className="space-y-2">
                    <SimBar label="100% do CDI (bruto)" value={o.sim.cdiGross} max={max} tone="bg-rpg-green" />
                    <SimBar label="100% do CDI (com IR de 17,5%)" value={o.sim.cdiNet} max={max} tone="bg-rpg-green/60" />
                    <SimBar label="Poupança (isenta)" value={o.sim.poupanca} max={max} tone="bg-rpg-blue" />
                    <SimBar label="Inflação do período (perda de valor)" value={o.sim.inflation} max={max} tone="bg-rpg-red" note="Rendimento acima desta barra é ganho real." />
                  </div>
                );
              })()}
            </div>
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
                <Landmark size={13} className="text-rpg-gold" aria-hidden /> Cofrinho do Reino × mundo real
              </p>
              <ul className="space-y-1.5">
                {o.plans.map((p) => (
                  <li key={p.id} className="border border-rpg-border bg-rpg-bg-2/60 p-2 text-[11px]" style={R}>
                    <p className="font-semibold text-rpg-text">
                      {p.label} <span className="font-normal text-rpg-muted">· {p.termDays} dias</span>
                    </p>
                    <p className="text-rpg-muted">
                      Jogo: <b className="text-rpg-gold-light">+{fmtNum(p.gamePct, 0)}%</b> · CDI real no mesmo prazo: <b className="text-rpg-green">{p.cdiSamePeriodPct == null ? "—" : `+${fmtNum(p.cdiSamePeriodPct, 2)}%`}</b>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[10px] text-rpg-muted">
            <Info size={12} className="mt-px shrink-0" aria-hidden />
            As taxas do Cofrinho são do jogo (moedas) e de propósito bem maiores que as reais. Dados: {o.source}, atualizados a cada 12 h{o.partial ? " (algumas séries não responderam agora)" : ""}. Não é recomendação de investimento.
          </p>
        </div>
      )}
    </section>
  );
}
