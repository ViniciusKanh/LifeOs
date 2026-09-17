import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LifeMapAreaId, LifeMapEdge, LifeMapNode } from "@/types";

/**
 * Mapa em grafo radial, desenhado à mão em SVG (sem biblioteca de
 * grafo) — combina melhor com o design system do LifeOS do que uma
 * lib genérica de força/física, e para um número pequeno e conhecido
 * de nós (1 centro + 6 áreas + até ~6 itens por área) um layout fixo
 * fica mais limpo e previsível do que uma simulação de física.
 *
 * Estrutura: "Você" no centro, áreas da vida no primeiro anel, e os
 * itens de cada área num pequeno arco no segundo anel, centrado no
 * ângulo da própria área.
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

const VIEW = 760;
const CENTER = VIEW / 2;
const RING_AREA = 190;
const RING_ITEM = 320;

interface Positioned extends LifeMapNode {
  x: number;
  y: number;
}

function layout(nodes: LifeMapNode[], visibleAreas: LifeMapAreaId[] | "all"): Positioned[] {
  const areaNodes = nodes.filter((n) => n.kind === "area" && (visibleAreas === "all" || visibleAreas.includes(n.area as LifeMapAreaId)));
  const areaCount = areaNodes.length || 1;
  const positioned: Positioned[] = [];

  const center = nodes.find((n) => n.kind === "center");
  if (center) positioned.push({ ...center, x: CENTER, y: CENTER });

  areaNodes.forEach((area, i) => {
    const angle = (i / areaCount) * Math.PI * 2 - Math.PI / 2;
    const x = CENTER + RING_AREA * Math.cos(angle);
    const y = CENTER + RING_AREA * Math.sin(angle);
    positioned.push({ ...area, x, y });

    const children = nodes.filter((n) => n.kind !== "area" && n.kind !== "center" && n.area === area.area);
    const spread = Math.min(children.length, 6);
    const arc = Math.min(Math.PI / 2.2, 0.22 * Math.max(1, spread - 1) + 0.18);
    children.forEach((child, ci) => {
      const t = spread === 1 ? 0 : ci / (spread - 1) - 0.5;
      const childAngle = angle + t * arc;
      positioned.push({
        ...child,
        x: CENTER + RING_ITEM * Math.cos(childAngle),
        y: CENTER + RING_ITEM * Math.sin(childAngle),
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
  onSelect: (id: string) => void;
  resetToken: number;
}) {
  const positioned = useMemo(() => layout(nodes, visibleAreas), [nodes, visibleAreas]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const visibleIds = useMemo(() => new Set(positioned.map((n) => n.id)), [positioned]);

  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  // Recentralizar quando o botão "Centralizar mapa" pedir —
  // resetToken muda a cada clique.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [resetToken]);

  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setView((v) => ({ ...v, scale: Math.min(2, Math.max(0.5, v.scale + delta)) }));
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, active: true };
  };
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY, active: true };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const stopDrag = () => {
    dragRef.current.active = false;
  };

  const nodeRadius = (n: Positioned) => (n.kind === "center" ? 34 : n.kind === "area" ? 26 : 15);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="w-full h-full select-none touch-none cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
    >
      <g transform={`translate(${view.tx} ${view.ty}) translate(${CENTER} ${CENTER}) scale(${view.scale}) translate(${-CENTER} ${-CENTER})`}>
        {/* Arestas — linhas finas; tracejadas quando cruzam área (habit_health) */}
        {edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b || !visibleIds.has(e.from) || !visibleIds.has(e.to)) return null;
          const color = a.area ? AREA_COLOR[a.area] : "#98A2B3";
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeOpacity={0.35}
              strokeWidth={1.4}
              strokeDasharray={e.kind === "habit_health" ? "3 4" : undefined}
            />
          );
        })}

        {/* Nós */}
        {positioned.map((n) => {
          const r = nodeRadius(n);
          const color = n.kind === "center" ? "#7C4DFF" : n.area ? AREA_COLOR[n.area] : "#98A2B3";
          const selected = selectedId === n.id;
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`} className="cursor-pointer" onClick={() => onSelect(n.id)}>
              {selected && <circle r={r + 6} fill={color} fillOpacity={0.18} />}
              <circle
                r={r}
                fill={n.kind === "area" || n.kind === "center" ? color : "white"}
                fillOpacity={n.kind === "area" || n.kind === "center" ? 0.16 : 1}
                stroke={color}
                strokeWidth={selected ? 2.5 : 1.6}
                className="dark:fill-[#15121F]"
              />
              <text
                textAnchor="middle"
                dy={r + 14}
                fontSize={n.kind === "center" ? 13 : n.kind === "area" ? 11.5 : 10}
                fontWeight={n.kind === "area" || n.kind === "center" ? 700 : 500}
                fill="currentColor"
                className="text-[#111936] dark:text-[#F2F0FA] pointer-events-none"
              >
                {truncateLabel(n.label, n.kind === "center" ? 20 : 16)}
              </text>
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
