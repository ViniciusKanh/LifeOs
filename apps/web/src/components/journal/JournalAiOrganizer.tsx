import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, RotateCcw, Sparkles, Tag, Trash2 } from "lucide-react";
import type { JournalAiOrganization, JournalAiSuggestion, JournalMedia } from "@/types";
import { Button } from "@/components/ui/primitives";

/**
 * "Organizar com IA" do Diário. Fluxo em duas etapas, como exige a regra
 * de IA do LifeOS: (1) o Gemini sugere título, resumo, temas e categorias
 * das mídias — nada é salvo; (2) o usuário revisa, escolhe as etiquetas e
 * confirma. O texto original do diário nunca é reescrito.
 */
export function JournalAiOrganizer({
  saved,
  media,
  onSuggest,
  onApply,
  onClear,
  isSuggesting,
  isApplying,
}: {
  saved: JournalAiOrganization | null;
  media: JournalMedia[];
  onSuggest: () => Promise<JournalAiSuggestion>;
  onApply: (input: Omit<JournalAiSuggestion, "suggestedTags"> & { tagsToAdd: string[] }) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  isSuggesting: boolean;
  isApplying: boolean;
}) {
  const [suggestion, setSuggestion] = useState<JournalAiSuggestion | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const requestSuggestion = async () => {
    setError(null);
    try {
      const s = await onSuggest();
      setSuggestion(s);
      setSelectedTags(new Set(s.suggestedTags));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível falar com a IA agora.");
    }
  };

  const apply = async () => {
    if (!suggestion) return;
    setError(null);
    try {
      await onApply({
        title: suggestion.title,
        summary: suggestion.summary,
        categories: suggestion.categories,
        mediaCategories: suggestion.mediaCategories,
        tagsToAdd: Array.from(selectedTags),
      });
      setSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a organização.");
    }
  };

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  const view = suggestion ?? saved;
  const mediaName = (id: string) => {
    const m = media.find((x) => x.id === id);
    return m?.caption ?? m?.fileName ?? "Mídia";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-100">
          <Sparkles size={10} /> Inferência da IA
        </span>
        <span className="text-[11px] text-slate">Baseada só no que você escreveu hoje e nas histórias das mídias.</span>
      </div>

      {!view && (
        <div className="rounded-xl border border-dashed border-paper-border dark:border-ink-border p-4 text-center">
          <p className="text-sm text-slate">O Gemini agrupa seus textos por temas, sugere um título e categoriza as mídias. Você revisa antes de salvar.</p>
          <Button className="mt-3 !from-brand-500 !to-brand-700 !shadow-glow-brand" onClick={requestSuggestion} disabled={isSuggesting}>
            {isSuggesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {isSuggesting ? "Organizando…" : "Organizar com IA"}
          </Button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view && (
          <motion.div
            key={suggestion ? "suggestion" : "saved"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-xl p-4 border ${suggestion ? "border-brand-500/40 bg-brand-50/60 dark:bg-brand-700/10" : "border-paper-border dark:border-ink-border"}`}
          >
            {suggestion && <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-100 mb-2">Prévia — ainda não salva</p>}
            {view.title && <p className="font-display font-semibold text-lg leading-tight">{view.title}</p>}
            {view.summary && <p className="text-sm text-slate mt-1 leading-relaxed">{view.summary}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {view.categories.map((c) => (
                <div key={c.name} className="rounded-xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-3">
                  <p className="text-xs font-semibold text-cat-purple dark:text-cat-purple-dark mb-1.5">{c.name}</p>
                  <ul className="space-y-1">
                    {c.points.map((p, i) => (
                      <li key={i} className="text-xs leading-relaxed flex gap-1.5">
                        <span className="text-cat-purple mt-[3px]">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {suggestion && suggestion.mediaCategories.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-slate mb-1.5">Categorias das mídias</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.mediaCategories.map((m) => (
                    <span key={m.id} className="rounded-full px-2 py-0.5 text-[10px] bg-paper dark:bg-ink border border-paper-border dark:border-ink-border">
                      {mediaName(m.id)} → <strong>{m.category}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {suggestion && suggestion.suggestedTags.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-slate mb-1.5 flex items-center gap-1">
                  <Tag size={11} /> Etiquetas sugeridas — toque para escolher
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.suggestedTags.map((tag) => {
                    const on = selectedTags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={on}
                        className={`rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
                          on ? "bg-cat-pink/15 border-cat-pink/50 text-cat-pink" : "border-paper-border dark:border-ink-border text-slate"
                        }`}
                      >
                        {on && <Check size={10} className="inline mr-0.5" />}#{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {suggestion ? (
                <>
                  <Button onClick={apply} disabled={isApplying}>
                    {isApplying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Salvar organização
                  </Button>
                  <Button variant="secondary" onClick={() => setSuggestion(null)} disabled={isApplying}>
                    Descartar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={requestSuggestion} disabled={isSuggesting}>
                    {isSuggesting ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    Reorganizar
                  </Button>
                  <Button variant="ghost" onClick={() => onClear().catch(() => setError("Não foi possível remover."))}>
                    <Trash2 size={15} /> Remover organização
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs text-drop" role="alert">{error}</p>}
    </div>
  );
}
