import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Crown, Download, FileJson, FileSpreadsheet, Gem, Loader2, RefreshCw, ScrollText, Swords, Telescope } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { useForgeActions } from "@/hooks/useForge";
import { PRIMARY_LABEL, forgeService, fmtNum, primaryOf, type ForgeModel, type ForgeOverview, type Metrics, type Primary } from "@/services/forgeService";
import { Empty, MetricsGrid, ModelPicker, R, errMsg, fmtDate, fmtDateTime, lowerBetter, pct, type Notify } from "./ForgeShared";
import { predText } from "./ForgeOverview";
import { HoldoutLine } from "./ForgeModels";

const C = { purple: "rgb(var(--rpg-purple))", gold: "rgb(var(--rpg-gold))", muted: "rgb(var(--rpg-muted))", green: "rgb(var(--rpg-green))", blue: "rgb(var(--rpg-blue))", grid: "rgb(var(--rpg-border))" };
const TIP = { contentStyle: { background: "rgb(var(--rpg-bg-2))", border: "1px solid rgb(var(--rpg-border))", fontSize: 12 } };

type Props = { o: ForgeOverview; notify: Notify; selected: string | null; onSelect: (id: string) => void };

function useModel(o: ForgeOverview, selected: string | null, filter?: (m: ForgeModel) => boolean) {
  const list = filter ? o.models.filter(filter) : o.models;
  return list.find((m) => m.id === selected) ?? list[0] ?? null;
}

/* ═════════════ Arena ═════════════ */

export function ArenaTab({ o, selected, onSelect }: Props) {
  const m = useModel(o, selected, (x) => !!x.latest);
  if (!m) return <Empty icon={<Swords size={24} />} title="A arena está vazia">Treine um modelo para ver algoritmos competindo contra a linha de base.</Empty>;
  const v = m.latest!;
  const mt = v.metrics;
  const lower = lowerBetter(mt.primary);
  const run = o.runs.find((r) => r.modelId === m.id && r.kind === "train" && r.result && (r.result as { versionId?: string }).versionId === v.id);
  const chart = mt.arena.map((e) => ({ name: e.label, value: Number(e.cvMean.toFixed(4)), std: e.cvStd, base: e.isBaseline, alg: e.algorithm }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.latest} />
        <span className="text-xs text-rpg-muted">
          Versão v{v.version} · {fmtDateTime(v.trainedAt)} · {mt.samples.dev} dias de desenvolvimento + {mt.samples.test} de holdout
        </span>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <KitSection title="Validação cruzada temporal" icon={<Swords size={16} />} tone="legendary">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                <Tooltip {...TIP} formatter={(x: number) => fmtNum(x)} />
                <Bar dataKey="value" name={PRIMARY_LABEL[mt.primary]}>
                  {chart.map((c) => (
                    <Cell key={c.alg} fill={c.base ? C.muted : c.alg === mt.selected ? C.gold : C.purple} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-rpg-muted">
                  <th className="p-1 font-normal">Algoritmo</th>
                  <th className="p-1 text-right font-normal">Média ± desvio</th>
                  <th className="p-1 font-normal">Por dobra</th>
                  <th className="p-1 text-right font-normal">Combinações</th>
                  <th className="p-1 font-normal">Hiperparâmetros</th>
                </tr>
              </thead>
              <tbody>
                {[...mt.arena]
                  .sort((a, b) => (lower ? a.cvMean - b.cvMean : b.cvMean - a.cvMean))
                  .map((e) => (
                    <tr key={e.algorithm} className={clsx("border-t border-rpg-border/60", e.algorithm === mt.selected && "bg-rpg-gold/10")}>
                      <td className="p-1">
                        {e.label} {e.isBaseline && <RPGBadge tone="muted">base</RPGBadge>} {e.algorithm === mt.champion && <Crown size={12} className="inline text-rpg-gold" aria-label="campeão" />}
                      </td>
                      <td className="p-1 text-right tabular-nums">
                        {fmtNum(e.cvMean)} ± {fmtNum(e.cvStd)}
                      </td>
                      <td className="p-1 tabular-nums text-rpg-muted">{e.foldScores.map((s) => fmtNum(s, 2)).join(" · ")}</td>
                      <td className="p-1 text-right tabular-nums">{e.trials}</td>
                      <td className="p-1 font-mono text-[10px] text-rpg-muted">{Object.entries(e.hp).map(([k, x]) => `${k}=${x}`).join(" ") || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">
            {lower ? "Menor é melhor." : "Maior é melhor."} Campeão exige ganho ≥ margem sobre a referência ({mt.reference ?? "baseline"}), vencer na maioria das dobras e teste t pareado ≥ 2. {mt.champion ? "" : "Nenhum desafiante cumpriu os três critérios — a linha de base segue como referência."}
          </p>
        </KitSection>
        <div className="space-y-3">
          <KitSection title="Teste final (holdout)" icon={<Crown size={16} />} tone="gold">
            {mt.holdout ? (
              <>
                <p className="mb-1 text-xs">
                  {mt.beatsBaseline ? <RPGBadge tone="green">superou a linha de base</RPGBadge> : <RPGBadge tone="orange">sem campeão superior</RPGBadge>} <HoldoutLine v={v} />
                </p>
                <MetricsGrid m={mt.holdout.model} compare={mt.holdout.baseline} />
              </>
            ) : (
              <p className="text-sm text-rpg-muted">Holdout indisponível (dados insuficientes).</p>
            )}
            {!!mt.leakage.length && (
              <p className="mt-2 text-xs text-rpg-red" role="alert">
                Possível vazamento: {mt.leakage.join(", ")} (correlação ≥ 0,98 com o alvo).
              </p>
            )}
          </KitSection>
          <KitSection title="Log do treino" icon={<ScrollText size={16} />}>
            {run?.log.length ? (
              <ol className="max-h-56 space-y-0.5 overflow-y-auto font-mono text-[10px] text-rpg-muted">
                {run.log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-rpg-muted">Log não disponível para esta versão.</p>
            )}
          </KitSection>
        </div>
      </div>
    </div>
  );
}

/* ═════════════ Previsões ═════════════ */

export function PredictionsTab({ o, notify }: Props) {
  const a = useForgeActions();
  const byId = new Map(o.models.map((m) => [m.id, m]));
  const upcoming = o.predictions.filter((p) => p.targetDate >= o.today).sort((x, y) => x.targetDate.localeCompare(y.targetDate));
  const resolved = o.predictions.filter((p) => p.actual != null).sort((x, y) => y.targetDate.localeCompare(x.targetDate));
  const [model, setModel] = useState<string | null>(null);
  const withHist = o.models.filter((m) => resolved.some((p) => p.modelId === m.id));
  const hm = withHist.find((m) => m.id === model) ?? withHist[0];
  const series = hm
    ? resolved
        .filter((p) => p.modelId === hm.id)
        .slice()
        .reverse()
        .map((p) => ({ d: fmtDate(p.targetDate), previsto: Number(p.value.toFixed(3)), real: p.actual }))
    : [];
  return (
    <div className="space-y-3">
      <KitSection
        title="Quadro de previsões"
        icon={<Telescope size={16} />}
        tone="legendary"
        action={
          <RPGButton variant="secondary" disabled={a.refreshPredictions.isPending} onClick={() => a.refreshPredictions.mutate(undefined, { onSuccess: (r) => notify(`${r.generated} previsões geradas · ${r.resolved} resolvidas com o valor real.`), onError: (e) => notify(errMsg(e, "Falha ao atualizar."), "error") })}>
            {a.refreshPredictions.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Atualizar
          </RPGButton>
        }
      >
        {!upcoming.length ? (
          <Empty icon={<Telescope size={22} />} title="Nenhuma previsão futura">Ative uma versão aprovada em Modelos para gerar previsões.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((p) => {
              const m = byId.get(p.modelId);
              return (
                <article key={`${p.modelId}-${p.targetDate}`} className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
                  <p className="text-[11px] text-rpg-muted">
                    {fmtDate(p.targetDate)} · {m?.name} · v{p.explanation.version}
                  </p>
                  <p className="font-rpg text-2xl font-bold tabular-nums text-rpg-text">{predText(p, m)}</p>
                  <p className="text-[11px] text-rpg-muted">{m?.targetLabel}{m?.problem === "classification" ? " (probabilidade)" : " (intervalo empírico 10–90%)"}</p>
                  {p.partial && <RPGBadge tone="orange">preliminar · {p.explanation.missing} variáveis sem dado</RPGBadge>}
                  {!!p.explanation.factors.length && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px]">
                      {p.explanation.factors.slice(0, 3).map((f) => (
                        <li key={f.key} className="flex justify-between gap-2">
                          <span className="truncate text-rpg-muted">{f.label}</span>
                          <span className={f.effect >= 0 ? "text-rpg-green" : "text-rpg-red"}>{f.effect >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(f.effect), 2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-rpg-muted">Fatores: quanto a previsão muda ao trocar a variável pela média histórica (efeito local, não causal).</p>
      </KitSection>
      <KitSection title="Previsto x real" icon={<Activity size={16} />} action={<ModelPicker models={withHist} value={hm?.id ?? null} onChange={setModel} />}>
        {!hm ? (
          <p className="text-sm text-rpg-muted">Ainda não há previsões com resultado real registrado.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.muted }} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                  <Tooltip {...TIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="previsto" stroke={C.purple} dot={false} strokeWidth={2} />
                  <Scatter dataKey="real" fill={C.gold} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1 font-normal">Dia</th>
                    <th className="p-1 text-right font-normal">Previsto</th>
                    <th className="p-1 text-right font-normal">Real</th>
                    <th className="p-1 text-right font-normal">{hm.problem === "classification" ? "Acerto (limiar 50%)" : "Erro absoluto"}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved
                    .filter((p) => p.modelId === hm.id)
                    .map((p) => (
                      <tr key={p.targetDate} className="border-t border-rpg-border/60">
                        <td className="p-1">{fmtDate(p.targetDate)}</td>
                        <td className="p-1 text-right tabular-nums">{predText(p, hm)}</td>
                        <td className="p-1 text-right tabular-nums">{hm.problem === "classification" ? (p.actual === 1 ? "sim" : "não") : fmtNum(p.actual, 1)}</td>
                        <td className="p-1 text-right tabular-nums">{hm.problem === "classification" ? ((p.value >= 0.5 ? 1 : 0) === p.actual ? "✓" : "✗") : fmtNum(Math.abs(p.value - (p.actual ?? 0)), 2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </KitSection>
    </div>
  );
}

/* ═════════════ Runas (explicabilidade) ═════════════ */

export function RunesTab({ o, selected, onSelect }: Props) {
  const m = useModel(o, selected, (x) => !!x.latest);
  const v = m ? (m.active ?? m.latest) : null;
  const seen = useRef(false);
  useEffect(() => {
    // Marco "primeira explicação vista": registrado só quando há importância real calculada.
    if (v?.importance.length && !seen.current) {
      seen.current = true;
      void forgeService.explanationViewed().catch(() => undefined);
    }
  }, [v?.importance.length]);
  if (!m || !v) return <Empty icon={<Gem size={24} />} title="Nenhuma runa revelada">Treine um modelo para ver quais variáveis pesam nas previsões.</Empty>;
  const imp = v.importance.filter((i) => i.importance > 0).slice(0, 15);
  const neutral = v.importance.length - imp.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.latest} />
        <span className="text-xs text-rpg-muted">
          v{v.version} · {v.algorithmLabel}
        </span>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <KitSection title="Importância por permutação (holdout)" icon={<Gem size={16} />} tone="legendary">
          {!imp.length ? (
            <p className="text-sm text-rpg-muted">Nenhuma variável alterou o desempenho ao ser embaralhada — o modelo não depende de forma mensurável de nenhuma delas.</p>
          ) : (
            <ul className="space-y-1.5">
              {imp.map((i) => {
                const max = imp[0]!.importance || 1;
                return (
                  <li key={i.key} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-rpg-text">{i.label}</span>
                      <span className="tabular-nums text-rpg-muted">
                        {fmtNum(i.importance, 4)}
                        {i.coefficient != null && ` · coef ${fmtNum(i.coefficient, 3)}`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-2 bg-rpg-bg-2" style={R}>
                      <div className="h-full bg-rpg-purple" style={{ width: `${Math.max(3, (i.importance / max) * 100)}%`, borderRadius: 4 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-rpg-muted">
            Importância = piora média da métrica principal ao embaralhar a variável no holdout. {neutral > 0 && `${neutral} variáveis sem efeito mensurável.`} Associação, não causa.
          </p>
        </KitSection>
        <div className="space-y-3">
          <KitSection title="Leitura das runas" icon={<ScrollText size={16} />}>
            <ul className="space-y-1 text-xs text-rpg-text">
              <li>
                <b>Dado real:</b> {v.dataset.samples} dias de {fmtDate(v.dataset.from)} a {fmtDate(v.dataset.to)}
                {v.dataset.positiveRate != null && `, ${pct(v.dataset.positiveRate)} positivos`}.
              </li>
              <li>
                <b>Inferência:</b> {imp[0] ? `“${imp[0].label}” é a variável que mais sustenta o desempenho deste modelo.` : "nenhuma variável se destacou."}
              </li>
              {v.dataset.threshold != null && (
                <li>
                  <b>Limiar do alvo:</b> {fmtNum(v.dataset.threshold, 2)} (calculado só com os primeiros 80% dos dias).
                </li>
              )}
            </ul>
          </KitSection>
          {!!v.metrics.leakage.length && (
            <KitSection title="Alerta de vazamento" icon={<Gem size={16} />}>
              <p className="text-xs text-rpg-red">{v.metrics.leakage.join(", ")} têm correlação quase perfeita com o alvo. Verifique se não carregam informação do próprio dia previsto.</p>
            </KitSection>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═════════════ Monitoramento (PSI) ═════════════ */

const LEVEL_TONE: Record<string, "green" | "orange" | "red" | "muted"> = { estavel: "green", moderada: "orange", forte: "red", informativo: "muted", sem_dados: "muted" };

export function MonitorTab({ o, notify, selected, onSelect }: Props) {
  const a = useForgeActions();
  const m = useModel(o, selected, (x) => !!x.activeVersionId);
  if (!m) return <Empty icon={<Activity size={24} />} title="Nada a monitorar">O monitoramento acompanha modelos ativos: drift das variáveis (PSI), mudança do alvo e desempenho observado.</Empty>;
  const snap = m.monitor;
  const history = o.monitors.filter((s) => s.modelId === m.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.activeVersionId} />
        <RPGButton variant="secondary" disabled={a.monitor.isPending} onClick={() => a.monitor.mutate(m.id, { onSuccess: () => notify("Verificação concluída."), onError: (e) => notify(errMsg(e, "Falha na verificação."), "error") })}>
          {a.monitor.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Verificar agora
        </RPGButton>
        {snap && <RPGBadge tone={snap.status === "ok" ? "green" : snap.status === "degradado" ? "red" : snap.status === "atencao" ? "orange" : "muted"}>{snap.status.replace("_", " ")}</RPGBadge>}
      </div>
      {!snap ? (
        <Empty icon={<Activity size={22} />} title="Ainda não verificado">Clique em “Verificar agora”.</Empty>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <KitSection title="Drift das variáveis (PSI)" icon={<Activity size={16} />} tone="legendary">
            {!snap.drift ? (
              <p className="text-sm text-rpg-muted">Precisa de pelo menos 30 dias posteriores ao treino para comparar distribuições.</p>
            ) : (
              <>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-rpg-muted">
                        <th className="p-1 font-normal">Variável</th>
                        <th className="p-1 text-right font-normal">PSI</th>
                        <th className="p-1 text-right font-normal">Ruído esperado</th>
                        <th className="p-1 font-normal">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.drift.features.map((f) => (
                        <tr key={f.key} className="border-t border-rpg-border/60">
                          <td className="p-1">{f.label}{f.smoothed && <span className="text-[10px] text-rpg-muted"> · média móvel</span>}</td>
                          <td className="p-1 text-right tabular-nums">{fmtNum(f.psi)}</td>
                          <td className="p-1 text-right tabular-nums text-rpg-muted">{fmtNum(f.noise)}</td>
                          <td className="p-1"><RPGBadge tone={LEVEL_TONE[f.level] ?? "muted"}>{f.level.replace("_", " ")}</RPGBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-rpg-muted">{snap.drift.thresholds}</p>
              </>
            )}
          </KitSection>
          <div className="space-y-3">
            <KitSection title="Alvo e desempenho" icon={<Activity size={16} />}>
              <ul className="space-y-1.5 text-xs text-rpg-text">
                <li>
                  <b>Alvo:</b> {snap.drift?.target.text ?? "sem dados suficientes."}
                </li>
                <li>
                  <b>Desempenho observado:</b> {snap.perf?.text ?? "aguardando ao menos 15 previsões resolvidas."}
                </li>
              </ul>
              <p className="mt-2 text-[10px] text-rpg-muted">Verificado em {fmtDateTime(snap.checkedAt)}. Se degradar, o modelo é marcado e o Mestre recomenda retreinar — nada é retreinado sem você.</p>
            </KitSection>
            <KitSection title="Histórico" icon={<ScrollText size={16} />}>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {history.map((h) => (
                  <li key={h.checkedAt} className="flex justify-between">
                    <span className="text-rpg-muted">{fmtDateTime(h.checkedAt)}</span>
                    <span>{h.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            </KitSection>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════ Relatórios ═════════════ */

type ModelCard = { modelCard: { name: string; objective: string; problem: string; target: string; horizonDays: number; features: string[]; validation: { folds: number; holdoutPct: number; primary: Primary; margin: number }; pipeline: string; intendedUse: string; limitations: string[]; leakageRule: string } };

export function ReportsTab({ o, notify, selected, onSelect }: Props) {
  const m = useModel(o, selected, (x) => !!x.latest);
  const report = useQuery({ queryKey: ["forge", "report", m?.id], queryFn: () => forgeService.report(m!.id), enabled: !!m, staleTime: 30_000 });
  const [busy, setBusy] = useState(false);
  if (!m) return <Empty icon={<FileJson size={24} />} title="Sem relatórios">Relatórios ficam disponíveis após o primeiro treino.</Empty>;
  const v = m.active ?? m.latest!;
  const card = (report.data as ModelCard | undefined)?.modelCard;
  const bt = o.runs.find((r) => r.modelId === m.id && r.kind === "backtest" && r.status === "done")?.result as { n: number; weekly: Array<{ week: string; n: number; model: number; baseline: number }>; model: Metrics; baseline: Metrics; primary: Primary; version: number } | undefined;
  const calib = (v.metrics.calibration ?? []).filter((b) => b.n > 0).map((b) => ({ faixa: `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`, previsto: b.predicted, observado: b.observed, n: b.n }));
  const exportJson = () => {
    if (!report.data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report.data, null, 2)], { type: "application/json" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = `forja-modelo-${m.id}.json`;
    el.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = async () => {
    setBusy(true);
    try {
      await forgeService.downloadCsv(m.id);
    } catch (e) {
      notify(errMsg(e, "Falha ao exportar CSV."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.latest} />
        <RPGButton variant="secondary" disabled={!report.data} onClick={exportJson}>
          <FileJson size={14} aria-hidden /> JSON
        </RPGButton>
        <RPGButton variant="secondary" disabled={busy} onClick={() => void exportCsv()}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileSpreadsheet size={14} aria-hidden />} CSV
        </RPGButton>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <KitSection title="Model card" icon={<Download size={16} />} tone="gold">
          {report.isLoading && <Loader2 className="animate-spin text-rpg-purple" aria-label="Carregando" />}
          {report.isError && <p className="text-sm text-rpg-red">Não foi possível carregar o relatório.</p>}
          {card && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-rpg-muted">Objetivo</dt><dd>{card.objective}</dd>
              <dt className="text-rpg-muted">Alvo</dt><dd>{card.target} · D+{card.horizonDays} · {card.problem === "classification" ? "classificação" : "regressão"}</dd>
              <dt className="text-rpg-muted">Variáveis</dt><dd>{card.features.length}: {card.features.slice(0, 8).join(", ")}{card.features.length > 8 && "…"}</dd>
              <dt className="text-rpg-muted">Validação</dt><dd>{card.validation.folds} dobras walk-forward · holdout {Math.round(card.validation.holdoutPct * 100)}% · {PRIMARY_LABEL[card.validation.primary]}</dd>
              <dt className="text-rpg-muted">Versão em uso</dt><dd>v{v.version} · {v.algorithmLabel} · <HoldoutLine v={v} /></dd>
              <dt className="text-rpg-muted">Reprodutibilidade</dt><dd className="font-mono text-[10px]">{card.pipeline} · dados {v.dataHash} · config {v.configHash} · semente {v.seed}</dd>
              <dt className="text-rpg-muted">Uso pretendido</dt><dd>{card.intendedUse}</dd>
              <dt className="text-rpg-muted">Anti-vazamento</dt><dd>{card.leakageRule}</dd>
              <dt className="text-rpg-muted">Limitações</dt>
              <dd>
                <ul className="list-disc pl-4">
                  {card.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </dd>
            </dl>
          )}
        </KitSection>
        <div className="space-y-3">
          {m.problem === "classification" && (
            <KitSection title="Calibração (holdout)" icon={<Activity size={16} />}>
              {!calib.length ? (
                <p className="text-sm text-rpg-muted">Sem dados de calibração.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calib} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="faixa" tick={{ fontSize: 10, fill: C.muted }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: C.muted }} />
                      <Tooltip {...TIP} formatter={(x: number) => pct(x)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="previsto" fill={C.purple} />
                      <Bar dataKey="observado" fill={C.gold} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-1 text-[10px] text-rpg-muted">Bem calibrado = barras parecidas em cada faixa de probabilidade.</p>
            </KitSection>
          )}
          <KitSection title="Backtest (origem móvel)" icon={<Activity size={16} />}>
            {!bt ? (
              <p className="text-sm text-rpg-muted">Nenhum backtest concluído. Rode em Artefatos → Backtest.</p>
            ) : (
              <>
                <p className="mb-1 text-xs">
                  v{bt.version} · {bt.n} dias · {PRIMARY_LABEL[bt.primary].split(" (")[0]}: modelo <b>{fmtNum(primaryOf(bt.model, bt.primary))}</b> · baseline {fmtNum(primaryOf(bt.baseline, bt.primary))}
                </p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={bt.weekly.map((w) => ({ semana: fmtDate(w.week), modelo: w.model, baseline: w.baseline }))} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: C.muted }} />
                      <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                      <Tooltip {...TIP} formatter={(x: number) => fmtNum(x)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line dataKey="modelo" stroke={C.purple} strokeWidth={2} />
                      <Line dataKey="baseline" stroke={C.muted} strokeDasharray="4 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <MetricsGrid m={bt.model} compare={bt.baseline} />
              </>
            )}
          </KitSection>
        </div>
      </div>
    </div>
  );
}
