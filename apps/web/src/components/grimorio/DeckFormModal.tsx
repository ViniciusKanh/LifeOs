import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { useBooks } from "@/hooks/useBooks";
import { useEducations } from "@/hooks/useEducations";
import { useGoals } from "@/hooks/useGoals";
import { educationService } from "@/services/educationService";
import type { DeckInput, DeckSource, GoalSyncMode, GrimoireDeck } from "@/services/grimoireService";
import { errorMessage, selectClass, textareaClass } from "./grimoireUi";

type LinkKind = "none" | "subject" | "book";

/**
 * Criar/editar baralho. O vínculo (disciplina ou livro) é opcional e só
 * oferece itens do próprio usuário; o backend valida a posse de novo.
 */
export function DeckFormModal({
  open,
  deck,
  prefill,
  onClose,
  onSubmit,
}: {
  open: boolean;
  deck?: GrimoireDeck | null;
  prefill?: Partial<DeckInput>;
  onClose: () => void;
  onSubmit: (input: DeckInput) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newPerDay, setNewPerDay] = useState("15");
  const [linkKind, setLinkKind] = useState<LinkKind>("none");
  const [subjectId, setSubjectId] = useState("");
  const [bookId, setBookId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [goalSyncMode, setGoalSyncMode] = useState<GoalSyncMode>("study_days");
  const [sources, setSources] = useState<DeckSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = deck ?? prefill ?? {};
    setName(src.name ?? "");
    setDescription(src.description ?? "");
    setNewPerDay(String(src.newPerDay ?? 15));
    setSubjectId(src.subjectId ?? "");
    setBookId(src.bookId ?? "");
    setLinkKind(src.subjectId ? "subject" : src.bookId ? "book" : "none");
    setGoalId(src.goalId ?? "");
    setGoalSyncMode(src.goalSyncMode ?? "study_days");
    setSources(src.sources ?? []);
    setError(null);
  }, [open, deck, prefill]);

  const { books } = useBooks();
  const { goals } = useGoals();
  const activeGoals = goals.filter((g) => g.status === "active");
  const selectedGoal = activeGoals.find((g) => g.id === goalId);
  const { educations } = useEducations();
  // Disciplinas de todas as formações (só carrega quando o vínculo for "disciplina").
  const subjectQueries = useQueries({
    queries: educations.map((e) => ({
      queryKey: ["educations", e.id, "subjects"],
      queryFn: () => educationService.listEducationSubjects(e.id),
      enabled: open && linkKind === "subject",
    })),
  });
  const subjects = useMemo(
    () => subjectQueries.flatMap((q, i) => (q.data ?? []).map((s) => ({ id: s.id, courseId: s.course_id, label: `${s.name} · ${educations[i]?.course_name ?? ""}` }))),
    [subjectQueries, educations],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(newPerDay);
    if (!name.trim()) return setError("Dê um nome ao baralho.");
    if (!Number.isInteger(n) || n < 0 || n > 200) return setError("Novos por dia deve ser um número entre 0 e 200.");
    if (linkKind === "subject" && !subjectId) return setError("Escolha a disciplina ou remova o vínculo.");
    if (linkKind === "book" && !bookId) return setError("Escolha o livro ou remova o vínculo.");
    const subject = subjects.find((s) => s.id === subjectId);
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        newPerDay: n,
        subjectId: linkKind === "subject" ? subjectId : null,
        courseId: linkKind === "subject" ? (subject?.courseId ?? prefill?.courseId ?? deck?.courseId ?? null) : null,
        bookId: linkKind === "book" ? bookId : null,
        goalId: goalId || null,
        goalSyncMode,
        sources: sources.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), url: x.url?.trim() || null })),
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar o baralho."));
    } finally {
      setSaving(false);
    }
  };

  // Disciplina pré-selecionada (atalho da Educação) aparece mesmo antes da lista carregar.
  const subjectOptions = subjectId && !subjects.some((s) => s.id === subjectId) ? [{ id: subjectId, courseId: "", label: prefill?.name ?? "Disciplina selecionada" }, ...subjects] : subjects;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deck ? "Editar baralho" : "Novo baralho"}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="deck-form" disabled={saving}>
            {saving ? "Salvando..." : deck ? "Salvar" : "Criar baralho"}
          </Button>
        </>
      }
    >
      <form id="deck-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormRow label="Nome" htmlFor="deck-name">
          <input id="deck-name" className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required autoFocus />
        </FormRow>
        <FormRow label="Descrição (opcional)" htmlFor="deck-desc">
          <textarea id="deck-desc" className={textareaClass} rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormRow label="Cartões novos por dia" htmlFor="deck-new" hint="Limite de cartões inéditos apresentados por dia.">
            <input id="deck-new" type="number" min={0} max={200} inputMode="numeric" className={inputClass} value={newPerDay} onChange={(e) => setNewPerDay(e.target.value)} />
          </FormRow>
          <FormRow label="Vincular a" htmlFor="deck-link">
            <select id="deck-link" className={selectClass} value={linkKind} onChange={(e) => setLinkKind(e.target.value as LinkKind)}>
              <option value="none">Nada</option>
              <option value="subject">Disciplina (Educação)</option>
              <option value="book">Livro (Biblioteca)</option>
            </select>
          </FormRow>
        </div>
        {linkKind === "subject" && (
          <FormRow label="Disciplina" htmlFor="deck-subject">
            <select id="deck-subject" className={selectClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Selecione…</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {educations.length === 0 && <p className="mt-1 text-[11px] text-slate">Você ainda não cadastrou formações na Educação.</p>}
          </FormRow>
        )}
        {linkKind === "book" && (
          <FormRow label="Livro" htmlFor="deck-book">
            <select id="deck-book" className={selectClass} value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">Selecione…</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </FormRow>
        )}
        {/* Grimório ↔ Metas: o estudo deste baralho pode avançar uma meta. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormRow label="Meta que este baralho alimenta (opcional)" htmlFor="deck-goal">
            <select id="deck-goal" className={selectClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">Nenhuma</option>
              {activeGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </FormRow>
          {goalId && (
            <FormRow
              label="Como avança a meta"
              htmlFor="deck-goal-mode"
              hint={
                goalSyncMode === "study_days"
                  ? selectedGoal?.kind === "numeric"
                    ? "+1 na meta por dia em que você estudar este baralho."
                    : "Use em metas numéricas (ex.: 30 dias de estudo). Nas demais, o dia fica só no histórico."
                  : goalSyncMode === "mastery"
                    ? selectedGoal?.kind === "percentage"
                      ? "A meta recebe o % de domínio do baralho."
                      : "Use em metas de percentual."
                    : "A meta não é alterada pelo estudo."
              }
            >
              <select id="deck-goal-mode" className={selectClass} value={goalSyncMode} onChange={(e) => setGoalSyncMode(e.target.value as GoalSyncMode)}>
                <option value="study_days">Dias de estudo</option>
                <option value="mastery">Domínio do baralho (%)</option>
                <option value="none">Não sincronizar</option>
              </select>
            </FormRow>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-slate rpg:text-rpg-muted mb-1.5">Fontes e referências (opcional)</p>
          <ul className="space-y-1.5">
            {sources.map((src, i) => (
              <li key={i} className="flex gap-1.5">
                <input
                  className={inputClass}
                  placeholder="Título (livro, curso, artigo)"
                  value={src.title}
                  maxLength={200}
                  onChange={(e) => setSources((l) => l.map((x, n) => (n === i ? { ...x, title: e.target.value } : x)))}
                  aria-label="Título da fonte"
                />
                <input
                  className={inputClass}
                  placeholder="https://… (opcional)"
                  value={src.url ?? ""}
                  maxLength={500}
                  onChange={(e) => setSources((l) => l.map((x, n) => (n === i ? { ...x, url: e.target.value } : x)))}
                  aria-label="Link da fonte"
                />
                <button type="button" className="px-2 text-slate hover:text-drop" onClick={() => setSources((l) => l.filter((_, n) => n !== i))} aria-label="Remover fonte">
                  ×
                </button>
              </li>
            ))}
          </ul>
          {sources.length < 20 && (
            <button type="button" className="mt-1.5 text-xs font-semibold text-brand-600 rpg:text-rpg-gold-light" onClick={() => setSources((l) => [...l, { title: "", url: "" }])}>
              + Adicionar fonte
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-drop rpg:text-rpg-red">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
