import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Target,
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
  Timer,
  Dumbbell,
  Flame,
} from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { useTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useAnalyticsOverview, useInsights } from "@/hooks/useAnalytics";
import { DashboardInsights, type StreakHighlight } from "@/components/dashboard/DashboardInsights";
import { Card } from "@/components/ui/primitives";

/* ============================================================
   Diário — "escreva o seu ser diário". Página em tom rosa (Journal/
   aspecto emocional, conforme o design system), no aspecto de jornal
   pedido pelo usuário: masthead com data, resumo automático do dia
   (dado real, nunca inventado) e seções em cartões, responsivas de
   celular a desktop (1 coluna no mobile, até 3 no desktop).

   Automático (sempre ao vivo de outro módulo, nunca digitado aqui):
   humor/energia/sono (Saúde), insight do dia (Copilot), insights da
   semana (Analytics — mesmo componente do Dashboard), foco sugerido e
   concluído (Tarefas/Focus), hábitos e sequência (Hábitos), água,
   exercício, páginas lidas e livro atual (Biblioteca).

   Manual (o "diário" de verdade, salvo em journal_entries): intenção,
   reflexões, gratidão, cuidado comigo, desafios, revisão da noite —
   com autosave: salva sozinho ~900ms depois de parar de digitar, e
   na hora ao sair do campo ou marcar um item.
   ============================================================ */

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

/** Textarea com o mesmo visual dos <input> do Field, sem precisar de um componente novo pra isso. */
function JournalTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
    />
  );
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
    <Card className={`p-4 sm:p-5 border-t-2 border-t-cat-pink/40 flex flex-col ${className ?? ""}`}>
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
};

export function DiarioPage() {
  const [date, setDate] = useState(todayIso());
  const { entry, isLoading, save, isSaving } = useJournal(date);
  const { moveTask } = useTasks();
  const { habits, summaryByHabitId } = useHabits();
  const { overview } = useAnalyticsOverview(14);
  const { insights: lifeInsights } = useInsights(30);

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

  const streakHighlight: StreakHighlight | null = useMemo(() => {
    let best: StreakHighlight | null = null;
    for (const h of habits) {
      const s = summaryByHabitId.get(h.id)?.currentStreak ?? 0;
      if (s > 0 && (!best || s > best.streak)) best = { habitName: h.name, streak: s };
    }
    return best;
  }, [habits, summaryByHabitId]);

  const focusTasks = entry?.auto.suggestedFocusTasks ?? [];
  const currentWeekday = new Date(`${date}T00:00:00`).getDay();
  const book = entry?.auto.currentBook;
  const mood = entry?.auto.mood;
  const sleep = entry?.auto.sleep;
  const auto = entry?.auto;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8">
      {/* Masthead — visual de capa de jornal: filete duplo, olho da página e data em itálico */}
      <div className="mb-5 sm:mb-6 rounded-2xl border border-paper-border dark:border-ink-border bg-gradient-to-br from-cat-pink/10 via-cat-pink/[0.03] to-transparent p-4 sm:p-6 sm:pt-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            aria-label="Dia anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="text-center min-w-0">
            <p className="text-[9px] sm:text-[10px] tracking-[0.25em] text-cat-pink/70 font-semibold mb-0.5">EDIÇÃO PESSOAL</p>
            <p className="font-display text-2xl sm:text-3xl md:text-5xl font-bold italic tracking-tight text-cat-pink truncate leading-none">Diário do Ser</p>
            <p className="text-[11px] sm:text-xs text-slate mt-1.5 capitalize truncate">{formatHeaderDate(date)}</p>
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            disabled={date >= todayIso()}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-30"
            aria-label="Próximo dia"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Filete duplo — moldura de capa de jornal */}
        <div className="h-[3px] border-t-2 border-b border-cat-pink/40 mb-4 mt-3" />

        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {WEEKDAYS.map((w, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center ${
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
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-cat-pink text-white hover:bg-cat-pink/90 transition-colors disabled:opacity-50 shadow-sm"
            >
              <Save size={13} />
              Salvar
            </button>
          </div>
        </div>

        {auto && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatChip icon={<ListChecks size={14} />} label="Tarefas" value={`${auto.tasksToday.done}/${auto.tasksToday.total}`} tone="text-cat-blue" />
              <StatChip icon={<Repeat size={14} />} label="Hábitos" value={`${auto.habitsToday.done}/${auto.habitsToday.total}`} tone="text-cat-green" />
              <StatChip icon={<Droplets size={14} />} label="Água" value={`${(auto.waterMl / 1000).toFixed(1)}L`} tone="text-cat-blue" />
              <StatChip icon={<Timer size={14} />} label="Foco" value={fmtMinutes(auto.focusMinutes)} tone="text-cat-purple" />
              <StatChip icon={<Dumbbell size={14} />} label="Exercício" value={fmtMinutes(auto.exerciseMinutes)} tone="text-cat-green" />
              <StatChip icon={<BookOpen size={14} />} label="Leitura" value={`${auto.reading.pages}pág.`} tone="text-cat-pink" />
            </div>
            <p className="text-xs sm:text-sm text-slate italic mt-3 text-center">{auto.summary}</p>
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
              <JournalTextarea value={form.intention} onChange={(v) => updateField({ intention: v })} onBlur={() => saveNow()} />
            </SectionCard>

            <SectionCard icon={<Target size={16} />} title="Foco do dia" subtitle="Sugerido a partir das suas tarefas reais">
              {focusTasks.length === 0 ? (
                <p className="text-xs text-slate">Nenhuma tarefa pendente para hoje — bom trabalho!</p>
              ) : (
                <div className="space-y-1.5">
                  {focusTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => moveTask({ id: t.id, status: "Concluído" })}
                      className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    >
                      <span className="w-4 h-4 rounded border border-paper-border dark:border-ink-border shrink-0" />
                      <span className="text-xs truncate flex-1">{t.title}</span>
                      <span className="text-[10px] text-slate shrink-0">{t.priority}</span>
                    </button>
                  ))}
                </div>
              )}
              <Link to="/tarefas" className="text-xs text-cat-pink font-medium mt-2 inline-block">
                Ver todas as tarefas →
              </Link>
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
              <JournalTextarea value={form.thoughts} onChange={(v) => updateField({ thoughts: v })} onBlur={() => saveNow()} rows={4} />
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
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                          checked ? "bg-cat-pink border-cat-pink text-white" : "border-paper-border dark:border-ink-border"
                        }`}
                      >
                        {checked && <Check size={11} />}
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
              <JournalTextarea value={form.challenges} onChange={(v) => updateField({ challenges: v })} onBlur={() => saveNow()} />
            </SectionCard>

            <SectionCard icon={<Sun size={16} />} title="Como posso tornar este dia mais leve?">
              <JournalTextarea value={form.lighterPlan} onChange={(v) => updateField({ lighterPlan: v })} onBlur={() => saveNow()} />
            </SectionCard>

            <SectionCard icon={<Heart size={16} />} title="O que me fez bem hoje?" subtitle="Pequenos momentos que importam.">
              <JournalTextarea value={form.feelGood} onChange={(v) => updateField({ feelGood: v })} onBlur={() => saveNow()} />
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
                  <JournalTextarea value={form.nightHelped} onChange={(v) => updateField({ nightHelped: v })} onBlur={() => saveNow()} rows={2} />
                </div>
                <div>
                  <p className="text-xs text-slate mb-2">O que levo para amanhã?</p>
                  <JournalTextarea value={form.nightTakeaway} onChange={(v) => updateField({ nightTakeaway: v })} onBlur={() => saveNow()} rows={2} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
