import clsx from "clsx";
import { Archive, ArchiveRestore, BookOpenText, Flame, GraduationCap, Library, Pencil, Play, Sparkles, Target, Trash2 } from "lucide-react";
import type { GrimoireDeck, GrimoireStats } from "@/services/grimoireService";
import { Chip } from "./grimoireUi";

/**
 * Peças visuais do Grimório (v2): o "Altar do ritual" (fila do dia +
 * sequência + retenção + domínio) e os baralhos como "tomos" com barra de
 * domínio. Tudo derivado dos dados reais do SM-2 — nenhum número inventado.
 * Funciona nos dois temas (clássico + variantes `rpg:`).
 */

/** Grau de domínio de um baralho = cartões maduros / total. Só um rótulo do percentual real. */
export function masteryOf(deck: Pick<GrimoireDeck, "counts">): { pct: number; rank: string; tone: "slate" | "blue" | "purple" | "gold" } {
  const pct = deck.counts.total > 0 ? Math.round((deck.counts.mature / deck.counts.total) * 100) : 0;
  if (deck.counts.total === 0) return { pct, rank: "Em branco", tone: "slate" };
  if (pct >= 80) return { pct, rank: "Mestre", tone: "gold" };
  if (pct >= 50) return { pct, rank: "Adepto", tone: "purple" };
  if (pct >= 20) return { pct, rank: "Iniciado", tone: "blue" };
  return { pct, rank: "Aprendiz", tone: "slate" };
}

const BAR_TONE: Record<string, string> = {
  slate: "bg-slate/60 rpg:bg-rpg-muted",
  blue: "bg-cat-blue rpg:bg-rpg-blue",
  purple: "bg-cat-purple rpg:bg-rpg-purple",
  gold: "bg-signal rpg:bg-rpg-gold",
  green: "bg-cat-green rpg:bg-rpg-green",
};

export function GrimoireBar({ value, tone = "purple", label, className }: { value: number; tone?: keyof typeof BAR_TONE; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={clsx("h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08] rpg:rounded-none rpg:bg-rpg-bg rpg:border rpg:border-rpg-border", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={clsx("h-full transition-[width] duration-700 motion-reduce:transition-none", BAR_TONE[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface QueueSummary {
  dueCount: number;
  newCount: number;
  reviewedToday: number;
  clearedToday: boolean;
}

/** Altar do ritual: o que estudar hoje + o estado do grimório como um todo. */
export function GrimoireRitualHero({
  queue,
  stats,
  pending,
  decksCount,
  isRpg,
  onStudy,
}: {
  queue: QueueSummary;
  stats: GrimoireStats | null;
  pending: number;
  decksCount: number;
  isRpg: boolean;
  onStudy: () => void;
}) {
  const doneToday = queue.reviewedToday;
  const totalToday = doneToday + pending;
  const todayPct = totalToday > 0 ? (doneToday / totalToday) * 100 : queue.clearedToday ? 100 : 0;
  const masteryPct = stats && stats.totals.cards > 0 ? Math.round((stats.totals.mature / stats.totals.cards) * 100) : null;

  const title =
    pending > 0
      ? `${pending} ${pending === 1 ? "cartão" : "cartões"} para revisar`
      : queue.clearedToday
        ? "Ritual de hoje concluído"
        : decksCount === 0
          ? "Crie seu primeiro tomo"
          : "Nada para revisar agora";

  return (
    <section
      aria-label={isRpg ? "Ritual de hoje" : "Estudo de hoje"}
      className={clsx(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5 bg-paper-raised dark:bg-ink-raised border-paper-border dark:border-ink-border",
        "rpg:rounded-[4px] rpg:border-2 rpg:bg-rpg-panel",
        pending > 0 ? "rpg:border-rpg-gold/80 rpg:shadow-[0_0_24px_-8px_rgb(var(--rpg-gold)/0.6)]" : "rpg:border-rpg-border",
      )}
    >
      {/* Brilho arcano discreto no canto — só decoração. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cat-purple/10 blur-3xl rpg:bg-rpg-purple/25" aria-hidden />
      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-gold">{isRpg ? "✦ Ritual de hoje" : "Estudo de hoje"}</p>
          <p className="mt-1 font-display text-xl sm:text-2xl font-bold rpg:rpg-title">{title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone="orange">{queue.dueCount} vencidos</Chip>
            <Chip tone="blue">{queue.newCount} novos</Chip>
            <Chip>{doneToday} revisões hoje</Chip>
            {queue.clearedToday && (
              <Chip tone="green">
                <Sparkles size={10} aria-hidden /> XP do dia recebido
              </Chip>
            )}
          </div>
          {totalToday > 0 && (
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-[11px] text-slate rpg:text-rpg-muted">
                <span>Progresso do ritual</span>
                <span className="tabular-nums font-semibold">
                  {doneToday}/{totalToday}
                </span>
              </div>
              <GrimoireBar value={todayPct} tone={queue.clearedToday ? "green" : "purple"} label="Progresso das revisões de hoje" />
            </div>
          )}
          {!queue.clearedToday && pending > 0 && <p className="mt-2 text-[11px] text-slate rpg:text-rpg-muted">Concluir a fila do dia rende XP (uma vez por dia).</p>}
          <button
            type="button"
            onClick={onStudy}
            disabled={pending === 0}
            className={clsx(
              "mt-4 inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 px-5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed",
              isRpg ? "rpg-btn rpg-btn-gold" : "rounded-xl text-white bg-gradient-to-r from-brand-500 to-brand-700 shadow-glow-brand",
            )}
          >
            <Play size={15} aria-hidden /> {isRpg ? "Começar ritual" : "Estudar agora"}
          </button>
        </div>

        {stats && (
          <dl className="grid grid-cols-3 gap-2">
            <HeroStat icon={<Flame size={16} />} tone="text-signal rpg:text-rpg-orange" label="Sequência" value={`${stats.streak}`} caption={stats.streak === 1 ? "dia" : "dias"} />
            <HeroStat
              icon={<Target size={16} />}
              tone="text-cat-purple rpg:text-rpg-purple"
              label="Retenção"
              value={stats.retention30d == null ? "—" : `${stats.retention30d}%`}
              caption={stats.retention30d == null ? `${stats.retentionSample}/10 revisões` : "30 dias"}
            />
            <HeroStat
              icon={<BookOpenText size={16} />}
              tone="text-cat-green rpg:text-rpg-gold-light"
              label="Domínio"
              value={masteryPct == null ? "—" : `${masteryPct}%`}
              caption={`${stats.totals.mature}/${stats.totals.cards} maduros`}
            />
          </dl>
        )}
      </div>
    </section>
  );
}

function HeroStat({ icon, tone, label, value, caption }: { icon: React.ReactNode; tone: string; label: string; value: string; caption: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink p-2.5 text-center rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg-2">
      <span className={clsx("mx-auto flex h-7 w-7 items-center justify-center", tone)} aria-hidden>
        {icon}
      </span>
      <dt className="text-[10px] uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-muted truncate">{label}</dt>
      <dd className="font-display text-lg font-bold tabular-nums leading-tight rpg:rpg-title">{value}</dd>
      <dd className="text-[10px] text-slate rpg:text-rpg-muted truncate">{caption}</dd>
    </div>
  );
}

/** Um baralho como "tomo": lombada colorida, domínio, fila do dia e ações. */
export function GrimoireDeckTome({
  deck,
  dueToday,
  selected,
  onSelect,
  onStudy,
  onEdit,
  onArchive,
  onDelete,
}: {
  deck: GrimoireDeck;
  dueToday: number;
  selected: boolean;
  onSelect: () => void;
  onStudy: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const m = masteryOf(deck);
  const spine = deck.subjectId ? "bg-cat-blue rpg:bg-rpg-blue" : deck.bookId ? "bg-cat-pink rpg:bg-rpg-pink" : "bg-cat-purple rpg:bg-rpg-purple";
  return (
    <article
      className={clsx(
        "group relative h-full flex overflow-hidden rounded-2xl border bg-paper-raised dark:bg-ink-raised border-paper-border dark:border-ink-border transition-shadow",
        "rpg:rounded-[4px] rpg:border-2 rpg:bg-rpg-panel rpg:border-rpg-border",
        selected && "ring-2 ring-brand-500/60 rpg:ring-0 rpg:border-rpg-gold",
        dueToday > 0 && !deck.archivedAt && "rpg:shadow-[0_0_18px_-8px_rgb(var(--rpg-gold)/0.7)]",
        deck.archivedAt && "opacity-70",
      )}
    >
      {/* Lombada do tomo: azul = disciplina, rosa = livro, roxo = livre. */}
      <span className={clsx("w-2 shrink-0", spine)} aria-hidden />
      <div className="min-w-0 flex-1 p-4 flex flex-col">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            onClick={onSelect}
            aria-expanded={selected}
          >
            <p className="font-semibold truncate rpg:font-display rpg:text-rpg-gold-light">{deck.name}</p>
            {deck.description && <p className="text-xs text-slate line-clamp-2 mt-0.5 rpg:text-rpg-muted">{deck.description}</p>}
          </button>
          {dueToday > 0 && !deck.archivedAt && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-signal text-white text-xs font-bold tabular-nums rpg:rounded-[3px] rpg:bg-rpg-orange rpg:font-pixel" title={`${dueToday} para revisar hoje`}>
              {dueToday}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone={m.tone}>{m.rank}</Chip>
          {deck.subjectName && (
            <Chip tone="blue">
              <GraduationCap size={10} aria-hidden /> {deck.subjectName}
            </Chip>
          )}
          {deck.bookTitle && (
            <Chip tone="pink">
              <Library size={10} aria-hidden /> {deck.bookTitle}
            </Chip>
          )}
          {deck.archivedAt && <Chip>Arquivado</Chip>}
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate rpg:text-rpg-muted">
            <span>Domínio</span>
            <span className="tabular-nums font-semibold">{m.pct}%</span>
          </div>
          <GrimoireBar value={m.pct} tone={m.tone === "slate" ? "blue" : m.tone} label={`Domínio do baralho ${deck.name}`} />
          <p className="mt-1.5 text-[11px] text-slate rpg:text-rpg-muted">
            {deck.counts.total} cartões · {deck.counts.new} novos · {deck.newPerDay} novos/dia
          </p>
        </div>

        <div className="mt-auto pt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onStudy}
            disabled={dueToday === 0 || !!deck.archivedAt}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 disabled:opacity-50 rpg:rpg-btn rpg:rpg-btn-primary rpg:bg-none"
          >
            <Play size={14} aria-hidden /> Estudar{dueToday > 0 ? ` (${dueToday})` : ""}
          </button>
          <div className="ml-auto flex gap-0.5">
            <IconBtn label={`Editar baralho ${deck.name}`} onClick={onEdit}>
              <Pencil size={15} />
            </IconBtn>
            <IconBtn label={deck.archivedAt ? `Restaurar baralho ${deck.name}` : `Arquivar baralho ${deck.name}`} onClick={onArchive}>
              {deck.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            </IconBtn>
            <IconBtn label={`Excluir baralho ${deck.name}`} onClick={onDelete} danger>
              <Trash2 size={15} />
            </IconBtn>
          </div>
        </div>
      </div>
    </article>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "w-10 h-10 flex items-center justify-center rounded-lg text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rpg:rounded-[3px] rpg:text-rpg-muted rpg:hover:text-rpg-gold-light",
        danger && "hover:text-drop rpg:hover:text-rpg-red",
      )}
    >
      {children}
    </button>
  );
}
