import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Plus,
  ScanLine,
  Star,
  X,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  CheckCircle2,
  BookMarked,
  Bookmark,
} from "lucide-react";
import { useBooks, useIsbnLookup } from "@/hooks/useBooks";
import { Button, Card, EmptyState, Field, IconBadge, PageHeader } from "@/components/ui/primitives";
import type { BookCreateInput } from "@/services/libraryService";
import type { Book, BookLookupResult, BookStatus } from "@/types";

const STATUS_TABS: Array<{ value: BookStatus | "Todos"; label: string }> = [
  { value: "Todos", label: "Todos" },
  { value: "Quero Ler", label: "Quero Ler" },
  { value: "Lendo", label: "Lendo" },
  { value: "Pausado", label: "Pausado" },
  { value: "Concluído", label: "Concluído" },
  { value: "Abandonado", label: "Abandonado" },
];

type SortKey = "recentes" | "titulo" | "avaliacao";
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recentes", label: "Mais recentes" },
  { value: "titulo", label: "Título (A-Z)" },
  { value: "avaliacao", label: "Melhor avaliados" },
];

function sortBooks(books: Book[], sort: SortKey) {
  const arr = [...books];
  if (sort === "titulo") return arr.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "avaliacao") return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function progressPct(book: Book) {
  if (!book.total_pages || book.total_pages <= 0) return null;
  return Math.min(100, Math.round((book.current_page / book.total_pages) * 100));
}

function formatRelative(value: string) {
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoje, ${time}`;
  if (isYesterday) return `Ontem, ${time}`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + `, ${time}`;
}

// Linha do tempo de atividade real: derivada dos próprios registros de
// cada livro (quando foi adicionado, começou a ler ou terminou) — nunca
// um evento inventado. Um mesmo livro pode gerar mais de um evento.
function buildActivity(books: Book[]) {
  type Event = { key: string; at: string; label: string; icon: typeof BookOpen; tone: string };
  const events: Event[] = [];
  for (const b of books) {
    events.push({ key: `${b.id}-add`, at: b.created_at, label: `Você adicionou ${b.title} à biblioteca`, icon: BookMarked, tone: "text-brand-600 dark:text-brand-500" });
    if (b.started_at) {
      events.push({ key: `${b.id}-start`, at: b.started_at, label: `Você começou a ler ${b.title}`, icon: BookOpen, tone: "text-signal-deep" });
    }
    if (b.finished_at) {
      events.push({ key: `${b.id}-done`, at: b.finished_at, label: `Você concluiu ${b.title}`, icon: CheckCircle2, tone: "text-growth" });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
}

export function BibliotecaPage() {
  const [statusFilter, setStatusFilter] = useState<BookStatus | "Todos">("Todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recentes");
  const [view, setView] = useState<"grade" | "lista">("grade");
  const [modal, setModal] = useState<"none" | "isbn" | "manual">("none");

  const { books, isLoading, createBook } = useBooks({
    status: statusFilter === "Todos" ? undefined : statusFilter,
    search: search || undefined,
  });

  // Sem filtro nenhum — alimenta os cartões da lateral (leitura atual,
  // estatísticas e atividade), que devem refletir a biblioteca inteira
  // e não a lista filtrada/pesquisada ao lado.
  const { books: allBooks } = useBooks();

  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);

  const currentlyReading = useMemo(() => {
    const reading = allBooks.filter((b) => b.status === "Lendo");
    if (reading.length === 0) return null;
    return [...reading].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }, [allBooks]);

  const stats = useMemo(
    () => ({
      total: allBooks.length,
      lendo: allBooks.filter((b) => b.status === "Lendo").length,
      queroLer: allBooks.filter((b) => b.status === "Quero Ler").length,
      concluido: allBooks.filter((b) => b.status === "Concluído").length,
    }),
    [allBooks]
  );

  const activity = useMemo(() => buildActivity(allBooks), [allBooks]);
  const readingProgress = currentlyReading ? progressPct(currentlyReading) : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<BookOpen size={20} />}
        title="Biblioteca"
        subtitle="Seus livros, ideias e aprendizados em um só lugar."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal("manual")}>
              <Plus size={15} /> Manual
            </Button>
            <Button onClick={() => setModal("isbn")}>
              <ScanLine size={15} /> Adicionar por ISBN
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`text-xs rounded-full px-3 py-1.5 border font-semibold transition-colors ${
                    statusFilter === tab.value
                      ? "bg-signal border-signal text-white"
                      : "border-paper-border dark:border-ink-border text-slate bg-paper-raised dark:bg-ink-raised"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, autor ou assunto..."
                className="w-full rounded-xl pl-8 pr-3 py-2 text-xs bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
            </div>

            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none rounded-xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised pl-3 pr-8 py-2 text-xs font-medium"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
            </div>

            <div className="flex items-center rounded-xl border border-paper-border dark:border-ink-border p-1 bg-paper-raised dark:bg-ink-raised">
              <button
                onClick={() => setView("grade")}
                className={`rounded-lg p-1.5 ${view === "grade" ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate"}`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setView("lista")}
                className={`rounded-lg p-1.5 ${view === "lista" ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "text-slate"}`}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate mb-3">
            {sorted.length} {sorted.length === 1 ? "livro" : "livros"} na sua biblioteca
          </p>

          {!isLoading && sorted.length === 0 && (
            <EmptyState
              title="Sua estante está vazia"
              description="Cadastre um livro pelo ISBN ou pelo título para começar a registrar sua leitura."
              ctaLabel="Adicionar por ISBN"
              onCta={() => setModal("isbn")}
            />
          )}

          {view === "grade" ? (
            // Mobile-first: 2 colunas em telas pequenas, escalando até 5 em
            // telas grandes — evita cartões espremidos ou scroll horizontal.
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {sorted.map((book) => {
                const pct = progressPct(book);
                return (
                  <Link key={book.id} to={`/biblioteca/${book.id}`}>
                    <Card className="p-3 h-full flex flex-col hover:border-brand-500/50 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                      <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 flex items-center justify-center bg-gradient-to-br from-brand-500/10 to-signal/10 dark:from-brand-500/15 dark:to-signal/15">
                        {book.cover_url ? (
                          <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <BookOpen size={24} className="text-slate" />
                        )}
                      </div>
                      <p className="text-sm font-semibold leading-snug line-clamp-2">{book.title}</p>
                      {book.author && <p className="text-xs text-slate mt-0.5 line-clamp-1">{book.author}</p>}

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-2 self-start ${
                          book.status === "Lendo"
                            ? "bg-growth/10 text-growth"
                            : book.status === "Concluído"
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                            : book.status === "Pausado"
                            ? "bg-signal/15 text-signal-deep"
                            : book.status === "Abandonado"
                            ? "bg-drop/10 text-drop"
                            : "bg-cat-blue/10 text-cat-blue"
                        }`}
                      >
                        {book.status}
                      </span>

                      {pct !== null && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                            <div className={`h-full rounded-full ${book.status === "Concluído" ? "bg-growth" : "bg-signal"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate shrink-0">{pct}%</span>
                        </div>
                      )}

                      <div className="mt-auto pt-2 flex items-center justify-between">
                        {pct !== null && book.total_pages && (
                          <span className="text-[10px] text-slate">Capítulo {book.current_page} de {book.total_pages}</span>
                        )}
                        {book.rating && (
                          <span className="flex items-center gap-0.5 text-[10px] text-slate ml-auto">
                            <Star size={10} className="fill-current text-signal-deep" /> {book.rating}
                          </span>
                        )}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((book) => {
                const pct = progressPct(book);
                return (
                  <Link key={book.id} to={`/biblioteca/${book.id}`}>
                    <Card className="p-3 flex items-center gap-3 hover:border-brand-500/50 transition-colors">
                      <div className="w-11 h-16 shrink-0 rounded overflow-hidden flex items-center justify-center bg-paper dark:bg-ink">
                        {book.cover_url ? (
                          <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <BookOpen size={16} className="text-slate" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{book.title}</p>
                        {book.author && <p className="text-xs text-slate truncate">{book.author}</p>}
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-paper dark:bg-ink text-slate">{book.status}</span>
                      {pct !== null && <span className="text-[11px] text-slate shrink-0 w-9 text-right">{pct}%</span>}
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconBadge tone="teal" size={30} icon={<BookOpen size={14} />} />
                <p className="text-sm font-semibold">Leitura atual</p>
              </div>
            </div>
            {!currentlyReading ? (
              <p className="text-xs text-slate">Nenhum livro em andamento — marque um como "Lendo" para acompanhar aqui.</p>
            ) : (
              <div className="flex gap-3">
                <div className="w-14 h-20 shrink-0 rounded-lg overflow-hidden flex items-center justify-center bg-paper dark:bg-ink">
                  {currentlyReading.cover_url ? (
                    <img src={currentlyReading.cover_url} alt={currentlyReading.title} className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen size={18} className="text-slate" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">{currentlyReading.title}</p>
                  {currentlyReading.author && <p className="text-xs text-slate mt-0.5 line-clamp-1">{currentlyReading.author}</p>}
                  {readingProgress !== null && currentlyReading.total_pages && (
                    <>
                      <p className="text-[11px] text-slate mt-1.5">Página {currentlyReading.current_page} de {currentlyReading.total_pages}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                          <div className="h-full rounded-full bg-growth" style={{ width: `${readingProgress}%` }} />
                        </div>
                        <span className="text-[10px] text-slate shrink-0">{readingProgress}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {currentlyReading && (
              <Link to={`/biblioteca/${currentlyReading.id}`} className="block mt-3">
                <Button className="w-full">Continuar lendo</Button>
              </Link>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Minha biblioteca</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl p-2.5 bg-cat-blue/10">
                <p className="font-display font-semibold text-lg text-cat-blue">{stats.total}</p>
                <p className="text-[11px] text-slate">Livros no total</p>
              </div>
              <div className="rounded-xl p-2.5 bg-growth/10">
                <p className="font-display font-semibold text-lg text-growth">{stats.lendo}</p>
                <p className="text-[11px] text-slate">Lendo</p>
              </div>
              <div className="rounded-xl p-2.5 bg-signal/10">
                <p className="font-display font-semibold text-lg text-signal-deep">{stats.queroLer}</p>
                <p className="text-[11px] text-slate">Quero ler</p>
              </div>
              <div className="rounded-xl p-2.5 bg-brand-500/10">
                <p className="font-display font-semibold text-lg text-brand-600 dark:text-brand-400">{stats.concluido}</p>
                <p className="text-[11px] text-slate">Concluído</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconBadge tone="purple" size={30} icon={<Bookmark size={14} />} />
              <p className="text-sm font-semibold">Atividade recente</p>
            </div>
            {activity.length === 0 ? (
              <p className="text-xs text-slate">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div className="space-y-2.5">
                {activity.map((ev) => {
                  const Icon = ev.icon;
                  return (
                    <div key={ev.key} className="flex items-start gap-2">
                      <Icon size={13} className={`mt-0.5 shrink-0 ${ev.tone}`} />
                      <div className="min-w-0">
                        <p className="text-[11px] leading-snug">{ev.label}</p>
                        <p className="text-[10px] text-slate">{formatRelative(ev.at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {modal === "isbn" && <IsbnModal onClose={() => setModal("none")} onCreate={createBook} />}
      {modal === "manual" && <ManualBookModal onClose={() => setModal("none")} onCreate={createBook} />}
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
          className="flex-1 rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
        <Button onClick={handleSearch} disabled={lookup.isPending || !isbn.trim()}>
          {lookup.isPending ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      {error && <p className="text-xs text-drop mb-2">{error}</p>}

      {preview && (
        <div className="rounded-xl p-3 mb-3 flex gap-3 border border-paper-border dark:border-ink-border">
          <div className="w-14 h-20 shrink-0 rounded overflow-hidden bg-paper dark:bg-ink flex items-center justify-center">
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
