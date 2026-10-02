import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
  const { review, isLoading, history, save, isSaving } = usePeriodicReview(kind, key);
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
    await save({ wins: wins.trim() || null, lessons: lessons.trim() || null, focusNext: focusNext.trim() || null, energyScore: energy });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const isFuture = key > defaultKey(kind);
  const p = PROMPTS[kind];

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
