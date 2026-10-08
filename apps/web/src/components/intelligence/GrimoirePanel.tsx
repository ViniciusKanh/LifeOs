import clsx from "clsx";
import { BookMarked, BookOpen, CheckSquare, Dumbbell, Droplets, Flame, GraduationCap, Moon, NotebookPen, RefreshCw, Repeat, Smile, Trophy, type LucideIcon } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import type { Grimoire, IntelligenceOverview } from "@/services/intelligenceService";
import { num, pct } from "@/utils/intelligenceDisplay";

const SRC_ICON: Record<string, LucideIcon> = {
  tarefas: CheckSquare,
  habitos: Repeat,
  sono: Moon,
  humor: Smile,
  agua: Droplets,
  exercicios: Dumbbell,
  foco: Flame,
  educacao: GraduationCap,
  leitura: BookOpen,
  journal: NotebookPen,
  metas: Trophy,
};

function Kpis({ g }: { g: Grimoire }) {
  return (
    <dl className="grid grid-cols-3 border border-rpg-border/70 bg-rpg-bg-2/60 text-center" style={{ borderRadius: 3 }}>
      {[
        [num(g.records), "registros"],
        [String(g.features), "runas (features)"],
        [num(g.daysObserved), "dias observados"],
      ].map(([v, l], i) => (
        <div key={l} className={clsx("flex flex-col-reverse px-1 py-2", i > 0 && "border-l border-rpg-border/60")}>
          <dt className="text-[10px] text-rpg-muted leading-tight">{l}</dt>
          <dd className="font-rpg text-xl font-bold text-rpg-text tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sources({ g, limit }: { g: Grimoire; limit?: number }) {
  const list = [...g.sources].sort((a, b) => b.records - a.records).slice(0, limit ?? g.sources.length);
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
      {list.map((s) => {
        const Icon = SRC_ICON[s.key] ?? BookMarked;
        return (
          <li key={s.key} className="flex items-center gap-1.5 min-w-0">
            <Icon size={13} className="shrink-0 text-rpg-blue" aria-hidden />
            <span className="truncate text-rpg-text/90">{s.label}</span>
            <span className="ml-auto shrink-0 tabular-nums text-rpg-muted">
              {s.pct.toString().replace(".", ",")}% ({num(s.records)})
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Quality({ g }: { g: Grimoire }) {
  return <RPGProgressBar tone="purple" label="Qualidade do Grimório" value={g.qualityScore ?? 0} valueLabel={g.qualityScore === null ? "—" : `${g.qualityScore}%`} />;
}

/** "Grimório" = dataset. Resumo calculado sob demanda (atualizar) ou na última forja. */
export function GrimoirePanel({ grimoire, onRefresh, refreshing }: { grimoire: IntelligenceOverview["grimoire"]; onRefresh: () => void; refreshing: boolean }) {
  return (
    <RPGPanel
      title="Grimório de Dados"
      icon={<BookMarked size={15} />}
      className="h-full"
      actions={
        <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1 text-xs text-rpg-gold-light hover:underline disabled:opacity-60" aria-label="Atualizar grimório">
          <RefreshCw size={12} className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Atualizar
        </button>
      }
    >
      {!grimoire ? (
        <div className="py-3 space-y-3">
          <p className="text-sm text-rpg-muted">O grimório reúne seus registros de Tarefas, Hábitos, Saúde, Foco, Educação, Leitura, Journal e Metas. Atualize para ver o que já pode ser aprendido.</p>
          <RPGButton variant="secondary" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Lendo registros…" : "Abrir o grimório"}
          </RPGButton>
        </div>
      ) : (
        <div className="space-y-3">
          <Kpis g={grimoire} />
          <Sources g={grimoire} limit={8} />
          <Quality g={grimoire} />
        </div>
      )}
    </RPGPanel>
  );
}

/** Aba Grimório: dataset completo, cobertura por runa e prontidão de cada objetivo. */
export function GrimoireFull({ grimoire, objectives, onRefresh, refreshing }: { grimoire: IntelligenceOverview["grimoire"]; objectives: IntelligenceOverview["objectives"]; onRefresh: () => void; refreshing: boolean }) {
  if (!grimoire) return <GrimoirePanel grimoire={null} onRefresh={onRefresh} refreshing={refreshing} />;
  const name = (k: string) => objectives.find((o) => o.key === k)?.name ?? k;
  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <RPGPanel title="Grimório de Dados" icon={<BookMarked size={15} />} actions={<RPGButton variant="secondary" className="!py-1 text-xs" onClick={onRefresh} disabled={refreshing}><RefreshCw size={12} className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden /> Atualizar</RPGButton>}>
        <div className="space-y-3">
          <Kpis g={grimoire} />
          <Sources g={grimoire} />
          <Quality g={grimoire} />
          <p className="text-[11px] text-rpg-muted">
            Período: {grimoire.rangeFrom?.split("-").reverse().join("/") ?? "—"} a {grimoire.rangeTo.split("-").reverse().join("/")} · células vazias {pct(grimoire.missingRate)} · outliers {pct(grimoire.outlierRate, 1)} · atualizado em{" "}
            {new Date(grimoire.updatedAt.includes("T") ? grimoire.updatedAt : `${grimoire.updatedAt.replace(" ", "T")}Z`).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
      </RPGPanel>
      <div className="space-y-4">
        <RPGPanel title="Prontidão para forjar">
          <ul className="space-y-2">
            {grimoire.readiness.map((r) => (
              <li key={r.objective} className="border border-rpg-border/60 bg-rpg-bg-2/50 p-2.5 text-xs" style={{ borderRadius: 3 }}>
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-rpg-text text-sm">{name(r.objective)}</span>
                  <RPGBadge tone={r.ready ? "green" : "orange"}>{r.ready ? "Pronto" : "Aguardando dados"}</RPGBadge>
                </p>
                <p className="mt-1 text-rpg-muted">
                  {r.samples} dias · {r.positives} positivos × {r.negatives} negativos · alvo: {r.thresholdText}
                </p>
                {r.reason && <p className="mt-0.5 text-rpg-orange">{r.reason}</p>}
              </li>
            ))}
          </ul>
        </RPGPanel>
        <RPGPanel title="Cobertura das runas">
          <ul className="space-y-1.5">
            {grimoire.featureCoverage.map((f) => (
              <li key={f.key}>
                <RPGProgressBar tone={f.coverage >= 60 ? "blue" : "orange"} label={f.label} value={f.coverage} />
              </li>
            ))}
          </ul>
        </RPGPanel>
      </div>
    </div>
  );
}
