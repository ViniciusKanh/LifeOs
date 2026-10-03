import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { BookOpen, CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Feather, Loader2, Moon, ReceiptText, RefreshCw, Smile, Target, Trophy } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGTabs } from "@/components/rpg";
import { RpgCycleSeal, RpgEnergySelector, RpgMetricTile, RpgReviewCopilot, rpgFieldClass } from "@/components/reviews/RpgReviewParts";
import { formatSleep } from "@/utils/reviewMetrics";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import { ProvenanceBadge } from "@/components/experiments/AiThinking";
import { usePeriodicReview } from "@/hooks/useLifeOs";
import { LIFE_AREA_BY_KEY, currentCycleKeys } from "@/utils/lifeOsLabels";
import type { PeriodicKind } from "@/types";

const KINDS: Array<{ key: PeriodicKind; label: string }> = [
  { key: "monthly", label: "Mensal" },
  { key: "quarterly", label: "Trimestral" },
  { key: "annual", label: "Anual" },
];

/** Anda um período para trás/frente na chave (2026-10 / 2026-Q4 / 2026). */
export function shiftPeriod(kind: PeriodicKind, key: string, delta: number): string {
  const y = Number(key.slice(0, 4));
  if (kind === "annual") return String(y + delta);
  if (kind === "quarterly") {
    const idx = y * 4 + (Number(key.slice(-1)) - 1) + delta;
    return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
  }
  const idx = y * 12 + (Number(key.slice(5, 7)) - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

const PROMPTS: Record<PeriodicKind, { wins: string; lessons: string; focus: string }> = {
  monthly: { wins: "O que deu certo neste mês?", lessons: "O que não funcionou e por quê?", focus: "Qual é o foco do próximo mês?" },
  quarterly: { wins: "Quais metas do trimestre avançaram de verdade?", lessons: "O que você aprendeu sobre seu ritmo?", focus: "Quais são as 3 prioridades do próximo trimestre?" },
  annual: { wins: "Do que você mais se orgulha neste ano?", lessons: "O que você faria diferente?", focus: "Como deve ser o próximo ano? (temas e grandes metas)" },
};

export function RevisoesPage() {
  const now = currentCycleKeys();
  // Deep link ?tipo=monthly&periodo=2026-09 (lembrete do Hoje). Valores inválidos caem no período atual.
  const [searchParams] = useSearchParams();
  const kindParam = searchParams.get("tipo");
  const initialKind: PeriodicKind = KINDS.some((k) => k.key === kindParam) ? (kindParam as PeriodicKind) : "monthly";
  const [kind, setKind] = useState<PeriodicKind>(initialKind);
  const defaultKey = (k: PeriodicKind) => (k === "monthly" ? now.month : k === "quarterly" ? now.quarter : now.year);
  const periodParam = searchParams.get("periodo");
  const periodOk =
    periodParam != null &&
    (initialKind === "monthly" ? /^\d{4}-(0[1-9]|1[0-2])$/ : initialKind === "quarterly" ? /^\d{4}-Q[1-4]$/ : /^\d{4}$/).test(periodParam) &&
    periodParam <= defaultKey(initialKind);
  const [key, setKey] = useState(periodOk ? (periodParam as string) : defaultKey(initialKind));
  const { review, isLoading, history, save, isSaving, analyze, analysis, isAnalyzing, analyzeError, resetAnalysis } = usePeriodicReview(kind, key);
  const { isRpg } = useTheme();
  // Selo "Ciclo concluído": só quando ESTE salvamento fez o backend conceder o XP.
  const [sealJustEarned, setSealJustEarned] = useState(false);
  useEffect(() => {
    setSealJustEarned(false);
    resetAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key]);
  const [wins, setWins] = useState("");
  const [lessons, setLessons] = useState("");
  const [focusNext, setFocusNext] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWins(review?.wins ?? "");
    setLessons(review?.lessons ?? "");
    setFocusNext(review?.focusNext ?? "");
    setEnergy(review?.energyScore ?? null);
  }, [review]);

  const changeKind = (k: PeriodicKind) => {
    setKind(k);
    setKey(defaultKey(k));
  };

  const m = review?.metrics;
  const tiles = useMemo(
    () =>
      m
        ? [
            { label: "Tarefas concluídas", value: m.tasksCompleted },
            { label: "Metas concluídas", value: m.goalsCompleted },
            { label: "Check-ins de hábito", value: m.habitCheckins },
            { label: "Dias no diário", value: m.journalEntries },
            { label: "Páginas lidas", value: m.pagesRead },
            { label: "Treinos", value: m.workouts },
            { label: "Humor médio", value: m.avgMood != null ? `${m.avgMood}/5` : "—" },
            { label: "Sono médio", value: m.avgSleepMinutes != null ? `${Math.floor(m.avgSleepMinutes / 60)}h${String(m.avgSleepMinutes % 60).padStart(2, "0")}` : "—" },
            { label: "Itens de vida resolvidos", value: m.lifeAdminDone },
            { label: "Média da roda", value: m.wheelAverage != null ? `${m.wheelAverage}/10` : "—" },
          ]
        : [],
    [m]
  );

  const submit = async () => {
    const before = review?.reward.awarded ?? false;
    const after = await save({ wins: wins.trim() || null, lessons: lessons.trim() || null, focusNext: focusNext.trim() || null, energyScore: energy });
    if (!before && after.reward.awarded) setSealJustEarned(true);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const isFuture = key > defaultKey(kind);
  const p = PROMPTS[kind];

  if (isRpg) {
    const pm = review?.previousMetrics ?? null;
    const prevLabel = kind === "monthly" ? "vs. mês anterior" : kind === "quarterly" ? "vs. trimestre anterior" : "vs. ano anterior";
    const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const fields = [
      { id: "wins", label: p.wins, value: wins, set: setWins, ph: "Ex.: consegui manter a rotina de treinos e me organizei melhor com o tempo…" },
      { id: "lessons", label: p.lessons, value: lessons, set: setLessons, ph: "Ex.: tive dificuldade em manter a leitura diária porque…" },
      { id: "focus", label: p.focus, value: focusNext, set: setFocusNext, ph: "Ex.: manter a consistência na leitura e melhorar o sono…" },
    ];
    return (
      <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
        <RPGTabs label="Tipo de revisão" size="sm" tabs={KINDS.map((k) => ({ value: k.key, label: k.label }))} value={kind} onChange={changeKind} />
        <RPGPageHeader
          banner="revisoes"
          size="md"
          eyebrow="Relatório da jornada"
          title="Revisões"
          subtitle="Feche ciclos, entenda o que realmente aconteceu e planeje os próximos passos."
          aside={
            <div className="flex items-center gap-1 border border-rpg-border bg-rpg-bg/85 p-1 m-1.5" style={{ borderRadius: 4 }}>
              <button onClick={() => setKey(shiftPeriod(kind, key, -1))} className="w-9 h-9 flex items-center justify-center text-rpg-text hover:text-rpg-gold-light" aria-label="Período anterior">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[150px] text-center text-sm font-semibold capitalize text-rpg-text">{m?.label ?? key}</span>
              <button
                onClick={() => setKey(shiftPeriod(kind, key, 1))}
                disabled={shiftPeriod(kind, key, 1) > defaultKey(kind)}
                className="w-9 h-9 flex items-center justify-center text-rpg-text hover:text-rpg-gold-light disabled:opacity-30"
                aria-label="Próximo período"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <RPGPanel
              title="Retrato do período"
              icon={<CalendarCheck size={16} />}
              actions={m ? <span className="inline-flex items-center gap-1 text-[11px] text-rpg-muted"><CalendarDays size={12} aria-hidden /> {fmt(m.from)} – {fmt(m.to)}</span> : undefined}
            >
              <p className="-mt-1 mb-3 text-xs text-rpg-muted">Um resumo do período, com base nos seus registros reais.</p>
              {isLoading || !m ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rpg-panel animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
                  <RpgMetricTile icon={<CheckCircle2 size={18} />} tone="blue" label="Missões concluídas (tarefas)" value={String(m.tasksCompleted)} current={m.tasksCompleted} previous={pm?.tasksCompleted} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Target size={18} />} tone="pink" label="Metas concluídas" value={String(m.goalsCompleted)} current={m.goalsCompleted} previous={pm?.goalsCompleted} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<RefreshCw size={18} />} tone="green" label="Contratos cumpridos (hábitos)" value={String(m.habitCheckins)} current={m.habitCheckins} previous={pm?.habitCheckins} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Feather size={18} />} tone="pink" label="Dias no diário" value={String(m.journalEntries)} current={m.journalEntries} previous={pm?.journalEntries} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<BookOpen size={18} />} tone="purple" label="Páginas lidas" value={String(m.pagesRead)} current={m.pagesRead} previous={pm?.pagesRead} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Dumbbell size={18} />} tone="orange" label="Treinos realizados" value={String(m.workouts)} current={m.workouts} previous={pm?.workouts} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Smile size={18} />} tone="gold" label="Humor médio" value={m.avgMood != null ? `${m.avgMood}/5` : "—"} current={m.avgMood} previous={pm?.avgMood} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Moon size={18} />} tone="purple" label="Sono médio" value={formatSleep(m.avgSleepMinutes)} current={m.avgSleepMinutes} previous={pm?.avgSleepMinutes} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<ReceiptText size={18} />} tone="cyan" label="Itens de vida resolvidos" value={String(m.lifeAdminDone)} current={m.lifeAdminDone} previous={pm?.lifeAdminDone} previousLabel={prevLabel} />
                  <RpgMetricTile icon={<Trophy size={18} />} tone="gold" label="Média da roda da vida" value={m.wheelAverage != null ? `${m.wheelAverage}/10` : "—"} current={m.wheelAverage} previous={pm?.wheelAverage} previousLabel={prevLabel} />
                </div>
              )}
            </RPGPanel>

            <RPGPanel title="Metas deste período" icon={<Target size={16} />} actions={<Link to="/direcao" className="text-xs text-rpg-gold-light hover:underline">Ver todas as metas →</Link>}>
              {!m || m.goals.length === 0 ? (
                <p className="text-sm text-rpg-muted">Nenhuma meta com ciclo neste período. <Link to="/direcao" className="text-rpg-gold-light hover:underline">Definir na Direção →</Link></p>
              ) : (
                <ul className="space-y-3">
                  {m.goals.map((g) => {
                    const area = g.lifeArea ? LIFE_AREA_BY_KEY[g.lifeArea] : null;
                    return (
                      <li key={g.id} className="flex items-center gap-3">
                        <span className="w-6 text-center" aria-hidden>{area?.emoji ?? "🎯"}</span>
                        <RPGProgressBar
                          className="flex-1"
                          tone={g.status === "done" ? "green" : "purple"}
                          label={g.status === "done" ? `${g.title} (concluída)` : g.title}
                          value={g.progressPct ?? 0}
                          valueLabel={g.progressPct != null ? `${g.progressPct}%` : "—"}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {kind !== "monthly" && (
                <p className="text-[11px] text-rpg-muted mt-3">
                  Fechando {kind === "quarterly" ? "o trimestre" : "o ano"}? <Link to="/direcao" className="text-rpg-gold-light hover:underline">Reavalie a roda da vida</Link> para comparar com a anterior.
                </p>
              )}
            </RPGPanel>
          </div>

          <div className="space-y-4 min-w-0">
            <RPGPanel
              title="Sua reflexão"
              icon={<Feather size={16} />}
              actions={review?.savedAt ? <span className="text-[11px] text-rpg-muted">Salva em {new Date(review.savedAt.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}</span> : undefined}
            >
              <p className="-mt-1 mb-3 text-xs text-rpg-muted">Registre o que você aprendeu, o que funcionou e o que quer melhorar.</p>
              {isFuture ? (
                <p className="text-sm text-rpg-muted">Esse período ainda não começou.</p>
              ) : (
                <div className="space-y-4">
                  {fields.map((f) => (
                    <div key={f.id}>
                      <label htmlFor={`rev-rpg-${f.id}`} className="text-xs font-semibold text-rpg-text">{f.label}</label>
                      <textarea id={`rev-rpg-${f.id}`} rows={3} value={f.value} placeholder={f.ph} onChange={(e) => f.set(e.target.value)} maxLength={6000} className={`${rpgFieldClass} mt-1.5`} style={{ borderRadius: 3 }} />
                      <p className="text-right text-[10px] text-rpg-muted tabular-nums">{f.value.length}/6000</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs font-semibold text-rpg-text mb-1.5">Como foi sua energia no período? (1–10)</p>
                    <RpgEnergySelector value={energy} onChange={setEnergy} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {sealJustEarned && review ? <RpgCycleSeal label={m?.label ?? key} xp={review.reward.xp} coins={review.reward.coins} /> : <span />}
                    <RPGButton variant="gold" onClick={submit} disabled={isSaving}>
                      {isSaving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : saved ? <Check size={14} aria-hidden /> : null} {saved ? "Salvo" : "Salvar revisão"}
                    </RPGButton>
                  </div>
                </div>
              )}
              {history.length > 0 && (
                <div className="mt-4 pt-3 border-t border-rpg-border/70">
                  <p className="text-xs font-semibold text-rpg-muted mb-2">Revisões anteriores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {history.map((h) => (
                      <button
                        key={h.periodKey}
                        onClick={() => setKey(h.periodKey)}
                        aria-pressed={h.periodKey === key}
                        className={`px-2.5 py-1 text-[11px] border ${h.periodKey === key ? "border-rpg-gold text-rpg-gold-light bg-rpg-gold/10" : "border-rpg-border text-rpg-muted"}`}
                        style={{ borderRadius: 3 }}
                      >
                        {h.periodKey}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </RPGPanel>

            <RpgReviewCopilot
              reward={review?.reward ?? null}
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              error={analyzeError?.message ?? null}
              onAnalyze={() => void analyze().catch(() => undefined)}
              basedOnLabel={m?.label ?? key}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8 space-y-4">
      <PageHeader
        icon={<CalendarCheck size={20} />}
        title="Revisões"
        subtitle="Feche o mês, o trimestre e o ano olhando para o que de fato aconteceu."
        actions={
          <Link to="/weekly-review" className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            Revisão semanal →
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tipo de revisão" className="flex rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-0.5">
          {KINDS.map((k) => (
            <button
              key={k.key}
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => changeKind(k.key)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold ${kind === k.key ? "text-brand-700 dark:text-brand-100" : "text-slate"}`}
            >
              {kind === k.key && <motion.span layoutId="review-kind" className="absolute inset-0 rounded-lg bg-white dark:bg-ink-raised shadow-sm" />}
              <span className="relative">{k.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setKey(shiftPeriod(kind, key, -1))} className="w-8 h-8 rounded-lg border border-paper-border dark:border-ink-border flex items-center justify-center" aria-label="Período anterior">
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[150px] text-center text-sm font-semibold capitalize">{m?.label ?? key}</span>
          <button
            onClick={() => setKey(shiftPeriod(kind, key, 1))}
            disabled={shiftPeriod(kind, key, 1) > defaultKey(kind)}
            className="w-8 h-8 rounded-lg border border-paper-border dark:border-ink-border flex items-center justify-center disabled:opacity-30"
            aria-label="Próximo período"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <ProvenanceBadge kind="dado" />
              <p className="text-xs text-slate">Retrato do período, calculado dos seus registros</p>
            </div>
            {isLoading || !m ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5 gap-2">
                {tiles.map((t, i) => (
                  <motion.div key={t.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-xl bg-paper dark:bg-ink border border-paper-border dark:border-ink-border p-2.5">
                    <p className="text-lg font-bold tabular-nums leading-none">{t.value}</p>
                    <p className="text-[10.5px] text-slate mt-1 leading-tight">{t.label}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-sm font-semibold mb-2">Metas deste período</p>
            {!m || m.goals.length === 0 ? (
              <p className="text-xs text-slate">
                Nenhuma meta com ciclo neste período. <Link to="/direcao" className="text-brand-600 dark:text-brand-400 font-medium">Definir na Direção →</Link>
              </p>
            ) : (
              <ul className="space-y-2.5">
                {m.goals.map((g) => {
                  const area = g.lifeArea ? LIFE_AREA_BY_KEY[g.lifeArea] : null;
                  return (
                    <li key={g.id}>
                      <div className="flex items-center gap-2 text-xs">
                        <span>{area?.emoji ?? "🎯"}</span>
                        <span className={`flex-1 truncate ${g.status === "done" ? "line-through text-slate" : "font-medium"}`}>{g.title}</span>
                        <span className="tabular-nums font-semibold">{g.progressPct != null ? `${g.progressPct}%` : "—"}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.07] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${g.progressPct ?? 0}%`, background: area?.color ?? "#9550FF" }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {kind !== "monthly" && (
              <p className="text-[11px] text-slate mt-3">
                Fechando {kind === "quarterly" ? "o trimestre" : "o ano"}? <Link to="/direcao" className="text-brand-600 dark:text-brand-400 font-medium">Reavalie a roda da vida</Link> para comparar com a anterior.
              </p>
            )}
          </Card>
        </div>

        <Card className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold flex-1">Sua reflexão</p>
            {review?.savedAt && <span className="text-[11px] text-slate">Salva em {new Date(review.savedAt.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}</span>}
          </div>
          {isFuture ? (
            <p className="text-xs text-slate">Esse período ainda não começou.</p>
          ) : (
            <>
              {[
                { id: "wins", label: p.wins, value: wins, set: setWins },
                { id: "lessons", label: p.lessons, value: lessons, set: setLessons },
                { id: "focus", label: p.focus, value: focusNext, set: setFocusNext },
              ].map((f) => (
                <div key={f.id}>
                  <label htmlFor={`rev-${f.id}`} className="text-xs font-medium text-slate">
                    {f.label}
                  </label>
                  <textarea id={`rev-${f.id}`} rows={4} value={f.value} onChange={(e) => f.set(e.target.value)} maxLength={6000} className={`${inputClass} mt-1.5 resize-y`} />
                </div>
              ))}
              <div>
                <p className="text-xs font-medium text-slate mb-1.5">Como foi sua energia no período? (1–10)</p>
                <div className="flex gap-1" role="radiogroup" aria-label="Energia">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={energy === n}
                      onClick={() => setEnergy(energy === n ? null : n)}
                      className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                        energy != null && n <= energy ? "bg-cat-purple text-white border-cat-purple" : "border-paper-border dark:border-ink-border"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={submit} disabled={isSaving}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? "Salvo" : "Salvar revisão"}
                </Button>
              </div>
            </>
          )}

          {history.length > 0 && (
            <div className="pt-3 border-t border-paper-border dark:border-ink-border">
              <p className="text-xs font-semibold text-slate mb-2">Revisões anteriores</p>
              <div className="flex flex-wrap gap-1.5">
                {history.map((h) => (
                  <button
                    key={h.periodKey}
                    onClick={() => setKey(h.periodKey)}
                    className={`rounded-full px-2.5 py-1 text-[11px] border ${h.periodKey === key ? "border-brand-500 bg-brand-500/10" : "border-paper-border dark:border-ink-border"}`}
                  >
                    {h.periodKey}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
