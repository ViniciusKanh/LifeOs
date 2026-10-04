import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, GitFork, List, Network, RefreshCcw } from "lucide-react";
import clsx from "clsx";
import { RPGPanel } from "@/components/rpg";
import { rpgColor } from "@/components/rpg/rpgAssets";
import type { DependencyGraph, GraphNode } from "@/services/bottlenecksService";
import { TYPE_UI } from "@/utils/bottleneckDisplay";

const W = 420;
const H = 236;
const NW = 124;
const NH = 38;
/** Posições fixas (cantos primeiro, como na referência) — layout estável, sem física. */
const SLOTS: Array<[number, number]> = [
  [72, 40], [348, 40], [72, 196], [348, 196], [210, 26], [210, 210], [64, 118], [356, 118],
];
const REL_LABEL: Record<GraphNode["relation"], string> = { center: "Gargalo", blocked: "depende dele", blocker: "precisa vir antes", belongs: "contém o item", affected: "afetada" };

function layout(graph: DependencyGraph) {
  const center = graph.nodes.find((n) => n.relation === "center");
  const rest = graph.nodes.filter((n) => n.relation !== "center");
  const placed = new Map<string, [number, number]>();
  if (center) placed.set(center.key, [W / 2, H / 2]);
  rest.slice(0, SLOTS.length).forEach((n, i) => placed.set(n.key, SLOTS[i]));
  return { center, placed, hidden: Math.max(0, rest.length - SLOTS.length) };
}

/** Ponto na borda do retângulo do nó (a seta termina na borda, não no centro). */
function edgePoint(from: [number, number], to: [number, number]): [number, number] {
  const dx = from[0] - to[0];
  const dy = from[1] - to[1];
  if (dx === 0 && dy === 0) return to;
  const t = Math.min(NW / 2 / Math.abs(dx || 1e-9), NH / 2 / Math.abs(dy || 1e-9));
  return [to[0] + dx * Math.min(1, t), to[1] + dy * Math.min(1, t)];
}

const short = (s: string, n = 17) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Grafo SVG das dependências REAIS (só arestas existentes no domínio), com alternativa em lista. */
export function GraphCanvas({ graph, large = false }: { graph: DependencyGraph; large?: boolean }) {
  const navigate = useNavigate();
  const { placed, hidden } = layout(graph);
  return (
    <div className={clsx("overflow-x-auto", large ? "" : "-mx-1")}>
      <svg viewBox={`0 0 ${W} ${H}`} className={clsx("w-full h-auto", large ? "min-w-[560px]" : "min-w-[360px]")} role="img" aria-label="Mapa de dependências do gargalo (lista equivalente disponível)">
        <defs>
          <marker id="bn-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={rpgColor("orange")} />
          </marker>
          <marker id="bn-arrow-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={rpgColor("cyan")} />
          </marker>
        </defs>
        {graph.edges.map((e) => {
          const a = placed.get(e.from);
          const b = placed.get(e.to);
          if (!a || !b) return null;
          const p1 = edgePoint(b, a);
          const p2 = edgePoint(a, b);
          return (
            <line
              key={`${e.from}>${e.to}`}
              x1={p1[0]}
              y1={p1[1]}
              x2={p2[0]}
              y2={p2[1]}
              stroke={rpgColor(e.kind === "depends" ? "orange" : "cyan")}
              strokeWidth={1.6}
              strokeDasharray={e.kind === "member" ? "4 3" : undefined}
              markerEnd={`url(#${e.kind === "depends" ? "bn-arrow" : "bn-arrow-m"})`}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const pos = placed.get(n.key);
          if (!pos) return null;
          const ui = TYPE_UI[n.type];
          const isCenter = n.relation === "center";
          const go = () => navigate(n.link);
          return (
            <g
              key={n.key}
              transform={`translate(${pos[0] - NW / 2}, ${pos[1] - NH / 2})`}
              role="link"
              tabIndex={0}
              aria-label={`${ui.label}: ${n.label} (${REL_LABEL[n.relation]})`}
              onClick={go}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go())}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3]"
            >
              <rect width={NW} height={NH} rx={3} fill={rpgColor(isCenter ? "bg" : "panel")} stroke={rpgColor(isCenter ? "red" : n.relation === "blocker" ? "orange" : "border")} strokeWidth={isCenter ? 2 : 1.2} />
              {isCenter && <rect x={2} y={2} width={NW - 4} height={NH - 4} rx={2} fill={rpgColor("red")} fillOpacity={0.14} />}
              <ui.icon x={6} y={NH / 2 - 9} width={18} height={18} color={rpgColor(isCenter ? "red" : ui.tone)} aria-hidden />
              <text x={29} y={16} fontSize={9.5} fill={rpgColor("text")} fontWeight={600}>
                {short(n.label)}
              </text>
              <text x={29} y={29} fontSize={8} fill={rpgColor("muted-text")}>
                {isCenter ? "(Gargalo)" : `${ui.label}${n.impact !== null ? ` · ${n.impact}%` : ""}`}
              </text>
            </g>
          );
        })}
      </svg>
      {hidden > 0 && <p className="text-[11px] text-rpg-muted mt-1">+{hidden} itens no mapa completo.</p>}
    </div>
  );
}

export function GraphList({ graph }: { graph: DependencyGraph }) {
  return (
    <ul className="space-y-1 text-sm">
      {graph.nodes
        .filter((n) => n.relation !== "center")
        .map((n) => (
          <li key={n.key} className="flex items-center gap-2 text-rpg-text">
            <span className="text-[11px] text-rpg-muted w-24 shrink-0">{REL_LABEL[n.relation]}</span>
            <span className="truncate">
              {TYPE_UI[n.type].label}: {n.label}
            </span>
          </li>
        ))}
    </ul>
  );
}

/** Painel do grafo: SVG por padrão (até 2 níveis), lista textual e "Ver mapa". */
export function BottleneckDependencyGraph({ graph, onOpenMap }: { graph: DependencyGraph; onOpenMap: () => void }) {
  const [asList, setAsList] = useState(false);
  const empty = graph.nodes.filter((n) => n.relation !== "center").length === 0;
  return (
    <RPGPanel
      title="Dependências afetadas"
      icon={<Network size={15} />}
      variant="gold"
      className="h-full"
      actions={
        !empty && (
          <span className="flex items-center gap-3">
            <button type="button" className="inline-flex items-center gap-1 text-xs text-rpg-muted hover:text-rpg-text" onClick={() => setAsList((v) => !v)} aria-pressed={asList}>
              {asList ? <GitFork size={13} aria-hidden /> : <List size={13} aria-hidden />} {asList ? "Mapa" : "Lista"}
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-rpg-green hover:underline" onClick={onOpenMap}>
              Ver mapa <ArrowRight size={13} aria-hidden />
            </button>
          </span>
        )
      }
    >
      {empty ? (
        <p className="text-sm text-rpg-muted">Nenhuma dependência registrada para este item. Vínculos só aparecem quando existem de verdade (dependências entre tarefas, projetos, campanhas e metas).</p>
      ) : asList ? (
        <GraphList graph={graph} />
      ) : (
        <GraphCanvas graph={graph} />
      )}
      {graph.cycles.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rpg-red" role="status">
          <RefreshCcw size={13} className="shrink-0 mt-0.5" aria-hidden /> Dependência circular detectada: {graph.cycles.map((c) => c.join(" ↔ ")).join("; ")}.
        </p>
      )}
      <p className="mt-2 flex flex-wrap gap-3 text-[10px] text-rpg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-rpg-orange" aria-hidden /> dependência
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-rpg-cyan" aria-hidden /> pertence a
        </span>
      </p>
    </RPGPanel>
  );
}
