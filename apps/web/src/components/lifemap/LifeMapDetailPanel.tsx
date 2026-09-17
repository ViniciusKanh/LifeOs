import { Link } from "react-router-dom";
import { ArrowUpRight, Info } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { LifeMapData, LifeMapNode } from "@/types";
import { AREA_COLOR } from "./LifeMapGraph";

const KIND_LABEL: Record<LifeMapNode["kind"], string> = {
  center: "Você",
  area: "Área da vida",
  goal: "Meta",
  project: "Projeto",
  habit: "Hábito",
  education: "Formação",
  academic_project: "Projeto acadêmico",
  book: "Livro",
  health: "Resumo de saúde",
};

function formatRelative(value: string | null) {
  if (!value) return null;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return null;
  const diffDays = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "há 1 dia";
  return `há ${diffDays} dias`;
}

/** Card "Detalhe do nó" — mostra o que foi clicado no grafo, ou uma dica quando nada foi selecionado ainda. */
export function LifeMapDetailPanel({ data, selectedId }: { data: LifeMapData; selectedId: string | null }) {
  const node = data.nodes.find((n) => n.id === selectedId) ?? null;

  if (!node || node.kind === "center") {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <Info size={15} className="text-slate" />
          <p className="text-sm font-semibold">Detalhe do nó</p>
        </div>
        <p className="text-xs text-slate">Clique em qualquer nó do mapa para ver nome, tipo, progresso e conexões aqui.</p>
      </Card>
    );
  }

  const connections = data.edges.filter((e) => e.from === node.id || e.to === node.id);
  const color = node.area ? AREA_COLOR[node.area] : "#7C4DFF";
  const relative = formatRelative(node.lastActivityAt);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <p className="text-sm font-semibold truncate">{node.label}</p>
      </div>
      <dl className="space-y-2 text-xs">
        <Row label="Tipo" value={KIND_LABEL[node.kind]} />
        {node.sublabel && <Row label="Descrição" value={node.sublabel} />}
        {node.progressPct != null && <Row label="Progresso" value={`${node.progressPct}%`} />}
        <Row label="Conexões" value={String(connections.length)} />
        {node.linkedCount > 0 && node.kind === "project" && <Row label="Tarefas" value={String(node.linkedCount)} />}
        {relative && <Row label="Última atividade" value={relative} />}
      </dl>
      {node.progressPct != null && (
        <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-3">
          <div className="h-full rounded-full" style={{ width: `${Math.min(node.progressPct, 100)}%`, background: color }} />
        </div>
      )}
      {node.openPath && (
        <Link
          to={node.openPath}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-2 hover:bg-paper dark:hover:bg-ink"
        >
          Abrir <ArrowUpRight size={13} />
        </Link>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="font-medium text-right truncate">{value}</dd>
    </div>
  );
}
