import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { GRADE_BUTTONS, type DailyQueue, type ReviewResult } from "@/services/grimoireService";
import { Chip, errorMessage } from "./grimoireUi";

type QueueCard = DailyQueue["cards"][number];

const GRADE_CLASS: Record<(typeof GRADE_BUTTONS)[number]["tone"], string> = {
  red: "border-drop/40 text-drop hover:bg-drop/10 rpg:border-rpg-red/70 rpg:text-rpg-red",
  orange: "border-signal/50 text-signal-deep dark:text-signal hover:bg-signal/10 rpg:border-rpg-orange/70 rpg:text-rpg-orange",
  blue: "border-cat-blue/40 text-cat-blue dark:text-cat-blue-dark hover:bg-cat-blue/10 rpg:border-rpg-blue/70 rpg:text-rpg-blue",
  green: "border-cat-green/40 text-cat-green dark:text-cat-green-dark hover:bg-cat-green/10 rpg:border-rpg-green/70 rpg:text-rpg-green",
};

/**
 * Modo estudo: a fila é congelada no início da sessão (snapshot) e avança
 * localmente. Teclado: Espaço/Enter vira o cartão; 1-4 avaliam (Errei,
 * Difícil, Bom, Fácil) depois de virado; Esc encerra.
 */
export function StudySession({
  cards,
  isRpg,
  onReview,
  onExit,
}: {
  cards: QueueCard[];
  isRpg: boolean;
  onReview: (cardId: string, quality: number) => Promise<ReviewResult>;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ errei: 0, dificil: 0, bom: 0, facil: 0 });
  const [result, setResult] = useState<{ cleared: boolean; xp: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const done = index >= cards.length;
  const card = done ? null : cards[index];

  const grade = useCallback(
    async (key: (typeof GRADE_BUTTONS)[number]["key"]) => {
      if (!card || !flipped || busy) return;
      const g = GRADE_BUTTONS.find((b) => b.key === key)!;
      setBusy(true);
      setError(null);
      try {
        const r = await onReview(card.id, g.quality);
        setTally((t) => ({ ...t, [key]: t[key] + 1 }));
        if (r.queueCleared || r.xpAwarded > 0) setResult((prev) => ({ cleared: r.queueCleared || !!prev?.cleared, xp: (prev?.xp ?? 0) + r.xpAwarded }));
        setFlipped(false);
        setIndex((i) => i + 1);
      } catch (err) {
        setError(errorMessage(err, "Não foi possível registrar a revisão. Tente de novo."));
      } finally {
        setBusy(false);
      }
    },
    [card, flipped, busy, onReview],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.closest("[role='dialog']"))) return;
      if (e.key === "Escape") return onExit();
      if (done) return;
      if (e.key === " " || e.key === "Enter") {
        // Em botões/links focados, deixa a ativação nativa do teclado agir.
        if (t?.closest("button, a")) return;
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      const n = Number(e.key);
      if (flipped && n >= 1 && n <= 4) {
        e.preventDefault();
        void grade(GRADE_BUTTONS[n - 1].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, flipped, grade, onExit]);

  // Foco no cartão a cada troca: leitores de tela leem a nova frente.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index, flipped]);

  const total = cards.length;
  const pct = total ? Math.round((Math.min(index, total) / total) * 100) : 100;

  if (done) {
    const reviewed = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <Card className="p-6 text-center rpg:rpg-panel-gold" aria-live="polite">
        <CheckCircle2 size={36} className="mx-auto text-growth rpg:text-rpg-green" aria-hidden />
        <p className="mt-3 font-display text-xl font-bold rpg:rpg-title">{isRpg ? "Feitiços revisados!" : "Sessão concluída"}</p>
        <p className="mt-1 text-sm text-slate">
          {reviewed} {reviewed === 1 ? "cartão revisado" : "cartões revisados"} · {tally.facil + tally.bom} bons/fáceis · {tally.dificil} difíceis · {tally.errei} para reforçar amanhã
        </p>
        {result?.cleared && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cat-purple dark:text-cat-purple-dark rpg:text-rpg-purple">
            <Sparkles size={15} aria-hidden />
            Fila de hoje concluída{result.xp > 0 ? ` · +${result.xp} XP` : " (XP do dia já recebido)"}
          </p>
        )}
        <div className="mt-5 flex justify-center">
          <Button onClick={onExit}>Voltar ao Grimório</Button>
        </div>
      </Card>
    );
  }

  return (
    <section aria-label="Sessão de estudo" className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate mb-1">
            <span>
              Cartão {index + 1} de {total}
            </span>
            <span className="truncate ml-2">{card!.deckName}</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border rpg:h-3 rpg:rounded-sm rpg:border-2 rpg:border-black/60 rpg:bg-rpg-bg"
            role="progressbar"
            aria-label="Progresso da sessão"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index}
          >
            <div className="h-full rounded-full bg-cat-purple rpg:rounded-none rpg:bg-rpg-purple transition-[width] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button variant="ghost" onClick={onExit} aria-label="Encerrar sessão de estudo">
          <X size={16} aria-hidden /> <span className="hidden sm:inline">Encerrar</span>
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div
          ref={cardRef}
          tabIndex={-1}
          aria-live="polite"
          className={clsx("min-h-[220px] sm:min-h-[260px] p-5 sm:p-8 flex flex-col outline-none", flipped && "rpg:bg-rpg-panel-light/40")}
        >
          <div className="flex items-center gap-2 mb-3">
            {card!.isNew ? <Chip tone="blue">Novo</Chip> : <Chip tone="purple">Revisão</Chip>}
            {card!.source === "ai" && <Chip tone="purple">Criado com IA</Chip>}
            {card!.source === "quote" && <Chip tone="pink">Citação</Chip>}
          </div>
          <p className="text-[11px] uppercase tracking-wide text-slate rpg:font-pixel">Frente</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold whitespace-pre-wrap break-words">{card!.front}</p>
          {flipped ? (
            <div className="mt-5 pt-4 border-t border-paper-border dark:border-ink-border rpg:border-rpg-border">
              <p className="text-[11px] uppercase tracking-wide text-slate rpg:font-pixel">Verso</p>
              <p className="mt-1 text-base whitespace-pre-wrap break-words">{card!.back}</p>
            </div>
          ) : (
            <div className="mt-auto pt-6 flex justify-center">
              <Button onClick={() => setFlipped(true)} className="min-w-[180px]">
                <RotateCcw size={15} aria-hidden /> Virar cartão
                <kbd className="hidden sm:inline ml-1 text-[10px] opacity-80">Espaço</kbd>
              </Button>
            </div>
          )}
        </div>
        {flipped && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-t border-paper-border dark:border-ink-border rpg:border-rpg-border">
            {GRADE_BUTTONS.map((g, i) => (
              <button
                key={g.key}
                type="button"
                disabled={busy}
                onClick={() => void grade(g.key)}
                className={clsx(
                  "min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rpg:rounded-[3px] rpg:border-2 rpg:bg-rpg-bg rpg:focus-visible:outline-rpg-gold",
                  GRADE_CLASS[g.tone],
                )}
              >
                {g.label}
                <span className="ml-1.5 hidden sm:inline text-[10px] opacity-70" aria-hidden>
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
      {error && (
        <p role="alert" className="text-sm text-drop rpg:text-rpg-red">
          {error}
        </p>
      )}
      <p className="hidden sm:block text-[11px] text-slate text-center">Atalhos: Espaço vira · 1 Errei · 2 Difícil · 3 Bom · 4 Fácil · Esc encerra</p>
    </section>
  );
}
