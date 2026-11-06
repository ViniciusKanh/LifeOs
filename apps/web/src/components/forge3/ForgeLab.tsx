import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Activity, Archive, ArrowDown, ArrowUp, BookMarked, CheckCircle2, ChevronDown, FlaskConical, Gauge, Hammer, History, Loader2, RefreshCw, RotateCcw, ScrollText, ShieldCheck, Telescope, TrendingDown, Workflow, XCircle } from "lucide-react";
import { RPGButton, RPGProgressBar, RPGProgressRing } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { useForgeActions, useForgeDictionary } from "@/hooks/useForge";
import { RUN_KIND, RUN_STATUS, fmtNum, type ForgeOverview, type Run } from "@/services/forgeService";
import { Empty, R, Section as KitSection, Tag, errMsg, fmtDate, fmtDateTime, pct, type Notify } from "./ForgeShared";
import { IconTile } from "./ForgeOverview";

/* ═════════════ Experimentos: diário de execuções ═════════════ */

const KIND_UI: Record<Run["kind"], { icon: ReactNode; tone: RpgTone }> = {
  train: { icon: <Hammer size={16} />, tone: "purple" },
  backtest: { icon: <History size={16} />, tone: "blue" },
  inference: { icon: <Telescope size={16} />, tone: "pink" },
  monitor: { icon: <Activity size={16} />, tone: "cyan" },
  quality: { icon: <Gauge size={16} />, tone: "green" },
};
const statusTone = (r: Run): RpgTone => (r.status === "done" ? "green" : r.status === "failed" ? "red" : r.status === "insufficient" ? "orange" : "muted");

function Counter({ label, value, tone, icon }: { label: string; value: string; tone: RpgTone; icon: ReactNode }) {
  return (
    <div className="rpg-panel flex items-center gap-2.5 p-2.5">
      <IconTile tone={tone} size="sm">
        {icon}
      </IconTile>
      <div className="min-w-0">
        <p className="font-rpg text-xl font-bold leading-none tabular-nums text-rpg-text">{value}</p>
        <p className="mt-1 truncate text-xs text-rpg-muted">{label}</p>
      </div>
    </div>
  );
}

export function ExperimentsTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const a = useForgeActions();
  const [kind, setKind] = useState<Run["kind"] | "all">("all");
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const visible = o.runs.filter((r) => archived || !r.archived);
  const runs = visible.filter((r) => kind === "all" || r.kind === kind);
  const names = new Map(o.models.map((m) => [m.id, m.name]));
  const totalMs = visible.reduce((s, r) => s + (r.durationMs ?? 0), 0);
  // Re-executar repete a mesma operação: o servidor garante idempotência (treino idêntico não gera versão nem XP).
  const rerun = (r: Run) => {
    const done = { onSuccess: () => notify(`${RUN_KIND[r.kind]} executado novamente.`), onError: (e: unknown) => notify(errMsg(e, "Falha ao re-executar."), "error") };
    if (r.kind === "quality") a.analyze.mutate(undefined, done);
    else if (!r.modelId) return;
    else if (r.kind === "train") a.train.mutate(r.modelId, { onSuccess: (x) => notify(x.message, x.status === "insufficient" ? "error" : "success"), onError: done.onError });
    else if (r.kind === "backtest") a.backtest.mutate(r.modelId, done);
    else if (r.kind === "monitor") a.monitor.mutate(r.modelId, done);
    else a.refreshPredictions.mutate(undefined, done);
  };
  const pending = a.analyze.isPending || a.train.isPending || a.backtest.isPending || a.monitor.isPending || a.refreshPredictions.isPending;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Counter label="Execuções registradas" value={String(visible.length)} tone="purple" icon={<FlaskConical size={16} />} />
        <Counter label="Concluídas" value={String(visible.filter((r) => r.status === "done").length)} tone="green" icon={<CheckCircle2 size={16} />} />
        <Counter label="Sem dados suficientes" value={String(visible.filter((r) => r.status === "insufficient").length)} tone="orange" icon={<Gauge size={16} />} />
        <Counter label="Tempo total de cálculo" value={`${(totalMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`} tone="cyan" icon={<History size={16} />} />
      </div>
      <KitSection
        title="Diário de Experimentos"
        icon={<FlaskConical size={15} />}
        tone="legendary"
        action={
          <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arquivados
          </label>
        }
      >
        <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar por tipo">
          {(["all", "train", "backtest", "inference", "monitor", "quality"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx("inline-flex shrink-0 items-center gap-1.5 border-2 px-2.5 py-1 text-xs font-semibold", kind === k ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={R}>
              {k !== "all" && <span className={RPG_TONE_TEXT[KIND_UI[k].tone]}>{KIND_UI[k].icon}</span>}
              {k === "all" ? "Todos" : RUN_KIND[k]}
            </button>
          ))}
        </div>
        {!runs.length ? (
          <Empty icon={<FlaskConical size={22} />} title="Nenhuma execução">
            Treinos, backtests, profecias e vigílias aparecem aqui com o log completo.
          </Empty>
        ) : (
          <ol className="relative space-y-2 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-0.5 before:bg-rpg-border">
            {runs.map((r) => {
              const ui = KIND_UI[r.kind];
              return (
                <li key={r.id} className="relative pl-12">
                  <span className="absolute left-0 top-1.5">
                    <IconTile tone={ui.tone} size="sm">
                      {ui.icon}
                    </IconTile>
                  </span>
                  <div className={clsx("border bg-rpg-bg-2/60", r.status === "failed" ? "border-rpg-red/60" : "border-rpg-border")} style={R}>
                    <div className="flex flex-wrap items-center gap-2 p-2">
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <ChevronDown size={14} className={clsx("shrink-0 text-rpg-muted transition-transform", open === r.id && "rotate-180")} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-rpg-text">
                            {RUN_KIND[r.kind]} · {r.modelId ? (names.get(r.modelId) ?? "modelo removido") : "todos os dados"}
                          </span>
                          <span className="block text-[11px] text-rpg-muted">
                            {fmtDateTime(r.startedAt)} · {r.trigger === "manual" ? "por você" : `automação (${r.trigger})`} · {r.durationMs == null ? "—" : `${(r.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`}
                          </span>
                        </span>
                      </button>
                      <Tag tone={statusTone(r)}>{RUN_STATUS[r.status]}</Tag>
                      <RPGButton variant="ghost" className="!px-2 !py-1" aria-label="Executar de novo" title="Executar de novo" disabled={pending || r.status === "running" || (!r.modelId && r.kind !== "quality")} onClick={() => rerun(r)}>
                        <RotateCcw size={14} aria-hidden />
                      </RPGButton>
                      {!r.archived && (
                        <RPGButton variant="ghost" className="!px-2 !py-1" aria-label="Arquivar execução" title="Arquivar" onClick={() => a.archiveRun.mutate(r.id, { onError: (e) => notify(errMsg(e, "Falha ao arquivar."), "error") })}>
                          <Archive size={14} aria-hidden />
                        </RPGButton>
                      )}
                    </div>
                    {open === r.id && (
                      <div className="border-t border-rpg-border bg-rpg-bg/70 px-3 py-2">
                        {r.error && <p className="mb-1 text-xs text-rpg-red">{r.error}</p>}
                        {r.log.length ? (
                          <ol className="max-h-56 space-y-0.5 overflow-y-auto font-mono text-[11px] text-rpg-text/80">
                            {r.log.map((l, i) => (
                              <li key={i}>
                                <span className="text-rpg-gold/70">›</span> {l}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-[11px] text-rpg-muted">Sem log.</p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </KitSection>
    </div>
  );
}

/* ═════════════ Protocolos: a trilha do pipeline, definições e automações ═════════════ */

const PIPELINE = [
  ["Coleta", "Lê só os registros do próprio usuário (isolamento por conta) e agrega por dia no fuso dele."],
  ["Variáveis", "Defasagens e médias de 7 dias até D−h, mais calendário de D. Nada do dia previsto entra como entrada."],
  ["Limpeza", "Imputação e padronização ajustadas só com os dados de treino de cada dobra."],
  ["Divisão temporal", "Últimos dias viram teste final intocado; o restante é avaliado em dobras walk-forward."],
  ["Arena", "Cada algoritmo testa combinações de hiperparâmetros (semente fixa) contra a linha de base."],
  ["Seleção", "Campeão só com ganho ≥ margem, maioria das dobras e teste t pareado ≥ 2."],
  ["Teste final", "Avaliado uma única vez; precisa superar a base também ali."],
  ["Registro", "Versão gravada com hash dos dados, da configuração e semente — retreino idêntico não duplica."],
  ["Produção", "Só você ativa uma versão. Profecias nunca alteram dados; servem de apoio ao planejamento."],
] as const;

const METRICS = [
  ["Acurácia balanceada", "(sensibilidade + especificidade) / 2. Não é inflada por classes desbalanceadas."],
  ["Brier", "Média de (probabilidade − resultado)². 0 é perfeito."],
  ["Log-loss", "−média de log da probabilidade atribuída ao que aconteceu."],
  ["ROC-AUC / PR-AUC", "Qualidade da ordenação dos dias por probabilidade."],
  ["MAE / RMSE", "Erro médio absoluto / raiz do erro quadrático, na unidade do alvo."],
  ["R²", "1 − SSE/SST no teste final. Negativo = pior que prever a média."],
  ["PSI", "Σ (atual − referência) · ln(atual/referência) por quintil."],
  ["Importância", "Piora da métrica principal ao embaralhar a variável no teste final."],
] as const;

export function ProtocolsTab() {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <KitSection title="Trilha da Forja" icon={<Workflow size={15} />} tone="legendary">
          <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-0.5 before:bg-gradient-to-b before:from-rpg-purple before:to-rpg-gold">
            {PIPELINE.map(([t, d], i) => (
              <li key={t} className="relative flex gap-3">
                <span className="relative z-10 flex h-8 w-8 shrink-0 rotate-45 items-center justify-center border-2 border-rpg-purple bg-rpg-bg shadow-[0_0_10px_-3px_rgb(var(--rpg-purple))]" aria-hidden>
                  <span className="-rotate-45 text-xs font-bold text-rpg-text">{i + 1}</span>
                </span>
                <p className="pt-1 text-sm">
                  <b className="text-rpg-text">{t}.</b> <span className="text-rpg-muted">{d}</span>
                </p>
              </li>
            ))}
          </ol>
        </KitSection>
        <div className="space-y-4">
          <KitSection title="Glossário de métricas" icon={<BookMarked size={15} />} tone="gold">
            <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {METRICS.map(([t, d]) => (
                <div key={t} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
                  <dt className="font-semibold text-rpg-gold-light">{t}</dt>
                  <dd className="mt-0.5 text-rpg-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </KitSection>
          <KitSection title="Juramento de privacidade" icon={<ShieldCheck size={15} />}>
            <ul className="space-y-1.5 text-sm text-rpg-text/90">
              {["Treino e profecias rodam no servidor do LifeOS, sem serviços externos.", "O texto do Diário nunca vira variável.", "O Mestre só usa IA externa quando você pede, e recebe apenas números agregados."].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-rpg-green" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </KitSection>
        </div>
      </div>
      <AutomationsPanel module="forge" title="Automações da Forja" intro="Análises, treinos agendados, backtests e alertas. Nenhuma automação ativa versões ou altera seus registros." />
    </div>
  );
}

/* ═════════════ Gargalos: quedas e altas entre quinzenas ═════════════ */

type Bottleneck = NonNullable<ForgeOverview["quality"]>["bottlenecks"][number];
const BASIS_TEXT = { total: "total somado em 14 dias", dias: "dias com registro em 14", media: "média por dia com registro" } as const;

function ShiftCard({ b }: { b: Bottleneck }) {
  const down = b.diffPct < 0;
  const max = Math.max(b.previous, b.current) || 1;
  const unit = b.unit ? ` ${b.unit}` : "";
  return (
    <article className={clsx("border-2 bg-rpg-bg-2/60 p-3", down ? "border-rpg-red/60" : "border-rpg-green/60")} style={R}>
      <header className="flex items-center gap-2.5">
        <IconTile tone={down ? "red" : "green"} size="sm">
          {down ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
        </IconTile>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{b.label}</h3>
        <span className={clsx("font-rpg text-2xl font-bold tabular-nums", down ? "text-rpg-red" : "text-rpg-green")}>
          {down ? "" : "+"}
          {b.diffPct}%
        </span>
      </header>
      <div className="mt-3 space-y-1.5 text-xs">
        {(
          [
            ["Quinzena anterior", b.previous, "muted"],
            ["Últimos 14 dias", b.current, down ? "red" : "green"],
          ] as const
        ).map(([l, v, tone]) => (
          <div key={l} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-rpg-muted">{l}</span>
            <RPGProgressBar tone={tone} label={l} value={(v / max) * 100} showLabel={false} />
            <span className="w-16 text-right font-semibold tabular-nums text-rpg-text">
              {fmtNum(v, 1)}
              {unit}
            </span>
          </div>
        ))}
        {b.basis && <p className="text-[11px] text-rpg-muted">Valor = {BASIS_TEXT[b.basis]}.</p>}
      </div>
      <p className="mt-2 flex gap-2 text-xs text-rpg-text">
        <Tag tone={down ? "purple" : "green"}>{down ? "Sugestão" : "Mantenha"}</Tag>
        <span>{b.action}</span>
      </p>
    </article>
  );
}

export function BottlenecksTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const { analyze } = useForgeActions();
  const all = o.quality?.bottlenecks ?? [];
  const drops = all.filter((b) => b.diffPct < 0);
  const rises = all.filter((b) => b.diffPct > 0);
  return (
    <div className="space-y-4">
      <div className="rpg-panel rpg-panel-gold flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <IconTile tone="red">
          <TrendingDown size={22} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="rpg-title text-xl font-bold">Detector de Gargalos</p>
          <p className="text-sm text-rpg-text/85">Compara os últimos 14 dias com os 14 anteriores, série por série. Entram variações de pelo menos 20% com dados nas duas quinzenas.</p>
        </div>
        <RPGButton variant="secondary" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Gargalos recalculados."), onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
          {analyze.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Recalcular
        </RPGButton>
      </div>
      {!o.quality ? (
        <Empty icon={<TrendingDown size={22} />} title="Dados ainda não analisados">
          Use “Recalcular” para comparar suas duas últimas quinzenas.
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <KitSection title={`Gargalos · ${drops.length}`} icon={<ArrowDown size={15} className="text-rpg-red" />}>
            {!drops.length ? <p className="flex items-center gap-2 text-sm text-rpg-green"><CheckCircle2 size={16} aria-hidden /> Nenhuma queda relevante. Bom ritmo.</p> : <div className="space-y-3">{drops.map((b) => <ShiftCard key={b.key} b={b} />)}</div>}
          </KitSection>
          <KitSection title={`Em alta · ${rises.length}`} icon={<ArrowUp size={15} className="text-rpg-green" />}>
            {!rises.length ? <p className="text-sm text-rpg-muted">Nenhuma alta ≥ 20% nesta comparação.</p> : <div className="space-y-3">{rises.map((b) => <ShiftCard key={b.key} b={b} />)}</div>}
          </KitSection>
        </div>
      )}
    </div>
  );
}

/* ═════════════ Laboratório: o grimório de dados ═════════════ */

export function LabTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const dict = useForgeDictionary();
  const { analyze } = useForgeActions();
  const q = o.quality;
  const sampleCols = q?.sample[0] ? Object.keys(q.sample[0]).slice(0, 10) : [];
  const rings: Array<[string, number | null, RpgTone, string]> = q
    ? [
        ["Completude", q.quality.scores.completeness, "blue", q.quality.definitions.completeness ?? ""],
        ["Validade", q.quality.scores.validity, "green", q.quality.definitions.validity ?? ""],
        ["Sem outliers", 100 - q.quality.scores.outlierRate, "cyan", q.quality.definitions.outliers ?? ""],
        ["Qualidade geral", q.quality.scores.overall, "gold", q.quality.definitions.overall ?? ""],
      ]
    : [];
  return (
    <div className="space-y-4">
      <KitSection
        title="Qualidade dos dados"
        icon={<Gauge size={15} />}
        tone="legendary"
        action={
          <RPGButton variant="secondary" className="!py-1 text-xs" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Análise concluída."), onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
            {analyze.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Gauge size={13} aria-hidden />} Analisar
          </RPGButton>
        }
      >
        {!q ? (
          <Empty icon={<Gauge size={22} />} title="Sem análise">
            Analise para medir completude, validade, outliers e balanceamento.
          </Empty>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {rings.map(([l, v, tone, hint]) => (
                <div key={l} className="flex flex-col items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/60 p-3 text-center" style={R} title={hint}>
                  <RPGProgressRing value={v ?? 0} size={84} tone={tone} label={l} valueClassName="!font-rpg text-lg text-rpg-text" displayValue={v == null ? "—" : `${fmtNum(v, 1)}%`} />
                  <p className="text-xs font-semibold text-rpg-text">{l}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1.5 font-normal">Série</th>
                    <th className="w-[28%] p-1.5 font-normal">Completude</th>
                    <th className="p-1.5 text-right font-normal">Inválidos</th>
                    <th className="p-1.5 text-right font-normal">Outliers</th>
                    <th className="p-1.5 text-right font-normal">Média ± dp</th>
                    <th className="p-1.5 font-normal">Último registro</th>
                    <th className="p-1.5 text-right font-normal">Maior lacuna</th>
                  </tr>
                </thead>
                <tbody>
                  {q.quality.series.map((s) => (
                    <tr key={s.key} className="border-t border-rpg-border/60">
                      <td className="p-1.5 text-rpg-text">
                        {s.label} <span className="text-[10px] text-rpg-muted">{s.unit}</span> {s.constant && <Tag tone="orange">constante</Tag>}
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-2">
                          <RPGProgressBar className="flex-1" tone={s.completeness >= 70 ? "green" : s.completeness >= 30 ? "orange" : "red"} label={`Completude de ${s.label}`} value={s.completeness} showLabel={false} />
                          <span className="w-16 text-right tabular-nums text-rpg-text">
                            {s.daysWithData}/{s.days}
                          </span>
                        </div>
                      </td>
                      <td className="p-1.5 text-right tabular-nums">{s.invalid}</td>
                      <td className="p-1.5 text-right tabular-nums">{s.outliers}</td>
                      <td className="p-1.5 text-right tabular-nums">
                        {fmtNum(s.mean, 2)} ± {fmtNum(s.std, 2)}
                      </td>
                      <td className="p-1.5">
                        {fmtDate(s.lastDate)}
                        {s.staleDays != null && s.staleDays > 3 && <span className="text-rpg-orange"> · há {s.staleDays}d</span>}
                      </td>
                      <td className="p-1.5 text-right tabular-nums">{s.longestGap}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!q.quality.alerts.length && (
              <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
                {q.quality.alerts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 border border-rpg-border bg-rpg-bg-2/50 p-2 text-xs text-rpg-text" style={R}>
                    {a.level === "alto" ? <XCircle size={14} className="mt-px shrink-0 text-rpg-red" aria-hidden /> : <ScrollText size={14} className={clsx("mt-px shrink-0", a.level === "medio" ? "text-rpg-orange" : "text-rpg-blue")} aria-hidden />}
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </KitSection>
      {q && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <KitSection title="Equilíbrio dos alvos" icon={<ScrollText size={15} />} tone="gold">
            <ul className="space-y-2.5">
              {q.quality.balance.map((b) => {
                const rate = b.samples ? b.positives / b.samples : 0;
                return (
                  <li key={b.target} className="text-xs">
                    <div className="mb-1 flex justify-between gap-2">
                      <span className="text-rpg-text">{b.label}</span>
                      <span className="tabular-nums text-rpg-muted">
                        {b.positives}/{b.samples} positivos ({pct(rate)}){b.threshold != null && ` · limiar ${fmtNum(b.threshold, 2)}`}
                      </span>
                    </div>
                    <RPGProgressBar tone={rate < 0.1 || rate > 0.9 ? "orange" : "purple"} label={`Positivos de ${b.label}`} value={rate * 100} showLabel={false} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-rpg-muted">Alvos com menos de 10% ou mais de 90% positivos são difíceis de prever: a linha de base já acerta quase sempre.</p>
          </KitSection>
          <KitSection title="Amostra da matriz (últimos dias)" icon={<ScrollText size={15} />}>
            {!q.sample.length ? (
              <p className="text-sm text-rpg-muted">Sem linhas.</p>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[520px] text-[11px]">
                  <thead>
                    <tr className="text-left text-rpg-muted">
                      {sampleCols.map((c) => (
                        <th key={c} className="whitespace-nowrap p-1 font-normal">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.sample.map((row, i) => (
                      <tr key={i} className="border-t border-rpg-border/60">
                        {sampleCols.map((c) => (
                          <td key={c} className="whitespace-nowrap p-1 tabular-nums">
                            {c === "date" && typeof row[c] === "string" ? fmtDate(row[c] as string) : typeof row[c] === "number" ? fmtNum(row[c] as number, 2) : (row[c] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </KitSection>
        </div>
      )}
      <KitSection title="Dicionário de dados" icon={<BookMarked size={15} />}>
        {dict.isLoading && <Loader2 className="animate-spin text-rpg-purple" aria-label="Carregando" />}
        {dict.data && (
          <>
            <p className="mb-2 text-xs text-rpg-muted">{dict.data.leakageRule}</p>
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1 font-normal">Variável</th>
                    <th className="p-1 font-normal">Fonte</th>
                    <th className="p-1 font-normal">Tipo</th>
                    <th className="p-1 font-normal">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {dict.data.features.map((f) => (
                    <tr key={f.key} className="border-t border-rpg-border/60">
                      <td className="p-1 text-rpg-text">{f.label}</td>
                      <td className="p-1 text-rpg-muted">{f.source}</td>
                      <td className="p-1 text-rpg-muted">{f.type}</td>
                      <td className="p-1 text-rpg-muted">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-3 text-xs font-semibold text-rpg-gold-light">Alvos disponíveis</h3>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {dict.data.targets.map((t) => (
                <li key={t.key} className="text-xs">
                  <b className="text-rpg-text">{t.label}</b> <span className="text-rpg-muted">· {t.problem === "classification" ? "sim/não" : "valor"} — {t.description}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </KitSection>
    </div>
  );
}
