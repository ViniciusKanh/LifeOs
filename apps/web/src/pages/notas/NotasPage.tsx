import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ExternalLink, Link2, Loader2, NotebookText, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/journal/RichTextEditor";
import { NoteLinkPicker, LINK_TYPE_LABEL } from "@/components/notes/NoteLinkPicker";
import { useNote, useNotes } from "@/hooks/useLifeOs";
import { notesService } from "@/services/notesService";
import { NOTE_KIND } from "@/utils/lifeOsLabels";
import type { NoteKind } from "@/types";

const AUTOSAVE_MS = 900;

function relative(date: string) {
  const d = new Date(date.includes("T") ? date : `${date.replace(" ", "T")}Z`);
  const diff = Math.round((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `há ${diff} min`;
  if (diff < 1440) return `há ${Math.round(diff / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/** Editor da nota selecionada: autosave, [[links]], vínculos manuais e backlinks. */
function NoteEditor({ id, onBack, onDeleted, onOpen }: { id: string; onBack: () => void; onDeleted: () => void; onOpen: (id: string) => void }) {
  const { note, isLoading, isError, update, isSaving, addLink, removeLink } = useNote(id);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (note && loadedId.current !== note.id) {
      loadedId.current = note.id;
      setTitle(note.title);
      setContent(note.content);
    }
  }, [note]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const schedule = (patch: { title?: string; content?: string }) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (patch.title !== undefined && !patch.title.trim()) return;
      await update(patch);
      setSavedAt(Date.now());
    }, AUTOSAVE_MS);
  };

  const createFromWiki = async (wikiTitle: string) => {
    const created = await notesService.create({ title: wikiTitle });
    // Recarrega a nota atual: o [[link]] passa a apontar para a nova.
    await update({ content });
    onOpen(created.id);
  };

  if (isLoading) return <div className="h-96 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" aria-busy="true" />;
  if (isError || !note) return <Card className="p-5 text-sm text-slate">Nota não encontrada.</Card>;

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (!t || note.tags.includes(t)) return;
    update({ tags: [...note.tags, t] });
    setTagDraft("");
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate hover:bg-black/[0.04]" aria-label="Voltar para a lista">
            <ArrowLeft size={16} />
          </button>
          <select value={note.kind} onChange={(e) => update({ kind: e.target.value as NoteKind })} className="rounded-lg border border-paper-border dark:border-ink-border bg-paper dark:bg-ink px-2 py-1 text-xs" aria-label="Tipo da nota">
            {(Object.keys(NOTE_KIND) as NoteKind[]).map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND[k].emoji} {NOTE_KIND[k].label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate ml-auto flex items-center gap-1" role="status">
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : savedAt ? <Check size={11} className="text-growth" /> : null}
            {isSaving ? "Salvando…" : savedAt ? "Salvo" : `Editada ${relative(note.updatedAt)}`}
          </span>
          <button onClick={() => update({ pinned: !note.pinned })} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate hover:text-signal" aria-label={note.pinned ? "Desafixar" : "Fixar no topo"}>
            {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Excluir a nota "${note.title}"? Os links de outras notas para ela também somem.`)) return;
              await notesService.remove(note.id);
              onDeleted();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate hover:text-drop"
            aria-label="Excluir nota"
          >
            <Trash2 size={15} />
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule({ title: e.target.value });
          }}
          maxLength={200}
          aria-label="Título"
          className="w-full bg-transparent outline-none font-display text-2xl font-bold mb-2"
          placeholder="Título"
        />
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {note.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-cat-pink/10 text-cat-pink px-2 py-0.5 text-[11px]">
              #{t}
              <button onClick={() => update({ tags: note.tags.filter((x) => x !== t) })} aria-label={`Remover #${t}`}>
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            onBlur={addTag}
            placeholder="+ etiqueta"
            aria-label="Nova etiqueta"
            className="bg-transparent outline-none text-[11px] w-24"
            maxLength={40}
          />
        </div>
        <RichTextEditor
          value={content}
          onChange={(v) => {
            setContent(v);
            schedule({ content: v });
          }}
          onBlur={() => undefined}
          placeholder="Escreva… Use [[Título de outra nota]] para criar um link."
          minHeightClass="min-h-[320px]"
        />
        <div className="mt-3">
          <label htmlFor="note-source" className="text-[11px] text-slate">
            Fonte (link, opcional)
          </label>
          <div className="flex gap-2 mt-1">
            <input
              id="note-source"
              defaultValue={note.sourceUrl ?? ""}
              key={note.id}
              onBlur={(e) => e.target.value !== (note.sourceUrl ?? "") && update({ sourceUrl: e.target.value.trim() || null }).catch(() => undefined)}
              placeholder="https://"
              className={`${inputClass} !py-2 !text-xs`}
            />
            {note.sourceUrl && (
              <a href={note.sourceUrl} target="_blank" rel="noreferrer noopener" className="shrink-0 w-9 h-9 rounded-xl border border-paper-border dark:border-ink-border flex items-center justify-center text-slate" aria-label="Abrir fonte">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={14} className="text-cat-blue" />
            <p className="text-xs font-semibold flex-1">Ligações</p>
            <button onClick={() => setPickerOpen((v) => !v)} className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
              {pickerOpen ? "Fechar" : "+ Ligar a…"}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {pickerOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                <NoteLinkPicker excludeId={note.id} onPick={async (type, targetId) => {
                  await addLink({ type, targetId });
                  setPickerOpen(false);
                }} />
              </motion.div>
            )}
          </AnimatePresence>
          {note.links.length === 0 && note.unresolvedWikiLinks.length === 0 ? (
            <p className="text-[11px] text-slate">Nenhuma ligação. Escreva [[Título]] no texto ou ligue a uma tarefa, projeto, meta ou livro.</p>
          ) : (
            <ul className="space-y-1">
              {note.links.map((l) => (
                <li key={l.linkId} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  <span className="text-[10px] uppercase tracking-wide text-slate w-16 shrink-0">{LINK_TYPE_LABEL[l.targetType]}</span>
                  {l.targetType === "note" ? (
                    <button onClick={() => onOpen(l.targetId)} className="flex-1 min-w-0 truncate text-left text-xs font-medium hover:underline">
                      {l.label}
                    </button>
                  ) : (
                    <Link to={l.path} className="flex-1 min-w-0 truncate text-xs font-medium hover:underline">
                      {l.label}
                    </Link>
                  )}
                  {l.origin === "wiki" ? (
                    <span className="text-[10px] text-slate">[[ ]]</span>
                  ) : (
                    <button onClick={() => removeLink(l.linkId)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate hover:text-drop" aria-label={`Remover ligação com ${l.label}`}>
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
              {note.unresolvedWikiLinks.map((t) => (
                <li key={t} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-signal/[0.06]">
                  <span className="flex-1 min-w-0 truncate text-xs text-slate">[[{t}]] ainda não existe</span>
                  <button onClick={() => createFromWiki(t)} className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                    Criar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold mb-2">Citada em ({note.backlinks.length})</p>
          {note.backlinks.length === 0 ? (
            <p className="text-[11px] text-slate">Nenhuma outra nota aponta para esta ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {note.backlinks.map((b) => (
                <li key={b.id}>
                  <button onClick={() => onOpen(b.id)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    <span className="block text-xs font-medium truncate">{b.title}</span>
                    {b.preview && <span className="block text-[11px] text-slate line-clamp-2">{b.preview}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Notas e conhecimento — o segundo cérebro do LifeOS. Lista à esquerda,
 * editor à direita (no celular, uma coisa de cada vez).
 */
export function NotasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("nota");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<NoteKind | undefined>(undefined);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const { notes, isLoading, create } = useNotes({ q: debounced, kind, tag });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const open = (id: string | null) =>
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set("nota", id);
      else n.delete("nota");
      return n;
    });

  const newNote = async (k: NoteKind = "nota") => {
    setCreating(true);
    try {
      const n = await create({ title: k === "ideia" ? "Nova ideia" : "Nova nota", kind: k });
      open(n.id);
    } finally {
      setCreating(false);
    }
  };

  // ?nova=1 (paleta Ctrl K / atalho do PWA) cria uma nota e abre no editor.
  // O ref evita criar duas notas no duplo efeito do StrictMode.
  const novaHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get("nova") !== "1") {
      novaHandled.current = false;
      return;
    }
    if (novaHandled.current) return;
    novaHandled.current = true;
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("nova");
      return n;
    }, { replace: true });
    void newNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Atalho "n" para nova nota (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        newNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);

  return (
    <div className="w-full px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<NotebookText size={20} />}
        title="Notas"
        subtitle="Seu segundo cérebro: ideias, referências e aprendizados ligados ao resto da sua vida."
        actions={
          <Button onClick={() => newNote()} disabled={creating} title="Nova nota (N)">
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Nova nota
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        <div className={`${selected ? "hidden lg:block" : ""} lg:sticky lg:top-2`}>
          <Card className="p-3">
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas notas…" aria-label="Buscar nas notas" className={`${inputClass} !pl-8 !py-2 !text-xs`} />
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {[undefined, ...(Object.keys(NOTE_KIND) as NoteKind[])].map((k) => (
                <button
                  key={k ?? "all"}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${kind === k ? "border-brand-500 bg-brand-500/10" : "border-paper-border dark:border-ink-border text-slate"}`}
                >
                  {k ? `${NOTE_KIND[k].emoji} ${NOTE_KIND[k].label}` : "Todas"}
                </button>
              ))}
            </div>
            {allTags.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-1 mb-1">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(tag === t ? undefined : t)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${tag === t ? "bg-cat-pink text-white" : "bg-cat-pink/10 text-cat-pink"}`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-[calc(100dvh-320px)] min-h-[200px] overflow-y-auto overscroll-contain -mx-1 px-1">
              {isLoading ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
                  ))}
                </div>
              ) : notes.length === 0 ? (
                <p className="text-xs text-slate text-center py-8">{debounced || kind || tag ? "Nada encontrado." : "Nenhuma nota ainda."}</p>
              ) : (
                <ul className="space-y-1">
                  {notes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => open(n.id)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${selected === n.id ? "bg-brand-500/10 ring-1 ring-brand-500/30" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs">{NOTE_KIND[n.kind].emoji}</span>
                          <span className="text-sm font-semibold truncate flex-1">{n.title}</span>
                          {n.pinned && <Pin size={11} className="text-signal shrink-0" />}
                        </span>
                        {n.preview && <span className="block text-[11px] text-slate line-clamp-2 mt-0.5">{n.preview}</span>}
                        <span className="flex items-center gap-2 mt-1 text-[10px] text-slate">
                          {relative(n.updatedAt)}
                          {n.linkCount + n.backlinkCount > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Link2 size={9} /> {n.linkCount + n.backlinkCount}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className={selected ? "" : "hidden lg:block"}>
          {selected ? (
            <NoteEditor key={selected} id={selected} onBack={() => open(null)} onDeleted={() => open(null)} onOpen={(id) => open(id)} />
          ) : (
            <EmptyState
              title={notes.length === 0 ? "Comece seu segundo cérebro" : "Escolha uma nota"}
              description="Notas guardam ideias, referências e aprendizados. Escreva [[Título]] para ligar uma nota a outra e use “Ligar a…” para conectar com tarefas, projetos, metas e livros."
              ctaLabel="Nova nota"
              onCta={() => newNote()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
