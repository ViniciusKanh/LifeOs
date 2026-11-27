import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LIFE_DIM_LABEL } from "@/utils/lifeDims";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Coins,
  Flame,
  Heart,
  History,
  Lightbulb,
  Loader2,
  Moon,
  Play,
  Repeat,
  ScrollText,
  Settings2,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Wand2,
  Zap,
} from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar, RPGToast } from "@/components/rpg";
import { AdvisorPanel, KitSection } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { useUrlTab } from "@/components/hero/HeroShared";
import { useTavern3, useTavern3Actions } from "@/hooks/useTavern3";
import { STEP_LABEL, tavern3Service, type StepKey, type Tavern3 } from "@/services/tavern3Service";
import { healthService } from "@/services/healthService";
import { LoreScroll } from "@/components/tavern3/LoreScroll";
import { tavernService } from "@/services/tavernService";
import { ApiError } from "@/services/api";
import { MOOD_EMOJI } from "@/utils/moodScale";

const ART = "/assets/rpg/modules/tavern3";
const R = { borderRadius: 4 };
type Toast = (m: string, tone?: "success" | "error") => void;
const TABS = ["visao", "balanco", "aprendizados", "pergaminho", "amanha", "conquistas", "historico", "conselho", "automacoes"] as const;
type Tab = (typeof TABS)[number];
const DIM_LABEL: Record<string, string> = LIFE_DIM_LABEL;
const TIER: Record<string, { label: string; tone: "muted" | "blue" | "gold" | "purple" }> = { bronze: { label: "Comum", tone: "muted" }, silver: { label: "Raro", tone: "blue" }, gold: { label: "Épico", tone: "gold" }, platinum: { label: "Lendário", tone: "purple" } };
const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold";

/* ═════════════════════ peças ═════════════════════ */

/** Campo de texto do ritual com salvamento ao sair do campo. */
function RitualField({ label, value, field, placeholder, rows = 2 }: { label: string; value: string; field: "highlights" | "challenges" | "decisions" | "learned" | "worked" | "improve" | "repeatThis" | "avoidTomorrow" | "selfCare"; placeholder?: string; rows?: number }) {
  const { saveRitual } = useTavern3Actions();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="block text-[11px] text-rpg-muted">
      {label}
      <textarea rows={rows} value={v} maxLength={4000} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && saveRitual.mutate({ [field]: v })} className={`${FIELD} mt-1`} style={{ borderRadius: 3 }} />
    </label>
  );
}

function Banner({ t, onStart, onHistory }: { t: Tavern3; onStart: () => void; onHistory: () => void }) {
  return (
    <header className="relative min-h-[200px] overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2" style={R}>
      <img src={`${ART}/banner-scene.webp`} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-95 md:w-[58%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-transparent" aria-hidden />
      <div className="relative flex h-full flex-col justify-center gap-2 p-4 sm:p-5">
        <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-rpg-gold">{new Date(`${t.today}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
        <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">A Taverna</h1>
        <p className="max-w-md text-sm text-rpg-text/90">Balanço do dia, aprendizados e preparação para a próxima jornada.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <RPGButton variant="gold" onClick={onStart}>
            <Play size={14} aria-hidden /> Ver balanço
          </RPGButton>
          <RPGButton variant="ghost" onClick={onHistory}>
            <History size={14} aria-hidden /> Histórico
          </RPGButton>
        </div>
      </div>
    </header>
  );
}

function Indicators({ t }: { t: Tavern3 }) {
  const i = t.indicators;
  const card = (icon: ReactNode, value: ReactNode, label: string, tone: string, hint?: string) => (
    <div className="flex min-w-0 flex-col items-center gap-0.5 border-2 border-rpg-border bg-rpg-panel px-2 py-2.5 text-center" style={R} title={hint}>
      <span className={clsx("[&>svg]:h-5 [&>svg]:w-5", tone)} aria-hidden>
        {icon}
      </span>
      <span className={clsx("font-rpg text-lg font-bold leading-tight tabular-nums", tone)}>{value}</span>
      <span className="text-[10px] leading-tight text-rpg-muted">{label}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {card(<Zap />, `+${i.xpToday.toLocaleString("pt-BR")}`, "XP hoje", "text-rpg-purple")}
      {card(<Coins />, `+${i.coinsToday}`, "Moedas", "text-rpg-gold-light")}
      {card(<Trophy />, i.missionsDone, "Missões", "text-rpg-orange")}
      {card(<Repeat />, `${i.habits.done}/${i.habits.total}`, "Hábitos", "text-rpg-green")}
      {card(<Flame />, `${i.streakDays} dias`, "Sequência", "text-rpg-red")}
      {card(<BarChart3 />, i.lifeScore, "Life Score", "text-rpg-pink", i.lifeScoreAvg7 != null ? `Média 7 dias: ${i.lifeScoreAvg7}` : "Sem histórico de 7 dias")}
      {card(<Star />, i.achievementsToday, "Conquistas", "text-rpg-gold")}
    </div>
  );
}
function BalanceRadar({ t }: { t: Tavern3 }) {
  const data = t.balance.dims.map((d) => ({ dim: DIM_LABEL[d.key] ?? d.key, hoje: d.today, media: d.avg7 ?? 0 }));
  const hasAvg = t.balance.dims.some((d) => d.avg7 != null);
  return (
    <KitSection title="Balanço do dia" icon={<Sparkles size={16} />}>
      <div className="h-[240px] w-full" role="img" aria-label={`Life Score por dimensão: ${data.map((d) => `${d.dim} ${d.hoje}`).join(", ")}`}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="rgb(var(--rpg-border))" />
            <PolarAngleAxis dataKey="dim" tick={{ fill: "rgb(var(--rpg-text))", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {hasAvg && <Radar name="Média (7 dias)" dataKey="media" stroke="rgb(var(--rpg-gold))" fill="rgb(var(--rpg-gold))" fillOpacity={0.12} />}
            <Radar name="Hoje" dataKey="hoje" stroke="rgb(var(--rpg-purple))" fill="rgb(var(--rpg-purple))" fillOpacity={0.45} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="flex flex-wrap gap-3 text-[11px] text-rpg-muted">
        <span className="text-rpg-purple">■ Hoje</span>
        {hasAvg ? <span className="text-rpg-gold">■ Média de {t.balance.days} dia(s) anteriores</span> : <span>Sem snapshots anteriores para comparar.</span>}
      </p>
      <p className="mt-1 text-[10px] text-rpg-muted">{t.balance.method} Uma pontuação baixa mostra onde houve menos registro — não é um julgamento.</p>
    </KitSection>
  );
}

function MoodPanel({ t, notify }: { t: Tavern3; notify: Toast }) {
  const { sync } = useTavern3Actions();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!mood || !energy) return;
    setBusy(true);
    try {
      await healthService.addMood({ mood, energy, stress, note: note.trim() ? `Taverna: ${note.trim().slice(0, 180)}` : "Taverna (fim do dia)" });
      sync();
      notify("Estado emocional registrado em Saúde.");
      setMood(null);
      setEnergy(null);
      setStress(null);
      setNote("");
    } catch {
      notify("Não foi possível registrar em Saúde.", "error");
    } finally {
      setBusy(false);
    }
  };
  // Uma escala por linha (rótulo + 5 botões): nunca espreme, mesmo num card estreito de 3 colunas.
  const scale = (label: string, v: number | null, set: (n: number) => void, icons?: string[], hint?: string) => (
    <fieldset className="grid grid-cols-1 items-center gap-1 min-[380px]:grid-cols-[88px_minmax(0,1fr)]">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="text-[11px] font-semibold text-rpg-muted">
        {label}
        {hint && <span className="block text-[9px] font-normal">{hint}</span>}
      </span>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={v === n} aria-label={`${label} ${n} de 5`} onClick={() => set(v === n && !icons ? 0 : n)} className={clsx("flex h-9 items-center justify-center border-2 text-sm tabular-nums", v === n ? "border-rpg-gold bg-rpg-gold/10 text-rpg-text" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }}>
            {icons ? <span className="text-base leading-none">{icons[n - 1]}</span> : n}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <KitSection title="Como foi meu dia?" icon={<Heart size={16} />}>
      {t.mood?.mood != null && (
        <p className="mb-2 text-[11px] text-rpg-muted">
          Último registro de hoje em Saúde: {MOOD_EMOJI[(t.mood.mood ?? 3) - 1]} humor {t.mood.mood}/5 · energia {t.mood.energy ?? "—"}/5
        </p>
      )}
      <div className="space-y-2">
        {scale("Humor", mood, setMood, MOOD_EMOJI)}
        {scale("Energia", energy, setEnergy, undefined, "1 baixa · 5 alta")}
        {scale("Estresse", stress, (n) => setStress(n || null), undefined, "opcional")}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={180} placeholder="Observação opcional" className={`${FIELD} mt-2`} style={{ borderRadius: 3 }} aria-label="Observação do estado emocional" />
      <RPGButton variant="pink" className="mt-2 w-full" disabled={!mood || !energy || busy} onClick={() => void save()}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Heart size={14} aria-hidden />} Registrar em Saúde
      </RPGButton>
      <p className="mt-1 text-[10px] text-rpg-muted">Saúde é a fonte única de humor e energia: o registro aparece lá, sem duplicar.</p>
    </KitSection>
  );
}

function InsightsPanel({ t }: { t: Tavern3 }) {
  return (
    <KitSection title="Insights da Taverna" icon={<Lightbulb size={16} />}>
      {t.insights.length ? (
        <ul className="space-y-2">
          {t.insights.map((i) => (
            <li key={i.title} className="text-sm text-rpg-text">
              <span className="flex items-center gap-1.5">
                <RPGBadge tone="blue">Observação estatística</RPGBadge> <b>{i.title}</b>
              </span>
              <span className="block">{i.text}</span>
              <span className="block text-[10px] text-rpg-muted">Dados: {i.data}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-rpg-muted">Ainda não há registros suficientes nas últimas 4 semanas para observações confiáveis (mínimo de 10 missões ou 6 dias com hábitos).</p>
      )}
      <p className="mt-2 text-[10px] text-rpg-muted">Interpretações geradas por IA ficam no Conselheiro da Taverna, marcadas como tal.</p>
    </KitSection>
  );
}

function AchievementsPanel({ t }: { t: Tavern3 }) {
  return (
    <KitSection title="Conquistas do dia" icon={<Trophy size={16} />}>
      {t.achievements.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {t.achievements.map((a, i) => (
            <li key={a.id} className="flex items-center gap-2 border-2 border-rpg-gold/50 bg-rpg-bg-2/60 p-2" style={R}>
              <img src={`${ART}/${i % 2 ? "ach-book" : "ach-swords"}.webp`} alt="" aria-hidden className="pixelated h-12 w-12" />
              <div className="min-w-0">
                <p className="font-rpg text-sm font-bold text-rpg-text">{a.title}</p>
                <RPGBadge tone={TIER[a.tier]?.tone ?? "muted"}>{TIER[a.tier]?.label ?? a.tier}</RPGBadge>
                {a.description && <p className="text-[11px] text-rpg-muted">{a.description}</p>}
                <p className="font-pixel text-[10px] text-rpg-purple">
                  +{a.reward.xp} XP · +{a.reward.coins} 🪙 · {new Date(a.unlockedAt.replace(" ", "T") + (a.unlockedAt.includes("Z") ? "" : "Z")).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-rpg-muted">Nenhuma conquista desbloqueada hoje. Elas aparecem aqui assim que acontecem.</p>
      )}
      <Link to="/conquistas" className="mt-2 inline-block text-[11px] text-rpg-blue hover:underline">
        Ver todas no Hall de Troféus →
      </Link>
    </KitSection>
  );
}

function TomorrowPreview({ t, go }: { t: Tavern3; go: () => void }) {
  const m = t.tomorrowPlan.mission;
  const items = [
    { done: m.pinned.length > 0, text: m.pinned[0] ? `Missão principal: ${m.pinned[0].title}` : "Definir missão principal (opcional)" },
    { done: t.ritual.priorities.length > 0, text: t.ritual.priorities.length ? `${t.ritual.priorities.length} prioridade(s) escolhida(s)` : "Escolher prioridades" },
    { done: t.tomorrowPlan.conflicts.length === 0, text: t.tomorrowPlan.conflicts.length ? `${t.tomorrowPlan.conflicts.length} conflito(s) na agenda` : "Agenda sem conflitos" },
  ];
  return (
    <KitSection title="Preparando o amanhã" icon={<CalendarClock size={16} />}>
      <div className="relative">
        <img src={`${ART}/quill.webp`} alt="" aria-hidden className="pixelated absolute bottom-0 right-0 hidden h-16 w-auto opacity-80 sm:block" />
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.text} className="flex items-center gap-2 text-sm text-rpg-text">
              {i.done ? <CheckCircle2 size={15} className="text-rpg-green" aria-hidden /> : <Circle size={15} className="text-rpg-muted" aria-hidden />} {i.text}
            </li>
          ))}
        </ul>
      </div>
      <RPGButton variant="secondary" className="mt-2" onClick={go}>
        Planejar amanhã →
      </RPGButton>
    </KitSection>
  );
}

/* ═════════════════════ abas ═════════════════════ */

function BalanceTab({ t, notify }: { t: Tavern3; notify: Toast }) {
  const d = t.balance.details;
  const cmp = (today: number, avg: number | null, unit = "") => (
    <span className="text-[11px] text-rpg-muted">
      {avg == null ? "sem média recente" : `média 7 dias: ${avg}${unit} (${today >= avg ? "+" : ""}${Math.round((today - avg) * 10) / 10})`}
    </span>
  );
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <BalanceRadar t={t} />
      <KitSection title="Números do dia" icon={<BarChart3 size={16} />}>
        <ul className="space-y-2 text-sm text-rpg-text">
          <li>
            XP: <b>+{d.xp.today}</b> {cmp(d.xp.today, d.xp.avg7)}
          </li>
          <li>
            Moedas: <b>+{d.coins.today}</b> {cmp(d.coins.today, d.coins.avg7)}
          </li>
          <li>
            Missões: <b>{d.missions.count}</b> {cmp(d.missions.count, d.missions.avg7)}
          </li>
          <li>
            Hábitos: <b>{d.habits.done}/{d.habits.total}</b> {cmp(d.habits.done, d.habits.avg7)}
          </li>
          <li>
            Exercício: <b>{d.exercise.todayMinutes} min</b> ({d.exercise.sessions} sessão/ões) {cmp(d.exercise.todayMinutes, d.exercise.avg7, " min")}
          </li>
          <li>
            Água: <b>{(d.water.todayMl / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</b>
          </li>
          <li>
            Leitura: <b>{t.balance.signals.readingPages} pág.</b>
          </li>
          <li>Sono da última noite: {d.sleep?.durationMinutes ? <b>{Math.floor(d.sleep.durationMinutes / 60)}h{String(d.sleep.durationMinutes % 60).padStart(2, "0")}</b> : "sem registro"}</li>
        </ul>
        {d.missions.items.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-rpg-gold-light">Missões concluídas hoje ({d.missions.items.length})</summary>
            <ul className="mt-1 list-inside list-disc text-[12px] text-rpg-text/90">
              {d.missions.items.map((m) => (
                <li key={m.id}>{m.title}</li>
              ))}
            </ul>
          </details>
        )}
        {d.habits.items.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-rpg-gold-light">Hábitos cumpridos ({d.habits.items.length})</summary>
            <ul className="mt-1 list-inside list-disc text-[12px] text-rpg-text/90">
              {d.habits.items.map((h) => (
                <li key={h.id}>
                  {h.icon} {h.name}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-3">
        </div>
      </KitSection>
    </div>
  );
}

function LearningsTab({ t, notify }: { t: Tavern3; notify: Toast }) {
  const [busy, setBusy] = useState(false);
  return (
    <KitSection title="Aprendizados" icon={<Lightbulb size={16} />}>
      <div className="grid gap-2 md:grid-cols-2">
        <RitualField label="O que aprendi?" value={t.ritual.learned} field="learned" rows={3} />
        <RitualField label="O que funcionou?" value={t.ritual.worked} field="worked" rows={3} />
        <RitualField label="O que poderia melhorar?" value={t.ritual.improve} field="improve" rows={3} />
        <RitualField label="O que gostaria de repetir?" value={t.ritual.repeatThis} field="repeatThis" rows={3} />
        <RitualField label="O que devo evitar amanhã?" value={t.ritual.avoidTomorrow} field="avoidTomorrow" rows={3} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <RPGButton
          variant="secondary"
          disabled={busy || t.ritual.learned.trim().length < 5}
          onClick={() => {
            setBusy(true);
            void tavern3Service
              .learningToGrimoire(t.ritual.learned)
              .then((r) => notify(r.added ? "Cartão sugerido na fila de aprovação do Grimório." : "Esse aprendizado já está no Grimório."))
              .catch((e: unknown) => notify(e instanceof Error ? e.message : "Erro", "error"))
              .finally(() => setBusy(false));
          }}
        >
          <Sparkles size={14} aria-hidden /> Sugerir cartão no Grimório
        </RPGButton>
      </div>
      <p className="mt-1 text-[10px] text-rpg-muted">O cartão só entra no seu baralho depois que você aprovar na fila do Grimório.</p>
    </KitSection>
  );
}

function TomorrowTab({ t, notify }: { t: Tavern3; notify: Toast }) {
  const { saveRitual, focusBlock, tomorrowTask, sync } = useTavern3Actions();
  const p = t.tomorrowPlan;
  const candidates = [...(p.mission.primary ? [p.mission.primary] : []), ...p.mission.alternatives, ...p.mission.dueTomorrow.filter((d) => d.id !== p.mission.primary?.id && !p.mission.alternatives.some((a) => a.id === d.id))].slice(0, 6);
  const [confirm, setConfirm] = useState<null | { start: string; end: string }>(null);
  const [blockTask, setBlockTask] = useState(p.mission.pinned[0]?.id ?? p.mission.primary?.id ?? "");
  const pin = async (id: string, title: string) => {
    try {
      await tavernService.pinTomorrow(id, false);
      await tomorrowTask.mutateAsync(id);
      sync();
      notify(`Missão principal de amanhã: ${title} (bônus oficial de missão principal ao concluir).`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível fixar.", "error");
    }
  };
  const togglePriority = (id: string) => {
    const has = t.ritual.priorities.includes(id);
    if (!has && t.ritual.priorities.length >= 3) return notify("Escolha no máximo 3 prioridades.", "error");
    saveRitual.mutate({ priorities: has ? t.ritual.priorities.filter((x) => x !== id) : [...t.ritual.priorities, id] });
  };
  const fmtTime = (iso: string) => (iso.length > 10 ? iso.slice(11, 16) : "Dia todo");
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <KitSection title={`Agenda de amanhã (${new Date(`${t.tomorrow}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })})`} icon={<CalendarDays size={16} />}>
        {p.agenda.length ? (
          <ul className="space-y-1 text-sm text-rpg-text">
            {p.agenda.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="w-16 shrink-0 font-pixel text-[10px] text-rpg-gold">{fmtTime(a.startsAt)}</span> {a.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-rpg-muted">Nenhum compromisso amanhã.</p>
        )}
        {p.conflicts.map((c) => (
          <p key={`${c.a}${c.b}`} className="mt-1 text-[11px] text-rpg-orange" role="alert">
            Conflito: {c.a} × {c.b} ({c.minutes} min sobrepostos)
          </p>
        ))}
        <div className="mt-3 border-t border-rpg-border/60 pt-2">
          <p className="mb-1 text-[11px] text-rpg-muted">Janelas livres sugeridas para missões (nada é agendado sem você):</p>
          <select value={blockTask} onChange={(e) => setBlockTask(e.target.value)} className={`${FIELD} mb-1.5`} style={{ borderRadius: 3 }} aria-label="Missão do bloco de trabalho">
            <option value="">Bloco sem missão vinculada</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {p.freeWindows.length ? (
              p.freeWindows.map((w) => (
                <RPGButton key={w.start} variant="secondary" className="min-h-[34px] px-2 text-xs" onClick={() => setConfirm(w)}>
                  <Timer size={12} aria-hidden /> {w.start}–{w.end}
                </RPGButton>
              ))
            ) : (
              <span className="text-[11px] text-rpg-muted">Sem janelas livres de 50 min entre 08h e 20h.</span>
            )}
          </div>
        </div>
      </KitSection>
      <KitSection title="Missão e prioridades" icon={<Target size={16} />}>
        {p.mission.pinned[0] && (
          <p className="mb-2 text-sm text-rpg-text">
            <RPGBadge tone="gold">fixada</RPGBadge> {p.mission.pinned[0].title}
          </p>
        )}
        {candidates.length ? (
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-rpg-text">
                  <input type="checkbox" checked={t.ritual.priorities.includes(c.id)} onChange={() => togglePriority(c.id)} aria-label={`Prioridade: ${c.title}`} />
                  <span className="min-w-0">
                    {c.title}
                    {"reasons" in c && <span className="block text-[10px] text-rpg-muted">{(c as { reasons: string[] }).reasons.join(" · ")}</span>}
                  </span>
                </label>
                <RPGButton variant="ghost" className="min-h-[30px] px-2 text-[11px]" onClick={() => void pin(c.id, c.title)}>
                  <Star size={11} aria-hidden /> Principal
                </RPGButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-rpg-muted">Nenhuma missão pendente no radar de amanhã.</p>
        )}
        <div className="mt-2">
        </div>
      </KitSection>
      <KitSection title="Previsões da Forja para amanhã" icon={<Sparkles size={16} />}>
        {t.forecasts.length ? (
          <ul className="space-y-2">
            {t.forecasts.map((f) => (
              <li key={f.modelId} className="text-sm text-rpg-text">
                <b>{f.name}</b> — {f.targetLabel}:{" "}
                {f.problem === "classification" ? <b>{Math.round(f.value * 100)}% estimados</b> : <b>{f.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>}
                {f.lower != null && f.upper != null && <span className="text-[11px] text-rpg-muted"> (faixa 80%: {f.lower.toFixed(1)}–{f.upper.toFixed(1)})</span>}
                {f.partial && <RPGBadge tone="orange">preliminar: hoje ainda não terminou</RPGBadge>}
                {f.degraded && <RPGBadge tone="red">modelo degradado</RPGBadge>}
                {f.validation && (
                  <span className="block text-[10px] text-rpg-muted">
                    v{f.version} · teste final: {f.validation.primary} {f.validation.model.toFixed(3)} × base {f.validation.baseline.toFixed(3)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : t.legacyProphecies.some((p) => p.probability != null) ? (
          <ul className="space-y-1 text-sm text-rpg-text">
            {t.legacyProphecies
              .filter((p) => p.probability != null)
              .map((p) => (
                <li key={p.artifactName}>
                  {p.artifactName}: {Math.round((p.probability ?? 0) * 100)}% <RPGBadge tone="muted">Forja 2.0</RPGBadge>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-[11px] text-rpg-muted">
            Nenhum modelo ativo na Forja. <Link to="/forja-inteligencia?aba=artefatos" className="text-rpg-blue hover:underline">Treinar um artefato →</Link>
          </p>
        )}
        <p className="mt-2 text-[10px] text-rpg-muted">Previsões são estimativas estatísticas do seu histórico, não certezas. Elas só sugerem — não alteram a Agenda nem as Missões.</p>
      </KitSection>
      <div className="flex items-start">
      </div>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Reservar bloco de trabalho" size="sm">
        {confirm && (
          <div className="space-y-3 text-sm text-rpg-text">
            <p>
              Criar na Agenda de amanhã um bloco de trabalho das <b>{confirm.start}</b> às <b>{confirm.end}</b>
              {blockTask ? ` para “${candidates.find((c) => c.id === blockTask)?.title ?? "missão"}”` : ""}?
            </p>
            <div className="flex justify-end gap-2">
              <RPGButton variant="ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </RPGButton>
              <RPGButton
                variant="gold"
                disabled={focusBlock.isPending}
                onClick={() =>
                  focusBlock.mutate(
                    { start: confirm.start, end: confirm.end, title: blockTask ? `Missão: ${candidates.find((c) => c.id === blockTask)?.title ?? "missão"}` : "Bloco de trabalho", taskId: blockTask || null },
                    { onSuccess: () => (notify("Bloco reservado na Agenda de amanhã."), setConfirm(null)), onError: (e) => notify(e instanceof Error ? e.message : "Erro", "error") },
                  )
                }
              >
                Confirmar
              </RPGButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function HistoryTab({ t }: { t: Tavern3 }) {
  const byDay = useMemo(() => new Map(t.history.map((h) => [h.day, h])), [t.history]);
  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(`${t.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (34 - i));
    return d.toISOString().slice(0, 10);
  });
  const [open, setOpen] = useState<string | null>(null);
  const sel = open ? byDay.get(open) : null;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <KitSection title="Calendário de rituais (5 semanas)" icon={<CalendarDays size={16} />}>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Rituais por dia">
          {days.map((d) => {
            const h = d === t.today ? { completedAt: t.ritual.completedAt, steps: t.ritual.steps } : byDay.get(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => byDay.has(d) && setOpen(d)}
                className={clsx("flex aspect-square items-center justify-center border text-[10px]", h?.completedAt ? "border-rpg-green bg-rpg-green/25 text-rpg-text" : h?.steps.length ? "border-rpg-orange/60 bg-rpg-orange/10 text-rpg-text" : "border-rpg-border text-rpg-muted")}
                style={{ borderRadius: 3 }}
                aria-label={`${d}: ${h?.completedAt ? "encerrado" : h?.steps.length ? "iniciado" : "sem ritual"}`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-rpg-muted">Verde: encerrado · laranja: iniciado · toque para ver.</p>
      </KitSection>
      <KitSection title="Rituais anteriores" icon={<History size={16} />}>
        {sel ? (
          <div className="space-y-1 text-sm text-rpg-text">
            <p className="font-rpg font-bold">{new Date(`${sel.day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
            <p>Etapas: {sel.steps.map((s) => STEP_LABEL[s].title).join(", ") || "nenhuma"}</p>
            <p>{sel.completedAt ? `Encerrado · +${sel.reward.xp} XP` : "Não encerrado"}</p>
            {sel.lifeScore != null && <p>Life Score no encerramento: {sel.lifeScore}</p>}
            {sel.highlights && <p className="whitespace-pre-wrap text-[12px]">Acontecimentos: {sel.highlights}</p>}
            {sel.learned && <p className="whitespace-pre-wrap text-[12px]">Aprendizado: {sel.learned}</p>}
            {sel.tomorrowTask && <p className="text-[12px]">Missão escolhida para o dia seguinte: {sel.tomorrowTask}</p>}
            <p className="text-[10px] text-rpg-muted">Os valores ficam como registrados no encerramento (histórico não é reescrito).</p>
            <button type="button" className="text-[11px] text-rpg-blue hover:underline" onClick={() => setOpen(null)}>
              ← Voltar à lista
            </button>
          </div>
        ) : t.history.length ? (
          <ul className="space-y-1">
            {t.history.slice(0, 20).map((h) => (
              <li key={h.day}>
                <button type="button" onClick={() => setOpen(h.day)} className="flex w-full items-center gap-2 text-left text-sm text-rpg-text hover:underline">
                  {h.completedAt ? <CheckCircle2 size={14} className="text-rpg-green" aria-hidden /> : <Circle size={14} className="text-rpg-orange" aria-hidden />}
                  {new Date(`${h.day}T12:00:00`).toLocaleDateString("pt-BR")} · {h.steps.length}/5 etapas{h.learned ? ` · ${h.learned.slice(0, 50)}` : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-rpg-muted">Os rituais concluídos aparecerão aqui.</p>
        )}
      </KitSection>
    </div>
  );
}

/* ═════════════════════ tela ═════════════════════ */

/**
 * Taverna 3.0 — ritual guiado de fim do dia. Só dados reais: XP, moedas,
 * missões, hábitos e Life Score vêm dos serviços oficiais; as notas do
 * ritual ficam na própria Taverna; humor vai para Saúde.
 */
export function TavernScreen() {
  const { data: t, isLoading, isError, refetch } = useTavern3();
  const [tab, setTab] = useUrlTab(TABS, "visao");
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify: Toast = (msg, tone = "success") => setToast({ msg, tone });
  const tabs: Array<[Tab, string, ReactNode]> = [
    ["visao", "Visão Geral", <Sparkles key="i" size={14} />],
    ["balanco", "Balanço", <BarChart3 key="i" size={14} />],
    ["aprendizados", "Aprendizados", <Lightbulb key="i" size={14} />],
    ["pergaminho", "Pergaminho do Dia", <ScrollText key="i" size={14} />],
    ["amanha", "Planejar Amanhã", <CalendarClock key="i" size={14} />],
    ["conquistas", "Conquistas", <Trophy key="i" size={14} />],
    ["historico", "Histórico", <History key="i" size={14} />],
    ["conselho", "Conselheiro", <Bot key="i" size={14} />],
    ["automacoes", "Automações", <Zap key="i" size={14} />],
  ];
  return (
    <div className="space-y-3 px-3 py-4 sm:px-4 md:px-6 md:py-6">
      {isLoading && <div className="rpg-panel h-48 animate-pulse" aria-busy="true" aria-label="Abrindo a Taverna" />}
      {isError && (
        <div className="rpg-panel p-3" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir a Taverna.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      )}
      {t && (
        <>
          <Banner t={t} onStart={() => setTab("balanco")} onHistory={() => setTab("historico")} />
          <Indicators t={t} />
          <div role="tablist" aria-label="Seções da Taverna" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {tabs.map(([v, l, icon]) => (
              <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={clsx("flex min-h-[40px] shrink-0 items-center gap-1.5 border-2 px-3 text-sm font-semibold", tab === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border bg-rpg-panel text-rpg-muted hover:text-rpg-text")} style={R}>
                {icon} {l}
              </button>
            ))}
          </div>
          {tab === "visao" && (
            <div className="space-y-3">
              {/* Sem ritual de fechamento: a Taverna virou um painel de balanço e preparação para amanhã. */}
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <BalanceRadar t={t} />
                <InsightsPanel t={t} />
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-3">
                <MoodPanel t={t} notify={notify} />
                <AchievementsPanel t={t} />
                <TomorrowPreview t={t} go={() => setTab("amanha")} />
              </div>
            </div>
          )}
          {tab === "balanco" && <BalanceTab t={t} notify={notify} />}
          {tab === "aprendizados" && <LearningsTab t={t} notify={notify} />}
          {tab === "pergaminho" && <LoreScroll notify={notify} />}
          {tab === "amanha" && <TomorrowTab t={t} notify={notify} />}
          {tab === "conquistas" && (
            <AchievementsPanel t={t} />
          )}
          {tab === "historico" && <HistoryTab t={t} />}
          {tab === "conselho" && <AdvisorPanel module="tavern" title="Conselheiro da Taverna" avatar={`${ART}/banner-scene.webp`} />}
          {tab === "automacoes" && <AutomationsPanel module="tavern" title="Automações da Taverna" intro="Lembretes e sugestões avisam; nada é escrito na Agenda ou nas Missões sem você." />}
        </>
      )}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
