import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cloud, EyeOff, TrendingUp, X } from "lucide-react";
import type { JournalCollection } from "@/types";
import type { JournalWordPeriod } from "@/services/journalService";
import { useJournalWordCloud } from "@/hooks/useJournal";
import { Card } from "@/components/ui/primitives";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import { NARROW_CLOUD, WIDE_CLOUD, layoutCloud, type CloudShape } from "@/utils/wordCloudLayout";

const PERIODS: Array<{ key: JournalWordPeriod; label: string }> = [
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "365", label: "1 ano" },
  { key: "all", label: "Tudo" },
];

// Paleta do design system (rosa = diário, roxo, azul, verde, laranja), alternada por posição.
const TONES = [
  "fill-cat-pink dark:fill-cat-pink-dark",
  "fill-cat-purple dark:fill-cat-purple-dark",
  "fill-cat-blue dark:fill-cat-blue-dark",
  "fill-cat-green dark:fill-cat-green-dark",
  "fill-cat-teal dark:fill-cat-teal-dark",
];
const CLOUD_FONT = '"Bricolage Grotesque", Inter, system-ui, sans-serif';

type CloudWord = { word: string; count: number; days: number; recentDates: string[] };

/** Largura do contêiner — decide entre a nuvem larga e a estreita (celular). */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Desenho da nuvem: silhueta em SVG (bolhas sobrepostas com gradiente e
 * sombra suave) e as palavras posicionadas por layoutCloud dentro dela.
 */
function CloudCanvas({
  words,
  selected,
  onSelect,
  compact,
}: {
  words: CloudWord[];
  selected: string | null;
  onSelect: (word: string | null) => void;
  compact: boolean;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 560;
  const shape: CloudShape = narrow ? NARROW_CLOUD : WIDE_CLOUD;
  const limit = narrow ? 28 : compact ? 32 : 60;
  // A largura das palavras é medida na fonte de exibição; quando ela termina de carregar, refaz o layout.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady(true)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const placed = useMemo(() => {
    const list = words.slice(0, limit);
    if (list.length === 0) return [];
    const max = list[0].count;
    const min = list[list.length - 1].count;
    const [lo, hi] = narrow ? [20, 64] : [17, 70];
    // Escala por raiz quadrada: diferença visível sem a palavra campeã engolir o resto.
    const size = (c: number) => (max === min ? (lo + hi) / 2 : lo + ((Math.sqrt(c) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min))) * (hi - lo));
    return layoutCloud(
      shape,
      list.map((w, rank) => ({ item: { ...w, rank }, text: w.word, size: size(w.count) })),
      CLOUD_FONT
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, narrow, limit, fontsReady]);

  return (
    <div ref={ref} className="relative w-full">
      <motion.svg
        viewBox={`0 0 ${shape.width} ${shape.height}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Nuvem de palavras mais frequentes"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id={`cloud-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="[stop-color:#FFFFFF] dark:[stop-color:#2B2740]" />
            <stop offset="100%" className="[stop-color:#F6EEFB] dark:[stop-color:#1F1C2E]" />
          </linearGradient>
          <radialGradient id={`cloud-glow-${uid}`} cx="0.35" cy="0.25" r="0.8">
            <stop offset="0%" className="[stop-color:#FF3D93] [stop-opacity:0.10]" />
            <stop offset="60%" className="[stop-color:#9550FF] [stop-opacity:0.06]" />
            <stop offset="100%" className="[stop-color:#2F80FF] [stop-opacity:0]" />
          </radialGradient>
          <filter id={`cloud-shadow-${uid}`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#9550FF" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* Silhueta: bolhas + base com o mesmo preenchimento formam uma única nuvem. */}
        <g filter={`url(#cloud-shadow-${uid})`}>
          <g fill={`url(#cloud-fill-${uid})`}>
            {shape.puffs.map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
            ))}
            <rect x={shape.base.x} y={shape.base.y} width={shape.base.w} height={shape.base.h} rx={shape.base.r} />
          </g>
        </g>
        <g fill={`url(#cloud-glow-${uid})`} pointerEvents="none">
          {shape.puffs.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
          ))}
          <rect x={shape.base.x} y={shape.base.y} width={shape.base.w} height={shape.base.h} rx={shape.base.r} />
        </g>

        {placed.map(({ item, x, y, size }) => {
          const active = selected === item.word;
          const dim = selected !== null && !active;
          return (
            // Grupo externo: só a entrada escalonada. Interno: seleção/hover, sem atraso.
            <motion.g
              key={item.word}
              initial={reduce ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 18, delay: reduce ? 0 : Math.min(item.rank * 0.02, 0.8) }}
              style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
            >
              <motion.g
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={`${item.word}: ${item.count} vezes em ${item.days} ${item.days === 1 ? "dia" : "dias"}`}
                onClick={() => onSelect(active ? null : item.word)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(active ? null : item.word);
                  }
                }}
                className="cursor-pointer outline-none focus-visible:[&>text]:underline"
                animate={{ opacity: dim ? 0.28 : 1, scale: active ? 1.12 : 1 }}
                whileHover={reduce ? undefined : { scale: active ? 1.12 : 1.08 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
              >
                <title>{`${item.count}× em ${item.days} ${item.days === 1 ? "dia" : "dias"}`}</title>
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={size}
                  fontWeight={700}
                  fontFamily={CLOUD_FONT}
                  className={TONES[item.rank % TONES.length]}
                >
                  {item.word}
                </text>
              </motion.g>
            </motion.g>
          );
        })}
      </motion.svg>
    </div>
  );
}

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
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
  const [period, setPeriod] = useState<JournalWordPeriod>("90");
  const [scope, setScope] = useState<string | null>(null);
  const journalId = fixedJournalId !== undefined ? fixedJournalId : scope;
  const { cloud, isLoading, isError, excludeWord, restoreWord } = useJournalWordCloud(period, journalId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const words = useMemo(() => cloud?.words ?? [], [cloud]);
  const selectedWord = words.find((w) => w.word === selected) ?? null;
  const collectionName = journalId ? collections.find((c) => c.id === journalId)?.name : null;

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

          <CloudCanvas words={words} selected={selected} onSelect={setSelected} compact={compact} />

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
