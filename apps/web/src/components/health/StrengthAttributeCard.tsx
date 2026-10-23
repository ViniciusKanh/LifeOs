import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dumbbell, Swords, Trophy } from "lucide-react";
import clsx from "clsx";
import { useHealthStrength } from "@/hooks/useHealth";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { fightModalityLabel } from "@/components/health/workoutCatalog";
import { dateKeyToLocalDate } from "@/utils/localDate";
import type { StrengthExercise, StrengthReport } from "@/types";

/* Cores das séries sempre pelos tokens RPG (sem hex solto). */
const COLOR = {
  load: "rgb(var(--rpg-gold))",
  oneRm: "rgb(var(--rpg-purple))",
  rounds: "rgb(var(--rpg-red))",
  grid: "rgb(var(--rpg-border) / 0.6)",
  tick: "rgb(var(--rpg-text-muted))",
};
const TOOLTIP_STYLE = {
  background: "rgb(var(--rpg-panel))",
  border: "2px solid rgb(var(--rpg-border))",
  borderRadius: 4,
  color: "rgb(var(--rpg-text))",
  fontSize: 12,
};
const EXERCISES_PREVIEW = 6;

const kgFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const kg = (value: number) => `${kgFormat.format(value)} kg`;
const shortDate = (key: string) => dateKeyToLocalDate(key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function hasNewPr(e: StrengthExercise) {
  return e.lastSession.newPrLoad || e.lastSession.newPr1rm || e.lastSession.newPrVolume;
}

/**
 * "Atributo Força" da tela Saúde: nível derivado de sessões e PRs reais,
 * recordes por exercício de musculação, evolução de carga/1RM e volume de
 * luta. Todos os números vêm de GET /api/health/strength (strengthService.ts).
 */
export function StrengthAttributeCard() {
  const { report, isLoading, isError, refetch } = useHealthStrength(180);

  return (
    <RPGPanel
      title="Atributo Força"
      icon={<Dumbbell size={14} />}
      variant="gold"
      actions={report ? <RPGBadge tone="gold">Nível {report.level.level}</RPGBadge> : undefined}
    >
      {isLoading ? (
        <StrengthSkeleton />
      ) : isError || !report ? (
        <div className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível carregar sua evolução de Força agora.</p>
          <RPGButton variant="secondary" onClick={() => void refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      ) : (
        <StrengthBody report={report} />
      )}
    </RPGPanel>
  );
}

function StrengthBody({ report }: { report: StrengthReport }) {
  const { exercises } = report;
  const [selectedKey, setSelectedKey] = useState<string | null>(exercises[0]?.key ?? null);
  // Lista mudou (treino criado/excluído): mantém a seleção se ainda existir.
  useEffect(() => {
    if (!exercises.some((e) => e.key === selectedKey)) setSelectedKey(exercises[0]?.key ?? null);
  }, [exercises, selectedKey]);
  const selected = exercises.find((e) => e.key === selectedKey) ?? null;

  return (
    <div className="space-y-4">
      <LevelBlock report={report} />
      {exercises.length === 0 ? (
        <div className="border-2 border-dashed border-rpg-border/80 px-4 py-6 text-center" style={{ borderRadius: 3 }}>
          <Dumbbell size={22} className="mx-auto mb-2 text-rpg-gold-light" aria-hidden />
          <p className="text-sm text-rpg-text">Registre um treino de musculação com séries para ver sua evolução.</p>
          <p className="mt-1 text-xs text-rpg-muted">Use “Registrar treino” no card de Exercícios, escolha Musculação e informe séries × reps × carga.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ExerciseList exercises={exercises} selectedKey={selectedKey} onSelect={setSelectedKey} days={report.days} />
          {selected && <ExerciseChart exercises={exercises} exercise={selected} onSelect={setSelectedKey} />}
        </div>
      )}
      <FightBlock fight={report.fight} />
    </div>
  );
}

function LevelBlock({ report }: { report: StrengthReport }) {
  const { level } = report;
  const chips = [
    { label: "Musculação", value: level.strengthSessions },
    { label: "Luta", value: level.fightSessions },
    { label: "PRs", value: level.prs },
  ];
  return (
    <div className="flex flex-col gap-3 border-2 border-rpg-border bg-rpg-bg/60 p-3 sm:flex-row sm:items-center" style={{ borderRadius: 3 }}>
      <div className="flex items-center gap-3 sm:w-[min(100%,300px)] sm:shrink-0">
        <span
          className="inline-flex h-14 w-14 shrink-0 flex-col items-center justify-center border-2 border-rpg-gold/80 bg-rpg-panel text-rpg-gold-light"
          style={{ borderRadius: 3 }}
          aria-label={`Nível de Força ${level.level}`}
        >
          <span className="font-pixel text-[10px] uppercase leading-none">Nv</span>
          <span className="font-rpg text-2xl font-bold leading-none tabular-nums">{level.level}</span>
        </span>
        <div className="min-w-0 flex-1">
          <RPGProgressBar
            tone="gold"
            label={`${level.points} pontos nos últimos ${level.windowDays} dias`}
            value={level.pointsIntoLevel}
            max={level.pointsPerLevel}
            valueLabel={`${level.pointsIntoLevel}/${level.pointsPerLevel}`}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className="border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[11px] text-rpg-muted" style={{ borderRadius: 2 }}>
                {c.label} <strong className="font-pixel text-rpg-text tabular-nums">{c.value}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="min-w-0 text-[11px] leading-relaxed text-rpg-muted sm:border-l sm:border-rpg-border/70 sm:pl-3">
        <span className="font-pixel uppercase tracking-wide text-rpg-gold-light">Como é calculado · </span>
        {level.formula} PR = sessão em que a carga máxima ou o 1RM estimado superou todas as anteriores do exercício.
      </p>
    </div>
  );
}

function ExerciseList({
  exercises,
  selectedKey,
  onSelect,
  days,
}: {
  exercises: StrengthExercise[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  days: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? exercises : exercises.slice(0, EXERCISES_PREVIEW);
  return (
    <div className="min-w-0">
      <p className="mb-2 font-pixel text-[11px] uppercase tracking-wide text-rpg-gold-light">Recordes · últimos {days} dias</p>
      <ul className="space-y-1.5">
        {visible.map((e) => {
          const active = e.key === selectedKey;
          return (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => onSelect(e.key)}
                aria-pressed={active}
                className={clsx(
                  "flex w-full min-w-0 flex-col gap-1.5 border-2 px-3 py-2 text-left transition-colors sm:flex-row sm:items-center sm:gap-3",
                  active ? "border-rpg-gold/80 bg-rpg-panel-light" : "border-rpg-border bg-rpg-bg/50 hover:bg-rpg-panel-hover"
                )}
                style={{ borderRadius: 3 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-rpg-text">{e.name}</span>
                    {hasNewPr(e) && (
                      <RPGBadge tone="gold" icon={<Trophy size={10} aria-hidden />} className="shadow-[0_0_8px_rgb(var(--rpg-gold)/0.45)]">
                        Novo PR
                      </RPGBadge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-rpg-muted">
                    Última: {shortDate(e.lastSession.date)} · {kg(e.lastSession.maxLoadKg)} × {e.lastSession.repsAtMaxLoad}
                  </p>
                </div>
                <dl className="grid shrink-0 grid-cols-2 gap-x-4 text-left sm:text-right">
                  <dt className="font-pixel text-[9px] uppercase text-rpg-muted">Carga</dt>
                  <dt className="font-pixel text-[9px] uppercase text-rpg-muted">1RM</dt>
                  <dd className={clsx("text-sm font-semibold tabular-nums", e.lastSession.newPrLoad ? "text-rpg-gold-light" : "text-rpg-text")}>{kg(e.prLoad.value)}</dd>
                  <dd className={clsx("text-sm font-semibold tabular-nums", e.lastSession.newPr1rm ? "text-rpg-gold-light" : "text-rpg-purple")}>{kg(e.pr1rm.value)}</dd>
                </dl>
              </button>
            </li>
          );
        })}
      </ul>
      {exercises.length > EXERCISES_PREVIEW && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-rpg-gold-light underline underline-offset-2">
          {showAll ? "Mostrar menos" : `Ver todos (${exercises.length})`}
        </button>
      )}
    </div>
  );
}

function ExerciseChart({
  exercises,
  exercise,
  onSelect,
}: {
  exercises: StrengthExercise[];
  exercise: StrengthExercise;
  onSelect: (key: string) => void;
}) {
  const data = useMemo(
    () => exercise.sessions.map((s) => ({ label: shortDate(s.date), Carga: s.maxLoadKg, "1RM": s.est1rmKg, reps: s.repsAtMaxLoad, volume: s.volumeKg })),
    [exercise]
  );
  return (
    <div className="min-w-0 border-2 border-rpg-border bg-rpg-bg/50 p-3" style={{ borderRadius: 3 }}>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex w-full min-w-0 items-center gap-2 text-[11px] text-rpg-muted sm:w-auto sm:flex-1">
          <span className="shrink-0 font-pixel uppercase tracking-wide text-rpg-gold-light">Evolução</span>
          <select
            value={exercise.key}
            onChange={(ev) => onSelect(ev.target.value)}
            className="min-w-0 max-w-full flex-1 border-2 border-rpg-border bg-rpg-panel px-2 py-1 text-sm text-rpg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rpg-gold"
            style={{ borderRadius: 3 }}
            aria-label="Exercício do gráfico"
          >
            {exercises.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3 text-[11px] text-rpg-muted">
          <Legend color="bg-rpg-gold" label="Carga máx." />
          <Legend color="bg-rpg-purple" label="1RM (Epley)" />
        </div>
      </div>
      {data.length < 2 ? (
        <p className="py-10 text-center text-xs text-rpg-muted">Registre mais uma sessão de {exercise.name} para traçar a evolução.</p>
      ) : (
        <div className="h-48 sm:h-56" role="img" aria-label={`Evolução de carga máxima e 1RM estimado de ${exercise.name}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: COLOR.tick }} minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: COLOR.tick }} domain={["auto", "auto"]} width={48} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "rgb(var(--rpg-gold-light))" }}
                formatter={(value, name) => [kg(Number(value)), String(name)]}
              />
              <Line type="monotone" dataKey="Carga" stroke={COLOR.load} strokeWidth={2} dot={{ r: 3, fill: COLOR.load }} />
              <Line type="monotone" dataKey="1RM" stroke={COLOR.oneRm} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: COLOR.oneRm }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <PrStat label="PR carga" value={kg(exercise.prLoad.value)} date={exercise.prLoad.date} highlight={exercise.lastSession.newPrLoad} />
        <PrStat label="PR 1RM" value={kg(exercise.pr1rm.value)} date={exercise.pr1rm.date} highlight={exercise.lastSession.newPr1rm} />
        <PrStat label="PR volume" value={kg(exercise.prVolume.value)} date={exercise.prVolume.date} highlight={exercise.lastSession.newPrVolume} />
      </dl>
    </div>
  );
}

function PrStat({ label, value, date, highlight }: { label: string; value: string; date: string; highlight: boolean }) {
  return (
    <div className={clsx("min-w-0 border px-1.5 py-1.5", highlight ? "border-rpg-gold/80 bg-rpg-gold/10" : "border-rpg-border")} style={{ borderRadius: 2 }}>
      <dt className="font-pixel text-[9px] uppercase text-rpg-muted">{label}</dt>
      <dd className={clsx("truncate text-sm font-semibold tabular-nums", highlight ? "text-rpg-gold-light" : "text-rpg-text")}>{value}</dd>
      <dd className="text-[10px] text-rpg-muted">{highlight ? "Novo PR!" : shortDate(date)}</dd>
    </div>
  );
}

function FightBlock({ fight }: { fight: StrengthReport["fight"] }) {
  const data = fight.weeks.map((w) => ({ label: shortDate(w.weekStart), Rounds: w.rounds, minutos: w.minutes, sessões: w.sessions }));
  const big = fight.biggestSession;
  return (
    <div className="border-2 border-rpg-border bg-rpg-bg/50 p-3" style={{ borderRadius: 3 }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-wide text-rpg-gold-light">
          <Swords size={13} aria-hidden /> Luta · rounds por semana (8 semanas)
        </p>
        {fight.totalSessions > 0 && (
          <p className="text-[11px] text-rpg-muted">
            <strong className="text-rpg-text">{fight.totalSessions}</strong> treinos · <strong className="text-rpg-text">{fight.totalRounds}</strong> rounds ·{" "}
            <strong className="text-rpg-text">{fight.totalMinutes}</strong> min
          </p>
        )}
      </div>
      {fight.totalSessions === 0 ? (
        <p className="py-3 text-xs text-rpg-muted">Nenhum treino de luta nas últimas 8 semanas. Registre um com modalidade e rounds para acompanhar aqui.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
          <div className="h-36" role="img" aria-label="Rounds de luta por semana nas últimas 8 semanas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -26 }}>
                <CartesianGrid vertical={false} stroke={COLOR.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} tick={{ fill: COLOR.tick }} interval="preserveStartEnd" minTickGap={6} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} tick={{ fill: COLOR.tick }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "rgb(var(--rpg-gold-light))" }}
                  labelFormatter={(label) => `Semana de ${String(label)}`}
                  formatter={(value, _name, item) => {
                    const p = item.payload as (typeof data)[number];
                    return [`${Number(value)} · ${p.minutos} min · ${p.sessões} ${p.sessões === 1 ? "treino" : "treinos"}`, "Rounds"];
                  }}
                  cursor={{ fill: "rgb(var(--rpg-gold) / 0.08)" }}
                />
                <Bar dataKey="Rounds" fill={COLOR.rounds} radius={[2, 2, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {big && (
            <div className="border border-rpg-border bg-rpg-panel px-3 py-2" style={{ borderRadius: 2 }}>
              <p className="font-pixel text-[9px] uppercase text-rpg-muted">Maior sessão</p>
              <p className="text-sm font-semibold text-rpg-text">
                {big.rounds ? `${big.rounds} rounds` : `${big.minutes} min`}
                {big.rounds ? <span className="font-normal text-rpg-muted"> · {big.minutes} min</span> : null}
              </p>
              <p className="text-[11px] text-rpg-muted">
                {shortDate(big.date)}
                {big.modality ? ` · ${fightModalityLabel(big.modality)}` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={clsx("h-2 w-2", color)} aria-hidden /> {label}
    </span>
  );
}

function StrengthSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando atributo Força">
      <div className="h-20 animate-pulse border-2 border-rpg-border bg-rpg-bg/60" style={{ borderRadius: 3 }} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse border-2 border-rpg-border bg-rpg-bg/50" style={{ borderRadius: 3 }} />
          ))}
        </div>
        <div className="h-56 animate-pulse border-2 border-rpg-border bg-rpg-bg/50" style={{ borderRadius: 3 }} />
      </div>
    </div>
  );
}
