import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Info, Link2, Loader2, X } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import type { LifeMapData, LifeMapLinkableType, LifeMapNode } from "@/types";
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

// Kinds que correspondem a uma entidade real (podem ser origem/destino
// de um vínculo manual) — "area", "center" e "health" são agregados,
// não linhas do banco, então nunca entram aqui.
const LINKABLE_KINDS = new Set<LifeMapNode["kind"]>(["goal", "project", "habit", "education", "academic_project", "book"]);

function entityIdFromNodeId(nodeId: string): string {
  return nodeId.slice(nodeId.indexOf(":") + 1);
}

function formatRelative(value: string | null) {
  if (!value) return null;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return null;
  const diffDays = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "há 1 dia";
  return `há ${diffDays} dias`;
}

interface LifeMapDetailPanelProps {
  data: LifeMapData;
  selectedId: string | null;
  onCreateLink?: (input: { sourceType: LifeMapLinkableType; sourceId: string; targetType: LifeMapLinkableType; targetId: string }) => Promise<unknown>;
  onDeleteLink?: (linkId: string) => Promise<unknown>;
  isMutatingLink?: boolean;
}

/** Card "Detalhe do nó" — mostra o que foi clicado no grafo, permite criar/remover vínculos manuais, ou uma dica quando nada foi selecionado ainda. */
export function LifeMapDetailPanel({ data, selectedId, onCreateLink, onDeleteLink, isMutatingLink }: LifeMapDetailPanelProps) {
  const node = data.nodes.find((n) => n.id === selectedId) ?? null;
  const [targetId, setTargetId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const manualConnections = connections.filter((e) => e.kind === "manual" && e.linkId);
  const color = node.area ? AREA_COLOR[node.area] : "#7C4DFF";
  const relative = formatRelative(node.lastActivityAt);
  const canLink = LINKABLE_KINDS.has(node.kind) && !!onCreateLink;

  const candidates = canLink
    ? data.nodes.filter(
        (n) =>
          n.id !== node.id &&
          LINKABLE_KINDS.has(n.kind) &&
          !manualConnections.some((e) => e.from === n.id || e.to === n.id)
      )
    : [];

  const targetNode = candidates.find((n) => n.id === targetId) ?? null;

  async function handleConfirmLink() {
    if (!onCreateLink || !targetNode || !node) return;
    setError(null);
    try {
      await onCreateLink({
        sourceType: node.kind as LifeMapLinkableType,
        sourceId: entityIdFromNodeId(node.id),
        targetType: targetNode.kind as LifeMapLinkableType,
        targetId: entityIdFromNodeId(targetNode.id),
      });
      setConfirming(false);
      setTargetId("");
    } catch {
      setError("Não foi possível criar o vínculo. Tente novamente.");
    }
  }

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
          Ver no módulo <ArrowUpRight size={13} />
        </Link>
      )}

      {manualConnections.length > 0 && (
        <div className="mt-4 pt-4 border-t border-paper-border dark:border-ink-border">
          <p className="text-[11px] font-semibold text-slate mb-2">Vínculos manuais</p>
          <ul className="space-y-1.5">
            {manualConnections.map((e) => {
              const otherId = e.from === node.id ? e.to : e.from;
              const other = data.nodes.find((n) => n.id === otherId);
              if (!other) return null;
              return (
                <li key={e.linkId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{other.label}</span>
                  <button
                    onClick={() => e.linkId && onDeleteLink?.(e.linkId)}
                    disabled={isMutatingLink}
                    aria-label={`Remover vínculo com ${other.label}`}
                    className="text-slate hover:text-drop shrink-0 disabled:opacity-50"
                  >
                    <X size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canLink && (
        <div className="mt-4 pt-4 border-t border-paper-border dark:border-ink-border">
          <p className="text-[11px] font-semibold text-slate mb-2">Conectar a outro item</p>
          {!confirming ? (
            <div className="flex flex-col gap-2">
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="text-xs rounded-lg border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised px-2.5 py-2"
              >
                <option value="">Selecione um item…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {KIND_LABEL[c.kind]} — {c.label}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={() => setConfirming(true)} disabled={!targetId}>
                <Link2 size={13} /> Conectar
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-paper-border dark:border-ink-border p-3 space-y-2.5">
              <p className="text-xs">
                Confirma vincular <strong>{node.label}</strong> a <strong>{targetNode?.label}</strong>?
              </p>
              <div className="flex gap-2">
                <Button onClick={handleConfirmLink} disabled={isMutatingLink}>
                  {isMutatingLink ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Confirmar
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={isMutatingLink}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-[11px] text-drop mt-2">{error}</p>}
        </div>
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
