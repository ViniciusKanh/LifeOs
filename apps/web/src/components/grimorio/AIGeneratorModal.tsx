import { useEffect, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { useBooks } from "@/hooks/useBooks";
import { useGrimoireMutations } from "@/hooks/useGrimoire";
import { todayKey } from "@/utils/localDate";
import type { CardGenResult, CardGenSource, GrimoireDeck } from "@/services/grimoireService";
import { Chip, errorMessage, selectClass, textareaClass } from "./grimoireUi";

type SourceKind = CardGenSource["kind"];
type Draft = { front: string; back: string; selected: boolean };

/**
 * Gerador de cartões por IA em duas etapas: (1) o Gemini PROPÕE cartões a
 * partir do material escolhido; (2) o usuário marca, edita e confirma — só
 * então os cartões são gravados (source = 'ai').
 */
export function AIGeneratorModal({
  open,
  decks,
  defaultDeckId,
  defaultBookId,
  onClose,
  onSaved,
}: {
  open: boolean;
  decks: GrimoireDeck[];
  defaultDeckId?: string | null;
  defaultBookId?: string | null;
  onClose: () => void;
  onSaved: (count: number, deckName: string) => void;
}) {
  const { books } = useBooks();
  const { generate, createCards, createDeck } = useGrimoireMutations();
  const [kind, setKind] = useState<SourceKind>("text");
  const [text, setText] = useState("");
  const [bookId, setBookId] = useState("");
  const [entryDate, setEntryDate] = useState(todayKey());
  const [count, setCount] = useState(10);
  const [result, setResult] = useState<CardGenResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deckId, setDeckId] = useState("");
  const [newDeckName, setNewDeckName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setDrafts([]);
    setError(null);
    setDeckId(defaultDeckId ?? decks.find((d) => !d.archivedAt)?.id ?? "");
    if (defaultBookId) {
      setKind("book_notes");
      setBookId(defaultBookId);
    }
    // Reinicia o formulário só ao abrir (dependências intencionalmente omitidas).
  }, [open]);

  const activeDecks = decks.filter((d) => !d.archivedAt);

  const run = async () => {
    setError(null);
    let source: CardGenSource;
    if (kind === "text") {
      if (text.trim().length < 40) return setError("Cole um texto com pelo menos 40 caracteres.");
      source = { kind: "text", text: text.trim() };
    } else if (kind === "book_notes") {
      if (!bookId) return setError("Escolha um livro.");
      source = { kind: "book_notes", bookId };
    } else {
      if (!entryDate) return setError("Escolha a data da entrada do diário.");
      source = { kind: "journal", entryDate };
    }
    try {
      const r = await generate.mutateAsync({ source, count });
      setResult(r);
      setDrafts(r.suggestions.map((s) => ({ ...s, selected: true })));
    } catch (err) {
      setError(errorMessage(err, "Não foi possível gerar cartões agora."));
    }
  };

  const save = async () => {
    const chosen = drafts.filter((d) => d.selected && d.front.trim() && d.back.trim());
    if (chosen.length === 0) return setError("Selecione ao menos um cartão com frente e verso preenchidos.");
    if (!deckId && !newDeckName.trim()) return setError("Escolha um baralho ou dê nome a um novo.");
    setSaving(true);
    setError(null);
    try {
      let targetId = deckId;
      let targetName = activeDecks.find((d) => d.id === deckId)?.name ?? "";
      if (!targetId) {
        const created = await createDeck.mutateAsync({ name: newDeckName.trim(), bookId: kind === "book_notes" ? bookId || null : null });
        targetId = created.id;
        targetName = created.name;
      }
      await createCards.mutateAsync({ deckId: targetId, cards: chosen.map(({ front, back }) => ({ front: front.trim(), back: back.trim() })), source: "ai" });
      onSaved(chosen.length, targetName);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar os cartões."));
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = drafts.filter((d) => d.selected).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Gerar cartões com IA"
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Voltar
            </Button>
            <Button onClick={() => void save()} disabled={saving || selectedCount === 0}>
              {saving ? "Salvando..." : `Salvar ${selectedCount} ${selectedCount === 1 ? "cartão" : "cartões"}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void run()} disabled={generate.isPending}>
              <Wand2 size={15} aria-hidden /> {generate.isPending ? "Gerando..." : "Gerar sugestões"}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            A IA lê só o material que você escolher e <strong>propõe</strong> cartões. Nada é salvo até você revisar e confirmar.
          </p>
          <fieldset>
            <legend className="text-xs font-medium text-slate mb-1.5">Material</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Origem do material">
              {(
                [
                  ["text", "Texto colado"],
                  ["book_notes", "Notas de um livro"],
                  ["journal", "Entrada do diário"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors rpg:rounded-[3px] rpg:border-2 ${
                    kind === k
                      ? "bg-brand-500 border-brand-500 text-white rpg:bg-rpg-purple/25 rpg:border-rpg-gold rpg:text-rpg-text"
                      : "border-paper-border dark:border-ink-border text-slate rpg:border-rpg-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {kind === "text" && (
            <FormRow label="Texto de estudo" htmlFor="ai-text" hint={`${text.length.toLocaleString("pt-BR")} / 12.000 caracteres`}>
              <textarea id="ai-text" rows={8} maxLength={12000} className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole um resumo, trecho de aula, artigo…" />
            </FormRow>
          )}
          {kind === "book_notes" && (
            <FormRow label="Livro" htmlFor="ai-book" hint="Usa as notas, citações e insights registrados no livro.">
              <select id="ai-book" className={selectClass} value={bookId} onChange={(e) => setBookId(e.target.value)}>
                <option value="">Selecione…</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </FormRow>
          )}
          {kind === "journal" && (
            <FormRow label="Data da entrada" htmlFor="ai-date" hint="Usa os textos que você escreveu no Diário nesse dia.">
              <input id="ai-date" type="date" className={inputClass} value={entryDate} max={todayKey()} onChange={(e) => setEntryDate(e.target.value)} />
            </FormRow>
          )}
          <FormRow label="Quantidade máxima" htmlFor="ai-count">
            <select id="ai-count" className={selectClass} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n} cartões
                </option>
              ))}
            </select>
          </FormRow>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="purple">
              <Sparkles size={11} aria-hidden /> Sugestão da IA
            </Chip>
            <span className="text-xs text-slate">Baseado em: {result.basedOn}</span>
          </div>
          <p className="text-xs text-slate">Confira o conteúdo: a IA pode errar. Edite ou desmarque o que não quiser salvar.</p>
          <ul className="space-y-3">
            {drafts.map((d, i) => (
              <li key={i} className="rounded-xl border border-paper-border dark:border-ink-border p-3 rpg:rounded-[3px] rpg:border-rpg-border">
                <label className="flex items-center gap-2 text-xs font-semibold mb-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={d.selected}
                    onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                  />
                  Cartão {i + 1}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <textarea
                    aria-label={`Frente do cartão ${i + 1}`}
                    rows={2}
                    maxLength={2000}
                    className={textareaClass}
                    value={d.front}
                    onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))}
                  />
                  <textarea
                    aria-label={`Verso do cartão ${i + 1}`}
                    rows={2}
                    maxLength={4000}
                    className={textareaClass}
                    value={d.back}
                    onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormRow label="Salvar no baralho" htmlFor="ai-deck">
              <select id="ai-deck" className={selectClass} value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                <option value="">+ Novo baralho</option>
                {activeDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FormRow>
            {!deckId && (
              <FormRow label="Nome do novo baralho" htmlFor="ai-newdeck">
                <input id="ai-newdeck" className={inputClass} maxLength={120} value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} />
              </FormRow>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-drop rpg:text-rpg-red">
          {error}
        </p>
      )}
    </Modal>
  );
}
