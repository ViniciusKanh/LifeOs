import { Link } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleDashed, Flame, FlaskConical, Lightbulb, Scale, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { formatMetricValue } from "./ExperimentComparison";
import type { ExperimentAnalysis, ExperimentEvidence, ExperimentMetricAnalysis, ExperimentPerception, ExperimentSuccessStatus } from "@/types";

/**
 * Análise aprofundada do experimento — só apresentação; todo cálculo vem
 * de GET /experiments/:id/analysis (experimentAnalysisService.ts).
 */

const VERDICT_TONE: Record<ExperimentAnalysis["verdict"]["tone"], { card: string; icon: JSX.Element }> = {
  positive: { card: "from-cat-green/15 via-cat-green/5 border-cat-green/30", icon: <TrendingUp size={20} className="text-cat-green" /> },
  negative: { card: "from-drop/12 via-drop/5 border-drop/30", icon: <TrendingDown size={20} className="text-drop" /> },
  neutral: { card: "from-slate/12 via-slate/5 border-slate/25", icon: <Scale size={20} className="text-slate" /> },
  collecting: { card: "from-cat-purple/15 via-cat-purple/5 border-cat-purple/30", icon: <CircleDashed size={20} className="text-cat-purple" /> },
  warning: { card: "from-signal/18 via-signal/5 border-signal/35", icon: <AlertTriangle size={20} className="text-signal-deep" /> },
};

const EVIDENCE_META: Record<ExperimentEvidence, { label: string; className: string; hint: string }> = {
  strong: { label: "Evidência forte", className: "bg-cat-green/12 text-cat-green", hint: "Diferença grande, consistente e com amostra suficiente." },
  moderate: { label: "Evidência moderada", className: "bg-cat-blue/12 text-cat-blue", hint: "Diferença relevante e fora da margem de incerteza." },
  weak: { label: "Evidência fraca", className: "bg-signal/15 text-signal-deep dark:text-signal", hint: "Há diferença, mas a margem de incerteza ainda inclui o zero." },
  none: { label: "Sem diferença clara", className: "bg-slate/12 text-slate", hint: "A diferença é pequena frente à sua variação normal." },
  insufficient: { label: "Dados insuficientes", className: "bg-slate/12 text-slate", hint: "São necessários pelo menos 3 dias com dado antes e durante." },
};

const SUCCESS_META: Record<ExperimentSuccessStatus, { label: string; className: string }> = {
  met: { label: "Meta atingida", className: "bg-cat-green/12 text-cat-green" },
  not_met: { label: "Meta não atingida", className: "bg-drop/10 text-drop" },
  on_track: { label: "No caminho", className: "bg-cat-green/12 text-cat-green" },
  at_risk: { label: "Em risco", className: "bg-signal/15 text-signal-deep dark:text-signal" },
  unreachable: { label: "Fora de alcance", className: "bg-drop/10 text-drop" },
  pending: { label: "Aguardando dados", className: "bg-slate/12 text-slate" },
  none: { label: "Sem critério", className: "bg-slate/12 text-slate" },
};

const PERCEPTION_ROW: Array<{ key: ExperimentPerception; emoji: string; label: string }> = [
  { key: "muito_ruim", emoji: "😞", label: "Muito ruim" },
  { key: "ruim", emoji: "🙁", label: "Ruim" },
  { key: "neutro", emoji: "😐", label: "Neutro" },
  { key: "bom", emoji: "🙂", label: "Bom" },
  { key: "muito_bom", emoji: "😄", label: "Muito bom" },
];

function signed(v: number | null, unit: string | null) {
  if (v === null) return "—";
  const text = formatMetricValue(Math.abs(v), unit);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${text}`;
}

/** Régua do tamanho do efeito: −1,5 (piora) … 0 … +1,5 (melhora). */
function EffectGauge({ g }: { g: number | null }) {
  const clamped = g === null ? 0 : Math.max(-1.5, Math.min(1.5, g));
  const pct = ((clamped + 1.5) / 3) * 100;
  return (
    <div aria-label={g === null ? "Tamanho do efeito indisponível" : `Tamanho do efeito ${g}`} role="img">
      <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-drop/35 via-slate/20 to-cat-green/40">
        <span className="absolute inset-y-0 left-1/2 w-px bg-slate/50" aria-hidden />
      </div>
      {g !== null && (
        <motion.span
          className="relative block -mt-3 w-4 h-4 rounded-full border-2 border-paper-raised dark:border-ink-raised shadow bg-cat-purple"
          initial={{ left: "50%" }}
          whileInView={{ left: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 140, damping: 18 }}
          style={{ marginLeft: -8 }}
        />
      )}
      <div className="flex justify-between text-[9px] text-slate mt-1">
        <span>Piora</span>
        <span>Sem efeito</span>
        <span>Melhora</span>
      </div>
    </div>
  );
}

function MetricEvidenceCard({ m, index }: { m: ExperimentMetricAnalysis; index: number }) {
  const ev = EVIDENCE_META[m.effect.evidence];
  const adh = m.adherence;
  const adhMax = Math.max(Math.abs(adh?.doneMean ?? 0), Math.abs(adh?.missedMean ?? 0), 0.0001);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
      className={clsx("rounded-2xl border p-4", m.isPrimary ? "border-cat-purple/35 bg-cat-purple/[0.03]" : "border-paper-border dark:border-ink-border")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{m.label}</p>
          <p className="text-[10px] text-slate">{m.isPrimary ? "Métrica principal" : "Métrica secundária"}{m.inverse ? " · menor é melhor" : ""}</p>
        </div>
        <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", ev.className)} title={ev.hint}>
          {ev.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <p className="text-[10px] text-slate">Antes ({m.before.n}d)</p>
          <p className="font-display font-bold text-lg leading-tight text-slate">{formatMetricValue(m.before.mean, m.unit)}</p>
        </div>
        <span className="text-slate pb-1">→</span>
        <div className="text-right">
          <p className="text-[10px] text-slate">Durante ({m.during.n}d)</p>
          <p className="font-display font-bold text-lg leading-tight text-cat-purple">{formatMetricValue(m.during.mean, m.unit)}</p>
        </div>
      </div>

      {m.effect.evidence !== "insufficient" && (
        <>
          <div className="mt-3">
            <EffectGauge g={m.effect.effectSize} />
          </div>
          <p className="text-[11px] text-slate mt-2">
            Diferença {signed(m.effect.diff, m.unit)} · faixa provável {signed(m.effect.ciLow, m.unit)} a {signed(m.effect.ciHigh, m.unit)}
            {m.effect.outsideNaturalRange !== null && (m.effect.outsideNaturalRange ? " · saiu da sua variação normal" : " · dentro da sua variação normal")}
          </p>
        </>
      )}

      {adh && (adh.doneDays > 0 || adh.missedDays > 0) && (
        <div className="mt-3 pt-3 border-t border-paper-border/70 dark:border-ink-border/70">
          <p className="text-[10px] font-semibold text-slate uppercase tracking-wide mb-1.5">Quando você cumpriu × não cumpriu</p>
          {[
            { label: `Cumpriu (${adh.doneDays}d)`, v: adh.doneMean, tone: "bg-cat-green" },
            { label: `Não cumpriu (${adh.missedDays}d)`, v: adh.missedMean, tone: "bg-slate/50" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-[11px] mt-1">
              <span className="w-24 shrink-0 text-slate">{row.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                <motion.div
                  className={clsx("h-full rounded-full", row.tone)}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${row.v === null ? 0 : (Math.abs(row.v) / adhMax) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <span className="w-14 text-right font-semibold tabular-nums">{formatMetricValue(row.v, m.unit)}</span>
            </div>
          ))}
          {adh.favorableDiff === null && <p className="text-[10px] text-slate mt-1.5">São precisos ao menos 2 dias de cada tipo para comparar.</p>}
        </div>
      )}
      <p className="text-[10px] text-slate mt-2">Cobertura: {m.coveragePct}% dos dias do experimento têm registro.</p>
    </motion.div>
  );
}

export function ExperimentAnalysisPanel({
  analysis,
  consistencyPct,
  isLoading,
}: {
  analysis: ExperimentAnalysis | null;
  consistencyPct: number | null;
  isLoading: boolean;
}) {
  if (isLoading || !analysis) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-36 rounded-2xl bg-paper-border/50 dark:bg-ink-border/50 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-56 rounded-2xl bg-paper-border/50 dark:bg-ink-border/50 animate-pulse" />
          <div className="h-56 rounded-2xl bg-paper-border/50 dark:bg-ink-border/50 animate-pulse" />
        </div>
      </div>
    );
  }
  const tone = VERDICT_TONE[analysis.verdict.tone];
  const success = analysis.success;
  const successMeta = SUCCESS_META[success.status];
  const weeklyMax = Math.max(0.0001, ...analysis.weekly.map((w) => Math.abs(w.primaryMean ?? 0)));
  const primary = analysis.metrics.find((m) => m.isPrimary);
  const perceptionMax = Math.max(1, ...Object.values(analysis.perception.counts));

  return (
    <div className="space-y-4">
      {/* Veredito */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx("rounded-2xl border bg-gradient-to-br to-transparent p-5 md:p-6", tone.card)}
      >
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-2 font-display font-bold text-xl">
              {tone.icon} {analysis.verdict.title}
            </p>
            <p className="text-sm mt-2 leading-relaxed">{analysis.verdict.text}</p>
            <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl bg-paper-raised/70 dark:bg-ink-raised/70 px-3 py-2 text-xs">
              <Lightbulb size={13} className="text-signal-deep shrink-0 mt-0.5" />
              <span>{analysis.verdict.nextStep}</span>
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-1 gap-2 md:w-40 shrink-0">
            {[
              { icon: <CheckCircle2 size={14} className="text-cat-green" />, label: "Consistência", value: consistencyPct === null ? "—" : `${consistencyPct}%` },
              { icon: <Flame size={14} className="text-signal" />, label: "Sequência", value: `${analysis.streak.current}d (recorde ${analysis.streak.best})` },
              { icon: <Target size={14} className="text-cat-purple" />, label: "Restam", value: `${analysis.daysRemaining} dia(s)` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-paper-raised/80 dark:bg-ink-raised/80 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] text-slate">{s.icon} {s.label}</p>
                <p className="text-sm font-semibold leading-tight mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {analysis.overlaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-signal/35 bg-signal/10 px-3 py-2.5 text-xs">
          <FlaskConical size={14} className="text-signal-deep shrink-0 mt-0.5" />
          <p>
            Rodando no mesmo período:{" "}
            {analysis.overlaps.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ", "}
                <Link to={`/experimentos/${o.id}`} className="font-semibold hover:underline">{o.title}</Link>
                {o.sharesMetric && " (mede a mesma métrica)"}
              </span>
            ))}
            . Experimentos simultâneos dificultam saber qual mudança gerou o efeito.
          </p>
        </div>
      )}

      {/* Evidência por métrica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {analysis.metrics.map((m, i) => (
          <MetricEvidenceCard key={m.metric} m={m} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Critério de sucesso */}
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Trophy size={14} className="text-signal" /> Critério de sucesso
            </p>
            <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold", successMeta.className)}>{successMeta.label}</span>
          </div>
          {success.type !== "none" && success.target !== null && (
            <div className="my-3">
              <div className="relative h-2.5 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                <motion.div
                  className={clsx("h-full rounded-full", success.status === "met" || success.status === "on_track" ? "bg-cat-green" : "bg-signal")}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${Math.max(0, Math.min(100, ((success.current ?? 0) / Math.max(success.target, 1)) * 100))}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7 }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate mt-1">
                <span>Atual: {success.current === null ? "—" : `${success.current}%`}</span>
                <span>Meta: {success.target}%</span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate">{success.message}</p>
        </Card>

        {/* Semana a semana */}
        <Card className="p-4 md:p-5">
          <p className="text-sm font-semibold mb-3">{primary?.label ?? "Métrica principal"} semana a semana</p>
          {analysis.weekly.length === 0 ? (
            <p className="text-xs text-slate">O experimento ainda não começou.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {analysis.weekly.map((w, i) => (
                <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0" title={`${w.from} a ${w.to}`}>
                  <span className="text-[10px] font-semibold tabular-nums truncate max-w-full">{formatMetricValue(w.primaryMean, primary?.unit ?? null)}</span>
                  <motion.div
                    className="w-full rounded-t-md bg-gradient-to-t from-cat-purple to-cat-blue"
                    initial={{ height: 0 }}
                    whileInView={{ height: `${w.primaryMean === null ? 2 : Math.max(6, (Math.abs(w.primaryMean) / weeklyMax) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.06 }}
                  />
                  <span className="text-[10px] text-slate">Sem {w.week}</span>
                  <span className="text-[9px] text-slate">{w.consistencyPct === null ? "—" : `${w.consistencyPct}% ✓`}</span>
                </div>
              ))}
            </div>
          )}
          {primary?.before.mean != null && (
            <p className="text-[10px] text-slate mt-2">Referência do período anterior: {formatMetricValue(primary.before.mean, primary.unit)}.</p>
          )}
        </Card>
      </div>

      {/* Percepção */}
      <Card className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold">Como você se sentiu</p>
          {analysis.perception.avg !== null && (
            <span className="text-xs text-slate">
              Média {String(analysis.perception.avg).replace(".", ",")}/5
              {analysis.perception.firstHalfAvg !== null && analysis.perception.secondHalfAvg !== null && (
                <> · 1ª metade {String(analysis.perception.firstHalfAvg).replace(".", ",")} → 2ª metade {String(analysis.perception.secondHalfAvg).replace(".", ",")}</>
              )}
            </span>
          )}
        </div>
        {analysis.perception.total === 0 ? (
          <p className="text-xs text-slate">Nenhuma percepção registrada ainda. No check-in do dia, toque no emoji que representa como você se sentiu.</p>
        ) : (
          <div className="grid grid-cols-5 gap-2 items-end h-24">
            {PERCEPTION_ROW.map((p, i) => {
              const c = analysis.perception.counts[p.key] ?? 0;
              return (
                <div key={p.key} className="flex flex-col items-center justify-end gap-1 h-full" title={`${p.label}: ${c}`}>
                  <span className="text-[10px] text-slate tabular-nums">{c || ""}</span>
                  <motion.div
                    className="w-full max-w-[42px] rounded-t-md bg-cat-pink/60"
                    initial={{ height: 0 }}
                    whileInView={{ height: `${c === 0 ? 3 : Math.max(10, (c / perceptionMax) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                  />
                  <span className="text-lg leading-none" aria-label={p.label}>{p.emoji}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="text-[10px] text-slate">
        Como lemos os números: comparamos a média do período do experimento com a do período anterior de mesma duração. A "faixa provável" é um intervalo de 90% para a
        diferença, e a evidência considera o tamanho da mudança frente à sua variação normal. É uma leitura dos seus registros, não uma prova de causa e efeito.
      </p>
    </div>
  );
}
