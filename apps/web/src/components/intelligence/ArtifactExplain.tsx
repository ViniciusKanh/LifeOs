import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FlaskConical, TrendingUp } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RPGBadge, RPGProgressRing } from "@/components/rpg";
import { intelligenceService, type ArtifactDetail, type SimulationResult } from "@/services/intelligenceService";
import { pct } from "@/utils/intelligenceDisplay";

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 });
const tok = (name: string) => `rgb(var(--rpg-${name}))`;

/**
 * Pergaminho de regras: padrões legíveis dos SEUS dias (árvore substituta
 * em valores reais), com quantos dias sustentam cada regra.
 */
export function RulesScroll({ a }: { a: ArtifactDetail }) {
  const rules = a.insights.rules ?? [];
  const base = a.insights.baseRate;
  if (!rules.length) return <p className="text-xs text-rpg-muted">Reforje o artefato para gerar o pergaminho de regras.</p>;
  return (
    <ul className="space-y-2">
      {rules.map((r, i) => {
        const up = base == null ? r.rate >= 0.5 : r.rate >= base;
        return (
          <li key={i} className="rpg-parchment px-3 py-2 text-sm" style={{ borderRadius: 3 }}>
            <p className="text-rpg-ink">
              <strong>Quando</strong>{" "}
              {r.conditions.map((c, k) => (
                <span key={k}>
                  {k > 0 && " e "}
                  {c.label.toLowerCase()} {c.op === "<=" ? "≤" : ">"} {fmt(c.value)}
                </span>
              ))}
              {" → "}
              <strong className={up ? "text-rpg-green" : "text-rpg-red"}>{pct(r.rate)}</strong> dos dias foram “{a.targetLabel.toLowerCase()}”
            </p>
            <p className="text-[11px] text-rpg-ink/70">
              {r.positives} de {r.n} dias{base != null ? ` · sua média geral é ${pct(base)}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Como cada runa age: probabilidade média do artefato ao variar uma runa (dependência parcial). */
export function RuneCurves({ a }: { a: ArtifactDetail }) {
  const pdp = a.insights.pdp ?? [];
  if (!pdp.length) return <p className="text-xs text-rpg-muted">Reforje o artefato para ver as curvas das runas.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {pdp.map((d) => {
        const first = d.points[0].p;
        const last = d.points[d.points.length - 1].p;
        return (
          <figure key={d.key} className="border border-rpg-border/60 bg-rpg-bg-2/50 p-2" style={{ borderRadius: 3 }}>
            <figcaption className="text-[11px] text-rpg-text truncate" title={d.label}>
              {d.label}
            </figcaption>
            <div className="h-24" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.points.map((p) => ({ x: p.x, p: Math.round(p.p * 100) }))} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                  <XAxis dataKey="x" tick={{ fontSize: 9, fill: tok("muted") }} tickFormatter={(v: number) => fmt(v)} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: tok("muted") }} width={40} unit="%" />
                  <Tooltip formatter={(v: number) => [`${v}%`, "chance"]} labelFormatter={(v: number) => `${d.label}: ${fmt(v)}`} contentStyle={{ background: tok("panel"), border: `1px solid ${tok("border")}`, fontSize: 11 }} />
                  <Line type="monotone" dataKey="p" stroke={tok("purple")} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className={clsx("text-[10px]", last > first ? "text-rpg-green" : last < first ? "text-rpg-red" : "text-rpg-muted")}>
              {last > first ? "↑ mais dessa runa, mais chance" : last < first ? "↓ mais dessa runa, menos chance" : "efeito quase neutro"} ({pct(first)} → {pct(last)})
            </p>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * Alquimia de runas: ajuste as runas principais e veja a chance que o
 * artefato atribuiria. Parte dos valores reais da véspera. Nada é gravado.
 */
export function RuneAlchemy({ a }: { a: ArtifactDetail }) {
  const [base, setBase] = useState<SimulationResult | null>(null);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();
  const statsByKey = useMemo(() => new Map((a.insights.stats ?? []).map((s) => [s.key, s])), [a.insights.stats]);
  const runes = a.importance.filter((r) => r.importance > 0 && r.key !== "weekend" && statsByKey.get(r.key)?.min != null).slice(0, 6);

  useEffect(() => {
    intelligenceService
      .simulate(a.id)
      .then((r) => {
        setBase(r);
        setResult(r);
        setValues(r.values);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Não foi possível abrir a alquimia."));
  }, [a.id]);

  const change = (key: string, v: number) => {
    const next = { ...values, [key]: v };
    setValues(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      intelligenceService
        .simulate(a.id, next)
        .then(setResult)
        .catch(() => setError("A simulação falhou; tente de novo."));
    }, 300);
  };

  if (error) return <p className="text-sm text-rpg-red">{error}</p>;
  if (!base || !result) return <div className="h-40 rpg-bar animate-pulse motion-reduce:animate-none" aria-label="Preparando a alquimia" />;
  if (!a.insights.stats) return <p className="text-sm text-rpg-muted">Reforje o artefato para liberar a alquimia das runas.</p>;

  const delta = Math.round((result.probability - base.probability) * 100);
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-xs text-rpg-muted">
        <FlaskConical size={14} className="shrink-0 text-rpg-purple mt-0.5" aria-hidden />
        Mexa nas runas e veja como o artefato reagiria. Os valores iniciais são os registros reais da véspera. É uma simulação do modelo (associação, não causa) — nada é salvo.
      </p>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div className="flex flex-col items-center text-center">
          <RPGProgressRing value={result.probability * 100} size={112} tone={result.probability >= 0.5 ? "green" : "orange"} label={`Chance de ${result.targetLabel.toLowerCase()}`} valueClassName="text-2xl text-rpg-text" />
          <p className="mt-1 text-xs text-rpg-muted">{result.targetLabel}</p>
          <RPGBadge tone={delta > 0 ? "green" : delta < 0 ? "red" : "muted"} className="mt-1">
            {delta > 0 ? "+" : ""}
            {delta} p.p. vs. hoje
          </RPGBadge>
        </div>
        <ul className="space-y-3">
          {runes.map((r) => {
            const st = statsByKey.get(r.key)!;
            const min = st.min ?? 0;
            const max = st.max ?? 1;
            const step = max - min <= 10 ? 0.1 : max - min <= 100 ? 1 : 5;
            const v = values[r.key] ?? st.mean ?? min;
            return (
              <li key={r.key}>
                <label className="block text-xs">
                  <span className="flex justify-between gap-2 text-rpg-text">
                    <span className="truncate">{r.label}</span>
                    <span className="font-pixel tabular-nums text-rpg-gold-light">
                      {fmt(v)}
                      {values[r.key] == null && <span className="text-rpg-muted"> (média)</span>}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={v}
                    onChange={(e) => change(r.key, Number(e.target.value))}
                    className="mt-1 w-full accent-[rgb(var(--rpg-purple))]"
                  />
                  <span className="flex justify-between text-[10px] text-rpg-muted">
                    <span>{fmt(min)}</span>
                    <span>{fmt(max)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {result.effects.length > 0 && (
        <p className="text-[11px] text-rpg-muted">
          <TrendingUp size={12} className="inline mr-1" aria-hidden />
          Maiores efeitos agora: {result.effects.slice(0, 3).map((e) => `${e.label} ${e.effect > 0 ? "+" : ""}${e.effect} p.p.`).join(" · ")}
        </p>
      )}
    </div>
  );
}
