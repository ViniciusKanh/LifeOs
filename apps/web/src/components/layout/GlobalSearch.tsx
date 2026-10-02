import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Compass,
  CornerDownLeft,
  FolderLock,
  GanttChartSquare,
  GraduationCap,
  Inbox,
  ListChecks,
  NotebookPen,
  NotebookText,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useAuth } from "@/hooks/useAuth";
import { inboxService } from "@/services/inboxService";
import { api } from "@/services/api";
import { allDestinations } from "./navConfig";
import type { GlobalSearchResult } from "@/services/searchService";

const TYPE_META: Record<GlobalSearchResult["type"], { icon: typeof Search; tone: string }> = {
  task: { icon: ListChecks, tone: "bg-signal/15 text-signal-deep dark:text-signal" },
  goal: { icon: Target, tone: "bg-cat-purple/10 text-cat-purple dark:bg-cat-purple/15 dark:text-cat-purple-dark" },
  habit: { icon: Repeat, tone: "bg-cat-green/10 text-cat-green dark:bg-cat-green/15 dark:text-cat-green-dark" },
  book: { icon: BookOpen, tone: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark" },
  academic_project: { icon: GraduationCap, tone: "bg-cat-teal/10 text-cat-teal dark:bg-cat-teal/15 dark:text-cat-teal-dark" },
  project: { icon: GanttChartSquare, tone: "bg-cat-blue/10 text-cat-blue dark:bg-cat-blue/15 dark:text-cat-blue-dark" },
  journal_entry: { icon: NotebookPen, tone: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark" },
  note: { icon: NotebookText, tone: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark" },
  life_admin: { icon: FolderLock, tone: "bg-cat-blue/10 text-cat-blue dark:bg-cat-blue/15 dark:text-cat-blue-dark" },
};

interface PaletteItem {
  id: string;
  section: "Ações" | "Ir para" | "Resultados";
  label: string;
  sub?: string | null;
  icon: typeof Search;
  tone: string;
  semantic?: boolean;
  run: () => void | Promise<void>;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca global + paleta de comandos (Ctrl K): além de achar tarefas, metas,
 * notas etc., executa ações ("nova tarefa", "capturar …", "ir para …").
 * Setas navegam, Enter executa. Ações que criam algo levam o texto digitado.
 */
function usePaletteItems(query: string, close: () => void) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { results, isSearching } = useGlobalSearch(query);
  const [toast, setToast] = useState<string | null>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const nq = norm(q);
    const go = (to: string) => () => {
      navigate(to);
      close();
    };
    const actions: PaletteItem[] = [];
    if (q.length >= 2) {
      actions.push(
        {
          id: "capture",
          section: "Ações",
          label: `Capturar “${q}” no Inbox`,
          icon: Inbox,
          tone: "bg-brand-500/10 text-brand-600",
          run: async () => {
            const r = await inboxService.capture(q);
            setToast(r ? "Capturado no Inbox." : "Sem conexão: guardado no aparelho.");
            close();
          },
        },
        {
          id: "task",
          section: "Ações",
          label: `Criar tarefa “${q}”`,
          icon: Plus,
          tone: "bg-signal/15 text-signal-deep dark:text-signal",
          run: async () => {
            const r = await api.postOrQueue<{ id: string }>("/tasks", { title: q.slice(0, 200), status: "A Fazer" }, q.slice(0, 80));
            if (r) navigate(`/tarefas?task=${r.id}`);
            else setToast("Sem conexão: tarefa guardada no aparelho.");
            close();
          },
        },
        {
          id: "note",
          section: "Ações",
          label: `Criar nota “${q}”`,
          icon: NotebookText,
          tone: "bg-cat-pink/10 text-cat-pink",
          run: async () => {
            const r = await api.postOrQueue<{ id: string }>("/notes", { title: q.slice(0, 200) }, q.slice(0, 80));
            if (r) navigate(`/notas?nota=${r.id}`);
            else setToast("Sem conexão: nota guardada no aparelho.");
            close();
          },
        }
      );
    }
    const fixed: PaletteItem[] = [
      { id: "new-task", section: "Ações", label: "Nova tarefa", sub: "Abre o formulário completo", icon: Plus, tone: "bg-signal/15 text-signal-deep dark:text-signal", run: go("/tarefas?nova=1") },
      { id: "new-note", section: "Ações", label: "Nova nota", icon: NotebookText, tone: "bg-cat-pink/10 text-cat-pink", run: go("/notas?nova=1") },
      { id: "new-admin", section: "Ações", label: "Novo vencimento, manutenção ou documento", icon: FolderLock, tone: "bg-cat-blue/10 text-cat-blue", run: go("/administracao?novo=1") },
      { id: "capture-page", section: "Ações", label: "Captura rápida (ditar ou colar)", icon: Zap, tone: "bg-brand-500/10 text-brand-600", run: go("/compartilhar") },
      { id: "review", section: "Ações", label: "Fazer a revisão do mês", icon: CalendarCheck, tone: "bg-cat-purple/10 text-cat-purple", run: go("/revisoes") },
      { id: "wheel", section: "Ações", label: "Avaliar a roda da vida", icon: Compass, tone: "bg-cat-purple/10 text-cat-purple", run: go("/direcao") },
      { id: "import", section: "Ações", label: "Importar tarefas (Todoist, Notion, Google Tasks)", icon: Upload, tone: "bg-cat-blue/10 text-cat-blue", run: go("/tarefas?importar=1") },
    ].filter((a) => !nq || norm(a.label).includes(nq)) as PaletteItem[];

    const dests: PaletteItem[] = allDestinations(isAdmin)
      .filter((d) => !nq || norm(d.label).includes(nq) || norm(d.group).includes(nq))
      .slice(0, nq ? 6 : 0)
      .map((d) => ({ id: `go-${d.to}`, section: "Ir para", label: d.label, sub: d.group, icon: ArrowRight, tone: "bg-black/[0.04] dark:bg-white/[0.06] text-slate", run: go(d.to) }));

    const found: PaletteItem[] = (q.length >= 2 ? results : []).map((r) => {
      const meta = TYPE_META[r.type] ?? TYPE_META.task;
      return { id: `${r.type}-${r.id}`, section: "Resultados", label: r.title, sub: r.subtitle, icon: meta.icon, tone: meta.tone, semantic: r.matchType === "semantic", run: go(r.link) };
    });

    // Sem texto: atalhos mais úteis. Com texto: resultados primeiro, depois ações e navegação.
    return q.length >= 2 ? [...found, ...dests, ...actions, ...fixed] : fixed;
  }, [query, results, isAdmin, navigate, close]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return { items, isSearching, toast };
}

function PaletteList({ items, active, setActive, isSearching, query }: { items: PaletteItem[]; active: number; setActive: (i: number) => void; isSearching: boolean; query: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  let lastSection = "";
  return (
    <div>
      {query.trim().length >= 2 && isSearching && !items.some((i) => i.section === "Resultados") && <p className="text-[11px] text-slate px-3 pt-2">Buscando…</p>}
      <ul ref={listRef} role="listbox" className="max-h-[70dvh] md:max-h-96 overflow-y-auto overscroll-contain py-1">
        {items.map((it, idx) => {
          const Icon = it.icon;
          const header = it.section !== lastSection;
          lastSection = it.section;
          return (
            <li key={it.id} role="option" aria-selected={idx === active}>
              {header && <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate/80">{it.section}</p>}
              <button
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => it.run()}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${idx === active ? "bg-brand-500/[0.08]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"}`}
              >
                <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg ${it.tone}`}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm truncate">{it.label}</span>
                    {it.semantic && (
                      <span title="Encontrado por significado (busca semântica)" className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100">
                        <Sparkles size={9} /> por significado
                      </span>
                    )}
                  </span>
                  {it.sub && <span className="block text-[11px] text-slate truncate">{it.sub}</span>}
                </span>
                {idx === active && <CornerDownLeft size={13} className="text-slate shrink-0 hidden md:block" />}
              </button>
            </li>
          );
        })}
      </ul>
      {query.trim().length >= 2 && !items.some((i) => i.section === "Resultados") && !isSearching && (
        <p className="text-[11px] text-slate px-3 pb-2">Nada encontrado nos seus dados para “{query}” — use uma das ações acima.</p>
      )}
    </div>
  );
}

function usePaletteKeyboard(count: number, onRun: (i: number) => void) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [count]);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(count - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && count > 0) {
      e.preventDefault();
      onRun(active);
    }
  };
  return { active, setActive, onKeyDown };
}

function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="status" className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] rounded-xl bg-[#1E2537] text-white text-xs px-4 py-2.5 shadow-lg">
      {text}
    </div>
  );
}

/** Busca do desktop: input inline no header + dropdown com resultados e comandos. */
export function DesktopGlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useMemo(
    () => () => {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    },
    []
  );
  const { items, isSearching, toast } = usePaletteItems(query, close);
  const kb = usePaletteKeyboard(items.length, (i) => items[i]?.run());

  // Atalho Ctrl/⌘ + K abre a paleta de qualquer tela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="hidden md:flex flex-1 max-w-md relative">
      <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") return inputRef.current?.blur();
          kb.onKeyDown(e);
        }}
        placeholder="Buscar ou digitar um comando…"
        aria-label="Busca global e comandos"
        aria-expanded={open}
        role="combobox"
        className="w-full rounded-full pl-10 pr-16 py-2 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500 focus:shadow-glow-brand transition-all rpg:rounded-[4px] rpg:border-2 rpg:bg-rpg-bg rpg:border-rpg-border rpg:placeholder:text-rpg-muted rpg:focus:border-rpg-gold rpg:focus:shadow-none"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-0.5 rounded-md border border-paper-border dark:border-ink-border px-1.5 py-0.5 text-[10px] font-sans text-slate">
        Ctrl K
      </kbd>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 min-w-[380px] rounded-2xl border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card dark:shadow-card-dark overflow-hidden z-30">
          <PaletteList items={items} active={kb.active} setActive={kb.setActive} isSearching={isSearching} query={query} />
          <p className="flex items-center gap-3 border-t border-paper-border dark:border-ink-border px-3 py-1.5 text-[10px] text-slate">
            <span>↑↓ navegar</span>
            <span>Enter executar</span>
            <span>Esc fechar</span>
          </p>
        </div>
      )}
      <Toast text={toast} />
    </div>
  );
}

/** Busca do mobile: ícone no header que abre uma sobreposição de tela cheia com resultados e comandos. */
export function MobileGlobalSearch() {
  const [openSheet, setOpenSheet] = useState(false);
  const [query, setQuery] = useState("");
  const close = useMemo(
    () => () => {
      setOpenSheet(false);
      setQuery("");
    },
    []
  );
  const { items, isSearching, toast } = usePaletteItems(query, close);
  const kb = usePaletteKeyboard(items.length, (i) => items[i]?.run());

  return (
    <>
      <button onClick={() => setOpenSheet(true)} aria-label="Buscar ou executar comando" className="md:hidden w-9 h-9 rounded-full flex items-center justify-center border border-paper-border dark:border-ink-border">
        <Search size={16} />
      </button>

      {openSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-paper dark:bg-ink">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-paper-border dark:border-ink-border">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- overlay acabou de abrir, foco é o esperado */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={kb.onKeyDown}
                placeholder="Buscar ou digitar um comando…"
                aria-label="Busca global e comandos"
                className="w-full rounded-full pl-9 pr-3 py-2.5 text-sm bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
              />
            </div>
            <button onClick={() => setOpenSheet(false)} className="text-slate shrink-0" aria-label="Fechar busca">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PaletteList items={items} active={kb.active} setActive={kb.setActive} isSearching={isSearching} query={query} />
          </div>
        </div>
      )}
      <Toast text={toast} />
    </>
  );
}
