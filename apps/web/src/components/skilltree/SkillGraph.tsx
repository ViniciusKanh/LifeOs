import { memo, useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Maximize2, Minus, Plus, ScrollText } from "lucide-react";
import { DOMAINS, DOMAIN_LABEL, type PersonalSkill, type SkillDomain } from "@/services/personalSkillsService";
import { DOMAIN_ICON, SKILL_ART, domainColor, skillIcon } from "./skillShared";

/**
 * Grafo da Árvore de Habilidades 2.0 — SVG puro, layout radial calculado a
 * partir das habilidades reais do usuário:
 * - quatro troncos (Saúde, Educação, Pessoal, Trabalho) saem do núcleo;
 * - cada tronco recebe um setor proporcional à quantidade de folhas;
 * - sub-habilidades ficam mais longe do centro (uma "camada" por profundidade).
 * Zoom/pan são aplicados por ref no grupo raiz (mover a câmera não re-renderiza os nós).
 */

type Pt = { x: number; y: number };
type Cam = { k: number; x: number; y: number };
interface LaidNode {
  s: PersonalSkill;
  pos: Pt;
  angle: number;
  radius: number;
}
interface Ghost {
  domain: SkillDomain;
  pos: Pt;
}

const ARC_START = -205;
const ARC_END = 25;
const HUB_R = 170;
const SPREAD_X = 1.15;
const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (angle: number, r: number): Pt => ({ x: Math.cos(rad(angle)) * r * SPREAD_X, y: Math.sin(rad(angle)) * r });

/** Calcula posições (função pura de layout de tela, sem regra de negócio). */
function layout(skills: PersonalSkill[], withGhosts: boolean) {
  const kids = new Map<string | null, PersonalSkill[]>();
  for (const s of skills) {
    const k = s.parentId ?? `root:${s.domain}`;
    kids.set(k, [...(kids.get(k) ?? []), s]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const childrenOf = (id: string) => kids.get(id) ?? [];
  const rootsOf = (d: SkillDomain) => kids.get(`root:${d}`) ?? [];
  const leaves = (s: PersonalSkill): number => {
    const c = childrenOf(s.id);
    return c.length ? c.reduce((a, x) => a + leaves(x), 0) : 1;
  };
  const maxDepth = Math.max(1, ...skills.map((s) => s.depth));
  const step = Math.min(175, 520 / maxDepth);

  // Setores proporcionais às folhas (+1 vaga de "adicionar"), com largura mínima.
  const weights = DOMAINS.map((d) => Math.max(1.4, rootsOf(d).reduce((a, s) => a + leaves(s), 0) + (withGhosts ? 1 : 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = ARC_END - ARC_START;
  const minW = 38;
  let widths = weights.map((w) => (w / total) * span);
  const deficit = widths.reduce((a, w) => a + Math.max(0, minW - w), 0);
  const surplus = widths.reduce((a, w) => a + Math.max(0, w - minW), 0);
  widths = widths.map((w) => (w < minW ? minW : w - (surplus ? ((w - minW) / surplus) * deficit : 0)));

  const nodes: LaidNode[] = [];
  const leafChecks: Array<{ slotW: number; radius: number }> = [];
  const ghosts: Ghost[] = [];
  const hubs: Array<{ domain: SkillDomain; angle: number; pos: Pt; from: number; to: number }> = [];
  let cursor = ARC_START;
  DOMAINS.forEach((d, i) => {
    const from = cursor;
    const to = cursor + widths[i]!;
    cursor = to;
    const mid = (from + to) / 2;
    hubs.push({ domain: d, angle: mid, pos: polar(mid, HUB_R), from, to });
    const roots = rootsOf(d);
    const slots = roots.reduce((a, s) => a + leaves(s), 0) + (withGhosts ? 1 : 0);
    const pad = Math.min(6, (to - from) * 0.08);
    const slotW = (to - from - 2 * pad) / Math.max(1, slots);
    let slot = 0;
    // Folhas recebem fatias iguais; habilidade-mãe fica no meio das filhas.
    const place = (s: PersonalSkill, depth: number): number => {
      const c = childrenOf(s.id);
      let angle: number;
      if (!c.length) angle = from + pad + slotW * (slot++ + 0.5);
      else {
        const angles = c.map((x) => place(x, depth + 1));
        angle = (angles[0]! + angles[angles.length - 1]!) / 2;
      }
      const radius = HUB_R + depth * step + 40;
      nodes.push({ s, angle, radius, pos: polar(angle, radius) });
      if (!c.length) leafChecks.push({ slotW, radius });
      return angle;
    };
    for (const r of roots) place(r, 1);
    if (withGhosts) ghosts.push({ domain: d, pos: polar(from + pad + slotW * (slot + 0.5), HUB_R + step + 40) });
  });

  // Galhos apertados: afasta as camadas para que folhas vizinhas tenham espaço para o rótulo.
  const MIN_GAP = 115;
  const factor = Math.min(1.5, Math.max(1, ...leafChecks.map((l) => MIN_GAP / (rad(l.slotW) * l.radius))));
  if (factor > 1) {
    const grow = (r: number) => HUB_R + (r - HUB_R) * factor;
    for (const n of nodes) {
      n.radius = grow(n.radius);
      n.pos = polar(n.angle, n.radius);
    }
    for (const g of ghosts) {
      const a = Math.atan2(g.pos.y, g.pos.x / SPREAD_X);
      const r = Math.hypot(g.pos.x / SPREAD_X, g.pos.y);
      g.pos = polar((a * 180) / Math.PI, grow(r));
    }
  }

  // Caixa de visão ajustada ao conteúdo (inclui tronco e raízes decorativas).
  const pts = [...nodes.map((n) => n.pos), ...ghosts.map((g) => g.pos), ...hubs.map((h) => h.pos), { x: -300, y: 330 }, { x: 300, y: 330 }];
  const pad = 100;
  let minX = Math.min(...pts.map((p) => p.x)) - pad;
  let maxX = Math.max(...pts.map((p) => p.x)) + pad;
  let minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + 95;
  // Mantém um tamanho mínimo e proporção larga (evita árvore pequena "gigante").
  const w = Math.max(1000, maxX - minX);
  const cx = (minX + maxX) / 2;
  minX = cx - w / 2;
  maxX = cx + w / 2;
  if (maxY - minY < 700) minY = maxY - 700;
  return { nodes, ghosts, hubs, vb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Curva do pai até o filho: controle no ângulo do filho, raio do pai (galho "radial"). */
function branchPath(a: { angle: number; radius: number }, b: { angle: number; radius: number }) {
  const p = polar(a.angle, a.radius);
  const c = polar(b.angle, a.radius + (b.radius - a.radius) * 0.35);
  const q = polar(b.angle, b.radius);
  return `M ${p.x} ${p.y} Q ${c.x} ${c.y} ${q.x} ${q.y}`;
}

export function SkillGraph({
  skills,
  selected,
  onSelect,
  domain,
  search,
  onAdd,
  onDomain,
  totalLevels,
  justLeveled,
  height = "h-[560px]",
}: {
  skills: PersonalSkill[];
  selected: string | null;
  onSelect: (id: string) => void;
  domain: SkillDomain | "all";
  search: string;
  onAdd: (domain: SkillDomain) => void;
  onDomain: (domain: SkillDomain) => void;
  totalLevels: number;
  justLeveled: string | null;
  height?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const cam = useRef<Cam>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<number | null>(null);
  const { nodes, ghosts, hubs, vb } = useMemo(() => layout(skills, true), [skills]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.s.id, n])), [nodes]);

  const apply = useCallback((c: Cam) => {
    cam.current = { k: Math.max(0.6, Math.min(3.5, c.k)), x: c.x, y: c.y };
    camRef.current?.setAttribute("transform", `translate(${cam.current.x} ${cam.current.y}) scale(${cam.current.k})`);
  }, []);
  const ratio = () => {
    const el = svgRef.current;
    return el ? Math.max(vb.w / el.clientWidth, vb.h / el.clientHeight) : 1;
  };
  const toVb = (cx: number, cy: number) => {
    const el = svgRef.current!;
    const r = el.getBoundingClientRect();
    const s = ratio();
    return { x: vb.x + (vb.w - r.width * s) / 2 + (cx - r.left) * s, y: vb.y + (vb.h - r.height * s) / 2 + (cy - r.top) * s };
  };
  // Enquadramento inicial: em telas estreitas aproxima a copa (o resto fica acessível por arrasto/pinça).
  const home = useCallback(() => {
    const w = svgRef.current?.clientWidth ?? 1000;
    const k = w < 640 ? 1.5 : 1;
    const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h * 0.42 };
    apply({ k, x: c.x * (1 - k), y: c.y * (1 - k) });
  }, [apply, vb]);
  const zoomAt = useCallback(
    (factor: number, p?: Pt) => {
      const c = cam.current;
      const at = p ?? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      const k = Math.max(0.6, Math.min(3.5, c.k * factor));
      apply({ k, x: at.x - ((at.x - c.x) * k) / c.k, y: at.y - ((at.y - c.y) * k) / c.k });
    },
    [apply, vb],
  );

  // Filtro por tronco: a câmera centraliza o setor escolhido.
  useEffect(() => {
    if (domain === "all") return home();
    const hub = hubs.find((h) => h.domain === domain)!;
    const list = nodes.filter((n) => n.s.domain === domain).map((n) => n.pos);
    const pts = list.length ? list : [hub.pos];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const k = list.length > 8 ? 1.25 : 1.55;
    apply({ k, x: cx * (1 - k) + (vb.x + vb.w / 2 - cx), y: cy * (1 - k) + (vb.y + vb.h / 2 - cy) });
  }, [domain, nodes, hubs, apply, home, vb]);

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
  const guard = useCallback(
    (fn: () => void) => {
      if (drag.current?.moved) return;
      fn();
    },
    [],
  );
  const select = useCallback((id: string) => guard(() => onSelect(id)), [guard, onSelect]);

  // Caminho do selecionado até o tronco (destacado em dourado).
  const path = useMemo(() => {
    const set = new Set<string>();
    let cur = selected ? byId.get(selected) : undefined;
    while (cur) {
      set.add(cur.s.id);
      cur = cur.s.parentId ? byId.get(cur.s.parentId) : undefined;
    }
    return set;
  }, [selected, byId]);

  const term = search.trim().toLowerCase();
  const dimOf = (s: PersonalSkill) => (domain !== "all" && s.domain !== domain) || (!!term && !s.name.toLowerCase().includes(term));

  return (
    <div className={`relative w-full overflow-hidden ${height}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
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
            <stop offset="0%" stopColor="rgb(var(--rpg-purple))" stopOpacity="0.32" />
            <stop offset="60%" stopColor="rgb(var(--rpg-purple))" stopOpacity="0.07" />
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
          <circle cx="0" cy="-150" r="680" fill="url(#st-crown)" />
          {/* Tronco e raízes (decoração; não são dados). */}
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
          {/* Galhos: núcleo → troncos → habilidades → sub-habilidades. */}
          <g aria-hidden>
            {hubs.map((h) => {
              const lit = nodes.some((n) => n.s.domain === h.domain && n.s.level > 0);
              return (
                <path
                  key={`hub-${h.domain}`}
                  d={`M 0 0 Q ${h.pos.x * 0.4} ${h.pos.y * 0.9} ${h.pos.x} ${h.pos.y}`}
                  stroke={domainColor(h.domain, lit ? 0.95 : 0.5)}
                  strokeWidth="13"
                  fill="none"
                  strokeLinecap="round"
                  filter={lit ? "url(#st-glow)" : undefined}
                  opacity={domain !== "all" && domain !== h.domain ? 0.25 : 1}
                />
              );
            })}
            {nodes.map((n) => {
              const parent = n.s.parentId ? byId.get(n.s.parentId) : null;
              const hub = hubs.find((h) => h.domain === n.s.domain)!;
              const from = parent ? { angle: parent.angle, radius: parent.radius } : { angle: hub.angle, radius: HUB_R };
              const onPath = path.has(n.s.id) && (!parent || path.has(parent.s.id));
              const lit = n.s.level > 0;
              return (
                <path
                  key={`edge-${n.s.id}`}
                  d={branchPath(from, n)}
                  stroke={onPath ? "rgb(var(--rpg-gold-light))" : domainColor(n.s.domain, lit ? 0.9 : 0.4)}
                  strokeWidth={onPath ? 6 : parent ? 4 : 7}
                  fill="none"
                  strokeLinecap="round"
                  filter={lit || onPath ? "url(#st-glow)" : undefined}
                  opacity={dimOf(n.s) && !onPath ? 0.18 : 1}
                />
              );
            })}
          </g>
          {/* Núcleo: níveis comprovados no total. */}
          <g aria-hidden>
            <circle r="66" fill="rgb(var(--rpg-bg))" stroke="rgb(var(--rpg-gold))" strokeWidth="5" filter="url(#st-glow)" />
            <circle r="56" fill="rgb(var(--rpg-panel))" stroke="rgb(var(--rpg-purple))" strokeWidth="3" />
            <image href={`${SKILL_ART}/crystal.webp`} x="-34" y="-46" width="68" height="68" style={{ imageRendering: "pixelated" }} />
            <text y="42" textAnchor="middle" className="fill-[rgb(var(--rpg-gold-light))] font-rpg text-[24px] font-bold">
              {totalLevels} nv
            </text>
          </g>
          {hubs.map((h) => (
            <HubView key={h.domain} domain={h.domain} pos={h.pos} dim={domain !== "all" && domain !== h.domain} count={nodes.filter((n) => n.s.domain === h.domain).length} onClick={() => guard(() => onDomain(h.domain))} />
          ))}
          {ghosts.map((g) => (
            <GhostView key={`ghost-${g.domain}`} domain={g.domain} pos={g.pos} dim={domain !== "all" && domain !== g.domain} onClick={() => guard(() => onAdd(g.domain))} />
          ))}
          {nodes.map((n) => (
            <NodeView key={n.s.id} n={n} selected={selected === n.s.id} onPath={path.has(n.s.id) && selected !== n.s.id} dim={dimOf(n.s)} matched={!!term && n.s.name.toLowerCase().includes(term)} burst={justLeveled === n.s.id} onSelect={select} />
          ))}
          {/* Rótulo do selecionado por último, acima dos vizinhos. */}
          {selected && byId.get(selected) && (() => {
            const n = byId.get(selected)!;
            return (
              <text x={n.pos.x} y={n.pos.y + nodeR(n.s) + 42} textAnchor="middle" aria-hidden className="pointer-events-none fill-[rgb(var(--rpg-gold-light))] text-[23px] font-bold" style={{ paintOrder: "stroke", stroke: "rgb(var(--rpg-bg))", strokeWidth: 6 }}>
                {n.s.name}
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

const nodeR = (s: PersonalSkill) => (s.depth === 1 ? 40 : s.depth === 2 ? 34 : 29);
const short = (name: string, max = 18) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);
const onKey = (fn: () => void) => (e: KeyboardEvent<SVGGElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

function HubView({ domain, pos, dim, count, onClick }: { domain: SkillDomain; pos: Pt; dim: boolean; count: number; onClick: () => void }) {
  const Icon = DOMAIN_ICON[domain];
  const color = domainColor(domain);
  return (
    <g transform={`translate(${pos.x} ${pos.y})`} className="cursor-pointer outline-none [&:focus-visible_.st-focus]:opacity-100" role="button" tabIndex={0} aria-label={`Tronco ${DOMAIN_LABEL[domain]}: ${count} habilidade(s). Filtrar.`} opacity={dim ? 0.35 : 1} onClick={onClick} onKeyDown={onKey(onClick)}>
      <circle className="st-focus opacity-0" r={58} fill="none" stroke="rgb(var(--rpg-text))" strokeWidth="3" strokeDasharray="6 5" />
      <rect x={-42} y={-42} width={84} height={84} transform="rotate(45)" fill="rgb(var(--rpg-bg))" stroke={color} strokeWidth="5" filter="url(#st-glow)" />
      <Icon x={-20} y={-20} width={40} height={40} color={color} strokeWidth={2.4} aria-hidden />
      <text y={-70} textAnchor="middle" className="pointer-events-none font-pixel text-[24px] uppercase tracking-wider" fill={color} style={{ paintOrder: "stroke", stroke: "rgb(var(--rpg-bg))", strokeWidth: 6 }}>
        {DOMAIN_LABEL[domain]}
      </text>
    </g>
  );
}

function GhostView({ domain, pos, dim, onClick }: { domain: SkillDomain; pos: Pt; dim: boolean; onClick: () => void }) {
  const color = domainColor(domain, 0.7);
  return (
    <g transform={`translate(${pos.x} ${pos.y})`} className="cursor-pointer outline-none [&:focus-visible_.st-focus]:opacity-100 [&:hover_.st-ghost]:opacity-100" role="button" tabIndex={0} aria-label={`Adicionar habilidade em ${DOMAIN_LABEL[domain]}`} opacity={dim ? 0.2 : 1} onClick={onClick} onKeyDown={onKey(onClick)}>
      <title>{`Nova habilidade em ${DOMAIN_LABEL[domain]}`}</title>
      <circle className="st-focus opacity-0" r={40} fill="none" stroke="rgb(var(--rpg-text))" strokeWidth="3" strokeDasharray="6 5" />
      <circle className="st-ghost opacity-70" r={28} fill="rgb(var(--rpg-bg) / 0.6)" stroke={color} strokeWidth="2.5" strokeDasharray="6 5" />
      <Plus x={-14} y={-14} width={28} height={28} color={color} strokeWidth={2.6} aria-hidden />
    </g>
  );
}

const NodeView = memo(function NodeView({ n, selected, onPath, dim, matched, burst, onSelect }: { n: LaidNode; selected: boolean; onPath: boolean; dim: boolean; matched: boolean; burst: boolean; onSelect: (id: string) => void }) {
  const { s, pos } = n;
  const Icon = skillIcon(s.icon);
  const r = nodeR(s);
  const owned = s.level > 0;
  const maxed = owned && s.level >= s.maxLevel;
  const color = domainColor(s.domain);
  const proving = !!s.openProof;
  const status = maxed ? "nível máximo" : owned ? `nível ${s.level} de ${s.maxLevel} comprovado` : "ainda sem nível comprovado";
  return (
    <g
      transform={`translate(${pos.x} ${pos.y})`}
      className="group cursor-pointer outline-none [&:focus-visible_.st-focus]:opacity-100"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${s.path.join(" › ")}: ${status}${proving ? ", prova em andamento" : ""}`}
      opacity={dim ? 0.22 : 1}
      onClick={() => onSelect(s.id)}
      onKeyDown={onKey(() => onSelect(s.id))}
    >
      <title>{`${s.name} — ${status}`}</title>
      <circle className="st-focus opacity-0" r={r + 12} fill="none" stroke="rgb(var(--rpg-text))" strokeWidth="3" strokeDasharray="6 5" />
      {(selected || onPath || matched) && <circle r={r + 9} fill="none" stroke={selected ? "rgb(var(--rpg-gold-light))" : "rgb(var(--rpg-gold) / 0.7)"} strokeWidth={selected ? 4 : 2.5} filter="url(#st-glow)" />}
      {proving && <circle r={r + 6} fill="none" stroke="rgb(var(--rpg-gold))" strokeWidth="3" className="motion-safe:animate-pulse" />}
      {burst && <circle r={r} fill="none" stroke="rgb(var(--rpg-gold-light))" strokeWidth="6" className="motion-safe:animate-ping" style={{ transformOrigin: "center" }} />}
      <circle r={r} fill="rgb(var(--rpg-bg))" stroke={maxed ? "rgb(var(--rpg-gold))" : owned ? color : domainColor(s.domain, 0.55)} strokeWidth={maxed ? 5 : 3.5} filter={owned ? "url(#st-glow)" : undefined} />
      {owned && <circle r={r - 5} fill={color} opacity={maxed ? 0.55 : 0.18 + 0.32 * (s.level / s.maxLevel)} />}
      <Icon x={-r * 0.45} y={-r * 0.45} width={r * 0.9} height={r * 0.9} color={owned ? "rgb(var(--rpg-text))" : domainColor(s.domain, 0.8)} strokeWidth={2.3} aria-hidden />
      {proving && <ScrollText x={r * 0.45} y={-r - 6} width={18} height={18} color="rgb(var(--rpg-gold-light))" aria-hidden />}
      {/* Pontos de nível sob o nó. */}
      {Array.from({ length: s.maxLevel }, (_, i) => (
        <circle key={i} cx={(i - (s.maxLevel - 1) / 2) * 12} cy={r + 12} r="4" fill={i < s.level ? (maxed ? "rgb(var(--rpg-gold-light))" : color) : "rgb(var(--rpg-bg))"} stroke={i < s.level ? "none" : "rgb(var(--rpg-border))"} strokeWidth="1.3" />
      ))}
      {!selected && (
        <text y={r + 40} textAnchor="middle" className={`pointer-events-none text-[21px] font-semibold ${matched ? "fill-[rgb(var(--rpg-gold-light))]" : "fill-[rgb(var(--rpg-text))]"}`} style={{ paintOrder: "stroke", stroke: "rgb(var(--rpg-bg))", strokeWidth: 5 }}>
          {short(s.name)}
        </text>
      )}
    </g>
  );
});
