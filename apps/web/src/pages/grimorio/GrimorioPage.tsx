import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, BarChart3, BookOpenText, GraduationCap, Layers, Library, Pencil, Play, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
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
import { Chip, InlineToast, SkeletonBlock, errorMessage } from "@/components/grimorio/grimoireUi";

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
              <Button variant="secondary" onClick={() => { setAiBookId(null); setAiOpen(true); }}>
                <Wand2 size={15} aria-hidden /> Gerar com IA
              </Button>
              <Button onClick={() => setForm({ open: true, deck: null })}>
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
            <Card className={clsx("p-4 sm:p-5", pending > 0 && "rpg:rpg-panel-gold")}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate rpg:font-pixel rpg:text-rpg-gold">{isRpg ? "Ritual de hoje" : "Estudo de hoje"}</p>
                  {pending > 0 ? (
                    <p className="mt-1 font-display text-xl font-bold rpg:rpg-title">
                      {pending} {pending === 1 ? "cartão" : "cartões"} para revisar
                    </p>
                  ) : (
                    <p className="mt-1 font-display text-xl font-bold rpg:rpg-title">{queue.clearedToday ? "Fila de hoje concluída" : decks.length === 0 ? "Crie seu primeiro baralho" : "Nada para revisar agora"}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip tone="orange">{queue.dueCount} vencidos</Chip>
                    <Chip tone="blue">{queue.newCount} novos</Chip>
                    <Chip>{queue.reviewedToday} revisões hoje</Chip>
                    {queue.clearedToday && (
                      <Chip tone="green">
                        <Sparkles size={10} aria-hidden /> XP do dia recebido
                      </Chip>
                    )}
                  </div>
                  {!queue.clearedToday && pending > 0 && <p className="mt-2 text-[11px] text-slate">Concluir a fila do dia rende XP (uma vez por dia).</p>}
                </div>
                <Button onClick={() => startStudy()} disabled={pending === 0} className="sm:min-w-[170px]">
                  <Play size={15} aria-hidden /> {isRpg ? "Começar ritual" : "Estudar agora"}
                </Button>
              </div>
            </Card>
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
              <label className="inline-flex items-center gap-2 text-xs text-slate">
                <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Mostrar arquivados
              </label>

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
                <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {decks.map((d) => {
                    const dueToday = (queue?.cards ?? []).filter((c) => c.deckId === d.id).length;
                    return (
                      <li key={d.id}>
                        <Card className={clsx("p-4 h-full flex flex-col", selectedId === d.id && "ring-2 ring-brand-500/60 rpg:ring-rpg-gold/70", d.archivedAt && "opacity-75")}>
                          <button className="text-left min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" onClick={() => setSelectedId(d.id === selectedId ? null : d.id)} aria-expanded={selectedId === d.id}>
                            <p className="font-semibold truncate">{d.name}</p>
                            {d.description && <p className="text-xs text-slate line-clamp-2 mt-0.5">{d.description}</p>}
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {d.subjectName && (
                              <Chip tone="blue">
                                <GraduationCap size={10} aria-hidden /> {d.subjectName}
                              </Chip>
                            )}
                            {d.bookTitle && (
                              <Chip tone="pink">
                                <Library size={10} aria-hidden /> {d.bookTitle}
                              </Chip>
                            )}
                            {d.archivedAt && <Chip>Arquivado</Chip>}
                          </div>
                          <p className="mt-3 text-xs text-slate">
                            {d.counts.total} cartões · {d.counts.mature} maduros · {d.newPerDay} novos/dia
                          </p>
                          <div className="mt-auto pt-3 flex flex-wrap items-center gap-1.5">
                            <Button className="!px-3 !py-2" onClick={() => startStudy(d)} disabled={dueToday === 0 || !!d.archivedAt}>
                              <Play size={14} aria-hidden /> Estudar{dueToday > 0 ? ` (${dueToday})` : ""}
                            </Button>
                            <div className="ml-auto flex gap-0.5">
                              <button className="p-2 rounded-lg text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={`Editar baralho ${d.name}`} onClick={() => setForm({ open: true, deck: d })}>
                                <Pencil size={15} />
                              </button>
                              <button className="p-2 rounded-lg text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={d.archivedAt ? `Restaurar baralho ${d.name}` : `Arquivar baralho ${d.name}`} onClick={() => void toggleArchive(d)}>
                                {d.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                              </button>
                              <button className="p-2 rounded-lg text-slate hover:text-drop hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={`Excluir baralho ${d.name}`} onClick={() => setConfirmDeck(d)}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}

              {selected && <DeckCardsPanel key={selected.id} deck={selected} today={queue?.today ?? ""} onToast={notify} onClose={() => setSelectedId(null)} />}
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
