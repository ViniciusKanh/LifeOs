import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ListChecks, Target, Repeat, BookOpen, GraduationCap, GanttChartSquare, X } from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { GlobalSearchResult } from "@/services/searchService";

const TYPE_META: Record<GlobalSearchResult["type"], { icon: typeof Search; tone: string }> = {
  task: { icon: ListChecks, tone: "bg-signal/15 text-signal-deep dark:text-signal" },
  goal: { icon: Target, tone: "bg-cat-purple/10 text-cat-purple dark:bg-cat-purple/15 dark:text-cat-purple-dark" },
  habit: { icon: Repeat, tone: "bg-cat-green/10 text-cat-green dark:bg-cat-green/15 dark:text-cat-green-dark" },
  book: { icon: BookOpen, tone: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark" },
  academic_project: { icon: GraduationCap, tone: "bg-cat-teal/10 text-cat-teal dark:bg-cat-teal/15 dark:text-cat-teal-dark" },
  project: { icon: GanttChartSquare, tone: "bg-cat-blue/10 text-cat-blue dark:bg-cat-blue/15 dark:text-cat-blue-dark" },
};

function ResultsList({ results, isSearching, query, onSelect }: {
  results: GlobalSearchResult[];
  isSearching: boolean;
  query: string;
  onSelect: (link: string) => void;
}) {
  if (query.trim().length < 2) {
    return <p className="text-xs text-slate px-3 py-4 text-center">Digite ao menos 2 letras para buscar.</p>;
  }
  if (isSearching && results.length === 0) {
    return <p className="text-xs text-slate px-3 py-4 text-center">Buscando…</p>;
  }
  if (results.length === 0) {
    return <p className="text-xs text-slate px-3 py-4 text-center">Nada encontrado para "{query}".</p>;
  }
  return (
    <ul className="max-h-[60vh] md:max-h-80 overflow-y-auto py-1">
      {results.map((r) => {
        const meta = TYPE_META[r.type];
        const Icon = meta.icon;
        return (
          <li key={`${r.type}-${r.id}`}>
            <button
              onClick={() => onSelect(r.link)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
            >
              <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg ${meta.tone}`}>
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{r.title}</span>
                {r.subtitle && <span className="block text-[11px] text-slate truncate">{r.subtitle}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Busca do desktop: input inline no header + dropdown de resultados. */
export function DesktopGlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { results, isSearching } = useGlobalSearch(query);

  const handleSelect = (link: string) => {
    navigate(link);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="hidden md:flex flex-1 max-w-md relative">
      <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar algo no LifeOS..."
        className="w-full rounded-full pl-10 pr-3 py-2 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500 focus:shadow-glow-brand transition-all"
      />
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card dark:shadow-card-dark overflow-hidden z-30">
          <ResultsList results={results} isSearching={isSearching} query={query} onSelect={handleSelect} />
        </div>
      )}
    </div>
  );
}

/** Busca do mobile: ícone no header que abre uma sobreposição de tela cheia com input + resultados. */
export function MobileGlobalSearch() {
  const navigate = useNavigate();
  const [openSheet, setOpenSheet] = useState(false);
  const [query, setQuery] = useState("");
  const { results, isSearching } = useGlobalSearch(query);

  const handleSelect = (link: string) => {
    navigate(link);
    setOpenSheet(false);
    setQuery("");
  };

  return (
    <>
      <button
        onClick={() => setOpenSheet(true)}
        aria-label="Buscar"
        className="md:hidden w-9 h-9 rounded-full flex items-center justify-center border border-paper-border dark:border-ink-border"
      >
        <Search size={16} />
      </button>

      {openSheet && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col bg-paper dark:bg-ink">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-paper-border dark:border-ink-border">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- overlay acabou de abrir, foco é o esperado */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar algo no LifeOS..."
                className="w-full rounded-full pl-9 pr-3 py-2.5 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
            </div>
            <button onClick={() => setOpenSheet(false)} className="text-slate shrink-0" aria-label="Fechar busca">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ResultsList results={results} isSearching={isSearching} query={query} onSelect={handleSelect} />
          </div>
        </div>
      )}
    </>
  );
}
