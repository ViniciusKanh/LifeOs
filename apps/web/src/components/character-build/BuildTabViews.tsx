import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";
import { ArrowRight, History, Lightbulb, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { RPGPanel, RPGProgressBar, RPGTabs } from "@/components/rpg";
import { RPG_TONE_TEXT, rpgColor } from "@/components/rpg/rpgAssets";
import { useBuildEvolution } from "@/hooks/useBuild";
import type { BuildOverview, EvolutionPeriod, PlanAction, Scores } from "@/services/buildService";
import { ATTR_UI } from "@/utils/codexDisplay";

/** Ranking de afinidade com todos os arquétipos (leitura de padrão, nunca rótulo fixo). */
export function ArchetypeRanking({ archetype }: { archetype: NonNullable<BuildOverview["archetype"]> }) {
  return (
    <RPGPanel title="Afinidade com arquétipos" variant="gold">
      <p className="text-xs text-rpg-muted mb-3">Seu padrão atual se aproxima mais dos primeiros da lista. Isso muda conforme seus registros mudam.</p>
      <ul className="space-y-2.5">
        {archetype.ranking.map((r, i) => (
          <li key={r.id}>
            <RPGProgressBar value={r.affinity} tone={i === 0 ? "purple" : "blue"} label={r.name} valueLabel={`${r.affinity}%`} />
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}

const PERIODS: Array<{ value: EvolutionPeriod; label: string }> = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "180d", label: "6 meses" },
  { value: "365d", label: "1 ano" },
];
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

type Change = { key: string; label: string; from: number; to: number; delta: number };
function ChangeList({ title, list, icon, tone }: { title: string; list: Change[]; icon: ReactNode; tone: string }) {
  return (
    <div>
      <p className={`flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-[0.12em] ${tone}`}>
        {icon} {title}
      </p>
      {list.length === 0 ? (
        <p className="mt-1 text-xs text-rpg-muted">Nenhum.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm text-rpg-text">
          {list.map((c) => (
            <li key={c.key}>
              {c.label}: {c.from} → {c.to} ({c.delta > 0 ? "+" : ""}
              {c.delta})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Evolução dos atributos no período, com lista textual de ganhos/quedas. */
export function BuildEvolutionView({ attributes }: { attributes: BuildOverview["attributes"] }) {
  const [period, setPeriod] = useState<EvolutionPeriod>("90d");
  const reduce = useReducedMotion();
  const { data, isLoading, isError } = useBuildEvolution(period);
  const rows = (data?.points ?? []).map((p) => ({ day: fmtDay(p.day), ...p.scores }));
  return (
    <RPGPanel title="Evolução da build" icon={<History size={15} />} variant="gold" actions={<RPGTabs size="sm" label="Período" tabs={PERIODS} value={period} onChange={setPeriod} />}>
      {isLoading && <div className="h-64 rpg-bar animate-pulse" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar a evolução.</p>}
      {data && rows.length < 2 && <p className="text-sm text-rpg-muted py-6 text-center">Ainda não há histórico suficiente neste período.</p>}
      {data && rows.length >= 2 && (
        <>
          <div className="h-64" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={rpgColor("border")} strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: rpgColor("muted-text"), fontSize: 10 }} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fill: rpgColor("muted-text"), fontSize: 10 }} />
                <Tooltip contentStyle={{ background: rpgColor("panel"), border: `1px solid ${rpgColor("gold")}`, borderRadius: 3, fontSize: 12 }} labelStyle={{ color: rpgColor("gold") }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {attributes.map((a) => (
                  <Line key={a.key} type="monotone" dataKey={a.key} name={a.label} stroke={rpgColor(ATTR_UI[a.key].tone)} strokeWidth={2} dot={false} isAnimationActive={!reduce} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ChangeList title="Ganhos" list={data.gains} icon={<TrendingUp size={13} aria-hidden />} tone="text-rpg-green" />
            <ChangeList title="Quedas" list={data.drops} icon={<TrendingDown size={13} aria-hidden />} tone="text-rpg-red" />
            <ChangeList title="Estáveis" list={data.stagnant} icon={<Minus size={13} aria-hidden />} tone="text-rpg-blue" />
          </div>
          {data.archetypeChanges.length > 0 && (
            <div className="mt-4">
              <p className="font-pixel text-[10px] uppercase tracking-[0.12em] text-rpg-gold">Mudanças de arquétipo</p>
              <ul className="mt-1 text-sm text-rpg-text space-y-0.5">
                {data.archetypeChanges.map((c) => (
                  <li key={c.day}>
                    {fmtDay(c.day)}: {c.from ?? "—"} → {c.to ?? "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </RPGPanel>
  );
}

/** Recomendações por atributo abaixo da meta, com atalhos reais. */
export function BuildRecommendations({ recommendations, onApply }: { recommendations: BuildOverview["recommendations"]; onApply: () => void }) {
  const link = (a: PlanAction) =>
    a.item.kind === "open" ? (
      <Link key={a.id} to={a.item.path} className="inline-flex items-center gap-1 text-xs text-rpg-blue hover:underline">
        {a.label} <ArrowRight size={12} aria-hidden />
      </Link>
    ) : (
      <span key={a.id} className="text-xs text-rpg-text/80">
        • {a.label}
      </span>
    );
  return (
    <RPGPanel title="Recomendações" icon={<Lightbulb size={15} />} variant="gold">
      {recommendations.length === 0 ? (
        <p className="text-sm text-rpg-muted">Todos os atributos estão na meta ou acima. Nenhuma recomendação agora.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {recommendations.map((r) => {
            const ui = ATTR_UI[r.key];
            return (
              <li key={r.key} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-3" style={{ borderRadius: 3 }}>
                <p className="flex items-center gap-2 text-sm font-semibold text-rpg-text">
                  <ui.icon size={16} className={RPG_TONE_TEXT[ui.tone]} aria-hidden /> {r.label}
                  <span className="ml-auto font-pixel text-[10px] text-rpg-red">−{r.gap}</span>
                </p>
                <p className="mt-1 text-sm text-rpg-text/85">{r.text}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{r.actions.map(link)}</div>
              </li>
            );
          })}
        </ul>
      )}
      {recommendations.some((r) => r.actions.some((a) => a.item.kind !== "open")) && (
        <button type="button" className="mt-3 text-xs text-rpg-gold-light hover:underline" onClick={onApply}>
          Transformar recomendações em hábitos/tarefas (com confirmação)
        </button>
      )}
    </RPGPanel>
  );
}

/** Comparações hoje × 30d × 90d × desejada — tabela no desktop, cards no celular. */
export function BuildComparisons({ data }: { data: BuildOverview }) {
  const cols: Array<{ key: string; label: string; get: (k: keyof Scores) => number }> = [
    { key: "now", label: "Hoje", get: (k) => data.comparisons.now[k] },
    { key: "d30", label: "Há 30 dias", get: (k) => data.comparisons.d30[k] },
    { key: "d90", label: "Há 90 dias", get: (k) => data.comparisons.d90[k] },
    { key: "target", label: "Desejada", get: (k) => data.desired.targets[k] },
  ];
  const delta = (a: number, b: number) => {
    const d = a - b;
    return <span className={d > 0 ? "text-rpg-green" : d < 0 ? "text-rpg-red" : "text-rpg-muted"}>{d > 0 ? `+${d}` : d === 0 ? "=" : d}</span>;
  };
  return (
    <RPGPanel title="Comparações" variant="gold">
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-rpg-muted">
            <th className="py-1.5 font-normal">Atributo</th>
            {cols.map((c) => (
              <th key={c.key} className="py-1.5 font-normal text-right">
                {c.label}
              </th>
            ))}
            <th className="py-1.5 font-normal text-right">vs 30d</th>
            <th className="py-1.5 font-normal text-right">vs meta</th>
          </tr>
        </thead>
        <tbody>
          {data.attributes.map((a) => (
            <tr key={a.key} className="border-t border-rpg-border/40">
              <td className="py-1.5 text-rpg-text">{a.label}</td>
              {cols.map((c) => (
                <td key={c.key} className="py-1.5 text-right tabular-nums text-rpg-text">
                  {c.get(a.key)}
                </td>
              ))}
              <td className="py-1.5 text-right tabular-nums">{delta(data.comparisons.now[a.key], data.comparisons.d30[a.key])}</td>
              <td className="py-1.5 text-right tabular-nums">{delta(data.comparisons.now[a.key], data.desired.targets[a.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sm:hidden space-y-2">
        {data.attributes.map((a) => (
          <li key={a.key} className="border border-rpg-border/60 p-2.5 text-sm" style={{ borderRadius: 3 }}>
            <p className="font-semibold text-rpg-text">{a.label}</p>
            <p className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-rpg-muted">
              {cols.map((c) => (
                <span key={c.key}>
                  {c.label}: <strong className="text-rpg-text tabular-nums">{c.get(a.key)}</strong>
                </span>
              ))}
              <span>vs 30d: {delta(data.comparisons.now[a.key], data.comparisons.d30[a.key])}</span>
              <span>vs meta: {delta(data.comparisons.now[a.key], data.desired.targets[a.key])}</span>
            </p>
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}
