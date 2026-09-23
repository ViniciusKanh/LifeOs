import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useJournal } from "@/hooks/useJournal";
import { useTasks } from "@/hooks/useTasks";
import { Card } from "@/components/ui/primitives";

/* ============================================================
   Diário — página no "aspecto de jornal" pedido pelo usuário
   (protótipo aprovado: masthead com data, seções em cartões,
   listas de verificação, humor em emojis). Usa o tom rosa do
   design system, reservado a Journal/leitura/emocional, mantendo
   sidebar/topbar/cards padrão do LifeOS — não é uma identidade
   visual à parte, só uma variação de cor dentro do mesmo sistema.

   Campos automáticos (nunca digitados aqui, sempre ao vivo de outro
   módulo): humor/energia e sono vêm de Saúde, o insight do dia vem
   do Copilot, o foco sugerido vem de Tarefas e o livro atual vem da
   Biblioteca — journalService/journalRoutes nunca duplicam esse dado.
   Os campos de texto livre (intenção, reflexões, gratidão, cuidado
   comigo, desafios, revisão da noite) são o "diário" propriamente
   dito e ficam salvos em journal_entries.
   ============================================================ */

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MOOD_EMOJI = ["😠", "😟", "😕", "🙂", "😀"];
const MOOD_LABEL = ["Raiva", "Ansiedade", "Frustração", "Alegria", "Bem"];

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
    <Card className={`p-5 border-t-2 border-t-cat-pink/40 ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cat-pink">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {subtitle && <p className="text-xs text-slate italic mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </Card>
  );
}

export function DiarioPage() {
  const [date, setDate] = useState(todayIso());
  const { entry, isLoading, save, isSaving } = useJournal(date);
  const { tasks, moveTask } = useTasks();

  const [form, setForm] = useState({
    intention: "",
    thoughts: "",
    gratitude: ["", "", ""],
    selfCare: [] as string[],
    selfCareOther: "",
    challenges: "",
    lighterPlan: "",
    feelGood: "",
    nightMood: null as number | null,
    nightHelped: "",
    nightTakeaway: "",
  });

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

  const persist = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    save({
      intention: next.intention || null,
      thoughts: next.thoughts || null,
      gratitude: next.gratitude.filter((g) => g.trim().length > 0),
      selfCare: next.selfCare,
      selfCareOther: next.selfCareOther || null,
      challenges: next.challenges || null,
      lighterPlan: next.lighterPlan || null,
      feelGood: next.feelGood || null,
      nightMood: next.nightMood,
      nightHelped: next.nightHelped || null,
      nightTakeaway: next.nightTakeaway || null,
    }).catch(() => undefined);
  };

  const combinedSelfCare = useMemo(() => {
    const auto = entry?.auto.autoSelfCare ?? [];
    return new Set([...auto, ...form.selfCare]);
  }, [entry?.auto.autoSelfCare, form.selfCare]);

  const toggleSelfCare = (key: string) => {
    // itens auto-marcados por hábito real de hoje não podem ser desmarcados aqui —
    // desmarcar exigiria desfazer o check-in do hábito, o que é feito em Hábitos.
    if ((entry?.auto.autoSelfCare ?? []).includes(key)) return;
    const has = form.selfCare.includes(key);
    persist({ selfCare: has ? form.selfCare.filter((k) => k !== key) : [...form.selfCare, key] });
  };

  const focusTasks = entry?.auto.suggestedFocusTasks ?? [];
  const currentWeekday = new Date(`${date}T00:00:00`).getDay();
  const book = entry?.auto.currentBook;
  const mood = entry?.auto.mood;
  const sleep = entry?.auto.sleep;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* Masthead — inspirado no protótipo aprovado (título em destaque, data e navegação) */}
      <div className="mb-6 rounded-2xl border border-paper-border dark:border-ink-border bg-gradient-to-br from-cat-pink/5 via-transparent to-transparent p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            aria-label="Dia anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="text-center">
            <p className="font-display text-3xl md:text-4xl font-bold italic tracking-tight text-cat-pink">Diário do Ser</p>
            <p className="text-xs text-slate mt-1 capitalize">{formatHeaderDate(date)}</p>
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            disabled={date >= todayIso()}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-30"
            aria-label="Próximo dia"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
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
          <span className="flex items-center gap-1 text-[11px] text-slate">
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-growth" />}
            {isSaving ? "Salvando…" : "Salvo"}
          </span>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard icon={<Sun size={16} />} title="Intenção do dia" subtitle="Como quero me sentir hoje?">
            <JournalTextarea value={form.intention} onChange={(v) => setForm((f) => ({ ...f, intention: v }))} onBlur={() => persist({})} />
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
                  {sleep?.durationMinutes ? (
                    <span className="text-xs text-slate font-normal"> · {Math.round(sleep.durationMinutes / 60)}h</span>
                  ) : null}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<Brain size={16} />} title="Pensamentos e reflexões" subtitle="O que está passando pela minha mente hoje?">
            <JournalTextarea value={form.thoughts} onChange={(v) => setForm((f) => ({ ...f, thoughts: v }))} onBlur={() => persist({})} rows={4} />
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
                  onChange={(e) => setForm((f) => ({ ...f, gratitude: f.gratitude.map((g, gi) => (gi === i ? e.target.value : g)) }))}
                  onBlur={() => persist({})}
                  placeholder={`${i + 1}.`}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Sparkles size={16} />} title="Cuidado comigo" subtitle="O que posso fazer para manter minha mente tranquila hoje?">
            <div className="space-y-1.5">
              {SELF_CARE_OPTIONS.map((opt) => {
                const auto = (entry?.auto.autoSelfCare ?? []).includes(opt.key);
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
                    {auto && <span className="text-[10px] text-cat-pink ml-auto shrink-0">hábito de hoje</span>}
                  </button>
                );
              })}
              <input
                value={form.selfCareOther}
                onChange={(e) => setForm((f) => ({ ...f, selfCareOther: e.target.value }))}
                onBlur={() => persist({})}
                placeholder="Outro…"
                className="w-full mt-1 rounded-xl px-3 py-2 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-cat-pink transition-colors"
              />
            </div>
          </SectionCard>

          <SectionCard icon={<Brain size={16} />} title="Desafios" subtitle="O que pode me gerar ansiedade hoje? Como posso lidar?">
            <JournalTextarea value={form.challenges} onChange={(v) => setForm((f) => ({ ...f, challenges: v }))} onBlur={() => persist({})} />
          </SectionCard>

          <SectionCard icon={<Sun size={16} />} title="Como posso tornar este dia mais leve?">
            <JournalTextarea value={form.lighterPlan} onChange={(v) => setForm((f) => ({ ...f, lighterPlan: v }))} onBlur={() => persist({})} />
          </SectionCard>

          <SectionCard icon={<Heart size={16} />} title="O que me fez bem hoje?" subtitle="Pequenos momentos que importam.">
            <JournalTextarea value={form.feelGood} onChange={(v) => setForm((f) => ({ ...f, feelGood: v }))} onBlur={() => persist({})} />
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
                </div>
              </div>
            </SectionCard>
          )}

          <Card className="p-5 md:col-span-2 border-t-2 border-t-cat-purple/40">
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
                      onClick={() => persist({ nightMood: n })}
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
                <JournalTextarea
                  value={form.nightHelped}
                  onChange={(v) => setForm((f) => ({ ...f, nightHelped: v }))}
                  onBlur={() => persist({})}
                  rows={2}
                />
              </div>
              <div>
                <p className="text-xs text-slate mb-2">O que levo para amanhã?</p>
                <JournalTextarea
                  value={form.nightTakeaway}
                  onChange={(v) => setForm((f) => ({ ...f, nightTakeaway: v }))}
                  onBlur={() => persist({})}
                  rows={2}
                />
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
