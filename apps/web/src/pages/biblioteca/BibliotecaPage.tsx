import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus, ScanLine, Star, X } from "lucide-react";
import { useBooks, useIsbnLookup } from "@/hooks/useBooks";
import { Button, Card, EmptyState, Field } from "@/components/ui/primitives";
import type { BookCreateInput } from "@/services/libraryService";
import type { BookLookupResult, BookStatus } from "@/types";

const STATUS_TABS: Array<{ value: BookStatus | "Todos"; label: string }> = [
  { value: "Todos", label: "Todos" },
  { value: "Quero Ler", label: "Quero Ler" },
  { value: "Lendo", label: "Lendo" },
  { value: "Pausado", label: "Pausado" },
  { value: "Concluído", label: "Concluído" },
  { value: "Abandonado", label: "Abandonado" },
];

export function BibliotecaPage() {
  const [statusFilter, setStatusFilter] = useState<BookStatus | "Todos">("Todos");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"none" | "isbn" | "manual">("none");

  const { books, isLoading, createBook } = useBooks({
    status: statusFilter === "Todos" ? undefined : statusFilter,
    search: search || undefined,
  });

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="font-display font-medium text-2xl">Biblioteca</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setModal("manual")}>
            <Plus size={15} /> Manual
          </Button>
          <Button onClick={() => setModal("isbn")}>
            <ScanLine size={15} /> Adicionar por ISBN
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                statusFilter === tab.value
                  ? "bg-signal border-signal text-ink font-semibold"
                  : "border-paper-border dark:border-ink-border text-slate"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título ou autor..."
          className="ml-auto rounded-lg px-3 py-2 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
      </div>

      {!isLoading && books.length === 0 && (
        <EmptyState
          title="Sua estante está vazia"
          description="Cadastre um livro pelo ISBN ou pelo título para começar a registrar sua leitura."
          ctaLabel="Adicionar por ISBN"
          onCta={() => setModal("isbn")}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {books.map((book) => (
          <Link key={book.id} to={`/biblioteca/${book.id}`}>
            <Card className="p-3 h-full flex flex-col hover:opacity-90 transition-opacity">
              <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 flex items-center justify-center bg-paper-border dark:bg-ink-border">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen size={24} className="text-slate" />
                )}
              </div>
              <p className="text-sm font-semibold leading-snug line-clamp-2">{book.title}</p>
              {book.author && <p className="text-xs text-slate mt-0.5 line-clamp-1">{book.author}</p>}
              <div className="mt-auto pt-2 flex items-center justify-between">
                <span className="text-[10px] rounded-full px-2 py-0.5 border border-paper-border dark:border-ink-border text-slate">
                  {book.status}
                </span>
                {book.rating && (
                  <span className="flex items-center gap-0.5 text-[10px] text-slate">
                    <Star size={10} className="fill-current" /> {book.rating}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {modal === "isbn" && (
        <IsbnModal onClose={() => setModal("none")} onCreate={createBook} />
      )}
      {modal === "manual" && (
        <ManualBookModal onClose={() => setModal("none")} onCreate={createBook} />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function IsbnModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: BookCreateInput) => Promise<unknown>;
}) {
  const [isbn, setIsbn] = useState("");
  const [preview, setPreview] = useState<BookLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lookup = useIsbnLookup();

  const handleSearch = async () => {
    setError(null);
    setPreview(null);
    try {
      const result = await lookup.mutateAsync(isbn);
      setPreview(result);
    } catch {
      setError("Nenhum livro encontrado para este ISBN. Verifique o número ou cadastre manualmente.");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    await onCreate({ ...preview, source: preview.source });
    onClose();
  };

  return (
    <ModalShell title="Adicionar por ISBN" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <input
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Ex: 9780132350884"
          className="flex-1 rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
        <Button onClick={handleSearch} disabled={lookup.isPending || !isbn.trim()}>
          {lookup.isPending ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      {error && <p className="text-xs text-drop mb-2">{error}</p>}

      {preview && (
        <div className="rounded-xl p-3 mb-3 flex gap-3 border border-paper-border dark:border-ink-border">
          <div className="w-14 h-20 shrink-0 rounded overflow-hidden bg-paper-border dark:bg-ink-border flex items-center justify-center">
            {preview.coverUrl ? (
              <img src={preview.coverUrl} alt={preview.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen size={18} className="text-slate" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{preview.title}</p>
            {preview.author && <p className="text-xs text-slate mt-0.5">{preview.author}</p>}
            {preview.publishedYear && <p className="text-xs text-slate">{preview.publishedYear}</p>}
          </div>
        </div>
      )}

      <Button onClick={handleConfirm} disabled={!preview} className="w-full">
        Adicionar à estante
      </Button>
    </ModalShell>
  );
}

function ManualBookModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { title: string; author?: string | null }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onCreate({ title: title.trim(), author: author.trim() || null });
    onClose();
  };

  return (
    <ModalShell title="Adicionar manualmente" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field label="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <Button onClick={handleSubmit} disabled={!title.trim()} className="w-full">
          Adicionar à estante
        </Button>
      </div>
    </ModalShell>
  );
}
