import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bar, CartesianGrid, ComposedChart, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Briefcase,
  CheckSquare,
  Coins,
  Compass,
  Crown,
  Flame,
  Gem,
  GitBranch,
  GraduationCap,
  Hammer,
  Heart,
  LayoutGrid,
  Lock,
  Map as MapIcon,
  Pencil,
  Play,
  Repeat,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Wand2,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGPortrait, RPGProgressBar, RPGToast } from "@/components/rpg";
import { rpgColor } from "@/components/rpg/rpgAssets";
import { IndicatorCard, KitSection, MODULE_ART, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { DEFAULT_QUOTE, findNavItem } from "@/components/layout/navConfig";
import { useUrlTab } from "@/components/hero/HeroShared";
import { useAdvisor } from "@/hooks/useModuleHub";
import { useHeroDashboard, useTodayActions } from "@/hooks/useDayHero";
import type { HeroDashboard as Hub } from "@/services/dayHeroService";
import { itemArtUrl, artFit } from "@/utils/inventoryDisplay";

const ART = `${MODULE_ART}/herodash`;
const R = { borderRadius: 4 } as const;
const nf = (n: number) => n.toLocaleString("pt-BR");
const DIM_ICON: Record<string, JSX.Element> = { productivity: <CheckSquare size={15} />, health: <Heart size={15} />, habits: <Repeat size={15} />, goals: <Target size={15} />, reading: <BookOpen size={15} />, education: <GraduationCap size={15} />, professional: <Briefcase size={15} /> };
const DIM_TONE: Record<string, "blue" | "green" | "cyan" | "orange" | "pink" | "purple"> = { productivity: "blue", health: "green", habits: "cyan", goals: "orange", reading: "pink", education: "purple", professional: "purple" };
const DIM_TEXT: Record<string, string> = { productivity: "text-rpg-blue", health: "text-rpg-green", habits: "text-rpg-cyan", goals: "text-rpg-orange", reading: "text-rpg-pink", education: "text-rpg-purple", professional: "text-rpg-purple" };
const TIER_TONE: Record<string, "muted" | "green" | "gold" | "purple"> = { bronze: "muted", silver: "green", gold: "gold", platinum: "purple" };
const TIER_LABEL: Record<string, string> = { bronze: "Bronze", silver: "Prata", gold: "Ouro", platinum: "Platina" };

/* ═══════════════════════════════ Banner ═══════════════════════════════ */

export function HeroBanner({ hub }: { hub: Hub }) {
  const h = hub.hero;
  const quote = findNavItem("/dashboard")?.item.quote ?? DEFAULT_QUOTE;
  return (
    <header className="relative overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2" style={R}>
      <img src={`${ART}/banner-scene.webp`} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-80 sm:w-2/3" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-rpg-bg/30" aria-hidden />
      <div className="relative grid gap-3 p-3 sm:p-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,320px)] lg:items-center">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <RPGPortrait size="xl" className="hidden sm:block" />
            <RPGPortrait size="lg" className="sm:hidden" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-2 border-rpg-gold bg-rpg-bg px-2 font-pixel text-[11px] text-rpg-gold-light" style={R}>
              Nv. {h.level}
            </span>
          </div>
          <div className="min-w-0 lg:hidden">
            <p className="rpg-title truncate text-2xl font-bold">{h.name}</p>
            <p className="text-sm text-rpg-gold-light">{h.archetype?.name ?? "Build em formação"}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="rpg-title hidden text-3xl font-bold leading-tight lg:block">{h.name}</p>
          <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-muted">Arquétipo atual</p>
          <p className="flex flex-wrap items-center gap-2 font-rpg text-xl font-bold text-rpg-gold-light">
            {h.archetype?.name ?? "Build em formação"}
            {h.archetype?.tags.slice(0, 3).map((t) => (
              <RPGBadge key={t} tone="purple">
                {t}
              </RPGBadge>
            ))}
          </p>
          <p className="mt-1.5 inline-block border border-rpg-gold/40 bg-rpg-bg/60 px-3 py-1 text-sm italic text-rpg-text/90" style={R}>
            “{quote}”
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link to="/perfil?aba=custom" className="inline-flex min-h-[32px] items-center gap-1 border border-rpg-border px-2 text-[11px] text-rpg-text hover:border-rpg-gold" style={R}>
              <Pencil size={11} aria-hidden /> Avatar e aparência
            </Link>
            <Link to="/codex" className="inline-flex min-h-[32px] items-center gap-1 border border-rpg-border px-2 text-[11px] text-rpg-text hover:border-rpg-gold" style={R}>
              <Crown size={11} aria-hidden /> Títulos
            </Link>
            <Link to="/build" className="inline-flex min-h-[32px] items-center gap-1 border border-rpg-border px-2 text-[11px] text-rpg-text hover:border-rpg-gold" style={R}>
              <Compass size={11} aria-hidden /> Classe e arquétipo
            </Link>
            <Link to="/perfil" className="inline-flex min-h-[32px] items-center gap-1 border border-rpg-border px-2 text-[11px] text-rpg-text hover:border-rpg-gold" style={R}>
              Perfil completo
            </Link>
          </div>
        </div>
        <div className="space-y-2 border-t border-rpg-border/60 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Progresso de nível</p>
            <p className="font-pixel text-[11px] text-rpg-purple tabular-nums">
              {nf(h.xpIntoLevel)} / {nf(h.xpForNextLevel)} XP
            </p>
          </div>
          <RPGProgressBar label="XP do nível" showLabel={false} value={h.xpIntoLevel} max={Math.max(1, h.xpForNextLevel)} tone="purple" />
          <p className="text-[11px] text-rpg-muted">
            Faltam {nf(Math.max(0, h.xpForNextLevel - h.xpIntoLevel))} XP para o nível {h.level + 1} · {nf(h.totalXp)} XP total
          </p>
          <div className="flex items-center gap-2 border border-rpg-gold/40 bg-rpg-bg/60 p-2" style={R}>
            <Crown size={22} className="shrink-0 text-rpg-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase text-rpg-muted">Título atual</p>
              <p className="truncate font-semibold text-rpg-text">{h.title?.name ?? "Nenhum título equipado"}</p>
            </div>
            <Link to="/codex" className="text-[11px] text-rpg-blue hover:underline">
              Trocar
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════ Status e atributos ═══════════════════════════════ */

const STATUS_BORDER = { purple: "border-rpg-purple/60", gold: "border-rpg-gold/60", pink: "border-rpg-pink/60", orange: "border-rpg-orange/60", green: "border-rpg-green/60", blue: "border-rpg-blue/60", red: "border-rpg-red/60" } as const;
const STATUS_TEXT = { purple: "text-rpg-purple", gold: "text-rpg-gold", pink: "text-rpg-pink", orange: "text-rpg-orange", green: "text-rpg-green", blue: "text-rpg-blue", red: "text-rpg-red" } as const;

export function HeroStatus({ hub }: { hub: Hub }) {
  const s = hub.status;
  const cards = [
    { to: "/timeline", icon: <Zap size={22} />, label: "XP hoje", value: `+${nf(s.xpToday)}`, tone: "purple" as const },
    { to: "/tesouro", icon: <Coins size={22} />, label: "Moedas", value: nf(s.coins), tone: "gold" as const },
    { to: "/tesouro?aba=bau", icon: <Gem size={22} />, label: "Gemas", value: nf(s.gems), tone: "pink" as const },
    { to: "/conquistas", icon: <Trophy size={22} />, label: "Conquistas", value: `${s.achievements.unlocked}/${s.achievements.total}`, tone: "orange" as const },
    { to: "/habitos", icon: <Repeat size={22} />, label: "Hábitos ativos", value: s.habitsActive, tone: "green" as const },
    { to: "/tarefas", icon: <Swords size={22} />, label: "Missões abertas", value: s.missionsOpen, tone: "blue" as const },
    { to: "/hoje", icon: <BarChart3 size={22} />, label: "Life Score", value: `${s.lifeScore}/100`, tone: "purple" as const },
    { to: "/timeline", icon: <Flame size={22} />, label: "Sequência", value: `${s.streakDays} dias`, tone: "red" as const },
  ];
  // Ficha compacta: no desktop o Status divide a linha com Atributos e Radar (1/3
  // da largura), então usa 2 colunas e rótulo em até 2 linhas — nada é cortado.
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
      {cards.map((c) => (
        <Link
          key={c.label}
          to={c.to}
          className={`flex min-w-0 items-center gap-2 border-2 bg-rpg-panel px-2 py-2 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold ${STATUS_BORDER[c.tone]}`}
          style={{ borderRadius: 4 }}
          aria-label={`${c.label}: ${c.value}`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px] ${STATUS_TEXT[c.tone]}`} aria-hidden>
            {c.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block font-pixel text-[9px] uppercase leading-tight text-rpg-muted">{c.label}</span>
            <span className="block break-words font-rpg text-base font-bold leading-tight text-rpg-text tabular-nums">{c.value}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function AttributesPanel({ hub, detailed }: { hub: Hub; detailed?: boolean }) {
  const [open, setOpen] = useState<Hub["attributes"][number] | null>(null);
  return (
    <KitSection title="Atributos do herói" icon={<Sparkles size={16} />} action={<span className="text-[10px] text-rpg-muted">indicadores do Life Score</span>}>
      <ul className="space-y-1.5">
        {hub.attributes.map((a) => (
          <li key={a.key}>
            <button type="button" onClick={() => setOpen(a)} className="flex w-full items-center gap-2 text-left hover:brightness-110" aria-label={`${a.label}: ${a.value} de 100 — ver detalhes`}>
              <span className={DIM_TEXT[a.key]} aria-hidden>
                {DIM_ICON[a.key]}
              </span>
              <span className="w-24 shrink-0 truncate text-sm text-rpg-text">{a.label}</span>
              <RPGProgressBar className="flex-1" label={a.label} showLabel={false} value={a.value} max={100} tone={DIM_TONE[a.key]} />
              <span className="w-8 shrink-0 text-right font-pixel text-[11px] text-rpg-text tabular-nums">{a.value}</span>
              {detailed && <span className={clsx("w-12 shrink-0 text-right text-[10px] tabular-nums", a.delta == null ? "text-rpg-muted" : a.delta >= 0 ? "text-rpg-green" : "text-rpg-red")}>{a.delta == null ? "—" : `${a.delta >= 0 ? "+" : ""}${a.delta}`}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-rpg-muted">Escala 0–100 do Life Score de hoje. Diferente dos atributos de progressão da Build (Conhecimento, Disciplina…).</p>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.label ?? ""} size="sm">
        {open && (
          <div className="space-y-2 text-sm">
            <p className="text-rpg-text">
              Hoje: <strong>{open.value}/100</strong> · média do período: {open.periodAvg ?? "sem histórico"} · período anterior: {open.previousAvg ?? "sem histórico"}
            </p>
            <p className="text-xs text-rpg-muted">Origem: {open.source}.</p>
            {open.series.filter((p) => p.value != null).length > 1 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={open.series}>
                    <XAxis dataKey="day" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip contentStyle={{ background: "#14122b", border: "1px solid #6b5a2e", fontSize: 12 }} />
                    <Line type="monotone" dataKey="value" stroke={rpgColor("purple")} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-rpg-muted">Histórico insuficiente: os snapshots diários são gravados quando o Life Score é calculado.</p>
            )}
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

export function BalanceRadar({ hub, period, onPeriod }: { hub: Hub; period: string; onPeriod: (p: string) => void }) {
  const rows = hub.attributes.map((a) => ({ dim: a.label, atual: hub.radar.current[a.key] ?? hub.radar.today[a.key] ?? 0, anterior: hub.radar.previous[a.key] ?? 0 }));
  const hasPrev = Object.values(hub.radar.previous).some((v) => v != null);
  return (
    <KitSection
      title="Perfil de equilíbrio"
      icon={<Compass size={16} />}
      action={
        <select aria-label="Período do radar" className="min-h-[32px] border border-rpg-border bg-rpg-bg-2 px-1.5 text-xs text-rpg-text" style={R} value={period} onChange={(e) => onPeriod(e.target.value)}>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="90d">90 dias</option>
          <option value="365d">Ano</option>
        </select>
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="70%">
            <PolarGrid stroke="rgb(var(--rpg-border))" />
            <PolarAngleAxis dataKey="dim" tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {hasPrev && <Radar name="Período anterior" dataKey="anterior" stroke={rpgColor("gold")} fill={rpgColor("gold")} fillOpacity={0.06} strokeWidth={1.5} isAnimationActive={false} />}
            <Radar name="Atual" dataKey="atual" stroke={rpgColor("purple")} fill={rpgColor("purple")} fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
            <Tooltip contentStyle={{ background: "#14122b", border: "1px solid #6b5a2e", fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-rpg-muted">
        Roxo: média do período ({hub.radar.snapshots} dia(s) com snapshot{hub.radar.snapshots ? "" : " — usando hoje"}). Dourado: período anterior{hasPrev ? "" : " (sem histórico)"}. Dimensão sem dado aparece como 0, sem extrapolar.
      </p>
    </KitSection>
  );
}

/* ═══════════════════════════════ Arquétipo, missão, evoluções ═══════════════════════════════ */

export function ArchetypeCards({ hub }: { hub: Hub }) {
  const a = hub.hero.archetype;
  const recent = hub.recentAchievements[0];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <KitSection title="Arquétipo atual" icon={<Compass size={16} />}>
        {a ? (
          <div className="flex items-start gap-2">
            <img src={`/assets/rpg/avatars/${a.avatar}.webp`} alt="" aria-hidden className="pixelated h-14 w-12 shrink-0 border-2 border-rpg-purple object-cover" style={R} />
            <div className="min-w-0">
              <p className="font-rpg font-bold text-rpg-text">{a.name}</p>
              <p className="line-clamp-2 text-[11px] text-rpg-muted">{a.description}</p>
              <RPGProgressBar className="mt-1" label={`Afinidade (${a.affinity}%)`} value={a.affinity} max={100} tone="purple" />
              {a.secondary && <p className="mt-0.5 text-[10px] text-rpg-muted">Próximo: {a.secondary.name} ({a.secondary.affinity}%)</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-rpg-muted">A Build ainda está sendo formada — registre atividades por alguns dias.</p>
        )}
        <Link to="/build" className="mt-1 inline-flex min-h-[32px] items-center text-xs text-rpg-blue hover:underline">
          Abrir a Build →
        </Link>
      </KitSection>
      <KitSection title="Próximo marco" icon={<Crown size={16} />}>
        <p className="font-rpg text-lg font-bold text-rpg-text">Nível {hub.hero.level + 1}</p>
        <p className="text-[11px] text-rpg-muted">{hub.journey.next ? `Próximo título por nível: ${hub.journey.next.name} (nível ${hub.journey.next.minLevel}).` : "Todos os títulos por nível já conquistados."}</p>
        <RPGProgressBar className="mt-1" label="XP" value={hub.hero.xpIntoLevel} max={Math.max(1, hub.hero.xpForNextLevel)} valueLabel={`${nf(Math.max(0, hub.hero.xpForNextLevel - hub.hero.xpIntoLevel))} XP restantes`} tone="gold" />
      </KitSection>
      <KitSection title="Conquista em destaque" icon={<Trophy size={16} />}>
        {recent ? (
          <>
            <p className="font-rpg font-bold text-rpg-text">{recent.title}</p>
            <RPGBadge tone={TIER_TONE[recent.tier] ?? "muted"}>{TIER_LABEL[recent.tier] ?? recent.tier}</RPGBadge>
            <p className="mt-1 text-[11px] text-rpg-green">Desbloqueada em {recent.unlockedAt ? new Date(recent.unlockedAt.includes("T") ? recent.unlockedAt : `${recent.unlockedAt.replace(" ", "T")}Z`).toLocaleDateString("pt-BR") : "—"}</p>
          </>
        ) : (
          <p className="text-sm text-rpg-muted">Nenhuma conquista ainda.</p>
        )}
        <Link to="/conquistas" className="mt-1 inline-flex min-h-[32px] items-center text-xs text-rpg-blue hover:underline">
          Hall de Troféus →
        </Link>
      </KitSection>
    </div>
  );
}

export function FeaturedMission({ hub, notify }: { hub: Hub; notify: (m: string, tone?: "success" | "error") => void }) {
  const { startTimer } = useTodayActions();
  const f = hub.featured;
  return (
    <KitSection title="Missão em destaque" icon={<Swords size={16} />} tone="gold">
      {f ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link to={`/tarefas?task=${f.id}`} className="font-rpg text-lg font-bold text-rpg-text hover:underline">
              {f.title}
            </Link>
            <p className="text-[11px] text-rpg-muted">
              Prioridade {f.priority} · {f.dueDate ? `prazo ${new Date(`${f.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}` : "sem prazo"} · {f.reasons.slice(0, 2).join(" · ")}
            </p>
          </div>
          <RPGButton
            variant="primary"
            onClick={() => startTimer.mutate({ mode: "pomodoro", plannedMinutes: 25, linkType: "task", linkId: f.id }, { onSuccess: () => notify("Foco iniciado — acompanhe em Hoje › Foco."), onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível iniciar.", "error") })}
          >
            <Play size={14} aria-hidden /> Continuar missão
          </RPGButton>
        </div>
      ) : (
        <p className="text-sm text-rpg-muted">Nenhuma missão aberta. <Link to="/tarefas?nova=1" className="text-rpg-blue hover:underline">Criar missão</Link></p>
      )}
    </KitSection>
  );
}

export function NextEvolutions({ hub }: { hub: Hub }) {
  return (
    <KitSection title="Próximas evoluções" icon={<TrendingUp size={16} />}>
      <ul className="space-y-1.5">
        {hub.nextEvolutions.map((e) => (
          <li key={e.key}>
            <Link to={e.link} className="block hover:brightness-110">
              <RPGProgressBar label={e.title} value={Math.min(e.current, e.target)} max={Math.max(1, e.target)} valueLabel={`${nf(Math.round(e.current))} / ${nf(Math.round(e.target))}${e.unit ? ` ${e.unit}` : ""}`} tone="purple" />
            </Link>
          </li>
        ))}
      </ul>
    </KitSection>
  );
}

export function JourneyTrail({ hub }: { hub: Hub }) {
  const m = hub.journey.milestones;
  return (
    <KitSection title="Jornada do herói" icon={<MapIcon size={16} />} tone="gold" action={<Link to="/timeline" className="text-xs text-rpg-blue hover:underline">Crônica →</Link>}>
      <ol className="flex items-start gap-0 overflow-x-auto pb-2">
        {m.map((x, i) => (
          <li key={x.id} className="flex shrink-0 items-start">
            <div className="flex w-24 flex-col items-center text-center" title={x.description}>
              <span className={clsx("flex items-center justify-center border-2", x.current ? "h-14 w-14 border-rpg-gold bg-rpg-gold/20 shadow-[0_0_14px_-3px_rgb(var(--rpg-gold)/0.8)]" : x.unlocked ? "h-10 w-10 border-rpg-green bg-rpg-green/15 text-rpg-green" : "h-10 w-10 border-rpg-border text-rpg-muted")} style={{ borderRadius: 999 }}>
                {x.current ? <img src={`${ART}/avatar.webp`} alt="" aria-hidden className="pixelated h-full w-full object-cover" style={{ borderRadius: 999 }} /> : x.unlocked ? <Crown size={16} aria-hidden /> : <Lock size={14} aria-hidden />}
              </span>
              <span className={clsx("mt-1 text-[11px] font-semibold leading-tight", x.current ? "text-rpg-gold-light" : x.unlocked ? "text-rpg-text" : "text-rpg-muted")}>{x.name}</span>
              <span className="text-[10px] text-rpg-muted">Nv. {x.minLevel}</span>
            </div>
            {i < m.length - 1 && <span className={clsx("mt-5 h-1 w-6", m[i + 1]!.unlocked ? "bg-rpg-green" : "bg-rpg-border")} aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-rpg-muted">Marcos = títulos oficiais por nível do Códex. Nenhum marco é liberado sem o nível real.</p>
    </KitSection>
  );
}

/* ═══════════════════════════════ Campanhas, conquistas, tesouro ═══════════════════════════════ */

export function CampaignsPanel({ hub }: { hub: Hub }) {
  return (
    <KitSection title="Campanhas ativas" icon={<Hammer size={16} />} action={<Link to="/forja-campanhas" className="text-xs text-rpg-blue hover:underline">Forja →</Link>}>
      {hub.campaigns.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma campanha ativa.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {hub.campaigns.map((c) => (
            <li key={c.id}>
              <Link to={`/forja-campanhas/${c.id}`} className="block border-2 border-rpg-border bg-rpg-bg-2/60 p-2 hover:border-rpg-gold" style={R}>
                <div className="flex items-center gap-2">
                  <span aria-hidden>{c.icon ?? "⚒️"}</span>
                  <p className="min-w-0 flex-1 truncate font-semibold text-rpg-text">{c.title}</p>
                  <RPGBadge tone={c.priority === "Alta" ? "red" : c.priority === "Média" ? "orange" : "muted"}>{c.priority}</RPGBadge>
                </div>
                <RPGProgressBar className="mt-1" label="Progresso" value={c.pct} max={100} valueLabel={`${c.pct}% · ${c.missionsDone}/${c.missions} missões`} tone="gold" />
                <p className="mt-0.5 text-[10px] text-rpg-muted">
                  {c.nextMilestone ? `Próximo marco: ${c.nextMilestone}` : "Sem marcos pendentes"}
                  {c.endDate ? ` · até ${new Date(`${c.endDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function RecentAchievements({ hub }: { hub: Hub }) {
  return (
    <KitSection title="Conquistas recentes" icon={<Trophy size={16} />} action={<Link to="/conquistas" className="text-xs text-rpg-blue hover:underline">Hall →</Link>}>
      {hub.recentAchievements.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma conquista ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {hub.recentAchievements.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <Trophy size={16} className="shrink-0 text-rpg-gold" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-rpg-text">{a.title}</span>
              <RPGBadge tone={TIER_TONE[a.tier] ?? "muted"}>{TIER_LABEL[a.tier] ?? a.tier}</RPGBadge>
              {a.reward && <span className="shrink-0 font-pixel text-[10px] text-rpg-purple">+{a.reward.xp}</span>}
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function TreasureSummary({ hub }: { hub: Hub }) {
  const t = hub.treasure;
  return (
    <KitSection title="Tesouro e coleção" icon={<Gem size={16} />} action={<span className="flex gap-2 text-xs"><Link to="/tesouro" className="text-rpg-blue hover:underline">Tesouro</Link><Link to="/inventario" className="text-rpg-blue hover:underline">Coleção</Link></span>}>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <p className="border border-rpg-border p-1.5" style={R}><span className="block font-rpg text-lg font-bold text-rpg-gold-light">{nf(t.coins)}</span><span className="text-[10px] text-rpg-muted">moedas</span></p>
        <p className="border border-rpg-border p-1.5" style={R}><span className="block font-rpg text-lg font-bold text-rpg-pink">{nf(t.gems)}</span><span className="text-[10px] text-rpg-muted">gemas</span></p>
        <p className="border border-rpg-border p-1.5" style={R}><span className="block font-rpg text-lg font-bold text-rpg-green">{t.available}</span><span className="text-[10px] text-rpg-muted">recompensas</span></p>
      </div>
      <p className="mt-2 text-[11px] text-rpg-muted">{t.titlesUnlocked} título(s) · {t.relics} relíquia(s) · título equipado: {t.equipped.title ?? "nenhum"}</p>
      {t.recentItems.length > 0 && (
        <ul className="mt-2 flex gap-1.5">
          {t.recentItems.map((i) => (
            <li key={i.key} title={i.name} className="h-12 w-12 overflow-hidden border-2 border-rpg-border bg-rpg-bg-2" style={R}>
              <img src={itemArtUrl(i.art, i.artSet)} alt={i.name} className={clsx("pixelated h-full w-full", artFit(i.artSet))} />
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/* ═══════════════════════════════ Evolução temporal e árvore ═══════════════════════════════ */

export function EvolutionPanel({ hub, period, onPeriod, range, onRange }: { hub: Hub; period: string; onPeriod: (p: string) => void; range: { from: string; to: string } | null; onRange: (r: { from: string; to: string } | null) => void }) {
  const [custom, setCustom] = useState(range ?? { from: hub.period.from, to: hub.period.to });
  const t = hub.evolution.totals;
  return (
    <div className="space-y-3">
      <div className="rpg-panel flex flex-wrap items-center gap-2 p-2.5">
        {(["7d", "30d", "90d", "365d"] as const).map((p) => (
          <button key={p} type="button" onClick={() => (onRange(null), onPeriod(p))} className={clsx("min-h-[36px] border-2 px-3 text-xs", !range && period === p ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {p === "365d" ? "Ano" : p.replace("d", " dias")}
          </button>
        ))}
        <span className="flex flex-wrap items-center gap-1 text-xs text-rpg-muted">
          <input type="date" aria-label="De" className="min-h-[36px] border border-rpg-border bg-rpg-bg-2 px-1 text-rpg-text" style={R} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          até
          <input type="date" aria-label="Até" className="min-h-[36px] border border-rpg-border bg-rpg-bg-2 px-1 text-rpg-text" style={R} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          <RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={() => custom.from <= custom.to && onRange(custom)}>
            Aplicar
          </RPGButton>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <IndicatorCard icon={<Zap size={20} />} label="XP no período" value={nf(t.xp)} tone="purple" />
        <IndicatorCard icon={<Swords size={20} />} label="Missões" value={t.missions} tone="blue" />
        <IndicatorCard icon={<Activity size={20} />} label="Consistência" value={`${t.consistencyPct}%`} hint={`${t.activeDays}/${hub.period.span} dias com XP`} tone="green" />
        <IndicatorCard icon={<Trophy size={20} />} label="Conquistas" value={t.achievements} tone="orange" />
        <IndicatorCard icon={<Target size={20} />} label="Metas alcançadas" value={t.goals} tone="gold" />
        <IndicatorCard icon={<BarChart3 size={20} />} label="Snapshots Life Score" value={hub.evolution.lifeScoreSnapshots} hint="dias com histórico" tone="blue" />
      </div>
      <KitSection title="XP, missões e Life Score" icon={<BarChart3 size={16} />}>
        {t.xp === 0 && t.missions === 0 && hub.evolution.lifeScoreSnapshots === 0 ? (
          <p className="py-6 text-center text-sm text-rpg-muted">Sem histórico neste período.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hub.evolution.timeline}>
                <CartesianGrid stroke="rgb(var(--rpg-border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} minTickGap={16} />
                <YAxis yAxisId="xp" tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} width={36} />
                <YAxis yAxisId="ls" orientation="right" domain={[0, 100]} tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} width={28} />
                <Tooltip contentStyle={{ background: "#14122b", border: "1px solid #6b5a2e", fontSize: 12 }} />
                <Bar yAxisId="xp" dataKey="xp" name="XP" fill={rpgColor("purple")} isAnimationActive={false} />
                <Bar yAxisId="xp" dataKey="missions" name="Missões" fill={rpgColor("blue")} isAnimationActive={false} />
                <Line yAxisId="ls" type="monotone" dataKey="lifeScore" name="Life Score" stroke={rpgColor("gold")} dot={false} connectNulls={false} strokeWidth={2} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[10px] text-rpg-muted">Dias sem snapshot de Life Score ficam em branco — nada é interpolado.</p>
      </KitSection>
      <AttributesPanel hub={hub} detailed />
    </div>
  );
}

export function EvolutionTree({ hub }: { hub: Hub }) {
  const [sel, setSel] = useState(hub.tree[0]?.key ?? "");
  const path = hub.tree.find((t) => t.key === sel) ?? hub.tree[0];
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <KitSection title="Caminhos" icon={<GitBranch size={16} />}>
        <ul className="space-y-1">
          {hub.tree.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setSel(t.key)} aria-pressed={sel === t.key} className={clsx("flex w-full items-center gap-2 border-2 p-2 text-left", sel === t.key ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border")} style={R}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-rpg-text">{t.label}</span>
                  <span className="text-[10px] text-rpg-muted">
                    Nv. {t.attrLevel} · {nf(t.xpTotal)} XP · {t.done}/{t.nodes.length} nós
                  </span>
                </span>
                <span className="font-pixel text-[11px] text-rpg-purple">{t.score}</span>
              </button>
            </li>
          ))}
        </ul>
      </KitSection>
      {path && (
        <KitSection title={`Caminho: ${path.label}`} icon={<Sparkles size={16} />} tone="legendary">
          <p className="text-sm text-rpg-text/90">{path.description}</p>
          <RPGProgressBar className="mt-2" label={`Pontuação da Build (${path.score}/100)`} value={path.score} max={100} tone="purple" />
          <ol className="mt-3 space-y-2 border-l-2 border-rpg-border pl-4">
            {path.nodes.map((n) => (
              <li key={n.id} className="relative">
                <span className={clsx("absolute -left-[23px] top-1 h-3 w-3 border-2", n.unlocked ? "border-rpg-green bg-rpg-green" : "border-rpg-border bg-rpg-bg-2")} style={{ borderRadius: 999 }} aria-hidden />
                <p className={clsx("text-sm font-semibold", n.unlocked ? "text-rpg-green" : "text-rpg-text")}>{n.title}</p>
                <p className="text-[11px] text-rpg-muted">Requisito: {n.requirement}</p>
                {!n.unlocked && <RPGProgressBar className="mt-0.5" label={n.title} showLabel={false} value={n.progress} max={100} tone="purple" />}
              </li>
            ))}
            {path.nodes.length === 0 && <li className="text-sm text-rpg-muted">Sem nós de conhecimento neste caminho.</li>}
          </ol>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="text-[11px] text-rpg-muted">
              <strong className="text-rpg-text">Origem do XP:</strong> {path.sources}
            </p>
            <p className="text-[11px] text-rpg-muted">
              <strong className="text-rpg-text">Recomendação:</strong> {path.recommendation}
            </p>
          </div>
          {path.habits.length > 0 && <p className="mt-1 text-[11px] text-rpg-muted">Hábitos sugeridos (criados só pela Build, com prévia): {path.habits.join(", ")}.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to="/codex" className="text-xs text-rpg-blue hover:underline">Conhecimentos no Códex →</Link>
            <Link to="/build?aba=recommendations" className="text-xs text-rpg-blue hover:underline">Plano de evolução →</Link>
          </div>
        </KitSection>
      )}
    </div>
  );
}

const QUESTIONS = ["Como posso evoluir meu personagem esta semana?", "Quais atributos precisam de atenção?", "Qual é a próxima conquista mais próxima?", "Quais missões devo priorizar?", "Como equilibrar meus objetivos?"];
const KIND = { dado: { label: "Dado real", tone: "blue" }, inferencia: { label: "Inferência", tone: "purple" }, sugestao: { label: "Sugestão", tone: "green" } } as const;

export function EvolutionMaster() {
  const advisor = useAdvisor("hero");
  return (
    <KitSection title="Mestre da Evolução" icon={<Wand2 size={16} />} tone="legendary">
      <div className="flex items-start gap-3">
        <img src="/assets/rpg/avatars/mago.webp" alt="" aria-hidden className="pixelated h-16 w-14 shrink-0 border-2 border-rpg-purple object-cover" style={R} />
        <div className="flex flex-wrap gap-1.5">
          {QUESTIONS.map((q) => (
            <button key={q} type="button" disabled={advisor.isPending} onClick={() => advisor.mutate({ useAi: true, question: q })} className="min-h-[34px] border border-rpg-purple/60 px-2 text-left text-xs text-rpg-text hover:bg-rpg-purple/15" style={R}>
              {q}
            </button>
          ))}
          <button type="button" disabled={advisor.isPending} onClick={() => advisor.mutate({ useAi: false })} className="min-h-[34px] border border-rpg-border px-2 text-xs text-rpg-muted" style={R}>
            Leitura sem IA
          </button>
        </div>
      </div>
      {advisor.isPending && <div className="mt-2 h-16 animate-pulse rpg-bar" aria-busy />}
      {advisor.data && (
        <div className="mt-2 space-y-1">
          <RPGBadge tone={advisor.data.ai ? "purple" : "blue"}>{advisor.data.ai ? "Gerado por IA" : "Leitura automática (sem IA)"}</RPGBadge>
          {advisor.data.insufficient && <p className="text-xs text-rpg-orange">Dados insuficientes para conclusões firmes.</p>}
          <ul className="space-y-1">
            {advisor.data.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-rpg-text">
                <RPGBadge tone={KIND[it.kind].tone} className="mt-0.5 shrink-0">
                  {KIND[it.kind].label}
                </RPGBadge>
                {it.text}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-rpg-muted">{advisor.data.disclaimer} Metas, hábitos e missões só são criados pela Build/Missões, com a sua aprovação.</p>
        </div>
      )}
    </KitSection>
  );
}

/* ═══════════════════════════════ Tela ═══════════════════════════════ */

const TABS = ["visao", "atributos", "evolucao", "arvore", "campanhas", "relatorios", "automacoes"] as const;
type Tab = (typeof TABS)[number];

/** PAINEL DO HERÓI — centro de evolução (tema RPG). Sistemas especializados ficam no Perfil do Herói. */
export function HeroDashboardScreen() {
  const [period, setPeriod] = useState("30d");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const q = useHeroDashboard(period, range ?? undefined);
  const [tab, setTab] = useUrlTab(TABS, "visao");
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const hub = q.data;
  if (q.isError)
    return (
      <div className="w-full px-4 py-6 md:px-6 lg:px-8">
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível carregar o Painel do Herói.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      </div>
    );
  if (!hub)
    return (
      <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8" aria-busy aria-label="Carregando o Painel do Herói">
        <div className="rpg-panel h-48 animate-pulse" />
        <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="rpg-panel h-56 animate-pulse" />)}</div>
      </div>
    );
  return (
    <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8">
      <HeroBanner hub={hub} />
      <ModuleTabs
        label="Seções do Painel do Herói"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "visao", label: "Visão Geral", icon: <LayoutGrid size={15} /> },
          { value: "atributos", label: "Atributos", icon: <Sparkles size={15} /> },
          { value: "evolucao", label: "Evolução", icon: <TrendingUp size={15} /> },
          { value: "arvore", label: "Árvore", icon: <GitBranch size={15} /> },
          { value: "campanhas", label: "Campanhas e Tesouro", icon: <Hammer size={15} /> },
          { value: "relatorios", label: "Mestre da Evolução", icon: <Bot size={15} /> },
          { value: "automacoes", label: "Automações", icon: <Zap size={15} /> },
        ]}
      />
      {tab === "visao" && (
        <>
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <KitSection title="Status do herói" icon={<Activity size={16} />}>
              <HeroStatus hub={hub} />
            </KitSection>
            <AttributesPanel hub={hub} />
            <BalanceRadar hub={hub} period={period} onPeriod={(p) => (setRange(null), setPeriod(p))} />
          </div>
          <ArchetypeCards hub={hub} />
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <FeaturedMission hub={hub} notify={notify} />
            <NextEvolutions hub={hub} />
          </div>
          <JourneyTrail hub={hub} />
          <div className="grid items-start gap-3 lg:grid-cols-3">
            <CampaignsPanel hub={hub} />
            <RecentAchievements hub={hub} />
            <TreasureSummary hub={hub} />
          </div>
        </>
      )}
      {tab === "atributos" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <AttributesPanel hub={hub} detailed />
          <BalanceRadar hub={hub} period={period} onPeriod={(p) => (setRange(null), setPeriod(p))} />
          <div className="lg:col-span-2">
            <ArchetypeCards hub={hub} />
          </div>
        </div>
      )}
      {tab === "evolucao" && <EvolutionPanel hub={hub} period={period} onPeriod={setPeriod} range={range} onRange={setRange} />}
      {tab === "arvore" && <EvolutionTree hub={hub} />}
      {tab === "campanhas" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <CampaignsPanel hub={hub} />
          <div className="space-y-3">
            <TreasureSummary hub={hub} />
            <RecentAchievements hub={hub} />
          </div>
        </div>
      )}
      {tab === "relatorios" && (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <EvolutionMaster />
          <NextEvolutions hub={hub} />
        </div>
      )}
      {tab === "automacoes" && (
        <AutomationsPanel
          module="hero"
          keys={["attributes_refresh", "progression", "unlock_pipeline", "near_achievements", "weekly_evolution", "performance_alerts", "build_snapshot"]}
          title="Automações do Painel do Herói"
          intro="Atributos, progressão, conquistas próximas, evolução semanal e alertas — tudo a partir dos registros oficiais."
        />
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
