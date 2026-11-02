import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Bot, CheckCircle2, Circle, HelpCircle, Info, Lightbulb, Lock, Sparkles, X } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import { useAdvisor } from "@/hooks/useModuleHub";
import { useAchievements } from "@/hooks/useAchievements";
import type { AdvisorModule, HubMission, HubRank } from "@/services/moduleHubService";

/**
 * Kit visual compartilhado pelas telas RPG de Banco, Educação e Saúde —
 * mesmo banner, painel de rank, cards de indicador, missões, conselheiro e
 * medalhas, para as três telas parecerem partes do mesmo produto.
 */

export const MODULE_ART = "/assets/rpg/modules";
const R = { borderRadius: 4 } as const;

export function ModuleBanner({
  eyebrow,
  title,
  subtitle,
  mage,
  scene,
  aside,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  mage: string;
  scene: string;
  aside?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
      <header className="relative min-h-[150px] overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2" style={R}>
        {/* Cenário à direita, esmaecendo para a esquerda (legibilidade do título). */}
        <img src={scene} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-90 sm:w-3/4" />
        <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-transparent" aria-hidden />
        <div className="relative flex h-full items-center gap-3 p-3 sm:p-4">
          <img src={mage} alt="" aria-hidden className="pixelated hidden h-[120px] w-auto shrink-0 sm:block" />
          <div className="min-w-0">
            <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">★ {eyebrow} ★</p>
            <h1 className="rpg-title text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            <p className="mt-1 max-w-md text-sm text-rpg-text/90">{subtitle}</p>
            {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
          </div>
        </div>
      </header>
      {aside}
    </div>
  );
}

/** Painel de rank do módulo. A regra de cálculo fica sempre acessível no "?". */
export function RankPanel({
  title,
  subtitle,
  rank,
  valueLabel,
  unit,
  rules,
  icon,
}: {
  title: string;
  subtitle: string;
  rank: HubRank;
  valueLabel: number;
  unit: string;
  rules: ReactNode;
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rpg-panel rpg-panel-gold relative p-3" aria-label={title}>
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-rpg-gold bg-rpg-purple/25 text-rpg-gold-light" style={R} aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="rpg-title truncate text-sm font-bold uppercase">{title}</p>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-rpg-muted hover:text-rpg-gold-light"
              aria-expanded={open}
              aria-label={`Como o ${title} é calculado`}
            >
              <HelpCircle size={15} />
            </button>
          </div>
          <p className="truncate text-sm text-rpg-text">{rank.title}</p>
          <p className="font-pixel text-[10px] text-rpg-muted">{subtitle}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-pixel text-xs text-rpg-gold">Nv. {rank.level}</span>
        <RPGProgressBar className="flex-1" value={Math.max(0, Math.min(100, rank.pct))} tone="purple" label={`Progresso para ${rank.next?.title ?? "o rank máximo"}`} showLabel={false} />
      </div>
      <p className="mt-1 text-right font-pixel text-[11px] text-rpg-text tabular-nums">
        {valueLabel} / {rank.next ? `${rank.next.min} ${unit}` : `${unit} · rank máximo`}
        {rank.next && <span className="block text-[10px] text-rpg-muted">Próximo: {rank.next.title}</span>}
      </p>
      {open && (
        <div className="mt-2 border border-rpg-border bg-rpg-bg/80 p-2 text-[11px] leading-relaxed text-rpg-muted" style={R}>
          {rules}
        </div>
      )}
    </section>
  );
}

const TONE_BORDER = {
  gold: "border-rpg-gold/60",
  blue: "border-rpg-blue/60",
  purple: "border-rpg-purple/60",
  green: "border-rpg-green/60",
  orange: "border-rpg-orange/60",
  pink: "border-rpg-pink/60",
  red: "border-rpg-red/60",
} as const;
const TONE_TEXT = {
  gold: "text-rpg-gold-light",
  blue: "text-rpg-blue",
  purple: "text-rpg-purple",
  green: "text-rpg-green",
  orange: "text-rpg-orange",
  pink: "text-rpg-pink",
  red: "text-rpg-red",
} as const;
export type KitTone = keyof typeof TONE_BORDER;

export function IndicatorCard({ icon, label, value, hint, tone = "gold", title }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: KitTone; title?: string }) {
  return (
    <div className={clsx("flex min-w-0 items-center gap-2.5 border-2 bg-rpg-panel p-2.5", TONE_BORDER[tone])} style={R} title={title}>
      <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center", TONE_TEXT[tone])} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate font-pixel text-[10px] uppercase text-rpg-muted">{label}</p>
        <p className="truncate font-rpg text-xl font-bold leading-tight text-rpg-text tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-rpg-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function KitSection({
  title,
  icon,
  action,
  children,
  className,
  tone,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "gold" | "legendary";
}) {
  return (
    <section className={clsx("rpg-panel min-w-0 p-3", tone === "gold" && "rpg-panel-gold", tone === "legendary" && "rpg-panel-legendary", className)} aria-label={title}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-rpg-gold" aria-hidden>
          {icon}
        </span>
        <h2 className="rpg-title min-w-0 flex-1 truncate text-sm font-bold uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Abas do módulo (rolam na horizontal no celular, sem estourar a largura). */
export function ModuleTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ value: T; label: string; icon: ReactNode; badge?: number }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "relative inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 border-2 px-3 text-sm font-semibold transition-colors",
            value === t.value ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light shadow-[0_0_14px_-4px_rgb(var(--rpg-gold)/0.7)]" : "border-rpg-border bg-rpg-bg-2/70 text-rpg-muted hover:text-rpg-text",
          )}
          style={R}
        >
          {t.icon} {t.label}
          {!!t.badge && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rpg-red px-1 font-pixel text-[9px] text-white" aria-label={`${t.badge} pendente(s)`}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function MissionList({ missions, empty = "Nenhuma missão agora.", format }: { missions: HubMission[]; empty?: string; format?: (m: HubMission) => string }) {
  if (missions.length === 0) return <p className="text-sm text-rpg-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {missions.map((m) => (
        <li key={m.key} className="flex items-start gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
          {m.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-rpg-green" aria-label="Concluída" /> : <Circle size={18} className="mt-0.5 shrink-0 text-rpg-muted" aria-label="Pendente" />}
          <div className="min-w-0 flex-1">
            <p className={clsx("text-sm font-semibold", m.done ? "text-rpg-green" : "text-rpg-text")}>{m.title}</p>
            <p className="text-[11px] text-rpg-muted">{m.description}</p>
            <div className="mt-1 flex items-center gap-2">
              <RPGProgressBar className="flex-1" value={m.current} max={Math.max(1, m.target)} tone={m.done ? "green" : "purple"} label={m.title} showLabel={false} />
              <span className="shrink-0 font-pixel text-[10px] text-rpg-muted tabular-nums">{format ? format(m) : `${m.current}/${m.target}`}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const KIND_UI = {
  dado: { label: "Dado real", cls: "border-rpg-blue/60 text-rpg-blue", icon: Info },
  inferencia: { label: "Inferência", cls: "border-rpg-purple/60 text-rpg-purple", icon: Lightbulb },
  sugestao: { label: "Sugestão", cls: "border-rpg-green/60 text-rpg-green", icon: Sparkles },
} as const;

/** Conselheiro do módulo: leitura determinística + IA opcional; nunca executa ações. */
export function AdvisorPanel({ module, title, avatar, research }: { module: AdvisorModule; title: string; avatar: string; research?: boolean }) {
  const advisor = useAdvisor(module);
  const [question, setQuestion] = useState("");
  const data = advisor.data;
  const ask = (useAi: boolean, asResearch = false) => advisor.mutate({ useAi, question: question.trim() || undefined, research: asResearch || undefined });
  return (
    <section className="rpg-panel rpg-panel-legendary min-w-0 p-3" aria-label={title}>
      <div className="mb-2 flex items-center gap-2.5">
        <img src={avatar} alt="" aria-hidden className="pixelated h-12 w-12 shrink-0 border border-rpg-gold/60 object-cover" style={R} />
        <div className="min-w-0">
          <h2 className="rpg-title truncate text-sm font-bold uppercase">{title}</h2>
          <p className="text-[11px] text-rpg-muted">Lê só os seus registros. Não altera nada sem você.</p>
        </div>
      </div>
      {!data && !advisor.isPending && (
        <button type="button" className="rpg-btn rpg-btn-secondary mb-2 w-full text-sm" onClick={() => ask(false)}>
          <Bot size={15} aria-hidden /> Ver leitura dos meus dados
        </button>
      )}
      {advisor.isPending && <div className="mb-2 h-24 animate-pulse border border-rpg-border bg-rpg-bg-2" style={R} aria-busy aria-label="Consultando o conselheiro" />}
      {advisor.isError && (
        <p className="mb-2 text-xs text-rpg-red" role="alert">
          {advisor.error instanceof Error ? advisor.error.message : "O conselheiro não respondeu."}
        </p>
      )}
      {data && !advisor.isPending && (
        <div className="mb-2 space-y-1.5" aria-live="polite">
          {data.insufficient && (
            <p className="border border-rpg-orange/60 bg-rpg-orange/10 p-1.5 text-[11px] text-rpg-orange" style={R}>
              Ainda há poucos registros — as conclusões são limitadas.
            </p>
          )}
          <ul className="space-y-1.5">
            {data.items.map((it, i) => {
              const k = KIND_UI[it.kind];
              const Icon = k.icon;
              return (
                <li key={i} className="flex gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 p-2 text-[12.5px] text-rpg-text" style={R}>
                  <span className={clsx("mt-0.5 inline-flex h-fit shrink-0 items-center gap-0.5 border px-1 font-pixel text-[9px] uppercase", k.cls)} style={{ borderRadius: 2 }}>
                    <Icon size={9} aria-hidden /> {k.label}
                  </span>
                  <span className="min-w-0">{it.text}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-rpg-muted">
            {data.ai ? "Organizado pela IA a partir dos seus dados." : "Calculado diretamente dos seus dados (sem IA)."} {data.disclaimer}
          </p>
        </div>
      )}
      <label className="sr-only" htmlFor={`advisor-q-${module}`}>
        Pergunta ao conselheiro
      </label>
      <div className="flex gap-1.5">
        <input
          id={`advisor-q-${module}`}
          value={question}
          maxLength={400}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte algo (opcional)"
          className="min-h-[44px] min-w-0 flex-1 border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
          style={R}
        />
        {question && (
          <button type="button" onClick={() => setQuestion("")} className="flex h-11 w-9 items-center justify-center text-rpg-muted" aria-label="Limpar pergunta">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <button type="button" className="rpg-btn rpg-btn-primary inline-flex items-center justify-center gap-1 text-sm" onClick={() => ask(true)} disabled={advisor.isPending}>
          <Sparkles size={14} aria-hidden /> Perguntar à IA
        </button>
        {research ? (
          <button type="button" className="rpg-btn rpg-btn-secondary inline-flex items-center justify-center gap-1 text-sm" onClick={() => ask(true, true)} disabled={advisor.isPending}>
            <Lightbulb size={14} aria-hidden /> Assistente de pesquisa
          </button>
        ) : (
          <button type="button" className="rpg-btn rpg-btn-secondary inline-flex items-center justify-center gap-1 text-sm" onClick={() => ask(false)} disabled={advisor.isPending}>
            <Bot size={14} aria-hidden /> Atualizar leitura
          </button>
        )}
      </div>
    </section>
  );
}

/** Medalhas ligadas ao catálogo real de conquistas (o desbloqueio vem do backend). */
export function MedalStrip({ medals }: { medals: Array<{ code: string; img: string; fallbackTitle: string }> }) {
  const { achievements, isLoading } = useAchievements(false);
  const byCode = new Map(achievements.map((a) => [a.code, a]));
  return (
    <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 lg:grid-cols-5" aria-busy={isLoading}>
      {medals.map((m) => {
        const a = byCode.get(m.code);
        const unlocked = !!a?.unlockedAt;
        return (
          <li key={m.code} className="flex flex-col items-center text-center" title={a?.description ?? undefined}>
            <div className="relative">
              <img src={m.img} alt="" aria-hidden className={clsx("pixelated h-14 w-14 object-contain", !unlocked && "opacity-45 grayscale")} />
              {!unlocked && <Lock size={14} className="absolute bottom-0 right-0 text-rpg-muted" aria-hidden />}
            </div>
            <p className={clsx("mt-1 text-xs font-semibold leading-tight", unlocked ? "text-rpg-gold-light" : "text-rpg-text")}>{a?.title ?? m.fallbackTitle}</p>
            <p className="text-[10.5px] leading-tight text-rpg-muted">
              {unlocked ? "Desbloqueada" : a && a.threshold != null ? `${Math.min(a.currentValue ?? 0, a.threshold)}/${a.threshold}` : "Bloqueada"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
