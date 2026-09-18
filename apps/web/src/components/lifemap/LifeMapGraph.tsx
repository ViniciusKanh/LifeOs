import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LifeMapAreaId, LifeMapEdge, LifeMapNode } from "@/types";

/**
 * Mapa em grafo, desenhado à mão em SVG (sem biblioteca de grafo) —
 * combina melhor com o design system do LifeOS do que uma lib
 * genérica de força/física, e para um número pequeno e conhecido de
 * nós (1 centro + áreas + até ~6 itens por área) um layout fixo fica
 * mais limpo e previsível do que uma simulação de física.
 *
 * Estrutura: "Você" no centro, áreas da vida num anel ao redor, e os
 * itens de cada área num pequeno "buquê" local ao redor do próprio nó
 * da área — não num anel global único, que é o que fazia os itens de
 * áreas diferentes colidirem entre si quando havia muitos nós.
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

const AREA_ICON: Record<LifeMapAreaId, string> = {
  metas: "🎯",
  projetos: "📁",
  habitos: "🔁",
  educacao: "🎓",
  leitura: "📚",
  saude: "❤️",
  profissional: "💼",
};

const KIND_ICON: Partial<Record<LifeMapNode["kind"], string>> = {
  goal: "◎",
  project: "▣",
  habit: "↻",
  education: "🎓",
  academic_project: "📄",
  book: "📖",
  health: "•",
};

const VIEW = 860;
const CENTER = VIEW / 2;
const RING_AREA = 250;
const CHILD_RING_RADII = [82, 118];
const MAX_CHILD_ARC = Math.PI * 0.92;

interface Positioned extends LifeMapNode {
  x: number;
  y: number;
  angle: number;
}

function layout(nodes: LifeMapNode[], visibleAreas: LifeMapAreaId[] | "all"): Positioned[] {
  const areaNodes = nodes.filter((n) => n.kind === "area" && (visibleAreas === "all" || visibleAreas.includes(n.area as LifeMapAreaId)));
  const areaCount = areaNodes.length || 1;
  const positioned: Positioned[] = [];

  const center = nodes.find((n) => n.kind === "center");
  if (center) positioned.push({ ...center, x: CENTER, y: CENTER, angle: 0 });

  areaNodes.forEach((area, i) => {
    const angle = (i / areaCount) * Math.PI * 2 - Math.PI / 2;
    const x = CENTER + RING_AREA * Math.cos(angle);
    const y = CENTER + RING_AREA * Math.sin(angle);
    positioned.push({ ...area, x, y, angle });

    const children = nodes.filter((n) => n.kind !== "area" && n.kind !== "center" && n.area === area.area);

    // Dois mini-anéis locais intercalados ao redor do próprio nó da
    // área — em vez de um anel global — para que itens de áreas
    // diferentes nunca colidam entre si, mesmo com o mapa cheio.
    const rings: LifeMapNode[][] = [[], []];
    children.forEach((child, ci) => rings[ci % 2].push(child));

    rings.forEach((ring, ringIdx) => {
      if (ring.length === 0) return;
      const radius = CHILD_RING_RADII[ringIdx];
      const arc = Math.min(MAX_CHILD_ARC, (Math.PI / 4.5) * Math.max(ring.length, 1));
      ring.forEach((child, ci) => {
        const t = ring.length === 1 ? 0 : ci / (ring.length - 1) - 0.5;
        const childAngle = angle + t * arc;
        positioned.push({
          ...child,
          x: x + radius * Math.cos(childAngle),
          y: y + radius * Math.sin(childAngle),
          angle: childAngle,
        });
      });
    });
  });

  return positioned;
}

export function LifeMapGraph({
  nodes,
  edges,
  visibleAreas,
  selectedId,
  onSelect,
  resetToken,
}: {
  nodes: LifeMapNode[];
  edges: LifeMapEdge[];
  visibleAreas: LifeMapAreaId[] | "all";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  resetToken: number;
}) {
  const positioned = useMemo(() => layout(nodes, visibleAreas), [nodes, visibleAreas]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const visibleIds = useMemo(() => new Set(positioned.map((n) => n.id)), [positioned]);

  const connectedToSelected = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>();
    for (const e of edges) {
      if (e.from === selectedId) set.add(e.to);
      if (e.to === selectedId) set.add(e.from);
    }
    return set;
  }, [edges, selectedId]);

  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; active: boolean; moved: boolean }>({ x: 0, y: 0, active: false, moved: false });

  // Recentralizar quando o botão "Centralizar mapa" pedir —
  // resetToken muda a cada clique.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [resetToken]);

  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setView((v) => ({ ...v, scale: Math.min(2.2, Math.max(0.45, v.scale + delta)) }));
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, active: true, moved: false };
  };
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const stopDrag = () => {
    dragRef.current.active = false;
  };

  // Clicar no fundo (fora de qualquer nó) sem ter arrastado limpa a
  // seleção — assim dá pra "desdestacar" as conexões sem precisar
  // clicar em outro nó.
  const handleBackgroundClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (dragRef.current.moved) return;
    if (e.target === e.currentTarget) onSelect(null);
  };

  const nodeRadius = (n: Positioned) => (n.kind === "center" ? 38 : n.kind === "area" ? 30 : 12);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="w-full h-full select-none touch-none cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
      onClick={handleBackgroundClick}
    >
      <g transform={`translate(${view.tx} ${view.ty}) translate(${CENTER} ${CENTER}) scale(${view.scale}) translate(${-CENTER} ${-CENTER})`}>
        {/* Arestas — apagadas por padrão; quando um nó está
            selecionado, só as conexões dele ficam em destaque, o
            resto quase some. Isso evita a "teia de aranha" quando o
            mapa tem muitos nós. */}
        {edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b || !visibleIds.has(e.from) || !visibleIds.has(e.to)) return null;
          // Cor vem da área envolvida (o nó central não tem área própria,
          // então herda a da ponta que tem — assim todo raio Você→área
          // já nasce colorido em vez de cinza neutro).
          const area = a.area ?? b.area;
          const color = area ? AREA_COLOR[area] : "#98A2B3";
          const isHub = e.kind === "hub";
          const isSelectedEdge = selectedId != null && (e.from === selectedId || e.to === selectedId);
          const isDimmed = selectedId != null && !isSelectedEdge;
          const dash = e.kind === "manual" ? "2 5" : e.kind === "habit_health" ? "4 4" : undefined;
          return (
            <line
              key={`${e.from}-${e.to}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeOpacity={isDimmed ? 0.05 : isSelectedEdge ? 0.9 : isHub ? 0.4 : 0.16}
              strokeWidth={isSelectedEdge ? 2.2 : isHub ? 1.6 : 1.2}
              strokeDasharray={dash}
              strokeLinecap="round"
            />
          );
        })}

        {/* Nós */}
        {positioned.map((n) => {
          const r = nodeRadius(n);
          const color = n.kind === "center" ? "#7C4DFF" : n.area ? AREA_COLOR[n.area] : "#98A2B3";
          const selected = selectedId === n.id;
          const isHub = n.kind === "area" || n.kind === "center";
          const related = connectedToSelected?.has(n.id) ?? false;
          const dimmed = selectedId != null && !selected && !related && !isHub;
          // Chip de item: rótulo ao lado do ponto, na direção pra fora
          // do centro (nunca "por baixo" apontando pro meio do mapa),
          // pra não empilhar texto em cima de outros nós.
          const labelSide = Math.cos(n.angle) >= 0 ? "right" : "left";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              className="cursor-pointer"
              opacity={dimmed ? 0.35 : 1}
              onClick={() => onSelect(n.id)}
            >
              {isHub && (
                <circle r={r + 10} fill={color} opacity={0.16} style={{ filter: "blur(7px)" }} />
              )}
              {selected && <circle r={r + 6} fill={color} fillOpacity={0.18} />}
              <circle
                r={r}
                fill={isHub ? color : "white"}
                fillOpacity={isHub ? 1 : 1}
                stroke={isHub ? "white" : color}
                strokeWidth={isHub ? 2 : selected ? 2.5 : 1.6}
                strokeOpacity={isHub ? 0.55 : 1}
                className={isHub ? "" : "dark:fill-[#15121F]"}
              />
              {isHub ? (
                <text textAnchor="middle" dy={n.kind === "center" ? 6 : 5} fontSize={n.kind === "center" ? 20 : 16} className="pointer-events-none">
                  {n.kind === "center" ? "🧑" : AREA_ICON[n.area as LifeMapAreaId]}
                </text>
              ) : (
                <text textAnchor="middle" dy={4} fontSize={10} fill={color} className="pointer-events-none">
                  {KIND_ICON[n.kind] ?? "•"}
                </text>
              )}
              {isHub ? (
                <text
                  textAnchor="middle"
                  dy={r + 16}
                  fontSize={n.kind === "center" ? 13.5 : 12}
                  fontWeight={700}
                  fill="currentColor"
                  className="text-[#111936] dark:text-[#F2F0FA] pointer-events-none"
                >
                  {truncateLabel(n.label, n.kind === "center" ? 20 : 18)}
                </text>
              ) : (
                <text
                  textAnchor={labelSide === "right" ? "start" : "end"}
                  x={labelSide === "right" ? r + 6 : -(r + 6)}
                  dy={3.5}
                  fontSize={10.5}
                  fontWeight={selected ? 700 : 500}
                  fill="currentColor"
                  className="text-[#111936] dark:text-[#F2F0FA] pointer-events-none"
                >
                  {truncateLabel(n.label, 16)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function truncateLabel(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
