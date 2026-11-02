import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { ArrowLeft, BarChart3, BookOpen, ChevronRight, Compass, Crown, Flag, Gem, Lock, Scale, ScrollText, Search, Shield, Sparkles, Swords, Target } from "lucide-react";
import { RPGAvatar, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { useAuth } from "@/hooks/useAuth";
import { useEquippedTitle, useHeroHud } from "@/hooks/useCodex";
import { useQuests } from "@/hooks/useQuests";
import type { Codex } from "@/services/codexService";
import { ATTR_UI, RARITY, timeAgo } from "@/utils/codexDisplay";
import { CODEX_REF, KIND_LABEL, buildCodexEntries, collectionCategories, entryNo, type CodexEntry, type EntryKind } from "@/utils/codexCollection";
import type { CodexSelection } from "./CodexSidebar";

/**
 * Códex da Jornada v2 — composição inspirada nas referências aprovadas
 * (desktop: livro central + painéis; celular: banner, perfil, destaque,
 * carrossel). As ilustrações são assets; números, nomes e estados vêm
 * sempre do /api/codex, quests e perfil reais.
 */

export type CodexTabKey = "overview" | "attributes" | "discoveries" | "classes" | "relics" | "missions" | "achievements" | "milestones" | "contracts" | "areas";
type Select = (s: CodexSelection) => void;

const PANEL = "rpg-panel relative overflow-hidden";
const SECTION_TITLE = "font-rpg font-bold uppercase tracking-[0.06em] text-rpg-gold-light";

/* ------------------------------------------------------------------ */
/* Dados derivados compartilhados                                       */
/* ------------------------------------------------------------------ */

function useHeroInfo(codex: Codex) {
  const { user } = useAuth();
  const title = useEquippedTitle();
  const { data: hud } = useHeroHud();
  const strongest = [...codex.attributes].sort((a, b) => b.xp - a.xp)[0] ?? null;
  // Estilo da jornada: rótulo do equilíbrio real entre atributos (sinergia do backend).
  const style = codex.synergy.balance >= 0.7 ? "Equilíbrio" : strongest && strongest.xp > 0 ? `Foco em ${strongest.label}` : "Em formação";
  return {
    name: user?.name?.split(" ")[0] ?? "Aventureiro",
    title,
    className: hud?.currentClass?.name ?? codex.suggestedClass?.name ?? null,
    style,
    strongest,
  };
}

/** Missão semanal em andamento (a mais avançada ainda não concluída) — dado real do Quadro de Quests. */
function useActiveJourney() {
  const { data } = useQuests();
  return useMemo(() => {
    if (!data) return null;
    const weekly = data.weekly.quests;
    const open = weekly.filter((q) => !q.completed).sort((a, b) => b.progress / Math.max(1, b.target) - a.progress / Math.max(1, a.target));
    const done = weekly.filter((q) => q.completed).length;
    const quest = open[0] ?? data.daily.quests.find((q) => !q.completed) ?? null;
    return { quest, weeklyDone: done, weeklyTotal: weekly.length, daysLeft: data.weekly.daysLeft };
  }, [data]);
}

function companionMessage(codex: Codex, entries: CodexEntry[]): string {
  const fresh = entries.filter((e) => e.state === "new").length;
  if (!codex.hasData) return "E aí, herói! Conclua uma missão ou escreva no Diário para abrir a primeira página do Códex.";
  if (fresh > 0) return `E aí, herói! Há ${fresh} ${fresh === 1 ? "nova entrada" : "novas entradas"} no Códex te esperando!`;
  return "E aí, herói! Vamos registrar mais um capítulo da sua jornada?";
}

/* ------------------------------------------------------------------ */
/* Cabeçalhos                                                          */
/* ------------------------------------------------------------------ */

/** Desktop/notebook: título + busca à esquerda, cena do herói lendo + companheiro com balão. */
export function CodexHeroBanner({ codex, query, onQuery }: { codex: Codex | null; query: string; onQuery: (q: string) => void }) {
  const entries = useMemo(() => (codex ? buildCodexEntries(codex) : []), [codex]);
  return (
    <header className={clsx(PANEL, "rpg-panel-gold min-h-[220px]")}>
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgb(var(--rpg-purple)/0.25),transparent_60%)]" aria-hidden />
      <img
        src={CODEX_REF.scene}
        alt=""
        aria-hidden
        decoding="async"
        className="pixelated absolute right-0 top-0 h-full w-[62%] object-cover object-left [mask-image:linear-gradient(to_right,transparent,black_18%)]"
      />
      <div className="relative grid min-h-[220px] grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-4 p-5 xl:p-6">
        <div className="min-w-0 max-w-md">
          <div className="flex items-center gap-3">
            <span className="codex-glow flex h-14 w-14 shrink-0 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 4 }} aria-hidden>
              <BookOpen size={30} />
            </span>
            <h1 className="rpg-title text-3xl xl:text-4xl font-bold leading-none">Códex da Jornada</h1>
          </div>
          <p className="mt-3 text-sm text-rpg-text/90">
            A enciclopédia pessoal do seu herói. Registre sua evolução, descubra conhecimentos, colete conquistas e acompanhe toda a sua jornada de transformação.
          </p>
          <CodexSearch query={query} onQuery={onQuery} className="mt-4" />
        </div>
        <div className="relative hidden xl:block h-full">
          <p className="absolute right-0 -top-1 max-w-[240px] text-right text-xs italic text-rpg-text/85">&ldquo;Toda grande história começa com um registro.&rdquo;</p>
          <div className="absolute right-0 top-8 max-w-[230px] border-2 border-rpg-gold/70 bg-rpg-bg/90 px-3 py-2 shadow-rpg" style={{ borderRadius: 6 }} role="note">
            <p className="font-pixel text-[11px] uppercase tracking-wide text-rpg-gold">Companheiro do Códex</p>
            <p className="mt-0.5 text-xs italic text-rpg-text">{codex ? companionMessage(codex, entries) : "Abrindo o Códex…"}</p>
            <span className="absolute -bottom-2 right-10 h-3 w-3 rotate-45 border-b-2 border-r-2 border-rpg-gold/70 bg-rpg-bg" aria-hidden />
          </div>
        </div>
      </div>
    </header>
  );
}

/** Celular: personagem segurando o Códex à esquerda, título e descrição à direita. */
export function CodexMobileBanner() {
  return (
    <header className={clsx(PANEL, "rpg-panel-gold")}>
      <img src={CODEX_REF.mobileBanner} alt="" aria-hidden decoding="async" className="pixelated absolute inset-y-0 left-0 h-full w-[62%] object-cover object-left" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-rpg-bg/60 to-rpg-bg" aria-hidden />
      <div className="relative ml-auto flex min-h-[170px] w-[64%] flex-col justify-center py-4 pr-4 text-right">
        <h1 className="rpg-title text-[26px] min-[400px]:text-3xl font-bold leading-[1.05]">Códex da Jornada</h1>
        <p className="mt-2 text-[12.5px] leading-snug text-rpg-text/90">Documente sua jornada, descubra seus pontos fortes e registre o conhecimento que constrói sua melhor versão.</p>
        <span className="mt-2 ml-auto block h-px w-24 bg-gradient-to-r from-transparent to-rpg-gold" aria-hidden />
      </div>
    </header>
  );
}

/** Card de perfil compacto do celular (avatar, nome, título, nível e XP). */
export function CodexMobileProfile({ codex }: { codex: Codex }) {
  const hero = useHeroInfo(codex);
  const g = codex.global;
  return (
    <Link to="/perfil" className={clsx(PANEL, "rpg-panel-gold block")} aria-label={`Perfil de ${hero.name}, nível ${g.level}`}>
      <img src="/assets/rpg/banners/reino.webp" alt="" aria-hidden loading="lazy" className="pixelated absolute inset-0 h-full w-full object-cover object-right opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-rpg-bg/20" aria-hidden />
      <div className="relative flex items-center gap-3 p-3">
        <RPGAvatar size="md" frame="gold" className="shrink-0" alt={`Retrato de ${hero.name}`} />
        <div className="min-w-0 flex-1">
          <p className="rpg-title text-xl font-bold leading-tight truncate">{hero.name}</p>
          <p className="text-xs text-rpg-text/80 truncate">{hero.title || hero.className || "Aventureiro"}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="shrink-0 border border-rpg-gold/70 bg-rpg-bg-2 px-1.5 py-0.5 font-pixel text-[11px] text-rpg-gold-light" style={{ borderRadius: 2 }}>
              Nv. {g.level}
            </span>
            <RPGProgressBar showLabel={false} tone="gold" label="Experiência do nível" value={g.xpIntoLevel} max={g.xpForNextLevel} className="flex-1" />
            <span className="shrink-0 font-pixel text-[10px] text-rpg-text tabular-nums">
              {g.xpIntoLevel}/{g.xpForNextLevel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CodexSearch({ query, onQuery, className }: { query: string; onQuery: (q: string) => void; className?: string }) {
  return (
    <label className={clsx("relative block", className)}>
      <span className="sr-only">Buscar no Códex</span>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Buscar no Códex, descobertas, relíquias…"
        className="w-full min-h-[42px] border border-rpg-gold/50 bg-rpg-bg-2/90 py-2 pl-9 pr-3 text-sm text-rpg-text outline-none placeholder:text-rpg-muted/80 focus:border-rpg-gold"
        style={{ borderRadius: 3 }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Painéis da visão geral (desktop)                                    */
/* ------------------------------------------------------------------ */

function PanelTitle({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-rpg-gold" aria-hidden>
        {icon}
      </span>
      <h2 className={clsx(SECTION_TITLE, "text-[15px]")}>{children}</h2>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

const SEE = "text-xs text-rpg-gold-light hover:underline";

export function CodexHeroProfile({ codex }: { codex: Codex }) {
  const hero = useHeroInfo(codex);
  const g = codex.global;
  return (
    <section className={clsx(PANEL, "p-4")} aria-label="Perfil do herói">
      <PanelTitle icon={<Sparkles size={17} />} action={<Link to="/perfil" className={SEE}>Ver perfil →</Link>}>
        Perfil do herói
      </PanelTitle>
      <div className="flex items-center gap-4">
        <RPGAvatar size="lg" frame="gold" className="shrink-0" alt={`Retrato de ${hero.name}`} />
        <div className="min-w-0 flex-1">
          <p className="rpg-title text-2xl font-bold leading-tight truncate uppercase">{hero.name}</p>
          <p className="text-sm text-rpg-text/80 truncate">{hero.title || "Aventureiro"}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 border border-rpg-gold/70 bg-rpg-bg-2 px-1.5 py-0.5 font-pixel text-xs text-rpg-gold-light" style={{ borderRadius: 2 }}>
              Nv. {g.level}
            </span>
            <RPGProgressBar showLabel={false} tone="gold" label="Experiência do nível" value={g.xpIntoLevel} max={g.xpForNextLevel} className="flex-1" />
          </div>
          <p className="mt-1 text-right font-pixel text-[11px] text-rpg-muted tabular-nums">
            {g.xpIntoLevel} / {g.xpForNextLevel} XP
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 border border-rpg-border/80 bg-rpg-bg/40 text-sm" style={{ borderRadius: 3 }}>
        <div className="flex items-center gap-2 border-r border-rpg-border/80 p-2.5">
          <BookOpen size={20} className="shrink-0 text-rpg-gold" aria-hidden />
          <div className="min-w-0">
            <dt className="text-[11px] text-rpg-muted">Classe atual</dt>
            <dd className="truncate text-rpg-text">{hero.className ?? "Dados insuficientes"}</dd>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5">
          <Scale size={20} className="shrink-0 text-rpg-gold" aria-hidden />
          <div className="min-w-0">
            <dt className="text-[11px] text-rpg-muted">Estilo de jornada</dt>
            <dd className="truncate text-rpg-text">{hero.style}</dd>
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2 border-t border-rpg-border/80 p-2.5">
          <Crown size={20} className="shrink-0 text-rpg-gold" aria-hidden />
          <div className="min-w-0">
            <dt className="text-[11px] text-rpg-muted">Título</dt>
            <dd className="truncate text-rpg-text">{hero.title || "Nenhum título equipado"}</dd>
          </div>
        </div>
      </dl>
    </section>
  );
}

/** O livro mágico central — abre a enciclopédia (aba Descobertas). */
export function CodexMagicBook({ codex, onOpen }: { codex: Codex; onOpen: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={reduce ? undefined : { y: -4, rotate: -1 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      className="group relative flex h-full min-h-[300px] w-full flex-col items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
      aria-label={`Abrir o Códex: ${codex.completion.unlocked} de ${codex.completion.total} entradas reveladas`}
    >
      <span className="codex-aura pointer-events-none absolute inset-6 rounded-full bg-rpg-gold/20 blur-3xl" aria-hidden />
      <img src={CODEX_REF.book} alt="" aria-hidden decoding="async" className="pixelated relative w-full max-w-[340px] object-contain drop-shadow-[0_12px_24px_rgb(0_0_0/0.6)]" />
      <span className="relative -mt-3 inline-flex items-center gap-1.5 border-2 border-rpg-gold bg-rpg-bg/90 px-3 py-1.5 font-pixel text-xs uppercase tracking-wide text-rpg-gold-light shadow-rpg group-hover:bg-rpg-gold/20" style={{ borderRadius: 3 }}>
        <BookOpen size={13} aria-hidden /> Abrir o Códex · {codex.completion.unlocked}/{codex.completion.total}
      </span>
    </motion.button>
  );
}

export function CodexJourneyProgress({ codex }: { codex: Codex }) {
  const journey = useActiveJourney();
  const rows: Array<{ icon: ReactNode; label: string; value: string }> = [
    { icon: <BarChart3 size={13} />, label: "Atributos", value: `${codex.attributes.filter((a) => a.level > 1).length} / ${codex.attributes.length}` },
    { icon: <Shield size={13} />, label: "Títulos", value: `${codex.titles.filter((t) => t.unlocked).length} / ${codex.titles.length}` },
    { icon: <Gem size={13} />, label: "Relíquias", value: `${codex.relics.filter((r) => r.unlocked).length} / ${codex.relics.length}` },
    { icon: <Sparkles size={13} />, label: "Conhecimento", value: `${codex.knowledge.filter((k) => k.unlocked).length} / ${codex.knowledge.length}` },
    ...(journey && journey.weeklyTotal > 0 ? [{ icon: <Swords size={13} />, label: "Missões da semana", value: `${journey.weeklyDone} / ${journey.weeklyTotal}` }] : []),
  ];
  return (
    <section className={clsx(PANEL, "p-4")} aria-label="Progresso da jornada">
      <PanelTitle icon={<Compass size={17} />}>Progresso da jornada</PanelTitle>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative flex min-h-[120px] flex-col justify-end overflow-hidden border border-rpg-border/70 p-3" style={{ borderRadius: 3 }}>
          <img src="/assets/rpg/banners/reino.webp" alt="" aria-hidden loading="lazy" className="pixelated absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-rpg-bg via-rpg-bg/50 to-transparent" aria-hidden />
          <p className="relative rpg-title text-3xl font-bold tabular-nums">{codex.completion.pct}%</p>
          <p className="relative text-xs text-rpg-text/85">Jornada em progresso</p>
          <RPGProgressBar showLabel={false} tone="gold" label="Progresso no Códex" value={codex.completion.pct} className="relative mt-2" />
        </div>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 border border-rpg-border/60 bg-rpg-bg/40 px-2 py-1 text-xs" style={{ borderRadius: 3 }}>
              <span className="text-rpg-gold" aria-hidden>
                {r.icon}
              </span>
              <span className="flex-1 text-rpg-text/90 truncate">{r.label}</span>
              <span className="font-pixel tabular-nums text-rpg-text">{r.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Ladrilho de entrada da coleção: bloqueado (silhueta + ?), descoberto e novo (brilho até ser visto). */
export function EntryTile({ entry, onSelect, size = "md", showName = true }: { entry: CodexEntry; onSelect: Select; size?: "sm" | "md"; showName?: boolean }) {
  const locked = entry.state === "locked";
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.selection)}
      className={clsx(
        "group relative flex w-full flex-col items-center gap-1 border-2 bg-rpg-bg/70 p-1.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold",
        entry.state === "new" ? "codex-new border-rpg-gold" : locked ? "border-rpg-border/70" : "border-rpg-gold/50 hover:border-rpg-gold",
      )}
      style={{ borderRadius: 4 }}
      aria-label={`${entryNo(entry.no)} ${locked ? "Entrada bloqueada" : entry.name} — ${KIND_LABEL[entry.kind]}${entry.state === "new" ? ", nova" : ""}`}
    >
      {entry.state === "new" && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 border border-rpg-gold bg-rpg-gold px-1 font-pixel text-[9px] uppercase text-rpg-bg" style={{ borderRadius: 2 }}>
          Novo
        </span>
      )}
      <span className={clsx("relative flex items-center justify-center", size === "sm" ? "h-12 w-12" : "h-16 w-16")}>
        <img
          src={locked ? CODEX_REF.locked : entry.art}
          alt=""
          aria-hidden
          loading="lazy"
          className={clsx("pixelated h-full w-full object-contain", locked && entry.kind !== "knowledge" && "opacity-80")}
        />
        {locked && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center border border-rpg-border bg-rpg-bg text-rpg-muted" style={{ borderRadius: 999 }} aria-hidden>
            <Lock size={10} />
          </span>
        )}
        {entry.state === "discovered" && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center bg-rpg-green text-[11px] font-bold text-rpg-bg" style={{ borderRadius: 999 }} aria-hidden>
            ✓
          </span>
        )}
      </span>
      {showName && (
        <span className={clsx("line-clamp-2 text-[11px] leading-tight", locked ? "text-rpg-muted" : "text-rpg-text")}>{locked ? "???" : entry.name}</span>
      )}
    </button>
  );
}

export function CodexRecentDiscoveries({ entries, onSelect, onSeeAll, limit = 4 }: { entries: CodexEntry[]; onSelect: Select; onSeeAll: () => void; limit?: number }) {
  const recent = entries
    .filter((e) => e.state !== "locked")
    .sort((a, b) => (b.state === "new" ? 1 : 0) - (a.state === "new" ? 1 : 0) || (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, limit);
  return (
    <section className={clsx(PANEL, "p-4")} aria-label="Últimas descobertas">
      <PanelTitle icon={<Sparkles size={17} />} action={<button type="button" className={SEE} onClick={onSeeAll}>Ver todas →</button>}>
        Últimas descobertas
      </PanelTitle>
      {recent.length === 0 ? (
        <p className="text-xs text-rpg-muted">Nenhuma entrada revelada ainda. Registre hábitos, sono, treinos e tarefas para o Códex encontrar seus padrões.</p>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {recent.map((e) => (
            <li key={e.key}>
              <EntryTile entry={e} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionCard({
  title,
  description,
  icon,
  badge,
  art,
  footer,
  onClick,
  to,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
  art?: string;
  footer?: ReactNode;
  onClick?: () => void;
  to?: string;
}) {
  const body = (
    <>
      {art && <img src={art} alt="" aria-hidden loading="lazy" className="pixelated absolute inset-0 h-full w-full object-cover opacity-55 transition-opacity group-hover:opacity-75" />}
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/75 to-transparent" aria-hidden />
      <div className="relative flex h-full flex-col p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className={clsx(SECTION_TITLE, "text-base leading-tight")}>{title}</p>
            <p className="mt-0.5 text-xs text-rpg-text/85 line-clamp-2">{description}</p>
          </div>
          {badge && (
            <span className="shrink-0 border border-rpg-gold/60 bg-rpg-bg/80 px-1.5 py-0.5 font-pixel text-[11px] text-rpg-gold-light tabular-nums" style={{ borderRadius: 2 }}>
              {badge}
            </span>
          )}
        </div>
        {footer && <div className="mt-auto pt-3">{footer}</div>}
      </div>
    </>
  );
  const cls = clsx(PANEL, "group block min-h-[132px] w-full text-left hover:border-rpg-gold/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold");
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function CodexSectionCards({ codex, onTab, compact = false }: { codex: Codex; onTab: (t: CodexTabKey) => void; compact?: boolean }) {
  const hero = useHeroInfo(codex);
  const journey = useActiveJourney();
  const s = hero.strongest;
  const relicsOn = codex.relics.filter((r) => r.unlocked).length;
  const topClass = [...codex.classes].sort((a, b) => b.score - a.score)[0];
  const cards = [
    {
      key: "attributes" as const,
      title: "Atributos",
      description: "Sua força em diferentes pilares da jornada.",
      icon: <BarChart3 size={18} />,
      art: s ? ATTR_UI[s.key].art : undefined,
      badge: s ? `Nv. ${s.level}` : undefined,
      footer: s ? (
        <RPGProgressBar tone={ATTR_UI[s.key].tone} label={`${s.label} (mais forte)`} value={s.xp - s.levelStartXp} max={Math.max(1, s.nextLevelXp - s.levelStartXp)} valueLabel={`${s.progressPct}%`} />
      ) : undefined,
    },
    {
      key: "classes" as const,
      title: "Classes",
      description: "Arquétipos que guiam seu estilo de evolução.",
      icon: <Shield size={18} />,
      art: "/assets/rpg/campaigns/torre.webp",
      footer: topClass ? <RPGProgressBar tone="green" label={hero.className ?? topClass.name} value={Math.round(topClass.score)} valueLabel={`${Math.round(topClass.score)}%`} /> : undefined,
    },
    {
      key: "relics" as const,
      title: "Relíquias",
      description: "Itens e marcos de alto impacto que você conquistou.",
      icon: <Gem size={18} />,
      art: "/assets/rpg/campaigns/ruina.webp",
      badge: `${relicsOn} / ${codex.relics.length}`,
      footer: undefined,
    },
    {
      key: "missions" as const,
      title: "Missões",
      description: "Desafios que movem sua jornada adiante.",
      icon: <Swords size={18} />,
      art: "/assets/rpg/campaigns/castelo.webp",
      badge: journey && journey.weeklyTotal > 0 ? `${journey.weeklyDone} / ${journey.weeklyTotal}` : undefined,
      footer: undefined,
    },
  ];
  return (
    <div className={clsx("grid gap-3", compact ? "grid-cols-1 min-[420px]:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4")}>
      {(compact ? cards.slice(1) : cards).map((c) => (
        <SectionCard key={c.key} title={c.title} description={c.description} icon={c.icon} art={c.art} badge={c.badge} footer={compact ? undefined : c.footer} onClick={() => onTab(c.key)} />
      ))}
    </div>
  );
}

export function CodexChronicleCard() {
  return (
    <section className={clsx(PANEL, "min-h-[180px]")} aria-label="Registros da jornada">
      <img src={CODEX_REF.camp} alt="" aria-hidden loading="lazy" className="pixelated absolute inset-y-0 right-0 h-full w-[60%] object-cover [mask-image:linear-gradient(to_right,transparent,black_35%)]" />
      <div className="relative flex h-full min-h-[180px] flex-col p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
            <ScrollText size={20} />
          </span>
          <div className="min-w-0 max-w-xs">
            <h2 className={clsx(SECTION_TITLE, "text-lg")}>Registros da jornada</h2>
            <p className="text-xs text-rpg-text/85">Sua crônica pessoal: reflexões, aprendizados e marcos importantes.</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Link to="/timeline" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-xs">
            Abrir crônica <ChevronRight size={13} aria-hidden />
          </Link>
          <Link to="/diario" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-xs">
            Diário <ChevronRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function CodexCollectionCard({ codex, onOpen }: { codex: Codex; onOpen: () => void }) {
  const cats = collectionCategories(codex);
  return (
    <section className={clsx(PANEL, "p-4")} aria-label="Coleção do Códex">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={clsx(SECTION_TITLE, "text-lg")}>Coleção do Códex</h2>
          <p className="text-xs text-rpg-text/85">Conhecimentos, relíquias e títulos catalogados na sua enciclopédia pessoal.</p>
        </div>
        <div className="w-full sm:w-56">
          <p className="mb-1 text-right font-pixel text-xs text-rpg-text tabular-nums">
            {codex.completion.unlocked} / {codex.completion.total} coletados
          </p>
          <RPGProgressBar showLabel={false} tone="gold" label="Itens coletados" value={codex.completion.pct} />
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {cats.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={onOpen}
              className="flex w-full flex-col items-center gap-1 border-2 border-rpg-gold/40 bg-rpg-bg/60 px-1 py-2 hover:border-rpg-gold"
              style={{ borderRadius: 3 }}
              aria-label={`${c.label}: ${c.unlocked} de ${c.total}`}
            >
              <img src={c.art} alt="" aria-hidden loading="lazy" className={clsx("pixelated h-9 w-9 object-contain", c.unlocked === 0 && "grayscale opacity-60")} />
              <span className="w-full truncate text-[10.5px] text-rpg-text">{c.label}</span>
              <span className="border border-rpg-border bg-rpg-bg px-1.5 font-pixel text-[10px] text-rpg-muted tabular-nums" style={{ borderRadius: 2 }}>
                {c.unlocked} / {c.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Composições                                                         */
/* ------------------------------------------------------------------ */

export function CodexDesktopOverview({ codex, onSelect, onTab }: { codex: Codex; onSelect: Select; onTab: (t: CodexTabKey) => void }) {
  const entries = useMemo(() => buildCodexEntries(codex), [codex]);
  return (
    <div className="space-y-3">
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.15fr)]">
        <CodexHeroProfile codex={codex} />
        <CodexMagicBook codex={codex} onOpen={() => onTab("discoveries")} />
        <div className="space-y-3 min-w-0">
          <CodexJourneyProgress codex={codex} />
          <CodexRecentDiscoveries entries={entries} onSelect={onSelect} onSeeAll={() => onTab("discoveries")} />
        </div>
      </div>
      <CodexSectionCards codex={codex} onTab={onTab} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <CodexChronicleCard />
        <CodexCollectionCard codex={codex} onOpen={() => onTab("discoveries")} />
      </div>
    </div>
  );
}

/** Celular: perfil, destaque, atributos, carrossel de descobertas, cards e jornada ativa. */
export function CodexMobileOverview({ codex, onSelect, onTab }: { codex: Codex; onSelect: Select; onTab: (t: CodexTabKey) => void }) {
  const entries = useMemo(() => buildCodexEntries(codex), [codex]);
  const featured =
    entries.find((e) => e.state === "new") ??
    [...entries].filter((e) => e.state !== "locked").sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0] ??
    entries.filter((e) => e.state === "locked").sort((a, b) => b.progress - a.progress)[0] ??
    null;
  const carousel = [
    ...entries.filter((e) => e.state !== "locked").sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 8),
    ...entries.filter((e) => e.state === "locked").sort((a, b) => b.progress - a.progress).slice(0, 2),
  ];
  const attrs = [...codex.attributes].sort((a, b) => b.xp - a.xp);
  return (
    <div className="space-y-4">
      {featured && (
        <section className={clsx(PANEL, "rpg-panel-gold")} aria-label="Códex em destaque">
          <img src={CODEX_REF.featured} alt="" aria-hidden loading="lazy" className="pixelated absolute inset-y-0 right-0 h-full w-[55%] object-cover [mask-image:linear-gradient(to_right,transparent,black_30%)]" />
          <div className="relative w-[68%] p-3.5">
            <p className="font-pixel text-[10.5px] uppercase tracking-[0.14em] text-rpg-gold">✦ Códex em destaque</p>
            <p className="rpg-title mt-1 text-xl font-bold leading-tight">{featured.state === "locked" ? "Próxima entrada" : featured.name}</p>
            <p className="text-[11px] text-rpg-muted">
              {KIND_LABEL[featured.kind]}
              {featured.at ? ` · ${timeAgo(featured.at)}` : featured.state === "locked" ? ` · ${featured.progress}%` : ""}
            </p>
            <p className="mt-1 text-xs text-rpg-text/90 line-clamp-2">{featured.state === "locked" ? featured.hint : featured.description}</p>
            <button type="button" onClick={() => onSelect(featured.selection)} className="rpg-btn rpg-btn-secondary mt-2.5 inline-flex items-center gap-1.5 text-xs">
              <BookOpen size={13} aria-hidden /> Explorar no Códex <ChevronRight size={13} aria-hidden />
            </button>
          </div>
        </section>
      )}

      <section aria-label="Atributos">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 size={16} className="text-rpg-gold" aria-hidden />
          <h2 className={clsx(SECTION_TITLE, "text-[15px]")}>Atributos</h2>
          <button type="button" onClick={() => onTab("attributes")} className={clsx(SEE, "ml-auto")}>
            Ver todos →
          </button>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {attrs.map((a) => {
            const ui = ATTR_UI[a.key];
            const Icon = ui.icon;
            return (
              <li key={a.key} className="w-[44%] min-w-[150px] max-w-[190px] shrink-0 snap-start">
                <button type="button" onClick={() => onTab("attributes")} className={clsx(PANEL, "block w-full p-2.5 text-left")}>
                  <div className="flex items-center gap-1.5">
                    <span className={clsx("shrink-0", RPG_TONE_TEXT[ui.tone])} aria-hidden>
                      <Icon size={16} />
                    </span>
                    <span className={clsx("flex-1 truncate font-rpg text-sm font-bold", RPG_TONE_TEXT[ui.tone])}>{a.label}</span>
                    <span className="shrink-0 border border-rpg-border bg-rpg-bg px-1 font-pixel text-[10px] text-rpg-text" style={{ borderRadius: 2 }}>
                      Nv. {a.level}
                    </span>
                  </div>
                  <RPGProgressBar showLabel={false} tone={ui.tone} label={a.label} value={a.xp - a.levelStartXp} max={Math.max(1, a.nextLevelXp - a.levelStartXp)} className="mt-2" />
                  <div className="mt-1 flex items-center justify-between font-pixel text-[10px] text-rpg-muted tabular-nums">
                    <span>
                      {a.xp} / {a.nextLevelXp} XP
                    </span>
                    {a.trendPct != null && <span className={a.trendPct >= 0 ? "text-rpg-green" : "text-rpg-red"}>{a.trendPct >= 0 ? "↑" : "↓"}{Math.abs(a.trendPct)}%</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Descobertas recentes">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={16} className="text-rpg-gold" aria-hidden />
          <h2 className={clsx(SECTION_TITLE, "text-[15px]")}>Descobertas</h2>
          <button type="button" onClick={() => onTab("discoveries")} className={clsx(SEE, "ml-auto")}>
            Ver todas →
          </button>
        </div>
        {carousel.length === 0 ? (
          <p className="text-xs text-rpg-muted">O Códex ainda não tem entradas. Registre sua rotina para revelar as primeiras.</p>
        ) : (
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {carousel.map((e) => (
              <li key={e.key} className="w-[76px] shrink-0 snap-start">
                <EntryTile entry={e} onSelect={onSelect} size="sm" showName={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CodexSectionCards codex={codex} onTab={onTab} compact />
      <CodexActiveJourney />
      <CodexCollectionCard codex={codex} onOpen={() => onTab("discoveries")} />
      <CodexChronicleCard />
    </div>
  );
}

export function CodexActiveJourney() {
  const journey = useActiveJourney();
  if (!journey?.quest) return null;
  const q = journey.quest;
  const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
  return (
    <Link to="/quests" className={clsx(PANEL, "block hover:border-rpg-gold/80")} aria-label={`Jornada ativa: ${q.title}`}>
      <img src={CODEX_REF.signpost} alt="" aria-hidden loading="lazy" className="pixelated absolute inset-y-0 left-0 h-full w-20 object-cover opacity-90" />
      <img src={CODEX_REF.chest} alt="" aria-hidden loading="lazy" className="pixelated absolute inset-y-0 right-0 h-full w-24 object-cover opacity-90" />
      <div className="relative mx-auto px-20 py-3 sm:px-24">
        <p className="flex items-center gap-1 font-pixel text-[10.5px] uppercase tracking-[0.14em] text-rpg-gold">
          <Target size={12} aria-hidden /> Jornada ativa
        </p>
        <p className="rpg-title mt-0.5 text-lg font-bold leading-tight line-clamp-1">{q.title}</p>
        <p className="text-[11px] text-rpg-muted">
          {q.period === "weekly" ? `Missão da semana · ${journey.daysLeft} dia(s) restantes` : "Missão do dia"} · +{q.xpReward} XP
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <RPGProgressBar showLabel={false} tone="gold" label={q.title} value={pct} className="flex-1" />
          <span className="font-pixel text-xs text-rpg-text tabular-nums">
            {q.progress} / {q.target}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Enciclopédia (o livro aberto)                                       */
/* ------------------------------------------------------------------ */

const KIND_FILTERS: Array<{ id: "all" | EntryKind | "locked" | "new"; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "new", label: "Novas" },
  { id: "discovery", label: "Descobertas" },
  { id: "knowledge", label: "Conhecimento" },
  { id: "relic", label: "Relíquias" },
  { id: "title", label: "Títulos" },
  { id: "locked", label: "Bloqueadas" },
];

/**
 * Enciclopédia estilo "Pokédex": grade numerada com silhuetas para o que
 * falta revelar e uma página de detalhe da entrada selecionada.
 */
export function CodexEncyclopedia({ codex, onSelect, onBack }: { codex: Codex; onSelect: Select; onBack?: () => void }) {
  const reduce = useReducedMotion();
  const entries = useMemo(() => buildCodexEntries(codex), [codex]);
  const [filter, setFilter] = useState<(typeof KIND_FILTERS)[number]["id"]>("all");
  const [focus, setFocus] = useState<CodexEntry | null>(null);
  const shown = entries.filter((e) =>
    filter === "all" ? true : filter === "locked" ? e.state === "locked" : filter === "new" ? e.state === "new" : e.kind === filter,
  );
  const current = focus ?? shown.find((e) => e.state !== "locked") ?? shown[0] ?? null;
  const counts = { revealed: entries.filter((e) => e.state !== "locked").length, total: entries.length, fresh: entries.filter((e) => e.state === "new").length };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, rotateX: 8, scale: 0.98 }}
      animate={{ opacity: 1, rotateX: 0, scale: 1 }}
      transition={{ duration: 0.35 }}
      className={clsx(PANEL, "rpg-panel-gold p-3 sm:p-4")}
      aria-label="Enciclopédia do Códex"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 text-xs" aria-label="Voltar à visão geral">
            <ArrowLeft size={14} aria-hidden /> Visão geral
          </button>
        )}
        <h2 className={clsx(SECTION_TITLE, "text-lg")}>Enciclopédia do Códex</h2>
        <span className="font-pixel text-xs text-rpg-muted tabular-nums">
          {counts.revealed}/{counts.total} reveladas{counts.fresh > 0 ? ` · ${counts.fresh} novas` : ""}
        </span>
      </div>
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]" role="tablist" aria-label="Filtrar entradas">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => (setFilter(f.id), setFocus(null))}
            className={clsx(
              "shrink-0 border px-2.5 py-1 text-xs font-semibold",
              filter === f.id ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-text",
            )}
            style={{ borderRadius: 3 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-rpg-muted">Nenhuma entrada neste filtro ainda.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <ul className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5 xl:grid-cols-6 content-start">
            {shown.map((e) => (
              <li key={e.key} className="relative">
                <span className="absolute left-1 top-0.5 z-[1] font-pixel text-[9px] text-rpg-muted">{entryNo(e.no)}</span>
                <EntryTile
                  entry={e}
                  onSelect={(sel) => {
                    setFocus(e);
                    // No celular não há página lateral: abre direto o detalhe completo.
                    if (window.matchMedia("(max-width: 1023px)").matches) onSelect(sel);
                  }}
                />
              </li>
            ))}
          </ul>
          {current && (
            <AnimatePresence mode="wait">
              <motion.aside
                key={current.key}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="hidden lg:block rpg-parchment p-4 self-start"
                aria-label="Página da entrada"
              >
                <p className="font-pixel text-xs text-rpg-ink/70">
                  {entryNo(current.no)} · {KIND_LABEL[current.kind]}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <img src={current.state === "locked" ? CODEX_REF.locked : current.art} alt="" aria-hidden className="pixelated h-20 w-20 object-contain" />
                  <div className="min-w-0">
                    <p className="font-rpg text-lg font-bold leading-tight text-rpg-ink">{current.state === "locked" ? "???" : current.name}</p>
                    <p className="text-xs text-rpg-ink/70">{current.category}</p>
                    {current.rarity && <p className="text-[11px] font-semibold text-rpg-ink/80">{RARITY[current.rarity].label}</p>}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-rpg-ink">{current.state === "locked" ? current.hint ?? "Continue sua jornada para revelar esta entrada." : current.description}</p>
                {current.state === "locked" && current.progress > 0 && (
                  <div className="mt-3">
                    <div className="h-2 w-full border border-rpg-bronze bg-rpg-ink/10">
                      <div className="h-full bg-rpg-bronze" style={{ width: `${current.progress}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[11px] text-rpg-ink/70">{current.progress}% para revelar</p>
                  </div>
                )}
                {current.at && current.state !== "locked" && <p className="mt-2 text-[11px] text-rpg-ink/60">Registrada {timeAgo(current.at)}</p>}
                <button type="button" onClick={() => onSelect(current.selection)} className="rpg-btn rpg-btn-primary mt-3 inline-flex items-center gap-1 text-xs">
                  <Flag size={12} aria-hidden /> Abrir entrada completa
                </button>
              </motion.aside>
            </AnimatePresence>
          )}
        </div>
      )}
    </motion.section>
  );
}
