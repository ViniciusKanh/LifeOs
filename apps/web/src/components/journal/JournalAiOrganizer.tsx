import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Heart, Loader2, RotateCcw, Sparkles, Star, Tag, Trash2 } from "lucide-react";
import type { JournalAiApplyInput, JournalAiOrganization, JournalAiSuggestion, JournalMedia } from "@/types";
import { Button } from "@/components/ui/primitives";

const PHOTOS_PREF = "lifeos:journal-ai-photos";
function readPhotosPref(): boolean {
  try {
    return localStorage.getItem(PHOTOS_PREF) === "1";
  } catch {
    return false;
  }
}

/**
 * "Organizar com IA" do Diário (v2). Fluxo em duas etapas, como exige a regra
 * de IA do LifeOS: (1) o Gemini sugere título, resumo, momentos marcantes,
 * reflexão da gratidão, temas, categorias e — só se o usuário permitir —
 * descrições e legendas das fotos; nada é salvo; (2) o usuário revisa,
 * escolhe etiquetas e legendas e confirma. O texto original nunca é reescrito.
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
  onSuggest: (includePhotos: boolean) => Promise<JournalAiSuggestion>;
  onApply: (input: JournalAiApplyInput) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  isSuggesting: boolean;
  isApplying: boolean;
}) {
  const [suggestion, setSuggestion] = useState<JournalAiSuggestion | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedCaptions, setSelectedCaptions] = useState<Set<string>>(new Set());
  const [includePhotos, setIncludePhotos] = useState<boolean>(readPhotosPref);
  const [error, setError] = useState<string | null>(null);
  const photos = media.filter((m) => m.kind === "photo");

  const togglePhotos = (on: boolean) => {
    setIncludePhotos(on);
    try {
      localStorage.setItem(PHOTOS_PREF, on ? "1" : "0");
    } catch {
      /* preferência só desta sessão */
    }
  };

  const requestSuggestion = async () => {
    setError(null);
    try {
      const s = await onSuggest(includePhotos && photos.length > 0);
      setSuggestion(s);
      setSelectedTags(new Set(s.suggestedTags));
      // Legenda sugerida já vem marcada só para fotos ainda sem legenda.
      setSelectedCaptions(new Set(s.photoNotes.filter((p) => p.suggestedCaption && !photos.find((m) => m.id === p.id)?.caption).map((p) => p.id)));
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
        highlights: suggestion.highlights,
        gratitude: suggestion.gratitude,
        categories: suggestion.categories,
        mediaCategories: suggestion.mediaCategories,
        mediaCaptions: suggestion.photoNotes
          .filter((p) => p.suggestedCaption && selectedCaptions.has(p.id))
          .map((p) => ({ id: p.id, caption: p.suggestedCaption as string })),
        tagsToAdd: Array.from(selectedTags),
      });
      setSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a organização.");
    }
  };

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const view = suggestion ?? saved;
  const mediaName = (id: string) => {
    const m = media.find((x) => x.id === id);
    return m?.caption ?? m?.fileName ?? "Mídia";
  };

  const photoToggle = photos.length > 0 && (
    <label className="flex items-start gap-2 text-xs text-slate cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-brand-600" checked={includePhotos} onChange={(e) => togglePhotos(e.target.checked)} />
      <span>
        <span className="inline-flex items-center gap-1 font-semibold text-inherit">
          <Camera size={12} /> Incluir minhas fotos na análise
        </span>
        <span className="block">
          {photos.length > 4 ? "As 4 primeiras fotos" : `${photos.length === 1 ? "A foto" : `As ${photos.length} fotos`}`} do dia serão enviadas ao Gemini só neste pedido. Sem marcar, a IA usa apenas o que você escreveu.
        </span>
      </span>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-100">
          <Sparkles size={10} /> Inferência da IA
        </span>
        <span className="text-[11px] text-slate">Baseada no seu texto, na sua gratidão e nas histórias das mídias — nada é inventado.</span>
      </div>

      {!view && (
        <div className="rounded-xl border border-dashed border-paper-border dark:border-ink-border p-4 space-y-3">
          <p className="text-sm text-slate text-center">O Gemini sugere um título, resume o dia, destaca os momentos marcantes, reflete sobre sua gratidão e organiza tudo por temas. Você revisa antes de salvar.</p>
          {photoToggle}
          <div className="text-center">
            <Button className="!from-brand-500 !to-brand-700 !shadow-glow-brand" onClick={requestSuggestion} disabled={isSuggesting}>
              {isSuggesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {isSuggesting ? (includePhotos && photos.length > 0 ? "Lendo texto e fotos…" : "Organizando…") : "Organizar com IA"}
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view && (
          <motion.div
            key={suggestion ? "suggestion" : "saved"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-xl p-4 border space-y-3 ${suggestion ? "border-brand-500/40 bg-brand-50/60 dark:bg-brand-700/10" : "border-paper-border dark:border-ink-border"}`}
          >
            {suggestion && (
              <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-100">
                Prévia — ainda não salva{suggestion.photosAnalyzed > 0 ? ` · ${suggestion.photosAnalyzed} foto(s) analisada(s)` : ""}
              </p>
            )}
            <div>
              {view.title && <p className="font-display font-semibold text-lg leading-tight">{view.title}</p>}
              {view.summary && <p className="text-sm text-slate mt-1 leading-relaxed">{view.summary}</p>}
            </div>

            {view.highlights.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-signal-deep mb-1.5 flex items-center gap-1">
                  <Star size={12} /> Momentos marcantes
                </p>
                <ul className="space-y-1">
                  {view.highlights.map((h, i) => (
                    <li key={i} className="text-sm leading-relaxed flex gap-2">
                      <span className="text-signal mt-[2px]">✦</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {view.gratitude && (
              <div className="rounded-xl border border-cat-pink/30 bg-cat-pink/[0.06] p-3">
                <p className="text-[11px] font-semibold text-cat-pink mb-1 flex items-center gap-1">
                  <Heart size={12} /> Sua gratidão de hoje
                </p>
                <p className="text-sm leading-relaxed">{view.gratitude}</p>
              </div>
            )}

            {view.categories.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            )}

            {suggestion && suggestion.photoNotes.length > 0 && (
              <div>
                <p className="text-[11px] text-slate mb-1.5 flex items-center gap-1">
                  <Camera size={11} /> Suas fotos — descrição é inferência visual da IA
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {suggestion.photoNotes.map((p) => {
                    const m = media.find((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="flex gap-2.5 rounded-xl border border-paper-border dark:border-ink-border p-2">
                        {m && <img src={m.dataUri} alt={m.caption ?? "Foto do dia"} className="w-16 h-16 shrink-0 rounded-lg object-cover" />}
                        <div className="min-w-0 text-xs space-y-1">
                          <p className="text-slate">{p.description}</p>
                          {p.suggestedCaption && (
                            <label className="flex items-start gap-1.5 cursor-pointer">
                              <input type="checkbox" className="mt-0.5 accent-brand-600" checked={selectedCaptions.has(p.id)} onChange={() => setSelectedCaptions((s) => toggle(s, p.id))} />
                              <span>
                                Usar legenda: <strong>{p.suggestedCaption}</strong>
                                {m?.caption ? <span className="text-slate"> (substitui “{m.caption}”)</span> : null}
                              </span>
                            </label>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {suggestion && suggestion.mediaCategories.length > 0 && (
              <div>
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
              <div>
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
                        onClick={() => setSelectedTags((s) => toggle(s, tag))}
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

            {!suggestion && photoToggle}

            <div className="flex flex-wrap gap-2 pt-1">
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

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-drop" role="alert">
          <span>{error}</span>
          <button type="button" onClick={requestSuggestion} className="underline font-semibold" disabled={isSuggesting}>
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
