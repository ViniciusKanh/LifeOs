import { useMemo, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import clsx from "clsx";
import { Bot, CalendarRange, Columns3, LayoutGrid, PenLine, Search } from "lucide-react";
import { RingProgress } from "@/components/charts/motion/RingProgress";
import { CATEGORY_LABEL, STATUS_LABEL_PT, experimentEmoji } from "./experimentDisplay";
import type { ExperimentListItem, ExperimentStatus } from "@/types";

/**
 * Laboratório — todos os experimentos de uma vez, em três visões:
 *  - Cartões: emoji, anel de progresso, últimos 7 dias e resultado parcial;
 *  - Linha do tempo: barras no calendário (vê sobreposição de experimentos);
 *  - Quadro: colunas por status.
 * Só apresentação: progresso, check-ins recentes e resultado vêm da listagem.
 */

type View = "cards" | "timeline" | "board";
type Filter = "all" | ExperimentStatus;

const STATUS_COLOR: Record<ExperimentStatus, { ring: string; pill: string }> = {
  draft: { ring: "#94A3B8", pill: "bg-slate/12 text-slate" },
  active: { ring: "#7C4DFF", pill: "bg-cat-purple/12 text-cat-purple" },
  paused: { ring: "#FF7A45", pill: "bg-signal/15 text-signal-deep" },
  completed: { ring: "#12B76A", pill: "bg-cat-green/12 text-cat-green" },
  cancelled: { ring: "#FF4757", pill: "bg-drop/10 text-drop" },
};

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Em andamento" },
  { key: "draft", label: "Rascunhos" },
  { key: "paused", label: "Pausados" },
  { key: "completed", label: "Concluídos" },
];

const BOARD_COLUMNS: ExperimentStatus[] = ["draft", "active", "paused", "completed"];

function RecentDots({ recent }: { recent: ExperimentListItem["recent"] }) {
  if (!recent || recent.length === 0) return <span className="text-[10px] text-slate">sem check-ins ainda</span>;
  return (
    <span className="flex gap-1" aria-label="Últimos dias">
      {recent.map((d, i) => (
        <motion.span
          key={d.date}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 + i * 0.04, type: "spring", stiffness: 500, damping: 20 }}
          title={`${d.date.split("-").reverse().join("/")}: ${d.status === "done" ? "cumprido" : d.status === "missed" ? "não cumprido" : "sem registro"}`}
          className={clsx("w-2.5 h-2.5 rounded-full", d.status === "done" ? "bg-cat-green" : d.status === "missed" ? "bg-drop/70" : "border border-slate/40")}
        />
      ))}
    </span>
  );
}

/** Cartão com leve inclinação 3D seguindo o mouse (desliga com "reduzir movimento"). */
function ExperimentTile({ e, index }: { e: ExperimentListItem; index: number }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 220, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 220, damping: 18 });
  const onMove = (ev: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = ev.currentTarget.getBoundingClientRect();
    mx.set((ev.clientX - r.left) / r.width - 0.5);
    my.set((ev.clientY - r.top) / r.height - 0.5);
  };
  const color = STATUS_COLOR[e.status];

  return (
    <motion.div
      layout
      layoutId={`exp-tile-${e.id}`}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: index * 0.04 }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      className="group"
    >
      <Link
        to={`/experimentos/${e.id}`}
        className="block h-full rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-4 shadow-card dark:shadow-card-dark hover:border-cat-purple/40 hover:shadow-lg transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <div className="flex items-start gap-3">
          <motion.span
            className="text-4xl leading-none select-none"
            whileHover={{ scale: 1.2, rotate: [0, -12, 12, 0] }}
            animate={e.status === "active" && !reduce ? { y: [0, -3, 0] } : undefined}
            transition={{ duration: 2.6, repeat: e.status === "active" ? Infinity : 0, ease: "easeInOut" }}
            aria-hidden
          >
            {experimentEmoji(e)}
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold leading-tight line-clamp-2 group-hover:text-cat-purple transition-colors">{e.title}</p>
            <p className="text-[11px] text-slate mt-0.5">{CATEGORY_LABEL[e.category]}</p>
          </div>
          <RingProgress pct={e.progressPct} size={46} stroke={5} color={color.ring}>
            <span className="text-[10px] font-bold">{e.progressPct}%</span>
          </RingProgress>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold", color.pill)}>{STATUS_LABEL_PT[e.status]}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate">
            {e.verification_type === "automatic" ? <Bot size={11} /> : <PenLine size={11} />}
            {e.verification_type === "automatic" ? "automático" : "manual"}
          </span>
          {e.status !== "draft" && <span className="text-[10px] text-slate">· dia {e.daysElapsed}/{e.durationDays}</span>}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <RecentDots recent={e.recent} />
          {e.recentConsistencyPct != null && <span className="text-[10px] font-semibold text-slate">{e.recentConsistencyPct}% em 7d</span>}
        </div>

        {e.resultLabel && (
          <p className={clsx("mt-2 text-xs font-semibold", e.resultLabel.startsWith("-") ? "text-drop" : "text-cat-green")}>{e.resultLabel}</p>
        )}
      </Link>
    </motion.div>
  );
}

function TimelineView({ items }: { items: ExperimentListItem[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const range = useMemo(() => {
    const starts = items.map((e) => Date.parse(`${e.start_date}T12:00:00Z`));
    const ends = items.map((e) => Date.parse(`${e.end_date}T12:00:00Z`));
    const min = Math.min(...starts, Date.parse(`${today}T12:00:00Z`));
    const max = Math.max(...ends, Date.parse(`${today}T12:00:00Z`));
    return { min, max: max === min ? min + 86_400_000 : max };
  }, [items, today]);
  const pos = (iso: string) => ((Date.parse(`${iso}T12:00:00Z`) - range.min) / (range.max - range.min)) * 100;
  const months = useMemo(() => {
    const out: Array<{ label: string; left: number }> = [];
    const d = new Date(range.min);
    d.setUTCDate(1);
    while (d.getTime() <= range.max) {
      const left = ((d.getTime() - range.min) / (range.max - range.min)) * 100;
      if (left >= 0) out.push({ label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }), left });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }, [range]);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="min-w-[640px] relative">
        <div className="relative h-6 mb-2 text-[10px] text-slate">
          {months.map((m) => (
            <span key={m.label} className="absolute -translate-x-1/2" style={{ left: `${Math.min(97, Math.max(3, m.left))}%` }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="relative space-y-2">
          <span className="absolute top-0 bottom-0 w-px bg-cat-purple/60 z-10" style={{ left: `${pos(today)}%` }} aria-hidden>
            <span className="absolute -top-1 -translate-x-1/2 rounded-full bg-cat-purple px-1.5 text-[9px] font-bold text-white">hoje</span>
          </span>
          {items.map((e, i) => {
            const left = pos(e.start_date);
            const width = Math.max(2, pos(e.end_date) - left);
            const color = STATUS_COLOR[e.status].ring;
            return (
              <Link key={e.id} to={`/experimentos/${e.id}`} className="relative block h-11 rounded-xl hover:bg-paper dark:hover:bg-ink transition-colors" title={`${e.title}: ${e.start_date} → ${e.end_date}`}>
                <motion.span
                  className="absolute top-1.5 bottom-1.5 rounded-lg overflow-hidden flex items-center gap-1.5 px-2 text-xs font-semibold text-white shadow-sm"
                  style={{ left: `${left}%`, backgroundColor: `${color}33`, border: `1px solid ${color}66` }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: `${width}%`, opacity: 1 }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.span
                    className="absolute inset-y-0 left-0"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${e.progressPct}%` }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.06 }}
                  />
                  <span className="relative text-base leading-none">{experimentEmoji(e)}</span>
                  <span className="relative truncate drop-shadow-sm">{e.title}</span>
                </motion.span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BoardView({ items }: { items: ExperimentListItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {BOARD_COLUMNS.map((status) => {
        const col = items.filter((e) => e.status === status);
        return (
          <div key={status} className="rounded-2xl bg-paper dark:bg-ink p-2.5 min-h-[120px]">
            <p className="flex items-center justify-between px-1.5 mb-2 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status].ring }} /> {STATUS_LABEL_PT[status]}
              </span>
              <span className="text-slate">{col.length}</span>
            </p>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {col.map((e) => (
                  <motion.div key={e.id} layout layoutId={`exp-board-${e.id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <Link to={`/experimentos/${e.id}`} className="block rounded-xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-2.5 hover:border-cat-purple/40 transition-colors">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-xl leading-none">{experimentEmoji(e)}</span>
                        <span className="truncate">{e.title}</span>
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ backgroundColor: STATUS_COLOR[status].ring }} initial={{ width: 0 }} animate={{ width: `${e.progressPct}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <RecentDots recent={e.recent} />
                        {e.resultLabel && <span className="text-[10px] font-semibold text-cat-green">{e.resultLabel}</span>}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
              {col.length === 0 && <p className="text-[11px] text-slate text-center py-4">Nada aqui.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ExperimentBoard({ experiments }: { experiments: ExperimentListItem[] }) {
  const [view, setView] = useState<View>("cards");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: experiments.length };
    for (const e of experiments) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [experiments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return experiments.filter((e) => (view === "board" || filter === "all" || e.status === filter) && (!q || e.title.toLowerCase().includes(q) || (e.hypothesis ?? "").toLowerCase().includes(q)));
  }, [experiments, filter, search, view]);

  return (
    <section aria-labelledby="exp-lab-title" className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 id="exp-lab-title" className="font-display font-bold text-lg">Seu laboratório</h2>
          <p className="text-xs text-slate">Todos os experimentos de uma vez — veja o que está rodando, o que se sobrepõe e o que deu resultado.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar experimentos</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-36 sm:w-48 rounded-xl pl-8 pr-3 py-2 text-xs bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple"
            />
          </label>
          <LayoutGroup id="exp-view">
            <div role="tablist" aria-label="Visão" className="inline-flex rounded-xl bg-paper dark:bg-ink p-1">
              {(
                [
                  { key: "cards", icon: <LayoutGrid size={14} />, label: "Cartões" },
                  { key: "timeline", icon: <CalendarRange size={14} />, label: "Linha do tempo" },
                  { key: "board", icon: <Columns3 size={14} />, label: "Quadro" },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={view === v.key}
                  aria-label={v.label}
                  title={v.label}
                  onClick={() => setView(v.key)}
                  className={clsx("relative rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5", view === v.key ? "text-cat-purple" : "text-slate")}
                >
                  {view === v.key && <motion.span layoutId="exp-view-pill" className="absolute inset-0 rounded-lg bg-paper-raised dark:bg-ink-raised shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="relative">{v.icon}</span>
                  <span className="relative hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </div>
      </div>

      {view !== "board" && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist" aria-label="Filtrar por status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                filter === f.key ? "border-cat-purple text-cat-purple" : "border-paper-border dark:border-ink-border text-slate hover:text-inherit"
              )}
            >
              {filter === f.key && <motion.span layoutId="exp-filter-pill" className="absolute inset-0 rounded-full bg-cat-purple/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">
                {f.label} <span className="opacity-60">{counts[f.key] ?? 0}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-slate text-center py-10 rounded-2xl border border-dashed border-paper-border dark:border-ink-border">Nenhum experimento com esse filtro.</p>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((e, i) => (
                  <ExperimentTile key={e.id} e={e} index={i} />
                ))}
              </AnimatePresence>
            </div>
          ) : view === "timeline" ? (
            <TimelineView items={filtered} />
          ) : (
            <BoardView items={filtered} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
