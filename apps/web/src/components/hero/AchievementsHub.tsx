import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import {
  BookOpen,
  CalendarRange,
  ClipboardList,
  Coins,
  Crown,
  Droplets,
  Dumbbell,
  Flame,
  FlaskConical,
  GitCommitHorizontal,
  GraduationCap,
  HandCoins,
  HelpCircle,
  Hourglass,
  Library,
  ListChecks,
  Lock,
  PiggyBank,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection } from "@/components/rpg-modules/ModuleKit";
import type { AchievementsHub, HeroAchievement, HeroAchievementState, HeroRarity } from "@/services/heroService";
import { ITEM_RARITY_TONE, RARITY_UI, STATE_UI, fmtDate, nf } from "./HeroShared";

const ICONS: Record<string, typeof Trophy> = { ListChecks, Rocket, Flame, BookOpen, Library, Timer, ClipboardList, Target, Dumbbell, Droplets, GraduationCap, FlaskConical, Trophy, PiggyBank, HandCoins, ShieldCheck, Crown };
const R = { borderRadius: 4 } as const;
const field = "min-h-[40px] px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

/** Painel de Maestria: números reais (desbloqueios do banco, recompensas pagas pelo ledger). */
export function MasteryPanel({ hub }: { hub: AchievementsHub }) {
  const m = hub.mastery;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <IndicatorCard icon={<Trophy size={22} />} label="Conquistas" value={m.total} hint={`${m.pct}% concluído`} />
        <IndicatorCard icon={<Crown size={22} />} label="Desbloqueadas" value={m.unlocked} tone="green" />
        <IndicatorCard icon={<Hourglass size={22} />} label="Em progresso" value={m.inProgress} tone="purple" />
        <IndicatorCard icon={<Lock size={22} />} label="Não iniciadas" value={m.notStarted} hint={m.locked ? `${m.locked} bloqueada(s) na cadeia` : undefined} tone="blue" />
        <IndicatorCard icon={<Sparkles size={22} />} label="XP de conquistas" value={nf(m.xp)} hint="pago pelo ledger" tone="purple" />
        <IndicatorCard icon={<Coins size={22} />} label="Moedas" value={nf(m.coins)} hint="de conquistas" />
        <IndicatorCard icon={<Flame size={22} />} label="Sequência" value={`${m.streak.current}d`} hint="dias seguidos com XP" tone="orange" />
        <IndicatorCard icon={<Star size={22} />} label="Melhor sequência" value={`${m.streak.best}d`} tone="orange" />
      </div>
      <div className="rpg-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Medalhas por raridade</p>
          <RarityRulesButton hub={hub} />
        </div>
        <RPGProgressBar label="Progresso geral" value={m.unlocked} max={Math.max(1, m.total)} valueLabel={`${m.unlocked}/${m.total} · ${m.pct}%`} tone="gold" />
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {m.byRarity.map((r) => (
            <li key={r.rarity} className={clsx("flex flex-col items-center border-2 bg-rpg-bg/50 px-1 py-2 text-center", RARITY_UI[r.rarity].ring)} style={R}>
              <Trophy size={18} className={clsx(r.unlocked ? "" : "opacity-40")} aria-hidden />
              <span className="mt-1 font-pixel text-base leading-none text-rpg-text tabular-nums">
                {r.unlocked}
                <span className="text-[10px] text-rpg-muted">/{r.total}</span>
              </span>
              <span className="mt-0.5 text-[10px] text-rpg-muted">{RARITY_UI[r.rarity].label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RarityRulesButton({ hub }: { hub: AchievementsHub }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[32px] items-center gap-1 text-xs text-rpg-blue hover:underline">
        <HelpCircle size={13} aria-hidden /> Regras de raridade
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Como a raridade é definida" size="sm">
        <ul className="space-y-2 text-sm">
          {hub.rarityRules.map((r) => (
            <li key={r.rarity} className="flex items-start gap-2">
              <RPGBadge tone={RARITY_UI[r.rarity].tone} className="shrink-0">
                {r.label}
              </RPGBadge>
              <span className="text-rpg-text/90">{r.rule}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-rpg-muted">A recompensa (XP e moedas) segue o tier oficial e é paga uma única vez, no desbloqueio.</p>
      </Modal>
    </>
  );
}

function Medal({ a, size = 48 }: { a: HeroAchievement; size?: number }) {
  const Icon = (a.icon && ICONS[a.icon]) || Trophy;
  const shown = a.state !== "bloqueada" && a.state !== "nao_iniciada";
  return (
    <span className={clsx("flex shrink-0 items-center justify-center border-2", shown ? `${RARITY_UI[a.rarity].ring} bg-rpg-gold/10 text-rpg-gold-light` : "border-rpg-border bg-rpg-bg-2 text-rpg-muted")} style={{ ...R, width: size, height: size }} aria-hidden>
      {shown ? <Icon size={size * 0.45} /> : <Lock size={size * 0.38} />}
    </span>
  );
}

export function AchievementCard({ a, onOpen }: { a: HeroAchievement; onOpen: () => void }) {
  const done = !!a.unlockedAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${a.title}: ${STATE_UI[a.state].label}, ${RARITY_UI[a.rarity].label}`}
      className={clsx("rpg-panel flex w-full flex-col gap-2 p-3 text-left transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", done && "rpg-panel-gold", a.state === "bloqueada" && "opacity-70")}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Medal a={a} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-rpg font-bold leading-tight text-rpg-text">{a.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-rpg-muted">{a.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <RPGBadge tone={RARITY_UI[a.rarity].tone}>{RARITY_UI[a.rarity].label}</RPGBadge>
        <RPGBadge tone={STATE_UI[a.state].tone}>{STATE_UI[a.state].label}</RPGBadge>
        <RPGBadge tone="blue">{a.info.module}</RPGBadge>
        {a.chain && <RPGBadge tone="muted">{a.chain.stage}</RPGBadge>}
      </div>
      {!done && a.threshold ? (
        <RPGProgressBar tone={a.state === "em_progresso" ? "purple" : "muted"} label="Progresso" value={Math.min(a.currentValue ?? 0, a.threshold)} max={a.threshold} valueLabel={`${nf(Math.min(a.currentValue ?? 0, a.threshold))} / ${nf(a.threshold)}`} />
      ) : (
        <p className="text-[11px] text-rpg-green">Desbloqueada em {fmtDate(a.unlockedAt)}</p>
      )}
      {a.reward && (
        <p className="flex items-center gap-2 font-pixel text-[11px]">
          <span className="text-rpg-purple">+{a.reward.xp} XP</span>
          <span className="text-rpg-gold-light">+{a.reward.coins} 🪙</span>
          <span className="font-sans text-rpg-muted">{a.state === "resgatada" ? "recebidos" : done ? "a pagar" : "ao desbloquear"}</span>
        </p>
      )}
    </button>
  );
}

export function AchievementDetail({ a, onClose }: { a: HeroAchievement | null; onClose: () => void }) {
  return (
    <Modal open={!!a} onClose={onClose} title={a?.title ?? "Conquista"} size="sm">
      {a && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <Medal a={a} size={64} />
            <div className="flex flex-wrap gap-1">
              <RPGBadge tone={RARITY_UI[a.rarity].tone}>{RARITY_UI[a.rarity].label}</RPGBadge>
              <RPGBadge tone={STATE_UI[a.state].tone}>{STATE_UI[a.state].label}</RPGBadge>
              {a.chain && (
                <RPGBadge tone="muted">
                  {a.chain.stage} · elo {a.chain.index + 1}/{a.chain.length}
                </RPGBadge>
              )}
            </div>
          </div>
          <p className="text-rpg-text/90">{a.description}</p>
          <dl className="grid gap-1.5 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Critério</dt><dd className="text-right text-rpg-text">{a.threshold != null ? `${nf(a.threshold)} — ${a.info.scope.toLowerCase()}` : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Eventos contados</dt><dd className="text-right text-rpg-text">{a.info.events}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Origem</dt><dd className="text-right text-rpg-text">{a.info.module}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Valor atual</dt><dd className="text-right text-rpg-text tabular-nums">{nf(a.currentValue ?? 0)}{a.remaining > 0 ? ` (faltam ${nf(a.remaining)})` : ""}</dd></div>
            {a.reward && <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Recompensa</dt><dd className="text-right text-rpg-text">+{a.reward.xp} XP · +{a.reward.coins} moedas {a.paidAt ? `(paga em ${fmtDate(a.paidAt)})` : ""}</dd></div>}
            {a.unlockedAt && <div className="flex justify-between gap-2"><dt className="text-rpg-muted">Desbloqueio</dt><dd className="text-right text-rpg-text">{fmtDate(a.unlockedAt)}</dd></div>}
          </dl>
          {a.state === "bloqueada" && <p className="text-xs text-rpg-orange">Desbloqueie antes o elo anterior desta cadeia. O progresso já está sendo contado.</p>}
          <Link to={a.info.link} className="inline-flex min-h-[40px] items-center text-xs font-semibold text-rpg-blue hover:underline" onClick={onClose}>
            Abrir {a.info.module} →
          </Link>
          <p className="text-[11px] text-rpg-muted">Verificada automaticamente a partir dos seus registros — nunca marcada à mão.</p>
        </div>
      )}
    </Modal>
  );
}

type StateFilter = "all" | HeroAchievementState;
type Proximity = "all" | "near" | "half";
type Sort = "proximity" | "recent" | "rarity";

/** Hall de Troféus: destaque + grade com busca e filtros (categoria, raridade, estado, proximidade). */
export function TrophyHall({ hub }: { hub: AchievementsHub }) {
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [moduleF, setModuleF] = useState("all");
  const [rarity, setRarity] = useState<"all" | HeroRarity>("all");
  const [state, setState] = useState<StateFilter>("all");
  const [prox, setProx] = useState<Proximity>("all");
  const [sort, setSort] = useState<Sort>("proximity");
  const [open, setOpen] = useState<HeroAchievement | null>(null);
  const modules = useMemo(() => [...new Set(hub.achievements.map((a) => a.info.module))].sort(), [hub.achievements]);
  const rank = (r: HeroRarity) => ["comum", "incomum", "rara", "epica", "lendaria", "mitica"].indexOf(r);

  const featured = useMemo(() => hub.achievements.filter((a) => !a.unlockedAt && a.state !== "bloqueada").sort((a, b) => b.progress - a.progress || rank(b.rarity) - rank(a.rarity)).slice(0, 3), [hub.achievements]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return hub.achievements
      .filter(
        (a) =>
          (moduleF === "all" || a.info.module === moduleF) &&
          (rarity === "all" || a.rarity === rarity) &&
          (state === "all" || a.state === state) &&
          (prox === "all" || (!a.unlockedAt && (prox === "near" ? a.progress >= 80 : a.progress >= 50))) &&
          (!term || `${a.title} ${a.description ?? ""} ${a.info.module}`.toLowerCase().includes(term)),
      )
      .sort((a, b) => {
        if (sort === "rarity") return rank(b.rarity) - rank(a.rarity) || b.progress - a.progress;
        if (sort === "recent") return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "") || b.progress - a.progress;
        return Number(!!a.unlockedAt) - Number(!!b.unlockedAt) || b.progress - a.progress;
      });
  }, [hub.achievements, q, moduleF, rarity, state, prox, sort]);

  return (
    <div className="space-y-3">
      {featured.length > 0 && (
        <KitSection title="Em destaque — mais perto de completar" icon={<Star size={16} />} tone="gold">
          <div className="grid gap-2 md:grid-cols-3">
            {featured.map((a) => (
              <AchievementCard key={a.id} a={a} onOpen={() => setOpen(a)} />
            ))}
          </div>
        </KitSection>
      )}
      <div className="rpg-panel grid gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="relative lg:col-span-2">
          <span className="sr-only">Buscar conquistas</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conquista…" className={clsx(field, "w-full pl-8")} style={R} />
        </label>
        <select aria-label="Módulo" className={field} style={R} value={moduleF} onChange={(e) => setModuleF(e.target.value)}>
          <option value="all">Todos os módulos</option>
          {modules.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select aria-label="Raridade" className={field} style={R} value={rarity} onChange={(e) => setRarity(e.target.value as "all" | HeroRarity)}>
          <option value="all">Todas as raridades</option>
          {(Object.keys(RARITY_UI) as HeroRarity[]).map((r) => (
            <option key={r} value={r}>
              {RARITY_UI[r].label}
            </option>
          ))}
        </select>
        <select aria-label="Estado" className={field} style={R} value={state} onChange={(e) => setState(e.target.value as StateFilter)}>
          <option value="all">Todos os estados</option>
          {(Object.keys(STATE_UI) as HeroAchievementState[]).map((s) => (
            <option key={s} value={s}>
              {STATE_UI[s].label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Proximidade" className={field} style={R} value={prox} onChange={(e) => setProx(e.target.value as Proximity)}>
            <option value="all">Qualquer %</option>
            <option value="near">≥ 80%</option>
            <option value="half">≥ 50%</option>
          </select>
          <select aria-label="Ordenar" className={field} style={R} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="proximity">Proximidade</option>
            <option value="recent">Recentes</option>
            <option value="rarity">Raridade</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="rpg-panel py-8 text-center text-sm text-rpg-muted">Nenhuma conquista com esses filtros.</p>
      ) : (
        <motion.div layout={!reduce} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((a) => (
            <AchievementCard key={a.id} a={a} onOpen={() => setOpen(a)} />
          ))}
        </motion.div>
      )}
      <AchievementDetail a={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Cadeias: mesma métrica com limiares crescentes, de Fundamentos a Maestria. */
export function ChainsPanel({ hub }: { hub: AchievementsHub }) {
  const [open, setOpen] = useState<HeroAchievement | null>(null);
  const byId = useMemo(() => new Map(hub.achievements.map((a) => [a.id, a])), [hub.achievements]);
  if (!hub.chains.length) return <p className="rpg-panel py-8 text-center text-sm text-rpg-muted">Ainda não há cadeias com mais de uma etapa.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {hub.chains.map((c) => (
        <section key={c.metric} className="rpg-panel p-3" aria-label={`Cadeia ${c.module}`}>
          <div className="mb-2 flex items-center gap-2">
            <GitCommitHorizontal size={16} className="text-rpg-gold" aria-hidden />
            <p className="min-w-0 flex-1 truncate font-rpg font-bold text-rpg-text">{byId.get(c.links[0]!.id)?.info.events ?? c.module}</p>
            <RPGBadge tone="blue">{c.module}</RPGBadge>
          </div>
          <RPGProgressBar label="Elos" value={c.done} max={c.total} valueLabel={`${c.done}/${c.total} elos · valor atual ${nf(c.currentValue)}`} tone="gold" />
          <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {c.links.map((l, i) => {
              const a = byId.get(l.id);
              return (
                <li key={l.id} className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => a && setOpen(a)}
                    className={clsx("flex w-28 flex-col items-center gap-1 border-2 p-2 text-center", l.state === "resgatada" || l.state === "desbloqueada" ? RARITY_UI[l.rarity].ring : "border-rpg-border opacity-80", l.id === c.next && "shadow-[0_0_12px_-3px_rgb(var(--rpg-gold)/0.8)]")}
                    style={R}
                  >
                    <span className="font-pixel text-[9px] uppercase text-rpg-gold">{l.stage}</span>
                    <span className="line-clamp-2 text-[11px] font-semibold text-rpg-text">{l.title}</span>
                    <span className="text-[10px] text-rpg-muted tabular-nums">{l.threshold != null ? nf(l.threshold) : "—"}</span>
                    <RPGBadge tone={STATE_UI[l.state].tone}>{STATE_UI[l.state].label}</RPGBadge>
                  </button>
                  {i < c.links.length - 1 && <span className="text-rpg-muted" aria-hidden>→</span>}
                </li>
              );
            })}
          </ol>
          <Link to={c.link} className="mt-1 inline-flex min-h-[36px] items-center text-xs text-rpg-blue hover:underline">
            Avançar em {c.module} →
          </Link>
        </section>
      ))}
      <AchievementDetail a={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Títulos (Códex) + trilha da temporada mensal — ambos com regras oficiais. */
export function TitlesSeasonPanel({ hub }: { hub: AchievementsHub }) {
  const s = hub.season;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <KitSection title="Progressão de títulos" icon={<Crown size={16} />} action={<Link to="/codex" className="text-xs text-rpg-blue hover:underline">Códex →</Link>}>
        <ul className="space-y-2">
          {hub.titles.map((t) => (
            <li key={t.id} className={clsx("border border-rpg-border/70 bg-rpg-bg-2/60 p-2", t.equipped && "border-rpg-gold")} style={R}>
              <div className="flex items-center gap-2">
                {t.unlocked ? <Crown size={16} className="text-rpg-gold" aria-hidden /> : <Lock size={14} className="text-rpg-muted" aria-hidden />}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{t.name}</p>
                <RPGBadge tone={ITEM_RARITY_TONE[t.rarity] ?? "muted"}>{t.rarity}</RPGBadge>
                {t.equipped && <RPGBadge tone="gold">Equipado</RPGBadge>}
              </div>
              <p className="mt-0.5 text-[11px] text-rpg-muted">{t.description}</p>
              {!t.unlocked && <RPGProgressBar className="mt-1" label={t.name} showLabel={false} value={t.progress} max={100} tone="purple" />}
              {t.unlocked && t.unlockedAt && <p className="mt-0.5 text-[10px] text-rpg-green">Conquistado em {fmtDate(t.unlockedAt)}</p>}
            </li>
          ))}
        </ul>
      </KitSection>
      <KitSection title={`Temporada: ${s.name}`} icon={<CalendarRange size={16} />} tone="gold">
        <p className="text-xs text-rpg-muted">
          {s.motto} · {fmtDate(s.from)} a {fmtDate(s.to)} · {s.daysLeft} dia(s) restantes
        </p>
        <RPGProgressBar className="mt-2" label="XP da temporada" value={s.xp} max={s.tiers.at(-1)?.xp ?? 1} valueLabel={`${nf(s.xp)} XP · tier ${s.tier}/${s.maxTier}`} tone="gold" />
        {s.nextTier && <p className="mt-1 text-[11px] text-rpg-text">Próximo marco: tier {s.nextTier.tier} ({s.nextTier.reward}) — faltam {nf(s.nextTier.missing)} XP.</p>}
        <ol className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {s.tiers.map((t) => (
            <li key={t.tier} className={clsx("border-2 p-2 text-center", t.unlocked ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border opacity-75")} style={R}>
              <p className="font-pixel text-[10px] text-rpg-gold">Tier {t.tier}</p>
              <p className="text-[11px] font-semibold text-rpg-text">{t.reward}</p>
              <p className="text-[10px] text-rpg-muted tabular-nums">{nf(t.xp)} XP</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[10px] text-rpg-muted">A temporada soma o XP real do mês (xp_events). Nada é comprado.</p>
      </KitSection>
    </div>
  );
}
