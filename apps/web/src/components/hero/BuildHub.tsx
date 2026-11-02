import clsx from "clsx";
import { ArrowDown, ArrowUp, Camera, Compass, Flag, Info, Minus, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import type { BuildOverview } from "@/services/buildService";
import type { BuildSnapshots } from "@/services/heroService";
import { fmtDate } from "./HeroShared";

const R = { borderRadius: 4 } as const;
// Critérios públicos (iguais para todos): forte ≥ 60 pontos, a desenvolver ≤ 30.
const STRONG = 60;
const WEAK = 30;

/** Como a pontuação é calculada — sem caixa-preta e sem 100% artificial. */
export function BuildRulesPanel({ data }: { data: BuildOverview }) {
  return (
    <KitSection title="Regras de normalização" icon={<Scale size={16} />}>
      <ul className="space-y-1.5 text-sm text-rpg-text/90">
        <li>Janela: XP real dos últimos {data.windowDays} dias, classificado por origem no motor do Códex.</li>
        <li>Pontuação = XP da janela ÷ XP de referência × 100, com teto em 100 (100 = atingiu a referência mensal).</li>
        <li>Arquétipo = maior afinidade (similaridade de cosseno) entre seus atributos e o perfil de cada arquétipo — é uma leitura do que você faz, não um teste de personalidade.</li>
        <li>Abaixo de {data.sufficiency.minWindowXp} XP na janela a build “ainda está sendo formada” (hoje: {data.sufficiency.windowXp} XP).</li>
      </ul>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="text-left text-rpg-muted">
              <th className="py-1 font-normal">Atributo</th>
              <th className="py-1 font-normal">XP na janela</th>
              <th className="py-1 font-normal">Referência</th>
              <th className="py-1 font-normal">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {data.attributes.map((a) => (
              <tr key={a.key} className="border-t border-rpg-border/50 text-rpg-text">
                <td className="py-1">{a.label}</td>
                <td className="py-1 tabular-nums">{a.xp}</td>
                <td className="py-1 tabular-nums">{a.referenceXp}</td>
                <td className="py-1 tabular-nums">{a.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KitSection>
  );
}

export function StrengthsPanel({ data }: { data: BuildOverview }) {
  const strong = data.attributes.filter((a) => a.score >= STRONG).sort((a, b) => b.score - a.score);
  const weak = data.attributes.filter((a) => a.score <= WEAK).sort((a, b) => a.score - b.score);
  return (
    <KitSection title="Pontos fortes e a desenvolver" icon={<Flag size={16} />}>
      {!data.sufficiency.enough && (
        <p className="mb-2 flex items-start gap-1.5 border border-rpg-orange/60 bg-rpg-orange/10 p-2 text-xs text-rpg-orange" style={R}>
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden /> Poucos dados na janela: trate esta leitura com cautela.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 inline-flex items-center gap-1 font-pixel text-[10px] uppercase text-rpg-green">
            <TrendingUp size={12} aria-hidden /> Fortes (≥ {STRONG})
          </p>
          {strong.length ? (
            <ul className="space-y-1 text-sm">{strong.map((a) => <li key={a.key} className="text-rpg-text">{a.label} — {a.score}</li>)}</ul>
          ) : (
            <p className="text-xs text-rpg-muted">Nenhum atributo acima de {STRONG} pontos ainda.</p>
          )}
        </div>
        <div>
          <p className="mb-1 inline-flex items-center gap-1 font-pixel text-[10px] uppercase text-rpg-orange">
            <TrendingDown size={12} aria-hidden /> A desenvolver (≤ {WEAK})
          </p>
          {weak.length ? (
            <ul className="space-y-1 text-sm">{weak.map((a) => <li key={a.key} className="text-rpg-text">{a.label} — {a.score}</li>)}</ul>
          ) : (
            <p className="text-xs text-rpg-muted">Nenhum atributo abaixo de {WEAK} pontos.</p>
          )}
        </div>
      </div>
    </KitSection>
  );
}

/** Tabela atual × meta × diferença × evolução 30d × prioridade (vira cartões no celular). */
export function BuildComparisonTable({ data }: { data: BuildOverview }) {
  const below = data.gaps.filter((g) => g.status === "below").sort((a, b) => b.gap - a.gap).map((g) => g.key);
  const rows = data.gaps.map((g) => {
    const evo = (data.comparisons.now[g.key] ?? 0) - (data.comparisons.d30[g.key] ?? 0);
    const idx = below.indexOf(g.key);
    const priority = g.status !== "below" ? (g.status === "near" ? "Na meta" : "Acima") : idx < 2 ? "Alta" : idx < 4 ? "Média" : "Baixa";
    return { ...g, evo, priority };
  });
  const tone = (p: string) => (p === "Alta" ? "red" : p === "Média" ? "orange" : p === "Baixa" ? "blue" : "green") as "red" | "orange" | "blue" | "green";
  const Evo = ({ v }: { v: number }) => (
    <span className={clsx("inline-flex items-center gap-0.5 tabular-nums", v > 0 ? "text-rpg-green" : v < 0 ? "text-rpg-red" : "text-rpg-muted")}>
      {v > 0 ? <ArrowUp size={11} aria-hidden /> : v < 0 ? <ArrowDown size={11} aria-hidden /> : <Minus size={11} aria-hidden />}
      {v > 0 ? `+${v}` : v}
    </span>
  );
  return (
    <KitSection title={`Atual × desejada (${data.desired.name})`} icon={<Compass size={16} />}>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="text-left text-xs text-rpg-muted">
            <th className="py-1 font-normal">Atributo</th>
            <th className="py-1 font-normal">Atual</th>
            <th className="py-1 font-normal">Meta</th>
            <th className="py-1 font-normal">Diferença</th>
            <th className="py-1 font-normal">30 dias</th>
            <th className="py-1 font-normal">Prioridade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-rpg-border/50 text-rpg-text">
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 tabular-nums">{r.current}</td>
              <td className="py-1.5 tabular-nums">{r.target}</td>
              <td className="py-1.5 tabular-nums">{r.gap > 0 ? `faltam ${r.gap}` : r.gap < 0 ? `+${-r.gap}` : "0"}</td>
              <td className="py-1.5"><Evo v={r.evo} /></td>
              <td className="py-1.5"><RPGBadge tone={tone(r.priority)}>{r.priority}</RPGBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-rpg-text">{r.label}</p>
              <RPGBadge tone={tone(r.priority)}>{r.priority}</RPGBadge>
            </div>
            <RPGProgressBar className="mt-1" label={r.label} showLabel={false} value={r.current} max={100} tone="purple" />
            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-rpg-muted">
              <span>Atual {r.current}</span>
              <span>Meta {r.target}</span>
              <span>30d <Evo v={r.evo} /></span>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-rpg-muted">Mesma escala 0–100 para atual e meta. A meta é definida por você em “Build Desejada”.</p>
    </KitSection>
  );
}

/** Linha do tempo dos marcos da build: fotografias semanais/manuais, nunca sobrescritas. */
export function BuildMilestones({ snaps, labels, onRecord, recording }: { snaps: BuildSnapshots | undefined; labels: Record<string, string>; onRecord: () => void; recording: boolean }) {
  const list = snaps?.snapshots ?? [];
  const changes = new Set((snaps?.changes ?? []).map((c) => c.snapshotId));
  return (
    <KitSection
      title="Marcos da build"
      icon={<Flag size={16} />}
      tone="gold"
      action={
        <RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={onRecord} disabled={recording}>
          <Camera size={13} aria-hidden /> Registrar marco
        </RPGButton>
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum marco ainda. A automação semanal registra um automaticamente (ou use “Registrar marco”).</p>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-rpg-border pl-4">
          {list.map((s) => (
            <li key={s.id} className="relative">
              <span className={clsx("absolute -left-[23px] top-1 h-3 w-3 border-2", changes.has(s.id) ? "border-rpg-gold bg-rpg-gold" : "border-rpg-border bg-rpg-bg-2")} style={{ borderRadius: 999 }} aria-hidden />
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-semibold text-rpg-text">{s.archetypeName ?? "—"}</p>
                {s.affinity != null && <span className="text-[11px] text-rpg-muted">{s.affinity}% de afinidade</span>}
                {changes.has(s.id) && <RPGBadge tone="gold">Novo arquétipo</RPGBadge>}
                <RPGBadge tone="muted">{s.origin === "manual" ? "Manual" : "Semanal"}</RPGBadge>
                <span className="ml-auto text-[11px] text-rpg-muted">{fmtDate(s.createdAt)}</span>
              </div>
              <ul className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5 sm:grid-cols-6">
                {Object.entries(s.scores).map(([k, v]) => (
                  <li key={k} className="text-[10px] text-rpg-muted">
                    {labels[k] ?? k}: <span className="text-rpg-text tabular-nums">{v}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </KitSection>
  );
}
