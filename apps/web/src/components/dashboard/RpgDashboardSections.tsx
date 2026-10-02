import { Link } from "react-router-dom";
import { BarChart3, BookOpen, CalendarClock, CalendarDays, CheckCircle2, Clock, Dumbbell, Gem, Heart, Smile, Sparkles, Swords, Trophy, Wand2, Zap } from "lucide-react";
import type { FocusTask, HealthSummary } from "@/types";
import { Sparkline } from "@/components/charts/motion/Sparkline";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { useAchievements } from "@/hooks/useAchievements";
import {
  RPGAvatarButton,
  RPGBadge,
  RPGButton,
  RPGPageHeader,
  RPGPanel,
  RPGProgressBar,
  RPGQuestCard,
  RPGStatCard,
  RPG_AVATARS,
  rpgAvatar,
  rpgButtonClass,
  type RpgTone,
} from "@/components/rpg";
import type { KpiData } from "./DashboardSections";

/* ============================================================
   Dashboard no tema RPG ("HUD do personagem"). Recebe exatamente os
   mesmos dados já calculados pela DashboardPage — nenhum número novo.
   Life Score continua sendo Life Score; nível/XP não aparecem porque
   ainda não existem no backend.
   ============================================================ */

const KPI_TONE: Record<KpiData["tone"], RpgTone> = { amber: "orange", blue: "blue", green: "green", purple: "purple", pink: "gold", teal: "cyan" };

export function RpgDashboardHero({
  firstName,
  subtitle,
  quote,
  overall,
  isLoading,
  delta,
  history,
}: {
  firstName: string;
  subtitle: string;
  quote: string;
  overall: number;
  isLoading: boolean;
  delta: { delta: number; since: string } | null;
  history: number[];
}) {
  const up = (delta?.delta ?? 0) >= 0;
  const { avatarId } = useRpgAvatar();
  return (
    <RPGPageHeader
      banner="dashboard"
      leading={<RPGAvatarButton />}
      title={`Olá, ${firstName}!`}
      subtitle={subtitle}
      footnote={<span className="inline-flex items-center gap-1.5"><Swords size={13} aria-hidden /> Personagem: {rpgAvatar(avatarId).label}</span>}
      aside={
        <Link to="/analytics" className="rpg-parchment block px-4 py-3 mx-1.5 my-1.5 w-full sm:w-[320px] hover:brightness-105 transition" aria-label={`Life Score ${overall}. Ver Analytics`}>
          <div className="flex items-center gap-3">
            <Gem size={30} className="text-rpg-green shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-pixel text-xs font-semibold text-rpg-ink/80">Life Score</p>
              <p className="font-pixel text-4xl font-bold leading-none text-rpg-ink tabular-nums">{isLoading ? "—" : overall}</p>
            </div>
            <div className="text-[11px] leading-tight text-rpg-ink/80 min-w-0">
              {delta ? (
                <>
                  <span className={`block font-bold ${up ? "text-rpg-green" : "text-rpg-red"}`}>{up ? "▲" : "▼"} {Math.abs(delta.delta)} pts</span>
                  vs. semana anterior
                </>
              ) : (
                "Evolução aparece com mais dias de uso"
              )}
            </div>
            {history.length >= 2 && <Sparkline values={history} width={70} height={32} className="ml-auto hidden sm:block text-rpg-ink/70" />}
          </div>
          <p className="mt-2 pt-2 border-t border-rpg-bronze/40 text-center text-xs italic text-rpg-ink/80">&ldquo;{quote}&rdquo;</p>
        </Link>
      }
    />
  );
}

export function RpgKpiStrip({ items }: { items: KpiData[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {items.map((k, i) => (
        <div key={k.key} className={i === items.length - 1 ? "col-span-2 md:col-span-1" : ""}>
          <RPGStatCard icon={k.icon} label={k.label} value={k.value} caption={k.caption} tone={KPI_TONE[k.tone]} pct={k.pct} to={k.to} />
        </div>
      ))}
    </div>
  );
}

function shortDate(iso: string | null) {
  if (!iso) return "Sem prazo";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/** "Próximo melhor passo" como missão principal em pergaminho. */
export function RpgMainQuest({
  task,
  estimateMinutes,
  onComplete,
  isCompleting,
}: {
  task: FocusTask | null;
  estimateMinutes: number | null;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  return (
    <RPGPanel title="Missão principal" icon={<Swords size={14} />} variant="quest" actions={<Link to="/tarefas" className="text-xs font-semibold text-rpg-muted hover:text-rpg-gold-light">Ver todas →</Link>} className="h-full">
      <RPGQuestCard
        label="Próximo melhor passo"
        title={task?.title ?? null}
        priority={task?.priority}
        reasons={task?.reasons.slice(0, 2).join(" · ") || null}
        facts={[
          { icon: <CalendarClock size={15} />, label: "Prazo", value: shortDate(task?.dueDate ?? null) },
          { icon: <Clock size={15} />, label: "Tempo estimado", value: estimateMinutes ? `${estimateMinutes} min` : "Não estimado" },
          { icon: <Zap size={15} />, label: "Prioridade", value: task?.priority ?? "—" },
        ]}
        emptyText="Nenhuma tarefa em aberto. Aproveite para planejar a semana ou registrar seu dia no Diário."
        actions={
          <>
            <RPGButton variant="success" onClick={onComplete} disabled={isCompleting} className="flex-1">
              <CheckCircle2 size={16} /> {isCompleting ? "Concluindo..." : "Marcar como concluída"}
            </RPGButton>
            <Link to="/capacity-planner" className={rpgButtonClass("secondary", "flex-1")}>
              <CalendarClock size={16} /> Replanejar
            </Link>
          </>
        }
      />
    </RPGPanel>
  );
}

const TIER: Record<string, { label: string; tone: RpgTone }> = {
  bronze: { label: "Bronze", tone: "orange" },
  silver: { label: "Prata", tone: "muted" },
  gold: { label: "Ouro", tone: "gold" },
  platinum: { label: "Platina", tone: "cyan" },
};

/** Últimas conquistas desbloqueadas de verdade (catálogo de Conquistas). */
export function RpgRecentAchievements() {
  const { unlocked, isLoading } = useAchievements();
  const recent = [...unlocked].sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "")).slice(0, 3);
  return (
    <RPGPanel title="Conquistas recentes" icon={<Trophy size={14} />} actions={<Link to="/conquistas" className="text-xs font-semibold text-rpg-muted hover:text-rpg-gold-light">Ver todas →</Link>} className="h-full">
      {isLoading ? (
        <div className="h-24 bg-rpg-panel-light/60 animate-pulse" aria-busy="true" />
      ) : recent.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma conquista desbloqueada ainda. Elas chegam com os seus registros reais.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((a) => {
            const t = TIER[a.tier] ?? TIER.bronze;
            return (
              <li key={a.id} className="flex items-center gap-3 border-2 border-rpg-border bg-rpg-bg/50 px-3 py-2" style={{ borderRadius: 4 }}>
                <span className="w-9 h-9 shrink-0 flex items-center justify-center border-2 border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
                  <Trophy size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  {a.unlockedAt && <p className="text-[11px] text-rpg-muted">Desbloqueada em {new Date(a.unlockedAt).toLocaleDateString("pt-BR")}</p>}
                </div>
                <RPGBadge tone={t.tone}>{t.label}</RPGBadge>
              </li>
            );
          })}
        </ul>
      )}
    </RPGPanel>
  );
}

/** Atributos do dia: só registros reais de Saúde/Leitura/Agenda; sem dado → "sem dados". */
export function RpgDayAttributes({ health, pagesRead14d, agendaCount }: { health: HealthSummary | null | undefined; pagesRead14d: number | null; agendaCount: number }) {
  const rows: Array<{ key: string; icon: JSX.Element; label: string; value: string | null; pct: number | null; tone: RpgTone }> = [
    { key: "sleep", icon: <Heart size={14} />, label: "Sono", value: health?.lastSleepMinutes ? `${health.lastSleepMinutes} min` : null, pct: health?.lastSleepMinutes ? Math.min(100, (health.lastSleepMinutes / 480) * 100) : null, tone: "red" },
    { key: "mood", icon: <Smile size={14} />, label: "Humor", value: health?.mood ? `${health.mood.mood} / 5` : null, pct: health?.mood ? (health.mood.mood / 5) * 100 : null, tone: "gold" },
    { key: "energy", icon: <Zap size={14} />, label: "Energia", value: health?.mood ? `${health.mood.energy} / 5` : null, pct: health?.mood ? (health.mood.energy / 5) * 100 : null, tone: "orange" },
    { key: "workout", icon: <Dumbbell size={14} />, label: "Exercício", value: health ? `${health.workoutMinutesToday} min` : null, pct: health ? Math.min(100, (health.workoutMinutesToday / 30) * 100) : null, tone: "green" },
    { key: "reading", icon: <BookOpen size={14} />, label: "Leitura (14d)", value: pagesRead14d ? `${pagesRead14d} pág.` : null, pct: null, tone: "blue" },
    { key: "agenda", icon: <CalendarDays size={14} />, label: "Agenda", value: `${agendaCount} ${agendaCount === 1 ? "evento" : "eventos"}`, pct: null, tone: "purple" },
  ];
  return (
    <RPGPanel title="Atributos do dia" icon={<BarChart3 size={14} />} actions={<Link to="/saude" className="text-xs font-semibold text-rpg-purple hover:underline">Ver todos</Link>} className="h-full">
      <ul className="divide-y divide-rpg-border/50">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[18px_minmax(0,1fr)_auto_minmax(60px,110px)] items-center gap-2.5 py-2">
            <span className={RPG_TONE_ICON[r.tone]} aria-hidden>{r.icon}</span>
            <span className="text-sm truncate">{r.label}</span>
            <span className="font-pixel text-sm font-semibold tabular-nums text-right">{r.value ?? "—"}</span>
            {r.pct != null ? (
              <RPGProgressBar tone={r.tone} label={r.label} value={r.pct} showLabel={false} />
            ) : (
              <span className="text-[11px] text-rpg-muted text-right">{r.value ? "registrado" : "sem dados"}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-rpg-muted">Barras comparam com referências fixas (8 h de sono, 30 min de exercício, escala 1–5).</p>
    </RPGPanel>
  );
}

const RPG_TONE_ICON: Record<RpgTone, string> = {
  gold: "text-rpg-gold-light",
  purple: "text-rpg-purple",
  blue: "text-rpg-blue",
  green: "text-rpg-green",
  red: "text-rpg-red",
  orange: "text-rpg-orange",
  cyan: "text-rpg-cyan",
  muted: "text-rpg-muted",
};

/** LifeOS Copilot com o mago como guia — mesmo insight real (useDailyInsight). */
export function RpgCopilotPanel({
  title = "Copiloto LifeOS",
  text,
  isLoading,
  error,
  onRegenerate,
  isRegenerating,
}: {
  title?: string;
  text: string | null;
  isLoading: boolean;
  error: { message: string; status?: number } | null;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const mage = RPG_AVATARS.find((a) => a.id === "mago") ?? RPG_AVATARS[0];
  return (
    <RPGPanel title={title} icon={<Sparkles size={14} />} variant="legendary" className="h-full">
      <div className="flex gap-3">
        <img src={mage.src} alt="" aria-hidden loading="lazy" width={96} height={96} className="pixelated hidden sm:block w-24 h-24 shrink-0 border-2 border-rpg-border object-cover" style={{ borderRadius: 3 }} />
        <div className="flex-1 min-w-0 border-2 border-rpg-border bg-rpg-bg/60 px-3 py-2.5" style={{ borderRadius: 4 }}>
          <p className="text-sm leading-relaxed">
            {isLoading ? "Preparando o insight de hoje..." : error ? error.message : text ?? "Sem insight gerado ainda para hoje."}
          </p>
          {error?.status === 400 && (
            <Link to="/configuracoes" className="text-xs underline font-semibold text-rpg-gold-light">
              Configurar IA
            </Link>
          )}
          <p className="text-[10px] text-rpg-muted mt-1.5">Sugestão gerada por IA a partir dos seus registros reais.</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <RPGButton variant="primary" onClick={onRegenerate} disabled={isRegenerating || isLoading} className="!py-2 !text-xs">
          <Wand2 size={14} /> {isRegenerating ? "Gerando..." : "Gerar outro insight"}
        </RPGButton>
      </div>
    </RPGPanel>
  );
}
