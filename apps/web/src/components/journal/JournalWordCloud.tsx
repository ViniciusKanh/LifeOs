import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cloud, EyeOff, TrendingUp, X } from "lucide-react";
import type { JournalCollection } from "@/types";
import type { JournalWordPeriod } from "@/services/journalService";
import { useJournalWordCloud } from "@/hooks/useJournal";
import { Card } from "@/components/ui/primitives";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";

const PERIODS: Array<{ key: JournalWordPeriod; label: string }> = [
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "365", label: "1 ano" },
  { key: "all", label: "Tudo" },
];

// Paleta do design system (rosa = diário, roxo, azul, verde, laranja), alternada por posição.
const TONES = ["text-cat-pink", "text-cat-purple", "text-cat-blue", "text-cat-green", "text-signal"];

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Coloca as palavras mais usadas no centro e alterna as demais para os
 * lados — dá o formato de "nuvem" sem precisar de biblioteca de layout.
 */
function centerOut<T>(items: T[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => (i % 2 === 0 ? out.push(item) : out.unshift(item)));
  return out;
}

/**
 * Nuvem de palavras do Diário — contagem automática do que o usuário
 * escreveu (sem IA), com palavras vazias removidas no backend. Tocar numa
 * palavra mostra em quantos dias ela aparece e permite abrir esses dias
 * ou escondê-la da nuvem.
 */
export function JournalWordCloud({
  collections,
  onOpenDay,
  fixedJournalId,
  compact = false,
}: {
  collections: JournalCollection[];
  onOpenDay: (date: string) => void;
  /** Quando definido, a nuvem fica presa a este diário (sem seletor de escopo). */
  fixedJournalId?: string | null;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<JournalWordPeriod>("90");
  const [scope, setScope] = useState<string | null>(null);
  const journalId = fixedJournalId !== undefined ? fixedJournalId : scope;
  const { cloud, isLoading, isError, excludeWord, restoreWord } = useJournalWordCloud(period, journalId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const words = useMemo(() => (cloud ? cloud.words.slice(0, compact ? 28 : 60) : []), [cloud, compact]);
  const max = words[0]?.count ?? 1;
  const min = words[words.length - 1]?.count ?? 1;
  const arranged = useMemo(() => centerOut(words.map((w, i) => ({ ...w, rank: i }))), [words]);
  const selectedWord = words.find((w) => w.word === selected) ?? null;
  const collectionName = journalId ? collections.find((c) => c.id === journalId)?.name : null;

  // Escala por raiz quadrada: diferença visível sem a palavra campeã engolir o resto.
  const size = (count: number) => {
    const t = max === min ? 0.5 : (Math.sqrt(count) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min));
    const [lo, hi] = compact ? [12, 30] : [13, 44];
    return Math.round(lo + t * (hi - lo));
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Cloud size={16} className="text-cat-pink shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              Nuvem de palavras{collectionName ? ` · ${collectionName}` : ""}
            </p>
            <p className="text-[11px] text-slate">Do que você mais escreveu — palavras como "a", "de", "com" ficam de fora</p>
          </div>
        </div>
        <div role="tablist" aria-label="Período" className="flex items-center gap-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => {
                setPeriod(p.key);
                setSelected(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                period === p.key ? "bg-white dark:bg-ink-raised text-cat-pink shadow-sm" : "text-slate hover:text-inherit"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {fixedJournalId === undefined && collections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[{ id: null as string | null, name: "Todas as entradas", icon: "📖" }, ...collections.map((c) => ({ id: c.id as string | null, name: c.name, icon: c.icon ?? "📔" }))].map((c) => (
            <button
              key={c.id ?? "all"}
              onClick={() => {
                setScope(c.id);
                setSelected(null);
              }}
              aria-pressed={scope === c.id}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                scope === c.id ? "bg-cat-pink/15 text-cat-pink" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
              }`}
            >
              <span aria-hidden>{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-wrap justify-center items-center gap-3 py-8" aria-hidden>
          {[60, 90, 40, 120, 70, 50, 100, 45].map((w, i) => (
            <span key={i} className="h-5 rounded-full bg-black/[0.05] dark:bg-white/[0.07] animate-pulse" style={{ width: w }} />
          ))}
        </div>
      ) : isError ? (
        <p className="text-xs text-drop py-6 text-center">Não foi possível montar a nuvem agora.</p>
      ) : !cloud || words.length === 0 ? (
        <p className="text-xs text-slate py-8 text-center">
          {cloud && cloud.entries > 0
            ? "Ainda há pouco texto neste período para formar a nuvem. Escreva mais alguns dias ou aumente o período."
            : "Nenhuma entrada escrita neste período ainda."}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <ProvenanceBadge kind="dado" />
            <span className="text-[11px] text-slate">
              {cloud.entries} {cloud.entries === 1 ? "entrada" : "entradas"} · {cloud.distinctWords.toLocaleString("pt-BR")} palavras diferentes
            </span>
          </div>

          <div
            className={`flex flex-wrap justify-center items-center content-center gap-x-3 gap-y-1.5 px-1 ${compact ? "py-3 min-h-[120px]" : "py-6 min-h-[200px]"}`}
            aria-label="Palavras mais frequentes"
          >
            {arranged.map((w) => {
              const active = selected === w.word;
              return (
                <motion.button
                  key={`${period}-${journalId ?? "all"}-${w.word}`}
                  type="button"
                  initial={reduce ? false : { opacity: 0, scale: 0.6, y: 6 }}
                  animate={{ opacity: selected && !active ? 0.35 : 1, scale: 1, y: 0 }}
                  whileHover={reduce ? undefined : { scale: 1.08 }}
                  whileTap={reduce ? undefined : { scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20, delay: reduce ? 0 : Math.min(w.rank * 0.015, 0.6) }}
                  onClick={() => setSelected(active ? null : w.word)}
                  aria-pressed={active}
                  title={`${w.count}× em ${w.days} ${w.days === 1 ? "dia" : "dias"}`}
                  className={`font-display font-semibold leading-tight rounded-lg px-1 ${TONES[w.rank % TONES.length]} ${
                    active ? "bg-cat-pink/10 ring-1 ring-cat-pink/40" : ""
                  }`}
                  style={{ fontSize: size(w.count) }}
                >
                  {w.word}
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {selectedWord && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink p-3 mt-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">
                      <strong className="text-cat-pink">“{selectedWord.word}”</strong> aparece {selectedWord.count}× em {selectedWord.days}{" "}
                      {selectedWord.days === 1 ? "dia" : "dias"}
                    </p>
                    <button onClick={() => setSelected(null)} className="text-slate shrink-0" aria-label="Fechar detalhes da palavra">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedWord.recentDates.map((d) => (
                      <button
                        key={d}
                        onClick={() => onOpenDay(d)}
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium border border-paper-border dark:border-ink-border hover:border-cat-pink hover:text-cat-pink transition-colors capitalize"
                      >
                        {fmtDate(d)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      excludeWord(selectedWord.word).catch(() => undefined);
                      setSelected(null);
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate hover:text-signal"
                  >
                    <EyeOff size={12} /> Esconder esta palavra da nuvem
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!compact && cloud.rising.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <TrendingUp size={14} className="text-cat-green" /> Em alta nos últimos 30 dias
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cloud.rising.map((r) => (
                  <span key={r.word} className="rounded-full px-2.5 py-1 text-[11px] bg-cat-green/10 text-cat-green" title={`${r.previousPct}% → ${r.recentPct}% das palavras`}>
                    {r.word} <span className="opacity-70">{r.previousPct === 0 ? "nova" : `×${(r.recentPct / r.previousPct).toFixed(1)}`}</span>
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate mt-1.5">Comparação com os 90 dias anteriores — só aparece com entradas suficientes nos dois períodos.</p>
            </div>
          )}
        </>
      )}

      {cloud && cloud.excluded.length > 0 && !compact && (
        <div className="mt-4 pt-3 border-t border-paper-border dark:border-ink-border">
          <button onClick={() => setShowExcluded((v) => !v)} className="text-[11px] text-slate hover:text-inherit">
            {showExcluded ? "Ocultar" : "Ver"} palavras escondidas ({cloud.excluded.length})
          </button>
          {showExcluded && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {cloud.excluded.map((w) => (
                <button
                  key={w}
                  onClick={() => restoreWord(w).catch(() => undefined)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border border-dashed border-paper-border dark:border-ink-border hover:border-cat-pink"
                  title="Mostrar de novo"
                >
                  {w} <X size={11} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
