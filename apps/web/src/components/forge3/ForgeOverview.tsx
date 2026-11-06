import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Award, CheckCircle2, Circle, Database, FlaskConical, Gauge, Loader2, ScrollText, Sparkles, Telescope } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { AdvisorPanel, KitSection } from "@/components/rpg-modules/ModuleKit";
import { Modal } from "@/components/ui/Modal";
import { useForgeActions } from "@/hooks/useForge";
import { RUN_KIND, RUN_STATUS, fmtNum, type ForgeModel, type ForgeOverview, type Prediction } from "@/services/forgeService";
import { Empty, FORGE_ART, R, StatusBadge, errMsg, fmtDate, fmtDateTime, pct, templateIcon, type Notify } from "./ForgeShared";

type Source = NonNullable<ForgeOverview["quality"]>["sources"][number];

/** Formata a previsão conforme o tipo de problema (probabilidade x valor na unidade do alvo). */
export function predText(p: Prediction, m: ForgeModel | undefined) {
  if (!m) return fmtNum(p.value, 2);
  if (m.problem === "classification") return pct(p.value);
  const range = p.lower != null && p.upper != null ? ` (${fmtNum(p.lower, 1)}–${fmtNum(p.upper, 1)})` : "";
  return `${fmtNum(p.value, 1)}${range}`;
}

/* ───────── Núcleo de dados (8 fontes reais) ───────── */
function Nucleus({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const { analyze } = useForgeActions();
  const [open, setOpen] = useState<Source | null>(null);
  const q = o.quality;
  const run = () => analyze.mutate(undefined, { onSuccess: () => notify("Análise dos dados concluída."), onError: (e) => notify(errMsg(e, "Não foi possível analisar os dados."), "error") });
  return (
    <KitSection
      title="Núcleo da Forja"
      icon={<Database size={16} />}
      tone="legendary"
      action={
        <RPGButton variant="secondary" onClick={run} disabled={analyze.isPending} aria-label="Analisar dados agora">
          {analyze.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Gauge size={14} aria-hidden />} Analisar
        </RPGButton>
      }
    >
      {!q ? (
        <Empty icon={<Database size={24} />} title="Os dados ainda não foram analisados">
          A análise lê seus registros (sem enviá-los a terceiros), mede cobertura e qualidade e decide quais fontes podem alimentar modelos.
        </Empty>
      ) : (
        <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <ul className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-1">
            {q.sources.slice(0, 4).map((s) => (
              <SourceRow key={s.key} s={s} onOpen={() => setOpen(s)} />
            ))}
          </ul>
          <div className="relative mx-auto hidden h-40 w-40 md:block">
            <img src={`${FORGE_ART}/core.webp`} alt="" aria-hidden className="pixelated h-full w-full object-contain drop-shadow-[0_0_18px_rgb(var(--rpg-purple)/0.6)]" />
            <p className="absolute inset-x-0 bottom-0 text-center font-pixel text-[10px] text-rpg-purple">
              Qualidade {q.quality.scores.overall == null ? "—" : `${q.quality.scores.overall}/100`}
            </p>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-1">
            {q.sources.slice(4).map((s) => (
              <SourceRow key={s.key} s={s} onOpen={() => setOpen(s)} />
            ))}
          </ul>
          <p className="text-[11px] text-rpg-muted md:col-span-3">
            Analisado em {fmtDateTime(q.analyzedAt)} · janela {fmtDate(q.quality.range.from)} → {fmtDate(q.quality.range.to)} ({q.quality.range.days} dias). Qualidade geral = completude × validade × (1 − taxa de outliers) (definições em Laboratório).
          </p>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.label ?? ""} size="sm">
        {open && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-rpg-muted">Estado</dt>
            <dd>{open.connected ? "Conectada" : "Sem registros"}</dd>
            <dt className="text-rpg-muted">Registros</dt>
            <dd className="tabular-nums">{open.records}</dd>
            <dt className="text-rpg-muted">Período</dt>
            <dd>
              {fmtDate(open.from)} → {fmtDate(open.to)}
            </dd>
            <dt className="text-rpg-muted">Dias nos últimos 30</dt>
            <dd className="tabular-nums">{open.recentDays}</dd>
            <dt className="text-rpg-muted">Duplicados</dt>
            <dd className="tabular-nums">{open.duplicates}</dd>
            <dt className="text-rpg-muted">Qualidade</dt>
            <dd>{open.quality == null ? "—" : `${open.quality}/100`}</dd>
            <dt className="text-rpg-muted">Granularidade</dt>
            <dd>{open.granularity}</dd>
            <dt className="text-rpg-muted">Uso em modelos</dt>
            <dd>{open.usedAsFeature ? "Gera variáveis" : "Apenas contexto"}</dd>
            <dt className="col-span-2 mt-1 text-rpg-muted">Elegibilidade</dt>
            <dd className="col-span-2">{open.eligibility}</dd>
          </dl>
        )}
      </Modal>
    </KitSection>
  );
}

function SourceRow({ s, onOpen }: { s: Source; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-left hover:border-rpg-purple" style={R} aria-label={`Detalhes da fonte ${s.label}`}>
        <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", !s.connected ? "bg-rpg-muted" : s.eligible ? "bg-rpg-green" : "bg-rpg-orange")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-rpg-text">{s.label}</span>
          <span className="block truncate text-[10px] text-rpg-muted">
            {s.records} registros · {s.recentDays}/30 dias · {s.eligible ? "elegível" : "insuficiente"}
          </span>
        </span>
        <span className="font-pixel text-[10px] tabular-nums text-rpg-purple">{s.quality == null ? "—" : s.quality}</span>
      </button>
    </li>
  );
}

/* ───────── Profecia: previsões ativas ───────── */
function Prophecy({ o, onGo }: { o: ForgeOverview; onGo: () => void }) {
  const byId = new Map(o.models.map((m) => [m.id, m]));
  const upcoming = o.predictions.filter((p) => p.targetDate >= o.today).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return (
    <KitSection title="Profecia" icon={<Telescope size={16} />} action={<RPGButton variant="ghost" onClick={onGo}>Ver todas</RPGButton>}>
      {!upcoming.length ? (
        <Empty icon={<Telescope size={22} />} title="Nenhuma previsão ativa">
          Previsões só aparecem quando um modelo supera o baseline e é ativado por você.
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.slice(0, 6).map((p) => {
            const m = byId.get(p.modelId);
            return (
              <li key={`${p.modelId}-${p.targetDate}`} className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 px-2 py-1.5" style={R}>
                <span className="text-rpg-purple" aria-hidden>
                  {templateIcon(o.templates.find((t) => t.key === m?.templateKey)?.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-rpg-text">{m?.name ?? "Modelo"}</span>
                  <span className="block text-[10px] text-rpg-muted">
                    {fmtDate(p.targetDate)} · {m?.targetLabel}
                    {p.partial && " · preliminar (dados do dia anterior incompletos)"}
                  </span>
                </span>
                <span className="font-rpg text-lg font-bold tabular-nums text-rpg-text">{predText(p, m)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-rpg-muted">Estimativas estatísticas a partir do seu histórico — não são certezas nem diagnósticos.</p>
    </KitSection>
  );
}

/* ───────── Pesquisador: nível e marcos (recompensa única) ───────── */
function Researcher({ o }: { o: ForgeOverview }) {
  const r = o.researcher;
  return (
    <KitSection title="Pesquisador" icon={<Award size={16} />} tone="gold">
      <div className="flex items-center gap-3">
        <img src={`${FORGE_ART}/emblem.webp`} alt="" aria-hidden className="pixelated h-14 w-14 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase text-rpg-muted">Nível {r.level}</p>
          <p className="rpg-title truncate text-lg font-bold">{r.title}</p>
          <RPGProgressBar value={r.pct} max={100} tone="purple" label={`${r.points} pontos de pesquisa`} />
          <p className="mt-0.5 text-[10px] text-rpg-muted">{r.next ? `${r.next.min - r.points} pontos para ${r.next.title}` : "Título máximo alcançado"}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-rpg-muted" title={r.rule}>
        {r.breakdown.models} modelos · {r.breakdown.versions} versões · {r.breakdown.beatBaseline} acima do baseline · {r.breakdown.backtests} backtests
      </p>
      <ul className="mt-2 space-y-1">
        {o.milestones.map((m) => (
          <li key={m.code} className="flex items-start gap-1.5 text-xs" title={m.description}>
            {m.done ? <CheckCircle2 size={14} className="mt-px shrink-0 text-rpg-green" aria-hidden /> : <Circle size={14} className="mt-px shrink-0 text-rpg-muted" aria-hidden />}
            <span className={m.done ? "text-rpg-text" : "text-rpg-muted"}>{m.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-rpg-muted">
        Cada marco paga uma única vez: +{o.milestoneReward.xp} XP e +{o.milestoneReward.coins} moedas. Retreinos idênticos não pagam.
      </p>
    </KitSection>
  );
}

export function OverviewTab({ o, notify, goTab }: { o: ForgeOverview; notify: Notify; goTab: (t: "artefatos" | "previsoes" | "experimentos" | "gargalos") => void }) {
  const active = o.models.filter((m) => m.status !== "arquivado");
  return (
    <div className="space-y-3">
      <Nucleus o={o} notify={notify} />
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Prophecy o={o} onGo={() => goTab("previsoes")} />
        <KitSection title="Artefatos" icon={<Sparkles size={16} />} action={<RPGButton variant="ghost" onClick={() => goTab("artefatos")}>Abrir</RPGButton>}>
          {!active.length ? (
            <Empty icon={<Sparkles size={22} />} title="Nenhum artefato forjado">
              Comece por um modelo pronto em Artefatos.
            </Empty>
          ) : (
            <ul className="space-y-1.5">
              {active.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="text-rpg-purple" aria-hidden>
                    {templateIcon(o.templates.find((t) => t.key === m.templateKey)?.icon)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-rpg-text">{m.name}</span>
                  <StatusBadge m={m} />
                </li>
              ))}
            </ul>
          )}
        </KitSection>
        <Researcher o={o} />
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <KitSection title="Alertas e recomendações" icon={<AlertTriangle size={16} />}>
          {!o.alerts.length ? (
            <p className="text-sm text-rpg-muted">Nenhum alerta. Dados e modelos sem problemas detectados.</p>
          ) : (
            <ul className="space-y-1.5">
              {o.alerts.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-rpg-text">
                  <RPGBadge tone={a.level === "alto" ? "red" : a.level === "medio" ? "orange" : "muted"}>{a.level}</RPGBadge>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </KitSection>
        <KitSection title="Gargalos detectados" icon={<FlaskConical size={16} />} action={<RPGButton variant="ghost" onClick={() => goTab("gargalos")}>Detalhes</RPGButton>}>
          {!o.quality?.bottlenecks.length ? (
            <p className="text-sm text-rpg-muted">{o.quality ? "Nenhuma queda ≥ 20% entre as duas últimas quinzenas." : "Analise os dados para detectar gargalos."}</p>
          ) : (
            <ul className="space-y-1.5">
              {o.quality.bottlenecks.slice(0, 4).map((b) => (
                <li key={b.key} className="text-xs text-rpg-text">
                  <span className="font-semibold">{b.label}</span> · <span className="text-rpg-red">{b.diffPct}%</span>
                </li>
              ))}
            </ul>
          )}
        </KitSection>
        <KitSection title="Últimas execuções" icon={<ScrollText size={16} />} action={<RPGButton variant="ghost" onClick={() => goTab("experimentos")}>Todas</RPGButton>}>
          {!o.runs.length ? (
            <p className="text-sm text-rpg-muted">Nenhuma execução ainda.</p>
          ) : (
            <ul className="space-y-1">
              {o.runs.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-rpg-text">
                    {RUN_KIND[r.kind]} · {o.models.find((m) => m.id === r.modelId)?.name ?? "Geral"}
                  </span>
                  <RPGBadge tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : r.status === "insufficient" ? "orange" : "muted"}>{RUN_STATUS[r.status]}</RPGBadge>
                </li>
              ))}
            </ul>
          )}
        </KitSection>
      </div>
      <AdvisorPanel module="forge" title="Mestre da Inteligência" avatar={`${FORGE_ART}/orb.webp`} />
    </div>
  );
}
