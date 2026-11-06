import { useState } from "react";
import clsx from "clsx";
import { Archive, BookMarked, ChevronDown, FlaskConical, Gauge, Loader2, RefreshCw, RotateCcw, ScrollText, ShieldCheck, TrendingDown, Workflow } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { Section as KitSection } from "./ForgeShared";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { useForgeActions, useForgeDictionary } from "@/hooks/useForge";
import { RUN_KIND, RUN_STATUS, fmtNum, type ForgeOverview, type Run } from "@/services/forgeService";
import { Empty, R, errMsg, fmtDate, fmtDateTime, pct, type Notify } from "./ForgeShared";

/* ═════════════ Experimentos (execuções) ═════════════ */

export function ExperimentsTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const a = useForgeActions();
  const [kind, setKind] = useState<Run["kind"] | "all">("all");
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const runs = o.runs.filter((r) => (kind === "all" || r.kind === kind) && (archived || !r.archived));
  const names = new Map(o.models.map((m) => [m.id, m.name]));
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
    <KitSection
      title="Experimentos e execuções"
      icon={<FlaskConical size={16} />}
      tone="legendary"
      action={
        <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arquivados
        </label>
      }
    >
      <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar por tipo">
        {(["all", "train", "backtest", "inference", "monitor", "quality"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx("shrink-0 border px-2 py-1 text-xs", kind === k ? "border-rpg-purple bg-rpg-purple/15 text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R}>
            {k === "all" ? "Todos" : RUN_KIND[k]}
          </button>
        ))}
      </div>
      {!runs.length ? (
        <Empty icon={<FlaskConical size={22} />} title="Nenhuma execução">Treinos, backtests, inferências e verificações aparecem aqui com log completo.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {runs.map((r) => (
            <li key={r.id} className="border border-rpg-border bg-rpg-bg-2/60" style={R}>
              <div className="flex flex-wrap items-center gap-2 p-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <ChevronDown size={14} className={clsx("shrink-0 transition-transform", open === r.id && "rotate-180")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-rpg-text">
                      {RUN_KIND[r.kind]} · {r.modelId ? (names.get(r.modelId) ?? "modelo removido") : "Geral"}
                    </span>
                    <span className="block text-[10px] text-rpg-muted">
                      {fmtDateTime(r.startedAt)} · {r.trigger === "manual" ? "manual" : `automação (${r.trigger})`} · {r.durationMs == null ? "—" : `${(r.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`}
                    </span>
                  </span>
                </button>
                <RPGBadge tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : r.status === "insufficient" ? "orange" : "muted"}>{RUN_STATUS[r.status]}</RPGBadge>
                <RPGButton variant="ghost" aria-label="Re-executar" disabled={pending || r.status === "running" || (!r.modelId && r.kind !== "quality")} onClick={() => rerun(r)}>
                  <RotateCcw size={13} aria-hidden />
                </RPGButton>
                {!r.archived && (
                  <RPGButton variant="ghost" aria-label="Arquivar execução" onClick={() => a.archiveRun.mutate(r.id, { onError: (e) => notify(errMsg(e, "Falha ao arquivar."), "error") })}>
                    <Archive size={13} aria-hidden />
                  </RPGButton>
                )}
              </div>
              {open === r.id && (
                <div className="border-t border-rpg-border px-2 py-1.5">
                  {r.error && <p className="mb-1 text-xs text-rpg-red">{r.error}</p>}
                  {r.log.length ? (
                    <ol className="max-h-56 space-y-0.5 overflow-y-auto font-mono text-[10px] text-rpg-muted">
                      {r.log.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[11px] text-rpg-muted">Sem log.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/* ═════════════ Protocolos (pipeline, definições, automações) ═════════════ */

const PIPELINE = [
  ["Coleta", "Lê só os registros do próprio usuário (isolamento por conta) e agrega por dia no fuso dele."],
  ["Variáveis", "Defasagens e médias de 7 dias até D−h, mais calendário de D. Nada do dia previsto entra como entrada."],
  ["Limpeza", "Imputação e padronização ajustadas só com os dados de treino de cada dobra."],
  ["Divisão temporal", "Últimos dias viram holdout intocado; o restante é avaliado em dobras walk-forward."],
  ["Arena", "Cada algoritmo testa combinações de hiperparâmetros (semente fixa) contra a linha de base."],
  ["Seleção", "Campeão só com ganho ≥ margem, maioria das dobras e teste t pareado ≥ 2."],
  ["Teste final", "Holdout avaliado uma única vez; precisa superar a base também ali."],
  ["Registro", "Versão gravada com hash dos dados, da configuração e semente — retreino idêntico não duplica."],
  ["Produção", "Só você ativa uma versão. Previsões nunca alteram dados; servem de apoio ao planejamento."],
] as const;

const METRICS = [
  ["Acurácia balanceada", "(sensibilidade + especificidade) / 2. Não é inflada por classes desbalanceadas."],
  ["Brier", "Média de (probabilidade − resultado)². 0 é perfeito."],
  ["Log-loss", "−média de log da probabilidade atribuída ao que aconteceu."],
  ["ROC-AUC / PR-AUC", "Qualidade da ordenação dos dias por probabilidade."],
  ["MAE / RMSE", "Erro médio absoluto / raiz do erro quadrático, na unidade do alvo."],
  ["R²", "1 − SSE/SST no holdout. Negativo = pior que prever a média."],
  ["PSI", "Σ (atual − referência) · ln(atual/referência) por quintil."],
  ["Importância", "Piora da métrica principal ao embaralhar a variável no holdout."],
] as const;

export function ProtocolsTab() {
  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <KitSection title="Pipeline da Forja" icon={<Workflow size={16} />} tone="legendary">
          <ol className="space-y-1.5">
            {PIPELINE.map(([t, d], i) => (
              <li key={t} className="flex gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-rpg-purple font-pixel text-[9px] text-rpg-purple" style={R}>
                  {i + 1}
                </span>
                <span>
                  <b className="text-rpg-text">{t}.</b> <span className="text-rpg-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </KitSection>
        <KitSection title="Definições de métricas" icon={<BookMarked size={16} />}>
          <dl className="space-y-1.5 text-xs">
            {METRICS.map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold text-rpg-text">{t}</dt>
                <dd className="text-rpg-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </KitSection>
      </div>
      <KitSection title="Privacidade" icon={<ShieldCheck size={16} />}>
        <p className="text-xs text-rpg-muted">
          Treino e inferência rodam no servidor do LifeOS, sem enviar dados a serviços externos. O texto do Diário nunca é usado como variável. O Mestre da Inteligência só usa IA externa quando você pede, e recebe apenas números agregados.
        </p>
      </KitSection>
      <AutomationsPanel module="forge" title="Automações da Forja" intro="Análises, treinos agendados, backtests e alertas. Nenhuma automação ativa versões ou altera seus registros." />
    </div>
  );
}

/* ═════════════ Gargalos ═════════════ */

export function BottlenecksTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const { analyze } = useForgeActions();
  const b = o.quality?.bottlenecks ?? [];
  return (
    <KitSection
      title="Detector de gargalos"
      icon={<TrendingDown size={16} />}
      tone="legendary"
      action={
        <RPGButton variant="secondary" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Gargalos recalculados."), onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
          {analyze.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Recalcular
        </RPGButton>
      }
    >
      <p className="mb-2 text-xs text-rpg-muted">Compara os últimos 14 dias com os 14 anteriores, série por série. Só aparecem quedas de pelo menos 20% com dados nos dois períodos.</p>
      {!o.quality ? (
        <Empty icon={<TrendingDown size={22} />} title="Dados ainda não analisados" />
      ) : !b.length ? (
        <Empty icon={<TrendingDown size={22} />} title="Nenhum gargalo relevante">Suas séries estão estáveis ou em alta nas últimas duas semanas.</Empty>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {b.map((x) => (
            <article key={x.key} className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
              <p className="flex items-center justify-between gap-2">
                <b className="text-sm text-rpg-text">{x.label}</b>
                <RPGBadge tone="red">{x.diffPct}%</RPGBadge>
              </p>
              <p className="text-xs tabular-nums text-rpg-muted">
                {fmtNum(x.previous, 2)} → {fmtNum(x.current, 2)} (média diária; {x.n[1]} e {x.n[0]} dias com registro)
              </p>
              <p className="mt-1 text-xs text-rpg-text">
                <b>Dado real:</b> {x.text}
              </p>
              <p className="mt-0.5 text-xs text-rpg-text">
                <b>Sugestão:</b> {x.action}
              </p>
            </article>
          ))}
        </div>
      )}
    </KitSection>
  );
}

/* ═════════════ Laboratório (Grimório de dados) ═════════════ */

const DEF_KEY: Record<string, string> = { Completude: "completeness", Validade: "validity", Outliers: "outliers", Geral: "overall" };

export function LabTab({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const dict = useForgeDictionary();
  const { analyze } = useForgeActions();
  const q = o.quality;
  const sampleCols = q?.sample[0] ? Object.keys(q.sample[0]).slice(0, 10) : [];
  return (
    <div className="space-y-3">
      <KitSection
        title="Qualidade dos dados"
        icon={<Gauge size={16} />}
        tone="legendary"
        action={
          <RPGButton variant="secondary" disabled={analyze.isPending} onClick={() => analyze.mutate(undefined, { onSuccess: () => notify("Análise concluída."), onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
            {analyze.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Gauge size={14} aria-hidden />} Analisar
          </RPGButton>
        }
      >
        {!q ? (
          <Empty icon={<Gauge size={22} />} title="Sem análise">Clique em Analisar para medir completude, validade, outliers e balanceamento.</Empty>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Completude", `${q.quality.scores.completeness}%`],
                ["Validade", `${q.quality.scores.validity}%`],
                ["Outliers", `${fmtNum(q.quality.scores.outlierRate, 1)}%`],
                ["Geral", q.quality.scores.overall == null ? "—" : `${q.quality.scores.overall}/100`],
              ] as const).map(([l, v]) => (
                <div key={l} className="border border-rpg-border bg-rpg-bg-2/60 p-2 text-center" style={R} title={q.quality.definitions[DEF_KEY[l]] ?? undefined}>
                  <p className="font-pixel text-[9px] uppercase text-rpg-muted">{l}</p>
                  <p className="font-rpg text-lg font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1 font-normal">Série</th>
                    <th className="p-1 text-right font-normal">Dias c/ dado</th>
                    <th className="p-1 text-right font-normal">Completude</th>
                    <th className="p-1 text-right font-normal">Inválidos</th>
                    <th className="p-1 text-right font-normal">Outliers</th>
                    <th className="p-1 text-right font-normal">Média ± dp</th>
                    <th className="p-1 font-normal">Último</th>
                    <th className="p-1 text-right font-normal">Maior lacuna</th>
                  </tr>
                </thead>
                <tbody>
                  {q.quality.series.map((s) => (
                    <tr key={s.key} className="border-t border-rpg-border/60">
                      <td className="p-1">
                        {s.label} <span className="text-[10px] text-rpg-muted">{s.unit}</span> {s.constant && <RPGBadge tone="orange">constante</RPGBadge>}
                      </td>
                      <td className="p-1 text-right tabular-nums">
                        {s.daysWithData}/{s.days}
                      </td>
                      <td className="p-1 text-right tabular-nums">{s.completeness}%</td>
                      <td className="p-1 text-right tabular-nums">{s.invalid}</td>
                      <td className="p-1 text-right tabular-nums">{s.outliers}</td>
                      <td className="p-1 text-right tabular-nums">
                        {fmtNum(s.mean, 2)} ± {fmtNum(s.std, 2)}
                      </td>
                      <td className="p-1">{fmtDate(s.lastDate)}{s.staleDays != null && s.staleDays > 3 && <span className="text-rpg-orange"> · {s.staleDays}d</span>}</td>
                      <td className="p-1 text-right tabular-nums">{s.longestGap}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!q.quality.alerts.length && (
              <ul className="mt-2 space-y-1">
                {q.quality.alerts.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <RPGBadge tone={a.level === "alto" ? "red" : a.level === "medio" ? "orange" : "muted"}>{a.level}</RPGBadge> {a.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </KitSection>
      {q && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <KitSection title="Balanceamento dos alvos" icon={<ScrollText size={16} />}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-rpg-muted">
                  <th className="p-1 font-normal">Alvo</th>
                  <th className="p-1 text-right font-normal">Amostras</th>
                  <th className="p-1 text-right font-normal">Positivos</th>
                  <th className="p-1 text-right font-normal">Limiar</th>
                </tr>
              </thead>
              <tbody>
                {q.quality.balance.map((b) => (
                  <tr key={b.target} className="border-t border-rpg-border/60">
                    <td className="p-1">{b.label}</td>
                    <td className="p-1 text-right tabular-nums">{b.samples}</td>
                    <td className="p-1 text-right tabular-nums">{b.samples ? `${b.positives} (${pct(b.positives / b.samples)})` : "—"}</td>
                    <td className="p-1 text-right tabular-nums">{fmtNum(b.threshold, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </KitSection>
          <KitSection title="Amostra da matriz (últimos dias)" icon={<ScrollText size={16} />}>
            {!q.sample.length ? (
              <p className="text-sm text-rpg-muted">Sem linhas.</p>
            ) : (
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[520px] text-[10px]">
                  <thead>
                    <tr className="text-left text-rpg-muted">
                      {sampleCols.map((c) => (
                        <th key={c} className="p-1 font-normal">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.sample.map((row, i) => (
                      <tr key={i} className="border-t border-rpg-border/60">
                        {sampleCols.map((c) => (
                          <td key={c} className="p-1 tabular-nums">{typeof row[c] === "number" ? fmtNum(row[c] as number, 2) : (row[c] ?? "—")}</td>
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
      <KitSection title="Dicionário de dados" icon={<BookMarked size={16} />}>
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
                      <td className="p-1">{f.label}</td>
                      <td className="p-1 text-rpg-muted">{f.source}</td>
                      <td className="p-1 text-rpg-muted">{f.type}</td>
                      <td className="p-1 text-rpg-muted">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-3 font-pixel text-[10px] uppercase text-rpg-purple">Alvos</h3>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {dict.data.targets.map((t) => (
                <li key={t.key} className="text-xs">
                  <b>{t.label}</b> <span className="text-rpg-muted">· {t.problem === "classification" ? "sim/não" : "valor"} — {t.description}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </KitSection>
    </div>
  );
}
