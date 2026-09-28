import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Brain,
  Lightbulb,
  Heart,
  Sparkles,
  Moon,
  BookOpen,
  Check,
  Loader2,
  Save,
  ListChecks,
  Repeat,
  Droplets,
  Dumbbell,
  Flame,
  Quote,
  Award,
  CalendarDays,
  Type as TypeIcon,
  Plus,
} from "lucide-react";
import { useJournal, useJournalInsights, useJournalDays, useJournalCalendarMonth, useJournalCollections } from "@/hooks/useJournal";
import type { JournalDaySummary, JournalCollectionInput } from "@/services/journalService";
import type { JournalCollection } from "@/types";
import { useHabits } from "@/hooks/useHabits";
import { useAnalyticsOverview, useInsights } from "@/hooks/useAnalytics";
import { DashboardInsights, type StreakHighlight } from "@/components/dashboard/DashboardInsights";
import { Card, EmptyState } from "@/components/ui/primitives";
import { RichTextEditor } from "@/components/journal/RichTextEditor";

/* ============================================================
   Diário — inspirado no app Diário/Journal da Apple (macOS Tahoe):
   masthead com o gradiente suave do ícone do app, um painel de
   "Insights" real sobre o hábito de escrever (sequência, recorde,
   entradas, palavras — nunca inventado, sempre derivado de
   journal_entries), cartões com uma leve resposta de hover/toque, e
   seções responsivas de celular a desktop (1 coluna no mobile, até 3
   no desktop).

   Automático (sempre ao vivo de outro módulo, nunca digitado aqui):
   humor/energia/sono (Saúde), insight do dia (Copilot), insights da
   semana (Analytics — mesmo componente do Dashboard), hábitos e
   sequência (Hábitos), água, exercício, páginas lidas e livro atual
   (Biblioteca), provérbio/versículo do dia (conteúdo curado).

   Manual (o "diário" de verdade, salvo em journal_entries): intenção,
   reflexões, gratidão, cuidado comigo, desafios, revisão da noite —
   com autosave: salva sozinho ~900ms depois de parar de digitar, e
   na hora ao sair do campo ou marcar um item.
   ============================================================ */

/**
 * Conta de 0 até `value` em ~700ms — o mesmo tipo de "contador subindo"
 * que o painel Insights do Diário da Apple usa pros números de
 * streak/palavras. Um único momento orquestrado na entrada do valor
 * (não em cada hover), e pula direto pro valor final se o sistema
 * pedir "reduzir movimento".
 */
function useCountUp(value: number, durationMs = 700) {
  const [display, setDisplay] = useState(0);
  const prefersReducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );
  useEffect(() => {
    if (prefersReducedMotion || value === 0) {
      setDisplay(value);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, prefersReducedMotion]);
  return display;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MOOD_EMOJI = ["😠", "😟", "😕", "🙂", "😀"];
const MOOD_LABEL = ["Raiva", "Ansiedade", "Frustração", "Alegria", "Bem"];
const AUTOSAVE_DELAY_MS = 900;

const SELF_CARE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "meditar", label: "Meditar / respirar" },
  { key: "exercicio", label: "Fazer exercício" },
  { key: "ler", label: "Ler algo" },
  { key: "evitar_redes", label: "Evitar redes sociais em excesso" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatHeaderDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fmtMinutes(min: number) {
  if (min <= 0) return "0min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 sm:p-5 border-t-2 border-t-cat-pink/40 flex flex-col transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99] ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cat-pink shrink-0">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {subtitle ? <p className="text-xs text-slate italic mb-3">{subtitle}</p> : <div className="mb-3" />}
      <div className="flex-1">{children}</div>
    </Card>
  );
}

/** Chip compacto de estatística do dia — usado na faixa de resumo automático do masthead. */
function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/70 dark:bg-white/[0.06] min-w-0">
      <span className={tone}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight truncate">{value}</p>
        <p className="text-[10px] text-slate leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}

type FormState = {
  intention: string;
  thoughts: string;
  gratitude: string[];
  selfCare: string[];
  selfCareOther: string;
  challenges: string;
  lighterPlan: string;
  feelGood: string;
  nightMood: number | null;
  nightHelped: string;
  nightTakeaway: string;
  journalIds: string[];
};

const EMPTY_FORM: FormState = {
  intention: "",
  thoughts: "",
  gratitude: ["", "", ""],
  selfCare: [],
  selfCareOther: "",
  challenges: "",
  lighterPlan: "",
  feelGood: "",
  nightMood: null,
  nightHelped: "",
  nightTakeaway: "",
  journalIds: [],
};

/**
 * Editor imersivo de um dia — o antigo `DiarioPage` inteiro, agora
 * "encaixado" dentro da navegação por abas (Entradas/Insights/Calendário):
 * data e navegação de dia continuam controladas aqui, mas `date` vem do
 * componente pai pra permitir abrir um dia direto do feed ou do calendário.
 */
function DiaryDayEditor({ date, setDate, onBack }: { date: string; setDate: React.Dispatch<React.SetStateAction<string>>; onBack: () => void }) {
  const { entry, isLoading, save, isSaving } = useJournal(date);
  const { habits, summaryByHabitId } = useHabits();
  const { overview } = useAnalyticsOverview(14);
  const { insights: lifeInsights } = useInsights(30);
  const { insights } = useJournalInsights();
  const { collections } = useJournalCollections();
  const streakCount = useCountUp(insights?.currentStreak ?? 0);
  const longestCount = useCountUp(insights?.longestStreak ?? 0);
  const entriesCount = useCountUp(insights?.totalEntries ?? 0);
  const wordsCount = useCountUp(insights?.totalWords ?? 0);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza o form local com a entrada carregada — só quando ela muda de
  // fato (troca de dia ou primeiro load), nunca sobrescrevendo o que o
  // usuário está digitando no meio de uma sessão de edição.
  useEffect(() => {
    if (!entry) return;
    setForm({
      intention: entry.intention ?? "",
      thoughts: entry.thoughts ?? "",
      gratitude: [0, 1, 2].map((i) => entry.gratitude[i] ?? ""),
      selfCare: entry.selfCare,
      selfCareOther: entry.selfCareOther ?? "",
      challenges: entry.challenges ?? "",
      lighterPlan: entry.lighterPlan ?? "",
      feelGood: entry.feelGood ?? "",
      nightMood: entry.nightMood,
      nightHelped: entry.nightHelped ?? "",
      nightTakeaway: entry.nightTakeaway ?? "",
      journalIds: entry.journalIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.date]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  const persistNow = (state: FormState) => {
    save({
      intention: state.intention || null,
      thoughts: state.thoughts || null,
      gratitude: state.gratitude.filter((g) => g.trim().length > 0),
      selfCare: state.selfCare,
      selfCareOther: state.selfCareOther || null,
      challenges: state.challenges || null,
      lighterPlan: state.lighterPlan || null,
      feelGood: state.feelGood || null,
      nightMood: state.nightMood,
      nightHelped: state.nightHelped || null,
      nightTakeaway: state.nightTakeaway || null,
      journalIds: state.journalIds,
    }).catch(() => undefined);
  };

  /** Digitação: atualiza na hora e agenda o autosave (~900ms sem digitar) — é assim que o diário "escreve sozinho" no banco. */
  const updateField = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistNow(next), AUTOSAVE_DELAY_MS);
      return next;
    });
  };

  /** Saída do campo ou toggle (checkbox/humor da noite): salva imediatamente, sem esperar o debounce. */
  const saveNow = (patch: Partial<FormState> = {}) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      persistNow(next);
      return next;
    });
  };

  /** Botão "Salvar" explícito do masthead: força salvar tudo agora (o autosave já cobre isso, mas o usuário pediu um botão pra confirmar que os dados foram gravados). */
  const saveAllNow = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persistNow(form);
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    setJustSaved(true);
    justSavedTimer.current = setTimeout(() => setJustSaved(false), 2200);
  };

  const combinedSelfCare = useMemo(() => {
    const auto = entry?.auto.autoSelfCare ?? [];
    return new Set([...auto, ...form.selfCare]);
  }, [entry, form.selfCare]);

  const toggleSelfCare = (key: string) => {
    // itens auto-marcados por hábito real de hoje não podem ser desmarcados aqui —
    // desmarcar exigiria desfazer o check-in do hábito, o que é feito em Hábitos.
    if ((entry?.auto.autoSelfCare ?? []).includes(key)) return;
    const has = form.selfCare.includes(key);
    saveNow({ selfCare: has ? form.selfCare.filter((k) => k !== key) : [...form.selfCare, key] });
  };

  /** Marca/desmarca a que diário(s) o dia pertence — salva na hora, igual a um toggle de checkbox. */
  const toggleJournalCollection = (id: string) => {
    const has = form.journalIds.includes(id);
    saveNow({ journalIds: has ? form.journalIds.filter((j) => j !== id) : [...form.journalIds, id] });
  };

  const streakHighlight: StreakHighlight | null = useMemo(() => {
    let best: StreakHighlight | null = null;
    for (const h of habits) {
      const s = summaryByHabitId.get(h.id)?.currentStreak ?? 0;
      if (s > 0 && (!best || s > best.streak)) best = { habitName: h.name, streak: s };
    }
    return best;
  }, [habits, summaryByHabitId]);

  const currentWeekday = new Date(`${date}T00:00:00`).getDay();
  const book = entry?.auto.currentBook;
  const mood = entry?.auto.mood;
  const sleep = entry?.auto.sleep;
  const auto = entry?.auto;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8">
      {/* Masthead — inspirado no app Diário/Journal da Apple: gradiente suave do
          ícone do app, navegação de dia limpa, e um painel de Insights reais
          sobre o hábito de escrever (sequência, recorde, entradas, palavras) */}
      <div className="mb-5 sm:mb-6 rounded-2xl border border-paper-border dark:border-ink-border bg-gradient-to-br from-cat-pink/15 via-cat-purple/[0.06] to-transparent p-4 sm:p-6 sm:pt-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onBack}
              className="hidden sm:flex items-center gap-1 text-xs text-slate hover:text-cat-pink font-medium transition-colors pr-1"
            >
              <ChevronLeft size={14} />
              Entradas
            </button>
            <button
              onClick={() => setDate((d) => addDays(d, -1))}
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
              aria-label="Dia anterior"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
          <div className="text-center min-w-0">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-cat-pink truncate leading-none">Diário</p>
            <p className="text-[11px] sm:text-xs text-slate mt-1.5 capitalize truncate">{formatHeaderDate(date)}</p>
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            disabled={date >= todayIso()}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors disabled:opacity-30"
            aria-label="Próximo dia"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {collections.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {collections.map((col) => {
              const active = form.journalIds.includes(col.id);
              return (
                <button
                  key={col.id}
                  onClick={() => toggleJournalCollection(col.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    active ? COLLECTION_COLOR_CLASSES[col.color ?? "pink"] : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
                  }`}
                >
                  {col.icon && <span>{col.icon}</span>}
                  {col.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {WEEKDAYS.map((w, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors ${
                  i === currentWeekday ? "bg-cat-pink text-white" : "text-slate border border-paper-border dark:border-ink-border"
                }`}
              >
                {w}
              </span>
            ))}
          </div>
          {date !== todayIso() && (
            <button onClick={() => setDate(todayIso())} className="text-xs text-cat-pink font-medium underline underline-offset-2">
              Voltar para hoje
            </button>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <span className="flex items-center gap-1 text-[11px] text-slate">
              {isSaving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} className={justSaved ? "text-growth" : "text-slate/60"} />
              )}
              {isSaving ? "Salvando…" : justSaved ? "Salvo!" : "Salvo automaticamente"}
            </span>
            <button
              onClick={saveAllNow}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
            >
              <Save size={13} />
              Salvar
            </button>
          </div>
        </div>

        {/* Insights — o mesmo tipo de painel do Diário da Apple, mas 100% derivado
            de journal_entries reais (nunca inventado): sequência atual, recorde,
            total de entradas e de palavras escritas. */}
        {insights && (insights.totalEntries > 0 || insights.currentStreak > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatChip icon={<Flame size={14} />} label="Sequência atual" value={`${streakCount} ${streakCount === 1 ? "dia" : "dias"}`} tone="text-signal" />
            <StatChip icon={<Award size={14} />} label="Recorde" value={`${longestCount} ${longestCount === 1 ? "dia" : "dias"}`} tone="text-cat-purple" />
            <StatChip icon={<CalendarDays size={14} />} label="Entradas" value={`${entriesCount}`} tone="text-cat-blue" />
            <StatChip icon={<TypeIcon size={14} />} label="Palavras" value={wordsCount.toLocaleString("pt-BR")} tone="text-cat-green" />
          </div>
        )}

        {auto && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <StatChip icon={<ListChecks size={14} />} label="Tarefas" value={`${auto.tasksToday.done}/${auto.tasksToday.total}`} tone="text-cat-blue" />
              <StatChip icon={<Repeat size={14} />} label="Hábitos" value={`${auto.habitsToday.done}/${auto.habitsToday.total}`} tone="text-cat-green" />
              <StatChip icon={<Droplets size={14} />} label="Água" value={`${(auto.waterMl / 1000).toFixed(1)}L`} tone="text-cat-blue" />
              <StatChip icon={<Dumbbell size={14} />} label="Exercício" value={fmtMinutes(auto.exerciseMinutes)} tone="text-cat-green" />
              <StatChip icon={<BookOpen size={14} />} label="Leitura" value={`${auto.reading.pages}pág.`} tone="text-cat-pink" />
            </div>
            <p className="text-sm sm:text-base text-[#3a3430] dark:text-[#EDEBE4]/90 mt-4 text-center leading-relaxed">
              {auto.summary}
            </p>
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <DashboardInsights insights={lifeInsights} changePct={overview?.changePct ?? null} streak={streakHighlight} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <SectionCard icon={<Sun size={16} />} title="Intenção do dia" subtitle="Como quero me sentir hoje?">
              <RichTextEditor value={form.intention} onChange={(v) => updateField({ intention: v })} onBlur={() => saveNow()} placeholder="Como quero me sentir hoje?" />
            </SectionCard>

            <SectionCard
              icon={<Quote size={16} />}
              title={auto?.dailyQuote.kind === "versiculo" ? "Versículo do dia" : "Provérbio do dia"}
              subtitle="Uma pausa para reflexão"
            >
              {auto?.dailyQuote ? (
                <blockquote className="flex flex-col gap-2">
                  <p className="italic text-[15px] leading-relaxed text-[#3a3430] dark:text-[#EDEBE4]/90">
                    “{auto.dailyQuote.text}”
                  </p>
                  <footer className="text-[11px] text-cat-pink font-semibold not-italic">— {auto.dailyQuote.source}</footer>
                </blockquote>
              ) : (
                <p className="text-xs text-slate">Carregando reflexão do dia…</p>
              )}
            </SectionCard>

            <SectionCard icon={<Heart size={16} />} title="Meu estado hoje" subtitle="Registrado em Saúde">
              {mood ? (
                <div className="flex items-center justify-between">
                  {MOOD_EMOJI.map((emoji, i) => (
                    <div key={i} className={`flex flex-col items-center gap-1 ${mood.mood === i + 1 ? "" : "opacity-30"}`}>
                      <span className="text-2xl">{emoji}</span>
                      <span className="text-[10px] text-slate">{MOOD_LABEL[i]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate">
                  Ainda sem humor registrado hoje.{" "}
                  <Link to="/saude" className="text-cat-pink font-medium">
                    Registrar em Saúde →
                  </Link>
                </p>
              )}
            </SectionCard>

            <SectionCard icon={<Sparkles size={16} />} title="Energia e sono" subtitle="Registrados em Saúde">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-slate mb-1">Nível de energia</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`h-2 flex-1 rounded-full ${mood && n <= mood.energy ? "bg-cat-pink" : "bg-paper-border dark:bg-ink-border"}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-slate mb-1">Qualidade do sono</p>
                  <p className="text-sm font-semibold">
                    {sleep?.qualityScore ? `${sleep.qualityScore}/5` : "Sem registro"}
                    {sleep?.durationMinutes ? <span className="text-xs text-slate font-normal"> · {fmtMinutes(sleep.durationMinutes)}</span> : null}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard icon={<Brain size={16} />} title="Pensamentos e reflexões" subtitle="O que está passando pela minha mente hoje?" className="xl:col-span-2">
              <RichTextEditor value={form.thoughts} onChange={(v) => updateField({ thoughts: v })} onBlur={() => saveNow()} placeholder="O que está passando pela minha mente hoje?" minHeightClass="min-h-[104px]" />
            </SectionCard>

            <SectionCard icon={<Lightbulb size={16} />} title="Insight do dia" subtitle="Gerado pelo LifeOS Copilot a partir dos seus dados reais">
              {entry?.auto.insightText ? (
                <p className="text-sm">{entry.auto.insightText}</p>
              ) : (
                <p className="text-xs text-slate">
                  Ainda não há insight gerado para hoje.{" "}
                  <Link to="/dashboard" className="text-cat-pink font-medium">
                    Gerar no Dashboard →
                  </Link>
                </p>
              )}
            </SectionCard>

            <SectionCard icon={<Heart size={16} />} title="Gratidão" subtitle="Hoje sou grato por:">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    value={form.gratitude[i]}
                    onChange={(e) => updateField({ gratitude: form.gratitude.map((g, gi) => (gi === i ? e.target.value : g)) })}
                    onBlur={() => saveNow()}
                    placeholder={`${i + 1}.`}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard icon={<Sparkles size={16} />} title="Cuidado comigo" subtitle="O que posso fazer para manter minha mente tranquila hoje?">
              <div className="space-y-1.5">
                {SELF_CARE_OPTIONS.map((opt) => {
                  const isAuto = (entry?.auto.autoSelfCare ?? []).includes(opt.key);
                  const checked = combinedSelfCare.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleSelfCare(opt.key)}
                      className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    >
                      <span
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all duration-150 motion-safe:active:scale-90 ${
                          checked
                            ? "bg-cat-pink border-cat-pink text-white scale-100"
                            : "border-paper-border dark:border-ink-border scale-90"
                        }`}
                      >
                        {checked && <Check size={11} className="motion-safe:animate-check-pop" />}
                      </span>
                      <span className="text-xs">{opt.label}</span>
                      {isAuto && <span className="text-[10px] text-cat-pink ml-auto shrink-0">hábito de hoje</span>}
                    </button>
                  );
                })}
                <input
                  value={form.selfCareOther}
                  onChange={(e) => updateField({ selfCareOther: e.target.value })}
                  onBlur={() => saveNow()}
                  placeholder="Outro…"
                  className="w-full mt-1 rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                />
              </div>
            </SectionCard>

            <SectionCard icon={<Brain size={16} />} title="Desafios" subtitle="O que pode me gerar ansiedade hoje? Como posso lidar?">
              <RichTextEditor value={form.challenges} onChange={(v) => updateField({ challenges: v })} onBlur={() => saveNow()} placeholder="O que pode me gerar ansiedade hoje? Como posso lidar?" />
            </SectionCard>

            <SectionCard icon={<Sun size={16} />} title="Como posso tornar este dia mais leve?">
              <RichTextEditor value={form.lighterPlan} onChange={(v) => updateField({ lighterPlan: v })} onBlur={() => saveNow()} placeholder="Como posso tornar este dia mais leve?" />
            </SectionCard>

            <SectionCard icon={<Heart size={16} />} title="O que me fez bem hoje?" subtitle="Pequenos momentos que importam.">
              <RichTextEditor value={form.feelGood} onChange={(v) => updateField({ feelGood: v })} onBlur={() => saveNow()} placeholder="Pequenos momentos que importam." />
            </SectionCard>

            {book && (
              <SectionCard icon={<BookOpen size={16} />} title="Leitura atual" subtitle="Registrado na Biblioteca">
                <div className="flex gap-3">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-10 h-[60px] object-cover rounded-md shrink-0 border border-paper-border dark:border-ink-border" />
                  ) : (
                    <div className="w-10 h-[60px] rounded-md shrink-0 bg-cat-pink/10 flex items-center justify-center">
                      <BookOpen size={16} className="text-cat-pink" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{book.title}</p>
                    {book.author && <p className="text-xs text-slate truncate">{book.author}</p>}
                    {entry.auto.reading.minutes > 0 && (
                      <p className="text-[11px] text-slate mt-1">
                        {fmtMinutes(entry.auto.reading.minutes)} lidos hoje · {entry.auto.reading.pages} páginas
                      </p>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

            {streakHighlight && (
              <SectionCard icon={<Flame size={16} />} title="Sequência em destaque" subtitle="Seu hábito mais consistente agora">
                <div className="flex items-center gap-2.5">
                  <Flame size={20} className="text-signal" />
                  <div>
                    <p className="text-sm font-semibold">{streakHighlight.habitName}</p>
                    <p className="text-xs text-slate">{streakHighlight.streak} dias seguidos</p>
                  </div>
                </div>
                <Link to="/habitos" className="text-xs text-cat-pink font-medium mt-2 inline-block">
                  Ver hábitos →
                </Link>
              </SectionCard>
            )}

            <Card className="p-4 sm:p-5 sm:col-span-2 xl:col-span-3 border-t-2 border-t-cat-purple/40">
              <div className="flex items-center gap-2 mb-3">
                <Moon size={16} className="text-cat-purple" />
                <p className="text-sm font-semibold">Revisão da noite</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate mb-2">Como me sinto agora?</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => saveNow({ nightMood: n })}
                        className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center border ${
                          form.nightMood === n ? "bg-cat-purple text-white border-cat-purple" : "border-paper-border dark:border-ink-border"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate mb-2">O que me ajudou a reduzir a ansiedade hoje?</p>
                  <RichTextEditor value={form.nightHelped} onChange={(v) => updateField({ nightHelped: v })} onBlur={() => saveNow()} placeholder="O que me ajudou a reduzir a ansiedade hoje?" minHeightClass="min-h-[52px]" />
                </div>
                <div>
                  <p className="text-xs text-slate mb-2">O que levo para amanhã?</p>
                  <RichTextEditor value={form.nightTakeaway} onChange={(v) => updateField({ nightTakeaway: v })} onBlur={() => saveNow()} placeholder="O que levo para amanhã?" minHeightClass="min-h-[52px]" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

type ViewKey = "feed" | "insights" | "calendar" | "collections";

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: "feed", label: "Entradas" },
  { key: "insights", label: "Insights" },
  { key: "calendar", label: "Calendário" },
  { key: "collections", label: "Diários" },
];

function TabBar({ active, onChange }: { active: ViewKey; onChange: (t: ViewKey) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-1 w-fit overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            active === tab.key ? "bg-white dark:bg-ink-raised text-cat-pink shadow-sm" : "text-slate hover:text-inherit"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const COLLECTION_COLOR_CLASSES: Record<string, string> = {
  pink: "bg-cat-pink/15 text-cat-pink",
  blue: "bg-cat-blue/15 text-cat-blue dark:text-cat-blue-dark",
  purple: "bg-cat-purple/15 text-cat-purple dark:text-cat-purple-dark",
  green: "bg-cat-green/15 text-cat-green dark:text-cat-green-dark",
  teal: "bg-cat-teal/15 text-cat-teal dark:text-cat-teal-dark",
};

/** Chips de filtro por diário (coleção) — "Todos" + um chip por diário criado; usado em Entradas e Calendário. */
function JournalFilterChips({
  collections,
  active,
  onChange,
}: {
  collections: JournalCollection[];
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  if (collections.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          active === null ? "bg-cat-pink text-white" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
        }`}
      >
        Todos
      </button>
      {collections.map((col) => (
        <button
          key={col.id}
          onClick={() => onChange(col.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
            active === col.id ? "bg-cat-pink text-white" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate hover:text-inherit"
          }`}
        >
          {col.icon && <span>{col.icon}</span>}
          {col.name}
        </button>
      ))}
    </div>
  );
}

function formatCardDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = todayIso();
  const yesterday = addDays(today, -1);
  if (date === today) return "Hoje";
  if (date === yesterday) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

/** Um card do feed "Entradas" — resumo de um dia real, nunca inventado, com o mesmo hover/press das seções do editor. */
function DayCard({ day, collections, onOpen }: { day: JournalDaySummary; collections: JournalCollection[]; onOpen: () => void }) {
  const dayCollections = collections.filter((c) => day.journalIds.includes(c.id));
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised p-4 sm:p-5 shadow-card dark:shadow-card-dark transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold capitalize">{formatCardDate(day.date)}</p>
        {day.mood && <span className="text-lg leading-none shrink-0">{MOOD_EMOJI[day.mood.mood - 1]}</span>}
      </div>
      <p className="text-sm text-slate leading-relaxed line-clamp-3">{day.preview}</p>
      {dayCollections.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {dayCollections.map((c) => (
            <span key={c.id} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${COLLECTION_COLOR_CLASSES[c.color ?? "pink"]}`}>
              {c.icon} {c.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-slate">
        <span className="flex items-center gap-1">
          <TypeIcon size={11} />
          {day.wordCount} palavras
        </span>
        {day.gratitudeCount > 0 && (
          <span className="flex items-center gap-1">
            <Heart size={11} />
            {day.gratitudeCount} gratidão
          </span>
        )}
        {day.selfCareCount > 0 && (
          <span className="flex items-center gap-1">
            <Sparkles size={11} />
            {day.selfCareCount} cuidado comigo
          </span>
        )}
        {day.nightMood != null && (
          <span className="flex items-center gap-1">
            <Moon size={11} />
            {day.nightMood}/5 à noite
          </span>
        )}
      </div>
    </button>
  );
}

/** Aba "Entradas" — feed cronológico real (só dias com conteúdo escrito), mais recente primeiro. */
function JournalFeedTab({
  onOpenDay,
  collections,
  journalFilter,
  onChangeFilter,
}: {
  onOpenDay: (date: string) => void;
  collections: JournalCollection[];
  journalFilter: string | null;
  onChangeFilter: (id: string | null) => void;
}) {
  const { days, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useJournalDays(journalFilter ?? undefined);

  return (
    <div className="max-w-2xl">
      <JournalFilterChips collections={collections} active={journalFilter} onChange={onChangeFilter} />
      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : days.length === 0 ? (
        <EmptyState
          title={journalFilter ? "Nenhuma entrada neste diário ainda" : "Seu diário está esperando a primeira entrada"}
          description="Escreva sobre sua intenção do dia, uma reflexão ou o que te fez bem — o LifeOS guarda tudo com data e monta seus Insights a partir disso."
          ctaLabel="Escrever hoje"
          onCta={() => onOpenDay(todayIso())}
        />
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <DayCard key={day.date} day={day} collections={collections} onOpen={() => onOpenDay(day.date)} />
          ))}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full text-center text-sm text-cat-pink font-medium py-3 hover:underline disabled:opacity-50"
            >
              {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Aba "Insights" — as mesmas métricas reais do masthead, em destaque, com contagem animada. */
function JournalInsightsTab() {
  const { insights, isLoading } = useJournalInsights();
  const streakCount = useCountUp(insights?.currentStreak ?? 0);
  const longestCount = useCountUp(insights?.longestStreak ?? 0);
  const entriesCount = useCountUp(insights?.totalEntries ?? 0);
  const wordsCount = useCountUp(insights?.totalWords ?? 0);

  if (isLoading) return <p className="text-sm text-slate">Carregando…</p>;

  if (!insights || insights.totalEntries === 0) {
    return (
      <EmptyState
        title="Ainda sem Insights"
        description="Assim que você escrever sua primeira entrada, sua sequência, recorde, total de entradas e de palavras aparecem aqui — sempre derivados do que você realmente escreveu."
        ctaLabel="Escrever hoje"
        onCta={() => undefined}
      />
    );
  }

  const tiles: Array<{ icon: React.ReactNode; label: string; value: string; tone: string }> = [
    { icon: <Flame size={20} />, label: "Sequência atual", value: `${streakCount} ${streakCount === 1 ? "dia" : "dias"}`, tone: "text-signal" },
    { icon: <Award size={20} />, label: "Recorde", value: `${longestCount} ${longestCount === 1 ? "dia" : "dias"}`, tone: "text-cat-purple" },
    { icon: <CalendarDays size={20} />, label: "Entradas escritas", value: `${entriesCount}`, tone: "text-cat-blue" },
    { icon: <TypeIcon size={20} />, label: "Palavras escritas", value: wordsCount.toLocaleString("pt-BR"), tone: "text-cat-green" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl">
      {tiles.map((t) => (
        <Card key={t.label} className="p-4 sm:p-5 flex flex-col items-start gap-2 transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
          <span className={t.tone}>{t.icon}</span>
          <p className="text-2xl font-bold leading-none">{t.value}</p>
          <p className="text-xs text-slate">{t.label}</p>
        </Card>
      ))}
    </div>
  );
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Aba "Calendário" — grade do mês com pontinho nos dias que têm entrada real; clicar abre o dia. */
function JournalCalendarTab({
  onOpenDay,
  collections,
  journalFilter,
  onChangeFilter,
}: {
  onOpenDay: (date: string) => void;
  collections: JournalCollection[];
  journalFilter: string | null;
  onChangeFilter: (id: string | null) => void;
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const { days: markedDays, isLoading } = useJournalCalendarMonth(month, journalFilter ?? undefined);
  const marked = useMemo(() => new Set(markedDays), [markedDays]);

  const [year, monthNum] = month.split("-").map(Number);
  const monthIndex = monthNum - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const total = daysInMonth(year, monthIndex);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const today = todayIso();

  const changeMonth = (delta: number) => {
    const d = new Date(year, monthIndex + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, date: `${year}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  return (
    <div className="max-w-md">
      <JournalFilterChips collections={collections} active={journalFilter} onChange={onChangeFilter} />
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05]" aria-label="Mês anterior">
          <ChevronLeft size={15} />
        </button>
        <p className="text-sm font-semibold capitalize">{monthLabel}</p>
        <button onClick={() => changeMonth(1)} disabled={month >= today.slice(0, 7)} className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-30" aria-label="Próximo mês">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <p key={i} className="text-center text-[10px] text-slate font-semibold">
            {w}
          </p>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-1 ${isLoading ? "opacity-50" : ""}`}>
        {cells.map((cell, i) =>
          cell ? (
            <button
              key={cell.date}
              onClick={() => onOpenDay(cell.date)}
              disabled={cell.date > today}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors disabled:opacity-30 ${
                cell.date === today ? "bg-cat-pink text-white font-semibold" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {cell.day}
              {marked.has(cell.date) && <span className={`w-1 h-1 rounded-full ${cell.date === today ? "bg-white" : "bg-cat-pink"}`} />}
            </button>
          ) : (
            <div key={`empty-${i}`} />
          )
        )}
      </div>
    </div>
  );
}


const COLLECTION_COLOR_OPTIONS: Array<{ value: "pink" | "blue" | "purple" | "green" | "teal"; label: string }> = [
  { value: "pink", label: "Rosa" },
  { value: "blue", label: "Azul" },
  { value: "purple", label: "Roxo" },
  { value: "green", label: "Verde" },
  { value: "teal", label: "Turquesa" },
];

/** Formulário compacto de criar/editar um diário — mesmo componente pros dois casos. */
function JournalCollectionForm({
  initial,
  onSubmit,
  onCancel,
  isSaving,
}: {
  initial?: JournalCollection;
  onSubmit: (input: JournalCollectionInput) => void;
  onCancel?: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [color, setColor] = useState<"pink" | "blue" | "purple" | "green" | "teal">(initial?.color ?? "pink");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), icon: icon.trim() || null, color, description: description.trim() || null });
        if (!initial) {
          setName("");
          setIcon("");
          setDescription("");
        }
      }}
      className="flex flex-col gap-2.5"
    >
      <div className="flex gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🦋"
          maxLength={4}
          className="w-14 shrink-0 text-center rounded-xl px-2 py-2 text-lg bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do diário (ex.: Viagens)"
          className="flex-1 rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        className="w-full rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
      />
      <div className="flex items-center gap-1.5">
        {COLLECTION_COLOR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setColor(opt.value)}
            aria-label={opt.label}
            className={`w-6 h-6 rounded-full ${COLLECTION_COLOR_CLASSES[opt.value]} ${
              color === opt.value ? "ring-2 ring-offset-2 ring-cat-pink dark:ring-offset-ink-raised" : ""
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="rounded-lg px-3.5 py-1.5 text-xs font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all disabled:opacity-50"
        >
          {initial ? "Salvar" : "Criar diário"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-slate hover:text-inherit">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Aba "Diários" — gerenciar as coleções (criar, editar, arquivar). Arquivar nunca apaga entradas já vinculadas. */
function JournalCollectionsTab() {
  const { collections, isLoading, create, update, remove, isSaving } = useJournalCollections();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-slate">Carregando…</p>;

  return (
    <div className="max-w-lg space-y-4">
      <Card className="p-4 sm:p-5">
        <p className="text-sm font-semibold mb-3">Novo diário</p>
        <JournalCollectionForm onSubmit={(input) => create(input)} isSaving={isSaving} />
      </Card>

      {collections.length === 0 ? (
        <p className="text-sm text-slate">
          Nenhum diário criado ainda — todas as suas entradas aparecem juntas em "Entradas" até você organizar por diário.
        </p>
      ) : (
        <div className="space-y-2.5">
          {collections.map((col) =>
            editingId === col.id ? (
              <Card key={col.id} className="p-4 sm:p-5">
                <JournalCollectionForm
                  initial={col}
                  isSaving={isSaving}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) => {
                    update({ id: col.id, input });
                    setEditingId(null);
                  }}
                />
              </Card>
            ) : (
              <Card key={col.id} className="p-3.5 sm:p-4 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${COLLECTION_COLOR_CLASSES[col.color ?? "pink"]}`}>
                  {col.icon || "📔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{col.name}</p>
                  {col.description && <p className="text-xs text-slate truncate">{col.description}</p>}
                </div>
                <button onClick={() => setEditingId(col.id)} className="text-xs text-cat-pink font-medium shrink-0">
                  Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Arquivar "${col.name}"? As entradas já vinculadas continuam existindo, só não aparecem mais como um diário ativo.`)) {
                      remove(col.id);
                    }
                  }}
                  className="text-xs text-slate hover:text-signal shrink-0"
                >
                  Arquivar
                </button>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Diário — ponto de entrada da tela: navegação por abas no espírito do
 * app Diário da Apple (Entradas / Insights / Calendário), todas 100%
 * derivadas de journal_entries reais. "Entradas" é o feed cronológico
 * (a home passa a ser sobre memória, não sobre um dashboard de métricas);
 * abrir um dia — pelo feed, pelo calendário ou por "+ Nova entrada" —
 * leva ao editor imersivo do dia (DiaryDayEditor, o antigo Diário).
 */
export function DiarioPage() {
  const [view, setView] = useState<ViewKey | "day">("feed");
  const [date, setDate] = useState(todayIso());
  const [journalFilter, setJournalFilter] = useState<string | null>(null);
  const { collections } = useJournalCollections();

  const openDay = (d: string) => {
    setDate(d);
    setView("day");
  };

  if (view === "day") {
    return <DiaryDayEditor date={date} setDate={setDate} onBack={() => setView("feed")} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-cat-pink">Diário</p>
          <p className="text-xs sm:text-sm text-slate mt-0.5">Reflita sobre os momentos do seu dia.</p>
        </div>
        <button
          onClick={() => openDay(todayIso())}
          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 active:scale-95 transition-all shadow-sm"
        >
          <Plus size={15} />
          Nova entrada
        </button>
      </div>

      <div className="mb-5">
        <TabBar active={view} onChange={setView} />
      </div>

      {view === "feed" && (
        <JournalFeedTab onOpenDay={openDay} collections={collections} journalFilter={journalFilter} onChangeFilter={setJournalFilter} />
      )}
      {view === "insights" && <JournalInsightsTab />}
      {view === "calendar" && (
        <JournalCalendarTab onOpenDay={openDay} collections={collections} journalFilter={journalFilter} onChangeFilter={setJournalFilter} />
      )}
      {view === "collections" && <JournalCollectionsTab />}
    </div>
  );
}
