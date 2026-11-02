import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, BookOpenText, Layers, Plus, Search, Wand2 } from "lucide-react";
import clsx from "clsx";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useTheme } from "@/hooks/useTheme";
import { useGrimoireDecks, useGrimoireMutations, useGrimoireQueue, useGrimoireStats } from "@/hooks/useGrimoire";
import type { DeckInput, GrimoireDeck } from "@/services/grimoireService";
import { AIGeneratorModal } from "@/components/grimorio/AIGeneratorModal";
import { DeckCardsPanel } from "@/components/grimorio/DeckCardsPanel";
import { DeckFormModal } from "@/components/grimorio/DeckFormModal";
import { GrimoireStatsPanel } from "@/components/grimorio/GrimoireStatsPanel";
import { StudySession } from "@/components/grimorio/StudySession";
import { InlineToast, SkeletonBlock, errorMessage, selectClass } from "@/components/grimorio/grimoireUi";
import { GrimoireDeckTome, GrimoireRitualHero, masteryOf } from "@/components/grimorio/grimoireTomes";

type Tab = "baralhos" | "estatisticas";
type Study = { deckId?: string; cards: NonNullable<ReturnType<typeof useGrimoireQueue>["data"]>["cards"] };

/**
 * Grimório de Memorização — repetição espaçada (SM-2). A fila do dia, o
 * agendamento e as estatísticas vêm do servidor (fuso do usuário). Aceita
 * atalhos por URL: ?disciplina=&curso=&nome= (vindo da Educação),
 * ?baralho= (abre um baralho) e ?livro= (gerar cartões das notas do livro).
 */
export function GrimorioPage() {
  const { isRpg } = useTheme();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("baralhos");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("baralho"));
  const [form, setForm] = useState<{ open: boolean; deck: GrimoireDeck | null; prefill?: Partial<DeckInput> }>({ open: false, deck: null });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBookId, setAiBookId] = useState<string | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [confirmDeck, setConfirmDeck] = useState<GrimoireDeck | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"fila" | "dominio" | "nome" | "recentes">("fila");
  const panelRef = useRef<HTMLDivElement>(null);

  const decksQ = useGrimoireDecks({ archived: showArchived });
  const queueQ = useGrimoireQueue();
  const statsQ = useGrimoireStats();
  const { createDeck, updateDeck, deleteDeck, review } = useGrimoireMutations();

  const decks = useMemo(() => decksQ.data ?? [], [decksQ.data]);
  const selected = decks.find((d) => d.id === selectedId) ?? null;
  const queue = queueQ.data;
  const notify = useCallback((text: string, tone: "success" | "error" = "success") => setToast({ text, tone }), []);

  // Atalhos vindos da Educação/Biblioteca (executados uma vez, depois limpos da URL).
  useEffect(() => {
    if (!decksQ.data) return;
    const subjectId = params.get("disciplina");
    const bookId = params.get("livro");
    if (!subjectId && !bookId) return;
    if (subjectId) {
      const existing = decksQ.data.find((d) => d.subjectId === subjectId);
      if (existing) setSelectedId(existing.id);
      else setForm({ open: true, deck: null, prefill: { name: params.get("nome") ?? "", subjectId, courseId: params.get("curso") } });
    }
    if (bookId) {
      setAiBookId(bookId);
      setAiOpen(true);
    }
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        ["disciplina", "curso", "nome", "livro"].forEach((k) => p.delete(k));
        return p;
      },
      { replace: true },
    );
  }, [decksQ.data, params, setParams]);

  const startStudy = (deck?: GrimoireDeck) => {
    // Para um baralho específico filtra a fila geral já carregada (mesmos limites diários).
    const cards = (queue?.cards ?? []).filter((c) => !deck || c.deckId === deck.id);
    if (cards.length === 0) return notify(deck ? "Nada para revisar neste baralho hoje." : "Nada para revisar hoje.", "error");
    setStudy({ deckId: deck?.id, cards });
    window.scrollTo({ top: 0 });
  };

  const saveDeck = async (input: DeckInput) => {
    if (form.deck) {
      await updateDeck.mutateAsync({ id: form.deck.id, patch: input });
      notify("Baralho atualizado.");
    } else {
      const created = await createDeck.mutateAsync(input);
      setSelectedId(created.id);
      notify(isRpg ? "Novo grimório aberto." : "Baralho criado.");
    }
  };

  const toggleArchive = async (deck: GrimoireDeck) => {
    try {
      await updateDeck.mutateAsync({ id: deck.id, patch: { archived: !deck.archivedAt } });
      notify(deck.archivedAt ? "Baralho restaurado." : "Baralho arquivado (sai da fila de estudo).");
      if (selectedId === deck.id && !deck.archivedAt && !showArchived) setSelectedId(null);
    } catch (err) {
      notify(errorMessage(err, "Não foi possível alterar o baralho."), "error");
    }
  };

  const removeDeck = async () => {
    if (!confirmDeck) return;
    try {
      await deleteDeck.mutateAsync(confirmDeck.id);
      if (selectedId === confirmDeck.id) setSelectedId(null);
      notify("Baralho excluído.");
      setConfirmDeck(null);
    } catch (err) {
      notify(errorMessage(err, "Não foi possível excluir o baralho."), "error");
    }
  };

  const pending = queue ? queue.cards.length : 0;

  // Fila do dia por baralho (calculada uma vez, usada na ordenação e nos tomos).
  const dueByDeck = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of queue?.cards ?? []) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1);
    return map;
  }, [queue]);

  const visibleDecks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? decks.filter((d) => [d.name, d.description, d.subjectName, d.bookTitle].some((v) => v?.toLowerCase().includes(q)))
      : [...decks];
    list.sort((a, b) => {
      if (sort === "nome") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "recentes") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "dominio") return masteryOf(b).pct - masteryOf(a).pct;
      return (dueByDeck.get(b.id) ?? 0) - (dueByDeck.get(a.id) ?? 0) || a.name.localeCompare(b.name, "pt-BR");
    });
    return list;
  }, [decks, search, sort, dueByDeck]);

  // Ao abrir um baralho, leva o painel de cartões para a vista (essencial no celular).
  useEffect(() => {
    if (selectedId) window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [selectedId]);

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-5">
      <PageHeader
        banner="educacao"
        tone="purple"
        icon={<BookOpenText size={20} />}
        title="Grimório"
        subtitle={isRpg ? "Seu livro de feitiços: revise na hora certa e fixe o que estudou." : "Memorização com repetição espaçada: revise cada cartão no momento certo."}
        actions={
          !study && (
            <>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => { setAiBookId(null); setAiOpen(true); }}>
                <Wand2 size={15} aria-hidden /> Gerar com IA
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={() => setForm({ open: true, deck: null })}>
                <Plus size={15} aria-hidden /> Novo baralho
              </Button>
            </>
          )
        }
      />

      {study ? (
        <StudySession
          cards={study.cards}
          isRpg={isRpg}
          onReview={(cardId, quality) => review.mutateAsync({ cardId, quality })}
          onExit={() => setStudy(null)}
        />
      ) : (
        <>
          {/* Estudo de hoje */}
          {queueQ.isLoading ? (
            <SkeletonBlock className="h-28" />
          ) : queueQ.isError || !queue ? (
            <Card className="p-4" role="alert">
              <p className="text-sm">Não foi possível carregar a fila de hoje.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void queueQ.refetch()}>
                Tentar de novo
              </Button>
            </Card>
          ) : (
            <GrimoireRitualHero queue={queue} stats={statsQ.data ?? null} pending={pending} decksCount={decks.length} isRpg={isRpg} onStudy={() => startStudy()} />
          )}

          <div role="tablist" aria-label="Seções do Grimório" className="flex gap-2 border-b border-paper-border dark:border-ink-border rpg:border-rpg-border">
            {(
              [
                ["baralhos", "Baralhos", Layers],
                ["estatisticas", "Estatísticas", BarChart3],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={clsx(
                  "-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
                  tab === value ? "border-brand-500 text-brand-600 dark:text-brand-400 rpg:border-rpg-gold rpg:text-rpg-gold-light" : "border-transparent text-slate hover:text-inherit",
                )}
              >
                <Icon size={15} aria-hidden /> {label}
              </button>
            ))}
          </div>

          {tab === "estatisticas" ? (
            statsQ.isLoading ? (
              <SkeletonBlock className="h-64" />
            ) : statsQ.data ? (
              <GrimoireStatsPanel stats={statsQ.data} />
            ) : (
              <Card className="p-4" role="alert">
                <p className="text-sm">Não foi possível carregar as estatísticas.</p>
              </Card>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="relative flex-1 min-w-0">
                  <span className="sr-only">Buscar baralho</span>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={isRpg ? "Buscar tomo, disciplina ou livro…" : "Buscar baralho, disciplina ou livro…"}
                    className={`${selectClass} !pl-9`}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="grimoire-sort">Ordenar</label>
                  <select id="grimoire-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${selectClass} sm:!w-auto`}>
                    <option value="fila">Mais para revisar</option>
                    <option value="dominio">Maior domínio</option>
                    <option value="nome">Nome (A–Z)</option>
                    <option value="recentes">Mais recentes</option>
                  </select>
                  <label className="inline-flex shrink-0 items-center gap-2 text-xs text-slate whitespace-nowrap">
                    <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Arquivados
                  </label>
                </div>
              </div>

              {decksQ.isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true" aria-label="Carregando baralhos">
                  {[0, 1, 2].map((i) => (
                    <SkeletonBlock key={i} className="h-36" />
                  ))}
                </div>
              ) : decksQ.isError ? (
                <Card className="p-4" role="alert">
                  <p className="text-sm">Não foi possível carregar os baralhos.</p>
                  <Button variant="secondary" className="mt-2" onClick={() => void decksQ.refetch()}>
                    Tentar de novo
                  </Button>
                </Card>
              ) : decks.length === 0 ? (
                <Card className="p-8 text-center">
                  <BookOpenText size={32} className="mx-auto text-slate" aria-hidden />
                  <p className="mt-3 font-display text-lg font-bold rpg:rpg-title">{isRpg ? "Seu grimório está em branco" : "Nenhum baralho ainda"}</p>
                  <p className="mt-1 text-sm text-slate max-w-md mx-auto">
                    Crie um baralho e adicione cartões (pergunta e resposta), ou gere sugestões com IA a partir de um texto, das notas de um livro ou do seu diário.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setForm({ open: true, deck: null })}>
                      <Plus size={15} aria-hidden /> Criar baralho
                    </Button>
                    <Button variant="secondary" onClick={() => setAiOpen(true)}>
                      <Wand2 size={15} aria-hidden /> Gerar com IA
                    </Button>
                  </div>
                </Card>
              ) : (
                visibleDecks.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-slate">Nenhum baralho encontrado para “{search}”.</p>
                  </Card>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {visibleDecks.map((d) => (
                      <li key={d.id}>
                        <GrimoireDeckTome
                          deck={d}
                          dueToday={dueByDeck.get(d.id) ?? 0}
                          selected={selectedId === d.id}
                          onSelect={() => setSelectedId(d.id === selectedId ? null : d.id)}
                          onStudy={() => startStudy(d)}
                          onEdit={() => setForm({ open: true, deck: d })}
                          onArchive={() => void toggleArchive(d)}
                          onDelete={() => setConfirmDeck(d)}
                        />
                      </li>
                    ))}
                  </ul>
                )
              )}

              <div ref={panelRef} className="scroll-mt-4">
                {selected && <DeckCardsPanel key={selected.id} deck={selected} today={queue?.today ?? ""} onToast={notify} onClose={() => setSelectedId(null)} />}
              </div>
            </div>
          )}
        </>
      )}

      <DeckFormModal open={form.open} deck={form.deck} prefill={form.prefill} onClose={() => setForm({ open: false, deck: null })} onSubmit={saveDeck} />
      <AIGeneratorModal
        open={aiOpen}
        decks={decks}
        defaultDeckId={selectedId}
        defaultBookId={aiBookId}
        onClose={() => setAiOpen(false)}
        onSaved={(n, name) => notify(`${n} ${n === 1 ? "cartão salvo" : "cartões salvos"} em “${name}”.`)}
      />
      <Modal
        open={!!confirmDeck}
        onClose={() => setConfirmDeck(null)}
        size="sm"
        title="Excluir baralho?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeck(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void removeDeck()} disabled={deleteDeck.isPending} className="!bg-none !bg-drop">
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <p className="text-sm">
          “{confirmDeck?.name}” e seus {confirmDeck?.counts.total ?? 0} cartões (com o histórico de revisões) serão apagados. Se quiser só tirar da fila, prefira arquivar.
        </p>
      </Modal>
      <InlineToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default GrimorioPage;
