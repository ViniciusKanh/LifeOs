import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ListPlus, Loader2, Replace, Wand2, X } from "lucide-react";
import type { PeriodicReviewDraft } from "@/types";

/**
 * Rascunho da revisão do ciclo escrito pela IA a partir das tarefas
 * concluídas, pendências, hábitos e do Diário do período.
 *
 * Regra de IA do LifeOS: nada entra nos campos sem o usuário escolher.
 * Para cada campo ele decide "Substituir" ou "Acrescentar" ao que já
 * escreveu — ou descarta o rascunho inteiro.
 */
export interface DraftField {
  id: "wins" | "lessons" | "focus";
  label: string;
  value: string;
  set: (v: string) => void;
}

export function ReviewDraftPanel({
  fields,
  onGenerate,
  isRpg,
  disabled,
}: {
  fields: DraftField[];
  onGenerate: () => Promise<PeriodicReviewDraft>;
  isRpg: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<PeriodicReviewDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const textFor = (id: DraftField["id"]) => (draft ? (id === "wins" ? draft.wins : id === "lessons" ? draft.lessons : draft.focusNext) : "");

  const generate = async () => {
    setError(null);
    setLoading(true);
    try {
      setDraft(await onGenerate());
      setApplied(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o rascunho agora.");
    } finally {
      setLoading(false);
    }
  };

  const apply = (f: DraftField, mode: "replace" | "append") => {
    const text = textFor(f.id);
    if (!text) return;
    f.set(mode === "replace" || !f.value.trim() ? text : `${f.value.trim()}\n\n${text}`);
    setApplied((s) => new Set(s).add(f.id));
  };

  const applyAllEmpty = () => {
    for (const f of fields) if (!f.value.trim()) apply(f, "replace");
  };

  const shell = isRpg ? "rpg-panel p-3" : "rounded-xl border border-brand-500/30 bg-brand-50/50 dark:bg-brand-700/10 p-3";
  const muted = isRpg ? "text-rpg-muted" : "text-slate";
  const accent = isRpg ? "text-rpg-gold-light" : "text-brand-600 dark:text-brand-100";
  const chip = isRpg
    ? "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold border border-rpg-border hover:border-rpg-gold text-rpg-text"
    : "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-paper-border dark:border-ink-border hover:border-brand-500";

  return (
    <div className="space-y-2">
      {!draft && (
        <div className={`${shell} flex flex-wrap items-center gap-3`}>
          <p className={`flex-1 min-w-[200px] text-xs ${muted}`}>
            A IA lê suas <strong className={accent}>tarefas concluídas</strong>, pendências, hábitos e o que você escreveu no <strong className={accent}>Diário</strong> neste período e escreve um rascunho — você escolhe o que usar.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={loading || disabled}
            className={
              isRpg
                ? "rpg-btn rpg-btn-gold inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-60"
                : "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-700 disabled:opacity-60"
            }
          >
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
            {loading ? "Lendo tarefas e diário…" : "Escrever rascunho com IA"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {draft && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${shell} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-xs font-semibold flex items-center gap-1 ${accent}`}>
                <Wand2 size={13} aria-hidden /> Rascunho da IA — {draft.basedOn.label}
              </p>
              <span className={`text-[11px] ${muted}`}>
                baseado em {draft.basedOn.tasksDone} tarefa(s), {draft.basedOn.projects} projeto(s) e {draft.basedOn.journalDays} dia(s) de diário
              </span>
              <button type="button" onClick={() => setDraft(null)} className={`ml-auto ${muted}`} aria-label="Descartar rascunho">
                <X size={15} />
              </button>
            </div>
            {fields.map((f) => {
              const text = textFor(f.id);
              const done = applied.has(f.id);
              return (
                <div key={f.id} className={isRpg ? "border-t border-rpg-border/60 pt-2" : "border-t border-paper-border dark:border-ink-border pt-2"}>
                  <p className={`text-[11px] font-semibold ${muted}`}>{f.label}</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line break-words">{text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cat-green">
                        <Check size={12} aria-hidden /> Aplicado no campo
                      </span>
                    ) : (
                      <>
                        <button type="button" className={chip} style={isRpg ? { borderRadius: 3 } : undefined} onClick={() => apply(f, "replace")}>
                          <Replace size={12} aria-hidden /> {f.value.trim() ? "Substituir meu texto" : "Usar este texto"}
                        </button>
                        {f.value.trim() && (
                          <button type="button" className={chip} style={isRpg ? { borderRadius: 3 } : undefined} onClick={() => apply(f, "append")}>
                            <ListPlus size={12} aria-hidden /> Acrescentar ao meu
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={chip} style={isRpg ? { borderRadius: 3 } : undefined} onClick={applyAllEmpty}>
                <Check size={12} aria-hidden /> Preencher só os campos vazios
              </button>
              <button type="button" className={chip} style={isRpg ? { borderRadius: 3 } : undefined} onClick={generate} disabled={loading}>
                {loading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Wand2 size={12} aria-hidden />} Gerar de novo
              </button>
            </div>
            <p className={`text-[10.5px] ${muted}`}>Nada é salvo até você clicar em “Salvar revisão”.</p>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p role="alert" className="text-xs text-drop rpg:text-rpg-red">
          {error}
        </p>
      )}
    </div>
  );
}
