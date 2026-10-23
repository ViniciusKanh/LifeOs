import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { useGrimoireCards, useGrimoireMutations } from "@/hooks/useGrimoire";
import type { GrimoireCard, GrimoireDeck } from "@/services/grimoireService";
import { Chip, SkeletonBlock, errorMessage, textareaClass } from "./grimoireUi";

const fmtDay = (k: string) => k.split("-").reverse().join("/");

function stateOf(c: GrimoireCard, today: string): { label: string; tone: "blue" | "purple" | "green" | "orange" } {
  if (c.isNew) return { label: "Novo", tone: "blue" };
  if (c.dueDate <= today) return { label: "Vence hoje", tone: "orange" };
  if (c.intervalDays >= 21) return { label: "Maduro", tone: "green" };
  return { label: "Aprendendo", tone: "purple" };
}

/** Lista de cartões de um baralho: adicionar, buscar, editar e excluir (com confirmação). */
export function DeckCardsPanel({ deck, today, onToast, onClose }: { deck: GrimoireDeck; today: string; onToast: (msg: string, tone?: "success" | "error") => void; onClose: () => void }) {
  const { data: cards, isLoading, isError, refetch } = useGrimoireCards(deck.id);
  const { createCards, updateCard, deleteCard } = useGrimoireMutations();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: string; front: string; back: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cards ?? []).filter((c) => !term || c.front.toLowerCase().includes(term) || c.back.toLowerCase().includes(term));
  }, [cards, q]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return setFormError("Preencha frente e verso.");
    setFormError(null);
    try {
      await createCards.mutateAsync({ deckId: deck.id, cards: [{ front: front.trim(), back: back.trim() }] });
      setFront("");
      setBack("");
      onToast("Cartão adicionado.");
    } catch (err) {
      setFormError(errorMessage(err, "Não foi possível adicionar o cartão."));
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.front.trim() || !editing.back.trim()) return;
    try {
      await updateCard.mutateAsync({ id: editing.id, patch: { front: editing.front.trim(), back: editing.back.trim() } });
      setEditing(null);
      onToast("Cartão atualizado.");
    } catch (err) {
      onToast(errorMessage(err, "Não foi possível salvar o cartão."), "error");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteCard.mutateAsync(id);
      setConfirmId(null);
      onToast("Cartão excluído.");
    } catch (err) {
      onToast(errorMessage(err, "Não foi possível excluir o cartão."), "error");
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold truncate rpg:rpg-title">{deck.name}</p>
          <p className="text-xs text-slate">
            {deck.counts.total} cartões · {deck.counts.due} vencidos · {deck.counts.new} novos · {deck.counts.mature} maduros
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Fechar lista de cartões">
          <X size={16} aria-hidden />
        </Button>
      </div>

      {!deck.archivedAt && (
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-4" noValidate>
          <textarea aria-label="Frente do novo cartão" placeholder="Frente (pergunta)" rows={2} maxLength={2000} className={textareaClass} value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea aria-label="Verso do novo cartão" placeholder="Verso (resposta)" rows={2} maxLength={4000} className={textareaClass} value={back} onChange={(e) => setBack(e.target.value)} />
          <Button type="submit" disabled={createCards.isPending} className="md:self-stretch">
            <Plus size={15} aria-hidden /> Adicionar
          </Button>
          {formError && (
            <p role="alert" className="md:col-span-3 text-xs text-drop rpg:text-rpg-red">
              {formError}
            </p>
          )}
        </form>
      )}

      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" aria-hidden />
        <input
          type="search"
          aria-label="Buscar cartões"
          placeholder="Buscar nos cartões…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl pl-9 pr-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando cartões">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="text-sm text-drop">
          Não foi possível carregar os cartões.{" "}
          <button className="underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">{q ? "Nenhum cartão encontrado para essa busca." : "Este baralho ainda não tem cartões. Adicione o primeiro acima ou gere com IA."}</p>
      ) : (
        <ul className="divide-y divide-paper-border dark:divide-ink-border rpg:divide-rpg-border/60">
          {filtered.map((c) => {
            const st = stateOf(c, today);
            const isEditing = editing?.id === c.id;
            return (
              <li key={c.id} className="py-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea aria-label="Editar frente" rows={2} className={textareaClass} value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
                    <textarea aria-label="Editar verso" rows={2} className={textareaClass} value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                      <Button onClick={() => void saveEdit()} disabled={updateCard.isPending}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold break-words whitespace-pre-wrap">{c.front}</p>
                      <p className="text-sm text-slate break-words whitespace-pre-wrap mt-0.5">{c.back}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <Chip tone={st.tone}>{st.label}</Chip>
                        {c.source !== "manual" && <Chip tone={c.source === "ai" ? "purple" : "pink"}>{c.source === "ai" ? "IA" : "Citação"}</Chip>}
                        {!c.isNew && <span className="text-[10px] text-slate">próxima revisão {fmtDay(c.dueDate)}</span>}
                      </div>
                    </div>
                    {confirmId === c.id ? (
                      <div className="flex shrink-0 flex-col gap-1 sm:flex-row" role="group" aria-label="Confirmar exclusão">
                        <Button variant="ghost" onClick={() => setConfirmId(null)}>
                          Cancelar
                        </Button>
                        <Button onClick={() => void remove(c.id)} disabled={deleteCard.isPending} className="!bg-none !bg-drop">
                          Excluir
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button className="p-2 rounded-lg text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={`Editar cartão: ${c.front.slice(0, 40)}`} onClick={() => setEditing({ id: c.id, front: c.front, back: c.back })}>
                          <Pencil size={15} />
                        </button>
                        <button className="p-2 rounded-lg text-slate hover:text-drop hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label={`Excluir cartão: ${c.front.slice(0, 40)}`} onClick={() => setConfirmId(c.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
