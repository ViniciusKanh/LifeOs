import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Dumbbell, Flag, Repeat, Swords, Target } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { fmtDay } from "@/components/taverna/tavernFormat";
import type { CouncilAdherence, CouncilFocusOption, CouncilFocusRef, CouncilFocusType } from "@/services/warCouncilService";
import type { WeeklyComputedMetrics } from "@/types";

export const MAX_FOCUS = 3;

const FOCUS_GROUPS: Array<{ type: CouncilFocusType; label: string; rpgHint: string; icon: typeof Flag }> = [
  { type: "campaign", label: "Campanhas", rpgHint: "Forja de Campanhas", icon: Swords },
  { type: "project", label: "Projetos", rpgHint: "Reinos em construção", icon: Flag },
  { type: "goal", label: "Metas", rpgHint: "Objetivos da jornada", icon: Target },
];

/** Passo 1 — o mesmo resumo da Revisão Semanal (mesmo endpoint) + aderência do plano anterior. */
export function CouncilReportStep({
  previousWeekStart,
  summary,
  summaryLoading,
  summaryError,
  previousAdherence,
  previousPlanSealed,
}: {
  previousWeekStart: string;
  summary: WeeklyComputedMetrics | undefined;
  summaryLoading: boolean;
  summaryError: boolean;
  previousAdherence: CouncilAdherence;
  previousPlanSealed: boolean;
}) {
  const stats = summary
    ? [
        { icon: CheckCircle2, label: "Missões concluídas", value: String(summary.tasksCompleted), tone: "blue" as const },
        { icon: Repeat, label: "Hábitos cumpridos", value: `${Math.round(summary.habitsCompletionPct)}%`, tone: "green" as const },
        { icon: BookOpen, label: "Páginas lidas", value: String(summary.pagesRead), tone: "pink" as const },
        { icon: Dumbbell, label: "Treinos", value: String(summary.workouts), tone: "orange" as const },
      ]
    : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <RPGPanel title={`Semana de ${fmtDay(previousWeekStart)}`} icon={<Swords size={14} aria-hidden />}>
        {summaryLoading ? (
          <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="Carregando o resumo da semana passada">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 rpg-bar animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        ) : summaryError || !summary ? (
          <p className="text-sm text-rpg-red" role="alert">
            Não foi possível carregar o resumo da semana passada.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {stats.map((s) => (
                <li key={s.label} className="rpg-panel px-3 py-2.5 min-w-0">
                  <s.icon size={14} className="text-rpg-gold" aria-hidden />
                  <p className="font-pixel text-lg text-rpg-text mt-1">{s.value}</p>
                  <p className="text-[11px] text-rpg-muted leading-tight">{s.label}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-rpg-muted">
              Life Score no fim da semana: <span className="font-pixel text-rpg-text">{summary.lifeScore.overall}</span>.{" "}
              <Link to="/weekly-review" className="underline text-rpg-gold-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
                Ver a revisão completa
              </Link>
            </p>
          </>
        )}
      </RPGPanel>
      <RPGPanel title="Plano anterior" icon={<Flag size={14} aria-hidden />}>
        {previousAdherence.planned === 0 ? (
          <p className="text-sm text-rpg-muted">
            {previousPlanSealed ? "O plano da semana passada foi selado sem missões com dia." : "Nenhum plano selado na semana passada — este é um bom começo."}
          </p>
        ) : (
          <>
            <p className="text-sm text-rpg-text">
              {previousAdherence.completed} de {previousAdherence.planned} missões planejadas foram concluídas.
            </p>
            <RPGProgressBar className="mt-2" tone="green" label="Aderência ao plano anterior" value={previousAdherence.completed} max={previousAdherence.planned} />
            <p className="mt-2 text-[11px] text-rpg-muted">Use isso para calibrar: planeje o que cabe de verdade.</p>
          </>
        )}
      </RPGPanel>
    </div>
  );
}

/** Passo 2 — até 3 focos (campanhas, projetos, metas) + intenção da semana. */
export function CouncilFocusStep({
  options,
  focus,
  onToggle,
  notes,
  onNotes,
}: {
  options: CouncilFocusOption[];
  focus: CouncilFocusRef[];
  onToggle: (ref: CouncilFocusRef) => void;
  notes: string;
  onNotes: (v: string) => void;
}) {
  const isOn = (o: CouncilFocusRef) => focus.some((f) => f.type === o.type && f.id === o.id);
  const full = focus.length >= MAX_FOCUS;
  return (
    <div className="space-y-4">
      <p className="text-xs text-rpg-muted" aria-live="polite">
        {focus.length}/{MAX_FOCUS} focos escolhidos. As missões abertas deles entram como candidatas — junto com as atrasadas e as que vencem na semana.
      </p>
      {options.length === 0 ? (
        <RPGPanel>
          <p className="text-sm text-rpg-muted">
            Você ainda não tem campanhas, projetos ou metas ativos. Tudo bem: o plano ainda considera as missões atrasadas e as que vencem nesta semana.
          </p>
        </RPGPanel>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
          {FOCUS_GROUPS.map((g) => {
            const list = options.filter((o) => o.type === g.type);
            return (
              <RPGPanel key={g.type} title={g.label} icon={<g.icon size={14} aria-hidden />}>
                <p className="-mt-1 mb-2 text-[11px] text-rpg-muted">{g.rpgHint}</p>
                {list.length === 0 ? (
                  <p className="text-xs text-rpg-muted">Nenhum item ativo.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((o) => {
                      const on = isOn(o);
                      const disabled = !on && full;
                      return (
                        <li key={o.id}>
                          <label
                            className={clsx(
                              "flex min-h-[44px] cursor-pointer items-center gap-2 border-2 px-2.5 py-2 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-rpg-gold",
                              on ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-text hover:border-rpg-gold/60",
                              disabled && "cursor-not-allowed opacity-50",
                            )}
                            style={{ borderRadius: 3 }}
                          >
                            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--rpg-gold))]" checked={on} disabled={disabled} onChange={() => onToggle(o)} />
                            <span className="min-w-0 flex-1 truncate">{o.title}</span>
                            <span className="shrink-0 text-[11px] text-rpg-muted">
                              {o.openTasks} {o.openTasks === 1 ? "missão" : "missões"}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </RPGPanel>
            );
          })}
        </div>
      )}
      <RPGPanel title="Intenção da semana (opcional)">
        <label htmlFor="conselho-notas" className="sr-only">
          Intenção da semana
        </label>
        <textarea
          id="conselho-notas"
          value={notes}
          maxLength={2000}
          rows={3}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Ex.: terminar o capítulo 2 da dissertação e manter 3 treinos."
          className="w-full resize-y border-2 border-rpg-border bg-rpg-bg px-3 py-2 text-sm text-rpg-text placeholder:text-rpg-muted focus:border-rpg-gold focus:outline-none"
          style={{ borderRadius: 3 }}
        />
      </RPGPanel>
    </div>
  );
}

export function ReasonBadges({ reasons }: { reasons: string[] }) {
  const map: Record<string, { label: string; tone: "gold" | "red" | "orange" | "blue" }> = {
    focus: { label: "Foco", tone: "gold" },
    overdue: { label: "Atrasada", tone: "red" },
    due_this_week: { label: "Prazo na semana", tone: "orange" },
    planned: { label: "Já planejada", tone: "blue" },
  };
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) =>
        map[r] ? (
          <RPGBadge key={r} tone={map[r].tone}>
            {map[r].label}
          </RPGBadge>
        ) : null,
      )}
    </span>
  );
}
