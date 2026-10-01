import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Bot, Check, ChevronRight, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { ProvenanceBadge } from "./AiThinking";
import { useExperiment } from "@/hooks/useExperiment";
import { experimentEmoji } from "./experimentDisplay";
import type { ExperimentCheckinStatus, ExperimentListItem, ExperimentLogProposal, ExperimentPerception } from "@/types";

/**
 * Check-in de hoje com um toque, para cada experimento ativo.
 *  - Manual: "Cumpri" / "Não cumpri" + como se sentiu + nota rápida.
 *  - Automático: mostra o que o LifeOS já verificou; se ainda não há dado,
 *    leva ao módulo de origem (Saúde, Foco…), sem permitir "forjar" o check-in.
 */

const PERCEPTIONS: Array<{ value: ExperimentPerception; emoji: string; label: string }> = [
  { value: "muito_ruim", emoji: "😞", label: "Muito ruim" },
  { value: "ruim", emoji: "🙁", label: "Ruim" },
  { value: "neutro", emoji: "😐", label: "Neutro" },
  { value: "bom", emoji: "🙂", label: "Bom" },
  { value: "muito_bom", emoji: "😄", label: "Muito bom" },
];

/** Onde o dado que a regra automática lê é registrado. */
const RULE_SOURCE: Record<string, { path: string; label: string }> = {
  sleep_before: { path: "/saude", label: "Registrar sono" },
  water_target: { path: "/saude", label: "Registrar água" },
  exercise_minimum: { path: "/saude", label: "Registrar exercício" },
  focus_minimum: { path: "/foco", label: "Abrir Focus" },
  reading_pages_minimum: { path: "/biblioteca", label: "Registrar leitura" },
  study_minimum: { path: "/educacao", label: "Registrar estudo" },
  habit_completion: { path: "/habitos", label: "Marcar hábito" },
};

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function TodayRow({ experiment, question }: { experiment: ExperimentListItem; question?: string | null }) {
  const { detail, upsertLog, isSavingLog, parseLog, isParsingLog } = useExperiment(experiment.id);
  const [storyOpen, setStoryOpen] = useState(false);
  const [story, setStory] = useState("");
  const [proposal, setProposal] = useState<ExperimentLogProposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const today = localToday();
  const day = detail?.checkins.find((c) => c.date === today) ?? null;
  const log = detail?.logs.find((l) => l.log_date === today) ?? null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  // Pequena celebração ao marcar "Cumpri" (chave nova a cada clique reinicia a animação).
  const [celebrate, setCelebrate] = useState(0);
  const automatic = experiment.verification_type === "automatic";

  const save = (patch: { checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) =>
    upsertLog({ logDate: today, ...patch }).catch(() => undefined);

  const status = day?.status ?? "pending";

  // Relato livre → a IA propõe status/percepção/nota; só grava depois da confirmação.
  const interpret = async () => {
    setAiError(null);
    try {
      setProposal(await parseLog({ text: story.trim(), date: today }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Não foi possível interpretar agora.");
    }
  };
  const confirmProposal = async () => {
    if (!proposal) return;
    // O que a IA não identificou (null) não sobrescreve o que já estava marcado.
    await save({
      checkinStatus: automatic || !proposal.checkinStatus ? undefined : proposal.checkinStatus,
      perception: proposal.perception ?? undefined,
      notes: proposal.notes,
    });
    setProposal(null);
    setStory("");
    setStoryOpen(false);
  };

  return (
    <li className="rounded-xl border border-paper-border dark:border-ink-border p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="relative w-9 h-9 rounded-xl bg-cat-purple/10 flex items-center justify-center shrink-0 text-xl leading-none">
          {experimentEmoji(experiment)}
          <AnimatePresence>
            {celebrate > 0 && (
              <motion.span key={celebrate} className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, delay: 0.5 }}>
                {Array.from({ length: 8 }).map((_, k) => {
                  const angle = (k / 8) * Math.PI * 2;
                  return (
                    <motion.span
                      key={k}
                      className="absolute left-1/2 top-1/2 text-xs"
                      initial={{ x: 0, y: 0, scale: 0.4 }}
                      animate={{ x: Math.cos(angle) * 28, y: Math.sin(angle) * 28, scale: 1 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                      {k % 2 ? "✨" : "🎉"}
                    </motion.span>
                  );
                })}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <Link to={`/experimentos/${experiment.id}`} className="min-w-0 flex-1 group">
          <p className="text-sm font-semibold truncate group-hover:text-cat-purple">{experiment.title}</p>
          <p className="text-[10px] text-slate">Dia {experiment.daysElapsed} de {experiment.durationDays}</p>
        </Link>

        {automatic && day?.source === "automatic" ? (
          <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", status === "done" ? "bg-cat-green/12 text-cat-green" : "bg-drop/10 text-drop")}>
            <Bot size={12} /> {status === "done" ? "Cumprido (automático)" : "Não cumprido (automático)"}
          </span>
        ) : automatic ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate">
            <Bot size={12} /> Aguardando registro do dia
          </span>
        ) : (
          <div className="flex gap-1.5" role="group" aria-label="Você cumpriu hoje?">
            {(["done", "missed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={isSavingLog}
                onClick={() => {
                  if (s === "done" && status !== "done") setCelebrate((v) => v + 1);
                  void save({ checkinStatus: status === s ? null : s });
                }}
                aria-pressed={status === s}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors",
                  s === "done"
                    ? status === "done"
                      ? "bg-cat-green text-white border-cat-green"
                      : "border-paper-border dark:border-ink-border hover:border-cat-green hover:text-cat-green"
                    : status === "missed"
                      ? "bg-drop text-white border-drop"
                      : "border-paper-border dark:border-ink-border hover:border-drop hover:text-drop"
                )}
              >
                {isSavingLog ? <Loader2 size={12} className="animate-spin" /> : s === "done" ? <Check size={12} /> : <X size={12} />}
                {s === "done" ? "Cumpri" : "Não cumpri"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 mt-2.5">
        <span className="text-[10px] text-slate mr-1">Como se sentiu?</span>
        {PERCEPTIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            title={p.label}
            aria-label={p.label}
            aria-pressed={log?.perception === p.value}
            onClick={() => save({ perception: log?.perception === p.value ? null : p.value })}
            className={clsx(
              "w-8 h-8 rounded-full text-base leading-none transition-transform hover:scale-110",
              log?.perception === p.value ? "bg-cat-pink/15 ring-2 ring-cat-pink/60" : "opacity-60 hover:opacity-100"
            )}
          >
            {p.emoji}
          </button>
        ))}
        <button type="button" onClick={() => { setNote(log?.notes ?? ""); setNoteOpen((v) => !v); }} className="ml-auto text-[11px] font-medium text-cat-purple hover:underline">
          {log?.notes ? "Editar nota" : "Adicionar nota"}
        </button>
        {automatic && day?.source !== "automatic" && experiment.verification_rule && RULE_SOURCE[experiment.verification_rule] && (
          <Link to={RULE_SOURCE[experiment.verification_rule].path} className="text-[11px] text-slate hover:text-inherit inline-flex items-center">
            {RULE_SOURCE[experiment.verification_rule].label} <ChevronRight size={12} />
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStoryOpen((v) => !v)}
        aria-expanded={storyOpen}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cat-purple hover:underline"
      >
        <Wand2 size={12} /> Contar como foi o dia (IA preenche o check-in)
      </button>

      <AnimatePresence initial={false}>
        {storyOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 rounded-xl border border-cat-purple/25 bg-cat-purple/[0.04] p-3">
              {question && <p className="text-[11px] text-cat-pink font-semibold mb-1.5">Pergunta do Copilot: {question}</p>}
              <textarea
                value={story}
                onChange={(e) => setStory(e.target.value)}
                rows={2}
                maxLength={1500}
                placeholder="Ex.: Consegui dormir às 22h40, acordei mais disposto, mas à tarde bateu cansaço."
                aria-label="Como foi o seu dia"
                className="w-full rounded-lg px-3 py-2 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={interpret}
                  disabled={isParsingLog || story.trim().length < 3}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-purple text-white disabled:opacity-50"
                >
                  {isParsingLog ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Interpretar
                </button>
              </div>
              {aiError && <p className="text-[11px] text-drop mt-2">{aiError}</p>}
              <AnimatePresence>
                {proposal && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-lg bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold mb-2">
                      <ProvenanceBadge kind="inferencia" /> O Copilot entendeu assim — confira antes de salvar
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {!automatic && (
                        <span className={clsx("rounded-full px-2 py-0.5 font-semibold", proposal.checkinStatus === "done" ? "bg-cat-green/12 text-cat-green" : proposal.checkinStatus === "missed" ? "bg-drop/10 text-drop" : "bg-slate/12 text-slate")}>
                          {proposal.checkinStatus === "done" ? "Cumpriu" : proposal.checkinStatus === "missed" ? "Não cumpriu" : "Cumprimento não identificado"}
                        </span>
                      )}
                      <span className="rounded-full px-2 py-0.5 bg-cat-pink/12 text-cat-pink font-semibold">
                        {proposal.perception ? `${PERCEPTIONS.find((p) => p.value === proposal.perception)?.emoji} ${PERCEPTIONS.find((p) => p.value === proposal.perception)?.label}` : "Sentimento não identificado"}
                      </span>
                    </div>
                    <p className="text-sm mt-2">“{proposal.notes}”</p>
                    {proposal.reasoning && <p className="text-[10px] text-slate mt-1">Base: {proposal.reasoning}</p>}
                    <div className="flex justify-end gap-2 mt-2.5">
                      <button type="button" onClick={() => setProposal(null)} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:text-inherit">
                        Descartar
                      </button>
                      <button type="button" onClick={confirmProposal} disabled={isSavingLog} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-green text-white disabled:opacity-50">
                        <Check size={12} /> Salvar check-in
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {noteOpen && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              await save({ notes: note.trim() || null });
              setNoteOpen(false);
            }}
          >
            <div className="flex gap-2 mt-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="O que você notou hoje?"
                aria-label="Observação do dia"
                className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm bg-transparent border border-paper-border dark:border-ink-border outline-none focus:border-cat-purple"
              />
              <button type="submit" disabled={isSavingLog} className="rounded-lg px-3 py-2 text-xs font-semibold bg-cat-purple text-white disabled:opacity-50">
                Salvar
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </li>
  );
}

export function ExperimentTodayCheckin({ experiments, question }: { experiments: ExperimentListItem[]; question?: string | null }) {
  const active = experiments.filter((e) => e.status === "active");
  if (active.length === 0) return null;
  return (
    <section aria-labelledby="exp-today-title" className="rounded-2xl border border-cat-purple/25 bg-gradient-to-br from-cat-purple/[0.06] to-transparent p-4 md:p-5">
      <p id="exp-today-title" className="font-display font-semibold text-[15px]">Check-in de hoje</p>
      <p className="text-xs text-slate mb-3">Um toque por experimento. Os automáticos o LifeOS confere sozinho pelos seus registros.</p>
      <ul className="space-y-2">
        {active.map((e) => (
          <TodayRow key={e.id} experiment={e} question={question} />
        ))}
      </ul>
    </section>
  );
}
