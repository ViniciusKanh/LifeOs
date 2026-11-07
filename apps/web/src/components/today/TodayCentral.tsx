import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  AlarmClock,
  BarChart3,
  Bed,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Coins,
  Crown,
  Droplets,
  Dumbbell,
  Flame,
  Gem,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  Plus,
  ScrollText,
  Settings2,
  Smile,
  Sparkles,
  Square,
  Star,
  Sun,
  Sunset,
  Swords,
  Target,
  Timer,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar, RPGToast } from "@/components/rpg";
import { IndicatorCard, KitSection, MODULE_ART, ModuleTabs } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { DEFAULT_QUOTE, findNavItem } from "@/components/layout/navConfig";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { usePlanningActions } from "@/hooks/usePlanningHub";
import { useAdvisor } from "@/hooks/useModuleHub";
import { useGrimoireDecks } from "@/hooks/useGrimoire";
import { useUrlTab } from "@/components/hero/HeroShared";
import { eventsService } from "@/services/eventsService";
import { useJourneySync, useTodayActions, useTodayHub } from "@/hooks/useDayHero";
import type { RitualKind, TimerMode, TodayHub, TodayMission } from "@/services/dayHeroService";

const ART = `${MODULE_ART}/today`;
const R = { borderRadius: 4 } as const;
const FIELD = "min-h-[40px] w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";
type Notify = (msg: string, tone?: "success" | "error") => void;

/** Saudação pelo horário LOCAL do navegador. */
export function greetingFor(hour: number): { text: string; period: "manha" | "tarde" | "noite" } {
  if (hour >= 5 && hour < 12) return { text: "Bom dia", period: "manha" };
  if (hour >= 12 && hour < 18) return { text: "Boa tarde", period: "tarde" };
  return { text: "Boa noite", period: "noite" };
}
const hhmm = (iso: string) => (iso.length > 10 ? new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}`).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Dia todo");
const durMin = (a: string, b: string | null) => (b && a.length > 10 && b.length > 10 ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null);

/* ═══════════════════════════════ Banner + indicadores ═══════════════════════════════ */

/**
 * "Foco agora": em dias com várias missões, ninguém precisa eleger UMA principal.
 * Mostra as 3 prioridades do ranking (prazo + prioridade) e o que já foi concluído
 * hoje. Fixar uma missão principal é opcional e só serve para o bônus oficial.
 */
function FocusNowCard({ hub, onStart }: { hub: TodayHub; onStart: (taskId: string | null) => void }) {
  const { setMain } = useTodayActions();
  const [help, setHelp] = useState(false);
  const m = hub.main;
  const doneCount = hub.doneToday.length;
  return (
    <section className="rpg-panel rpg-panel-gold flex min-w-0 flex-col gap-2 p-3" aria-label="Foco agora">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-rpg-gold" aria-hidden />
        <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Foco agora</p>
        <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} className="ml-auto text-[11px] text-rpg-blue hover:underline">
          Como funciona?
        </button>
      </div>
      {help && (
        <p className="border border-rpg-border bg-rpg-bg/60 p-2 text-[11px] text-rpg-text/90" style={R}>
          Você não precisa escolher uma missão principal: conclua quantas quiser, todas rendem XP. As prioridades abaixo vêm do ranking por prazo e prioridade. Fixar uma como principal é opcional e dá o bônus oficial de missão principal ao concluí-la.
        </p>
      )}
      {m && (
        <div className="border border-rpg-gold/60 bg-rpg-gold/5 p-2" style={R}>
          <div className="flex items-center gap-1.5">
            <RPGBadge tone="gold">fixada por você</RPGBadge>
            <button type="button" className="ml-auto text-[11px] text-rpg-muted hover:text-rpg-red" onClick={() => setMain.mutate(null)}>
              Desafixar
            </button>
          </div>
          <Link to={`/tarefas?task=${m.id}`} className="mt-1 block font-rpg text-base font-bold leading-tight text-rpg-text hover:underline">
            {m.title}
          </Link>
          {m.subtasks.total > 0 && <RPGProgressBar className="mt-1" label="Etapas" value={m.subtasks.done} max={m.subtasks.total} valueLabel={`${m.subtasks.done}/${m.subtasks.total}`} tone="purple" />}
          <RPGButton variant="primary" className="mt-1.5 min-h-[34px] text-xs" onClick={() => onStart(m.id)} disabled={!!hub.timer}>
            <Play size={12} aria-hidden /> {hub.timer ? "Foco em andamento" : "Focar nesta"}
          </RPGButton>
        </div>
      )}
      {hub.focusNow.length > 0 ? (
        <ol className="space-y-1.5">
          {hub.focusNow.map((f, i) => (
            <li key={f.id} className="flex min-w-0 items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 px-2 py-1.5" style={R}>
              <span className="font-pixel text-[10px] text-rpg-gold" aria-hidden>{i + 1}</span>
              <Link to={`/tarefas?task=${f.id}`} className="min-w-0 flex-1 truncate text-sm text-rpg-text hover:underline" title={f.title}>
                {f.title}
              </Link>
              {f.overdue && <RPGBadge tone="red">atrasada</RPGBadge>}
              <button type="button" disabled={!!hub.timer} onClick={() => onStart(f.id)} className="shrink-0 p-1 text-rpg-purple hover:text-rpg-gold-light disabled:opacity-40" aria-label={`Iniciar foco em ${f.title}`}>
                <Play size={14} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        !m && <p className="text-sm text-rpg-muted">Nenhuma missão pendente para hoje. {doneCount > 0 ? "Dia em ordem!" : "Crie uma missão ou planeje o dia na Agenda."}</p>
      )}
      <p className="mt-auto flex items-center gap-1.5 text-[11px] text-rpg-muted">
        <CheckCircle2 size={12} className="text-rpg-green" aria-hidden />
        {doneCount === 0 ? "Nenhuma missão concluída hoje ainda." : `${doneCount} missão(ões) concluída(s) hoje${hub.missions.length ? ` · ${hub.missions.length} pendente(s)` : ""}.`}
      </p>
    </section>
  );
}

export function TodayBanner({ hub, onStart }: { hub: TodayHub; onStart: (taskId: string | null) => void }) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const g = greetingFor(now.getHours());
  const first = (user?.name ?? "Herói").split(" ")[0];
  const quote = findNavItem("/hoje")?.item.quote ?? DEFAULT_QUOTE;
  const tint = { manha: "from-rpg-orange/25", tarde: "from-rpg-gold/15", noite: "from-rpg-purple/30" }[g.period];
  const PeriodIcon = { manha: Sun, tarde: Sunset, noite: Moon }[g.period];
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <header className="relative min-h-[170px] overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2" style={R}>
        <img src={`${ART}/banner-scene.webp`} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-90 sm:w-3/4" />
        <div className={clsx("absolute inset-0 bg-gradient-to-r via-rpg-bg/80 to-transparent", tint)} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/70 to-transparent" aria-hidden />
        <div className="relative flex h-full items-center gap-3 p-3 sm:p-4">
          <img src={`${ART}/banner-mage.webp`} alt="" aria-hidden className="pixelated hidden h-[130px] w-auto shrink-0 md:block" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">
              <PeriodIcon size={12} aria-hidden /> Sua jornada de hoje
            </p>
            <h1 className="rpg-title text-2xl font-bold leading-tight sm:text-3xl">
              {g.text}, {first}!
            </h1>
            <p className="text-sm capitalize text-rpg-text/90">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
            <p className="mt-2 inline-block border border-rpg-gold/50 bg-rpg-bg/60 px-3 py-1.5 text-sm italic text-rpg-text/90" style={R}>
              “{quote}”
            </p>
          </div>
        </div>
      </header>
      <FocusNowCard hub={hub} onStart={onStart} />
    </div>
  );
}

const DIM_LABEL: Record<string, string> = { productivity: "Produtividade", health: "Saúde", habits: "Hábitos", goals: "Metas", reading: "Leitura", education: "Educação", professional: "Profissional" };

export function TodayIndicators({ hub }: { hub: TodayHub }) {
  const [explain, setExplain] = useState(false);
  const i = hub.indicators;
  const p = hub.profile;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <button type="button" onClick={() => setExplain(true)} className="text-left" aria-label="Life Score — ver cálculo">
          <IndicatorCard icon={<Gem size={22} />} label="Life Score" value={`${hub.lifeScore.overall}/100`} hint={hub.lifeScore.delta == null ? "toque para ver o cálculo" : `${hub.lifeScore.delta >= 0 ? "+" : ""}${hub.lifeScore.delta} vs. 7 dias atrás`} tone="purple" />
        </button>
        <IndicatorCard icon={<Zap size={22} />} label="XP de hoje" value={`+${p.xpToday.toLocaleString("pt-BR")}`} hint={`média 7d: ${p.xpAvg7}/dia`} tone="purple" />
        <IndicatorCard icon={<Coins size={22} />} label="Moedas" value={p.coins.toLocaleString("pt-BR")} hint={`+${p.coinsToday} hoje`} />
        <IndicatorCard icon={<Flame size={22} />} label="Sequência" value={`${p.streakDays} dias`} hint="dias seguidos com XP" tone="red" />
        <IndicatorCard icon={<Target size={22} />} label="Prioridades" value={`${i.prioritiesDone}/${i.prioritiesTotal}`} hint="missões de hoje" tone="green" />
        <IndicatorCard icon={<Timer size={22} />} label="Foco" value={`${i.focusMinutes} min`} hint={`${i.focusSessions} sessão(ões)`} tone="blue" />
        <IndicatorCard icon={<CheckCircle2 size={22} />} label="Missões concluídas" value={i.missionsDone} hint="hoje" tone="green" />
      </div>
      <Modal open={explain} onClose={() => setExplain(false)} title="Life Score — como é calculado" size="sm">
        <p className="text-sm text-rpg-text/90">Média das dimensões que têm dados reais (Saúde e Hábitos sempre contam, por serem do dia). Mesma metodologia do Dashboard e do Analytics.</p>
        <ul className="mt-2 space-y-1">
          {Object.entries(hub.lifeScore.dims).map(([k, v]) => (
            <li key={k}>
              <RPGProgressBar label={DIM_LABEL[k] ?? k} value={v} max={100} valueLabel={`${Math.round(v)}`} tone="purple" />
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

/* ═══════════════════════════════ Ritual ═══════════════════════════════ */

const KIND_LABEL: Record<RitualKind, string> = { manual: "Manual", planning: "Planejamento (missão principal ou intenção)", task: "Missão concluída", habit: "Hábito", focus: "Sessão de foco (15+ min)", health: "Saúde (água, treino ou humor)", study: "Estudo/leitura (15+ min)", journal: "Diário escrito" };

export function RitualPanel({ hub, onStartFocus, notify, compact }: { hub: TodayHub; onStartFocus: () => void; notify: Notify; compact?: boolean }) {
  const { toggleRitual } = useTodayActions();
  const [config, setConfig] = useState(false);
  const r = hub.ritual;
  return (
    <KitSection
      title="Ritual da jornada"
      icon={<Crown size={16} />}
      tone="gold"
      action={
        <span className="flex items-center gap-2">
          <span className="font-pixel text-[10px] text-rpg-green">
            {r.done}/{r.total}
          </span>
          <button type="button" onClick={() => setConfig(true)} className="flex h-8 w-8 items-center justify-center text-rpg-muted hover:text-rpg-text" aria-label="Configurar ritual">
            <Settings2 size={14} aria-hidden />
          </button>
        </span>
      }
    >
      <ol className="space-y-1">
        {r.steps.map((s, i) => {
          const firstOpen = r.steps.findIndex((x) => !x.done) === i;
          return (
            <li key={s.id} className={clsx("flex items-center gap-2 border px-2 py-1.5", firstOpen ? "border-rpg-gold/70 bg-rpg-gold/10" : "border-transparent")} style={R}>
              {s.auto ? (
                s.done ? <CheckCircle2 size={18} className="shrink-0 text-rpg-green" aria-label="Concluída" /> : <Circle size={18} className="shrink-0 text-rpg-muted" aria-label="Pendente" />
              ) : (
                <button
                  type="button"
                  aria-pressed={s.done}
                  aria-label={s.done ? `Reabrir ${s.label}` : `Concluir ${s.label}`}
                  onClick={() => toggleRitual.mutate({ id: s.id, done: !s.done }, { onError: () => notify("Não foi possível atualizar.", "error") })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center"
                >
                  {s.done ? <CheckCircle2 size={18} className="text-rpg-green" /> : <Circle size={18} className="text-rpg-muted" />}
                </button>
              )}
              <span className={clsx("min-w-0 flex-1 text-sm", s.done ? "text-rpg-muted line-through" : "text-rpg-text")}>{s.label}</span>
              {!compact && s.auto && <span className="hidden text-[10px] text-rpg-muted sm:inline">automático</span>}
              {!s.done && firstOpen && (s.kind === "focus" || s.kind === "study" || s.kind === "task") && (
                <RPGButton variant="primary" className="min-h-[32px] px-2 text-xs" onClick={onStartFocus} disabled={!!hub.timer}>
                  Iniciar <ChevronRight size={12} aria-hidden />
                </RPGButton>
              )}
              {!s.done && s.kind === "journal" && (
                <Link to="/diario" className="text-[11px] text-rpg-blue hover:underline">
                  Diário
                </Link>
              )}
              {!s.done && s.kind === "habit" && (
                <Link to="/hoje?aba=dia" className="text-[11px] text-rpg-blue hover:underline">
                  Hábitos
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {!compact && (
        <div className="mt-2 flex gap-1" aria-label="Histórico do ritual (7 dias)">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(`${hub.today}T12:00:00`);
            d.setDate(d.getDate() - (6 - i));
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const n = r.history.find((h) => h.day === key)?.checks ?? 0;
            return (
              <span key={key} title={`${d.toLocaleDateString("pt-BR")}: ${n} etapa(s)`} className={clsx("h-3 flex-1", n >= r.total ? "bg-rpg-green" : n > 0 ? "bg-rpg-green/40" : "bg-rpg-bg-2")} style={{ borderRadius: 2 }} />
            );
          })}
        </div>
      )}
      <RitualConfigModal open={config} hub={hub} onClose={() => setConfig(false)} notify={notify} />
    </KitSection>
  );
}

function RitualConfigModal({ open, hub, onClose, notify }: { open: boolean; hub: TodayHub; onClose: () => void; notify: Notify }) {
  const { saveRitual } = useTodayActions();
  const [steps, setSteps] = useState<Array<{ id?: string; label: string; kind: RitualKind; refId: string | null }>>([]);
  useEffect(() => {
    if (open) setSteps(hub.ritual.steps.map((s) => ({ id: hub.ritual.custom ? s.id : undefined, label: s.label, kind: s.kind, refId: s.refId })));
  }, [open, hub.ritual]);
  const move = (i: number, d: number) => {
    const n = [...steps];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x!);
    setSteps(n);
  };
  return (
    <Modal open={open} onClose={onClose} title="Configurar ritual" size="md">
      <p className="mb-2 text-xs text-rpg-muted">Etapas automáticas concluem sozinhas pelos registros reais (nada é duplicado). Etapas manuais você marca.</p>
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="grid gap-1.5 border border-rpg-border p-2 sm:grid-cols-[minmax(0,1fr)_200px_auto]" style={R}>
            <input aria-label="Nome da etapa" className={FIELD} style={R} value={s.label} maxLength={80} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <select aria-label="Tipo" className={FIELD} style={R} value={s.kind} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, kind: e.target.value as RitualKind, refId: null } : x)))}>
              {(Object.keys(KIND_LABEL) as RitualKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1">
              <button type="button" className="h-9 w-9 text-rpg-muted" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
              <button type="button" className="h-9 w-9 text-rpg-muted" onClick={() => move(i, 1)} aria-label="Descer">↓</button>
              <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-red" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Remover etapa">
                <Trash2 size={14} />
              </button>
            </span>
            {s.kind === "habit" && (
              <select aria-label="Hábito vinculado" className={clsx(FIELD, "sm:col-span-3")} style={R} value={s.refId ?? ""} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, refId: e.target.value || null } : x)))}>
                <option value="">Todos os hábitos de hoje</option>
                {hub.habits.items.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            {s.kind === "task" && (
              <select aria-label="Missão vinculada" className={clsx(FIELD, "sm:col-span-3")} style={R} value={s.refId ?? ""} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, refId: e.target.value || null } : x)))}>
                <option value="">Missão principal do dia</option>
                {hub.missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <RPGButton variant="secondary" disabled={steps.length >= 12} onClick={() => setSteps([...steps, { label: "Nova etapa", kind: "manual", refId: null }])}>
          <Plus size={14} aria-hidden /> Adicionar etapa
        </RPGButton>
        <span className="flex gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton
            variant="gold"
            disabled={!steps.length || steps.some((s) => s.label.trim().length < 2) || saveRitual.isPending}
            onClick={() => saveRitual.mutate(steps, { onSuccess: () => (notify("Ritual salvo."), onClose()), onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível salvar.", "error") })}
          >
            Salvar ritual
          </RPGButton>
        </span>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════ Missões ═══════════════════════════════ */

const PRIO_TONE = { Alta: "red", Média: "orange", Baixa: "muted" } as const;

export function MissionsPanel({ hub, notify, onStart, limit }: { hub: TodayHub; notify: Notify; onStart: (taskId: string) => void; limit?: number }) {
  const { updateTask } = useTasks();
  const { setMain } = useTodayActions();
  const { toggleSubtask } = usePlanningActions();
  const sync = useJourneySync();
  const [resched, setResched] = useState<TodayMission | null>(null);
  const [date, setDate] = useState("");
  const list = (limit ? hub.missions.slice(0, limit) : hub.missions).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const complete = async (m: TodayMission) => {
    try {
      await updateTask({ id: m.id, patch: { status: "Concluído" } });
      sync(["tasks"]);
      notify(`Missão concluída: ${m.title}. Recompensa pelas regras oficiais.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
    }
  };
  return (
    <KitSection title={`Missões de hoje (${hub.missions.length})`} icon={<Swords size={16} />} action={<Link to="/tarefas?nova=1" className="text-xs text-rpg-blue hover:underline">+ Nova missão</Link>}>
      {hub.main && hub.main.subtaskList.length > 0 && !limit && (
        <div className="mb-2 border border-rpg-gold/50 bg-rpg-gold/5 p-2" style={R}>
          <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-gold">Etapas da missão principal</p>
          <ul className="space-y-0.5">
            {hub.main.subtaskList.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-[34px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.done} onChange={(e) => toggleSubtask.mutate({ id: s.id, done: e.target.checked }, { onSuccess: () => sync(["tasks"]) })} />
                  <span className={s.done ? "text-rpg-muted line-through" : "text-rpg-text"}>{s.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma missão com prazo ou planejada para hoje. <Link to="/tarefas" className="text-rpg-blue hover:underline">Ver todas as missões</Link></p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className={clsx("border-2 p-2.5", m.isMain ? "border-rpg-gold bg-rpg-gold/5" : "border-rpg-border bg-rpg-bg-2/60")} style={R}>
              <div className="flex flex-wrap items-start gap-1.5">
                <RPGBadge tone={m.isMain ? "gold" : m.overdue ? "red" : "blue"}>{m.isMain ? "Principal (fixada)" : m.overdue ? "Atrasada" : "Hoje"}</RPGBadge>
                <RPGBadge tone={PRIO_TONE[m.priority as keyof typeof PRIO_TONE] ?? "muted"}>{m.priority}</RPGBadge>
                {hub.timer?.linkId === m.id && <RPGBadge tone="purple">Em foco</RPGBadge>}
                <span className="ml-auto font-pixel text-[10px]">
                  <span className="text-rpg-purple">+{m.reward.xp} XP</span> <span className="text-rpg-gold-light">+{m.reward.coins} 🪙</span>
                </span>
              </div>
              <Link to={`/tarefas?task=${m.id}`} className="mt-1 block font-semibold text-rpg-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[11px] text-rpg-muted">
                {m.projectName ?? "Sem projeto"} · {m.dueDate ? new Date(`${m.dueDate}T12:00:00`).toLocaleDateString("pt-BR") : "planejada para hoje"}
                {m.estimateMinutes ? ` · ~${m.estimateMinutes} min` : ""}
                {m.spentMinutes ? ` · ${m.spentMinutes} min feitos` : ""}
              </p>
              {m.subtasks.total > 0 && <RPGProgressBar className="mt-1" label="Subtarefas" showLabel={false} value={m.subtasks.done} max={m.subtasks.total} tone="purple" />}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <RPGButton variant="primary" className="min-h-[34px] px-2 text-xs" disabled={!!hub.timer} onClick={() => onStart(m.id)}>
                  <Play size={12} aria-hidden /> Iniciar
                </RPGButton>
                <RPGButton variant="success" className="min-h-[34px] px-2 text-xs" onClick={() => void complete(m)}>
                  <Check size={12} aria-hidden /> Concluir
                </RPGButton>
                {m.isMain ? (
                  <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" onClick={() => setMain.mutate(null, { onSuccess: () => notify("Missão desafixada. O dia segue guiado pelo Foco agora.") })}>
                    <Star size={12} aria-hidden /> Desafixar
                  </RPGButton>
                ) : (
                  <RPGButton
                    variant="secondary"
                    className="min-h-[34px] px-2 text-xs"
                    title="Opcional: a missão fixada rende o bônus oficial de missão principal ao ser concluída."
                    onClick={() => setMain.mutate(m.id, { onSuccess: () => notify("Missão fixada como principal (opcional) — bônus oficial ao concluir.") })}
                  >
                    <Star size={12} aria-hidden /> Fixar como principal
                  </RPGButton>
                )}
                <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" onClick={() => (setResched(m), setDate(m.dueDate ?? hub.today))}>
                  <CalendarClock size={12} aria-hidden /> Reagendar
                </RPGButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!resched} onClose={() => setResched(null)} title="Reagendar missão" size="sm">
        {resched && (
          <div className="space-y-2 text-sm">
            <p className="text-rpg-text">{resched.title}</p>
            <input type="date" className={FIELD} style={R} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex justify-end gap-2">
              <RPGButton variant="ghost" onClick={() => setResched(null)}>
                Cancelar
              </RPGButton>
              <RPGButton
                variant="gold"
                disabled={!date}
                onClick={async () => {
                  await updateTask({ id: resched.id, patch: { dueDate: date } });
                  sync(["tasks"]);
                  notify("Prazo atualizado.");
                  setResched(null);
                }}
              >
                Salvar
              </RPGButton>
            </div>
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

/* ═══════════════════════════════ Cronômetro ═══════════════════════════════ */

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Cronômetro persistido no servidor: o tempo é recalculado pelos timestamps (aba minimizada/recarga não perdem nada). */
export function FocusTimer({ hub, notify, preset }: { hub: TodayHub; notify: Notify; preset?: { taskId: string } | null }) {
  const { startTimer, pauseTimer, stopTimer } = useTodayActions();
  const decks = useGrimoireDecks();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [minutes, setMinutes] = useState(25);
  const [link, setLink] = useState<string>(preset ? `task:${preset.taskId}` : "");
  const [, tick] = useState(0);
  const stopping = useRef(false);
  const t = hub.timer;
  useEffect(() => {
    if (preset) setLink(`task:${preset.taskId}`);
  }, [preset]);
  useEffect(() => {
    if (!t || t.pausedAt) return;
    const i = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(i);
  }, [t]);
  const elapsed = t ? Math.max(0, (t.pausedAt ? Date.parse(t.pausedAt) : Date.now()) - Date.parse(t.startedAt) - t.pausedMs) : 0;
  const planned = t?.plannedMinutes ? t.plannedMinutes * 60_000 : null;
  const stop = () => {
    if (stopping.current) return;
    stopping.current = true;
    stopTimer.mutate(undefined, {
      onSuccess: (r) => notify(r.minutes >= 1 ? `Sessão registrada: ${r.minutes} min de foco.` : "Sessão encerrada (menos de 1 min não conta)."),
      onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível encerrar.", "error"),
      onSettled: () => (stopping.current = false),
    });
  };
  // Pomodoro/bloco: encerra sozinho ao atingir a duração (uma única vez).
  useEffect(() => {
    if (t && planned && !t.pausedAt && elapsed >= planned) stop();
  });
  const start = () => {
    const [type, id] = link ? link.split(":") : [null, null];
    startTimer.mutate({ mode, plannedMinutes: mode === "free" ? null : minutes, linkType: (type as "task" | "deck" | null) ?? null, linkId: id ?? null }, { onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível iniciar.", "error") });
  };
  return (
    <KitSection title="Cronômetro de foco" icon={<AlarmClock size={16} />} tone="legendary">
      {t ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-pixel text-[10px] uppercase text-rpg-muted">{t.mode === "pomodoro" ? "Pomodoro" : t.mode === "block" ? "Bloco" : "Foco livre"}{t.linkLabel ? ` · ${t.linkLabel}` : ""}</p>
          <p className="font-rpg text-5xl font-bold tabular-nums text-rpg-gold-light" aria-live="polite">{planned ? fmtClock(Math.max(0, planned - elapsed)) : fmtClock(elapsed)}</p>
          {planned && <RPGProgressBar className="w-full" label="Progresso" showLabel={false} value={elapsed} max={planned} tone="purple" />}
          <p className="text-[11px] text-rpg-muted">{t.pausedAt ? "Pausado" : "Em andamento"} · {fmtClock(elapsed)} efetivos</p>
          <div className="flex gap-2">
            <RPGButton variant="secondary" onClick={() => pauseTimer.mutate(!t.pausedAt)} disabled={pauseTimer.isPending}>
              {t.pausedAt ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />} {t.pausedAt ? "Retomar" : "Pausar"}
            </RPGButton>
            <RPGButton variant="danger" onClick={stop} disabled={stopTimer.isPending}>
              <Square size={14} aria-hidden /> Encerrar
            </RPGButton>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Modo">
            {(["pomodoro", "block", "free"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => (setMode(m), setMinutes(m === "pomodoro" ? 25 : 50))} className={clsx("min-h-[40px] border-2 text-xs", mode === m ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                {m === "pomodoro" ? "Pomodoro" : m === "block" ? "Bloco" : "Livre"}
              </button>
            ))}
          </div>
          {mode !== "free" && (
            <div className="flex flex-wrap gap-1.5">
              {(mode === "pomodoro" ? [15, 25, 45] : [30, 50, 90, 120]).map((v) => (
                <button key={v} type="button" onClick={() => setMinutes(v)} className={clsx("min-h-[36px] border px-2.5 text-xs", minutes === v ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R}>
                  {v} min
                </button>
              ))}
              <input type="number" aria-label="Duração personalizada (min)" min={5} max={480} value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(480, Number(e.target.value) || 25)))} className="min-h-[36px] w-20 border border-rpg-border bg-rpg-bg-2 px-2 text-xs text-rpg-text" style={R} />
            </div>
          )}
          <select aria-label="Vincular atividade" className={FIELD} style={R} value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Sem vínculo</option>
            <optgroup label="Missões de hoje">
              {hub.missions.map((m) => (
                <option key={m.id} value={`task:${m.id}`}>
                  {m.title}
                </option>
              ))}
            </optgroup>
            {(decks.data ?? []).length > 0 && (
              <optgroup label="Estudo (Grimório)">
                {(decks.data ?? []).map((d) => (
                  <option key={d.id} value={`deck:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <RPGButton variant="gold" className="w-full" onClick={start} disabled={startTimer.isPending}>
            <Play size={14} aria-hidden /> Iniciar {mode === "free" ? "foco livre" : `${minutes} min`}
          </RPGButton>
          <p className="text-[10px] text-rpg-muted">A sessão vira um apontamento de foco (fonte oficial). XP de foco é pago uma vez por sessão, pela regra de blocos.</p>
        </div>
      )}
    </KitSection>
  );
}

export function FocusBlocksPanel({ hub }: { hub: TodayHub }) {
  return (
    <KitSection title="Blocos de foco sugeridos" icon={<BarChart3 size={16} />}>
      {hub.focusBlocks.length === 0 ? (
        <p className="text-sm text-rpg-muted">Sem janelas livres de 50 min no restante do dia (pela Agenda).</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {hub.focusBlocks.map((b) => (
            <li key={b.start} className="flex justify-between border border-rpg-border/60 px-2 py-1.5" style={R}>
              <span className="text-rpg-text">Bloco livre</span>
              <span className="font-pixel text-[11px] text-rpg-gold">
                {b.start}–{b.end}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-rpg-muted">Sugestão pelas janelas da Agenda. Nada é agendado automaticamente.</p>
    </KitSection>
  );
}

/* ═══════════════════════════════ Hábitos, agenda, sinais ═══════════════════════════════ */

export function HabitsToday({ hub, notify }: { hub: TodayHub; notify: Notify }) {
  const { checkIn } = useHabits();
  const sync = useJourneySync();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <KitSection title="Hábitos de hoje" icon={<Flame size={16} />} action={<span className="font-pixel text-[10px] text-rpg-green">{hub.habits.done}/{hub.habits.total}</span>}>
      {hub.habits.items.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum hábito previsto para hoje.</p>
      ) : (
        <ul className="divide-y divide-rpg-border/40">
          {hub.habits.items.map((h) => (
            <li key={h.id} className="flex items-center gap-2 py-1.5">
              <span aria-hidden>{h.icon ?? "🔁"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-rpg-text">{h.name}</span>
                <span className="text-[10px] text-rpg-muted">
                  {h.count}/{h.target}
                  {h.unit ? ` ${h.unit}` : ""} · 🔥 {h.streak}
                </span>
              </span>
              {h.done ? (
                <CheckCircle2 size={18} className="text-rpg-green" aria-label="Cumprido" />
              ) : (
                <button
                  type="button"
                  disabled={busy === h.id}
                  aria-label={`Concluir ${h.name}`}
                  onClick={async () => {
                    setBusy(h.id);
                    try {
                      await checkIn({ id: h.id, entryDate: hub.today, count: h.target });
                      sync(["habits"]);
                      notify(`Hábito cumprido: ${h.name}.`);
                    } catch (e) {
                      notify(e instanceof Error ? e.message : "Não foi possível registrar.", "error");
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center border border-rpg-green/60 text-rpg-green hover:bg-rpg-green/15"
                  style={R}
                >
                  <Check size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link to="/habitos" className="mt-1 inline-flex min-h-[32px] items-center text-xs text-rpg-blue hover:underline">
        Ver todos os hábitos →
      </Link>
    </KitSection>
  );
}

export function AgendaToday({ hub, notify, onStart }: { hub: TodayHub; notify: Notify; onStart: (taskId: string) => void }) {
  const sync = useJourneySync();
  const [form, setForm] = useState<{ title: string; time: string; minutes: number } | null>(null);
  const create = async () => {
    if (!form?.title.trim()) return;
    const start = new Date(`${hub.today}T${form.time || "09:00"}:00`);
    try {
      await eventsService.create({ title: form.title.trim(), startsAt: start.toISOString(), endsAt: new Date(start.getTime() + form.minutes * 60000).toISOString(), allDay: false });
      sync(["events"]);
      notify("Compromisso criado na Agenda.");
      setForm(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível criar.", "error");
    }
  };
  return (
    <KitSection
      title="Agenda de hoje"
      icon={<CalendarDays size={16} />}
      action={
        <RPGButton variant="secondary" className="min-h-[32px] px-2 text-xs" onClick={() => setForm({ title: "", time: "09:00", minutes: 60 })} aria-label="Novo compromisso">
          <Plus size={13} aria-hidden />
        </RPGButton>
      }
    >
      {hub.conflicts.length > 0 && (
        <p className="mb-1.5 border border-rpg-red/60 bg-rpg-red/10 px-2 py-1 text-xs text-rpg-red" style={R}>
          ⚠ {hub.conflicts.length} conflito(s): {hub.conflicts[0]!.a} × {hub.conflicts[0]!.b}
        </p>
      )}
      {hub.agenda.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum compromisso hoje.</p>
      ) : (
        <ol className="space-y-1">
          {hub.agenda.map((a) => {
            const d = durMin(a.startsAt, a.endsAt);
            const ended = a.endsAt && a.endsAt.length > 10 && Date.parse(a.endsAt) < Date.now();
            return (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className={clsx("w-12 shrink-0 font-pixel text-[11px] tabular-nums", ended ? "text-rpg-muted" : "text-rpg-gold")}>{hhmm(a.startsAt)}</span>
                <span className={clsx("h-2 w-2 shrink-0", a.sourceType === "task" ? "bg-rpg-orange" : a.sourceType === "life_admin" ? "bg-rpg-red" : "bg-rpg-blue")} style={{ borderRadius: 999 }} aria-hidden />
                {a.link ? (
                  <Link to={a.link} className={clsx("min-w-0 flex-1 truncate hover:underline", ended ? "text-rpg-muted" : "text-rpg-text")}>
                    {a.title}
                  </Link>
                ) : (
                  <span className={clsx("min-w-0 flex-1 truncate", ended ? "text-rpg-muted" : "text-rpg-text")}>{a.title}</span>
                )}
                {d != null && <span className="shrink-0 text-[10px] text-rpg-muted">{d} min</span>}
                {(a.blockTaskId || a.sourceType === "task") && !hub.timer && (
                  <button type="button" className="flex h-8 w-8 items-center justify-center text-rpg-purple" aria-label={`Iniciar foco em ${a.title}`} onClick={() => onStart(a.blockTaskId ?? a.sourceId ?? "")}>
                    <Play size={13} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Link to="/calendario" className="mt-1 inline-flex min-h-[32px] items-center text-xs text-rpg-blue hover:underline">
        Calendário completo · reagendar →
      </Link>
      <Modal open={!!form} onClose={() => setForm(null)} title="Novo compromisso hoje" size="sm">
        {form && (
          <div className="space-y-2 text-sm">
            <input aria-label="Título" className={FIELD} style={R} placeholder="Compromisso" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Horário" type="time" className={FIELD} style={R} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              <input aria-label="Duração (min)" type="number" min={5} max={720} className={FIELD} style={R} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Math.max(5, Number(e.target.value) || 60) })} />
            </div>
            <div className="flex justify-end gap-2">
              <RPGButton variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </RPGButton>
              <RPGButton variant="gold" onClick={() => void create()} disabled={!form.title.trim()}>
                Criar
              </RPGButton>
            </div>
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

/** Sinais do dia: valores do dia (sono = a noite que terminou hoje). Não são diagnósticos. */
export function SignalsPanel({ hub }: { hub: TodayHub }) {
  const s = hub.signals;
  const sleepH = s.sleep ? `${Math.floor(s.sleep.minutes / 60)}h${String(s.sleep.minutes % 60).padStart(2, "0")}` : "—";
  const cells = [
    { icon: <Bed size={18} />, label: "Sono", value: sleepH, hint: s.sleep ? "noite passada" : "sem registro", ok: !!s.sleep && s.sleep.minutes >= 360 && s.sleep.minutes <= 720 },
    { icon: <Smile size={18} />, label: "Humor", value: s.mood?.mood != null ? `${s.mood.mood}/5` : "—", hint: s.mood ? "último hoje" : "sem check-in", ok: (s.mood?.mood ?? 0) >= 3 },
    { icon: <Zap size={18} />, label: "Energia", value: s.mood?.energy != null ? `${s.mood.energy}/5` : "—", hint: s.mood ? "último hoje" : "sem check-in", ok: (s.mood?.energy ?? 0) >= 3 },
    { icon: <Dumbbell size={18} />, label: "Exercício", value: `${s.workoutMinutes} min`, hint: `${s.workouts} treino(s) hoje`, ok: s.workouts > 0 },
    { icon: <Droplets size={18} />, label: "Água", value: `${(s.waterMl / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`, hint: "hoje", ok: s.waterMl > 0 },
    { icon: <BookOpen size={18} />, label: "Leitura", value: `${s.readingPages} pág.`, hint: "hoje", ok: s.readingPages > 0 },
  ];
  return (
    <KitSection title="Sinais da jornada" icon={<Sparkles size={16} />} action={<Link to="/saude" className="text-xs text-rpg-blue hover:underline">Saúde →</Link>}>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 xl:grid-cols-3">
        {cells.map((c) => (
          <li key={c.label} className={clsx("flex flex-col items-center border-2 p-1.5 text-center", c.ok ? "border-rpg-green/50" : "border-rpg-border")} style={R}>
            <span className="text-rpg-purple" aria-hidden>
              {c.icon}
            </span>
            <span className="text-[10px] text-rpg-muted">{c.label}</span>
            <span className="font-rpg text-sm font-bold text-rpg-text tabular-nums">{c.value}</span>
            <span className="text-[9px] text-rpg-muted">{c.hint}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-rpg-muted">Registros do dia, não diagnóstico.</p>
    </KitSection>
  );
}

/* ═══════════════════════════════ Recompensas, IA, encerramento ═══════════════════════════════ */

export function RewardsPanel({ hub }: { hub: TodayHub }) {
  const r = hub.rewards;
  return (
    <section className="rpg-panel rpg-panel-legendary grid items-center gap-3 p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]" aria-label="Recompensas do dia">
      <img src={`${ART}/chest.webp`} alt="" aria-hidden className="pixelated hidden h-16 w-auto md:block" />
      <div className="min-w-0">
        <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Próxima recompensa</p>
        {r.nextHabit ? (
          <>
            <p className="font-rpg font-bold text-rpg-text">
              Sequência de {r.nextHabit.days} dias — {r.nextHabit.habitName}
            </p>
            <RPGProgressBar className="mt-1" label="Sequência" value={r.nextHabit.days - r.nextHabit.missing} max={r.nextHabit.days} valueLabel={`${r.nextHabit.days - r.nextHabit.missing}/${r.nextHabit.days} dias`} tone="purple" />
          </>
        ) : (
          <p className="text-sm text-rpg-muted">Mantenha hábitos diários para liberar marcos de sequência.</p>
        )}
        {r.achievementsToday.length > 0 && <p className="mt-1 text-[11px] text-rpg-green">🏆 Hoje: {r.achievementsToday.map((a) => a.title).join(", ")}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.nextHabit && (
          <RPGBadge tone="purple">
            +{r.nextHabit.xp} XP · +{r.nextHabit.coins} 🪙
          </RPGBadge>
        )}
        {r.quests && (
          <Link to="/quests">
            <RPGBadge tone={r.quests.claimable ? "green" : "gold"}>
              Quests {r.quests.done}/{r.quests.total}
              {r.quests.claimable ? ` · ${r.quests.claimable} p/ resgatar` : ""}
            </RPGBadge>
          </Link>
        )}
      </div>
    </section>
  );
}

const QUICK = ["Planejar meu dia", "O que faço agora?", "Organizar prioridades", "Iniciar foco", "Revisar pendências"];
const KIND = { dado: { label: "Dado real", tone: "blue" }, inferencia: { label: "Inferência", tone: "purple" }, sugestao: { label: "Sugestão", tone: "green" } } as const;

export function DayCouncil({ hub, compact, onStartFocus }: { hub: TodayHub; compact?: boolean; onStartFocus: () => void }) {
  const advisor = useAdvisor("today");
  const [q, setQ] = useState("");
  const ask = (question: string, useAi: boolean) => (question === "Iniciar foco" ? onStartFocus() : advisor.mutate({ useAi, question }));
  return (
    <section className="rpg-panel flex flex-col gap-2 p-3" aria-label="Conselho do dia">
      <div className="flex items-start gap-3">
        <img src={`${ART}/advisor.webp`} alt="" aria-hidden className="pixelated h-14 w-14 shrink-0 border-2 border-rpg-purple" style={R} />
        <div className="min-w-0 flex-1">
          <p className="rpg-title text-sm font-bold uppercase">Conselho do dia (IA)</p>
          <p className="text-sm text-rpg-text">{hub.nextAction.text}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((x) => (
          <button key={x} type="button" disabled={advisor.isPending} onClick={() => ask(x, true)} className="min-h-[34px] border border-rpg-purple/60 px-2 text-xs text-rpg-text hover:bg-rpg-purple/15" style={R}>
            {x}
          </button>
        ))}
      </div>
      {!compact && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) ask(q.trim(), true);
          }}
        >
          <input aria-label="Pergunta ao conselheiro" className={FIELD} style={R} maxLength={400} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pergunte sobre o seu dia…" />
          <RPGButton type="submit" variant="primary" disabled={advisor.isPending || !q.trim()}>
            <Wand2 size={14} aria-hidden />
          </RPGButton>
        </form>
      )}
      {advisor.isPending && <div className="h-12 animate-pulse rpg-bar" aria-busy />}
      {advisor.data && (
        <div className="space-y-1">
          <RPGBadge tone={advisor.data.ai ? "purple" : "blue"}>{advisor.data.ai ? "Gerado por IA" : "Leitura automática (sem IA)"}</RPGBadge>
          {advisor.data.insufficient && <p className="text-xs text-rpg-orange">Poucos dados para conclusões.</p>}
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
          <p className="text-[10px] text-rpg-muted">{advisor.data.disclaimer}</p>
        </div>
      )}
    </section>
  );
}

export function DayClosePanel({ notify }: { notify: Notify }) {
  const { closeDraft, closeSave } = useTodayActions();
  const [text, setText] = useState<string | null>(null);
  return (
    <KitSection title="Encerramento do dia" icon={<ScrollText size={16} />}>
      {text == null ? (
        <>
          <p className="text-sm text-rpg-muted">Monta a síntese do dia com os seus registros. Você revisa antes de salvar no Diário.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => closeDraft.mutate(undefined, { onSuccess: (r) => setText(r.text) })} disabled={closeDraft.isPending}>
            <Moon size={14} aria-hidden /> Encerrar o dia
          </RPGButton>
        </>
      ) : (
        <div className="space-y-2">
          <textarea aria-label="Síntese do dia" className={clsx(FIELD, "min-h-[150px]")} style={R} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setText(null)}>
              Descartar
            </RPGButton>
            <RPGButton variant="gold" disabled={closeSave.isPending || text.trim().length < 5} onClick={() => closeSave.mutate(text, { onSuccess: () => (notify("Síntese salva no Diário de hoje."), setText(null)), onError: () => notify("Não foi possível salvar.", "error") })}>
              Salvar no Diário
            </RPGButton>
          </div>
        </div>
      )}
    </KitSection>
  );
}

/* ═══════════════════════════════ Tela ═══════════════════════════════ */

const TABS = ["visao", "dia", "missoes", "foco", "rituais", "automacoes", "ia"] as const;
type Tab = (typeof TABS)[number];

/** HOJE — Central da Jornada Diária (tema RPG). */
export function TodayCentral() {
  const q = useTodayHub();
  const { startTimer } = useTodayActions();
  const [tab, setTab] = useUrlTab(TABS, "visao");
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify: Notify = (msg, tone = "success") => setToast({ msg, tone });
  const hub = q.data;
  const startOn = (taskId: string | null) => {
    if (!taskId) return setTab("foco");
    startTimer.mutate({ mode: "pomodoro", plannedMinutes: 25, linkType: "task", linkId: taskId }, { onSuccess: () => notify("Pomodoro de 25 min iniciado."), onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível iniciar.", "error") });
  };
  const tabs = useMemo(
    () => [
      { value: "visao" as Tab, label: "Visão Geral", icon: <LayoutGrid size={15} /> },
      { value: "dia" as Tab, label: "Meu Dia", icon: <CalendarDays size={15} /> },
      { value: "missoes" as Tab, label: "Missões", icon: <Swords size={15} />, badge: hub?.missions.filter((m) => m.overdue).length || undefined },
      { value: "foco" as Tab, label: "Foco", icon: <Timer size={15} /> },
      { value: "rituais" as Tab, label: "Rituais", icon: <Crown size={15} /> },
      { value: "automacoes" as Tab, label: "Automações", icon: <Zap size={15} /> },
      { value: "ia" as Tab, label: "IA Copiloto", icon: <Bot size={15} /> },
    ],
    [hub?.missions],
  );
  if (q.isError)
    return (
      <div className="w-full px-4 py-6 md:px-6 lg:px-8">
        <div className="rpg-panel p-6 text-center">
          <p className="text-sm text-rpg-red">Não foi possível carregar o seu dia.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void q.refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      </div>
    );
  if (!hub)
    return (
      <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8" aria-busy aria-label="Carregando o seu dia">
        <div className="rpg-panel h-44 animate-pulse" />
        <div className="rpg-panel h-24 animate-pulse" />
        <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="rpg-panel h-64 animate-pulse" />)}</div>
      </div>
    );
  return (
    <div className="w-full space-y-3 px-4 py-6 md:px-6 lg:px-8">
      <TodayBanner hub={hub} onStart={(id) => startOn(id)} />
      <TodayIndicators hub={hub} />
      {hub.timer && tab !== "foco" && (
        <button type="button" onClick={() => setTab("foco")} className="rpg-panel flex w-full items-center gap-2 border-rpg-purple p-2 text-left text-sm text-rpg-text">
          <Timer size={16} className="text-rpg-purple" aria-hidden /> Foco em andamento{hub.timer.linkLabel ? `: ${hub.timer.linkLabel}` : ""} — abrir cronômetro
        </button>
      )}
      <ModuleTabs label="Seções do dia" value={tab} onChange={setTab} tabs={tabs} />
      {tab === "visao" && (
        <>
          <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <RitualPanel hub={hub} onStartFocus={() => startOn(hub.main?.id ?? null)} notify={notify} compact />
            <MissionsPanel hub={hub} notify={notify} onStart={startOn} limit={3} />
            <div className="space-y-3 lg:col-span-2 2xl:col-span-1">
              <AgendaToday hub={hub} notify={notify} onStart={startOn} />
              <SignalsPanel hub={hub} />
            </div>
          </div>
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <RewardsPanel hub={hub} />
            <DayCouncil hub={hub} compact onStartFocus={() => setTab("foco")} />
          </div>
        </>
      )}
      {tab === "dia" && (
        <div className="grid items-start gap-3 lg:grid-cols-3">
          <HabitsToday hub={hub} notify={notify} />
          <AgendaToday hub={hub} notify={notify} onStart={startOn} />
          <div className="space-y-3">
            <SignalsPanel hub={hub} />
            <RewardsPanel hub={hub} />
          </div>
        </div>
      )}
      {tab === "missoes" && <MissionsPanel hub={hub} notify={notify} onStart={startOn} />}
      {tab === "foco" && (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FocusTimer hub={hub} notify={notify} preset={hub.main ? { taskId: hub.main.id } : null} />
          <div className="space-y-3">
            <FocusBlocksPanel hub={hub} />
            <KitSection title="Hoje no foco" icon={<Target size={16} />}>
              <p className="text-sm text-rpg-text">
                {hub.indicators.focusMinutes} min em {hub.indicators.focusSessions} sessão(ões).
              </p>
              <Link to="/tarefas" className="text-xs text-rpg-blue hover:underline">
                Histórico de apontamentos nas Missões →
              </Link>
            </KitSection>
          </div>
        </div>
      )}
      {tab === "rituais" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RitualPanel hub={hub} onStartFocus={() => setTab("foco")} notify={notify} />
          <DayClosePanel notify={notify} />
        </div>
      )}
      {tab === "automacoes" && <AutomationsPanel module="today" title="Automações do Hoje" intro="Planejamento, próxima ação, blocos de foco, progresso, alertas e encerramento. Nada é criado ou movido sem a sua aprovação." />}
      {tab === "ia" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <DayCouncil hub={hub} onStartFocus={() => setTab("foco")} />
          <DayClosePanel notify={notify} />
        </div>
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

