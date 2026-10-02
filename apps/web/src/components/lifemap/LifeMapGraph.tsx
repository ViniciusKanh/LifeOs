import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Maximize2, Minimize2, Minus, Plus, ScanSearch } from "lucide-react";
import type { LifeMapAreaId, LifeMapEdge, LifeMapNode } from "@/types";
import { AREA_RADIUS, CENTER_RADIUS, ITEM_HEIGHT, boundsOf, itemLabel, layoutLifeMap, type MapNodeBox } from "@/utils/lifeMapLayout";

/**
 * Life Map — grafo em SVG desenhado à mão (sem lib de grafo), com layout
 * determinístico (utils/lifeMapLayout.ts), zoom ancorado no cursor,
 * pinça no toque, botões de zoom/ajustar/tela cheia e foco animado no
 * nó selecionado. Itens são "chips" com o nome legível, não pontinhos.
 */

export const AREA_COLOR: Record<LifeMapAreaId, string> = {
  metas: "#9550FF",
  projetos: "#2F80FF",
  habitos: "#12B76A",
  educacao: "#08B6A6",
  leitura: "#FF3D93",
  saude: "#FF7A45",
  profissional: "#7C4DFF",
};

export const AREA_ICON: Record<LifeMapAreaId, string> = {
  metas: "🎯",
  projetos: "📁",
  habitos: "🔁",
  educacao: "🎓",
  leitura: "📚",
  saude: "❤️",
  profissional: "💼",
};

const KIND_ICON: Partial<Record<LifeMapNode["kind"], string>> = {
  goal: "🎯",
  project: "📁",
  habit: "🔁",
  education: "🎓",
  academic_project: "📄",
  book: "📖",
  health: "💧",
};

const MIN_K = 0.3;
const MAX_K = 2.6;

interface View {
  k: number;
  x: number;
  y: number;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** Curva suave entre dois nós: o controle é puxado levemente para o centro do mapa. */
function curve(a: MapNodeBox, b: MapNodeBox, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx * (1 - bend);
  const cy = my * (1 - bend);
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

export function LifeMapGraph({
  nodes,
  edges,
  visibleAreas,
  selectedId,
  onSelect,
  onOpen,
  resetToken,
}: {
  nodes: LifeMapNode[];
  edges: LifeMapEdge[];
  visibleAreas: LifeMapAreaId[] | "all";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Duplo clique / Enter duas vezes: abre o item na tela de origem. */
  onOpen?: (node: LifeMapNode) => void;
  resetToken: number;
}) {
  const reduce = useReducedMotion();
  const { ref: wrapRef, size } = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const boxes = useMemo(() => layoutLifeMap(nodes, visibleAreas), [nodes, visibleAreas]);
  const byId = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  const bounds = useMemo(() => boundsOf(boxes), [boxes]);

  const neighbors = useMemo(() => {
    const focus = selectedId ?? hoverId;
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  }, [edges, selectedId, hoverId]);

  // ---- Visão (zoom/pan) -------------------------------------------------
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const animRef = useRef<number | null>(null);

  const animateTo = useCallback(
    (target: View) => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (reduce) {
        setView(target);
        return;
      }
      const from = viewRef.current;
      const start = performance.now();
      const dur = 420;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        setView({ k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
        if (t < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [reduce]
  );

  const fitView = useCallback((): View => {
    const { w, h } = size;
    if (!w || !h) return { k: 1, x: 0, y: 0 };
    const pad = 36;
    const bw = bounds.x1 - bounds.x0;
    const bh = bounds.y1 - bounds.y0;
    const k = clampK(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh));
    return { k, x: w / 2 - ((bounds.x0 + bounds.x1) / 2) * k, y: h / 2 - ((bounds.y0 + bounds.y1) / 2) * k };
  }, [size, bounds]);

  // Ajusta ao abrir, ao mudar de tamanho/visão e quando pedirem "Centralizar".
  const fitKey = `${size.w}x${size.h}|${boxes.length}|${resetToken}|${fullscreen}`;
  const lastFit = useRef("");
  useEffect(() => {
    if (!size.w || !size.h || lastFit.current === fitKey) return;
    const first = lastFit.current === "";
    lastFit.current = fitKey;
    const target = fitView();
    if (first) setView(target);
    else animateTo(target);
  }, [fitKey, fitView, animateTo, size.w, size.h]);

  // Seleção vinda de fora (busca, alerta): leva o nó para o centro.
  useEffect(() => {
    if (!selectedId || !size.w) return;
    const b = byId.get(selectedId);
    if (!b) return;
    const k = Math.max(viewRef.current.k, 1.05);
    animateTo({ k, x: size.w / 2 - b.x * k, y: size.h / 2 - b.y * k });
  }, [selectedId, byId, size.w, size.h, animateTo]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = clampK(v.k * factor);
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }, []);

  // Roda do mouse dá zoom no ponto do cursor (listener nativo, não passivo,
  // para não rolar a página junto).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Arrastar (1 dedo/mouse) e pinça (2 dedos).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinchDist: number | null }>({ moved: false, pinchDist: null });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && gesture.current.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svgRef.current!.getBoundingClientRect();
      zoomAt(dist / gesture.current.pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      gesture.current.pinchDist = dist;
      gesture.current.moved = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) gesture.current.moved = true;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinchDist = null;
  };

  const zoomButton = (factor: number) => zoomAt(factor, size.w / 2, size.h / 2);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "+" || e.key === "=") zoomButton(1.2);
    else if (e.key === "-") zoomButton(1 / 1.2);
    else if (e.key === "0") animateTo(fitView());
    else if (e.key === "Escape") {
      if (fullscreen) setFullscreen(false);
      else onSelect(null);
    }
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [fullscreen]);

  const hovered = hoverId ? byId.get(hoverId) ?? null : null;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[60] bg-paper dark:bg-ink p-3 sm:p-5 flex flex-col"
          : "relative w-full h-full"
      }
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Mapa interativo. Use + e − para zoom, 0 para ajustar e Esc para limpar a seleção."
        className="relative w-full h-full flex-1 overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500
          bg-[radial-gradient(circle_at_center,rgba(149,80,255,0.07),transparent_65%),radial-gradient(rgba(30,37,55,0.08)_1px,transparent_1px)]
          dark:bg-[radial-gradient(circle_at_center,rgba(149,80,255,0.14),transparent_65%),radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)]
          [background-size:100%_100%,22px_22px]"
      >
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          className="block select-none touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => {
            if (!gesture.current.moved && e.target === e.currentTarget) onSelect(null);
          }}
        >
          <defs>
            <radialGradient id="lm-center" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0%" stopColor="#B37CFF" />
              <stop offset="100%" stopColor="#6D3BFF" />
            </radialGradient>
            <filter id="lm-shadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#1E2537" floodOpacity="0.14" />
            </filter>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* Arestas */}
            {edges.map((e, i) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const area = a.area ?? b.area;
              const color = area ? AREA_COLOR[area] : "#98A2B3";
              const structural = e.kind === "hub";
              const active = neighbors ? neighbors.has(e.from) && neighbors.has(e.to) && (e.from === (selectedId ?? hoverId) || e.to === (selectedId ?? hoverId)) : false;
              const dimmed = neighbors != null && !active;
              const dash = e.kind === "manual" ? "3 6" : structural ? undefined : "6 6";
              return (
                <path
                  key={`${e.from}-${e.to}-${i}`}
                  d={curve(a, b, structural ? 0.04 : 0.35)}
                  fill="none"
                  stroke={color}
                  strokeOpacity={dimmed ? 0.06 : active ? 0.95 : structural ? 0.32 : 0.45}
                  strokeWidth={(active ? 2.6 : structural ? 1.6 : 1.4) / Math.max(view.k, 0.6)}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  className="transition-[stroke-opacity] duration-200"
                />
              );
            })}

            {/* Nós */}
            {boxes.map((n, idx) => {
              const selected = selectedId === n.id;
              const dimmed = neighbors != null && !neighbors.has(n.id) && n.kind !== "center";
              const color = n.kind === "center" ? "#7C4DFF" : n.area ? AREA_COLOR[n.area] : "#98A2B3";
              const common = {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": `${n.label}${n.sublabel ? `, ${n.sublabel}` : ""}${n.progressPct != null ? `, ${n.progressPct}%` : ""}`,
                "aria-pressed": selected,
                onPointerEnter: () => setHoverId(n.id),
                onPointerLeave: () => setHoverId((h) => (h === n.id ? null : h)),
                onClick: (ev: React.MouseEvent) => {
                  ev.stopPropagation();
                  if (gesture.current.moved) return;
                  onSelect(selected ? null : n.id);
                },
                onDoubleClick: () => n.openPath && onOpen?.(n),
                onKeyDown: (ev: React.KeyboardEvent) => {
                  if (ev.key === "Enter") {
                    ev.stopPropagation();
                    if (selected && n.openPath) onOpen?.(n);
                    else onSelect(n.id);
                  }
                },
                className: "cursor-pointer outline-none [&:focus-visible>*:first-child]:stroke-brand-500",
              };
              return (
                <motion.g
                  key={n.id}
                  initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: dimmed ? 0.28 : 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(idx * 0.012, 0.5) }}
                  style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box" }}
                >
                  {n.kind === "center" ? (
                    <g {...common} transform={`translate(${n.x} ${n.y})`}>
                      <circle r={CENTER_RADIUS + 14} fill="#9550FF" opacity={0.12} />
                      <circle r={CENTER_RADIUS} fill="url(#lm-center)" filter="url(#lm-shadow)" stroke="white" strokeOpacity={0.7} strokeWidth={3} />
                      <text textAnchor="middle" dy={9} fontSize={28} className="pointer-events-none">🧑</text>
                      <text textAnchor="middle" y={CENTER_RADIUS + 20} fontSize={14} fontWeight={800} className="fill-[#111936] dark:fill-[#F2F0FA] pointer-events-none">
                        {n.label}
                      </text>
                    </g>
                  ) : n.kind === "area" ? (
                    <g {...common} transform={`translate(${n.x} ${n.y})`}>
                      {selected && <circle r={AREA_RADIUS + 10} fill={color} opacity={0.2} />}
                      <circle r={AREA_RADIUS} fill={color} filter="url(#lm-shadow)" stroke="white" strokeOpacity={0.8} strokeWidth={3} />
                      <text textAnchor="middle" dy={7} fontSize={21} className="pointer-events-none">
                        {AREA_ICON[n.area as LifeMapAreaId]}
                      </text>
                      {n.linkedCount > 0 && (
                        <g transform={`translate(${AREA_RADIUS * 0.72} ${-AREA_RADIUS * 0.72})`} className="pointer-events-none">
                          <circle r={10} className="fill-white dark:fill-[#1B1830]" stroke={color} strokeWidth={1.5} />
                          <text textAnchor="middle" dy={3.5} fontSize={10} fontWeight={700} fill={color}>
                            {n.linkedCount > 99 ? "99+" : n.linkedCount}
                          </text>
                        </g>
                      )}
                      <text textAnchor="middle" y={AREA_RADIUS + 18} fontSize={12.5} fontWeight={700} className="fill-[#111936] dark:fill-[#F2F0FA] pointer-events-none">
                        {n.label}
                      </text>
                    </g>
                  ) : (
                    <g {...common} transform={`translate(${n.x - n.w / 2} ${n.y - ITEM_HEIGHT / 2})`}>
                      <rect
                        width={n.w}
                        height={ITEM_HEIGHT}
                        rx={ITEM_HEIGHT / 2}
                        className="fill-white dark:fill-[#1B1830]"
                        stroke={color}
                        strokeOpacity={selected ? 1 : 0.45}
                        strokeWidth={selected ? 2.2 : 1.2}
                        filter="url(#lm-shadow)"
                      />
                      <circle cx={ITEM_HEIGHT / 2} cy={ITEM_HEIGHT / 2} r={10} fill={color} fillOpacity={0.14} />
                      <text x={ITEM_HEIGHT / 2} y={ITEM_HEIGHT / 2} dy={4} textAnchor="middle" fontSize={11} className="pointer-events-none">
                        {KIND_ICON[n.kind] ?? "•"}
                      </text>
                      <text x={ITEM_HEIGHT + 2} y={ITEM_HEIGHT / 2} dy={4} fontSize={11.5} fontWeight={selected ? 700 : 600} className="fill-[#1E2537] dark:fill-[#E7EAF2] pointer-events-none">
                        {itemLabel(n.label)}
                      </text>
                      {n.progressPct != null && (
                        <>
                          <rect x={ITEM_HEIGHT} y={ITEM_HEIGHT - 5} width={n.w - ITEM_HEIGHT - 12} height={2.5} rx={1.25} className="fill-black/[0.06] dark:fill-white/[0.08]" />
                          <rect x={ITEM_HEIGHT} y={ITEM_HEIGHT - 5} width={((n.w - ITEM_HEIGHT - 12) * Math.min(n.progressPct, 100)) / 100} height={2.5} rx={1.25} fill={color} />
                        </>
                      )}
                    </g>
                  )}
                </motion.g>
              );
            })}
          </g>
        </svg>

        {/* Dica flutuante do nó sob o cursor */}
        <AnimatePresence>
          {hovered && hovered.kind !== "center" && (
            <motion.div
              key={hovered.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute z-10 max-w-[240px] rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur px-3 py-2 shadow-lg"
              style={{
                left: Math.min(Math.max(8, hovered.x * view.k + view.x + 14), Math.max(8, size.w - 250)),
                top: Math.min(Math.max(8, hovered.y * view.k + view.y + 18), Math.max(8, size.h - 80)),
              }}
            >
              <p className="text-xs font-semibold leading-snug">{hovered.label}</p>
              {hovered.sublabel && <p className="text-[11px] text-slate mt-0.5">{hovered.sublabel}</p>}
              {hovered.progressPct != null && <p className="text-[11px] text-slate">{hovered.progressPct}% concluído</p>}
              {hovered.openPath && <p className="text-[10px] text-brand-600 dark:text-brand-400 mt-1">Duplo clique para abrir</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controles */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          {[
            { label: "Aproximar", icon: <Plus size={15} />, onClick: () => zoomButton(1.25) },
            { label: "Afastar", icon: <Minus size={15} />, onClick: () => zoomButton(1 / 1.25) },
            { label: "Ajustar à tela", icon: <ScanSearch size={15} />, onClick: () => animateTo(fitView()) },
            {
              label: fullscreen ? "Sair da tela cheia" : "Tela cheia",
              icon: fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />,
              onClick: () => setFullscreen((v) => !v),
            },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              aria-label={b.label}
              title={b.label}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-paper-raised/90 dark:bg-ink-raised/90 backdrop-blur border border-paper-border dark:border-ink-border shadow-sm text-slate hover:text-brand-600 transition-colors"
            >
              {b.icon}
            </button>
          ))}
        </div>
        <div className="absolute left-3 bottom-3 rounded-lg bg-paper-raised/85 dark:bg-ink-raised/85 backdrop-blur border border-paper-border dark:border-ink-border px-2 py-1 text-[10px] text-slate tabular-nums">
          {Math.round(view.k * 100)}%
        </div>
      </div>
    </div>
  );
}
