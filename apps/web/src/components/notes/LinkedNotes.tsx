import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, NotebookText, Plus } from "lucide-react";
import { useNotesLinkedTo } from "@/hooks/useLifeOs";
import { notesService } from "@/services/notesService";
import { NOTE_KIND } from "@/utils/lifeOsLabels";
import type { NoteLinkType } from "@/types";

/**
 * Notas ligadas a um item de outro módulo (projeto, meta, livro…): o
 * conhecimento deixa de ficar espalhado. "Nova nota" já nasce vinculada.
 */
export function LinkedNotes({ type, id, defaultTitle }: { type: NoteLinkType; id: string; defaultTitle?: string }) {
  const { data = [], isLoading, refetch } = useNotesLinkedTo(type, id);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const note = await notesService.create({ title: defaultTitle ? `Notas — ${defaultTitle}` : "Nova nota", kind: "nota" });
      await notesService.addLink(note.id, type, id);
      await refetch();
      navigate(`/notas?nota=${note.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-xl border border-paper-border dark:border-ink-border p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <NotebookText size={13} className="text-cat-pink" />
        <p className="text-[11px] font-semibold flex-1">Notas ligadas</p>
        <button onClick={create} disabled={creating} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 disabled:opacity-50">
          {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Nova nota
        </button>
      </div>
      {isLoading ? (
        <div className="h-5 rounded bg-black/[0.04] animate-pulse" />
      ) : data.length === 0 ? (
        <p className="text-[11px] text-slate">Nenhuma nota ligada ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {data.map((n) => (
            <li key={n.id}>
              <Link to={`/notas?nota=${n.id}`} className="inline-flex items-center gap-1 rounded-lg bg-cat-pink/10 text-cat-pink px-2 py-1 text-[11px] font-medium hover:underline">
                {NOTE_KIND[n.kind].emoji} {n.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProjectNotes({ projectId }: { projectId: string }) {
  return <LinkedNotes type="project" id={projectId} />;
}
