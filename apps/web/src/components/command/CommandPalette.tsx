import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowRight,
  BookOpen,
  Check,
  CornerDownLeft,
  FolderLock,
  GanttChartSquare,
  GraduationCap,
  Inbox,
  ListChecks,
  Loader2,
  NotebookPen,
  NotebookText,
  Pencil,
  Repeat,
  Search,
  Sparkles,
  Target,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS, navLabel } from "@/components/layout/navConfig";
import { ProposalDetails } from "@/components/layout/CopilotAssistant";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useCopilotAssistant } from "@/hooks/useCopilot";
import { foldText, useCommandPaletteState, useLocalCommandPreview } from "@/hooks/useCommandPalette";
import type { CopilotActionProposal } from "@/services/copilotService";
import type { GlobalSearchResult } from "@/services/searchService";

/**
 * Paleta de comandos global (Ctrl/Cmd+K, evento "lifeos:open-palette" ou
 * ?captura=1). Um único campo que:
 *  - navega entre as telas (lidas do navConfig);
 *  - mostra a busca global (mesmo endpoint /api/search do topo);
 *  - reconhece comandos em linguagem natural ("bebi 500ml", "treino
 *    corrida 30min", "tarefa revisar relatório sexta alta") e mostra a
 *    PRÉVIA do que seria gravado. Nada é gravado sem "Confirmar".
 * O que o parser local não entende pode ir para o Copilot (Gemini), que
 * devolve a mesma prévia com confirmação.
 */

const TYPE_ICON: Record<GlobalSearchResult["type"], LucideIcon> = {
  task: ListChecks,
  goal: Target,
  habit: Repeat,
  book: BookOpen,
  academic_project: GraduationCap,
  project: GanttChartSquare,
  journal_entry: NotebookPen,
  note: NotebookText,
  life_admin: FolderLock,
};

const EXAMPLES = ["bebi 500ml", "treino jiu-jitsu 60min hoje", "li 20 páginas de Duna", "tarefa revisar relatório sexta alta", "humor 4 energia 3"];

type Section = "Ação" | "Copilot" | "Ir para" | "Resultados";

interface Item {
  id: string;
  section: Section;
  label: string;
  sub?: string | null;
  icon: LucideIcon;
  run: () => void;
}

function useDestinations(isAdmin: boolean, isRpg: boolean) {
  return useMemo(() => {
    const out: Array<{ to: string; label: string; group: string; icon: LucideIcon; haystack: string }> = [];
    for (const g of NAV_GROUPS) {
      if (g.adminOnly && !isAdmin) continue;
      for (const item of g.items) {
        const label = navLabel(item, isRpg);
        // Busca pelos dois nomes (no RPG, "Missões" também acha por "Tarefas").
        const haystack = foldText(`${label} ${item.label} ${g.label}`);
        out.push({ to: item.to, label, group: g.label, icon: item.icon, haystack });
        for (const t of item.tabs ?? []) {
          if (t.to !== item.to) out.push({ to: t.to, label: `${label} › ${t.label}`, group: g.label, icon: item.icon, haystack: foldText(`${haystack} ${t.label}`) });
        }
      }
    }
    return out;
  }, [isAdmin, isRpg]);
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function CommandPalette() {
  const { open, initialText, close } = useCommandPaletteState();
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <>
      {open && <PaletteDialog initialText={initialText} onClose={close} onDone={(text, tone = "success") => setToast({ text, tone })} />}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={clsx(
            "fixed bottom-24 md:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[75] rounded-xl px-4 py-2.5 text-sm shadow-lg text-white",
            toast.tone === "success" ? "bg-[#1E2537]" : "bg-drop",
            "rpg:rounded-[3px] rpg:border-2 rpg:bg-rpg-panel rpg:text-rpg-text",
            toast.tone === "success" ? "rpg:border-rpg-green" : "rpg:border-rpg-red"
          )}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}

function PaletteDialog({
  initialText,
  onClose,
  onDone,
}: {
  initialText: string;
  onClose: () => void;
  onDone: (text: string, tone?: "success" | "error") => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { isRpg } = useTheme();
  const listId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState(initialText);
  const [active, setActive] = useState(0);
  // Resultado do Copilot (IA) para o texto atual — some se o texto mudar.
  const [ai, setAi] = useState<{ forText: string; proposal?: CopilotActionProposal; message?: string; tone?: "info" | "error" } | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const q = query.trim();
  const nq = foldText(q);
  const { results, isSearching } = useGlobalSearch(query);
  const { preview, isParsing } = useLocalCommandPreview(query, true);
  const { ask, isAsking, confirm, isConfirming } = useCopilotAssistant();
  const destinations = useDestinations(isAdmin, isRpg);

  const aiCurrent = ai && ai.forText === q ? ai : null;
  const localProposal = preview?.kind === "proposal" ? preview.proposal : null;
  const proposal = dismissedFor === q ? null : aiCurrent?.proposal ?? localProposal;
  const clarify = !proposal ? (aiCurrent?.message ? { text: aiCurrent.message, tone: aiCurrent.tone ?? "info" } : preview?.kind === "clarify" ? { text: preview.message, tone: "info" as const } : null) : null;

  // Foco inicial no campo e devolução do foco a quem abriu a paleta.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const runConfirm = async (p: CopilotActionProposal) => {
    try {
      const res = await confirm({ action: p.action, args: p.args });
      onClose();
      onDone(res.message);
    } catch (err) {
      setAi({ forText: q, message: err instanceof Error ? err.message : "Não consegui executar essa ação.", tone: "error" });
    }
  };

  const askCopilot = async () => {
    try {
      const res = await ask(q);
      if (res.kind === "proposal") setAi({ forText: q, proposal: res.proposal });
      else setAi({ forText: q, message: res.kind === "reply" ? res.text : res.message, tone: "info" });
      setDismissedFor(null);
    } catch (err) {
      setAi({ forText: q, message: err instanceof Error ? err.message : "Não consegui falar com o Copilot agora.", tone: "error" });
    }
  };

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const list: Item[] = [];
    if (proposal) {
      list.push({ id: "confirm", section: "Ação", label: `Confirmar: ${proposal.summary}`, sub: "Enter grava — antes disso nada é salvo", icon: Check, run: () => void runConfirm(proposal) });
    }
    if (q.length >= 3 && !localProposal && !aiCurrent?.proposal) {
      list.push({ id: "ask", section: "Copilot", label: `Perguntar ao Copilot: “${q}”`, sub: "Interpretado pela IA, com prévia antes de gravar", icon: Sparkles, run: () => void askCopilot() });
    }
    if (q.length >= 2 && !proposal) {
      list.push({
        id: "inbox",
        section: "Ação",
        label: `Capturar “${q}” na Inbox`,
        sub: "Guarda a nota para processar depois",
        icon: Inbox,
        run: () => void runConfirm({ action: "capturar_inbox", args: { content: q.slice(0, 2000) }, summary: "Guardar na Inbox" }),
      });
    }
    const dests = destinations.filter((d) => !nq || d.haystack.includes(nq)).slice(0, nq ? 6 : 8);
    for (const d of dests) list.push({ id: `go-${d.to}`, section: "Ir para", label: d.label, sub: d.group, icon: d.icon, run: go(d.to) });
    if (q.length >= 2) {
      for (const r of results) {
        list.push({ id: `${r.type}-${r.id}`, section: "Resultados", label: r.title, sub: r.subtitle, icon: TYPE_ICON[r.type] ?? Search, run: go(r.link) });
      }
    }
    return list;
    // runConfirm/askCopilot dependem do texto atual (q), já nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, localProposal, aiCurrent, q, nq, destinations, results, navigate, onClose]);

  useEffect(() => setActive(0), [items.length, proposal?.summary]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const busy = isConfirming || isAsking;

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!busy) items[active]?.run();
    }
  };

  // Esc fecha; Tab fica preso dentro do diálogo.
  const onDialogKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const edit = () => {
    setAi(null);
    setDismissedFor(q);
    inputRef.current?.focus();
    inputRef.current?.select();
  };
  const cancel = () => {
    setAi(null);
    setQuery("");
    setDismissedFor(null);
    inputRef.current?.focus();
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let lastSection: Section | "" = "";

  return (
    <div className="fixed inset-0 z-[70] flex md:items-start md:justify-center md:pt-[12vh] bg-black/40 md:px-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onKeyDown={onDialogKey}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex flex-col w-full h-[100dvh] md:h-auto md:max-h-[76vh] md:max-w-xl overflow-hidden",
          "bg-paper-raised dark:bg-ink-raised md:rounded-2xl md:border border-paper-border dark:border-ink-border shadow-card dark:shadow-card-dark",
          "rpg:bg-rpg-panel rpg:text-rpg-text rpg:md:rounded-[4px] rpg:md:border-2 rpg:border-rpg-border rpg:shadow-rpg"
        )}
      >
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-paper-border dark:border-ink-border rpg:border-rpg-border shrink-0">
          {isParsing || isSearching ? (
            <Loader2 size={17} className="animate-spin text-slate shrink-0" aria-hidden />
          ) : (
            <Search size={17} className="text-slate rpg:text-rpg-muted shrink-0" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissedFor(null);
            }}
            onKeyDown={onInputKey}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? optionId(active) : undefined}
            aria-label="Buscar, navegar ou digitar um comando"
            placeholder={isRpg ? "Para onde, aventureiro? Ou: “bebi 500ml”…" : "Buscar, ir para uma tela ou “bebi 500ml”…"}
            maxLength={500}
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none placeholder:text-slate/70 rpg:placeholder:text-rpg-muted"
          />
          <kbd className="hidden md:inline-flex text-[10px] text-slate border border-paper-border dark:border-ink-border rpg:border-rpg-border rounded-md px-1.5 py-0.5">Esc</kbd>
          <button type="button" onClick={onClose} aria-label="Fechar paleta de comandos" className="md:hidden w-11 h-11 -mr-2 flex items-center justify-center text-slate">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {proposal && (
            <section aria-label="Prévia da ação" className="m-3 rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-50 to-transparent dark:from-brand-700/15 p-3 space-y-2.5 rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-gold rpg:bg-none rpg:bg-rpg-bg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-100 rpg:text-rpg-gold">
                  {isRpg ? "Pergaminho de ação" : "Prévia — nada foi gravado ainda"}
                </p>
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-slate rpg:text-rpg-muted">
                  {proposal.source === "ia" ? (
                    <>
                      <Sparkles size={10} aria-hidden /> interpretado pela IA
                    </>
                  ) : (
                    <>
                      <Zap size={10} aria-hidden /> comando rápido
                    </>
                  )}
                </span>
              </div>
              <p className="text-sm font-medium">{proposal.summary}</p>
              <ProposalDetails proposal={proposal} />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void runConfirm(proposal)}
                  disabled={busy}
                  className="lifeos-btn lifeos-btn-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] text-xs font-semibold text-white bg-gradient-to-r from-signal to-signal-deep disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {isConfirming ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />} Confirmar
                </button>
                <button
                  type="button"
                  onClick={edit}
                  className="lifeos-btn lifeos-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] text-xs font-semibold border border-paper-border dark:border-ink-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <Pencil size={13} aria-hidden /> Editar
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="lifeos-btn lifeos-btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 min-h-[40px] text-xs font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <X size={13} aria-hidden /> Cancelar
                </button>
              </div>
            </section>
          )}

          {clarify && (
            <p
              role={clarify.tone === "error" ? "alert" : "status"}
              className={clsx(
                "mx-3 mt-3 rounded-xl px-3 py-2 text-sm rpg:rounded-[3px] rpg:border-2",
                clarify.tone === "error" ? "bg-drop/10 text-drop border border-drop/30 rpg:border-rpg-red" : "bg-black/[0.03] dark:bg-white/[0.05] rpg:bg-rpg-bg rpg:border-rpg-border"
              )}
            >
              {clarify.text}
            </p>
          )}
          {isAsking && (
            <p className="mx-3 mt-3 flex items-center gap-2 text-xs text-slate" role="status">
              <Loader2 size={13} className="animate-spin" aria-hidden /> O Copilot está interpretando…
            </p>
          )}

          <ul ref={listRef} id={listId} role="listbox" aria-label="Sugestões" className="py-2">
            {items.map((it, idx) => {
              const Icon = it.icon;
              const header = it.section !== lastSection;
              lastSection = it.section;
              const selected = idx === active;
              return (
                <li key={it.id} role="presentation">
                  {header && (
                    <p role="presentation" className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate/80 rpg:text-rpg-muted">
                      {it.section}
                    </p>
                  )}
                  <div
                    id={optionId(idx)}
                    role="option"
                    aria-selected={selected}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !busy && it.run()}
                    className={clsx(
                      "mx-2 flex items-center gap-3 px-2.5 py-2 min-h-[44px] rounded-xl cursor-pointer rpg:rounded-[3px]",
                      selected ? "bg-brand-500/[0.09] rpg:bg-rpg-gold/15 rpg:outline rpg:outline-1 rpg:outline-rpg-gold" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-slate rpg:rounded-[3px] rpg:bg-rpg-bg rpg:text-rpg-gold">
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{it.label}</span>
                      {it.sub && <span className="block text-[11px] text-slate truncate rpg:text-rpg-muted">{it.sub}</span>}
                    </span>
                    {selected && <CornerDownLeft size={13} className="text-slate shrink-0 hidden md:block" aria-hidden />}
                    {!selected && it.section === "Ir para" && <ArrowRight size={13} className="text-slate/60 shrink-0 hidden md:block" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>

          {q.length >= 2 && !isSearching && results.length === 0 && !proposal && (
            <p className="px-4 pb-3 text-[11px] text-slate rpg:text-rpg-muted">Nada encontrado nos seus dados para “{q}”.</p>
          )}
          {!q && (
            <div className="px-4 pb-4 pt-1">
              <p className="text-[11px] text-slate rpg:text-rpg-muted mb-2">Comandos rápidos (funcionam sem IA, sempre com prévia):</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setQuery(ex);
                      inputRef.current?.focus();
                    }}
                    className="text-xs rounded-full px-2.5 py-1.5 border border-paper-border dark:border-ink-border hover:border-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rpg:rounded-[3px] rpg:border-rpg-border rpg:hover:border-rpg-gold"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="hidden md:flex items-center gap-3 border-t border-paper-border dark:border-ink-border rpg:border-rpg-border px-4 py-2 text-[10px] text-slate rpg:text-rpg-muted shrink-0">
          <span>↑↓ navegar</span>
          <span>Enter executar</span>
          <span>Esc fechar</span>
          <span className="ml-auto">Ctrl/⌘ K abre de qualquer tela</span>
        </p>
      </div>
    </div>
  );
}
