import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitBranch, Music, Swords } from "lucide-react";
import { useHealthTechnique } from "@/hooks/useHealth";
import { RPGBadge, RPGButton, RPGPanel } from "@/components/rpg";
import { techniqueModalityLabel } from "@/components/health/workoutCatalog";
import { dateKeyToLocalDate } from "@/utils/localDate";
import type { TechniqueReport } from "@/types";

const TOOLTIP_STYLE = { background: "rgb(var(--rpg-panel))", border: "2px solid rgb(var(--rpg-border))", borderRadius: 4, color: "rgb(var(--rpg-text))", fontSize: 12 };
const shortDate = (key: string) => dateKeyToLocalDate(key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}` : `${min} min`);

/**
 * Treino técnico (lutas e danças): diferente da musculação, evolui por tempo
 * de prática deliberada. Mostra minutos, rounds e carga interna (min × PSE)
 * por semana e por modalidade, e as habilidades da Árvore vinculadas. Tudo
 * vem de GET /api/health/technique — nada é estimado.
 */
export function TechniqueCard() {
  const { report, isLoading, isError, refetch } = useHealthTechnique();
  return (
    <RPGPanel title="Treino técnico · lutas e danças" icon={<Swords size={14} />} variant="default" actions={report && report.totals.sessions ? <RPGBadge tone="blue">{hours(report.totals.minutes)} em 8 semanas</RPGBadge> : undefined}>
      {isLoading ? (
        <div className="h-48 animate-pulse border-2 border-rpg-border bg-rpg-bg/50" style={{ borderRadius: 3 }} role="status" aria-label="Carregando treino técnico" />
      ) : isError || !report ? (
        <div className="flex items-center justify-between gap-3 py-3" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível carregar o treino técnico agora.</p>
          <RPGButton variant="secondary" onClick={() => void refetch()}>
            Tentar novamente
          </RPGButton>
        </div>
      ) : (
        <TechniqueBody report={report} />
      )}
    </RPGPanel>
  );
}

function TechniqueBody({ report }: { report: TechniqueReport }) {
  const data = report.weeks.map((w) => ({ label: shortDate(w.weekStart), minutos: w.minutes, rounds: w.rounds, sessões: w.sessions, carga: w.load }));
  const has = report.modalities.length > 0;
  return (
    <div className="space-y-3">
      <p className="text-xs text-rpg-muted">Luta e dança contam por tempo de prática, rounds e esforço percebido (PSE) — não somam no Atributo Força, que mede musculação (séries × reps × carga).</p>
      {!has ? (
        <div className="border-2 border-dashed border-rpg-border/80 px-4 py-6 text-center" style={{ borderRadius: 3 }}>
          <div className="mb-2 flex justify-center gap-2 text-rpg-gold-light" aria-hidden>
            <Swords size={20} /> <Music size={20} />
          </div>
          <p className="text-sm text-rpg-text">Registre um treino de Luta ou Dança com a modalidade para acompanhar aqui.</p>
          <p className="mt-1 text-xs text-rpg-muted">Informe a duração e, se quiser, rounds e o esforço (PSE 1–10) para calcular a carga de treino.</p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: "Treinos (8 sem.)", v: report.totals.sessions },
              { l: "Tempo de prática", v: hours(report.totals.minutes) },
              { l: "Rounds", v: report.totals.rounds || "—" },
              { l: "Semanas ativas", v: `${report.totals.activeWeeks} / 8` },
            ].map((x) => (
              <div key={x.l} className="border border-rpg-border bg-rpg-bg/60 px-2 py-1.5" style={{ borderRadius: 2 }}>
                <dt className="font-pixel text-[9px] uppercase text-rpg-muted">{x.l}</dt>
                <dd className="text-sm font-semibold tabular-nums text-rpg-text">{x.v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="h-40" role="img" aria-label="Minutos de treino técnico por semana nas últimas 8 semanas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--rpg-border) / 0.6)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} tick={{ fill: "rgb(var(--rpg-text-muted))" }} interval="preserveStartEnd" minTickGap={6} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} tick={{ fill: "rgb(var(--rpg-text-muted))" }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "rgb(var(--rpg-gold-light))" }}
                    labelFormatter={(l) => `Semana de ${String(l)}`}
                    formatter={(value, _n, item) => {
                      const p = item.payload as (typeof data)[number];
                      return [`${Number(value)} min · ${p.sessões} treino(s)${p.rounds ? ` · ${p.rounds} rounds` : ""}${p.carga ? ` · carga ${p.carga}` : ""}`, "Prática"];
                    }}
                    cursor={{ fill: "rgb(var(--rpg-gold) / 0.08)" }}
                  />
                  <Bar dataKey="minutos" fill="rgb(var(--rpg-blue))" radius={[2, 2, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5" aria-label="Por modalidade">
              {report.modalities.map((m) => {
                const skill = report.skills.find((s) => s.modality === m.modality);
                return (
                  <li key={m.modality} className="border border-rpg-border bg-rpg-bg/50 px-2 py-1.5" style={{ borderRadius: 2 }}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-rpg-text">
                      {m.category === "luta" ? <Swords size={13} className="text-rpg-red" aria-hidden /> : <Music size={13} className="text-rpg-pink" aria-hidden />}
                      {techniqueModalityLabel(m.modality) ?? m.modality}
                      <span className="ml-auto text-xs font-normal tabular-nums text-rpg-muted">{hours(m.allTimeMinutes)} no total</span>
                    </p>
                    <p className="text-[11px] text-rpg-muted">
                      8 sem.: {m.sessions} treino(s) · {hours(m.minutes)}
                      {m.rounds ? ` · ${m.rounds} rounds` : ""}
                      {m.avgRpe != null ? ` · PSE médio ${m.avgRpe}` : ""}
                      {m.lastDate ? ` · último ${shortDate(m.lastDate)}` : ""}
                    </p>
                    {skill ? (
                      <Link to={`/arvore-habilidades?habilidade=${skill.id}`} className={clsx("mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rpg-purple hover:underline")}>
                        <GitBranch size={11} aria-hidden /> {skill.name}: nível {skill.level}/{skill.maxLevel} comprovado
                      </Link>
                    ) : (
                      <Link to="/arvore-habilidades" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-rpg-muted hover:text-rpg-text hover:underline">
                        <GitBranch size={11} aria-hidden /> Criar habilidade na Árvore (tronco Saúde) e vincular esta modalidade
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
