import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Inbox as InboxIcon, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useInbox } from "@/hooks/useInbox";
import { useProjects } from "@/hooks/useProjects";
import { ApiError } from "@/services/api";
import { Button, Card, EmptyState, Field, IconBadge, PageHeader } from "@/components/ui/primitives";
import type { InboxItem } from "@/services/inboxService";

function formatRelativeTime(value: string) {
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `há ${diffD}d`;
}

// Erros de gateway/timeout (comuns em cold start de função serverless
// ou banco pausado) merecem uma mensagem diferente de um erro de
// validação — o usuário não fez nada errado, vale a pena tentar de novo.
function friendlyErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && (err.status === 502 || err.status === 503 || err.status === 504)) {
    return "O servidor demorou para responder. Aguarde alguns segundos e tente novamente.";
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * Notas rápidas / Inbox — tela onde os itens capturados (pelo botão
 * flutuante disponível em qualquer lugar do app, ou diretamente aqui)
 * são processados: cada um vira uma tarefa de verdade ou é descartado.
 * A captura em si nunca pede projeto/prioridade/prazo — só aqui, na
 * hora de processar, é que esses detalhes entram (se o usuário quiser).
 */
export function InboxPage() {
  const [showProcessed, setShowProcessed] = useState(false);
  const { items, stats, isLoading, isError, refetch, capture, isCapturing, process, remove } = useInbox(showProcessed);
  const [text, setText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleCapture = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || isCapturing) return;
    setCaptureError(null);
    try {
      await capture(content);
      setText("");
    } catch (err) {
      setCaptureError(friendlyErrorMessage(err, "Não foi possível capturar agora. Tente de novo."));
    }
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<InboxIcon size={20} />}
        title="Inbox"
        subtitle="Capture qualquer ideia sem pensar em projeto ou prioridade — decida o que fazer com cada item aqui, com calma."
      />

      {isError && (
        <Card className="p-4 mb-5 border-drop/40 bg-drop/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-drop shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Não foi possível carregar o Inbox agora</p>
              <p className="text-xs text-slate mt-0.5">
                O servidor demorou para responder (comum logo após uma implantação nova). Tente novamente em alguns segundos.
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 shrink-0 hover:bg-paper dark:hover:bg-ink"
            >
              <RefreshCw size={13} /> Tentar de novo
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5">
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="amber" size={30} icon={<Sparkles size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Pendentes</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{stats.pending}</p>
          </div>
        </Card>
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="green" size={30} icon={<CheckCircle2 size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Processados (7d)</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{stats.processedLast7d}</p>
          </div>
        </Card>
        <Card className="p-3 sm:p-3.5 flex items-center gap-2.5">
          <IconBadge tone="blue" size={30} icon={<InboxIcon size={14} />} />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate leading-tight">Capturados (7d)</p>
            <p className="font-display font-semibold text-sm sm:text-base leading-tight">{stats.capturedLast7d}</p>
          </div>
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <form onSubmit={handleCapture} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma ideia, lembrete ou tarefa solta..."
            className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
          />
          <Button type="submit" disabled={!text.trim() || isCapturing}>
            <Plus size={15} /> Capturar
          </Button>
        </form>
        {captureError && <p className="text-xs text-drop mt-2">{captureError}</p>}
      </Card>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate">
          {showProcessed ? "Todos os itens, incluindo já processados" : "Só os pendentes"}
        </p>
        <button
          onClick={() => setShowProcessed((v) => !v)}
          className="text-xs font-semibold text-brand-600 dark:text-brand-500"
        >
          {showProcessed ? "Mostrar só pendentes" : "Mostrar histórico completo"}
        </button>
      </div>

      {!isLoading && items.length === 0 ? (
        <EmptyState
          title={showProcessed ? "Nada por aqui ainda" : "Inbox vazia"}
          description="Tudo que você capturar (aqui ou pelo botão flutuante em qualquer tela) aparece nesta lista até ser processado — e continua visível no histórico completo depois disso."
          ctaLabel="Capturar algo"
          onCta={() => document.querySelector<HTMLInputElement>("input[placeholder^='Escreva uma ideia']")?.focus()}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onDiscard={() => process({ id: item.id, input: { action: "discard" } })}
              onDelete={() => remove(item.id)}
              onConvert={async (input) => {
                await process({ id: item.id, input: { action: "task", ...input } });
                setExpandedId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InboxRow({
  item,
  expanded,
  onToggleExpand,
  onDiscard,
  onDelete,
  onConvert,
}: {
  item: InboxItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onDiscard: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onConvert: (input: { title: string; projectId: string | null; priority: "Baixa" | "Média" | "Alta"; dueDate: string | null }) => Promise<void>;
}) {
  const { projects } = useProjects();
  const [title, setTitle] = useState(item.content);
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<"Baixa" | "Média" | "Alta">("Média");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<"discard" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isProcessed = !!item.processed_at;

  const handleConvert = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onConvert({ title: title.trim(), projectId: projectId || null, priority, dueDate: dueDate || null });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Não foi possível criar a tarefa."));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (kind: "discard" | "delete", fn: () => Promise<unknown>) => {
    setAction(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(friendlyErrorMessage(err, kind === "discard" ? "Não foi possível descartar o item." : "Não foi possível excluir o item."));
    } finally {
      setAction(null);
    }
  };

  return (
    <Card className={`p-3.5 ${isProcessed ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-2.5">
        <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left" disabled={isProcessed}>
          <p className={`text-sm ${isProcessed ? "line-through text-slate" : ""}`}>{item.content}</p>
          <p className="text-[11px] text-slate mt-1">
            {formatRelativeTime(item.created_at)}
            {isProcessed && " · processado"}
          </p>
        </button>
        {isProcessed ? (
          <button
            onClick={() => runAction("delete", onDelete)}
            aria-label="Excluir"
            disabled={action !== null}
            className="rounded-lg p-1.5 border border-paper-border dark:border-ink-border text-slate hover:text-drop shrink-0 disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggleExpand}
            aria-label="Virar tarefa"
            className={`rounded-lg p-1.5 border border-paper-border dark:border-ink-border transition-colors ${expanded ? "bg-brand-50 border-brand-500/40 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate hover:text-brand-600"}`}
          >
            <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => runAction("discard", onDiscard)}
            aria-label="Descartar"
            disabled={action !== null}
            className="rounded-lg p-1.5 border border-paper-border dark:border-ink-border text-slate hover:text-growth disabled:opacity-50"
          >
            <Check size={15} />
          </button>
          <button
            onClick={() => runAction("delete", onDelete)}
            aria-label="Excluir"
            disabled={action !== null}
            className="rounded-lg p-1.5 border border-paper-border dark:border-ink-border text-slate hover:text-drop disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
        )}
      </div>

      {expanded && !isProcessed && (
        <div className="mt-3.5 pt-3.5 border-t border-paper-border dark:border-ink-border space-y-2.5">
          <Field label="Título da tarefa" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs text-slate">Projeto (opcional)</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="">Nenhum</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "Baixa" | "Média" | "Alta")}
                className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border"
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
            <Field label="Prazo" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <Button onClick={handleConvert} disabled={!title.trim() || saving || action !== null} className="w-full">
            {saving ? "Criando..." : "Criar tarefa"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-drop mt-2">{error}</p>}
    </Card>
  );
}
