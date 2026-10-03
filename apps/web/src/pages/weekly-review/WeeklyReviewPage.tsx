import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Heart,
  ListChecks,
  Pencil,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { useWeeklyReview, mondayOf } from "@/hooks/useReviews";
import { Button, Card, IconBadge } from "@/components/ui/primitives";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";
import { Feather } from "lucide-react";
import { RPGAvatar, RPGBadge, RPGButton, RPGPanel, RPGPageHeader, RPGTabs, RPG_SECTION_TITLE } from "@/components/rpg";
import { useProjects } from "@/hooks/useProjects";
import { RpgCycleSeal } from "@/components/reviews/RpgReviewParts";

const MAX_CHARS = 500;

function weekLabel(monday: string) {
  const start = new Date(`${monday}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Seta de tendência para variação relativa (%) — null quando não há base real de comparação. */
function RelativeTrend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[11px] text-slate">—</span>;
  if (pct === 0) return <span className="text-[11px] text-slate">0%</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-growth" : "text-drop"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct)}%
    </span>
  );
}

/** Seta de tendência em pontos percentuais — para métricas que já são um % (0-100), nunca variação relativa. */
function PointsTrend({ points }: { points: number }) {
  if (points === 0) return <span className="text-[11px] text-slate">0pts</span>;
  const up = points > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-growth" : "text-drop"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(points)}pts
    </span>
  );
}

function MetricTile({
  icon,
  tone,
  label,
  value,
  trend,
}: {
  icon: ReactNode;
  tone: "blue" | "purple" | "green" | "pink" | "teal" | "amber";
  label: string;
  value: string;
  trend: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-paper-border dark:border-ink-border p-3.5 rpg:rounded-[4px] rpg:border-rpg-border/80 rpg:bg-rpg-bg/50">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={icon} tone={tone} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-semibold leading-tight rpg:font-pixel">{value}</p>
            {trend}
          </div>
          <p className="text-[11px] text-slate leading-tight mt-0.5 truncate">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ReflectionField({
  label,
  placeholder,
  value,
  onChange,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  /** Sugestão do Copilot pendente — só aparece quando o campo já tinha texto do usuário (nunca sobrescreve sozinho). */
  suggestion?: string;
  onAcceptSuggestion?: () => void;
  onDismissSuggestion?: () => void;
}) {
  const id = `reflection-${label}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink dark:text-paper">
          {label}
        </label>
        <span className="text-[11px] text-slate tabular-nums">
          {value.length}/{MAX_CHARS}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        maxLength={MAX_CHARS}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 transition-colors resize-none placeholder:text-slate/70 rpg:rounded-[3px] rpg:bg-rpg-bg-2 rpg:border-rpg-border rpg:focus:border-rpg-gold"
      />
      {suggestion && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
            <Sparkles size={11} /> Substituir com sugestão da IA?
          </span>
          <button type="button" onClick={onAcceptSuggestion} className="font-semibold text-brand-600 dark:text-brand-400 underline">
            Substituir
          </button>
          <button type="button" onClick={onDismissSuggestion} className="text-slate underline">
            Ignorar
          </button>
        </div>
      )}
    </div>
  );
}

/** Exibição somente-leitura de uma reflexão já salva — deixa claro que aquele texto ficou registrado para a semana, em vez de um campo editável indistinguível de um formulário vazio. */
function ReflectionView({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink dark:text-paper mb-1.5">{label}</p>
      <div className="rounded-xl px-3 py-2.5 text-sm bg-black/[0.02] dark:bg-white/[0.03] border border-paper-border dark:border-ink-border min-h-[5.5rem] whitespace-pre-wrap">
        {value ? value : <span className="text-slate/60 italic">Não preenchido nesta semana.</span>}
      </div>
    </div>
  );
}

export function WeeklyReviewPage() {
  const [weekStartDate, setWeekStartDate] = useState(mondayOf());
  const { saved, computed, history, save, generateDraft, isGeneratingDraft, draftError, reward } = useWeeklyReview(weekStartDate);
  const { isRpg } = useTheme();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const activeProjects = projects.filter((p) => !p.archived_at && (p.status === "active" || p.status === "planning")).length;
  // Selo da semana: só quando ESTE salvamento fez o backend conceder o XP do fechamento.
  const [sealPending, setSealPending] = useState(false);
  const currentMonday = mondayOf();
  const isCurrentWeek = weekStartDate === currentMonday;

  const [whatWorked, setWhatWorked] = useState("");
  const [whatDidntWork, setWhatDidntWork] = useState("");
  const [whatToImprove, setWhatToImprove] = useState("");
  const [nextPriorities, setNextPriorities] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  // Quando já existe uma revisão salva para a semana, a tela abre em modo
  // "leitura" (mostra o que foi registrado, deixa claro que ficou salvo) —
  // só entra em modo edição se o usuário pedir ou se não houver nada salvo
  // ainda. Antes os campos ficavam sempre editáveis, indistinguíveis de um
  // formulário vazio, e dava a impressão de que nada tinha sido registrado.
  const [mode, setMode] = useState<"view" | "edit">("edit");

  // Últimas 8 semanas (contando a atual) para navegação rápida, marcando
  // com um check preenchido quais já têm revisão salva de verdade.
  const recentWeeks = useMemo(() => {
    const weeks: string[] = [];
    const d = new Date(`${currentMonday}T00:00:00`);
    for (let i = 0; i < 8; i++) {
      weeks.unshift(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() - 7);
    }
    return weeks;
  }, [currentMonday]);
  const savedWeeks = useMemo(() => new Set(history.map((h) => h.week_start_date)), [history]);

  // Sugestões do Copilot ainda não aplicadas — só existem para campos que já
  // tinham texto do usuário no momento em que o rascunho foi gerado (campos
  // vazios são preenchidos direto, nunca perdem texto que o usuário digitou).
  const [pendingSuggestions, setPendingSuggestions] = useState<{
    whatWorked?: string;
    whatToImprove?: string;
    nextPriorities?: string;
  }>({});

  useEffect(() => {
    setWhatWorked(saved?.what_worked ?? "");
    setWhatDidntWork(saved?.what_didnt_work ?? "");
    setWhatToImprove(saved?.what_to_improve ?? "");
    setNextPriorities(saved?.next_priorities ?? "");
    setPendingSuggestions({});
    setMode(saved ? "view" : "edit");
  }, [saved]);

  const changeWeek = (delta: number) => {
    const d = new Date(`${weekStartDate}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    setWeekStartDate(d.toISOString().slice(0, 10));
    setSavedFeedback(false);
    setSealPending(false);
    setPendingSuggestions({});
  };

  const goToWeek = (monday: string) => {
    setWeekStartDate(monday);
    setSavedFeedback(false);
    setSealPending(false);
    setPendingSuggestions({});
  };

  const handleGenerateDraft = async () => {
    setPendingSuggestions({});
    try {
      const { draft } = await generateDraft();
      const next: typeof pendingSuggestions = {};

      if (whatWorked.trim()) next.whatWorked = draft.wentWell;
      else setWhatWorked(draft.wentWell);

      if (whatToImprove.trim()) next.whatToImprove = draft.toImprove;
      else setWhatToImprove(draft.toImprove);

      if (nextPriorities.trim()) next.nextPriorities = draft.nextWeekFocus;
      else setNextPriorities(draft.nextWeekFocus);

      setPendingSuggestions(next);
    } catch {
      // erro já fica disponível via draftError, exibido perto do botão
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSealPending(!(reward?.awarded ?? false));
    try {
      await save({
        weekStartDate,
        whatWorked: whatWorked || undefined,
        whatDidntWork: whatDidntWork || undefined,
        whatToImprove: whatToImprove || undefined,
        nextPriorities: nextPriorities || undefined,
      });
      setSavedFeedback(true);
      setMode("view");
      setTimeout(() => setSavedFeedback(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const score = saved
    ? {
        productivity: saved.productivity_pct ?? 0,
        health: saved.health_pct ?? 0,
        education: saved.education_pct ?? 0,
        reading: saved.reading_pct ?? 0,
        habits: saved.habits_pct ?? 0,
        tasksCompleted: saved.tasks_completed ?? 0,
        pagesRead: saved.pages_read ?? 0,
      }
    : computed
      ? {
          productivity: computed.lifeScore.productivity,
          health: computed.lifeScore.health,
          education: computed.lifeScore.education,
          reading: computed.lifeScore.reading,
          habits: computed.lifeScore.habits,
          tasksCompleted: computed.tasksCompleted,
          pagesRead: computed.pagesRead,
        }
      : null;

  // Variações contra a semana anterior só existem para a semana "ao vivo"
  // (calculada em tempo real) — uma revisão já salva é um retrato fixo do
  // que foi registrado no momento do salvamento, sem trend para exibir.
  const changePct = !saved ? computed?.changePct : undefined;
  const dimensionSignals = score ? [
    { label: "Produtividade", value: score.productivity },
    { label: "Saúde", value: score.health },
    { label: "Educação", value: score.education },
    { label: "Leitura", value: score.reading },
    { label: "Hábitos", value: score.habits },
  ].sort((a, b) => b.value - a.value) : [];
  const strongest = dimensionSignals[0];
  const weakest = dimensionSignals[dimensionSignals.length - 1];

  const weekNav = (
    <div className="flex items-center gap-1 rounded-xl border border-paper-border dark:border-ink-border p-1 rpg:rounded-[4px] rpg:border-rpg-border">
      <button
        onClick={() => changeWeek(-1)}
        className="p-1.5 rounded-lg text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
        aria-label="Semana anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold px-2 tabular-nums">{weekLabel(weekStartDate)}</span>
      {isCurrentWeek && (
        <span className="text-[10px] font-semibold text-brand-700 dark:text-brand-100 bg-brand-50 dark:bg-brand-700/20 rounded-full px-2 py-0.5">
          Semana atual
        </span>
      )}
      <button
        onClick={() => changeWeek(1)}
        className="p-1.5 rounded-lg text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
        aria-label="Próxima semana"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  // Tema RPG: "Relatório da jornada" semanal (mesmo estado/handlers da tela clássica).
  if (isRpg) {
    const reflections = [
      { key: "whatWorked" as const, label: "O que funcionou bem?", ph: "Liste o que te ajudou nesta semana…", value: whatWorked, set: setWhatWorked },
      { key: "whatDidntWork" as const, label: "O que não funcionou?", ph: "Descreva os principais obstáculos…", value: whatDidntWork, set: setWhatDidntWork },
      { key: "whatToImprove" as const, label: "O que quero melhorar?", ph: "Defina 1–3 focos de melhoria…", value: whatToImprove, set: setWhatToImprove },
      { key: "nextPriorities" as const, label: "Prioridades da próxima semana", ph: "Uma prioridade por linha…", value: nextPriorities, set: setNextPriorities },
    ];
    const trendPts = (v: number | undefined) =>
      v == null ? <span className="text-rpg-muted">—</span> : <span className={v >= 0 ? "text-rpg-green" : "text-rpg-red"}>{v >= 0 ? "↗ +" : "↘ "}{v}pts</span>;
    const trendPct = (v: number | null | undefined) =>
      v == null ? <span className="text-rpg-muted">sem base</span> : <span className={v >= 0 ? "text-rpg-green" : "text-rpg-red"}>{v >= 0 ? "↗ +" : "↘ "}{v}%</span>;
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
        <RPGPageHeader
          banner="revisoes"
          size="md"
          eyebrow="Relatório da jornada"
          title="Revisões"
          subtitle="Feche o ciclo, aprenda com a jornada e planeje o próximo desafio."
          aside={<div className="m-1.5 bg-rpg-bg/85">{weekNav}</div>}
        />
        <RPGTabs
          label="Tipo de revisão"
          tabs={[
            { value: "weekly", label: "Semanal" },
            { value: "monthly", label: "Mensal" },
            { value: "quarterly", label: "Trimestral" },
            { value: "annual", label: "Anual" },
          ]}
          value="weekly"
          onChange={(v) => v !== "weekly" && navigate(`/revisoes?tipo=${v}`)}
        />

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {recentWeeks.map((monday) => (
            <button
              key={monday}
              onClick={() => goToWeek(monday)}
              aria-pressed={monday === weekStartDate}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] border ${monday === weekStartDate ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted"}`}
              style={{ borderRadius: 3 }}
            >
              {savedWeeks.has(monday) ? <CheckCircle2 size={12} className="text-rpg-green" aria-label="Revisão salva" /> : <span className="w-3 h-3 border border-current opacity-40" style={{ borderRadius: 999 }} aria-hidden />}
              {weekLabel(monday)}
            </button>
          ))}
        </div>

        {/* Faixa do personagem: números reais da semana + leitura derivada deles */}
        <RPGPanel variant="gold" bodyClassName="p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,300px)] items-center">
            <div className="hidden sm:block justify-self-center"><RPGAvatar size="lg" /></div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { icon: <ListChecks size={20} />, tone: "text-rpg-blue", v: score ? String(score.tasksCompleted) : "—", l: "Tarefas concluídas", t: trendPct(changePct?.tasksCompleted) },
                { icon: <Repeat size={20} />, tone: "text-rpg-green", v: score ? `${score.habits}%` : "—", l: "Hábitos (consistência)", t: trendPts(changePct?.habits) },
                { icon: <Target size={20} />, tone: "text-rpg-purple", v: String(activeProjects), l: "Projetos ativos", t: <span className="text-rpg-muted">agora</span> },
                { icon: <BookOpen size={20} />, tone: "text-rpg-cyan", v: score ? String(score.pagesRead) : "—", l: "Páginas lidas", t: trendPct(changePct?.pagesRead) },
              ].map((k) => (
                <div key={k.l} className="flex flex-col items-center text-center border-2 border-rpg-border bg-rpg-bg/60 px-2 py-2.5" style={{ borderRadius: 4 }}>
                  <span className={k.tone} aria-hidden>{k.icon}</span>
                  <dd className="font-pixel text-2xl text-rpg-text leading-none mt-1 tabular-nums">{k.v}</dd>
                  <dt className="text-[11px] text-rpg-muted mt-1 leading-tight">{k.l}</dt>
                  <span className="text-[10px] mt-0.5">{k.t}</span>
                </div>
              ))}
            </dl>
            <div className="rpg-parchment px-4 py-3">
              <p className="font-rpg font-bold text-rpg-ink">Leitura da semana</p>
              <p className="mt-1 text-xs text-rpg-ink/85">
                {strongest && strongest.value > 0
                  ? `${strongest.label} foi sua dimensão mais forte (${strongest.value}%).${weakest && weakest.label !== strongest.label ? ` ${weakest.label} pede mais atenção (${weakest.value}%).` : ""}`
                  : "Ainda faltam registros nesta semana para comparar as dimensões."}
              </p>
              {saved && <p className="mt-1.5 text-[11px] text-rpg-ink/70">Revisão salva — retrato fixo do momento do salvamento.</p>}
            </div>
          </div>
        </RPGPanel>

        {/* Reflexões em pergaminho (os campos continuam inputs comuns e legíveis) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>Sua reflexão semanal</p>
          <div className="flex flex-wrap items-center gap-2">
            {reward && (reward.awarded || isCurrentWeek) && (
              <RPGBadge tone={reward.awarded ? "green" : "purple"}>{reward.awarded ? `Selo da semana · +${reward.xp} XP` : `+${reward.xp} XP ao fechar a semana`}</RPGBadge>
            )}
            {mode === "edit" ? (
              <RPGButton variant="secondary" onClick={handleGenerateDraft} disabled={isGeneratingDraft}>
                <Wand2 size={14} aria-hidden /> {isGeneratingDraft ? "Gerando…" : "Rascunho com IA"}
              </RPGButton>
            ) : (
              <RPGButton variant="secondary" onClick={() => setMode("edit")}>
                <Pencil size={13} aria-hidden /> Editar
              </RPGButton>
            )}
          </div>
        </div>
        {draftError && <p role="alert" className="text-xs text-rpg-red">{draftError.message}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {reflections.map((f) => {
            const suggestion = (pendingSuggestions as Record<string, string | undefined>)[f.key];
            return (
              <section key={f.key} className="rpg-parchment px-4 py-3 mx-0">
                <label htmlFor={`wr-${f.key}`} className="flex items-center justify-between gap-2 font-rpg font-bold text-rpg-ink">
                  {f.label}
                  <Feather size={16} className="text-rpg-ink/60" aria-hidden />
                </label>
                {mode === "view" ? (
                  <p className="mt-2 min-h-[4.5rem] whitespace-pre-wrap text-sm text-rpg-ink/90">{f.value || <span className="italic text-rpg-ink/55">Não preenchido nesta semana.</span>}</p>
                ) : (
                  <>
                    <textarea
                      id={`wr-${f.key}`}
                      value={f.value}
                      maxLength={MAX_CHARS}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.ph}
                      rows={3}
                      className="mt-2 w-full resize-none border border-rpg-bronze/50 bg-white/55 px-3 py-2 text-sm text-rpg-ink placeholder:text-rpg-ink/45 outline-none focus:border-rpg-bronze focus:bg-white/75"
                      style={{ borderRadius: 3 }}
                    />
                    <div className="flex items-center justify-between text-[10px] text-rpg-ink/60">
                      {suggestion ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Sugestão da IA disponível.</span>
                          <button type="button" className="underline font-semibold" onClick={() => { f.set(suggestion); setPendingSuggestions((p) => ({ ...p, [f.key]: undefined })); }}>Substituir</button>
                          <button type="button" className="underline" onClick={() => setPendingSuggestions((p) => ({ ...p, [f.key]: undefined }))}>Ignorar</button>
                        </span>
                      ) : <span />}
                      <span className="tabular-nums">{f.value.length}/{MAX_CHARS}</span>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
        {mode === "edit" && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {sealPending && reward?.awarded && <RpgCycleSeal label={`Semana ${weekLabel(weekStartDate)}`} xp={reward.xp} coins={reward.coins} />}
            {saved && <RPGButton variant="ghost" onClick={() => setMode("view")}>Cancelar</RPGButton>}
            <RPGButton variant="gold" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : savedFeedback ? "Revisão salva ✓" : "Salvar revisão semanal"}
            </RPGButton>
          </div>
        )}
        {mode === "view" && sealPending && reward?.awarded && <RpgCycleSeal label={`Semana ${weekLabel(weekStartDate)}`} xp={reward.xp} coins={reward.coins} />}

        <RPGPanel title="Métricas da semana" icon={<Sparkles size={16} />}>
          {!score ? (
            <p className="text-sm text-rpg-muted">Carregando métricas…</p>
          ) : (
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
              {[
                { l: "Produtividade", v: score.productivity, d: changePct?.productivity, tone: "bg-rpg-blue", icon: <ListChecks size={16} /> },
                { l: "Saúde", v: score.health, d: changePct?.health, tone: "bg-rpg-green", icon: <Heart size={16} /> },
                { l: "Educação", v: score.education, d: changePct?.education, tone: "bg-rpg-purple", icon: <GraduationCap size={16} /> },
                { l: "Leitura", v: score.reading, d: changePct?.reading, tone: "bg-rpg-cyan", icon: <BookOpen size={16} /> },
                { l: "Hábitos", v: score.habits, d: changePct?.habits, tone: "bg-rpg-pink", icon: <Repeat size={16} /> },
              ].map((m) => (
                <div key={m.l} className="border-2 border-rpg-border bg-rpg-bg/50 p-3" style={{ borderRadius: 4 }}>
                  <p className="flex items-center gap-1.5 text-xs text-rpg-muted"><span className="text-rpg-gold-light" aria-hidden>{m.icon}</span>{m.l}</p>
                  <p className="mt-1 flex items-baseline gap-2"><span className="font-pixel text-xl text-rpg-text">{m.v}%</span><span className="text-[10px]">{trendPts(m.d)}</span></p>
                  <div className="rpg-bar mt-2" role="progressbar" aria-label={m.l} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.v}>
                    <span className={m.tone} style={{ width: `${m.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!saved && score && <p className="mt-3 text-[11px] text-rpg-muted">Calculado em tempo real dos seus registros — vira retrato fixo ao salvar a revisão.</p>}
        </RPGPanel>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full space-y-4">
      {isRpg ? (
        <RPGPageHeader
          banner="revisoes"
          size="md"
          eyebrow="Relatório da jornada"
          title="Revisão semanal"
          subtitle="Pare, olhe para trás e planeje a próxima semana com clareza."
          aside={<div className="m-1.5 bg-rpg-bg/85">{weekNav}</div>}
        />
      ) : (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-display font-semibold text-2xl">Weekly Review</p>
          <p className="text-sm text-slate mt-1">Pare, olhe para trás e planeje a próxima semana com clareza.</p>
        </div>
        {weekNav}
      </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {recentWeeks.map((monday) => {
          const has = savedWeeks.has(monday);
          const active = monday === weekStartDate;
          return (
            <button
              key={monday}
              onClick={() => goToWeek(monday)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                active
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20 text-brand-700 dark:text-brand-100 rpg:border-rpg-gold rpg:bg-rpg-gold/10 rpg:text-rpg-gold-light"
                  : "border-paper-border dark:border-ink-border text-slate hover:border-brand-500/40 rpg:border-rpg-border"
              }`}
            >
              {has ? (
                <CheckCircle2 size={12} className="text-growth" />
              ) : (
                <span className="w-3 h-3 rounded-full border border-current opacity-40" />
              )}
              {weekLabel(monday)}
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="text-xs text-growth inline-flex items-center gap-1.5">
          <Check size={13} /> Revisão desta semana salva em{" "}
          {new Date(saved.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")}
        </p>
      )}

      {score && <section className="grid gap-4 border-y border-paper-border py-5 dark:border-ink-border lg:grid-cols-2">
        <div><p className="text-xs font-semibold text-brand-600 rpg:font-pixel rpg:uppercase rpg:text-rpg-gold-light">Leitura da semana</p><h2 className="mt-1 font-display text-lg font-bold rpg:font-rpg">{score.tasksCompleted} tarefas concluídas · {score.pagesRead} páginas lidas</h2><p className="mt-2 text-sm text-slate">{strongest && strongest.value > 0 ? `${strongest.label} foi sua dimensão mais forte (${strongest.value}%).` : "Ainda faltam registros para comparar as dimensões."} {strongest && strongest.value > 0 && weakest && weakest.label !== strongest.label ? `${weakest.label} pede mais atenção (${weakest.value}%).` : ""}</p></div>
        <div className="space-y-2">{dimensionSignals.map((signal) => <div key={signal.label} className="grid grid-cols-[90px_1fr_34px] items-center gap-2 text-xs"><span className="text-slate">{signal.label}</span><div className="h-2 rounded-full bg-paper-border dark:bg-ink-border"><div className="h-full rounded-full bg-brand-500 rpg:rounded-none rpg:bg-rpg-purple" style={{ width: `${signal.value}%` }} /></div><span className="text-right font-semibold">{signal.value}%</span></div>)}</div>
      </section>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {score && (
            <Card className="p-4 sm:p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>Resumo da semana</p>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate rounded-full border border-paper-border dark:border-ink-border px-2.5 py-1">
                  Últimos 7 dias
                  <ChevronDown size={12} />
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricTile
                  icon={<ListChecks size={16} />}
                  tone="blue"
                  label="Produtividade"
                  value={`${score.productivity}%`}
                  trend={changePct ? <PointsTrend points={changePct.productivity} /> : <span className="text-[11px] text-slate">—</span>}
                />
                <MetricTile
                  icon={<Heart size={16} />}
                  tone="green"
                  label="Saúde"
                  value={`${score.health}%`}
                  trend={changePct ? <PointsTrend points={changePct.health} /> : <span className="text-[11px] text-slate">—</span>}
                />
                <MetricTile
                  icon={<GraduationCap size={16} />}
                  tone="amber"
                  label="Educação"
                  value={`${score.education}%`}
                  trend={changePct ? <PointsTrend points={changePct.education} /> : <span className="text-[11px] text-slate">—</span>}
                />
                <MetricTile
                  icon={<BookOpen size={16} />}
                  tone="teal"
                  label="Leitura"
                  value={`${score.reading}%`}
                  trend={changePct ? <PointsTrend points={changePct.reading} /> : <span className="text-[11px] text-slate">—</span>}
                />
                <MetricTile
                  icon={<Repeat size={16} />}
                  tone="pink"
                  label="Hábitos"
                  value={`${score.habits}%`}
                  trend={changePct ? <PointsTrend points={changePct.habits} /> : <span className="text-[11px] text-slate">—</span>}
                />
                <MetricTile
                  icon={<CalendarDays size={16} />}
                  tone="purple"
                  label="Tarefas concluídas"
                  value={String(score.tasksCompleted)}
                  trend={changePct ? <RelativeTrend pct={changePct.tasksCompleted} /> : <span className="text-[11px] text-slate">—</span>}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-paper-border dark:border-ink-border">
                <MetricTile
                  icon={<BookOpen size={16} />}
                  tone="teal"
                  label="Páginas lidas"
                  value={String(score.pagesRead)}
                  trend={changePct ? <RelativeTrend pct={changePct.pagesRead} /> : <span className="text-[11px] text-slate">—</span>}
                />
              </div>
              {!saved && (
                <p className="text-[11px] text-slate mt-4">
                  Estes números são calculados em tempo real a partir dos seus registros e ainda não foram salvos como revisão desta semana.
                </p>
              )}
            </Card>
          )}

          <Card className="p-4 sm:p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className={`text-sm font-semibold ${RPG_SECTION_TITLE}`}>Sua reflexão semanal</p>
                {isRpg && reward && (reward.awarded || isCurrentWeek) && (
                  <RPGBadge tone={reward.awarded ? "green" : "purple"} className="mt-1">
                    {reward.awarded ? `Selo da semana · +${reward.xp} XP` : `+${reward.xp} XP ao fechar a semana`}
                  </RPGBadge>
                )}
                <p className="text-xs text-slate mt-0.5">
                  {mode === "view" ? "O que você registrou para esta semana." : "Reserve um momento para revisar honestamente como foi a semana."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {mode === "edit" && (
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isGeneratingDraft}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors px-3.5 py-2 text-xs font-semibold disabled:opacity-60"
                  >
                    <Wand2 size={14} />
                    {isGeneratingDraft ? "Gerando..." : "Gerar rascunho com IA"}
                  </button>
                )}
                {mode === "view" && (
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2 text-xs font-semibold hover:border-brand-500/40 transition-colors"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>
            </div>

            {draftError && (
              <p className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl px-3 py-2.5">
                {draftError.message}
              </p>
            )}

            {mode === "view" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReflectionView label="O que funcionou bem?" value={whatWorked} />
                <ReflectionView label="O que não funcionou?" value={whatDidntWork} />
                <ReflectionView label="O que quero melhorar?" value={whatToImprove} />
                <ReflectionView label="Prioridades da próxima semana" value={nextPriorities} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReflectionField
                    label="O que funcionou bem?"
                    placeholder="Ex.: mantive a rotina de exercícios mesmo com a semana cheia..."
                    value={whatWorked}
                    onChange={setWhatWorked}
                    suggestion={pendingSuggestions.whatWorked}
                    onAcceptSuggestion={() => {
                      setWhatWorked(pendingSuggestions.whatWorked ?? "");
                      setPendingSuggestions((p) => ({ ...p, whatWorked: undefined }));
                    }}
                    onDismissSuggestion={() => setPendingSuggestions((p) => ({ ...p, whatWorked: undefined }))}
                  />
                  <ReflectionField
                    label="O que não funcionou?"
                    placeholder="Ex.: deixei o estudo para os últimos dias e não rendeu..."
                    value={whatDidntWork}
                    onChange={setWhatDidntWork}
                  />
                  <ReflectionField
                    label="O que quero melhorar?"
                    placeholder="Ex.: dormir mais cedo para render melhor pela manhã..."
                    value={whatToImprove}
                    onChange={setWhatToImprove}
                    suggestion={pendingSuggestions.whatToImprove}
                    onAcceptSuggestion={() => {
                      setWhatToImprove(pendingSuggestions.whatToImprove ?? "");
                      setPendingSuggestions((p) => ({ ...p, whatToImprove: undefined }));
                    }}
                    onDismissSuggestion={() => setPendingSuggestions((p) => ({ ...p, whatToImprove: undefined }))}
                  />
                  <ReflectionField
                    label="Prioridades da próxima semana"
                    placeholder="Ex.: finalizar o capítulo do TCC e retomar a leitura..."
                    value={nextPriorities}
                    onChange={setNextPriorities}
                    suggestion={pendingSuggestions.nextPriorities}
                    onAcceptSuggestion={() => {
                      setNextPriorities(pendingSuggestions.nextPriorities ?? "");
                      setPendingSuggestions((p) => ({ ...p, nextPriorities: undefined }));
                    }}
                    onDismissSuggestion={() => setPendingSuggestions((p) => ({ ...p, nextPriorities: undefined }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {saved && (
                    <Button variant="secondary" onClick={() => setMode("view")} className="!flex-none px-4">
                      Cancelar
                    </Button>
                  )}
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? "Salvando..." : savedFeedback ? "Revisão salva ✓" : "Salvar revisão semanal"}
                  </Button>
                </div>
              </>
            )}
            {isRpg && sealPending && reward?.awarded && <RpgCycleSeal label={`Semana ${weekLabel(weekStartDate)}`} xp={reward.xp} coins={reward.coins} />}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 sm:p-5 md:p-6">
            <div className="flex items-center gap-2"><IconBadge icon={<Sparkles size={16} />} tone="amber" size={32} /><p className="text-sm font-semibold">Copilot da revisão</p></div>
            <p className="mt-3 text-xs leading-relaxed text-slate">O Gemini usa seus registros da semana para sugerir uma reflexão e prioridades. Você revisa antes de salvar.</p>
            <Button className="mt-4 w-full" onClick={() => { setMode("edit"); void handleGenerateDraft(); }} disabled={isGeneratingDraft}><Wand2 size={14} /> {isGeneratingDraft ? "Analisando..." : "Analisar minha semana"}</Button>
            {draftError && <p className="mt-2 text-xs text-drop">{draftError.message}</p>}
            {changePct && <div className="mt-4 border-t border-paper-border pt-3 text-xs dark:border-ink-border"><p className="font-semibold">Comparado à semana anterior</p><p className="mt-1 text-slate">Tarefas: {changePct.tasksCompleted === null ? "sem base" : `${changePct.tasksCompleted > 0 ? "+" : ""}${changePct.tasksCompleted}%`} · Páginas lidas: {changePct.pagesRead === null ? "sem base" : `${changePct.pagesRead > 0 ? "+" : ""}${changePct.pagesRead}%`}</p></div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
