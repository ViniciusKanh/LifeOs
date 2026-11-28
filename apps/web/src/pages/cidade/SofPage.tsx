import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Banknote, FileSignature, HandCoins, Landmark, Layers, LineChart, PiggyBank, Receipt, ScrollText } from "lucide-react";
import { RPGBadge } from "@/components/rpg";
import { AnimatedLineChart } from "@/components/charts/motion/AnimatedLineChart";
import { CityBanner, CityError, EmptyBox, LoadingBlock, R, Select, SourceStrip, dayBR, moneyShort, money, useCityActivity } from "@/components/city/CityKit";
import { BarList } from "@/components/city/InsightsPanel";
import { BigStat, Panel, Pills, fmtCompact, fmtPct } from "@/components/city/civic/CivicKit";
import { useSofContratos, useSofFuncoes, useSofOrgaos, useSofResumo } from "@/hooks/useCity";
import type { Execution, SofContract } from "@/services/cityService";
import { Notice } from "./DatasetPages";

/**
 * Finanças Públicas — orçamento da Prefeitura no Sistema de Orçamento e Finanças (SOF).
 * Execução do ano até o mês mais recente (orçado → empenhado → liquidado → pago), evolução mês a
 * mês, comparação com o mesmo ponto do ano anterior, para onde vai o dinheiro (funções de governo)
 * e contratos assinados no ano. Dados públicos, separados das finanças pessoais do LifeOS.
 */

const YEAR = new Date().getFullYear();
const YEARS = [YEAR, YEAR - 1, YEAR - 2, YEAR - 3];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const short = (n: number) => moneyShort(n);
/** Eixo do gráfico em bilhões/milhões, sem "R$" para caber. */
const axis = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} bi` : `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mi`);

export function SofPage() {
  const [ano, setAno] = useState(YEAR);
  const [orgao, setOrgao] = useState<string | null>(null);
  const resumo = useSofResumo(ano, orgao);
  const funcoes = useSofFuncoes(ano, resumo.data?.mes ?? null, orgao);
  const orgaos = useSofOrgaos(ano);
  const contratos = useSofContratos(ano, orgao);
  const r = resumo.data;
  const orgaoLabel = orgao ? (orgaos.data?.items.find((o) => o.cod === orgao)?.label ?? `Órgão ${orgao}`) : null;
  useCityActivity("sof", "explore", resumo.isSuccess ? `resumo:${ano}:${orgao ?? "pmsp"}` : null, "Finanças Públicas");

  return (
    <div className="space-y-4">
      <CityBanner domain="financas" eyebrow="Finanças Públicas" title="Orçamento da Cidade" subtitle="Quanto a Prefeitura planejou gastar, quanto já comprometeu, quanto entregou e quanto pagou — mês a mês, por área de governo e por órgão — e os contratos assinados no ano, direto do Sistema de Orçamento e Finanças.">
        <RPGBadge tone="gold">{r ? `Até ${MONTHS_FULL[r.mes - 1]} de ${r.ano}` : "Dinheiro público"}</RPGBadge>
      </CityBanner>
      <Notice tone="cyan">Números do orçamento municipal. Eles não se misturam com o Banco do Reino nem com as suas finanças pessoais no LifeOS.</Notice>

      <section className="rpg-panel flex flex-col gap-3 p-3 lg:flex-row lg:items-end" aria-label="Recorte">
        <Pills items={YEARS} value={ano} onChange={(v) => setAno(v)} label="Exercício" />
        <Select
          label="Órgão"
          value={orgao ?? ""}
          onChange={(v) => setOrgao(v || null)}
          options={[{ value: "", label: "Prefeitura inteira" }, ...(orgaos.data?.items ?? []).map((o) => ({ value: o.cod, label: o.label }))]}
          className="lg:ml-auto lg:w-96"
        />
      </section>

      {resumo.isLoading ? (
        <LoadingBlock label="Somando a execução do orçamento mês a mês…" rows={5} />
      ) : resumo.isError ? (
        <CityError error={resumo.error} onRetry={() => void resumo.refetch()} />
      ) : !r ? null : (
        <>
          <ExecutionHero e={r.latest} prev={r.previousYear} title={orgaoLabel ?? "Prefeitura de São Paulo"} mes={r.mes} ano={r.ano} />

          {r.cumulative.length >= 2 && (
            <div className="grid gap-3 xl:grid-cols-2">
              <Panel title="Execução acumulada no ano" icon={<LineChart size={16} />} subtitle="Orçado atualizado × empenhado × liquidado × pago, acumulados até cada mês">
                <div className="pb-6">
                  <AnimatedLineChart
                    labels={r.cumulative.map((p) => MONTHS[p.mes - 1]!)}
                    series={[
                      { key: "o", label: "Orçado", color: "#94a3b8", values: r.cumulative.map((p) => p.orcado) },
                      { key: "e", label: "Empenhado", color: "#f59e0b", values: r.cumulative.map((p) => p.empenhado) },
                      { key: "l", label: "Liquidado", color: "#a855f7", values: r.cumulative.map((p) => p.liquidado) },
                      { key: "p", label: "Pago", color: "#10b981", values: r.cumulative.map((p) => p.pago) },
                    ]}
                    formatValue={axis}
                    padLeft={48}
                    ariaLabel="Execução acumulada do orçamento por mês"
                  />
                </div>
              </Panel>
              <Panel title="Pago em cada mês" icon={<Banknote size={16} />} subtitle="Diferença entre o acumulado de um mês e o do mês anterior">
                <MonthBars items={r.monthly.map((m) => ({ label: MONTHS[m.mes - 1]!, value: m.pago, sub: m.empenhado }))} />
              </Panel>
            </div>
          )}

          <Panel title="Para onde vai o dinheiro" icon={<Layers size={16} />} subtitle={`Funções de governo · orçado atualizado e quanto já foi pago até ${MONTHS_FULL[r.mes - 1]}`}>
            {funcoes.isLoading ? (
              <LoadingBlock label="Consultando cada área de governo…" rows={4} />
            ) : funcoes.isError ? (
              <CityError error={funcoes.error} onRetry={() => void funcoes.refetch()} />
            ) : funcoes.data?.items.length ? (
              <FunctionList items={funcoes.data.items} failed={funcoes.data.failed} />
            ) : (
              <EmptyBox title="Sem despesas por função neste recorte." />
            )}
          </Panel>
        </>
      )}

      <Panel title={`Contratos de ${ano}${orgaoLabel ? ` · ${orgaoLabel}` : ""}`} icon={<FileSignature size={16} />} subtitle="Amostra das primeiras páginas da API (ela não informa o total nem ordena) — ordenada pelo LifeOS">
        {contratos.isLoading ? (
          <LoadingBlock label="Lendo os contratos do ano…" rows={4} />
        ) : contratos.isError ? (
          <CityError error={contratos.error} onRetry={() => void contratos.refetch()} />
        ) : !contratos.data?.sample ? (
          <EmptyBox title="Nenhum contrato publicado neste recorte." />
        ) : (
          <Contracts c={contratos.data} />
        )}
      </Panel>

      <SourceStrip apiId="sof" meta={r ? { fetchedAt: r.fetchedAt, stale: r.stale } : null} reference={r ? `Exercício ${r.ano}, acumulado até ${MONTHS_FULL[r.mes - 1]}` : null} />
    </div>
  );
}

/* ───────────────────────── peças ───────────────────────── */

/** Funil da execução: cada etapa como fatia do orçado atualizado. */
function ExecutionHero({ e, prev, title, mes, ano }: { e: Execution; prev: (Execution & { ano: number }) | null; title: string; mes: number; ano: number }) {
  const o = Math.max(e.orcado, 1);
  const seg = [
    { key: "pago", label: "Pago", value: e.pago, cls: "bg-emerald-500" },
    { key: "liq", label: "Liquidado a pagar", value: Math.max(0, e.liquidado - e.pago), cls: "bg-purple-500" },
    { key: "emp", label: "Empenhado a liquidar", value: Math.max(0, e.empenhado - e.liquidado), cls: "bg-amber-500" },
    { key: "saldo", label: "Ainda não empenhado", value: Math.max(0, e.orcado - e.empenhado), cls: "bg-rpg-bg-2" },
  ];
  const delta = prev && prev.pago > 0 ? ((e.pago - prev.pago) / prev.pago) * 100 : null;
  return (
    <section className="rpg-panel space-y-3 border-amber-400/40 bg-gradient-to-br from-amber-950/40 via-rpg-panel to-rpg-panel p-3" aria-label="Execução do orçamento">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-pixel text-[10px] uppercase text-rpg-gold">{title}</p>
          <p className="font-rpg text-2xl font-bold text-rpg-text sm:text-3xl" title={money(e.orcado)}>
            {short(e.orcado)}
          </p>
          <p className="text-xs text-rpg-muted">
            orçamento atualizado de {ano} · inicial {short(e.orcadoInicial)} {e.orcado !== e.orcadoInicial && `(${e.orcado > e.orcadoInicial ? "+" : ""}${fmtPct(((e.orcado - e.orcadoInicial) / Math.max(e.orcadoInicial, 1)) * 100)} no ano)`}
          </p>
        </div>
        {delta != null && prev && (
          <p className={clsx("inline-flex items-center gap-1 border px-2 py-1 text-xs", delta >= 0 ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")} style={R} title={`Pago até ${MONTHS_FULL[mes - 1]} de ${prev.ano}: ${money(prev.pago)}`}>
            {delta >= 0 ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
            {fmtPct(Math.abs(delta))} {delta >= 0 ? "a mais" : "a menos"} pago que no mesmo ponto de {prev.ano}
          </p>
        )}
      </div>

      <div className="flex h-6 w-full overflow-hidden border-2 border-rpg-border" style={R} role="img" aria-label={seg.map((s) => `${s.label}: ${short(s.value)}`).join(", ")}>
        {seg.map((s) => (
          <div key={s.key} className={clsx("h-full transition-[width] duration-700", s.cls)} style={{ width: `${(s.value / o) * 100}%` }} title={`${s.label}: ${money(s.value)}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rpg-muted">
        {seg.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1">
            <span className={clsx("h-2.5 w-2.5 border border-rpg-border", s.cls)} aria-hidden /> {s.label} · <span className="tabular-nums text-rpg-text/90">{short(s.value)}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <BigStat label="Empenhado" value={short(e.empenhado)} hint={`${fmtPct(e.execEmpenhado)} do orçado — dinheiro reservado para um gasto`} accent="bg-amber-500" icon={<ScrollText size={20} />} />
        <BigStat label="Liquidado" value={short(e.liquidado)} hint={`${fmtPct(e.execLiquidado)} — serviço ou compra entregue`} accent="bg-purple-500" icon={<Receipt size={20} />} />
        <BigStat label="Pago" value={short(e.pago)} hint={`${fmtPct(e.execPago)} do orçado já saiu do caixa`} accent="bg-emerald-500" icon={<HandCoins size={20} />} />
        <BigStat label="Disponível" value={short(e.disponivel)} hint={e.congelado > 0 ? `${short(e.congelado)} congelados` : "saldo livre para empenhar"} accent="bg-sky-500" icon={<PiggyBank size={20} />} />
      </div>
    </section>
  );
}

function MonthBars({ items }: { items: Array<{ label: string; value: number; sub: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      <div className="flex h-44 gap-1.5" role="img" aria-label={items.map((i) => `${i.label}: ${short(i.value)}`).join(", ")}>
        {items.map((i) => (
          <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${i.label}: pago ${money(i.value)} · empenhado ${money(i.sub)}`}>
            <span className="hidden text-[9px] tabular-nums text-rpg-muted sm:block">{axis(i.value)}</span>
            <div className="w-full bg-emerald-500/80 transition-[height] duration-500" style={{ ...R, height: `${Math.max(2, (Math.max(0, i.value) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {items.map((i) => (
          <span key={i.label} className="min-w-0 flex-1 text-center font-pixel text-[9px] uppercase text-rpg-muted">
            {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type FnItem = Execution & { cod: string; label: string; share: number | null };

function FunctionList({ items, failed }: { items: FnItem[]; failed: number }) {
  const [sort, setSort] = useState<"orcado" | "exec">("orcado");
  const sorted = useMemo(() => [...items].sort((a, b) => (sort === "orcado" ? b.orcado - a.orcado : (b.execPago ?? 0) - (a.execPago ?? 0))), [items, sort]);
  const max = Math.max(1, ...items.map((i) => i.orcado));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pills items={["orcado", "exec"] as Array<"orcado" | "exec">} value={sort} onChange={setSort} label="Ordenar por" render={(v) => (v === "orcado" ? "Maior orçamento" : "Mais executado")} />
        <p className="flex gap-3 text-[11px] text-rpg-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 bg-amber-500/30" aria-hidden /> orçado
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 bg-emerald-500" aria-hidden /> pago
          </span>
        </p>
      </div>
      <ul className="grid gap-x-4 gap-y-2 lg:grid-cols-2">
        {sorted.map((f) => (
          <li key={f.cod} className="min-w-0">
            <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-rpg-text" title={f.label}>
                {f.label}
              </span>
              <span className="shrink-0 tabular-nums text-rpg-text/90">{short(f.orcado)}</span>
            </div>
            <div className="relative h-3 w-full bg-rpg-bg-2" style={R} role="img" aria-label={`${f.label}: orçado ${short(f.orcado)}, pago ${short(f.pago)} (${fmtPct(f.execPago)})`}>
              <div className="absolute inset-y-0 left-0 bg-amber-500/30" style={{ ...R, width: `${(f.orcado / max) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ ...R, width: `${(Math.min(f.pago, f.orcado) / max) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-rpg-muted">
              {fmtPct(f.share)} do orçamento · {fmtPct(f.execPago)} pago · {fmtPct(f.execEmpenhado)} empenhado
            </p>
          </li>
        ))}
      </ul>
      {failed > 0 && <p className="text-[11px] text-amber-300">{failed} função(ões) não responderam agora e ficaram de fora.</p>}
    </div>
  );
}

function Contracts({ c }: { c: { sample: number; valor: number; pago: number; modalidades: Array<{ label: string; count: number; valor: number; share: number | null }>; recentes: SofContract[]; maiores: SofContract[] } }) {
  const [view, setView] = useState<"recentes" | "maiores">("recentes");
  const list = view === "recentes" ? c.recentes : c.maiores;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <BigStat label="Contratos lidos" value={c.sample.toLocaleString("pt-BR")} hint="amostra das primeiras páginas" accent="bg-amber-500" icon={<FileSignature size={20} />} />
        <BigStat label="Valor principal" value={short(c.valor)} hint="soma da amostra" accent="bg-amber-500" icon={<Landmark size={20} />} />
        <BigStat label="Já pago" value={short(c.pago)} hint={c.valor > 0 ? `${fmtPct((c.pago / c.valor) * 100)} do valor principal` : undefined} accent="bg-emerald-500" icon={<HandCoins size={20} />} />
        <BigStat label="Modalidades" value={c.modalidades.length.toLocaleString("pt-BR")} hint={c.modalidades[0] ? `mais valor: ${c.modalidades[0].label}` : undefined} accent="bg-sky-500" icon={<Layers size={20} />} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <BarList title="Valor por modalidade" items={c.modalidades.map((m) => ({ label: `${m.label} (${m.count})`, value: m.valor }))} format={short} tone="gold" />
        <div className="min-w-0">
          <Pills items={["recentes", "maiores"] as Array<"recentes" | "maiores">} value={view} onChange={setView} label="Lista" render={(v) => (v === "recentes" ? "Assinados por último" : "Maiores valores")} />
          <ul className="mt-2 space-y-1.5">
            {list.map((k) => (
              <li key={k.id} className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 min-w-0 text-sm text-rpg-text" title={k.objeto ?? undefined}>
                    {k.objeto ?? "Objeto não informado"}
                  </p>
                  <span className="shrink-0 font-rpg text-sm font-bold tabular-nums text-rpg-gold-light">{short(k.valor)}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-rpg-muted">
                  {[k.orgao, k.modalidade, k.numero && `nº ${k.numero}`, k.assinatura && `assinado em ${dayBR(k.assinatura)}`, k.vigencia && `vigência até ${dayBR(k.vigencia)}`].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
