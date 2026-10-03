import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  ClipboardList,
  Coins,
  Crown,
  Droplets,
  Dumbbell,
  Flame,
  FlaskConical,
  GraduationCap,
  Hourglass,
  Library,
  ListChecks,
  Lock,
  Rocket,
  Search,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGTabs, RPG_TONE_SOFT, RPG_TONE_TEXT } from "@/components/rpg";
import { TIER_LABEL, TIER_ORDER, TIER_RPG_TONE } from "./tierDisplay";
import type { Achievement, AchievementCategory, AchievementTier } from "@/types";

const ICONS: Record<string, typeof Trophy> = { ListChecks, Rocket, Flame, BookOpen, Library, Timer, ClipboardList, Target, Dumbbell, Droplets, GraduationCap, FlaskConical, Trophy };

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  missoes: "Missões",
  contratos: "Contratos",
  leitura: "Leitura",
  saude: "Saúde",
  foco: "Foco",
  revisoes: "Revisões",
  metas: "Metas",
  educacao: "Educação",
  experimentos: "Experimentos",
  outros: "Outros",
};

type State = "unlocked" | "progress" | "notStarted";
type StateFilter = "all" | State;
type SortKey = "recent" | "progress" | "rarity";

/** Estado real: desbloqueada, em progresso (métrica > 0) ou não iniciada. */
export function achievementState(a: Achievement): State {
  if (a.unlockedAt) return "unlocked";
  return (a.currentValue ?? 0) > 0 || a.progress > 0 ? "progress" : "notStarted";
}

const STATE_LABEL: Record<State, string> = { unlocked: "Desbloqueada", progress: "Em progresso", notStarted: "Não iniciada" };
const tierRank = (t: AchievementTier) => TIER_ORDER.length - TIER_ORDER.indexOf(t);
const fmtDate = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("pt-BR");

function Medal({ a, size = 48 }: { a: Achievement; size?: number }) {
  const Icon = (a.icon && ICONS[a.icon]) || Trophy;
  const unlocked = !!a.unlockedAt;
  return (
    <span
      className={`shrink-0 flex items-center justify-center border-2 ${unlocked ? RPG_TONE_SOFT[TIER_RPG_TONE[a.tier]] : "border-rpg-border bg-rpg-bg-2 text-rpg-muted"}`}
      style={{ width: size, height: size, borderRadius: 4 }}
      aria-hidden
    >
      {unlocked || achievementState(a) === "progress" ? <Icon size={size * 0.45} /> : <Lock size={size * 0.38} />}
    </span>
  );
}

function AchievementTile({ a, onOpen, featured = false }: { a: Achievement; onOpen: () => void; featured?: boolean }) {
  const state = achievementState(a);
  const unlocked = state === "unlocked";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${a.title}: ${STATE_LABEL[state]}, raridade ${TIER_LABEL[a.tier]}`}
      className={`rpg-panel ${unlocked ? "rpg-panel-gold" : ""} ${state === "notStarted" ? "opacity-75" : ""} w-full text-left p-3.5 flex flex-col gap-2.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold transition`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Medal a={a} size={featured ? 56 : 46} />
        <div className="min-w-0 flex-1">
          <p className="font-rpg font-bold text-rpg-text leading-tight break-words">{a.title}</p>
          <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{a.description}</p>
        </div>
        <RPGBadge tone={TIER_RPG_TONE[a.tier]} className="shrink-0">{TIER_LABEL[a.tier]}</RPGBadge>
      </div>
      {!unlocked && a.threshold ? (
        <RPGProgressBar
          tone={state === "progress" ? "purple" : "muted"}
          label={STATE_LABEL[state]}
          value={Math.min(a.currentValue ?? 0, a.threshold)}
          max={a.threshold}
          valueLabel={`${Math.min(a.currentValue ?? 0, a.threshold)} / ${a.threshold} · ${a.progress}%`}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {unlocked ? (
          <RPGBadge tone="green">Desbloqueada {a.unlockedAt ? `em ${fmtDate(a.unlockedAt)}` : ""}</RPGBadge>
        ) : (
          <span className="text-rpg-muted">{a.category ? CATEGORY_LABEL[a.category] : ""}</span>
        )}
        {a.reward && (
          <span className={`ml-auto inline-flex items-center gap-1.5 font-pixel ${unlocked ? "" : "opacity-70"}`}>
            <span className="text-rpg-purple">+{a.reward.xp} XP</span>
            <span className="text-rpg-gold-light">+{a.reward.coins} 🪙</span>
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Conquistas no tema RPG — "Hall de troféus". Só apresentação: catálogo,
 * progresso e recompensas vêm do backend (nada é desbloqueado no front).
 */
export function RpgAchievementsView({
  achievements,
  isLoading,
  isError,
  onRetry,
  quote,
}: {
  achievements: Achievement[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  quote: string;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<StateFilter>("all");
  const [category, setCategory] = useState<AchievementCategory | "all">("all");
  const [tier, setTier] = useState<AchievementTier | "all">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [open, setOpen] = useState<Achievement | null>(null);

  const total = achievements.length;
  const counts = useMemo(() => {
    const c = { unlocked: 0, progress: 0, notStarted: 0 } as Record<State, number>;
    achievements.forEach((a) => (c[achievementState(a)] += 1));
    return c;
  }, [achievements]);
  const unlocked = achievements.filter((a) => a.unlockedAt);
  const pct = total ? Math.round((counts.unlocked / total) * 100) : 0;
  // Recompensas efetivamente pagas = soma das recompensas das desbloqueadas (pagamento idempotente no backend).
  const earnedXp = unlocked.reduce((s, a) => s + (a.reward?.xp ?? 0), 0);
  const earnedCoins = unlocked.reduce((s, a) => s + (a.reward?.coins ?? 0), 0);
  const byTier = TIER_ORDER.map((t) => ({ t, total: achievements.filter((a) => a.tier === t).length, got: unlocked.filter((a) => a.tier === t).length }));
  const categories = useMemo(() => [...new Set(achievements.map((a) => a.category).filter((c): c is AchievementCategory => !!c))], [achievements]);

  // Em destaque: as mais próximas de completar (maior %), desempate pela raridade — determinístico.
  const featured = useMemo(
    () =>
      achievements
        .filter((a) => !a.unlockedAt)
        .sort((a, b) => b.progress - a.progress || tierRank(b.tier) - tierRank(a.tier))
        .slice(0, 3),
    [achievements],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = achievements.filter(
      (a) =>
        (state === "all" || achievementState(a) === state) &&
        (category === "all" || a.category === category) &&
        (tier === "all" || a.tier === tier) &&
        (!term || `${a.title} ${a.description ?? ""}`.toLowerCase().includes(term)),
    );
    return list.sort((a, b) => {
      if (sort === "progress") return b.progress - a.progress;
      if (sort === "rarity") return tierRank(b.tier) - tierRank(a.tier) || b.progress - a.progress;
      // Mais recentes: desbloqueadas por data desc, depois as demais por progresso.
      if (a.unlockedAt && b.unlockedAt) return b.unlockedAt.localeCompare(a.unlockedAt);
      if (a.unlockedAt) return -1;
      if (b.unlockedAt) return 1;
      return b.progress - a.progress;
    });
  }, [achievements, state, category, tier, q, sort]);

  const field = "px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

  return (
    <div className="space-y-5">
      <RPGPageHeader
        banner="conquistas"
        eyebrow="Hall de troféus"
        title="Conquistas"
        subtitle="Cada conquista é um capítulo da sua história."
        aside={<p className="hidden md:block mx-1.5 my-1.5 max-w-[260px] px-4 py-3 text-sm italic text-rpg-text/90 text-right">&ldquo;{quote}&rdquo;</p>}
        actions={
          <Link to="/timeline" className="rpg-btn rpg-btn-secondary">
            Ver minha história →
          </Link>
        }
      />

      {isError && (
        <RPGPanel variant="danger">
          <p className="text-sm text-rpg-text">Não foi possível carregar suas conquistas.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={onRetry}>Tentar novamente</RPGButton>
        </RPGPanel>
      )}

      <RPGPanel variant="gold" bodyClassName="p-4 sm:p-5">
        {isLoading ? (
          <div className="h-24 rpg-bar animate-pulse" aria-label="Carregando progresso" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] items-center">
            <span className="hidden sm:flex w-20 h-20 items-center justify-center border-2 border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light justify-self-center" style={{ borderRadius: 999 }} aria-hidden>
              <Trophy size={40} />
            </span>
            <div className="min-w-0">
              <p className="font-pixel text-[12px] uppercase tracking-[0.16em] text-rpg-gold">Progresso geral</p>
              <p className="mt-1 text-sm text-rpg-text">{counts.unlocked} de {total} conquistas desbloqueadas</p>
              <RPGProgressBar className="mt-2" tone="purple" label="Conquistas desbloqueadas" value={counts.unlocked} max={Math.max(total, 1)} valueLabel={`${pct}%`} />
              <p className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-pixel text-rpg-purple"><Sparkles size={12} aria-hidden /> +{earnedXp.toLocaleString("pt-BR")} XP obtidos</span>
                <span className="inline-flex items-center gap-1 font-pixel text-rpg-gold-light"><Coins size={12} aria-hidden /> +{earnedCoins} moedas</span>
              </p>
            </div>
            <dl className="grid grid-cols-3 sm:grid-cols-7 lg:grid-cols-7 gap-2">
              {[
                { icon: <Crown size={18} />, v: counts.unlocked, l: "Desbloqueadas", tone: "text-rpg-gold-light" },
                { icon: <Hourglass size={18} />, v: counts.progress, l: "Em progresso", tone: "text-rpg-purple" },
                { icon: <Lock size={18} />, v: counts.notStarted, l: "Não iniciadas", tone: "text-rpg-muted" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col items-center text-center border-2 border-rpg-border bg-rpg-bg/50 px-2 py-2" style={{ borderRadius: 4 }}>
                  <span className={s.tone} aria-hidden>{s.icon}</span>
                  <dd className="font-pixel text-lg text-rpg-text leading-none mt-1">{s.v}</dd>
                  <dt className="text-[10px] text-rpg-muted mt-0.5">{s.l}</dt>
                </div>
              ))}
              {byTier.map(({ t, total: tt, got }) => (
                <div key={t} className="flex flex-col items-center text-center border-2 border-rpg-border bg-rpg-bg/50 px-2 py-2" style={{ borderRadius: 4 }} title={`${got} de ${tt} conquistas ${TIER_LABEL[t]} desbloqueadas`}>
                  <span className={RPG_TONE_TEXT[TIER_RPG_TONE[t]]} aria-hidden><Trophy size={18} /></span>
                  <dd className="font-pixel text-lg text-rpg-text leading-none mt-1">{got}<span className="text-[10px] text-rpg-muted">/{tt}</span></dd>
                  <dt className="text-[10px] text-rpg-muted mt-0.5">{TIER_LABEL[t]}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}
      </RPGPanel>

      <div className="flex flex-col xl:flex-row xl:items-center gap-2">
        <RPGTabs
          label="Estado"
          size="sm"
          className="max-w-full"
          tabs={[
            { value: "all" as StateFilter, label: `Todas (${total})` },
            { value: "unlocked" as StateFilter, label: `Desbloqueadas (${counts.unlocked})` },
            { value: "progress" as StateFilter, label: `Em progresso (${counts.progress})` },
            { value: "notStarted" as StateFilter, label: `Não iniciadas (${counts.notStarted})` },
          ]}
          value={state}
          onChange={setState}
        />
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          <label className="sr-only" htmlFor="ach-cat">Categoria</label>
          <select id="ach-cat" className={field} style={{ borderRadius: 3 }} value={category} onChange={(e) => setCategory(e.target.value as AchievementCategory | "all")}>
            <option value="all">Todas as categorias</option>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <label className="sr-only" htmlFor="ach-tier">Raridade</label>
          <select id="ach-tier" className={field} style={{ borderRadius: 3 }} value={tier} onChange={(e) => setTier(e.target.value as AchievementTier | "all")}>
            <option value="all">Todas as raridades</option>
            {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
          </select>
          <label className="sr-only" htmlFor="ach-sort">Ordenar</label>
          <select id="ach-sort" className={field} style={{ borderRadius: 3 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Mais recentes</option>
            <option value="progress">Maior progresso</option>
            <option value="rarity">Maior raridade</option>
          </select>
        </div>
      </div>

      {featured.length > 0 && state === "all" && (
        <section aria-label="Em destaque">
          <div className="mb-2 flex items-center gap-2">
            <Star size={18} className="text-rpg-gold" aria-hidden />
            <h2 className="font-rpg text-lg font-bold text-rpg-text">Em destaque</h2>
            <span className="text-xs text-rpg-muted">Mais próximas de completar</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map((a) => <AchievementTile key={a.id} a={a} featured onOpen={() => setOpen(a)} />)}
          </div>
        </section>
      )}

      <section aria-label="Todas as conquistas">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Trophy size={18} className="text-rpg-gold" aria-hidden />
          <h2 className="font-rpg text-lg font-bold text-rpg-text">Todas as conquistas</h2>
          <label className="relative ml-auto w-full sm:w-64">
            <span className="sr-only">Buscar conquistas</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conquistas…" className={`${field} w-full pl-8`} style={{ borderRadius: 3 }} />
          </label>
        </div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="rpg-panel h-32 animate-pulse" />)}</div>
        ) : total === 0 ? (
          <RPGPanel><p className="text-sm text-rpg-muted text-center py-6">A jornada está apenas começando.</p></RPGPanel>
        ) : visible.length === 0 ? (
          <p className="text-sm text-rpg-muted text-center py-8">Nenhuma conquista com esses filtros.</p>
        ) : (
          <motion.div layout={!reduce} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((a) => <AchievementTile key={a.id} a={a} onOpen={() => setOpen(a)} />)}
          </motion.div>
        )}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? "Conquista"} size="sm">
        {open && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Medal a={open} size={72} />
              <div className="min-w-0">
                <p className="font-rpg text-lg font-bold text-rpg-text">{open.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <RPGBadge tone={TIER_RPG_TONE[open.tier]}>{TIER_LABEL[open.tier]}</RPGBadge>
                  {open.category && <RPGBadge tone="blue">{CATEGORY_LABEL[open.category]}</RPGBadge>}
                  <RPGBadge tone={open.unlockedAt ? "green" : "muted"}>{STATE_LABEL[achievementState(open)]}</RPGBadge>
                </div>
              </div>
            </div>
            <p className="text-rpg-text/90">{open.description}</p>
            {open.threshold != null && (
              <RPGProgressBar
                tone={open.unlockedAt ? "green" : "purple"}
                label="Requisito"
                value={Math.min(open.currentValue ?? 0, open.threshold)}
                max={open.threshold}
                valueLabel={`${Math.min(open.currentValue ?? 0, open.threshold)} / ${open.threshold}`}
              />
            )}
            {open.reward && (
              <p className="flex gap-3 font-pixel text-xs">
                <span className="text-rpg-purple">+{open.reward.xp} XP</span>
                <span className="text-rpg-gold-light">+{open.reward.coins} moedas</span>
                <span className="text-rpg-muted font-sans">{open.unlockedAt ? "recebidos" : "ao desbloquear"}</span>
              </p>
            )}
            {open.unlockedAt && <p className="text-xs text-rpg-muted">Desbloqueada em {fmtDate(open.unlockedAt)}.</p>}
            <p className="text-[11px] text-rpg-muted">Conquistas são verificadas automaticamente a partir dos seus registros — nunca marcadas à mão.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
