import { useState } from "react";
import { BookOpen, Check, Plus, Sparkles } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { RPG_SECTION_TITLE } from "@/components/rpg/rpgAssets";
import { useBookRecommendations } from "@/hooks/useBooks";
import { errorMessage, InlineToast, SkeletonBlock } from "@/components/grimorio/grimoireUi";
import type { BookCreateInput, BookRecommendation } from "@/services/libraryService";

/**
 * Recomendações de livros derivadas do histórico real de leitura do usuário
 * (autor dos livros que ele mesmo concluiu e avaliou com 4-5 estrelas).
 * Nunca é uma lista editorial genérica — se não houver dados suficientes,
 * o próprio backend informa isso (hasEnoughData: false) em vez de inventar.
 */
export function BookRecommendations({ onAdd }: { onAdd: (input: BookCreateInput) => Promise<unknown> }) {
  const { data, isLoading, isError } = useBookRecommendations();
  const [addedIsbns, setAddedIsbns] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const recKey = (rec: BookRecommendation) => rec.isbn ?? rec.title;

  const handleAdd = async (rec: BookRecommendation) => {
    const key = recKey(rec);
    setPendingKey(key);
    try {
      await onAdd({
        title: rec.title,
        isbn: rec.isbn,
        author: rec.author,
        publisher: rec.publisher,
        coverUrl: rec.coverUrl,
        publishedYear: rec.publishedYear,
        totalPages: rec.totalPages,
        categories: rec.categories,
        description: rec.description,
        status: "Quero Ler",
        source: "google_books",
      });
      setAddedIsbns((prev) => new Set(prev).add(key));
      setToast({ text: `"${rec.title}" adicionado à sua estante.`, tone: "success" });
    } catch (err) {
      setToast({ text: errorMessage(err, "Não foi possível adicionar o livro."), tone: "error" });
    } finally {
      setPendingKey(null);
    }
  };

  // Sem dados suficientes, ainda sem erro, ou nada pra mostrar: nada de UI além de uma mensagem curta —
  // não vale ocupar a tela da Biblioteca com um card vazio chamativo.
  if (isError) return null;

  return (
    <section aria-labelledby="recomendado-pra-voce" className="mt-6">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <IconBadge tone="pink" size={30} icon={<Sparkles size={14} />} />
          <h2 id="recomendado-pra-voce" className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>
            Recomendado pra você
          </h2>
        </div>

        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-1" aria-busy="true" aria-label="Carregando recomendações">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-48 w-32 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : !data?.hasEnoughData ? (
          <p className="text-xs text-slate">
            Avalie pelo menos 3 livros concluídos (4★ ou mais) para receber recomendações baseadas no seu gosto de leitura real.
          </p>
        ) : data.recommendations.length === 0 ? (
          <p className="text-xs text-slate">Não encontramos títulos novos dos seus autores favoritos no momento.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {data.recommendations.map((rec) => {
              const key = recKey(rec);
              const added = addedIsbns.has(key);
              return (
                <div
                  key={key}
                  className="w-32 shrink-0 flex flex-col rounded-xl border border-paper-border dark:border-ink-border bg-paper dark:bg-ink p-2 rpg:border-2 rpg:border-rpg-border rpg:bg-rpg-panel"
                >
                  <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 flex items-center justify-center bg-gradient-to-br from-cat-pink/10 to-brand-500/10">
                    {rec.coverUrl ? (
                      <img src={rec.coverUrl} alt={rec.title} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen size={20} className="text-slate" />
                    )}
                  </div>
                  <p className="text-xs font-semibold leading-snug line-clamp-2">{rec.title}</p>
                  {rec.author && <p className="text-[10px] text-slate mt-0.5 line-clamp-1">{rec.author}</p>}
                  <p className="text-[10px] text-slate mt-1.5 line-clamp-2 italic">{rec.reason}</p>
                  <button
                    onClick={() => handleAdd(rec)}
                    disabled={added || pendingKey === key}
                    className={`mt-auto pt-2 flex items-center justify-center gap-1 text-[10px] font-semibold rounded-lg px-2 py-1.5 transition-colors ${
                      added
                        ? "text-growth bg-growth/10 cursor-default"
                        : "text-brand-700 dark:text-brand-200 bg-brand-50 dark:bg-brand-700/20 hover:bg-brand-100 dark:hover:bg-brand-700/30 disabled:opacity-60"
                    }`}
                  >
                    {added ? (
                      <>
                        <Check size={11} /> Na estante
                      </>
                    ) : (
                      <>
                        <Plus size={11} /> {pendingKey === key ? "Adicionando…" : "Adicionar"}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <InlineToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </section>
  );
}
