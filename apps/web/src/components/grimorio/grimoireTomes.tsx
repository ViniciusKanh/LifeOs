import type { ReactNode } from "react";
import clsx from "clsx";
import { Archive, ArchiveRestore, BookOpen, CalendarClock, ChevronRight, Layers, Pencil, Target, Trash2 } from "lucide-react";
import type { GrimoireDeck } from "@/services/grimoireService";

/**
 * Tomos do Grimório (v3): baralhos como livros colecionáveis. Domínio e
 * "raridade" são derivados do estado SM-2 real — a raridade é só uma
 * classificação de jogo (tamanho + domínio), não uma avaliação de dificuldade.
 */

const HUB = "/assets/rpg/hub";

/** Grau de domínio = cartões maduros / total. */
export function masteryOf(deck: Pick<GrimoireDeck, "counts">): { pct: number; rank: string; tone: "slate" | "blue" | "purple" | "gold" } {
  const pct = deck.counts.total > 0 ? Math.round((deck.counts.mature / deck.counts.total) * 100) : 0;
  if (deck.counts.total === 0) return { pct, rank: "Em branco", tone: "slate" };
  if (pct >= 80) return { pct, rank: "Mestre", tone: "gold" };
  if (pct >= 50) return { pct, rank: "Adepto", tone: "purple" };
  if (pct >= 20) return { pct, rank: "Iniciado", tone: "blue" };
  return { pct, rank: "Aprendiz", tone: "slate" };
}

export type TomeRarity = "comum" | "raro" | "epico" | "lendario";
export const RARITY_UI: Record<TomeRarity, { label: string; cls: string }> = {
  comum: { label: "Comum", cls: "border-rpg-border text-rpg-muted" },
  raro: { label: "Raro", cls: "border-rpg-blue/70 text-rpg-blue bg-rpg-blue/10" },
  epico: { label: "Épico", cls: "border-rpg-purple/70 text-rpg-purple bg-rpg-purple/15" },
  lendario: { label: "Lendário", cls: "border-rpg-gold text-rpg-gold-light bg-rpg-gold/15" },
};

/** Raridade de jogo: cresce com o tamanho do tomo e o domínio alcançado. */
export function rarityOf(deck: Pick<GrimoireDeck, "counts">): TomeRarity {
  const { pct } = masteryOf(deck);
  const n = deck.counts.total;
  if (n >= 100 && pct >= 80) return "lendario";
  if (n >= 50 && pct >= 50) return "epico";
  if (n >= 25 || pct >= 20) return "raro";
  return "comum";
}

const ART: Array<{ re: RegExp; art: string }> = [
  { re: /python|program|código|codigo|dev|software|javascript|typescript|sql/i, art: `${HUB}/tome-snake.webp` },
  { re: /ingl|english|idioma|língua|lingua|language|espanhol|franc/i, art: `${HUB}/tome-flag.webp` },
  { re: /dados|data|estat|bi\b|power ?bi|analytics|matem/i, art: `${HUB}/tome-chart.webp` },
  { re: /\bia\b|intelig|neural|machine|deep|llm|aprendizado de máquina/i, art: `${HUB}/tome-brain.webp` },
  { re: /revis|rápid|rapid|geral|resumo/i, art: `${HUB}/tome-lightning.webp` },
  { re: /mestrado|pesquisa|acad|tcc|dissert|artigo|livro/i, art: `${HUB}/tome-quill.webp` },
];
const FALLBACK = [`${HUB}/tome-quill.webp`, `${HUB}/tome-brain.webp`, `${HUB}/tome-chart.webp`, `${HUB}/tome-lightning.webp`];

/** Ilustração do tomo pelo nome/disciplina (estável: mesmo baralho → mesma arte). */
export function tomeArt(deck: Pick<GrimoireDeck, "id" | "name" | "subjectName" | "bookTitle">): string {
  const text = `${deck.name} ${deck.subjectName ?? ""} ${deck.bookTitle ?? ""}`;
  const hit = ART.find((a) => a.re.test(text));
  if (hit) return hit.art;
  let h = 0;
  for (const ch of deck.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

const BAR_TONE: Record<string, string> = {
  slate: "bg-rpg-muted",
  blue: "bg-rpg-blue",
  purple: "bg-rpg-purple",
  gold: "bg-rpg-gold",
  green: "bg-rpg-green",
};

export function GrimoireBar({ value, tone = "green", label, className }: { value: number; tone?: keyof typeof BAR_TONE; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-2.5 w-full overflow-hidden border border-rpg-border bg-rpg-bg", className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx("h-full transition-[width] duration-700 motion-reduce:transition-none shadow-[0_0_8px_rgb(var(--rpg-green)/0.5)]", BAR_TONE[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

function relDay(day: string | null, today: string): string {
  if (!day) return "Sem revisões";
  const d = Math.round((Date.parse(`${day.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (d <= 0) return "Hoje";
  if (d === 1) return "Amanhã";
  return `Em ${d} dias`;
}

/** Um baralho como tomo colecionável. */
export function GrimoireDeckTome({
  deck,
  dueToday,
  today,
  selected,
  onOpen,
  onStudy,
  onEdit,
  onArchive,
  onDelete,
}: {
  deck: GrimoireDeck;
  dueToday: number;
  today: string;
  selected: boolean;
  onOpen: () => void;
  onStudy: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const m = masteryOf(deck);
  const rarity = rarityOf(deck);
  const r = RARITY_UI[rarity];
  return (
    <article
      className={clsx(
        "group relative flex h-full flex-col border-2 bg-rpg-panel p-3 transition-shadow",
        selected ? "border-rpg-gold shadow-[0_0_20px_-6px_rgb(var(--rpg-gold)/0.8)]" : rarity === "lendario" ? "border-rpg-gold/70" : rarity === "epico" ? "border-rpg-purple/60" : "border-rpg-border",
        deck.archivedAt && "opacity-70",
      )}
      style={{ borderRadius: 4 }}
    >
      <div className="flex gap-3">
        <button type="button" onClick={onOpen} className="relative h-16 w-16 shrink-0 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 3 }} aria-label={`Abrir tomo ${deck.name}`}>
          <img src={tomeArt(deck)} alt="" aria-hidden loading="lazy" className="pixelated h-full w-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="min-w-0 flex-1 truncate font-rpg font-bold text-rpg-gold-light">{deck.name}</p>
            <span className={clsx("shrink-0 border px-1 font-pixel text-[9px] uppercase", r.cls)} style={{ borderRadius: 2 }} title="Raridade de jogo: tamanho do tomo + domínio">
              {r.label}
            </span>
          </div>
          <p className="truncate text-[11px] text-rpg-muted">
            {deck.subjectName ?? deck.bookTitle ?? "Geral"} · {m.rank}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <GrimoireBar value={m.pct} label={`Domínio de ${deck.name}`} className="flex-1" />
            <span className="font-pixel text-xs text-rpg-text tabular-nums">{m.pct}%</span>
          </div>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-3 gap-1 text-center text-[10.5px]">
        <div className={clsx("border px-1 py-1", dueToday > 0 ? "border-rpg-orange/60 text-rpg-orange" : "border-rpg-border/70 text-rpg-muted")} style={{ borderRadius: 3 }}>
          <dt className="sr-only">Para revisar hoje</dt>
          <dd className="font-pixel tabular-nums">
            <CalendarClock size={10} className="mr-0.5 inline" aria-hidden />
            {dueToday} hoje
          </dd>
        </div>
        <div className="border border-rpg-border/70 px-1 py-1 text-rpg-muted" style={{ borderRadius: 3 }}>
          <dt className="sr-only">Cartões</dt>
          <dd className="font-pixel tabular-nums">
            <Layers size={10} className="mr-0.5 inline" aria-hidden />
            {deck.counts.total}
          </dd>
        </div>
        <div className="border border-rpg-border/70 px-1 py-1 text-rpg-muted" style={{ borderRadius: 3 }} title="Próxima revisão">
          <dt className="sr-only">Próxima revisão</dt>
          <dd className="truncate">{dueToday > 0 ? "Hoje" : relDay(deck.nextReview, today)}</dd>
        </div>
      </dl>

      {deck.goalTitle && (
        <p className="mt-1.5 truncate text-[10.5px] text-rpg-green" title={`Alimenta a meta ${deck.goalTitle}`}>
          <Target size={10} className="mr-0.5 inline" aria-hidden /> {deck.goalTitle}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-2.5">
        <button type="button" onClick={onOpen} className="rpg-btn rpg-btn-secondary inline-flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs">
          <BookOpen size={13} aria-hidden /> Abrir tomo <ChevronRight size={12} aria-hidden />
        </button>
        {dueToday > 0 && !deck.archivedAt && (
          <button type="button" onClick={onStudy} className="rpg-btn rpg-btn-gold px-2 py-1.5 text-xs" aria-label={`Estudar ${deck.name} (${dueToday})`}>
            Estudar
          </button>
        )}
        <IconBtn label={`Editar ${deck.name}`} onClick={onEdit}>
          <Pencil size={14} />
        </IconBtn>
        <IconBtn label={deck.archivedAt ? `Restaurar ${deck.name}` : `Arquivar ${deck.name}`} onClick={onArchive}>
          {deck.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </IconBtn>
        <IconBtn label={`Excluir ${deck.name}`} onClick={onDelete} danger>
          <Trash2 size={14} />
        </IconBtn>
      </div>
    </article>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx("flex h-9 w-9 shrink-0 items-center justify-center text-rpg-muted hover:text-rpg-gold-light", danger && "hover:text-rpg-red")}
      style={{ borderRadius: 3 }}
    >
      {children}
    </button>
  );
}
