import { memo, useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Lock, Maximize2, Minus, Plus } from "lucide-react";
import { STATE_LABEL, type SkillBranch, type SkillNode } from "@/services/skillTreeService";
import { SKILL_ART, branchColor, skillIcon } from "./skillShared";

/**
 * Grafo interativo da Árvore: SVG puro (sem biblioteca), com zoom/pan aplicados por
 * ref no grupo raiz — mexer a câmera não re-renderiza os 52 nós. Arestas = pré-requisitos
 * reais do catálogo (sólidas = E, tracejadas com losango = alternativas OU).
 */

const VB = { x: -720, y: -575, w: 1440, h: 1015 };
/** Espalhamento horizontal da copa (o catálogo usa um círculo; a tela é mais larga que alta). */
const SPREAD_X = 1.18;
type Cam = { k: number; x: number; y: number };

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return { d: `M ${a.x} ${a.y} Q ${mx * 0.86} ${my * 0.86} ${b.x} ${b.y}`, mid: { x: (a.x + 2 * mx * 0.86 + b.x) / 4, y: (a.y + 2 * my * 0.86 + b.y) / 4 } };
}

interface Edge { from: string; to: string; or: boolean; met: boolean; branch: SkillBranch; d: string; mid: { x: number; y: number } }

export function SkillGraph({
  skills: rawSkills,
  selected,
  onSelect,
  branch,
  search,
  onlyAvailable,
  available,
  justUnlocked,
  height = "h-[560px]",
}: {
  skills: SkillNode[];
  selected: string | null;
  onSelect: (key: string) => void;
  branch: SkillBranch | "all";
  search: string;
  onlyAvailable: boolean;
  available: number;
  justUnlocked: string | null;
  height?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const cam = useRef<Cam>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const skills = useMemo(() => rawSkills.map((s) => ({ ...s, pos: { x: s.pos.x * SPREAD_X, y: s.pos.y } })), [rawSkills]);
  const byKey = useMemo(() => new Map(skills.map((s) => [s.key, s])), [skills]);

  const apply = useCallback((c: Cam) => {
    cam.current = { k: Math.max(0.6, Math.min(3, c.k)), x: c.x, y: c.y };
    camRef.current?.setAttribute("transform", `translate(${cam.current.x} ${cam.current.y}) scale(${cam.current.k})`);
  }, []);
  const ratio = () => {
    const el = svgRef.current;
    return el ? Math.max(VB.w / el.clientWidth, VB.h / el.clientHeight) : 1;
  };
  const toVb = (cx: number, cy: number) => {
    const el = svgRef.current!;
    const r = el.getBoundingClientRect();
    const s = ratio();
    return { x: VB.x + (VB.w - r.width * s) / 2 + (cx - r.left) * s, y: VB.y + (VB.h - r.height * s) / 2 + (cy - r.top) * s };
  };
  // Enquadramento inicial: em telas estreitas aproxima a copa (o restante fica acessível por arrasto/pinça).
  const home = useCallback(() => {
    const w = svgRef.current?.clientWidth ?? 1000;
    const k = w < 640 ? 1.6 : 1;
    apply({ k, x: 0, y: 140 * (k - 1) });
  }, [apply]);
  const zoomAt = useCallback((factor: number, p = { x: 0, y: -20 }) => {
    const c = cam.current;
    const k = Math.max(0.6, Math.min(3, c.k * factor));
    apply({ k, x: p.x - ((p.x - c.x) * k) / c.k, y: p.y - ((p.y - c.y) * k) / c.k });
  }, [apply]);

  // Filtro por ramo: a câmera centraliza o setor escolhido.
  useEffect(() => {
    if (branch === "all") return home();
    const list = skills.filter((s) => s.branch === branch);
    if (!list.length) return;
    const cx = list.reduce((s, n) => s + n.pos.x, 0) / list.length;
    const cy = list.reduce((s, n) => s + n.pos.y, 0) / list.length;
    const k = 1.55;
    apply({ k, x: -cx * k, y: -20 - cy * k });
  }, [branch, skills, apply, home]);

  // Roda do mouse: zoom no cursor (listener não-passivo para impedir a rolagem da página).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), toVb(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomAt]);

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt(d / pinch.current, toVb((a!.x + b!.x) / 2, (a!.y + b!.y) / 2));
      pinch.current = d;
      return;
    }
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) svgRef.current?.setPointerCapture(e.pointerId);
    g.moved = true;
    const s = ratio();
    apply({ ...cam.current, x: cam.current.x + dx * s, y: cam.current.y + dy * s });
    g.x = e.clientX;
    g.y = e.clientY;
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    window.setTimeout(() => {
      if (drag.current?.id === e.pointerId) drag.current = null;
    }, 0);
  };
  const select = useCallback(
    (key: string) => {
      if (drag.current?.moved) return;
      onSelect(key);
    },
    [onSelect],
  );

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const s of skills)
      for (const g of s.requires)
        for (const o of g) {
          const from = byKey.get(o.skill);
          if (!from) continue;
          const c = curve(from.pos, s.pos);
          out.push({ from: o.skill, to: s.key, or: g.length > 1, met: from.level >= o.level, branch: s.branch, ...c });
        }
    return out;
  }, [skills, byKey]);

  // Caminho do nó selecionado: todos os antecessores (todas as opções), destacados em dourado.
  const path = useMemo(() => {
    const set = new Set<string>();
    const walk = (k: string) => {
      if (set.has(k)) return;
      set.add(k);
      for (const g of byKey.get(k)?.requires ?? []) for (const o of g) walk(o.skill);
    };
    if (selected) walk(selected);
    return set;
  }, [selected, byKey]);

  const term = search.trim().toLowerCase();
  const dimOf = (s: SkillNode) =>
    (branch !== "all" && s.branch !== branch && !path.has(s.key)) ||
    (!!term && !s.name.toLowerCase().includes(term)) ||
    (onlyAvailable && s.state !== "disponivel" && s.state !== "em_evolucao");
  const roots = skills.filter((s) => s.tier === 1);

  return (
    <div className={`relative w-full overflow-hidden ${height}`}>
      <svg
        ref={svgRef}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        className="h-full w-full touch-none select-none"
        role="group"
        aria-label="Árvore de habilidades interativa. Arraste para mover, use a roda ou os botões para aproximar. Tab percorre as habilidades."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <radialGradient id="st-crown" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="rgb(var(--rpg-purple))" stopOpacity="0.35" />
            <stop offset="60%" stopColor="rgb(var(--rpg-purple))" stopOpacity="0.08" />
            <stop offset="100%" stopColor="rgb(var(--rpg-bg))" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="st-trunk" x1="0" x2="1">
            <stop offset="0%" stopColor="#3b2414" />
            <stop offset="45%" stopColor="#8a5a2b" />
            <stop offset="60%" stopColor="#c08a43" />
            <stop offset="100%" stopColor="#3b2414" />
          </linearGradient>
          <filter id="st-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="st-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g ref={camRef}>
          <circle cx="0" cy="-150" r="620" fill="url(#st-crown)" />
          {/* Tronco e raízes douradas (decoração; não são dados). */}
          <g aria-hidden>
            {[-1, 1].flatMap((side) => [
              <path key={`r1${side}`} d={`M ${side * 60} 330 C ${side * 150} 368, ${side * 260} 368, ${side * 380} 400`} stroke="#c08a43" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.85" />,
              <path key={`r2${side}`} d={`M ${side * 30} 350 C ${side * 80} 395, ${side * 150} 405, ${side * 220} 420`} stroke="#d9a74e" strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.7" />,
              <path key={`r3${side}`} d={`M ${side * 90} 318 C ${side * 220} 334, ${side * 330} 320, ${side * 470} 334`} stroke="#8a5a2b" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.7" />,
            ])}
            <path d="M -46 40 C -44 150, -62 260, -104 364 L 104 364 C 62 260, 44 150, 46 40 Z" fill="url(#st-trunk)" stroke="#2a180c" strokeWidth="4" />
            <path d="M -14 90 C -20 180, -28 260, -48 330 M 18 110 C 16 190, 24 270, 44 336" stroke="#2a180c" strokeWidth="4" fill="none" opacity="0.55" />
            <ellipse cx="0" cy="370" rx="230" ry="26" fill="rgb(var(--rpg-gold))" opacity="0.18" filter="url(#st-soft)" />
          </g>
          {/* Galhos: do núcleo até cada raiz de ramo. */}
          {roots.map((r) => {
            const c = curve({ x: 0, y: 0 }, r.pos);
            return <path key={`limb-${r.key}`} d={c.d} stroke={branchColor(r.branch, r.level ? 0.95 : 0.45)} strokeWidth="11" fill="none" strokeLinecap="round" filter={r.level ? "url(#st-glow)" : undefined} aria-hidden />;
          })}
          {/* Dependências reais. */}
          <g aria-hidden>
            {edges.map((e) => {
              const onPath = path.has(e.to) && path.has(e.from);
              const dim = branch !== "all" && e.branch !== branch && !onPath;
              return (
                <g key={`${e.from}>${e.to}`} opacity={dim ? 0.15 : 1}>
                  <path
                    d={e.d}
                    stroke={onPath ? "rgb(var(--rpg-gold-light))" : branchColor(e.branch, e.met ? 0.9 : 0.35)}
                    strokeWidth={onPath ? 5 : e.met ? 4.5 : 3}
                    strokeDasharray={e.or ? "10 7" : undefined}
                    fill="none"
                    strokeLinecap="round"
                    filter={e.met || onPath ? "url(#st-glow)" : undefined}
                  />
                  {e.or && <rect x={e.mid.x - 5} y={e.mid.y - 5} width="10" height="10" transform={`rotate(45 ${e.mid.x} ${e.mid.y})`} fill="rgb(var(--rpg-bg))" stroke={branchColor(e.branch, 0.9)} strokeWidth="2" />}
                </g>
              );
            })}
          </g>
          {/* Núcleo: PH disponíveis. */}
          <g aria-hidden>
            <circle r="58" fill="rgb(var(--rpg-bg))" stroke="rgb(var(--rpg-gold))" strokeWidth="5" filter="url(#st-glow)" />
            <circle r="48" fill="rgb(var(--rpg-panel))" stroke="rgb(var(--rpg-purple))" strokeWidth="3" />
            <image href={`${SKILL_ART}/crystal.webp`} x="-30" y="-40" width="60" height="60" style={{ imageRendering: "pixelated" }} />
            <text y="36" textAnchor="middle" className="fill-[rgb(var(--rpg-gold-light))] font-rpg text-[22px] font-bold">
              {available} PH
            </text>
          </g>
          {skills.map((s) => (
            <NodeView key={s.key} s={s} selected={selected === s.key} onPath={path.has(s.key) && selected !== s.key} dim={dimOf(s)} matched={!!term && s.name.toLowerCase().includes(term)} burst={justUnlocked === s.key} onSelect={select} />
          ))}
          {/* Rótulo do nó selecionado desenhado por último para ficar acima dos vizinhos. */}
          {selected && byKey.get(selected) && (() => {
            const n = byKey.get(selected)!;
            return (
              <text x={n.pos.x} y={n.pos.y + (n.tier === 5 ? 34 : 29) + 32} textAnchor="middle" aria-hidden className="pointer-events-none fill-[rgb(var(--rpg-gold-light))] text-[17px] font-semibold" style={{ paintOrder: "stroke", stroke: "rgb(var(--rpg-bg))", strokeWidth: 6 }}>
                {n.name}
              </text>
            );
          })()}
        </g>
      </svg>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        {[
          { l: "Aproximar", i: <Plus size={15} />, f: () => zoomAt(1.25) },
          { l: "Afastar", i: <Minus size={15} />, f: () => zoomAt(0.8) },
          { l: "Centralizar árvore", i: <Maximize2 size={14} />, f: home },
        ].map((b) => (
          <button key={b.l} type="button" onClick={b.f} aria-label={b.l} title={b.l} className="flex h-9 w-9 items-center justify-center border-2 border-rpg-gold/60 bg-rpg-panel/90 text-rpg-gold-light hover:border-rpg-gold" style={{ borderRadius: 4 }}>
            {b.i}
          </button>
        ))}
      </div>
    </div>
  );
}

const NodeView = memo(function NodeView({ s, selected, onPath, dim, matched, burst, onSelect }: { s: SkillNode; selected: boolean; onPath: boolean; dim: boolean; matched: boolean; burst: boolean; onSelect: (k: string) => void }) {
  const Icon = skillIcon(s.icon);
  const locked = s.state === "bloqueada";
  const owned = s.level > 0;
  const color = branchColor(s.branch);
  const maxed = s.state === "maximizada";
  const ready = s.state === "disponivel" || s.state === "em_evolucao";
  const r = s.tier === 5 ? 34 : 29;
  const key = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(s.key);
    }
  };
  return (
    <g
      transform={`translate(${s.pos.x} ${s.pos.y})`}
      className="group cursor-pointer outline-none [&:focus-visible_.st-focus]:opacity-100"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${s.name}: ${STATE_LABEL[s.state]}, nível ${s.level} de ${s.maxLevel}`}
      opacity={dim ? 0.22 : 1}
      onClick={() => onSelect(s.key)}
      onKeyDown={key}
    >
      <title>{`${s.name} — ${STATE_LABEL[s.state]} (${s.level}/${s.maxLevel})`}</title>
      <circle className="st-focus opacity-0" r={r + 12} fill="none" stroke="rgb(var(--rpg-text))" strokeWidth="3" strokeDasharray="6 5" />
      {(selected || onPath || matched) && <circle r={r + 9} fill="none" stroke={selected ? "rgb(var(--rpg-gold-light))" : "rgb(var(--rpg-gold) / 0.7)"} strokeWidth={selected ? 4 : 2.5} filter="url(#st-glow)" />}
      {ready && <circle r={r + 6} fill="none" stroke={color} strokeWidth="3" className="motion-safe:animate-pulse" filter="url(#st-glow)" />}
      {burst && <circle r={r} fill="none" stroke="rgb(var(--rpg-gold-light))" strokeWidth="6" className="motion-safe:animate-ping" style={{ transformOrigin: "center" }} />}
      <circle
        r={r}
        fill={owned ? `rgb(var(--rpg-bg))` : "rgb(var(--rpg-bg))"}
        stroke={maxed ? "rgb(var(--rpg-gold))" : locked ? "rgb(var(--rpg-border))" : color}
        strokeWidth={maxed ? 5 : 3.5}
        strokeDasharray={s.state === "indisponivel" ? "6 4" : undefined}
        filter={owned || maxed ? "url(#st-glow)" : undefined}
      />
      {owned && <circle r={r - 5} fill={color} opacity={maxed ? 0.55 : 0.35} />}
      {locked ? (
        <Lock x={-12} y={-12} width={24} height={24} color="rgb(var(--rpg-text-muted))" strokeWidth={2.4} aria-hidden />
      ) : (
        <Icon x={-14} y={-14} width={28} height={28} color={owned ? "rgb(var(--rpg-text))" : color} strokeWidth={2.3} aria-hidden />
      )}
      {/* Pontos de nível sob o nó. */}
      {Array.from({ length: s.maxLevel }, (_, i) => (
        <circle key={i} cx={(i - (s.maxLevel - 1) / 2) * 11} cy={r + 11} r="3.6" fill={i < s.level ? (maxed ? "rgb(var(--rpg-gold-light))" : color) : "rgb(var(--rpg-bg))"} stroke={i < s.level ? "none" : "rgb(var(--rpg-border))"} strokeWidth="1.5" />
      ))}
      <text
        y={r + 32}
        textAnchor="middle"
        className={`pointer-events-none fill-[rgb(var(--rpg-text))] text-[17px] font-semibold transition-opacity ${matched && !selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus:opacity-100"}`}
        style={{ paintOrder: "stroke", stroke: "rgb(var(--rpg-bg))", strokeWidth: 5 }}
      >
        {s.name}
      </text>
    </g>
  );
});
