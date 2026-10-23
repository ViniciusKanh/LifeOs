import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, Quote, Search } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";
import { useQuotes } from "@/hooks/useReadingYear";
import type { QuoteItem, QuoteKind } from "@/services/readingYearService";
import type { Book } from "@/types";
import { Chip, InlineToast, SkeletonBlock, selectClass } from "@/components/grimorio/grimoireUi";
import { QuoteToCardModal, type QuoteForCard } from "@/components/grimorio/QuoteToCardModal";

const KIND_FILTERS: Array<{ value: "all" | QuoteKind; label: string }> = [
  { value: "all", label: "Citações e insights" },
  { value: "quote", label: "Só citações" },
  { value: "insight", label: "Só insights" },
];

/** Mural de citações/insights de todos os livros (book_notes), com filtro por livro, busca e "Virar cartão". */
export function QuoteWall({ books }: { books: Book[] }) {
  const [bookId, setBookId] = useState("");
  const [kind, setKind] = useState<"all" | QuoteKind>("all");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [toCard, setToCard] = useState<QuoteForCard | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  // Busca com pequeno atraso para não consultar a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(term), 300);
    return () => window.clearTimeout(t);
  }, [term]);

  const { data, isLoading, isError, refetch } = useQuotes({ bookId: bookId || undefined, q: q || undefined, kinds: kind === "all" ? undefined : [kind] });
  const quotes = data ?? [];
  const filtered = !!(bookId || q || kind !== "all");

  const open = (item: QuoteItem) => setToCard({ id: item.id, bookId: item.bookId, bookTitle: item.bookTitle, bookAuthor: item.bookAuthor, content: item.content, page: item.page });

  return (
    <section aria-labelledby="mural-citacoes" className="mt-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 mr-auto">
            <IconBadge tone="pink" size={30} icon={<Quote size={14} />} />
            <h2 id="mural-citacoes" className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>
              Mural de citações
            </h2>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" aria-hidden />
              <input
                type="search"
                aria-label="Buscar citações"
                placeholder="Buscar trecho, livro, autor…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className={`${selectClass} !py-2 pl-9`}
              />
            </div>
            <select aria-label="Filtrar por livro" className={`${selectClass} !py-2`} value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">Todos os livros</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <select aria-label="Tipo de nota" className={`${selectClass} !py-2`} value={kind} onChange={(e) => setKind(e.target.value as "all" | QuoteKind)}>
              {KIND_FILTERS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true" aria-label="Carregando citações">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="text-sm text-slate">
            Não foi possível carregar o mural.{" "}
            <button className="underline" onClick={() => void refetch()}>
              Tentar de novo
            </button>
          </p>
        ) : quotes.length === 0 ? (
          <p className="text-sm text-slate py-6 text-center">
            {filtered ? "Nenhuma citação encontrada com esses filtros." : "Ainda não há citações. Na página de um livro, registre uma nota do tipo “Citação” ou “Insight” para ela aparecer aqui."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {quotes.map((item) => (
              <li key={item.id}>
                <figure className="h-full flex flex-col rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink p-3.5 rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg-2/60">
                  <blockquote className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {item.kind === "quote" ? `“${item.content}”` : item.content}
                  </blockquote>
                  <figcaption className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate">
                    <Chip tone={item.kind === "quote" ? "pink" : "purple"}>{item.kind === "quote" ? "Citação" : item.kind === "insight" ? "Insight" : "Nota"}</Chip>
                    <Link to={`/biblioteca/${item.bookId}`} className="truncate max-w-[60%] hover:underline">
                      {item.bookTitle}
                      {item.page ? `, p. ${item.page}` : ""}
                    </Link>
                  </figcaption>
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    {item.cardCount > 0 ? <span className="text-[11px] text-growth rpg:text-rpg-green">Já é cartão{item.cardCount > 1 ? ` (${item.cardCount})` : ""}</span> : <span />}
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-400 rpg:rounded-[3px] rpg:text-rpg-gold-light rpg:hover:bg-rpg-gold/10"
                    >
                      <BookOpenText size={13} aria-hidden /> Virar cartão
                    </button>
                  </div>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <QuoteToCardModal quote={toCard} onClose={() => setToCard(null)} onDone={(text, tone = "success") => setToast({ text, tone })} />
      <InlineToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </section>
  );
}
