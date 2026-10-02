import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, Check, MessageCircleQuestion, PenLine, RotateCcw, Sparkles, Sunrise, X } from "lucide-react";
import type { JournalWritingAssist } from "@/types";
import { AiThinking, ProvenanceBadge } from "@/components/experiments/AiThinking";

const THINKING = ["Lendo seus registros de hoje…", "Juntando tarefas, saúde e leitura…", "Escrevendo na sua voz…"];

/**
 * Assistente de escrita do Diário. No lugar de perguntas fixas, a IA faz
 * perguntas sobre o que de fato aconteceu no dia, propõe um rascunho e
 * ideias para amanhã. Tudo é sugestão: só entra no texto quando o usuário
 * clica — nada é salvo pela IA.
 */
export function JournalWritingAssistant({
  onAssist,
  isLoading,
  onInsertDraft,
  onInsertQuestion,
  onUseTakeaway,
}: {
  onAssist: (notes?: string) => Promise<JournalWritingAssist>;
  isLoading: boolean;
  onInsertDraft: (text: string) => void;
  onInsertQuestion: (question: string) => void;
  onUseTakeaway: (text: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<JournalWritingAssist | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const r = await onAssist(notes.trim() || undefined);
      setResult(r);
      setUsed(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível falar com a IA agora.");
    }
  };

  const mark = (key: string) => setUsed((prev) => new Set(prev).add(key));

  return (
    <div className="rounded-2xl border border-cat-purple/25 bg-gradient-to-br from-cat-purple/[0.07] via-transparent to-cat-pink/[0.05] p-3 sm:p-4">
      <div className="flex items-start gap-2 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cat-purple/12 text-cat-purple">
          <Sparkles size={10} /> Escrever com a IA
        </span>
        <span className="text-[11px] text-slate leading-snug">
          Usa só o que você registrou hoje no LifeOS e o que já escreveu. Nada entra no texto sem você clicar.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="sr-only" htmlFor="journal-quick-notes">Anotações soltas</label>
        <input
          id="journal-quick-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) run();
          }}
          maxLength={2000}
          placeholder="Palavras soltas (opcional): reunião longa, almoço com a família, cansado à tarde…"
          className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-purple transition-colors"
        />
        <button
          type="button"
          onClick={run}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cat-purple to-cat-pink shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {result ? <RotateCcw size={14} /> : <PenLine size={14} />}
          {result ? "Gerar de novo" : "Me ajude a escrever"}
        </button>
      </div>

      {error && <p className="text-xs text-drop mt-2" role="alert">{error}</p>}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
            <AiThinking messages={THINKING} />
          </motion.div>
        ) : result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 space-y-4"
          >
            {result.dataUsed.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ProvenanceBadge kind="dado" />
                  <span className="text-[11px] text-slate">O que a IA leu do seu dia</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.dataUsed.map((fact, i) => (
                    <motion.span
                      key={fact}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-full px-2.5 py-1 text-[11px] bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
                    >
                      {fact}
                    </motion.span>
                  ))}
                </div>
              </div>
            )}

            {result.questions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ProvenanceBadge kind="sugestao" />
                  <span className="text-[11px] text-slate">Perguntas sobre o seu dia — toque para responder no texto</span>
                </div>
                <div className="grid gap-1.5">
                  {result.questions.map((q) => {
                    const done = used.has(`q:${q}`);
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={done}
                        onClick={() => {
                          onInsertQuestion(q);
                          mark(`q:${q}`);
                        }}
                        className={`flex items-start gap-2 text-left text-sm rounded-xl px-3 py-2 border transition-colors ${
                          done
                            ? "border-transparent bg-cat-purple/10 text-cat-purple/70"
                            : "border-paper-border dark:border-ink-border hover:border-cat-purple bg-paper dark:bg-ink"
                        }`}
                      >
                        {done ? <Check size={15} className="mt-0.5 shrink-0" /> : <MessageCircleQuestion size={15} className="mt-0.5 shrink-0 text-cat-purple" />}
                        <span>{q}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {result.draft && !used.has("draft:dismissed") && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ProvenanceBadge kind="sugestao" />
                  <span className="text-[11px] text-slate">Rascunho — edite à vontade depois de inserir</span>
                </div>
                <div className="rounded-xl border border-dashed border-cat-purple/40 bg-paper dark:bg-ink p-3">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{result.draft}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={used.has("draft")}
                      onClick={() => {
                        onInsertDraft(result.draft ?? "");
                        mark("draft");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-purple text-white hover:bg-cat-purple/90 disabled:opacity-60 transition-all"
                    >
                      {used.has("draft") ? <Check size={13} /> : <ArrowDownToLine size={13} />}
                      {used.has("draft") ? "Inserido" : "Inserir no texto"}
                    </button>
                    {!used.has("draft") && (
                      <button
                        type="button"
                        onClick={() => mark("draft:dismissed")}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      >
                        <X size={13} /> Descartar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {result.takeaways.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ProvenanceBadge kind="sugestao" />
                  <span className="text-[11px] text-slate">Ideias para "O que levo para amanhã"</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.takeaways.map((t) => {
                    const done = used.has(`t:${t}`);
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={done}
                        onClick={() => {
                          onUseTakeaway(t);
                          mark(`t:${t}`);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                          done ? "border-transparent bg-cat-purple/10 text-cat-purple/70" : "border-paper-border dark:border-ink-border hover:border-cat-purple"
                        }`}
                      >
                        {done ? <Check size={12} /> : <Sunrise size={12} className="text-signal" />}
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
