import { useState, type FormEvent } from "react";
import { Check, ChevronDown, Inbox as InboxIcon, Plus, Trash2 } from "lucide-react";
import { useInbox } from "@/hooks/useInbox";
import { useProjects } from "@/hooks/useProjects";
import { Button, Card, EmptyState, Field, PageHeader } from "@/components/ui/primitives";
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

/**
 * Notas rápidas / Inbox — tela onde os itens capturados (pelo botão
 * flutuante disponível em qualquer lugar do app, ou diretamente aqui)
 * são processados: cada um vira uma tarefa de verdade ou é descartado.
 * A captura em si nunca pede projeto/prioridade/prazo — só aqui, na
 * hora de processar, é que esses detalhes entram (se o usuário quiser).
 */
export function InboxPage() {
  const { items, isLoading, capture, isCapturing, process, remove } = useInbox();
  const [text, setText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCapture = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || isCapturing) return;
    await capture(content);
    setText("");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<InboxIcon size={20} />}
        title="Inbox"
        subtitle="Capture qualquer ideia sem pensar em projeto ou prioridade — decida o que fazer com cada item aqui, com calma."
      />

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
      </Card>

      {!isLoading && items.length === 0 ? (
        <EmptyState
          title="Inbox vazia"
          description="Tudo que você capturar (aqui ou pelo botão flutuante em qualquer tela) aparece nesta lista até ser processado."
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
  onDiscard: () => void;
  onDelete: () => void;
  onConvert: (input: { title: string; projectId: string | null; priority: "Baixa" | "Média" | "Alta"; dueDate: string | null }) => Promise<void>;
}) {
  const { projects } = useProjects();
  const [title, setTitle] = useState(item.content);
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<"Baixa" | "Média" | "Alta">("Média");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConvert = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onConvert({ title: title.trim(), projectId: projectId || null, priority, dueDate: dueDate || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-2.5">
        <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
          <p className="text-sm">{item.content}</p>
          <p className="text-[11px] text-slate mt-1">{formatRelativeTime(item.created_at)}</p>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggleExpand}
            aria-label="Virar tarefa"
            className={`rounded-lg p-1.5 border border-paper-border dark:border-ink-border transition-colors ${expanded ? "bg-brand-50 border-brand-500/40 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate hover:text-brand-600"}`}
          >
            <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button onClick={onDiscard} aria-label="Descartar" className="rounded-lg p-1.5 border border-paper-border dark:border-ink-border text-slate hover:text-growth">
            <Check size={15} />
          </button>
          <button onClick={onDelete} aria-label="Excluir" className="rounded-lg p-1.5 border border-paper-border dark:border-ink-border text-slate hover:text-drop">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
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
          <Button onClick={handleConvert} disabled={!title.trim() || saving} className="w-full">
            {saving ? "Criando..." : "Criar tarefa"}
          </Button>
        </div>
      )}
    </Card>
  );
}
