import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus, Trash2 } from "lucide-react";
import { useBook, useBooks } from "@/hooks/useBooks";
import { Button, Card, Field } from "@/components/ui/primitives";
import type { BookStatus } from "@/types";

const STATUS_OPTIONS: BookStatus[] = ["Quero Ler", "Lendo", "Pausado", "Concluído", "Abandonado"];

export function LivroDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { book, notes, sessions, addNote, addSession } = useBook(id);
  const { updateBook, removeBook } = useBooks();

  const [noteContent, setNoteContent] = useState("");
  const [sessionPages, setSessionPages] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState("");

  if (!book) {
    return <div className="px-4 py-8 text-sm text-slate">Carregando...</div>;
  }

  const progressPct = book.total_pages ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100)) : 0;

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    await addNote({ content: noteContent.trim(), kind: "note" });
    setNoteContent("");
  };

  const handleAddSession = async () => {
    const pages = Number(sessionPages) || 0;
    const minutes = Number(sessionMinutes) || 0;
    if (!minutes) return;
    await addSession({ startedAt: new Date().toISOString(), durationMinutes: minutes, pagesRead: pages });
    setSessionPages("");
    setSessionMinutes("");
  };

  const handleDelete = async () => {
    if (!id) return;
    await removeBook(id);
    navigate("/biblioteca");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl mx-auto">
      <button onClick={() => navigate("/biblioteca")} className="flex items-center gap-1.5 text-xs text-slate mb-4">
        <ArrowLeft size={14} /> Voltar para a biblioteca
      </button>

      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="w-32 h-44 shrink-0 rounded-lg overflow-hidden mx-auto md:mx-0 flex items-center justify-center bg-paper-border dark:bg-ink-border">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen size={28} className="text-slate" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-medium text-2xl">{book.title}</p>
          {book.author && <p className="text-sm text-slate mt-1">{book.author}</p>}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <select
              value={book.status}
              onChange={(e) => updateBook({ id: book.id, patch: { status: e.target.value as BookStatus } })}
              className="text-xs rounded-lg px-3 py-2 bg-transparent border border-paper-border dark:border-ink-border"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button onClick={handleDelete} className="text-xs flex items-center gap-1 text-drop">
              <Trash2 size={13} /> Remover livro
            </button>
          </div>

          {book.total_pages ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate mb-1">
                <span>
                  {book.current_page} / {book.total_pages} páginas
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                <div className="h-full rounded-full bg-signal" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Registrar sessão de leitura</p>
          <div className="flex gap-2 mb-2">
            {/* flex-1 nos dois campos: sem isso o input encolhe ao mínimo
                em telas estreitas (~360-400px) e o par fica desproporcional */}
            <div className="flex-1 min-w-0">
              <Field
                label="Páginas lidas"
                type="number"
                value={sessionPages}
                onChange={(e) => setSessionPages(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Field
                label="Minutos"
                type="number"
                value={sessionMinutes}
                onChange={(e) => setSessionMinutes(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleAddSession} className="w-full">
            <Plus size={14} /> Registrar sessão
          </Button>

          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            {sessions.length === 0 && <p className="text-xs text-slate">Nenhuma sessão registrada ainda.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="text-xs flex items-center justify-between border-b border-paper-border dark:border-ink-border pb-1.5">
                <span className="text-slate">{new Date(s.started_at).toLocaleDateString("pt-BR")}</span>
                <span>
                  {s.pages_read} pág. · {s.duration_minutes ?? 0} min
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Notas e insights</p>
          <div className="flex gap-2 mb-3">
            <input
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Escreva uma nota, citação ou insight..."
              className="flex-1 rounded-lg px-3 py-2 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            />
            <Button onClick={handleAddNote}>
              <Plus size={14} />
            </Button>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {notes.length === 0 && <p className="text-xs text-slate">Nenhuma nota ainda.</p>}
            {notes.map((n) => (
              <div key={n.id} className="text-sm rounded-lg p-2.5 bg-paper dark:bg-ink border border-paper-border dark:border-ink-border">
                {n.content}
                {n.page && <span className="text-xs text-slate"> · p. {n.page}</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
