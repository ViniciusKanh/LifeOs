import { useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Flag,
  Flame,
  Layers,
  Loader2,
  Repeat,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Upload,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useGrimoireHubActions, useGrimoireImports, useGrimoireSuggestions } from "@/hooks/useGrimoire";
import type { GrimoireDeck, GrimoireHub, ImportSummary, OracleRec } from "@/services/grimoireService";
import { errorMessage } from "./grimoireUi";

/**
 * Painéis do Grimório 2.0. Composição inspirada na referência aprovada;
 * números, nomes e estados vêm sempre do /api/grimoire/hub (dados reais).
 */

const HUB = "/assets/rpg/hub";
const PANEL = "rpg-panel relative overflow-hidden";
const TITLE = "rpg-title font-bold uppercase tracking-[0.05em]";

const PROV: Record<OracleRec["provenance"], string> = {
  dado: "border-rpg-blue/60 text-rpg-blue",
  inferência: "border-rpg-purple/60 text-rpg-purple",
  sugestão: "border-rpg-gold/60 text-rpg-gold-light",
};

export function ProvTag({ kind }: { kind: OracleRec["provenance"] }) {
  return (
    <span className={clsx("shrink-0 border px-1 font-pixel text-[9px] uppercase", PROV[kind])} style={{ borderRadius: 2 }}>
      {kind}
    </span>
  );
}

/* ------------------------------ Cabeçalho ------------------------------ */

export function GrimoireBanner({ onGenerate, onNewDeck, onImport, onAutomations }: { onGenerate: () => void; onNewDeck: () => void; onImport: () => void; onAutomations: () => void }) {
  return (
    <header className={clsx(PANEL, "rpg-panel-gold")}>
      <img src={`${HUB}/grim-hero.webp`} alt="" aria-hidden decoding="async" className="pixelated absolute inset-y-0 right-0 hidden h-full w-[60%] object-cover object-left sm:block [mask-image:linear-gradient(to_right,transparent,black_20%)]" />
      <img src={`${HUB}/grim-hero.webp`} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover opacity-30 sm:hidden" />
      <div className="relative flex min-h-[150px] flex-col justify-center gap-3 p-4 sm:min-h-[170px] sm:max-w-[58%] sm:p-5">
        <div className="flex items-center gap-3">
          <span className="hidden h-14 w-14 shrink-0 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light shadow-[0_0_18px_-4px_rgb(var(--rpg-gold)/0.7)] min-[420px]:flex" style={{ borderRadius: 4 }} aria-hidden>
            <BookOpen size={28} />
          </span>
          <div className="min-w-0">
            <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">Grimório</h1>
            <p className="mt-1 text-sm text-rpg-text/90">Seu livro de feitiços de aprendizado: estudo, revisão, memorização e maestria do conhecimento.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button type="button" onClick={onGenerate} className="rpg-btn rpg-btn-secondary inline-flex items-center justify-center gap-1.5 text-xs">
            <Wand2 size={14} aria-hidden /> Gerar com IA
          </button>
          <button type="button" onClick={onNewDeck} className="rpg-btn rpg-btn-primary inline-flex items-center justify-center gap-1.5 text-xs">
            <Layers size={14} aria-hidden /> Novo baralho
          </button>
          <button type="button" onClick={onImport} className="rpg-btn rpg-btn-secondary inline-flex items-center justify-center gap-1.5 text-xs">
            <Upload size={14} aria-hidden /> Importar anotações
          </button>
          <button type="button" onClick={onAutomations} className="rpg-btn rpg-btn-gold inline-flex items-center justify-center gap-1.5 text-xs">
            <Zap size={14} aria-hidden /> Automações
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ Ritual de hoje ------------------------------ */

export function RitualPanel({ hub, onStart }: { hub: GrimoireHub; onStart: () => void }) {
  const r = hub.ritual;
  const pending = r.due + r.fresh + r.reinforce;
  const steps = [
    { key: "due", label: "Revisar", n: r.due, icon: CheckCircle2 },
    { key: "fresh", label: "Novos", n: r.fresh, icon: Star },
    { key: "reinforce", label: "Reforçar", n: r.reinforce, icon: Repeat },
    { key: "done", label: "Concluir ritual", n: null, icon: Flag },
  ] as const;
  const firstOpen = steps.findIndex((s) => s.n !== null && s.n > 0);
  const title = pending > 0 ? "Hora de conjurar conhecimento" : r.clearedToday ? "Ritual de hoje concluído" : hub.indicators.activeDecks === 0 ? "Abra seu primeiro tomo" : "Nada para revisar agora";
  return (
    <section className={clsx(PANEL, pending > 0 && "rpg-panel-gold")} aria-label="Ritual de hoje">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        <div className="relative min-w-0">
          <img src={`${HUB}/grim-hourglass.webp`} alt="" aria-hidden loading="lazy" className="pixelated absolute right-0 top-0 hidden h-20 w-36 object-cover opacity-90 sm:block [mask-image:linear-gradient(to_right,transparent,black_30%)]" />
          <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">✦ Ritual de hoje</p>
          <p className={clsx(TITLE, "mt-1 text-lg sm:max-w-[65%]")}>{title}</p>
          <p className="mt-0.5 text-xs text-rpg-muted sm:max-w-[65%]">Revise, estude o novo e fortaleça o que precisa de reforço. {r.reviewedToday > 0 ? `${r.reviewedToday} revisão(ões) hoje.` : ""}</p>
          <button type="button" onClick={onStart} disabled={pending === 0} className="rpg-btn rpg-btn-gold mt-3 inline-flex w-full items-center justify-center gap-1.5 text-sm disabled:opacity-50 sm:w-auto">
            ▷ Começar ritual{pending > 0 ? ` (${pending})` : ""}
          </button>
        </div>
        <ol className="grid grid-cols-4 gap-1" aria-label="Etapas do ritual">
          {steps.map((s, i) => {
            const done = s.n === null ? pending === 0 && r.reviewedToday > 0 : s.n === 0 && r.reviewedToday > 0;
            const current = i === firstOpen;
            return (
              <li key={s.key} className="relative flex flex-col items-center text-center">
                {i > 0 && <span className="absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 bg-rpg-border" aria-hidden />}
                <span
                  className={clsx(
                    "relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2",
                    done ? "border-rpg-gold bg-rpg-gold text-rpg-bg" : current ? "border-rpg-gold bg-rpg-bg text-rpg-gold-light shadow-[0_0_12px_rgb(var(--rpg-gold)/0.6)]" : "border-rpg-border bg-rpg-bg text-rpg-muted",
                  )}
                  aria-hidden
                >
                  {done ? <Check size={15} /> : <s.icon size={14} />}
                </span>
                <span className={clsx("mt-1 text-[11px] leading-tight", current ? "text-rpg-gold-light" : "text-rpg-text/85")}>{s.label}</span>
                {s.n !== null && <span className="font-pixel text-[11px] tabular-nums text-rpg-muted">({s.n})</span>}
                <span className="sr-only">{done ? "concluída" : current ? "etapa atual" : "pendente"}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------ Indicadores ------------------------------ */

export function IndicatorsRow({ hub }: { hub: GrimoireHub }) {
  const i = hub.indicators;
  const delta = i.studyMinutesPrev7d > 0 ? Math.round(((i.studyMinutes7d - i.studyMinutesPrev7d) / i.studyMinutesPrev7d) * 100) : null;
  const time = i.studyMinutes7d >= 60 ? `${Math.floor(i.studyMinutes7d / 60)}h ${i.studyMinutes7d % 60}min` : `${i.studyMinutes7d}min`;
  const tiles: Array<{ icon: ReactNode; label: string; value: string; caption: string; bar?: { v: number; cls: string } }> = [
    { icon: <Flame size={20} />, label: "Sequência", value: `${i.streak} ${i.streak === 1 ? "dia" : "dias"}`, caption: `melhor: ${i.bestStreak}` },
    {
      icon: <Target size={20} />,
      label: "Retenção",
      value: i.retention == null ? "—" : `${i.retention}%`,
      caption: i.retention == null ? `dados insuficientes (${i.retentionSample}/10)` : "30 dias, cartões aprendidos",
      bar: i.retention == null ? undefined : { v: i.retention, cls: "bg-rpg-green" },
    },
    { icon: <BookOpen size={20} />, label: "Domínio", value: i.domain == null ? "—" : `${i.domain}%`, caption: "cartões maduros / total", bar: i.domain == null ? undefined : { v: i.domain, cls: "bg-rpg-purple" } },
    {
      icon: <Clock size={20} />,
      label: "Tempo estudado",
      value: i.measuredReviews7d === 0 ? "—" : time,
      caption: i.measuredReviews7d === 0 ? "medido a partir das próximas revisões" : delta == null ? "últimos 7 dias" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}% (7 dias)`,
    },
    { icon: <Sparkles size={20} />, label: "XP de estudo", value: `+${i.studyXp30d.toLocaleString("pt-BR")}`, caption: `30 dias · ${i.studyXpTotal.toLocaleString("pt-BR")} no total` },
    { icon: <Layers size={20} />, label: "Tomos ativos", value: String(i.activeDecks), caption: i.activeDecks === 1 ? "baralho" : "baralhos" },
  ];
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rpg-panel flex min-w-[150px] shrink-0 snap-start items-center gap-2.5 p-3 sm:min-w-0">
          <span className="text-rpg-gold" aria-hidden>
            {t.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-[10px] uppercase tracking-wide text-rpg-gold">{t.label}</p>
            <p className="rpg-title text-xl font-bold leading-tight tabular-nums">{t.value}</p>
            {t.bar ? (
              <div className="mt-1 h-1.5 border border-rpg-border bg-rpg-bg">
                <div className={clsx("h-full", t.bar.cls)} style={{ width: `${t.bar.v}%` }} />
              </div>
            ) : (
              <p className="truncate text-[10.5px] text-rpg-muted">{t.caption}</p>
            )}
            {t.bar && <p className="truncate text-[10px] text-rpg-muted">{t.caption}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Oráculo ------------------------------ */

export function OraclePanel({ hub, onAction }: { hub: GrimoireHub; onAction: (a: NonNullable<OracleRec["action"]>) => void }) {
  const { explain } = useGrimoireHubActions();
  const ICON: Record<OracleRec["kind"], ReactNode> = {
    focus: <Star size={18} />,
    best_hour: <Zap size={18} />,
    reinforce: <Repeat size={18} />,
    neglected: <Clock size={18} />,
    diary: <BookOpen size={18} />,
    start: <Layers size={18} />,
  };
  return (
    <section className={PANEL} aria-label="Oráculo de estudos">
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={18} className="text-rpg-purple" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className={clsx(TITLE, "text-base")}>Oráculo de estudos</h2>
            <p className="text-[11px] text-rpg-muted">Recomendações pelas suas revisões reais.</p>
          </div>
          {hub.hasAi && (
            <span className="border border-rpg-purple/60 bg-rpg-purple/20 px-1.5 font-pixel text-[10px] text-rpg-purple" style={{ borderRadius: 2 }}>
              IA
            </span>
          )}
        </div>
        <ul className="space-y-1.5">
          {hub.oracle.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!o.action}
                onClick={() => o.action && onAction(o.action)}
                className="flex w-full items-start gap-2.5 border border-rpg-border/80 bg-rpg-bg-2/70 p-2 text-left hover:border-rpg-gold/60 disabled:cursor-default"
                style={{ borderRadius: 3 }}
              >
                <span className="mt-0.5 text-rpg-gold" aria-hidden>
                  {ICON[o.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 text-sm font-semibold text-rpg-gold-light">{o.title}</span>
                    <ProvTag kind={o.provenance} />
                  </span>
                  <span className="block text-[11px] text-rpg-text/80">{o.detail}</span>
                </span>
                {o.action && <ArrowRight size={14} className="mt-1 shrink-0 text-rpg-muted" aria-hidden />}
              </button>
            </li>
          ))}
          {hub.oracle.length === 0 && <li className="text-xs text-rpg-muted">Estude por alguns dias para o Oráculo encontrar padrões.</li>}
        </ul>
        {hub.hasAi && (
          <div className="mt-2">
            {explain.data ? (
              <div className="rpg-parchment p-3 text-xs leading-relaxed text-rpg-ink whitespace-pre-line">{explain.data.text}</div>
            ) : (
              <button type="button" onClick={() => explain.mutate()} disabled={explain.isPending} className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 text-xs">
                {explain.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Wand2 size={12} aria-hidden />} Pedir conselho ao Oráculo (IA)
              </button>
            )}
            {explain.isError && <p className="mt-1 text-[11px] text-rpg-red">{errorMessage(explain.error, "O Oráculo não respondeu agora.")}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ Fila automática ------------------------------ */

export function AutoQueuePanel({ hub, onReview, onRitual }: { hub: GrimoireHub; onReview: () => void; onRitual: () => void }) {
  const pending = hub.ritual.due + hub.ritual.fresh + hub.ritual.reinforce;
  const items = [
    hub.pendingSuggestions > 0 && { icon: <FileText size={15} />, label: `Aprovar ${hub.pendingSuggestions} cartão(ões) sugerido(s)`, tag: "Pendente", onClick: onReview },
    pending > 0 && { icon: <Repeat size={15} />, label: `Revisar ${pending} cartão(ões) de hoje`, tag: "Ritual", onClick: onRitual },
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string; tag: string; onClick: () => void }>;
  return (
    <section className={PANEL} aria-label="Fila automática de hoje">
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Clock size={17} className="text-rpg-gold" aria-hidden />
          <h2 className={clsx(TITLE, "flex-1 text-base")}>Fila de hoje</h2>
          <span className="text-[11px] text-rpg-muted">{items.length} ação(ões)</span>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-rpg-muted">Nada pendente. As automações ligadas adicionam itens aqui (cartões do Diário, importações).</p>
        ) : (
          <ul className="divide-y divide-rpg-border/60">
            {items.map((it, i) => (
              <li key={i}>
                <button type="button" onClick={it.onClick} className="flex w-full items-center gap-2 py-2 text-left text-sm text-rpg-text hover:text-rpg-gold-light">
                  <span className="text-rpg-muted" aria-hidden>
                    {it.icon}
                  </span>
                  <span className="min-w-0 flex-1">{it.label}</span>
                  <span className="border border-rpg-purple/60 bg-rpg-purple/20 px-1.5 text-[10px] text-rpg-purple" style={{ borderRadius: 999 }}>
                    {it.tag}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Explicação do fluxo automático (ilustrativa — não é dado do usuário). */
export function FlowExplainer() {
  const steps = [
    { icon: <FileText size={18} />, label: "Diário / PDF / Notas" },
    { icon: <Sparkles size={18} />, label: "Extração IA" },
    { icon: <Layers size={18} />, label: "Cartões" },
    { icon: <Check size={18} />, label: "Sua aprovação" },
    { icon: <Repeat size={18} />, label: "Revisão" },
  ];
  return (
    <section className={PANEL} aria-label="Como funciona o fluxo automático">
      <div className="p-4">
        <p className={clsx(TITLE, "mb-2 text-sm")}>
          Fluxo automático <span className="font-sans text-[10px] font-normal normal-case text-rpg-muted">(como funciona)</span>
        </p>
        <ol className="flex items-start justify-between gap-1">
          {steps.map((s, i) => (
            <li key={s.label} className="flex flex-1 items-start">
              <span className="flex flex-1 flex-col items-center text-center">
                <span className="flex h-10 w-10 items-center justify-center border-2 border-rpg-purple/60 bg-rpg-bg-2 text-rpg-purple" style={{ borderRadius: 4 }} aria-hidden>
                  {s.icon}
                </span>
                <span className="mt-1 text-[10px] leading-tight text-rpg-text/85">{s.label}</span>
              </span>
              {i < steps.length - 1 && <ArrowRight size={12} className="mt-3.5 shrink-0 text-rpg-gold" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------ Rodapé: feitiços, mapa e conquistas ------------------------------ */

const GRADE = ["Novamente", "Novamente", "Novamente", "Difícil", "Bom", "Fácil"];

export function RecentSpells({ hub }: { hub: GrimoireHub }) {
  const ago = (at: string) => {
    const min = Math.round((Date.now() - Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`)) / 60_000);
    if (min < 60) return `há ${Math.max(1, min)} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    return `há ${Math.round(min / 1440)} d`;
  };
  return (
    <section className={PANEL} aria-label="Feitiços recentes">
      <div className="p-4">
        <p className={clsx(TITLE, "mb-2 flex items-center gap-2 text-base")}>
          <Clock size={16} className="text-rpg-gold" aria-hidden /> Feitiços recentes
        </p>
        {hub.recent.length === 0 ? (
          <p className="text-xs text-rpg-muted">Suas últimas revisões aparecem aqui.</p>
        ) : (
          <ul className="divide-y divide-rpg-border/60">
            {hub.recent.slice(0, 5).map((r, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-rpg-text">{r.front}</span>
                  <span className="block truncate text-[10.5px] text-rpg-muted">
                    {r.deckName} · {ago(r.at)}
                  </span>
                </span>
                <span className={clsx("shrink-0 text-[10px] font-semibold", r.grade >= 3 ? "text-rpg-green" : "text-rpg-red")}>{GRADE[r.grade] ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function DomainMap({ hub, onOpen }: { hub: GrimoireHub; onOpen: (deckId: string) => void }) {
  return (
    <section className={PANEL} aria-label="Mapa de domínio">
      <div className="p-4">
        <p className={clsx(TITLE, "mb-2 flex items-center gap-2 text-base")}>
          <Shield size={16} className="text-rpg-gold" aria-hidden /> Mapa de domínio
        </p>
        {hub.domainMap.length === 0 ? (
          <p className="text-xs text-rpg-muted">Crie baralhos para mapear seu domínio por área.</p>
        ) : (
          <ul className="space-y-1.5">
            {hub.domainMap.slice(0, 6).map((d) => (
              <li key={d.deckId}>
                <button type="button" onClick={() => onOpen(d.deckId)} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2 text-left">
                  <span className="truncate text-sm text-rpg-text">{d.name}</span>
                  <span className="h-2.5 border border-rpg-border bg-rpg-bg">
                    <span className="block h-full bg-rpg-green shadow-[0_0_6px_rgb(var(--rpg-green)/0.6)]" style={{ width: `${d.pct ?? 0}%` }} />
                  </span>
                  <span className="w-10 text-right font-pixel text-xs tabular-nums text-rpg-text">{d.pct == null ? "—" : `${d.pct}%`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const ACH_ART = [`${HUB}/ach-book.webp`, `${HUB}/ach-crown.webp`, `${HUB}/ach-bolt.webp`, `${HUB}/ach-stack.webp`];

export function GrimoireAchievements({ hub, compact = false }: { hub: GrimoireHub; compact?: boolean }) {
  return (
    <section className={PANEL} aria-label="Conquistas do Grimório">
      <div className="p-4">
        <p className={clsx(TITLE, "mb-3 flex items-center gap-2 text-base")}>
          <Trophy size={16} className="text-rpg-gold" aria-hidden /> Conquistas do Grimório
        </p>
        <ul className={clsx("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
          {hub.achievements.map((a, i) => {
            const pct = Math.min(100, Math.round((a.value / Math.max(1, a.threshold)) * 100));
            const unlocked = !!a.unlockedAt;
            return (
              <li key={a.code} className="flex flex-col items-center text-center" title={a.description ?? undefined}>
                <img src={ACH_ART[i % ACH_ART.length]} alt="" aria-hidden loading="lazy" className={clsx("pixelated h-14 w-14 object-contain", !unlocked && "grayscale opacity-45")} />
                <span className={clsx("mt-1 text-[11px] font-semibold leading-tight", unlocked ? "text-rpg-gold-light" : "text-rpg-muted")}>{a.title}</span>
                <span className="text-[10px] text-rpg-muted tabular-nums">
                  {unlocked ? "Desbloqueada" : `${Math.min(a.value, a.threshold)}/${a.threshold}`}
                </span>
                {!unlocked && (
                  <span className="mt-0.5 h-1 w-full max-w-[80px] bg-rpg-bg">
                    <span className="block h-full bg-rpg-gold" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </li>
            );
          })}
          {hub.achievements.length === 0 && <li className="col-span-full text-xs text-rpg-muted">As conquistas de estudo aparecem após a próxima atualização do banco.</li>}
        </ul>
      </div>
    </section>
  );
}

/** Calendário de consistência (últimos 120 dias). */
export function ConsistencyCalendar({ hub }: { hub: GrimoireHub }) {
  const max = Math.max(1, ...hub.calendar.map((d) => d.reviews));
  const weeks = useMemo(() => {
    const out: Array<typeof hub.calendar> = [];
    for (let i = 0; i < hub.calendar.length; i += 7) out.push(hub.calendar.slice(i, i + 7));
    return out;
  }, [hub.calendar]);
  const level = (n: number) => (n === 0 ? "bg-rpg-bg" : n / max < 0.34 ? "bg-rpg-purple/40" : n / max < 0.67 ? "bg-rpg-purple/70" : "bg-rpg-gold");
  return (
    <section className={PANEL} aria-label="Calendário de consistência">
      <div className="p-4">
        <p className={clsx(TITLE, "mb-2 text-base")}>Calendário de consistência</p>
        <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={`Dias com revisão nos últimos 120 dias: ${hub.calendar.filter((d) => d.reviews > 0).length}`}>
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {w.map((d) => (
                <span key={d.day} className={clsx("h-3 w-3 border border-rpg-border/50", level(d.reviews))} title={`${d.day.split("-").reverse().join("/")}: ${d.reviews} revisões`} />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-rpg-muted">Cada quadrado é um dia; mais forte = mais revisões.</p>
      </div>
    </section>
  );
}

/* ------------------------------ Biblioteca Arcana (importações) ------------------------------ */

export function ArcaneLibrary({ onImport }: { onImport: () => void }) {
  const { data, isLoading, isError } = useGrimoireImports();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className={clsx(PANEL, "p-4")} aria-label="Biblioteca arcana">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Database size={18} className="text-rpg-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className={clsx(TITLE, "text-lg")}>Biblioteca arcana</h2>
          <p className="text-xs text-rpg-muted">Documentos e anotações importados, com o resumo gerado e os cartões sugeridos.</p>
        </div>
        <button type="button" onClick={onImport} className="rpg-btn rpg-btn-gold inline-flex items-center gap-1 text-xs">
          <Upload size={13} aria-hidden /> Importar
        </button>
      </div>
      {isLoading && <div className="h-24 animate-pulse rpg-panel" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar a biblioteca.</p>}
      {data && data.length === 0 && <p className="text-sm text-rpg-muted">Nenhuma importação ainda. Cole um texto ou envie um PDF para gerar resumo e cartões.</p>}
      <ul className="space-y-2">
        {(data ?? []).map((imp) => (
          <li key={imp.id} className="border border-rpg-border bg-rpg-bg-2/70 p-3" style={{ borderRadius: 3 }}>
            <button type="button" onClick={() => setOpen(open === imp.id ? null : imp.id)} className="flex w-full items-center gap-2 text-left" aria-expanded={open === imp.id}>
              <FileText size={16} className="shrink-0 text-rpg-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rpg-text">{imp.title}</span>
                <span className="block text-[11px] text-rpg-muted">
                  {imp.kind.toUpperCase()} · {new Date(imp.createdAt.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}
                  {imp.deckName ? ` · ${imp.deckName}` : ""}
                  {imp.summary?.cardsSuggested != null ? ` · ${imp.summary.cardsSuggested} cartões sugeridos` : ""}
                </span>
              </span>
              <span className={clsx("text-[10px] font-semibold", imp.status === "done" ? "text-rpg-green" : imp.status === "error" ? "text-rpg-red" : "text-rpg-orange")}>
                {imp.status === "done" ? "Concluída" : imp.status === "error" ? "Falhou" : "Processando"}
              </span>
            </button>
            {open === imp.id && (imp.summary ? <SummaryView summary={imp.summary} /> : <p className="mt-2 text-xs text-rpg-red">{imp.error ?? "Sem resumo."}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SummaryView({ summary }: { summary: ImportSummary }) {
  return (
    <div className="mt-2 space-y-2 border-t border-rpg-border/60 pt-2 text-sm">
      {summary.overview && <p className="text-rpg-text/90">{summary.overview}</p>}
      {summary.sections.map((s) => (
        <div key={s.title}>
          <p className="font-semibold text-rpg-gold-light">{s.title}</p>
          <ul className="ml-4 list-disc text-[13px] text-rpg-text/85">
            {s.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
      {summary.concepts.length > 0 && (
        <div>
          <p className="font-semibold text-rpg-gold-light">Conceitos-chave</p>
          <dl className="grid gap-1 sm:grid-cols-2">
            {summary.concepts.map((c) => (
              <div key={c.term} className="border border-rpg-border/60 p-1.5 text-[12px]" style={{ borderRadius: 3 }}>
                <dt className="font-semibold text-rpg-text">{c.term}</dt>
                <dd className="text-rpg-muted">{c.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {summary.questions.length > 0 && (
        <div>
          <p className="font-semibold text-rpg-gold-light">Perguntas para estudar</p>
          <ul className="ml-4 list-decimal text-[13px] text-rpg-text/85">
            {summary.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10.5px] text-rpg-muted">Resumo gerado pela IA a partir do seu documento — confira antes de usar.</p>
    </div>
  );
}

/* ------------------------------ Modais ------------------------------ */

/** Importar texto ou PDF → resumo + cartões sugeridos (vão para a fila de aprovação). */
export function ImportModal({ open, decks, onClose, onDone }: { open: boolean; decks: GrimoireDeck[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { importContent } = useGrimoireHubActions();
  const [kind, setKind] = useState<"text" | "pdf">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [deckId, setDeckId] = useState<string>("");
  const [pdf, setPdf] = useState<{ name: string; base64: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setText("");
    setPdf(null);
    setSummary(null);
    setFileError(null);
    importContent.reset();
  };

  const pickFile = (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    if (f.type !== "application/pdf") return setFileError("Envie um arquivo PDF.");
    if (f.size > 3 * 1024 * 1024) return setFileError("PDF muito grande (máx. 3 MB). Divida o arquivo ou cole o texto.");
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setPdf({ name: f.name, base64: result.replace(/^data:application\/pdf;base64,/, ""), size: f.size });
      if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
    };
    reader.onerror = () => setFileError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    const r = await importContent.mutateAsync({
      title: title.trim() || "Importação",
      kind,
      text: kind === "text" ? text : undefined,
      pdfBase64: kind === "pdf" ? pdf?.base64 : undefined,
      deckId: deckId || null,
    });
    setSummary(r.summary);
    onDone(`${r.suggested} cartão(ões) sugerido(s) — revise na fila de aprovação.`);
  };

  const canSubmit = kind === "text" ? text.trim().length >= 80 : !!pdf;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Importar anotações"
    >
      {summary ? (
        <div>
          <p className="text-sm text-rpg-green">Importação concluída. Os cartões sugeridos estão na fila de aprovação.</p>
          <SummaryView summary={summary} />
          <button type="button" className="rpg-btn rpg-btn-secondary mt-3" onClick={reset}>
            Importar outro
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div role="tablist" aria-label="Tipo de conteúdo" className="inline-flex border border-rpg-border p-0.5" style={{ borderRadius: 4 }}>
            {(["text", "pdf"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={clsx("px-3 py-1 text-xs font-semibold", kind === k ? "bg-rpg-gold/20 text-rpg-gold-light" : "text-rpg-muted")}>
                {k === "text" ? "Colar texto" : "Enviar PDF"}
              </button>
            ))}
          </div>
          <label className="block text-xs text-rpg-muted">
            Título
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1 w-full border border-rpg-border bg-rpg-bg px-3 py-2 text-sm text-rpg-text" style={{ borderRadius: 3 }} placeholder="Ex.: Capítulo 3 — Redes neurais" />
          </label>
          {kind === "text" ? (
            <label className="block text-xs text-rpg-muted">
              Conteúdo ({text.length.toLocaleString("pt-BR")}/40.000)
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 40_000))} rows={8} className="mt-1 w-full border border-rpg-border bg-rpg-bg px-3 py-2 text-sm text-rpg-text" style={{ borderRadius: 3 }} placeholder="Cole aqui suas anotações, um artigo ou trecho de livro…" />
            </label>
          ) : (
            <div>
              <input ref={fileRef} type="file" accept="application/pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-1 border-2 border-dashed border-rpg-border p-6 text-sm text-rpg-muted hover:border-rpg-gold" style={{ borderRadius: 4 }}>
                <Upload size={22} aria-hidden />
                {pdf ? `${pdf.name} (${Math.round(pdf.size / 1024)} KB)` : "Escolher PDF (até 3 MB)"}
              </button>
              {fileError && <p className="mt-1 text-xs text-rpg-red">{fileError}</p>}
            </div>
          )}
          <label className="block text-xs text-rpg-muted">
            Baralho de destino (opcional — pode escolher na aprovação)
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="mt-1 w-full border border-rpg-border bg-rpg-bg px-2 py-2 text-sm text-rpg-text" style={{ borderRadius: 3 }}>
              <option value="">Decidir depois</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-rpg-muted">O conteúdo é enviado ao Gemini configurado no LifeOS só para este processamento. Instruções dentro do documento são ignoradas.</p>
          {importContent.isError && <p className="text-xs text-rpg-red" role="alert">{errorMessage(importContent.error, "Falha ao importar.")}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rpg-btn rpg-btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="rpg-btn rpg-btn-gold inline-flex items-center gap-1.5" disabled={!canSubmit || importContent.isPending} onClick={() => void submit()}>
              {importContent.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              {importContent.isPending ? "Extraindo e resumindo…" : "Importar e gerar cartões"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Aprovação das sugestões (edição inline, escolha do baralho, aprovar/rejeitar em lote). */
export function SuggestionsModal({ open, decks, onClose, onDone }: { open: boolean; decks: GrimoireDeck[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { data, isLoading } = useGrimoireSuggestions();
  const { decide } = useGrimoireHubActions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { front: string; back: string }>>({});
  const [deckId, setDeckId] = useState("");
  const list = data ?? [];
  const allIds = list.map((s) => s.id);
  const chosen = selected.size > 0 ? [...selected] : allIds;
  const needsDeck = list.filter((s) => chosen.includes(s.id)).some((s) => !s.deckId) && !deckId;

  const run = async (mode: "approve" | "reject") => {
    const r = await decide.mutateAsync(
      mode === "approve"
        ? { approve: chosen.map((id) => ({ id, ...(edits[id] ?? {}) })), reject: [], deckId: deckId || null }
        : { approve: [], reject: chosen },
    );
    setSelected(new Set());
    onDone(mode === "approve" ? `${r.created} cartão(ões) adicionados.` : `${r.rejected} sugestão(ões) descartada(s).`);
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Cartões sugeridos — aprovação">
      {isLoading && <p className="text-sm text-rpg-muted">Carregando…</p>}
      {!isLoading && list.length === 0 && <p className="text-sm text-rpg-muted">Nenhuma sugestão pendente.</p>}
      {list.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 text-rpg-text">
              <input type="checkbox" checked={selected.size === list.length} onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())} /> Selecionar todas
            </label>
            <span className="text-rpg-muted">{selected.size > 0 ? `${selected.size} selecionada(s)` : `Ação vale para as ${list.length}`}</span>
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="ml-auto border border-rpg-border bg-rpg-bg px-2 py-1 text-xs text-rpg-text" style={{ borderRadius: 3 }} aria-label="Baralho de destino">
              <option value="">Baralho sugerido</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {list.map((s) => {
              const e = edits[s.id] ?? { front: s.front, back: s.back };
              return (
                <li key={s.id} className={clsx("border p-2.5", selected.has(s.id) ? "border-rpg-gold" : "border-rpg-border")} style={{ borderRadius: 3 }}>
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-rpg-muted">
                    <input
                      type="checkbox"
                      aria-label="Selecionar sugestão"
                      checked={selected.has(s.id)}
                      onChange={() =>
                        setSelected((cur) => {
                          const n = new Set(cur);
                          if (n.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        })
                      }
                    />
                    <span className="truncate">
                      {s.sourceKind === "journal" ? "Diário" : "Importação"} · {s.sourceLabel ?? s.sourceRef}
                      {s.deckName ? ` → ${s.deckName}` : ""}
                    </span>
                    <span className="ml-auto border border-rpg-gold/50 px-1 font-pixel text-[9px] uppercase text-rpg-gold-light" style={{ borderRadius: 2 }}>
                      sugestão da IA
                    </span>
                  </div>
                  <input
                    value={e.front}
                    onChange={(ev) => setEdits((x) => ({ ...x, [s.id]: { ...e, front: ev.target.value } }))}
                    className="w-full border border-rpg-border bg-rpg-bg px-2 py-1 text-sm font-semibold text-rpg-text"
                    style={{ borderRadius: 3 }}
                    aria-label="Frente do cartão"
                  />
                  <textarea
                    value={e.back}
                    onChange={(ev) => setEdits((x) => ({ ...x, [s.id]: { ...e, back: ev.target.value } }))}
                    rows={2}
                    className="mt-1 w-full border border-rpg-border bg-rpg-bg px-2 py-1 text-sm text-rpg-text/90"
                    style={{ borderRadius: 3 }}
                    aria-label="Verso do cartão"
                  />
                </li>
              );
            })}
          </ul>
          {needsDeck && <p className="text-xs text-rpg-orange">Algumas sugestões não têm baralho — escolha um destino acima.</p>}
          {decide.isError && <p className="text-xs text-rpg-red">{errorMessage(decide.error, "Não foi possível concluir.")}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="rpg-btn rpg-btn-danger inline-flex items-center gap-1" disabled={decide.isPending} onClick={() => void run("reject")}>
              <X size={14} aria-hidden /> Descartar
            </button>
            <button type="button" className="rpg-btn rpg-btn-gold inline-flex items-center gap-1" disabled={decide.isPending || needsDeck} onClick={() => void run("approve")}>
              {decide.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />} Aprovar e adicionar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
