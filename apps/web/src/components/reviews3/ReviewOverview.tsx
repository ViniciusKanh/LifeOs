import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Award,
  BarChart3,
  BookMarked,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Crown,
  Gift,
  History,
  Lightbulb,
  Loader2,
  Settings2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { Tag } from "@/components/forge3/ForgeShared";
import { KIND_TAB, KIND_TITLE, type JourneyReview, type ReviewKind } from "@/services/journeyReviewService";
import { Delta, IND_META, Panel, REVIEWS_ART, fmtDate, fmtDateTime, fmtIndicator } from "./ReviewShared";
import { Frame } from "@/components/missions3/MissionsShared";

const CHART = { grid: "rgb(var(--rpg-border) / 0.5)", text: "rgb(var(--rpg-text-muted))" };
const TOOLTIP = { contentStyle: { background: "rgb(var(--rpg-panel))", border: "1px solid rgb(var(--rpg-border))", borderRadius: 4, fontSize: 12 }, labelStyle: { color: "rgb(var(--rpg-gold-light))" } };
const SUBTITLE: Record<ReviewKind, string> = {
  weekly: "Analise a semana, extraia aprendizados e prepare o próximo ciclo em cinco passos.",
  monthly: "Analise seus resultados, reconheça conquistas, aprenda com os desafios e trace os próximos passos.",
  quarterly: "Conselho estratégico: metas, ritmo, projetos que seguem e o que precisa ser replanejado.",
  annual: "O capítulo do ano: conquistas, desafios, evolução e a visão do próximo capítulo.",
};

/* ═════════════ Banner ═════════════ */

export function ReviewBanner({
  d,
  onNew,
  onHistory,
  onSettings,
  onAi,
  aiBusy,
}: {
  d: JourneyReview;
  onNew: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onAi: () => void;
  aiBusy: boolean;
}) {
  const t = KIND_TITLE[d.kind];
  const sealed = d.review.status === "sealed";
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden">
      <div className="relative grid items-stretch md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
        <div className="relative h-36 overflow-hidden md:h-auto md:min-h-[210px]" aria-hidden>
          <img src={`${REVIEWS_ART}/${d.kind === "monthly" || d.kind === "annual" ? "chronicle-mage" : "banner-mage"}.webp`} alt="" decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover object-[45%_35%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-rpg-panel via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:from-70% md:to-rpg-panel" />
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-2 px-4 py-4 sm:px-5">
          <p className="font-pixel text-[11px] uppercase tracking-[0.2em] text-rpg-gold">{t.eyebrow}</p>
          <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">{t.title}</h1>
          <p className="max-w-2xl text-sm text-rpg-text sm:text-base">{SUBTITLE[d.kind]}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-rpg-muted">
            <CalendarDays size={12} aria-hidden /> {d.label.charAt(0).toUpperCase() + d.label.slice(1)}: {fmtDate(d.range.from)} – {fmtDate(d.range.to)}
            {d.range.inProgress && <Tag tone="orange">em andamento · dia {d.range.elapsedDays}/{d.range.totalDays}</Tag>}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <RPGButton variant="primary" onClick={onNew} title="Ir para o período atual e abrir o ritual">
              <Sparkles size={15} aria-hidden /> Nova revisão
            </RPGButton>
            <RPGButton variant="secondary" onClick={onHistory}>
              <History size={15} aria-hidden /> Revisões anteriores
            </RPGButton>
            <RPGButton variant="secondary" onClick={onSettings}>
              <Settings2 size={15} aria-hidden /> Configurar ciclos
            </RPGButton>
            <RPGButton variant="secondary" onClick={onAi} disabled={aiBusy}>
              {aiBusy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />} Gerar análise com IA
            </RPGButton>
          </div>
        </div>
        <div className="relative hidden items-center gap-3 pr-5 xl:flex">
          <figure className="flex flex-col items-center">
            <img src={`${REVIEWS_ART}/seal.webp`} alt="" aria-hidden className={clsx("pixelated h-32 w-auto drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)]", !sealed && "opacity-60 grayscale-[0.5]")} />
            <figcaption className="-mt-1">
              <Tag tone={sealed ? "green" : "orange"}>{sealed ? `Selado ${fmtDate(d.review.sealedAt)}` : "Aguardando selo"}</Tag>
            </figcaption>
          </figure>
          <RevisorCard d={d} />
        </div>
      </div>
    </header>
  );
}

export function RevisorCard({ d, className }: { d: JourneyReview; className?: string }) {
  const r = d.revisor;
  return (
    <div className={clsx("w-[250px] border-2 border-rpg-gold/60 bg-rpg-bg/80 p-3", className)} style={{ borderRadius: 4 }} title={r.rule}>
      <p className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-wider text-rpg-gold-light">
        <Crown size={14} aria-hidden /> Revisor da Jornada
      </p>
      <p className="mt-1 font-rpg text-lg font-bold leading-tight text-rpg-text">
        Nv. {r.level} · {r.title}
      </p>
      <div className="mt-1.5 h-2.5 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }} role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do título">
        <div className="h-full bg-gradient-to-r from-rpg-purple to-rpg-gold" style={{ width: `${r.pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-rpg-muted">{r.next ? `${r.points}/${r.next.min} pts → ${r.next.title}` : `${r.points} pts · título máximo`}</p>
      <p className="mt-1.5 text-[11px] text-rpg-text">
        Fechar este ciclo: <strong className="text-rpg-purple">+{d.chest.xp} XP</strong> · <strong className="text-rpg-gold-light">+{d.chest.coins} moedas</strong>
      </p>
      {r.streakWeeks > 0 && <p className="text-[10px] text-rpg-orange">🔥 {r.streakWeeks} semana(s) seguidas revisadas</p>}
    </div>
  );
}

/* ═════════════ Retrato do período ═════════════ */

const MAIN_KEYS = ["xp", "coins", "tasksDone", "habitsDone", "workouts", "pagesRead", "focusMinutes", "sleepAvgMinutes"];

export function Portrait({ d }: { d: JourneyReview }) {
  const [all, setAll] = useState(false);
  const list = d.indicators.filter((i) => i.key !== "lifeScore" && (all || MAIN_KEYS.includes(i.key)));
  return (
    <Panel
      title={`Retrato ${d.kind === "weekly" ? "da semana" : "do período"}`}
      icon={<BarChart3 size={15} />}
      action={
        <button onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-rpg-gold-light hover:underline">
          {all ? "Principais" : `Todos (${d.indicators.length - 1})`}
        </button>
      }
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.map((i) => {
          const m = IND_META[i.key] ?? { icon: <Circle size={17} />, tone: "muted" as const };
          return (
            <li key={i.key} className="flex min-w-0 items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
              <Frame tone={m.tone} size="sm">
                {m.icon}
              </Frame>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums text-rpg-text">{fmtIndicator(i)}</p>
                <p className="truncate text-[10.5px] text-rpg-muted" title={`${i.label} (${i.unit})`}>
                  {i.label}
                </p>
                <Delta i={i} compact />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10.5px] text-rpg-muted">
        Comparado com {d.previous.label} ({fmtDate(d.previous.from)} – {fmtDate(d.previous.to)}){d.previous.partial ? " · comparação parcial, mesmo número de dias (*)" : ""}. Sem base anterior não há percentual.
      </p>
    </Panel>
  );
}

/* ═════════════ Life Score + equilíbrio ═════════════ */

export function LifeScorePanel({ d }: { d: JourneyReview }) {
  const ls = d.indicators.find((i) => i.key === "lifeScore");
  const v = ls?.value ?? null;
  const radar = d.radar.map((r) => ({ dim: r.label, Atual: r.value ?? 0, Anterior: r.previous ?? 0 }));
  const hasRadar = d.radar.some((r) => r.value != null);
  return (
    <Panel title="Life Score e equilíbrio" icon={<Trophy size={15} />} tone="gold">
      <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="relative mx-auto h-36 w-36" title={`Média de ${d.lifeScoreDays} dia(s) com Life Score calculado.`}>
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgb(var(--rpg-border))" strokeWidth="10" />
            {v != null && v > 0 && <circle cx="60" cy="60" r="50" fill="none" stroke="url(#lsg)" strokeWidth="10" strokeDasharray={`${(v / 100) * 314} 314`} strokeLinecap="round" />}
            <defs>
              <linearGradient id="lsg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgb(var(--rpg-purple))" />
                <stop offset="100%" stopColor="rgb(var(--rpg-gold))" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-rpg text-4xl font-bold leading-none text-rpg-text">{v == null ? "—" : Math.round(v)}</span>
            <span className="text-xs text-rpg-muted">/100</span>
            {ls && <Delta i={ls} compact />}
          </div>
        </div>
        <ul className="space-y-1.5">
          {d.radar.map((r) => (
            <li key={r.key} className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-2 text-xs">
              <span className="truncate text-rpg-text">{r.label}</span>
              <span className="h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                <span className="block h-full bg-gradient-to-r from-rpg-purple to-rpg-cyan" style={{ width: `${r.value ?? 0}%` }} />
              </span>
              <span className="text-right font-bold tabular-nums text-rpg-text">{r.value ?? "—"}</span>
            </li>
          ))}
        </ul>
      </div>
      {hasRadar && (
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke={CHART.grid} />
              <PolarAngleAxis dataKey="dim" tick={{ fill: CHART.text, fontSize: 10 }} />
              <Radar name="Atual" dataKey="Atual" stroke="rgb(var(--rpg-purple))" fill="rgb(var(--rpg-purple))" fillOpacity={0.45} />
              {d.radar.some((r) => r.previous != null) && <Radar name="Anterior" dataKey="Anterior" stroke="rgb(var(--rpg-gold))" fill="none" strokeDasharray="4 3" />}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip {...TOOLTIP} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      {d.lifeScoreDays === 0 && <p className="mt-2 text-[11px] text-rpg-muted">Nenhum dia com Life Score calculado neste período.</p>}
    </Panel>
  );
}

/* ═════════════ Evolução ═════════════ */

export function EvolutionPanel({ d }: { d: JourneyReview }) {
  const data = d.series.map((p, idx) => ({
    label: p.label,
    "Life Score": p.future ? null : p.lifeScore,
    Missões: p.future ? null : p.tasksDone,
    Hábitos: p.future ? null : p.habitsDone,
    Anterior: d.previousSeries?.[idx]?.lifeScore ?? null,
  }));
  const any = d.series.some((p) => !p.future && (p.lifeScore != null || p.tasksDone || p.habitsDone));
  return (
    <Panel title="Evolução do período" icon={<TrendingUp size={15} />}>
      {any ? (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART.text, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: CHART.text, fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Life Score" stroke="rgb(var(--rpg-purple))" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              {d.previousSeries && <Line type="monotone" dataKey="Anterior" name="Life Score (anterior)" stroke="rgb(var(--rpg-gold))" strokeDasharray="5 4" dot={false} connectNulls />}
              <Line type="monotone" dataKey="Missões" stroke="rgb(var(--rpg-blue))" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="Hábitos" stroke="rgb(var(--rpg-green))" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-rpg-muted">Ainda sem registros neste período para desenhar a evolução.</p>
      )}
    </Panel>
  );
}

/* ═════════════ Metas, insights, linha do tempo ═════════════ */

export function GoalsPanel({ d, onOpenGoals }: { d: JourneyReview; onOpenGoals: () => void }) {
  return (
    <Panel title="Evolução das metas" icon={<Target size={15} />} action={<button onClick={onOpenGoals} className="text-xs font-semibold text-rpg-gold-light hover:underline">Ver metas →</button>}>
      {d.goals.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma meta ativa neste ciclo.</p>
      ) : (
        <ul className="space-y-2.5">
          {d.goals.map((g) => (
            <li key={g.id}>
              <div className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-semibold text-rpg-text">{g.title}</span>
                <span className="tabular-nums text-rpg-muted">{g.progressPct == null ? "—" : `${g.progressPct}%`}</span>
                {g.status === "done" && <CheckCircle2 size={14} className="text-rpg-green" aria-label="Concluída" />}
              </div>
              <div className="mt-1 h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                <div className={clsx("h-full", g.status === "done" ? "bg-rpg-green" : "bg-gradient-to-r from-rpg-purple to-rpg-pink")} style={{ width: `${g.progressPct ?? 0}%` }} />
              </div>
              <p className="mt-0.5 text-[10.5px] text-rpg-muted">
                {g.doneTasks} missão(ões) feitas · {g.openTasks} aberta(s){g.openTasks === 0 && g.status === "active" ? " — sem próxima missão" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const INSIGHT_ICON: Record<string, ReactNode> = { alta: <TrendingUp size={16} />, queda: <TrendingDown size={16} />, meta: <Target size={16} /> };
const INSIGHT_TONE: Record<string, "green" | "red" | "orange"> = { alta: "green", queda: "red", meta: "orange" };

export function InsightsPanel({ d }: { d: JourneyReview }) {
  return (
    <Panel title="Insights da revisão" icon={<Lightbulb size={15} />}>
      {d.insights.length === 0 ? (
        <p className="text-sm text-rpg-muted">Sem variações relevantes para destacar (ou ainda sem base de comparação).</p>
      ) : (
        <ul className="space-y-2">
          {d.insights.map((i, n) => (
            <li key={n} className="flex gap-2.5 border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
              <Frame tone={INSIGHT_TONE[i.kind] ?? "muted"} size="sm">
                {INSIGHT_ICON[i.kind]}
              </Frame>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rpg-text">{i.title}</p>
                <p className="text-[11.5px] text-rpg-muted">{i.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] text-rpg-muted">Regras: variação de ±20% com base anterior, metas sem missão aberta. Calculado dos seus registros.</p>
    </Panel>
  );
}

export function TimelinePanel({ d }: { d: JourneyReview }) {
  const [all, setAll] = useState(false);
  const list = all ? d.timeline : d.timeline.slice(0, 8);
  return (
    <Panel title={d.kind === "annual" ? "Crônica do ano" : "Marcos do período"} icon={<BookMarked size={15} />} action={d.timeline.length > 8 ? <button onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-rpg-gold-light hover:underline">{all ? "Menos" : `Todos (${d.timeline.length})`}</button> : undefined}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum marco registrado ainda.</p>
      ) : (
        <ol className="relative space-y-2 border-l-2 border-rpg-border pl-4">
          {list.map((e, n) => (
            <li key={n} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rotate-45 border border-rpg-gold bg-rpg-bg" aria-hidden />
              <p className="text-[13px] font-semibold text-rpg-text">{e.title}</p>
              <p className="text-[10.5px] text-rpg-muted">
                {fmtDateTime(e.at)}
                {e.detail ? ` · ${e.detail}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function MissionsPendingPanel({ d, onOpen }: { d: JourneyReview; onOpen: (id: string) => void }) {
  if (!d.missionsPending) return null;
  return (
    <Panel title="Pendências das missões" icon={<Clock size={15} />}>
      {d.missionsPending.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma missão atrasada ou parada em revisão. 👏</p>
      ) : (
        <ul className="space-y-1.5">
          {d.missionsPending.map((m) => (
            <li key={m.id}>
              <button onClick={() => onOpen(m.id)} className="flex w-full items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-left text-xs hover:border-rpg-gold" style={{ borderRadius: 3 }}>
                <span className="min-w-0 flex-1 truncate font-semibold text-rpg-text">{m.title}</span>
                <span className="shrink-0 text-rpg-muted">{m.status === "Em Revisão" ? "em revisão" : fmtDate(m.dueDate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ═════════════ Selos, baú, histórico ═════════════ */

export function SealsPanel({ d }: { d: JourneyReview }) {
  return (
    <Panel title="Selos e conquistas" icon={<Award size={15} />}>
      <ul className="grid grid-cols-2 gap-2">
        {d.seals.map((s) => (
          <li key={s.code} className={clsx("border-2 p-2 text-center", s.done ? "border-rpg-gold/70 bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/60")} style={{ borderRadius: 3 }} title={s.criterion}>
            <span className={clsx("mx-auto mb-1 flex h-9 w-9 items-center justify-center border-2", s.done ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted/60")} style={{ borderRadius: 3 }} aria-hidden>
              <Award size={18} />
            </span>
            <p className={clsx("text-[11.5px] font-semibold leading-tight", s.done ? "text-rpg-text" : "text-rpg-muted")}>{s.name}</p>
            <p className="mt-0.5 text-[10px] text-rpg-muted">{s.done ? (s.at ? fmtDate(s.at) : "conquistado") : s.criterion}</p>
            {s.reward && <p className="mt-0.5 text-[10px] font-bold text-rpg-purple">{s.reward}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ChestPanel({ d, onClaim, busy }: { d: JourneyReview; onClaim: () => void; busy: boolean }) {
  const c = d.chest;
  const ready = c.sealed && c.eligible && !c.awarded;
  return (
    <Panel title="Recompensa da revisão" icon={<Gift size={15} />} tone="gold">
      <div className="flex items-center gap-3">
        <img src={`${REVIEWS_ART}/chest.webp`} alt="" aria-hidden className={clsx("pixelated h-24 w-24 shrink-0 object-contain drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)]", c.awarded && "opacity-60")} />
        <div className="min-w-0">
          <p className="text-sm text-rpg-text">
            <strong className="text-rpg-purple">+{c.xp} XP</strong> · <strong className="text-rpg-gold-light">+{c.coins} moedas</strong>
          </p>
          <p className="mt-0.5 text-[11px] text-rpg-muted">
            {c.awarded ? `Resgatada em ${fmtDateTime(c.awardedAt)}.` : !c.eligible ? "Fora da janela de recompensa (só o período atual ou o anterior)." : !c.sealed ? "Sele a revisão para liberar o baú." : "Pronta para resgate!"}
          </p>
          <RPGButton variant="primary" className="mt-2" disabled={!ready || busy} onClick={onClaim}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Gift size={15} aria-hidden />} {c.awarded ? "Já resgatada" : "Resgatar recompensa"}
          </RPGButton>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-rpg-muted">{c.rule}</p>
    </Panel>
  );
}

export function HistoryStrip({ d, onGo }: { d: JourneyReview; onGo: (kind: ReviewKind, key: string) => void }) {
  const list = d.history.filter((h) => h.kind === d.kind).slice(0, 8);
  return (
    <Panel title="Histórico de revisões" icon={<History size={15} />}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma revisão {KIND_TAB[d.kind].toLowerCase()} registrada ainda.</p>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {list.map((h) => (
            <li key={`${h.kind}${h.key}`} className="shrink-0">
              <button
                onClick={() => onGo(h.kind, h.key)}
                className={clsx("flex w-[92px] flex-col items-center gap-1 border-2 p-2 text-center", h.key === d.key ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/70 hover:border-rpg-gold/60")}
                style={{ borderRadius: 3 }}
              >
                <span className="text-[10.5px] font-semibold text-rpg-muted">{h.label}</span>
                <span className={clsx("flex h-8 w-8 items-center justify-center border-2", h.status === "sealed" ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }} aria-hidden>
                  <Award size={16} />
                </span>
                <span className="font-rpg text-lg font-bold leading-none text-rpg-text">{h.lifeScore ?? "—"}</span>
                <span className="text-[9.5px] text-rpg-muted">{h.status === "sealed" ? "selada" : h.status === "legacy" ? "legado" : "rascunho"}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
