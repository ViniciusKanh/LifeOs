import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Crown,
  Flag,
  Hourglass,
  Loader2,
  Map as MapIcon,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGSwitch } from "@/components/rpg";
import { useAutomations } from "@/hooks/useAutomations";
import { useGoalsHubActions, usePlanSuggestions } from "@/hooks/useGoalsHub";
import type { BreakdownPayload, GoalInsight, GoalsAnalytics, GoalsHub, HubGoal, PlanSuggestion, ReplanPayload, WeeklyPlanPayload } from "@/services/goalsHubService";
import type { Campaign } from "@/services/campaignsService";

/**
 * Peças da tela Metas 2.0 (central de planejamento RPG). Todos os números
 * vêm do /api/goals-hub, das campanhas da Forja e das automações reais.
 */

const HUB = "/assets/rpg/hub";
const PANEL = "rpg-panel relative overflow-hidden";
const TITLE = "rpg-title font-bold";

const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const errMsg = (e: unknown, fb: string) => (e instanceof Error && e.message ? e.message : fb);

export const HEALTH_UI: Record<HubGoal["health"], { label: string; cls: string }> = {
  ok: { label: "Em dia", cls: "border-rpg-green/60 text-rpg-green" },
  risk: { label: "Em risco", cls: "border-rpg-orange/60 text-rpg-orange" },
  stalled: { label: "Parada", cls: "border-rpg-orange/60 text-rpg-orange" },
  late: { label: "Atrasada", cls: "border-rpg-red/60 text-rpg-red" },
  done: { label: "Concluída", cls: "border-rpg-gold/70 text-rpg-gold-light" },
  abandoned: { label: "Abandonada", cls: "border-rpg-border text-rpg-muted" },
};

const AREA_ICON: Record<string, string> = {
  carreira: "💼",
  financas: "💰",
  saude: "❤️",
  relacionamentos: "🤝",
  familia: "🏡",
  desenvolvimento: "🎓",
  lazer: "🎮",
  espiritualidade: "✨",
};

export function Chip({ children, cls }: { children: ReactNode; cls?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none", cls ?? "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }}>
      {children}
    </span>
  );
}

/* ------------------------------ Banner ------------------------------ */

export function GoalsBanner({ onNew }: { onNew: () => void }) {
  return (
    <header className={clsx(PANEL, "rpg-panel-gold")}>
      <img src={`${HUB}/goal-castle.webp`} alt="" aria-hidden decoding="async" className="pixelated absolute inset-y-0 right-0 hidden h-full w-[48%] object-cover object-left md:block [mask-image:linear-gradient(to_right,transparent,black_25%)]" />
      <img src={`${HUB}/goal-castle.webp`} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover opacity-25 md:hidden" />
      <div className="relative flex min-h-[130px] items-center gap-3 p-3 sm:min-h-[150px] sm:p-4 md:max-w-[58%]">
        <img src={`${HUB}/goal-hero.webp`} alt="" aria-hidden decoding="async" className="pixelated hidden h-28 w-36 shrink-0 object-cover sm:block" style={{ borderRadius: 4 }} />
        <div className="min-w-0">
          <h1 className="rpg-title flex items-center gap-2 text-3xl font-bold leading-none sm:text-4xl">
            <Target size={30} className="text-rpg-gold" aria-hidden /> Metas
          </h1>
          <p className="mt-1.5 text-sm text-rpg-text/90">Defina seus destinos, forje planos, automatize sua execução e evolua na jornada.</p>
          <button type="button" onClick={onNew} className="rpg-btn rpg-btn-gold mt-3 inline-flex items-center gap-1.5 text-xs">
            <Plus size={14} aria-hidden /> Nova meta
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ Nível do planejador e indicadores ------------------------------ */

export function PlannerLevelCard({ hub }: { hub: GoalsHub }) {
  const p = hub.planner;
  const [open, setOpen] = useState(false);
  const pct = Math.round(((p.xp - p.levelStartXp) / Math.max(1, p.nextLevelXp - p.levelStartXp)) * 100);
  return (
    <section className={clsx(PANEL, "rpg-panel-legendary p-3")} aria-label="Nível do planejamento">
      <div className="flex items-center gap-3">
        {/* Brasão desenhado em CSS: o número é sempre o nível real. */}
        <div className="relative flex h-20 w-16 shrink-0 flex-col items-center justify-center border-2 border-rpg-gold bg-gradient-to-b from-rpg-purple/40 to-rpg-bg text-rpg-gold-light shadow-[0_0_18px_-4px_rgb(var(--rpg-gold)/0.7)] [clip-path:polygon(0_0,100%_0,100%_72%,50%_100%,0_72%)]">
          <span className="rpg-title text-3xl font-bold leading-none">{p.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-rpg-muted">Nível do planejamento</p>
          <p className="mt-0.5 inline-block border border-rpg-purple/60 bg-rpg-purple/25 px-2 py-0.5 text-sm font-semibold text-rpg-text" style={{ borderRadius: 3 }}>
            {p.title}
          </p>
          <div className="mt-1.5 h-2.5 border border-rpg-border bg-rpg-bg" role="progressbar" aria-label="XP de planejamento" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-rpg-purple shadow-[0_0_8px_rgb(var(--rpg-purple)/0.7)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 font-pixel text-[11px] tabular-nums text-rpg-muted">
            {p.xp} / {p.nextLevelXp} XP{p.nextTitle ? ` · ${p.nextTitle.title} no nível ${p.nextTitle.level}` : ""}
          </p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-[11px] text-rpg-gold-light underline" aria-expanded={open}>
        Como o XP de planejamento é calculado
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-rpg-text/85">
          {p.breakdown.map((b) => (
            <li key={b.label} className="flex justify-between gap-2">
              <span>
                {b.label} ({b.count})
              </span>
              <span className="font-pixel tabular-nums">+{b.xp}</span>
            </li>
          ))}
          <li className="pt-1 text-[10.5px] text-rpg-muted">Calculado dos seus registros. É uma especialização exibida — não soma no XP global.</li>
        </ul>
      )}
    </section>
  );
}

export function GoalIndicators({ hub }: { hub: GoalsHub }) {
  const i = hub.indicators;
  const delta = i.doneThisMonth - i.doneLastMonth;
  const tiles = [
    { icon: <Target size={20} />, value: String(i.active), label: "Metas ativas", caption: i.atRisk > 0 ? `${i.atRisk} em risco/paradas` : "nenhuma em risco", tone: "text-rpg-purple" },
    { icon: <CheckCircle2 size={20} />, value: String(i.doneThisMonth), label: "Concluídas no mês", caption: delta === 0 ? "igual ao mês passado" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} vs. mês passado`, tone: "text-rpg-green" },
    { icon: <Hourglass size={20} />, value: i.avgDaysToDeadline == null ? "—" : `${i.avgDaysToDeadline} dias`, label: "Prazo médio", caption: i.overdue > 0 ? `${i.overdue} atrasada(s)` : "até o prazo", tone: "text-rpg-orange" },
    { icon: <BarChart3 size={20} />, value: i.overallProgress == null ? "—" : `${i.overallProgress}%`, label: "Progresso geral", caption: i.consistency == null ? "consistência: poucos dados" : `consistência ${i.consistency}% (8 sem.)`, tone: "text-rpg-green" },
  ];
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rpg-panel flex min-w-[150px] shrink-0 snap-start items-center gap-2.5 p-3 sm:min-w-0">
          <span className={t.tone} aria-hidden>
            {t.icon}
          </span>
          <div className="min-w-0">
            <p className="rpg-title text-xl font-bold leading-tight tabular-nums">{t.value}</p>
            <p className="text-[11px] text-rpg-text/85">{t.label}</p>
            <p className="truncate text-[10.5px] text-rpg-muted">{t.caption}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Campanhas ------------------------------ */

const CAMP_ART: Array<{ re: RegExp; art: string }> = [
  { re: /acad|estud|mestr|pesquis|educ|desenvolv/i, art: `${HUB}/camp-mountain.webp` },
  { re: /saud|saúde|vital|fit|treino|bem/i, art: `${HUB}/camp-forest.webp` },
  { re: /financ|dinheiro|reserva|invest|econom/i, art: `${HUB}/camp-coins.webp` },
];
function campaignArt(c: Campaign) {
  const t = `${c.title} ${c.lifeArea ?? ""}`;
  return CAMP_ART.find((a) => a.re.test(t))?.art ?? `${HUB}/camp-chart.webp`;
}

export function CampaignsColumn({ campaigns, loading, compact = false }: { campaigns: Campaign[]; loading: boolean; compact?: boolean }) {
  const list = campaigns.filter((c) => c.status !== "archived").slice(0, compact ? 4 : 50);
  return (
    <section className={clsx(PANEL, "p-3")} aria-label="Campanhas da jornada">
      <div className="mb-2 flex items-center gap-2">
        <MapIcon size={17} className="text-rpg-gold" aria-hidden />
        <h2 className={clsx(TITLE, "flex-1 text-base")}>Campanhas da jornada</h2>
        <Link to="/forja-campanhas" className="flex h-8 w-8 items-center justify-center border border-rpg-border text-rpg-gold-light hover:border-rpg-gold" style={{ borderRadius: 3 }} aria-label="Nova campanha na Forja">
          <Plus size={15} />
        </Link>
      </div>
      {loading && <div className="h-24 animate-pulse bg-rpg-bg-2" />}
      {!loading && list.length === 0 && (
        <p className="text-xs text-rpg-muted">
          Nenhuma campanha ainda. Agrupe metas, projetos e missões numa campanha na{" "}
          <Link to="/forja-campanhas" className="text-rpg-gold-light underline">
            Forja de Campanhas
          </Link>
          .
        </p>
      )}
      <ul className={clsx("gap-2", compact ? "space-y-2" : "grid sm:grid-cols-2 xl:grid-cols-3")}>
        {list.map((c) => (
          <li key={c.id}>
            <Link to={`/forja-campanhas?campanha=${c.id}`} className="group flex items-center gap-2.5 border-2 border-rpg-border bg-rpg-bg-2/70 p-2 hover:border-rpg-gold/70" style={{ borderRadius: 4 }}>
              <img src={campaignArt(c)} alt="" aria-hidden loading="lazy" className="pixelated h-14 w-14 shrink-0 object-cover" style={{ borderRadius: 3 }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rpg-text">{c.title}</span>
                <span className="block truncate text-[11px] text-rpg-muted">
                  {c.goalTitle ? `Meta: ${c.goalTitle}` : c.lifeArea ?? "Campanha"} · {c.counts.missionsDone}/{c.counts.missions} missões
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-2 flex-1 border border-rpg-border bg-rpg-bg">
                    <span className="block h-full bg-rpg-purple" style={{ width: `${c.progress.pct}%` }} />
                  </span>
                  <span className="font-pixel text-[11px] tabular-nums text-rpg-text">{c.progress.pct}%</span>
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-rpg-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ Metas ativas ------------------------------ */

type Filter = "all" | "today" | "doing" | "late" | "done";

export function ActiveGoals({
  hub,
  onEdit,
  onPlanAi,
  onReplan,
  onComplete,
  onNew,
}: {
  hub: GoalsHub;
  onEdit: () => void;
  onPlanAi: (g: HubGoal) => void;
  onReplan: (g: HubGoal) => void;
  onComplete: (g: HubGoal) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const active = hub.goals.filter((g) => g.status === "active");
  const counts = {
    all: active.length,
    today: active.filter((g) => g.daysLeft === 0).length,
    doing: active.filter((g) => g.progressPct > 0 && g.progressPct < 100).length,
    late: active.filter((g) => g.health === "late").length,
    done: hub.goals.filter((g) => g.status === "done").length,
  };
  const list = useMemo(() => {
    if (filter === "done") return hub.goals.filter((g) => g.status === "done").slice(0, 30);
    if (filter === "today") return active.filter((g) => g.daysLeft === 0);
    if (filter === "doing") return active.filter((g) => g.progressPct > 0 && g.progressPct < 100);
    if (filter === "late") return active.filter((g) => g.health === "late");
    return active;
  }, [filter, hub.goals, active]);
  const labels: Record<Filter, string> = { all: "Todas", today: "Vencem hoje", doing: "Em andamento", late: "Atrasadas", done: "Concluídas" };

  return (
    <section className={clsx(PANEL, "p-3")} aria-label="Minhas metas ativas">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Target size={18} className="text-rpg-gold" aria-hidden />
        <h2 className={clsx(TITLE, "flex-1 text-base")}>Minhas metas ativas ({active.length})</h2>
        <button type="button" onClick={onNew} className="rpg-btn rpg-btn-primary inline-flex items-center gap-1 text-xs">
          <Plus size={13} aria-hidden /> Nova meta
        </button>
      </div>
      <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtrar metas">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={clsx("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", filter === f ? "border-rpg-purple bg-rpg-purple text-white" : "border-rpg-border text-rpg-muted")}
          >
            {labels[f]} ({counts[f]})
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-rpg-muted">{active.length === 0 ? "Nenhuma meta ativa. Crie a primeira e ligue tarefas a ela." : "Nenhuma meta neste filtro."}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((g) => (
            <GoalRow key={g.id} goal={g} onEdit={onEdit} onPlanAi={() => onPlanAi(g)} onReplan={() => onReplan(g)} onComplete={() => onComplete(g)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalRow({ goal: g, onEdit, onPlanAi, onReplan, onComplete }: { goal: HubGoal; onEdit: () => void; onPlanAi: () => void; onReplan: () => void; onComplete: () => void }) {
  const h = HEALTH_UI[g.health];
  const [menu, setMenu] = useState(false);
  const progressLabel = g.tasks.source ? `${g.tasks.done}/${g.tasks.total} tarefas` : g.kind === "numeric" ? `${g.currentValue}/${g.targetValue ?? "?"} ${g.unit ?? ""}` : null;
  return (
    <li className="border-2 border-rpg-border bg-rpg-bg-2/70 p-2.5 hover:border-rpg-gold/50" style={{ borderRadius: 4 }}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-rpg-border bg-rpg-bg text-lg" style={{ borderRadius: 3 }} aria-hidden>
          {AREA_ICON[g.lifeArea ?? ""] ?? "🎯"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <p className="min-w-0 flex-1 text-sm font-semibold text-rpg-text">{g.title}</p>
            {g.progressPct >= 100 && g.status === "active" && <Crown size={15} className="text-rpg-gold" aria-label="100% de progresso — conclua quando quiser" />}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip cls={h.cls}>{h.label}</Chip>
            {g.lifeArea && <Chip>{g.lifeArea}</Chip>}
            {g.period && <Chip>{g.period}</Chip>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-2.5 flex-1 border border-rpg-border bg-rpg-bg" role="progressbar" aria-label={`Progresso de ${g.title}`} aria-valuenow={g.progressPct} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-full bg-rpg-green shadow-[0_0_6px_rgb(var(--rpg-green)/0.6)]" style={{ width: `${g.progressPct}%` }} />
            </span>
            <span className="font-pixel text-xs tabular-nums text-rpg-text">{g.progressPct}%</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-rpg-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} aria-hidden /> {g.dueDate ? `Até ${fmtDate(g.dueDate)}` : "Sem prazo"}
            </span>
            {progressLabel && <span>{progressLabel}</span>}
            {g.expectedPct != null && g.status === "active" && <span>esperado {g.expectedPct}%</span>}
            {g.forecast.forecast && <span className="text-rpg-blue">previsão {fmtDate(g.forecast.forecast.date)}</span>}
            {g.automations.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 text-rpg-green">
                <Zap size={11} aria-hidden /> {a}
              </span>
            ))}
          </div>
        </div>
        {g.status === "active" && (
          <div className="relative flex shrink-0 items-center">
            <button type="button" onClick={onPlanAi} className="flex h-9 w-9 items-center justify-center text-rpg-gold-light hover:text-rpg-gold" aria-label={`Planejar ${g.title} com IA`} title="Planejar com IA">
              <Wand2 size={16} />
            </button>
            <button type="button" onClick={onEdit} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-text" aria-label={`Editar ${g.title}`} title="Editar em Minhas Metas">
              <Pencil size={15} />
            </button>
            <button type="button" onClick={() => setMenu((v) => !v)} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-text" aria-label="Mais ações" aria-expanded={menu}>
              ⋯
            </button>
            {menu && (
              <div className="absolute right-0 top-10 z-20 w-48 border-2 border-rpg-gold/60 bg-rpg-panel p-1 shadow-rpg" style={{ borderRadius: 4 }} role="menu">
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs text-rpg-text hover:bg-rpg-bg-2" onClick={() => (setMenu(false), onReplan())}>
                  <RefreshCw size={13} aria-hidden /> Replanejar
                </button>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs text-rpg-text hover:bg-rpg-bg-2" onClick={() => (setMenu(false), onComplete())}>
                  <Check size={13} aria-hidden /> Marcar como concluída
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ------------------------------ Coluna lateral ------------------------------ */

const MINI_KEYS = ["deadline_alerts", "progress_sync", "ai_breakdown"] as const;
const MINI_ICON: Record<string, ReactNode> = { deadline_alerts: <Bell size={16} />, progress_sync: <RefreshCw size={16} />, ai_breakdown: <Sparkles size={16} /> };

export function AutomationMini({ onOpenAll, onAi }: { onOpenAll: () => void; onAi: () => void }) {
  const { automations, update } = useAutomations("goals");
  return (
    <section className={clsx(PANEL, "p-3")} aria-label="Automação e IA">
      <div className="mb-2 flex items-center gap-2">
        <Zap size={17} className="text-rpg-purple" aria-hidden />
        <h2 className={clsx(TITLE, "flex-1 text-base")}>Automação & IA</h2>
        <button type="button" onClick={onOpenAll} className="rpg-btn rpg-btn-ghost text-[11px]">
          Configurar
        </button>
      </div>
      <ul className="space-y-1.5">
        {MINI_KEYS.map((k) => {
          const a = automations.find((x) => x.key === k);
          if (!a) return <li key={k} className="h-10 animate-pulse bg-rpg-bg-2" />;
          return (
            <li key={k} className="flex items-center gap-2.5">
              <span className="text-rpg-blue" aria-hidden>
                {MINI_ICON[k]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-rpg-text">{a.label}</span>
                <span className="block truncate text-[10.5px] text-rpg-muted">{a.triggerLabel}</span>
              </span>
              <RPGSwitch checked={a.enabled} onChange={() => update.mutate({ automationKey: k, patch: { enabled: !a.enabled } })} label={`${a.enabled ? "Desligar" : "Ligar"} ${a.label}`} />
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onAi} className="rpg-btn rpg-btn-primary mt-3 flex w-full flex-col items-center py-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={15} aria-hidden /> Planos com IA
        </span>
        <span className="text-[10.5px] font-normal opacity-85">Criar / ajustar / otimizar metas</span>
      </button>
    </section>
  );
}

const REWARD_ART = [`${HUB}/reward-crystal.webp`, `${HUB}/reward-book.webp`, `${HUB}/reward-trophy.webp`, `${HUB}/reward-chest.webp`, `${HUB}/reward-crown.webp`];

export function RewardsStrip({ hub, onOpen }: { hub: GoalsHub; onOpen: () => void }) {
  const rewards = hub.rewards ?? [];
  return (
    <section className={clsx(PANEL, "p-3")} aria-label="Recompensas da jornada">
      <button type="button" onClick={onOpen} className="mb-2 flex w-full items-center gap-2 text-left">
        <Crown size={17} className="text-rpg-gold" aria-hidden />
        <h2 className={clsx(TITLE, "flex-1 text-base")}>Recompensas da jornada</h2>
        <ChevronRight size={16} className="text-rpg-muted" aria-hidden />
      </button>
      <ul className="flex flex-wrap gap-2">
        {rewards.slice(0, 5).map((r, i) => (
          <li key={r.code} title={`${r.title} — ${r.unlockedAt ? "desbloqueada" : `${Math.min(r.value, r.threshold)}/${r.threshold}`}`}>
            <span className={clsx("flex h-12 w-12 items-center justify-center border-2 bg-rpg-bg", r.unlockedAt ? "border-rpg-gold" : "border-rpg-border")} style={{ borderRadius: 4 }}>
              <img src={REWARD_ART[i % REWARD_ART.length]} alt={r.title} loading="lazy" className={clsx("pixelated h-9 w-9 object-contain", !r.unlockedAt && "grayscale opacity-40")} />
            </span>
          </li>
        ))}
        {rewards.length === 0 && <li className="text-xs text-rpg-muted">Conclua metas para desbloquear recompensas.</li>}
      </ul>
    </section>
  );
}

export function EvolutionChart({ analytics, compact = false }: { analytics: GoalsAnalytics | undefined; compact?: boolean }) {
  const data = (analytics?.weekly ?? []).map((w) => ({ semana: w.week.slice(8, 10) + "/" + w.week.slice(5, 7), avanços: w.progressEvents + w.tasksDone, concluídas: w.goalsDone }));
  const empty = data.every((d) => d.avanços === 0 && d.concluídas === 0);
  return (
    <section className={clsx(PANEL, "p-3")} aria-label="Evolução no tempo">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp size={17} className="text-rpg-purple" aria-hidden />
        <h2 className={clsx(TITLE, "flex-1 text-base")}>Evolução no tempo</h2>
      </div>
      {!analytics ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" />
      ) : empty ? (
        <p className="py-6 text-center text-xs text-rpg-muted">Ainda sem avanços registrados nas últimas 12 semanas.</p>
      ) : (
        <div className={compact ? "h-40" : "h-56"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="rgb(var(--rpg-border) / 0.5)" strokeDasharray="3 3" />
              <XAxis dataKey="semana" tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "rgb(var(--rpg-panel))", border: "1px solid rgb(var(--rpg-gold) / 0.6)", fontSize: 12 }} />
              <Line type="monotone" dataKey="avanços" stroke="rgb(var(--rpg-purple))" strokeWidth={2} dot={{ r: 3 }} />
              {!compact && <Line type="monotone" dataKey="concluídas" stroke="rgb(var(--rpg-gold))" strokeWidth={2} dot={{ r: 3 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[10.5px] text-rpg-muted">Avanços = registros de progresso + tarefas concluídas ligadas a metas, por semana.</p>
    </section>
  );
}

/* ------------------------------ Análises ------------------------------ */

export function GoalsAnalyticsView({ analytics }: { analytics: GoalsAnalytics | undefined }) {
  if (!analytics) return <div className="rpg-panel h-64 animate-pulse" />;
  const months = analytics.months.map((m) => ({ mês: `${m.month.slice(5, 7)}/${m.month.slice(2, 4)}`, concluídas: m.done, criadas: m.created }));
  const pva = analytics.plannedVsActual.map((g) => ({ meta: g.title.length > 16 ? `${g.title.slice(0, 15)}…` : g.title, esperado: g.expected, realizado: g.actual }));
  const axis = { tick: { fill: "rgb(var(--rpg-text-muted))", fontSize: 10 } };
  const tip = { contentStyle: { background: "rgb(var(--rpg-panel))", border: "1px solid rgb(var(--rpg-gold) / 0.6)", fontSize: 12 } };
  const d = analytics.deadlines;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EvolutionChart analytics={analytics} />
      <section className={clsx(PANEL, "p-3")} aria-label="Metas por mês">
        <h2 className={clsx(TITLE, "mb-2 text-base")}>Metas criadas × concluídas (12 meses)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="rgb(var(--rpg-border) / 0.5)" strokeDasharray="3 3" />
              <XAxis dataKey="mês" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="criadas" fill="rgb(var(--rpg-blue))" />
              <Bar dataKey="concluídas" fill="rgb(var(--rpg-green))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className={clsx(PANEL, "p-3")} aria-label="Planejado × realizado">
        <h2 className={clsx(TITLE, "mb-2 text-base")}>Planejado × realizado</h2>
        {pva.length === 0 ? (
          <p className="text-xs text-rpg-muted">Metas ativas com prazo aparecem aqui (esperado = tempo decorrido até o prazo).</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pva} layout="vertical" margin={{ top: 6, right: 12, bottom: 0, left: 10 }}>
                <CartesianGrid stroke="rgb(var(--rpg-border) / 0.5)" strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} {...axis} />
                <YAxis type="category" dataKey="meta" width={90} {...axis} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="esperado" fill="rgb(var(--rpg-text-muted))" />
                <Bar dataKey="realizado" fill="rgb(var(--rpg-purple))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section className={clsx(PANEL, "p-3")} aria-label="Áreas e prazos">
        <h2 className={clsx(TITLE, "mb-2 text-base")}>Progresso por área e prazos</h2>
        {analytics.byArea.length === 0 ? (
          <p className="text-xs text-rpg-muted">Sem metas ativas.</p>
        ) : (
          <ul className="space-y-1.5">
            {analytics.byArea.map((a) => (
              <li key={a.area} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-2 text-sm">
                <span className="truncate text-rpg-text">
                  {AREA_ICON[a.area] ?? "🎯"} {a.area === "sem_area" ? "Sem área" : a.area} ({a.goals})
                </span>
                <span className="h-2.5 border border-rpg-border bg-rpg-bg">
                  <span className="block h-full bg-rpg-green" style={{ width: `${a.avgProgress}%` }} />
                </span>
                <span className="w-10 text-right font-pixel text-xs tabular-nums">{a.avgProgress}%</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-rpg-text">
          Cumprimento de prazos:{" "}
          {d.sample === 0 ? (
            <span className="text-rpg-muted">nenhuma meta com prazo concluída ainda.</span>
          ) : (
            <>
              <strong className="text-rpg-green">{d.onTime}</strong> no prazo · <strong className="text-rpg-red">{d.late}</strong> com atraso ({Math.round((d.onTime / d.sample) * 100)}% no prazo)
            </>
          )}
        </p>
      </section>
    </div>
  );
}

/* ------------------------------ Copiloto ------------------------------ */

const PROV_CLS: Record<GoalInsight["provenance"], string> = { dado: "text-rpg-blue", inferência: "text-rpg-purple", sugestão: "text-rpg-gold-light" };
const INSIGHT_ICON: Record<GoalInsight["kind"], ReactNode> = {
  late: <AlertTriangle size={15} />,
  risk: <TrendingUp size={15} />,
  stalled: <Hourglass size={15} />,
  bottleneck: <Flag size={15} />,
  conflict: <CalendarClock size={15} />,
  no_plan: <Wand2 size={15} />,
  next_action: <ChevronRight size={15} />,
  ok: <CheckCircle2 size={15} />,
};

export function GoalsCopilot({
  insights,
  nextActions,
  loading,
  onWeekly,
  weeklyPending,
}: {
  insights: GoalInsight[];
  nextActions: Array<{ taskId: string; title: string; dueDate: string | null; priority: string; goalTitle: string }>;
  loading: boolean;
  onWeekly: () => void;
  weeklyPending: boolean;
}) {
  const { ask } = useGoalsHubActions();
  const [q, setQ] = useState("");
  const examples = ["Qual meta devo priorizar esta semana?", "Por que meu progresso diminuiu?", "Como posso concluir minhas metas antes do prazo?"];
  const send = (question: string) => {
    if (question.trim().length < 3) return;
    ask.mutate(question.trim());
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className={clsx(PANEL, "p-3")} aria-label="Diagnóstico das metas">
        <h2 className={clsx(TITLE, "mb-2 flex items-center gap-2 text-base")}>
          <Sparkles size={16} className="text-rpg-purple" aria-hidden /> Diagnóstico
        </h2>
        {loading && <div className="h-32 animate-pulse bg-rpg-bg-2" />}
        <ul className="space-y-1.5">
          {insights.map((i, n) => (
            <li key={n} className="flex gap-2 border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
              <span className={clsx("mt-0.5", PROV_CLS[i.provenance])} aria-hidden>
                {INSIGHT_ICON[i.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-rpg-text">{i.title}</span>
                <span className="block text-[11.5px] text-rpg-text/80">{i.detail}</span>
              </span>
              <span className={clsx("shrink-0 font-pixel text-[9px] uppercase", PROV_CLS[i.provenance])}>{i.provenance}</span>
            </li>
          ))}
        </ul>
        {nextActions.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-rpg-gold">Próximas ações (tarefas reais)</h3>
            <ul className="divide-y divide-rpg-border/60">
              {nextActions.map((a) => (
                <li key={a.taskId} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-rpg-text">{a.title}</span>
                    <span className="block truncate text-[10.5px] text-rpg-muted">{a.goalTitle}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-rpg-muted">{a.dueDate ? fmtDate(a.dueDate) : "sem prazo"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={onWeekly} disabled={weeklyPending} className="rpg-btn rpg-btn-gold mt-3 inline-flex items-center gap-1.5 text-xs">
          {weeklyPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CalendarClock size={13} aria-hidden />} Gerar plano da semana
        </button>
      </section>
      <section className={clsx(PANEL, "p-3")} aria-label="Pergunte ao Copiloto">
        <h2 className={clsx(TITLE, "mb-2 flex items-center gap-2 text-base")}>
          <MessageSquare size={16} className="text-rpg-gold" aria-hidden /> Pergunte ao Copiloto
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((e) => (
            <button key={e} type="button" onClick={() => (setQ(e), send(e))} className="border border-rpg-border px-2 py-1 text-[11px] text-rpg-text/85 hover:border-rpg-gold" style={{ borderRadius: 3 }}>
              {e}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(q);
          }}
        >
          <label className="sr-only" htmlFor="goal-copilot-q">
            Pergunta
          </label>
          <input id="goal-copilot-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ex.: o que está travando a meta do mestrado?" className="min-w-0 flex-1 border border-rpg-border bg-rpg-bg px-3 py-2 text-sm text-rpg-text" style={{ borderRadius: 3 }} />
          <button type="submit" disabled={ask.isPending || q.trim().length < 3} className="rpg-btn rpg-btn-primary px-3" aria-label="Enviar pergunta">
            {ask.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </form>
        {ask.isError && <p className="mt-2 text-xs text-rpg-red">{errMsg(ask.error, "O Copiloto não respondeu.")}</p>}
        {ask.data && (
          <div className="rpg-parchment mt-3 p-3 text-sm leading-relaxed text-rpg-ink whitespace-pre-line">
            {ask.data.answer}
            <p className="mt-2 text-[10.5px] opacity-70">{ask.data.ai ? "Resposta da IA baseada nos seus dados — [Dado], [Inferência] e [Sugestão] estão marcados." : "Sem IA: diagnóstico calculado dos seus dados."}</p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ Sugestões de plano ------------------------------ */

export function PlanSuggestionsPanel() {
  const { data, isLoading } = usePlanSuggestions();
  const { apply, reject } = useGoalsHubActions();
  const [msg, setMsg] = useState<string | null>(null);
  const list = data ?? [];
  if (isLoading) return <div className="rpg-panel h-24 animate-pulse" />;
  if (list.length === 0) return null;
  return (
    <section className={clsx(PANEL, "rpg-panel-gold p-3")} aria-label="Planos sugeridos aguardando aprovação">
      <h2 className={clsx(TITLE, "mb-2 text-base")}>Planos aguardando sua aprovação ({list.length})</h2>
      {msg && (
        <p className="mb-2 text-xs text-rpg-green" role="status">
          {msg}
        </p>
      )}
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="border border-rpg-border bg-rpg-bg-2/70 p-2.5" style={{ borderRadius: 3 }}>
            <SuggestionBody s={s} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rpg-btn rpg-btn-gold inline-flex items-center gap-1 text-xs"
                disabled={apply.isPending}
                onClick={() => apply.mutate({ id: s.id }, { onSuccess: (r) => setMsg(r.message), onError: (e) => setMsg(errMsg(e, "Falhou.")) })}
              >
                <Check size={13} aria-hidden /> Aplicar
              </button>
              <button type="button" className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 text-xs" disabled={reject.isPending} onClick={() => reject.mutate(s.id)}>
                <X size={13} aria-hidden /> Rejeitar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuggestionBody({ s }: { s: PlanSuggestion }) {
  if (s.kind === "weekly") {
    const p = s.payload as WeeklyPlanPayload;
    return (
      <div>
        <p className="text-sm font-semibold text-rpg-text">Plano da semana de {fmtDate(p.weekStart)}</p>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
          {p.days
            .filter((d) => d.tasks.length > 0)
            .map((d) => (
              <li key={d.date} className="text-[11.5px]">
                <span className="font-semibold text-rpg-gold-light">{new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                <span className="text-rpg-text/85"> — {d.tasks.map((t) => t.title).join("; ")}</span>
              </li>
            ))}
        </ul>
        {p.unscheduled > 0 && <p className="mt-1 text-[11px] text-rpg-orange">{p.unscheduled} tarefa(s) não couberam no limite diário.</p>}
        <p className="mt-1 text-[10.5px] text-rpg-muted">Aplicar define a data planejada das tarefas (não muda prazos).</p>
      </div>
    );
  }
  if (s.kind === "replan") {
    const p = s.payload as ReplanPayload;
    return (
      <div>
        <p className="text-sm font-semibold text-rpg-text">Replanejamento: {p.goalTitle}</p>
        <p className="text-[11.5px] text-rpg-text/85">
          {p.reason} {p.basis}
        </p>
        {p.newDueDate && <p className="text-[11.5px] text-rpg-gold-light">Novo prazo sugerido: {fmtDate(p.newDueDate)}</p>}
        {p.raisePriority && <p className="text-[11.5px] text-rpg-orange">Prioridade das tarefas sobe para Alta.</p>}
        {p.scopeNote && <p className="text-[11.5px] text-rpg-orange">{p.scopeNote}</p>}
        <ul className="mt-1 text-[11px] text-rpg-muted">
          {p.tasks.slice(0, 6).map((t) => (
            <li key={t.taskId}>
              {t.title}: {fmtDate(t.from)} → <span className="text-rpg-text">{fmtDate(t.to)}</span>
            </li>
          ))}
          {p.tasks.length > 6 && <li>+{p.tasks.length - 6} tarefa(s)</li>}
        </ul>
      </div>
    );
  }
  const p = s.payload as BreakdownPayload;
  return (
    <div>
      <p className="text-sm font-semibold text-rpg-text">Plano da IA: {s.goalTitle}</p>
      <p className="text-[11.5px] text-rpg-text/85">
        {p.summary} {p.tasks.length} tarefa(s).
      </p>
    </div>
  );
}

/** Plano com IA (editável): a IA propõe; o usuário edita/remove e confirma antes de criar as tarefas. */
export function BreakdownModal({ goal, onClose, onDone }: { goal: HubGoal | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { planAi, apply } = useGoalsHubActions();
  const [draft, setDraft] = useState<{ id: string; payload: BreakdownPayload } | null>(null);
  const start = () => {
    if (!goal) return;
    planAi.mutate(goal.id, { onSuccess: (r) => setDraft(r) });
  };
  const close = () => {
    setDraft(null);
    planAi.reset();
    onClose();
  };
  const setTask = (i: number, patch: Partial<BreakdownPayload["tasks"][number]>) =>
    setDraft((d) => (d ? { ...d, payload: { ...d.payload, tasks: d.payload.tasks.map((t, n) => (n === i ? { ...t, ...patch } : t)) } } : d));
  const removeTask = (i: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            payload: {
              ...d.payload,
              tasks: d.payload.tasks.filter((_, n) => n !== i).map((t) => ({ ...t, dependsOn: t.dependsOn === null ? null : t.dependsOn === i ? null : t.dependsOn > i ? t.dependsOn - 1 : t.dependsOn })),
            },
          }
        : d,
    );

  return (
    <Modal open={!!goal} onClose={close} size="lg" title={goal ? `Planejar com IA — ${goal.title}` : "Planejar com IA"}>
      {!draft ? (
        <div className="space-y-3 text-sm">
          <p className="text-rpg-text/90">A IA propõe objetivos intermediários, tarefas com prazo, dependências e critérios de conclusão. Nada é criado até você confirmar.</p>
          {planAi.isError && <p className="text-xs text-rpg-red">{errMsg(planAi.error, "A IA não respondeu.")}</p>}
          <button type="button" onClick={start} disabled={planAi.isPending} className="rpg-btn rpg-btn-gold inline-flex items-center gap-1.5">
            {planAi.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />} {planAi.isPending ? "Planejando…" : "Gerar plano"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.payload.summary && <p className="text-sm text-rpg-text/90">{draft.payload.summary}</p>}
          {draft.payload.milestones.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rpg-gold">Marcos</p>
              <ul className="text-[12px] text-rpg-text/85">
                {draft.payload.milestones.map((m, i) => (
                  <li key={i}>
                    🏁 {m.title} {m.dueDate ? `— ${fmtDate(m.dueDate)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rpg-gold">Tarefas ({draft.payload.tasks.length})</p>
            <ul className="mt-1 max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
              {draft.payload.tasks.map((t, i) => (
                <li key={i} className="grid grid-cols-1 gap-1 border border-rpg-border p-2 sm:grid-cols-[minmax(0,1fr)_130px_100px_auto]" style={{ borderRadius: 3 }}>
                  <input value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} className="border border-rpg-border bg-rpg-bg px-2 py-1 text-sm text-rpg-text" style={{ borderRadius: 3 }} aria-label="Título da tarefa" />
                  <input type="date" value={t.dueDate ?? ""} onChange={(e) => setTask(i, { dueDate: e.target.value || null })} className="border border-rpg-border bg-rpg-bg px-2 py-1 text-sm text-rpg-text" style={{ borderRadius: 3 }} aria-label="Prazo" />
                  <select value={t.priority} onChange={(e) => setTask(i, { priority: e.target.value as "Baixa" | "Média" | "Alta" })} className="border border-rpg-border bg-rpg-bg px-1 py-1 text-sm text-rpg-text" style={{ borderRadius: 3 }} aria-label="Prioridade">
                    <option>Baixa</option>
                    <option>Média</option>
                    <option>Alta</option>
                  </select>
                  <button type="button" onClick={() => removeTask(i)} className="flex h-8 w-8 items-center justify-center text-rpg-muted hover:text-rpg-red" aria-label="Remover tarefa">
                    <Trash2 size={14} />
                  </button>
                  {t.dependsOn !== null && draft.payload.tasks[t.dependsOn] && <p className="text-[10.5px] text-rpg-muted sm:col-span-4">Depende de: {draft.payload.tasks[t.dependsOn].title}</p>}
                </li>
              ))}
            </ul>
          </div>
          {draft.payload.indicators.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rpg-gold">Critérios de conclusão</p>
              <ul className="ml-4 list-disc text-[12px] text-rpg-text/85">
                {draft.payload.indicators.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10.5px] text-rpg-muted">Sugestão da IA. As tarefas criadas ficam vinculadas à meta e alimentam o progresso automático.</p>
          {apply.isError && <p className="text-xs text-rpg-red">{errMsg(apply.error, "Falhou ao criar.")}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rpg-btn rpg-btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className="rpg-btn rpg-btn-gold inline-flex items-center gap-1.5"
              disabled={apply.isPending || draft.payload.tasks.length === 0}
              onClick={() =>
                apply.mutate(
                  { id: draft.id, payload: draft.payload },
                  {
                    onSuccess: (r) => {
                      onDone(r.message);
                      close();
                    },
                  },
                )
              }
            >
              {apply.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />} Criar {draft.payload.tasks.length} tarefa(s)
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function RewardsView({ hub }: { hub: GoalsHub }) {
  const rewards = hub.rewards ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className={clsx(PANEL, "p-4")} aria-label="Recompensas">
        <h2 className={clsx(TITLE, "mb-3 flex items-center gap-2 text-lg")}>
          <Crown size={18} className="text-rpg-gold" aria-hidden /> Recompensas da jornada
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rewards.map((r, i) => {
            const pct = Math.min(100, Math.round((r.value / Math.max(1, r.threshold)) * 100));
            return (
              <li key={r.code} className={clsx("flex flex-col items-center border-2 p-3 text-center", r.unlockedAt ? "border-rpg-gold/70 bg-rpg-gold/5" : "border-rpg-border")} style={{ borderRadius: 4 }}>
                <img src={REWARD_ART[i % REWARD_ART.length]} alt="" aria-hidden loading="lazy" className={clsx("pixelated h-12 w-12", !r.unlockedAt && "grayscale opacity-40")} />
                <p className={clsx("mt-1 text-sm font-semibold", r.unlockedAt ? "text-rpg-gold-light" : "text-rpg-text")}>{r.title}</p>
                <p className="text-[11px] text-rpg-muted">{r.description}</p>
                {r.unlockedAt ? (
                  <p className="mt-1 text-[11px] text-rpg-green">Desbloqueada em {fmtDate(r.unlockedAt)}</p>
                ) : (
                  <>
                    <span className="mt-1.5 h-1.5 w-full bg-rpg-bg">
                      <span className="block h-full bg-rpg-gold" style={{ width: `${pct}%` }} />
                    </span>
                    <p className="mt-0.5 font-pixel text-[10.5px] text-rpg-muted tabular-nums">
                      {Math.min(r.value, r.threshold)}/{r.threshold}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-rpg-muted">Recompensas do catálogo oficial de Conquistas — o XP segue as regras do LifeOS e nunca é concedido duas vezes.</p>
      </section>
      <PlannerLevelCard hub={hub} />
    </div>
  );
}

