import { useEffect, useState } from "react";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { useGrimoireDecks, useGrimoireMutations } from "@/hooks/useGrimoire";
import { errorMessage, selectClass, textareaClass } from "./grimoireUi";

export interface QuoteForCard {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor?: string | null;
  content: string;
  page: number | null;
}

/**
 * "Virar cartão": transforma uma citação/insight da Biblioteca em cartão do
 * Grimório (source = 'quote'). O usuário escolhe o baralho e pode ajustar
 * frente e verso antes de salvar.
 */
export function QuoteToCardModal({ quote, onClose, onDone }: { quote: QuoteForCard | null; onClose: () => void; onDone: (msg: string, tone?: "success" | "error") => void }) {
  const decksQ = useGrimoireDecks();
  const { cardFromNote, createDeck } = useGrimoireMutations();
  const [deckId, setDeckId] = useState("");
  const [newDeckName, setNewDeckName] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const decks = decksQ.data ?? [];

  useEffect(() => {
    if (!quote) return;
    setFront(quote.content);
    setBack(`${quote.bookTitle}${quote.bookAuthor ? ` — ${quote.bookAuthor}` : ""}${quote.page ? `, p. ${quote.page}` : ""}`);
    setNewDeckName(`Citações — ${quote.bookTitle}`.slice(0, 120));
    setError(null);
  }, [quote]);

  // Sugere o baralho já ligado ao livro; senão, criar um novo.
  useEffect(() => {
    if (!quote || !decksQ.data) return;
    setDeckId(decksQ.data.find((d) => d.bookId === quote.bookId)?.id ?? "");
  }, [quote, decksQ.data]);

  const save = async () => {
    if (!quote) return;
    if (!front.trim() || !back.trim()) return setError("Frente e verso são obrigatórios.");
    if (!deckId && !newDeckName.trim()) return setError("Dê um nome ao novo baralho.");
    setSaving(true);
    setError(null);
    try {
      let target = deckId;
      let name = decks.find((d) => d.id === deckId)?.name ?? "";
      if (!target) {
        const created = await createDeck.mutateAsync({ name: newDeckName.trim(), bookId: quote.bookId });
        target = created.id;
        name = created.name;
      }
      await cardFromNote.mutateAsync({ noteId: quote.id, deckId: target, front: front.trim(), back: back.trim() });
      onDone(`Cartão criado no baralho “${name}”.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível criar o cartão."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!quote}
      onClose={onClose}
      title="Virar cartão do Grimório"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Criando..." : "Criar cartão"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Baralho" htmlFor="q2c-deck">
          <select id="q2c-deck" className={selectClass} value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={decksQ.isLoading}>
            <option value="">+ Novo baralho</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </FormRow>
        {!deckId && (
          <FormRow label="Nome do novo baralho" htmlFor="q2c-name">
            <input id="q2c-name" className={inputClass} maxLength={120} value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} />
          </FormRow>
        )}
        <FormRow label="Frente" htmlFor="q2c-front" hint="Dica: troque uma palavra-chave por ___ para treinar a lembrança.">
          <textarea id="q2c-front" rows={4} maxLength={2000} className={textareaClass} value={front} onChange={(e) => setFront(e.target.value)} />
        </FormRow>
        <FormRow label="Verso" htmlFor="q2c-back">
          <textarea id="q2c-back" rows={2} maxLength={4000} className={textareaClass} value={back} onChange={(e) => setBack(e.target.value)} />
        </FormRow>
        {error && (
          <p role="alert" className="text-xs text-drop rpg:text-rpg-red">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
