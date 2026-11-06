import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Crown, Download, FileJson, FileSpreadsheet, Gem, Loader2, RefreshCw, ScrollText, ShieldCheck, Swords, Telescope, Trophy } from "lucide-react";
import { RPGButton, RPGProgressBar, RPGProgressRing } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import { useForgeActions, useForgeDictionary } from "@/hooks/useForge";
import { PRIMARY_LABEL, forgeService, fmtNum, primaryOf, type Alg, type ArenaEntry, type ForgeModel, type ForgeOverview, type Metrics, type Primary } from "@/services/forgeService";
import { Empty, MetricsGrid, ModelPicker, R, errMsg, fmtDate, fmtDateTime, lowerBetter, pct, type Notify, Section as KitSection, Tag } from "./ForgeShared";
import { ProphecyTrack, predText } from "./ForgeOverview";
import { HoldoutLine } from "./ForgeModels";

const C = { purple: "rgb(var(--rpg-purple))", gold: "rgb(var(--rpg-gold))", muted: "rgb(var(--rpg-text-muted))", green: "rgb(var(--rpg-green))", blue: "rgb(var(--rpg-blue))", grid: "rgb(var(--rpg-border))" };
const TIP = { contentStyle: { background: "rgb(var(--rpg-bg-secondary))", border: "1px solid rgb(var(--rpg-border))", fontSize: 12 } };

type Props = { o: ForgeOverview; notify: Notify; selected: string | null; onSelect: (id: string) => void };

function useModel(o: ForgeOverview, selected: string | null, filter?: (m: ForgeModel) => boolean) {
  const list = filter ? o.models.filter(filter) : o.models;
  return list.find((m) => m.id === selected) ?? list[0] ?? null;
}

/* ═════════════ Arena ═════════════ */

/** Pódio da arena: os 3 melhores desafiantes da validação, com a linha de base como régua. */
function ArenaPodium({ arena, selected, lower, baseline }: { arena: ArenaEntry[]; selected: Alg | null; lower: boolean; baseline: number | null }) {
  const top = arena.filter((e) => !e.isBaseline).sort((a, b) => (lower ? a.cvMean - b.cvMean : b.cvMean - a.cvMean)).slice(0, 3);
  if (!top.length) return null;
  // Ordem visual clássica: 2º, 1º, 3º.
  const order = [top[1], top[0], top[2]].filter((x): x is ArenaEntry => !!x);
  const height = (e: ArenaEntry) => (e === top[0] ? "h-28" : e === top[1] ? "h-20" : "h-14");
  const place = (e: ArenaEntry) => top.indexOf(e) + 1;
  const tone = (n: number) => (n === 1 ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : n === 2 ? "border-rpg-muted text-rpg-text bg-rpg-panel-light/60" : "border-rpg-bronze text-rpg-orange bg-rpg-bronze/10");
  return (
    <div className="rpg-panel rpg-panel-gold p-4">
      <div className="mx-auto flex max-w-xl items-end justify-center gap-2 sm:gap-4">
        {order.map((e) => {
          const n = place(e);
          const win = e.algorithm === selected;
          const beat = baseline == null ? null : lower ? e.cvMean < baseline : e.cvMean > baseline;
          return (
            <div key={e.algorithm} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
              {n === 1 ? <Trophy size={26} className="text-rpg-gold drop-shadow-[0_0_8px_rgb(var(--rpg-gold)/0.7)]" aria-hidden /> : <Crown size={18} className={n === 2 ? "text-rpg-text" : "text-rpg-orange"} aria-hidden />}
              <p className="w-full truncate text-xs font-semibold text-rpg-text sm:text-sm" title={e.label}>
                {e.label}
              </p>
              <p className="text-xs tabular-nums text-rpg-muted">
                {fmtNum(e.cvMean)} ± {fmtNum(e.cvStd, 2)}
              </p>
              <div className={clsx("flex w-full flex-col items-center justify-start border-2 pt-2", height(e), tone(n))} style={{ borderRadius: "4px 4px 0 0" }}>
                <span className="font-rpg text-2xl font-bold">{n}º</span>
                {win && <span className="mt-0.5 text-[10px] font-bold uppercase">escolhido</span>}
                {beat === false && <span className="mt-0.5 text-[10px] text-rpg-muted">abaixo da base</span>}
              </div>
            </div>
          );
        })}
      </div>
      {baseline != null && (
        <p className="mt-2 text-center text-[11px] text-rpg-muted">
          Régua da linha de base na validação: <b className="text-rpg-text">{fmtNum(baseline)}</b> · {lower ? "menor é melhor" : "maior é melhor"}
        </p>
      )}
    </div>
  );
}



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
      <ArenaPodium arena={mt.arena} selected={mt.selected} lower={lower} baseline={mt.arena.find((e) => e.algorithm === "baseline")?.cvMean ?? null} />
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
                      <td className="whitespace-nowrap p-1">
                        {e.label} {e.isBaseline && <Tag tone="muted">base</Tag>} {e.algorithm === mt.champion && <Crown size={12} className="inline text-rpg-gold" aria-label="campeão" />}
                      </td>
                      <td className="whitespace-nowrap p-1 text-right tabular-nums">
                        {fmtNum(e.cvMean)} ± {fmtNum(e.cvStd)}
                      </td>
                      <td className="whitespace-nowrap p-1 tabular-nums text-rpg-muted">{e.foldScores.map((s) => fmtNum(s, 2)).join(" · ")}</td>
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
                  {mt.beatsBaseline ? <Tag tone="green">superou a linha de base</Tag> : <Tag tone="orange">sem campeão superior</Tag>} <HoldoutLine v={v} />
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
                  <div className="my-2 flex items-center gap-3">
                    {m?.problem === "classification" ? (
                      <RPGProgressRing value={p.value * 100} size={72} tone={p.value >= 0.5 ? "green" : "orange"} label={`Chance de ${m.targetLabel.toLowerCase()}`} valueClassName="!font-rpg text-lg text-rpg-text" />
                    ) : (
                      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-rpg-cyan/70 bg-rpg-bg font-rpg text-xl font-bold tabular-nums text-rpg-text">{fmtNum(p.value, 1)}</span>
                    )}
                    <span className="min-w-0 text-sm text-rpg-text">{m?.problem === "classification" ? (p.value >= 0.5 ? "Provável" : "Pouco provável") : predText(p, m)}</span>
                  </div>
                  <p className="text-[11px] text-rpg-muted">{m?.targetLabel}{m?.problem === "classification" ? " (probabilidade)" : " (intervalo empírico 10–90%)"}</p>
                  {p.partial && <Tag tone="orange">preliminar · {p.explanation.missing} variáveis sem dado</Tag>}
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
            <ProphecyTrack o={o} m={hm} />
          </>
        )}
      </KitSection>
    </div>
  );
}

/* ═════════════ Runas (explicabilidade) ═════════════ */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const SOURCE_TONE: Record<string, RpgTone> = { saude: "pink", habitos: "green", missoes: "blue", educacao: "cyan", biblioteca: "purple", foco: "purple", calendario: "gold" };
const SOURCE_LABEL: Record<string, string> = { saude: "Saúde", habitos: "Hábitos", missoes: "Missões", educacao: "Educação", biblioteca: "Biblioteca", foco: "Foco", calendario: "Calendário" };

export function RunesTab({ o, selected, onSelect }: Props) {
  const dict = useForgeDictionary();
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
  const awake = v.importance.filter((i) => i.importance > 0).slice(0, 12);
  const dormant = v.importance.filter((i) => i.importance <= 0);
  const max = awake[0]?.importance || 1;
  const src = (key: string) => dict.data?.features.find((f) => f.key === key)?.source ?? "";
  const next = o.predictions.filter((p) => p.modelId === m.id && p.targetDate >= o.today).sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.latest} />
        <span className="text-xs text-rpg-muted">
          v{v.version} · {v.algorithmLabel} · {v.dataset.samples} dias de {fmtDate(v.dataset.from)} a {fmtDate(v.dataset.to)}
        </span>
      </div>
      <KitSection title="Runas despertas" icon={<Gem size={15} />} tone="legendary" action={<span className="text-xs text-rpg-muted">{awake.length} ativas · {dormant.length} dormentes</span>}>
        {!awake.length ? (
          <p className="text-sm text-rpg-muted">Nenhuma variável alterou o desempenho ao ser embaralhada — o modelo não depende de forma mensurável de nenhuma delas.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {awake.map((r, i) => {
              const tone = SOURCE_TONE[src(r.key)] ?? "purple";
              const power = r.importance / max;
              return (
                <li key={r.key} className={clsx("relative flex gap-3 border-2 bg-rpg-bg-2/60 p-3", i === 0 ? "border-rpg-gold/70 shadow-[0_0_18px_-8px_rgb(var(--rpg-gold))]" : "border-rpg-border")} style={R}>
                  <span className={clsx("relative flex h-12 w-12 shrink-0 rotate-45 items-center justify-center border-2 border-current bg-rpg-bg shadow-[inset_0_0_12px_-3px_currentColor]", RPG_TONE_TEXT[tone])} aria-hidden>
                    <span className="-rotate-45 font-rpg text-base font-bold">{ROMAN[i]}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-rpg-text" title={r.label}>
                      {r.label}
                    </p>
                    <p className="text-[11px] text-rpg-muted">Fonte: {SOURCE_LABEL[src(r.key)] ?? "Calendário"}</p>
                    <RPGProgressBar className="mt-1.5" tone={i === 0 ? "gold" : tone} label={`Poder da runa ${r.label}`} value={power * 100} showLabel={false} />
                    <p className="mt-1 text-[11px] tabular-nums text-rpg-muted">
                      importância {fmtNum(r.importance, 4)}
                      {r.coefficient != null && ` · coef. ${fmtNum(r.coefficient, 3)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-[11px] text-rpg-muted">Poder da runa = piora da métrica principal quando a variável é embaralhada no teste final. Indica associação no modelo, não causa.</p>
      </KitSection>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <KitSection title="Leitura das runas" icon={<ScrollText size={15} />} tone="gold">
          <ul className="space-y-2 text-sm text-rpg-text">
            <li className="flex gap-2">
              <Tag tone="blue">Dado real</Tag>
              <span>
                {v.dataset.samples} dias analisados{v.dataset.positiveRate != null && `, ${pct(v.dataset.positiveRate)} positivos`}
                {v.dataset.threshold != null && `; limiar do alvo ${fmtNum(v.dataset.threshold, 2)} (só com os primeiros 80% dos dias)`}.
              </span>
            </li>
            <li className="flex gap-2">
              <Tag tone="purple">Inferência</Tag>
              <span>{awake[0] ? `“${awake[0].label}” é a runa que mais sustenta este modelo.` : "Nenhuma runa se destacou."}</span>
            </li>
            {!!v.metrics.leakage.length && (
              <li className="flex gap-2">
                <Tag tone="red">Alerta</Tag>
                <span>{v.metrics.leakage.join(", ")} têm correlação quase perfeita com o alvo — verifique vazamento.</span>
              </li>
            )}
          </ul>
        </KitSection>
        <KitSection title="Runas da próxima profecia" icon={<Telescope size={15} />}>
          {!next || !next.explanation.factors.length ? (
            <p className="text-sm text-rpg-muted">{next ? "Nenhuma variável afastou esta profecia da média." : "Este artefato não tem profecia ativa."}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {next.explanation.factors.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2">
                  <span className="truncate text-rpg-text">{f.label}</span>
                  <span className={clsx("text-xs font-bold tabular-nums", f.effect >= 0 ? "text-rpg-green" : "text-rpg-red")}>
                    {f.effect >= 0 ? "▲ +" : "▼ −"}
                    {m.problem === "classification" ? `${fmtNum(Math.abs(f.effect) * 100, 0)} p.p.` : fmtNum(Math.abs(f.effect), 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!!dormant.length && (
            <details className="mt-3 text-xs text-rpg-muted">
              <summary className="cursor-pointer">Ver {dormant.length} runas dormentes</summary>
              <p className="mt-1">{dormant.map((d) => d.label).join(" · ")}</p>
            </details>
          )}
        </KitSection>
      </div>
    </div>
  );
}

/* ═════════════ Monitoramento: a Sentinela ═════════════ */

const LEVEL_TONE: Record<string, "green" | "orange" | "red" | "muted"> = { estavel: "green", moderada: "orange", forte: "red", informativo: "muted", sem_dados: "muted" };
const LEVEL_LABEL: Record<string, string> = { estavel: "estável", moderada: "moderada", forte: "forte", informativo: "informativa", sem_dados: "sem dados" };
const SNAP_UI = {
  ok: { tone: "green", title: "Guarda tranquila", text: "Dados e desempenho dentro do esperado." },
  atencao: { tone: "orange", title: "Sentinela em alerta", text: "As distribuições mudaram: acompanhe antes de confiar nas profecias." },
  degradado: { tone: "red", title: "Artefato enfraquecido", text: "O desempenho observado caiu em relação ao teste final. Retreine." },
  sem_dados: { tone: "blue", title: "Vigília iniciada", text: "A sentinela precisa de dias novos após o treino para comparar." },
} as const;

export function MonitorTab({ o, notify, selected, onSelect }: Props) {
  const a = useForgeActions();
  const [table, setTable] = useState(false);
  const m = useModel(o, selected, (x) => !!x.activeVersionId);
  if (!m) return <Empty icon={<Activity size={24} />} title="Nada a vigiar">A sentinela acompanha artefatos ativos: mudança das variáveis (PSI), do alvo e o desempenho observado.</Empty>;
  const snap = m.monitor;
  const history = o.monitors.filter((s) => s.modelId === m.id);
  const ui = SNAP_UI[snap?.status ?? "sem_dados"];
  const feats = snap?.drift?.features ?? [];
  const count = (lv: string) => feats.filter((f) => f.level === lv).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker models={o.models} value={m.id} onChange={onSelect} filter={(x) => !!x.activeVersionId} />
        <RPGButton variant="secondary" disabled={a.monitor.isPending} onClick={() => a.monitor.mutate(m.id, { onSuccess: () => notify("Vigília concluída."), onError: (e) => notify(errMsg(e, "Falha na verificação."), "error") })}>
          {a.monitor.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Verificar agora
        </RPGButton>
      </div>
      <section className={clsx("rpg-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center", ui.tone === "red" ? "rpg-panel-danger" : ui.tone === "green" ? "rpg-panel-success" : "rpg-panel-gold")} aria-label="Estado da sentinela">
        <span className={clsx("flex h-16 w-16 shrink-0 items-center justify-center border-2 border-current bg-rpg-bg shadow-[inset_0_0_16px_-4px_currentColor]", RPG_TONE_TEXT[ui.tone])} style={{ borderRadius: 4 }} aria-hidden>
          <ShieldCheck size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="rpg-title text-xl font-bold">{ui.title}</p>
          <p className="text-sm text-rpg-text/90">{ui.text}</p>
          <p className="text-[11px] text-rpg-muted">{snap ? `Última vigília em ${fmtDateTime(snap.checkedAt)}` : "Ainda não verificado."} Nada é retreinado sem você.</p>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rpg-panel p-3">
          <p className="text-xs text-rpg-muted">Variáveis</p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-sm">
            <Tag tone="green">{count("estavel")} estáveis</Tag>
            <Tag tone="orange">{count("moderada")} moderadas</Tag>
            <Tag tone="red">{count("forte")} fortes</Tag>
          </p>
          <p className="mt-1 text-[11px] text-rpg-muted">{snap?.drift ? `${count("sem_dados")} sem dados suficientes` : "Mínimo de 30 dias após o treino."}</p>
        </div>
        <div className="rpg-panel p-3">
          <p className="text-xs text-rpg-muted">Alvo</p>
          <p className={clsx("mt-1 text-sm font-semibold", snap?.drift?.target.changed ? "text-rpg-orange" : "text-rpg-text")}>{!snap?.drift || snap.drift.target.n < 20 ? "Aguardando dados" : snap.drift.target.changed ? "Mudou" : "Sem mudança relevante"}</p>
          <p className="mt-1 text-[11px] text-rpg-muted">{snap?.drift?.target.text ?? "Precisa de dias novos após o treino."}</p>
        </div>
        <div className="rpg-panel p-3">
          <p className="text-xs text-rpg-muted">Desempenho observado</p>
          <p className={clsx("mt-1 text-sm font-semibold", snap?.perf?.degraded ? "text-rpg-red" : "text-rpg-text")}>{snap?.perf?.observed != null ? fmtNum(snap.perf.observed) : "—"}</p>
          <p className="mt-1 text-[11px] text-rpg-muted">{snap?.perf?.text ?? "Avaliado após 15 profecias conferidas."}</p>
        </div>
      </div>
      <KitSection title="Mapa de drift (PSI)" icon={<Activity size={15} />} tone="legendary" action={feats.length ? <button type="button" className="text-xs text-rpg-gold-light hover:underline" onClick={() => setTable((t) => !t)}>{table ? "Ver resumo" : "Ver tabela"}</button> : undefined}>
        {!feats.length ? (
          <p className="text-sm text-rpg-muted">Sem verificação ainda.</p>
        ) : count("sem_dados") === feats.length && !table ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-rpg-blue/70 text-rpg-blue" aria-hidden>
              <Activity size={22} />
            </span>
            <p className="text-sm text-rpg-text">{feats.length} variáveis em vigília, aguardando dias novos.</p>
            <p className="max-w-md text-xs text-rpg-muted">O PSI compara a distribuição de cada variável depois do treino com a do treino — são precisos ao menos 30 dias novos para a comparação valer.</p>
          </div>
        ) : table ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-left text-rpg-muted">
                  <th className="p-1 font-normal">Variável</th>
                  <th className="p-1 text-right font-normal">PSI</th>
                  <th className="p-1 text-right font-normal">Ruído esperado</th>
                  <th className="p-1 font-normal">Nível</th>
                </tr>
              </thead>
              <tbody>
                {feats.map((f) => (
                  <tr key={f.key} className="border-t border-rpg-border/60">
                    <td className="p-1">{f.label}</td>
                    <td className="p-1 text-right tabular-nums">{fmtNum(f.psi)}</td>
                    <td className="p-1 text-right tabular-nums text-rpg-muted">{fmtNum(f.noise)}</td>
                    <td className="p-1">
                      <Tag tone={LEVEL_TONE[f.level] ?? "muted"}>{LEVEL_LABEL[f.level] ?? f.level}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {feats.map((f) => {
              const tone = LEVEL_TONE[f.level] ?? "muted";
              return (
                <li key={f.key} className={clsx("flex items-center justify-between gap-2 border px-2 py-1.5 text-xs", tone === "green" ? "border-rpg-green/50 bg-rpg-green/5" : tone === "orange" ? "border-rpg-orange/60 bg-rpg-orange/10" : tone === "red" ? "border-rpg-red/60 bg-rpg-red/10" : "border-rpg-border bg-rpg-bg-2/50")} style={{ borderRadius: 3 }}>
                  <span className="truncate text-rpg-text" title={f.label}>
                    {f.label}
                  </span>
                  <span className={clsx("shrink-0 font-semibold tabular-nums", RPG_TONE_TEXT[tone])}>{f.psi == null ? LEVEL_LABEL[f.level] : fmtNum(f.psi, 2)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {snap?.drift && <p className="mt-2 text-[11px] text-rpg-muted">{snap.drift.thresholds}</p>}
      </KitSection>
      {history.length > 1 && (
        <KitSection title="Vigílias anteriores" icon={<ScrollText size={15} />}>
          <ol className="flex flex-wrap gap-1.5">
            {history.map((h) => (
              <li key={h.checkedAt}>
                <Tag tone={h.status === "ok" ? "green" : h.status === "degradado" ? "red" : h.status === "atencao" ? "orange" : "muted"}>
                  {fmtDate(h.checkedAt)} · {h.status.replace("_", " ")}
                </Tag>
              </li>
            ))}
          </ol>
        </KitSection>
      )}
    </div>
  );
}

/* ═════════════ Relatórios ═════════════ */

type ReportData = { versions: Array<{ id: string; version: number; algorithm: string; status: string; trainedAt: string }>; predictions: Array<{ date: string; actual: number | null }>; runs: Array<{ kind: string; status: string }> };
type ModelCard = { modelCard: { name: string; objective: string; problem: string; target: string; horizonDays: number; features: string[]; validation: { folds: number; holdoutPct: number; primary: Primary; margin: number }; pipeline: string; intendedUse: string; limitations: string[]; leakageRule: string } };

export function ReportsTab({ o, notify, selected, onSelect }: Props) {
  const m = useModel(o, selected, (x) => !!x.latest);
  const report = useQuery({ queryKey: ["forge", "report", m?.id], queryFn: () => forgeService.report(m!.id), enabled: !!m, staleTime: 30_000 });
  const [busy, setBusy] = useState(false);
  if (!m) return <Empty icon={<FileJson size={24} />} title="Sem relatórios">Relatórios ficam disponíveis após o primeiro treino.</Empty>;
  const v = m.active ?? m.latest!;
  const card = (report.data as ModelCard | undefined)?.modelCard;
  const rep = report.data as ReportData | undefined;
  const algName = new Map(o.versions.map((x) => [x.algorithm as string, x.algorithmLabel]));
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
        <div className="space-y-3">
        <KitSection title="Ficha do artefato" icon={<Download size={16} />} tone="gold">
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
        {rep && (
          <KitSection title="Crônica do artefato" icon={<ScrollText size={16} />}>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Versões", rep.versions.length],
                  ["Profecias", rep.predictions.length],
                  ["Conferidas", rep.predictions.filter((p) => p.actual != null).length],
                ] as const
              ).map(([l, n]) => (
                <div key={l} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
                  <p className="font-rpg text-xl font-bold tabular-nums text-rpg-text">{n}</p>
                  <p className="text-[11px] text-rpg-muted">{l}</p>
                </div>
              ))}
            </div>
            <ol className="mt-3 space-y-1.5">
              {[...rep.versions].reverse().map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-xs">
                  <Tag tone={x.status === "ativa" ? "green" : x.status === "arquivada" ? "muted" : "blue"}>v{x.version}</Tag>
                  <span className="min-w-0 flex-1 truncate text-rpg-text">{algName.get(x.algorithm) ?? x.algorithm}</span>
                  <span className="text-rpg-muted">{fmtDateTime(x.trainedAt)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-rpg-muted">A exportação JSON/CSV inclui todas as versões, métricas e profecias deste artefato — só os seus dados.</p>
          </KitSection>
        )}
        </div>
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
