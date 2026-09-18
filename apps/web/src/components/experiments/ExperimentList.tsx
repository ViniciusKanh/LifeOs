import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import clsx from "clsx";
import { Card, EmptyState } from "@/components/ui/primitives";
import { CATEGORY_LABEL, STATUS_LABEL_PT } from "./experimentDisplay";
import type { ExperimentListItem, ExperimentStatus } from "@/types";

const TABS: Array<{ value: ExperimentStatus | "todos"; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "active", label: "Em andamento" },
  { value: "completed", label: "Concluídos" },
  { value: "paused", label: "Pausados" },
  { value: "cancelled", label: "Cancelados" },
];

const STATUS_TONE: Record<ExperimentStatus, string> = {
  draft: "bg-slate/10 text-slate",
  active: "bg-cat-purple/10 text-cat-purple",
  paused: "bg-signal/15 text-signal-deep",
  completed: "bg-cat-green/10 text-cat-green",
  cancelled: "bg-drop/10 text-drop",
};

function formatPeriod(start: string, end: string): string {
  const fmt = (d: string) => `${d.slice(8, 10)} ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(d.slice(5, 7)) - 1]}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Listagem de Experimentos (seções 18/19) — tabela no desktop, cards no mobile, nunca a mesma tabela larga espremida. */
export function ExperimentList({ experiments }: { experiments: ExperimentListItem[] }) {
  const [tab, setTab] = useState<ExperimentStatus | "todos">("todos");
  const [search, setSearch] = useState("");

  const countByTab = useMemo(() => {
    const counts: Record<string, number> = { todos: experiments.length };
    for (const e of experiments) counts[e.status] = (counts[e.status] ?? 0) + 1;
    return counts;
  }, [experiments]);

  const filtered = useMemo(() => {
    let list = tab === "todos" ? experiments : experiments.filter((e) => e.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q) || (e.hypothesis ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [experiments, tab, search]);

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                tab === t.value ? "bg-cat-purple/10 text-cat-purple" : "text-slate hover:bg-paper dark:hover:bg-ink-overlay"
              )}
            >
              {t.label} ({countByTab[t.value] ?? 0})
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar experimento..."
            aria-label="Buscar experimento"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum experimento encontrado" description="Ajuste os filtros ou a busca para ver outros experimentos." ctaLabel="Limpar filtros" onCta={() => { setTab("todos"); setSearch(""); }} />
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate border-b border-paper-border dark:border-ink-border">
                  <th className="pb-2 font-medium">Experimento</th>
                  <th className="pb-2 font-medium">Categoria</th>
                  <th className="pb-2 font-medium">Período</th>
                  <th className="pb-2 font-medium">Progresso</th>
                  <th className="pb-2 font-medium">Resultado</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-paper-border/60 dark:border-ink-border/60 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{e.title}</p>
                      {e.description && <p className="text-[11px] text-slate mt-0.5 line-clamp-1">{e.description}</p>}
                    </td>
                    <td className="py-3 pr-3 text-xs">{CATEGORY_LABEL[e.category]}</td>
                    <td className="py-3 pr-3 text-xs">
                      {formatPeriod(e.start_date, e.end_date)}
                      <p className="text-[11px] text-slate">{e.durationDays} dias</p>
                    </td>
                    <td className="py-3 pr-3 w-32">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                          <div className="h-full rounded-full bg-cat-purple" style={{ width: `${e.progressPct}%` }} />
                        </div>
                        <span className="text-[11px] text-slate w-9 text-right">{e.progressPct}%</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs">{e.resultLabel ?? STATUS_LABEL_PT[e.status]}</td>
                    <td className="py-3 pr-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[e.status]}`}>{STATUS_LABEL_PT[e.status]}</span>
                    </td>
                    <td className="py-3 text-right">
                      <Link to={`/experimentos/${e.id}`} className="text-xs font-semibold text-cat-purple hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((e) => (
              <Link key={e.id} to={`/experimentos/${e.id}`} className="block rounded-xl border border-paper-border dark:border-ink-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{e.title}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_TONE[e.status]}`}>{STATUS_LABEL_PT[e.status]}</span>
                </div>
                <p className="text-[11px] text-slate mt-1">{CATEGORY_LABEL[e.category]} · {formatPeriod(e.start_date, e.end_date)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1.5 flex-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                    <div className="h-full rounded-full bg-cat-purple" style={{ width: `${e.progressPct}%` }} />
                  </div>
                  <span className="text-[11px] text-slate">{e.progressPct}%</span>
                </div>
                {e.resultLabel && <p className="text-[11px] text-cat-green mt-1.5">{e.resultLabel}</p>}
              </Link>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
