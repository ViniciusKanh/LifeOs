import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowDown, ArrowLeft, ArrowUp, BookMarked, BookOpen, CalendarClock, ExternalLink, FileText, GraduationCap, Info, Library, ListPlus, Loader2, Network, Pencil, Plus, Quote, ScrollText, Search, Star, Trash2, X } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { PixelScene } from "@/components/living-world/PixelScene";
import { CharacterPortrait } from "@/components/living-world/AgentPortrait";
import { drawLibraryScene, LIBRARIAN } from "@/components/living-world/engine/scenes";
import { authorsLine, ExportPanel, MetadataEditor, ReviewEditor } from "@/components/research/ResearchWidgets";
import { usePaperDetail, useRelated, useResearchActions, useResearchHub, useResearchPapers } from "@/hooks/useResearch";
import { useWorldWeather } from "@/hooks/useLivingWorld";
import { researchService, type LibraryHub, type LibraryPaper, type PaperMeta, type PaperOverrides, type PaperStatus, type RelationKind } from "@/services/researchService";
import { ApiError } from "@/services/api";

const R = { borderRadius: 6 };
const inputCls = "w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold";
const STATUS: Array<{ v: PaperStatus; l: string; tone: string }> = [
  { v: "para_ler", l: "Para ler", tone: "text-rpg-muted border-rpg-border" },
  { v: "lendo", l: "Lendo", tone: "text-rpg-blue border-rpg-blue/70" },
  { v: "lido", l: "Lido", tone: "text-rpg-purple border-rpg-purple/70" },
  { v: "fichado", l: "Fichado", tone: "text-rpg-green border-rpg-green/70" },
];
const errMsg = (e: unknown, fb: string) => (e instanceof ApiError || e instanceof Error ? e.message || fb : fb);
const KIND_LABEL: Record<string, string> = { tcc: "TCC", dissertacao: "Dissertação", tese: "Tese", artigo: "Artigo", projeto_cientifico: "Projeto científico", trabalho_final: "Trabalho final" };

/** Fala do bibliotecário a partir dos números reais da biblioteca. */
function librarianSays(h: LibraryHub | undefined): string {
  if (!h) return "Organizando as estantes…";
  const s = h.stats;
  if (!s.saved) return "Bem-vindo à biblioteca! Traga o DOI do primeiro artigo e eu cuido dos metadados, citações e referências.";
  if (s.weekly.goal > 0 && s.weekly.read >= s.weekly.goal) return `Meta da semana cumprida: ${s.weekly.read} artigo(s) lido(s). Que tal fichar um deles enquanto está fresco?`;
  if (s.weekly.goal > 0) return `Desafio da semana: ${s.weekly.read}/${s.weekly.goal} artigos lidos. ${s.pending ? `Há ${s.pending} esperando na fila.` : "Adicione mais artigos à fila."}`;
  if (s.read > s.reviewed) return `${s.read - s.reviewed} artigo(s) lido(s) ainda sem fichamento. Fichar ajuda a escrever a dissertação depois.`;
  return `${s.saved} artigo(s) na biblioteca, ${s.reviewed} fichado(s). Lembre: muitas citações não significam qualidade — leia com olhar crítico.`;
}

function DoiPanel({ hub, onSaved, notify }: { hub: LibraryHub | undefined; onSaved: (p: LibraryPaper) => void; notify: (m: string, t?: "success" | "error") => void }) {
  const a = useResearchActions();
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<(PaperMeta & { savedId: string | null }) | null>(null);
  const [overrides, setOverrides] = useState<PaperOverrides>({});
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  useEffect(() => setProjectId(hub?.stats.settings.activeProjectId ?? ""), [hub?.stats.settings.activeProjectId]);
  const search = async () => {
    setBusy(true);
    setPreview(null);
    try {
      setPreview(await researchService.previewDoi(doi));
      setOverrides({});
    } catch (e) {
      notify(errMsg(e, "Não foi possível consultar o DOI."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rpg-panel space-y-3 p-4" aria-label="Cadastrar artigo por DOI">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
          <BookMarked size={18} className="text-rpg-blue" aria-hidden /> Cadastrar artigo por DOI
        </h2>
        <span className="flex gap-1 text-[10px]">
          {["OpenAlex", "Semantic Scholar", "Crossref"].map((s) => (
            <span key={s} className={clsx("border px-1.5 py-0.5", preview?.sources.includes(s) ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
              {s}
            </span>
          ))}
        </span>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (doi.trim()) void search();
        }}
      >
        <div className="relative min-w-[220px] flex-1">
          <label htmlFor="doi" className="sr-only">
            DOI
          </label>
          <input id="doi" value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1145/3464301 ou https://doi.org/…" className={clsx(inputCls, "pr-8")} style={R} />
          {doi && (
            <button type="button" onClick={() => (setDoi(""), setPreview(null))} className="absolute right-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-label="Limpar">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <RPGButton variant="secondary" type="submit" disabled={busy || !doi.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Search size={14} aria-hidden />} Buscar
        </RPGButton>
      </form>
      {preview && (
        <div className="space-y-3 border-t border-rpg-border/60 pt-3">
          <div>
            <p className="font-semibold text-rpg-text">{preview.title}</p>
            <p className="text-xs text-rpg-muted">
              {authorsLine(preview.authors)} · {preview.year ?? "ano não informado"}
              {preview.venue ? ` · ${preview.venue}` : ""}
              {preview.citedBy != null ? ` · ${preview.citedBy.toLocaleString("pt-BR")} citações (${preview.citedBySource})` : ""}
            </p>
            {preview.abstract ? <p className="mt-1 line-clamp-3 text-xs text-rpg-text">{preview.abstract}</p> : <p className="mt-1 text-xs text-rpg-muted">Nenhuma base disponibilizou o resumo.</p>}
          </div>
          {preview.savedId ? (
            <p className="text-sm text-rpg-green">Esse artigo já está na sua biblioteca.</p>
          ) : (
            <>
              <details>
                <summary className="cursor-pointer text-xs text-rpg-blue">Corrigir dados antes de salvar (vale só para você)</summary>
                <div className="mt-2">
                  <MetadataEditor meta={preview} onChange={setOverrides} />
                </div>
              </details>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-rpg-muted">
                  Categoria da lista de leitura
                  <select className={clsx(inputCls, "mt-0.5")} style={R} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {hub?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-rpg-muted">
                  Projeto acadêmico
                  <select className={clsx(inputCls, "mt-0.5")} style={R} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Nenhum</option>
                    {hub?.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {KIND_LABEL[p.kind] ?? p.kind}: {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <RPGButton
                variant="success"
                disabled={a.save.isPending}
                onClick={() =>
                  a.save.mutate(
                    { doi: preview.doi, overrides: Object.keys(overrides).length ? overrides : undefined, categoryId: categoryId || null, academicProjectId: projectId || null },
                    {
                      onSuccess: (p) => {
                        notify("Artigo salvo na biblioteca.");
                        setPreview(null);
                        setDoi("");
                        onSaved(p);
                      },
                      onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error"),
                    },
                  )
                }
              >
                {a.save.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />} Salvar na biblioteca
              </RPGButton>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RelatedPanel({ paperId, onAdd, adding }: { paperId: string | null; onAdd: (doi: string) => void; adding: string | null }) {
  const [kind, setKind] = useState<RelationKind>("related");
  const q = useRelated(paperId, kind);
  return (
    <section className="rpg-panel flex flex-col p-4" aria-label="Trabalhos relacionados">
      <h2 className="mb-2 flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
        <Network size={18} className="text-rpg-purple" aria-hidden /> Relacionados
      </h2>
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Tipo de relação">
        {(
          [
            ["related", "Sugeridos"],
            ["references", "Referências"],
            ["citing", "Citado por"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={clsx("border px-2 py-1 text-[11px] font-semibold", kind === k ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l}
          </button>
        ))}
      </div>
      <p className="mb-2 text-[10px] text-rpg-muted">{kind === "related" ? "Recomendação algorítmica do OpenAlex — não é uma relação bibliográfica comprovada." : kind === "references" ? "Trabalhos que este artigo cita (OpenAlex)." : "Trabalhos que citam este artigo, mais citados primeiro (OpenAlex)."}</p>
      {!paperId ? (
        <p className="text-sm text-rpg-muted">Selecione um artigo.</p>
      ) : q.isLoading ? (
        <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-rpg-bg-2" />)}</div>
      ) : q.isError ? (
        <p className="text-sm text-rpg-red">{errMsg(q.error, "Não foi possível consultar agora.")}</p>
      ) : !q.data?.items.length ? (
        <p className="text-sm text-rpg-muted">Nenhum trabalho disponível nesta fonte.</p>
      ) : (
        <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {q.data.items.map((it) => (
            <li key={it.openalexId ?? it.title} className="rpg-tile flex items-start gap-2 p-2">
              <FileText size={16} className="mt-0.5 shrink-0 text-rpg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold text-rpg-text">{it.title}</p>
                <p className="text-[11px] text-rpg-muted">
                  {it.authors.slice(0, 2).join(", ")}
                  {it.authors.length > 2 ? " et al." : ""} · {it.year ?? "s.d."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {it.citedBy != null && (
                  <span className="flex items-center gap-0.5 text-[11px] font-semibold text-rpg-purple">
                    <Quote size={11} aria-hidden /> {it.citedBy.toLocaleString("pt-BR")}
                  </span>
                )}
                {it.savedId ? (
                  <span className="text-[10px] text-rpg-green">Na biblioteca</span>
                ) : it.doi ? (
                  <button type="button" onClick={() => onAdd(it.doi!)} disabled={adding === it.doi} className="text-[10px] font-semibold text-rpg-blue disabled:opacity-50">
                    {adding === it.doi ? "Salvando…" : "+ Adicionar"}
                  </button>
                ) : (
                  <span className="text-[10px] text-rpg-muted">sem DOI</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SelectedPaper({ id, hub, notify, onDeleted, onOpenReview }: { id: string; hub: LibraryHub | undefined; notify: (m: string, t?: "success" | "error") => void; onDeleted: () => void; onOpenReview: () => void }) {
  const q = usePaperDetail(id);
  const a = useResearchActions();
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<PaperOverrides>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tag, setTag] = useState("");
  const p = q.data?.paper;
  const patch = (body: Parameters<typeof a.update.mutate>[0] extends infer T ? Omit<T & object, "id"> : never, ok?: string) =>
    a.update.mutate({ id, ...body }, { onSuccess: () => ok && notify(ok), onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") });
  if (q.isLoading || !p) return <section className="rpg-panel h-[300px] animate-pulse" aria-busy="true" />;
  return (
    <section className="rpg-panel space-y-3 p-4" aria-label="Artigo selecionado">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
          <Star size={18} className="text-rpg-gold" aria-hidden /> Artigo selecionado
        </h2>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Status de leitura">
          {STATUS.map((s) => (
            <button key={s.v} type="button" role="radio" aria-checked={p.status === s.v} onClick={() => patch({ status: s.v }, s.v === "fichado" ? "Fichamento registrado! O bibliotecário arquivou o pergaminho." : undefined)} className={clsx("border px-2.5 py-1 text-xs font-semibold", p.status === s.v ? `${s.tone} bg-white/10 ring-1 ring-rpg-gold/60` : "border-rpg-border text-rpg-muted opacity-80")} style={R}>
              {s.l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-lg font-bold leading-tight text-rpg-text">{p.title}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-rpg-muted">Autores</dt>
            <dd className="text-rpg-text">{authorsLine(p.authors, 6)}</dd>
            <dt className="text-rpg-muted">Ano</dt>
            <dd className="text-rpg-text">{p.year ?? "—"}</dd>
            <dt className="text-rpg-muted">Periódico</dt>
            <dd className="text-rpg-text">
              {p.venue ?? "—"}
              {p.volume ? `, v. ${p.volume}` : ""}
              {p.issue ? `, n. ${p.issue}` : ""}
              {p.pages ? `, p. ${p.pages}` : ""}
            </dd>
            {p.doi && (
              <>
                <dt className="text-rpg-muted">DOI</dt>
                <dd>
                  <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rpg-blue underline">
                    {p.doi} <ExternalLink size={11} aria-hidden />
                  </a>
                </dd>
              </>
            )}
          </dl>
          {p.overrides.length > 0 && <p className="text-[10px] text-rpg-orange">Você corrigiu: {p.overrides.join(", ")} (só na sua biblioteca).</p>}
        </div>
        <div className="shrink-0 border-l border-rpg-border/60 pl-3 text-center sm:w-32">
          <Quote size={22} className="mx-auto text-rpg-purple" aria-hidden />
          <p className="text-[11px] text-rpg-muted">Citações</p>
          <p className="font-rpg text-3xl font-bold text-rpg-text">{p.citedBy == null ? "—" : p.citedBy.toLocaleString("pt-BR")}</p>
          {p.citedBySource && <p className="text-[10px] text-rpg-muted">{p.citedBySource}{p.citedByAt ? ` · ${new Date(p.citedByAt).toLocaleDateString("pt-BR")}` : ""}</p>}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-rpg-muted">Resumo</p>
        <p className="max-h-32 overflow-y-auto text-sm text-rpg-text">{p.abstract ?? "Nenhuma base disponibilizou o resumo deste artigo."}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-rpg-muted">
          Categoria
          <select className={clsx(inputCls, "mt-0.5")} style={R} value={p.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value || null })}>
            <option value="">Sem categoria</option>
            {hub?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-rpg-muted">
          Projeto
          <select className={clsx(inputCls, "mt-0.5")} style={R} value={p.academicProjectId ?? ""} onChange={(e) => patch({ academicProjectId: e.target.value || null })}>
            <option value="">Nenhum</option>
            {hub?.projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-rpg-muted">
          Prioridade
          <select className={clsx(inputCls, "mt-0.5")} style={R} value={p.priority} onChange={(e) => patch({ priority: e.target.value as LibraryPaper["priority"] })}>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </label>
        <label className="text-[11px] text-rpg-muted sm:col-span-2">
          Progresso de leitura: {p.progress}%
          <input type="range" min={0} max={100} step={10} defaultValue={p.progress} key={`${p.id}-${p.progress}`} onMouseUp={(e) => patch({ progress: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => patch({ progress: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => patch({ progress: Number((e.target as HTMLInputElement).value) })} className="mt-1 w-full accent-[rgb(var(--rpg-green))]" />
        </label>
        <label className="text-[11px] text-rpg-muted">
          Capítulo
          <input className={clsx(inputCls, "mt-0.5")} style={R} defaultValue={p.chapter ?? ""} key={`ch-${p.id}`} maxLength={120} placeholder="ex.: Cap. 2" onBlur={(e) => e.target.value !== (p.chapter ?? "") && patch({ chapter: e.target.value || null })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {p.tags.map((t) => (
          <span key={t} className="flex items-center gap-1 border border-rpg-border px-1.5 py-0.5 text-[11px] text-rpg-text" style={R}>
            #{t}
            <button type="button" onClick={() => patch({ tags: p.tags.filter((x) => x !== t) })} aria-label={`Remover tag ${t}`}>
              <X size={10} aria-hidden />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (tag.trim()) patch({ tags: [...p.tags, tag.trim()] }), setTag("");
          }}
        >
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ tag" maxLength={40} className="w-24 border border-dashed border-rpg-border bg-transparent px-1.5 py-0.5 text-[11px] text-rpg-text outline-none focus:border-rpg-gold" style={R} aria-label="Nova tag" />
        </form>
      </div>
      <label className="block text-[11px] text-rpg-muted">
        Nota rápida
        <textarea className={clsx(inputCls, "mt-0.5")} style={R} rows={2} defaultValue={p.notes ?? ""} key={`n-${p.id}`} maxLength={5000} onBlur={(e) => e.target.value !== (p.notes ?? "") && patch({ notes: e.target.value || null })} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <RPGButton variant="ghost" className="text-xs" onClick={() => patch({ favorite: !p.favorite })} aria-pressed={p.favorite}>
          <Star size={13} fill={p.favorite ? "currentColor" : "none"} aria-hidden /> {p.favorite ? "Favorito" : "Favoritar"}
        </RPGButton>
        <RPGButton variant="primary" className="text-xs" onClick={onOpenReview}>
          <ScrollText size={13} aria-hidden /> Fichamento
        </RPGButton>
        {(p.oaUrl || p.url) && (
          <a href={p.oaUrl ?? p.url!} target="_blank" rel="noreferrer" className="rpg-btn rpg-btn-secondary text-xs">
            <ExternalLink size={13} aria-hidden /> {p.oaUrl ? "Abrir (acesso aberto)" : "Abrir original"}
          </a>
        )}
        <RPGButton variant="secondary" className="text-xs" onClick={() => setExportOpen(true)}>
          <FileText size={13} aria-hidden /> Referência
        </RPGButton>
        <RPGButton variant="secondary" className="text-xs" disabled={a.task.isPending} onClick={() => a.task.mutate(id, { onSuccess: () => notify("Tarefa de leitura criada em Tarefas."), onError: (e) => notify(errMsg(e, "Não foi possível criar a tarefa."), "error") })}>
          <ListPlus size={13} aria-hidden /> Tarefa de leitura
        </RPGButton>
        <RPGButton variant="ghost" className="text-xs" onClick={() => (setEditing(true), setOverrides({}))}>
          <Pencil size={13} aria-hidden /> Corrigir dados
        </RPGButton>
        <RPGButton variant="ghost" className="text-xs text-rpg-red" onClick={() => setConfirmDel(true)}>
          <Trash2 size={13} aria-hidden /> Remover
        </RPGButton>
      </div>
      {q.data!.history.length > 0 && (
        <details className="text-[11px] text-rpg-muted">
          <summary className="cursor-pointer text-rpg-blue">Histórico de alterações ({q.data!.history.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {q.data!.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at.replace(" ", "T") + (h.at.endsWith("Z") ? "" : "Z")).toLocaleString("pt-BR")} · {h.field}: {h.oldValue ?? "—"} → {h.newValue ?? "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Corrigir dados do artigo"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" onClick={() => (patch({ overrides: { ...overrides } }, "Dados corrigidos."), setEditing(false))}>
              Salvar correções
            </RPGButton>
          </div>
        }
      >
        <p className="mb-2 text-xs text-rpg-muted">As correções valem só para a sua biblioteca. Os dados originais das bases continuam guardados.</p>
        <MetadataEditor meta={p} onChange={setOverrides} />
      </Modal>
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Gerar referência">
        <ExportPanel ids={[id]} label={p.title} />
      </Modal>
      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Remover da biblioteca?"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancelar
            </RPGButton>
            <RPGButton variant="danger" onClick={() => a.remove.mutate(id, { onSuccess: () => (setConfirmDel(false), notify("Artigo removido."), onDeleted()), onError: (e) => notify(errMsg(e, "Não foi possível remover."), "error") })}>
              Remover
            </RPGButton>
          </div>
        }
      >
        <p className="text-sm text-rpg-text">O fichamento e as citações deste artigo serão apagados junto. Esta ação não pode ser desfeita.</p>
      </Modal>
    </section>
  );
}

export function BibliotecaMestradoPage() {
  const hubQ = useResearchHub();
  const hub = hubQ.data;
  const a = useResearchActions();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = (msg: string, tone: "success" | "error" = "success") => setToast({ msg, tone });
  const [cat, setCat] = useState<string>("");
  const [qText, setQText] = useState("");
  const [status, setStatus] = useState<PaperStatus | "">("");
  const [sort, setSort] = useState<"position" | "recent" | "year" | "citations" | "title">("position");
  const [favOnly, setFavOnly] = useState(false);
  const filters = useMemo(() => ({ categoryId: cat || undefined, q: qText.trim() || undefined, status: status || undefined, sort, favorite: favOnly ? "1" : undefined }), [cat, qText, status, sort, favOnly]);
  const papersQ = useResearchPapers(filters);
  const papers = papersQ.data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exportAll, setExportAll] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const detail = usePaperDetail(reviewOpen ? selected : null);
  const weather = useWorldWeather(true);
  const rainy = !!weather.data && "current" in weather.data && ["drizzle", "rain", "heavy_rain", "storm"].includes(weather.data.current.visual);
  const reviewed = hub?.stats.reviewed ?? 0;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, t: number, still: boolean) => drawLibraryScene(ctx, t, { rain: rainy, reviewed, still }), [rainy, reviewed]);
  useEffect(() => {
    if (!selected && papers[0]) setSelected(papers[0].id);
  }, [papers, selected]);
  const activeProject = hub?.projects.find((p) => p.id === hub.stats.settings.activeProjectId) ?? hub?.projects.find((p) => p.kind === "dissertacao") ?? null;
  const countFor = (id: string | null) => hub?.stats.byCategory.find((c) => c.categoryId === id)?.total ?? 0;
  const move = (p: LibraryPaper, dir: -1 | 1) => {
    const idx = papers.findIndex((x) => x.id === p.id);
    const other = papers[idx + dir];
    if (!other) return;
    // Troca as posições com o vizinho (ordem manual da lista).
    a.update.mutate({ id: p.id, position: other.position === p.position ? other.position + dir : other.position });
    a.update.mutate({ id: other.id, position: p.position });
  };
  const addRelated = (doi: string) => {
    setAdding(doi);
    a.save.mutate({ doi, categoryId: cat || null }, { onSuccess: () => notify("Artigo relacionado adicionado."), onError: (e) => notify(errMsg(e, "Não foi possível adicionar."), "error"), onSettled: () => setAdding(null) });
  };

  if (hubQ.isError)
    return (
      <div className="px-4 py-6">
        <div className="rpg-panel p-6 text-center" role="alert">
          <p className="text-sm text-rpg-red">Não foi possível abrir a Biblioteca do Mestrado.</p>
          <RPGButton variant="secondary" className="mt-3" onClick={() => void hubQ.refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      </div>
    );

  const s = hub?.stats;
  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
      <div className="flex flex-wrap gap-2">
        <Link to="/meu-mundo" className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2.5 py-1 text-xs font-semibold text-rpg-green" style={R}>
          <ArrowLeft size={13} aria-hidden /> Meu Mundo — Vila
        </Link>
        <Link to="/educacao" className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2.5 py-1 text-xs font-semibold text-rpg-blue" style={R}>
          <GraduationCap size={13} aria-hidden /> Educação
        </Link>
      </div>
      <header className="flex flex-wrap items-start gap-3">
        <Library size={44} className="shrink-0 text-rpg-blue" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="rpg-title font-rpg text-3xl font-bold leading-none text-rpg-text sm:text-4xl">Biblioteca do Mestrado</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-rpg-muted">
            Artigos por DOI, referências, citações, lista de leitura e fichamentos para a dissertação.
            <span title="Metadados de OpenAlex, Semantic Scholar e Crossref. Citações mudam com o tempo e variam entre bases.">
              <Info size={14} aria-hidden />
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="rpg-tile flex items-center gap-2 px-3 py-2">
            <GraduationCap size={22} className="text-rpg-purple" aria-hidden />
            <span className="text-xs">
              <span className="block font-semibold text-rpg-text">{activeProject ? KIND_LABEL[activeProject.kind] ?? "Projeto" : "Projeto acadêmico"}</span>
              <select value={hub?.stats.settings.activeProjectId ?? ""} onChange={(e) => a.settings.mutate({ activeProjectId: e.target.value || null })} className="max-w-[170px] bg-transparent text-rpg-green outline-none" aria-label="Projeto acadêmico ativo">
                <option value="">{hub?.projects.length ? "Escolher projeto" : "Nenhum (crie em Educação)"}</option>
                {hub?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div className="rpg-tile flex items-center gap-2 px-3 py-2">
            <CalendarClock size={22} className="text-rpg-gold" aria-hidden />
            <span className="text-xs">
              <span className="block font-semibold text-rpg-text">Defesa prevista</span>
              <span className="text-rpg-muted">{activeProject?.defenseDate ? new Date(`${activeProject.defenseDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "Defina em Educação"}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rpg-ornate relative aspect-[16/9] max-h-[340px] w-full overflow-hidden p-0" aria-label="A biblioteca">
          <PixelScene draw={draw} label="Biblioteca com o bibliotecário lendo" />
        </section>
        <div className="space-y-3">
          <DoiPanel hub={hub} onSaved={(p) => setSelected(p.id)} notify={notify} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { icon: BookOpen, tone: "text-rpg-blue", l: "Artigos salvos", v: s?.saved ?? 0, sub: `${s?.weekly.read ?? 0} lido(s) esta semana` },
              { icon: Quote, tone: "text-rpg-purple", l: "Citações totais", v: s?.citations.total ?? 0, sub: s?.citations.papersWithData ? `de ${s.citations.papersWithData} artigo(s) · ${s.citations.sources.join(", ")}` : "sem dados ainda" },
              { icon: FileText, tone: "text-rpg-green", l: "Artigos fichados", v: s?.reviewed ?? 0, sub: s?.saved ? `${Math.round(((s.reviewed ?? 0) / s.saved) * 100)}% do total` : "—" },
              { icon: BookMarked, tone: "text-rpg-pink", l: "Próximos da leitura", v: s?.pending ?? 0, sub: "na fila" },
            ].map((k) => (
              <div key={k.l} className="rpg-panel flex items-start gap-2 p-3">
                <k.icon size={22} className={clsx("shrink-0", k.tone)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] text-rpg-muted">{k.l}</p>
                  <p className="font-rpg text-2xl font-bold text-rpg-text">{hubQ.isLoading ? "…" : k.v.toLocaleString("pt-BR")}</p>
                  <p className="truncate text-[10px] text-rpg-muted" title={k.sub}>
                    {k.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {selected ? (
          <SelectedPaper id={selected} hub={hub} notify={notify} onDeleted={() => setSelected(null)} onOpenReview={() => setReviewOpen(true)} />
        ) : (
          <section className="rpg-panel flex flex-col items-center justify-center gap-2 p-6 text-center">
            <BookOpen size={28} className="text-rpg-muted" aria-hidden />
            <p className="text-sm text-rpg-muted">{papersQ.isLoading ? "Abrindo as estantes…" : "Nenhum artigo selecionado. Cadastre um DOI acima para começar."}</p>
          </section>
        )}
        <RelatedPanel paperId={selected} onAdd={addRelated} adding={adding} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rpg-panel p-4" aria-label="Lista de leitura">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
              <ScrollText size={18} className="text-rpg-gold" aria-hidden /> Lista de leitura {activeProject?.kind === "dissertacao" ? "da dissertação" : ""}
            </h2>
            <div className="flex gap-1.5">
              <RPGButton variant="ghost" className="text-xs" onClick={() => setExportAll(true)} disabled={!papers.length}>
                <FileText size={13} aria-hidden /> Exportar referências
              </RPGButton>
            </div>
          </div>
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Categorias">
            <button type="button" role="tab" aria-selected={!cat} onClick={() => setCat("")} className={clsx("shrink-0 border px-2.5 py-1 text-xs font-semibold", !cat ? "border-rpg-green bg-rpg-green/10 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
              Todas ({s?.saved ?? 0})
            </button>
            {hub?.categories.map((c) => (
              <span key={c.id} className="group flex shrink-0 items-center">
                <button type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={clsx("border px-2.5 py-1 text-xs font-semibold", cat === c.id ? "border-rpg-green bg-rpg-green/10 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
                  {c.name} ({countFor(c.id)})
                </button>
                {cat === c.id && (
                  <>
                    <button type="button" className="ml-0.5 text-rpg-muted hover:text-rpg-text" aria-label={`Renomear ${c.name}`} onClick={() => setNewCat(`rename:${c.id}:${c.name}`)}>
                      <Pencil size={12} aria-hidden />
                    </button>
                    <button type="button" className="ml-0.5 text-rpg-muted hover:text-rpg-red" aria-label={`Excluir ${c.name}`} onClick={() => a.deleteCategory.mutate(c.id, { onSuccess: () => (setCat(""), notify("Categoria excluída; os artigos ficaram sem categoria.")) })}>
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </>
                )}
              </span>
            ))}
            <button type="button" role="tab" aria-selected={cat === "none"} onClick={() => setCat("none")} className={clsx("shrink-0 border px-2.5 py-1 text-xs font-semibold", cat === "none" ? "border-rpg-green text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R}>
              Sem categoria ({countFor(null)})
            </button>
            <button type="button" onClick={() => setNewCat("")} className="shrink-0 border border-dashed border-rpg-border px-2 py-1 text-xs text-rpg-muted" style={R} aria-label="Nova categoria">
              <Plus size={12} aria-hidden />
            </button>
          </div>
          <div className="mb-2 grid gap-1.5 sm:grid-cols-[1fr_auto_auto_auto]">
            <label className="relative">
              <span className="sr-only">Buscar por título, autor ou DOI</span>
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
              <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Título, autor ou DOI" className={clsx(inputCls, "py-1.5 pl-7")} style={R} />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PaperStatus | "")} className={clsx(inputCls, "py-1.5")} style={R} aria-label="Status">
              <option value="">Todos os status</option>
              {STATUS.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.l}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={clsx(inputCls, "py-1.5")} style={R} aria-label="Ordenar">
              <option value="position">Ordem manual</option>
              <option value="recent">Mais recentes</option>
              <option value="year">Ano</option>
              <option value="citations">Citações</option>
              <option value="title">Título</option>
            </select>
            <button type="button" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={clsx("flex items-center gap-1 border px-2 text-xs", favOnly ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
              <Star size={12} fill={favOnly ? "currentColor" : "none"} aria-hidden /> Favoritos
            </button>
          </div>
          {papersQ.isLoading ? (
            <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-rpg-bg-2" />)}</div>
          ) : papers.length === 0 ? (
            <p className="py-6 text-center text-sm text-rpg-muted">{s?.saved ? "Nenhum artigo com esses filtros." : "A lista está vazia. Cadastre um artigo pelo DOI."}</p>
          ) : (
            <ul className="space-y-1.5">
              {papers.map((p, i) => (
                <li key={p.id} className={clsx("rpg-tile flex flex-wrap items-center gap-2 p-2", selected === p.id && "ring-1 ring-rpg-gold")}>
                  <button type="button" onClick={() => a.update.mutate({ id: p.id, favorite: !p.favorite })} className={p.favorite ? "text-rpg-gold" : "text-rpg-muted"} aria-label={p.favorite ? "Desfavoritar" : "Favoritar"} aria-pressed={p.favorite}>
                    <Star size={15} fill={p.favorite ? "currentColor" : "none"} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setSelected(p.id)} className="min-w-[160px] flex-1 text-left">
                    <p className="line-clamp-1 text-sm font-semibold text-rpg-text">{p.title}</p>
                    <p className="text-[11px] text-rpg-muted">
                      {authorsLine(p.authors, 2)} · {p.year ?? "s.d."}
                      {p.chapter ? ` · ${p.chapter}` : ""}
                      {p.hasReview ? " · fichamento" : ""}
                      {p.quotesCount ? ` · ${p.quotesCount} citação(ões)` : ""}
                    </p>
                  </button>
                  {p.categoryName && (
                    <span className="border border-rpg-border px-1.5 py-0.5 text-[10px] text-rpg-text" style={R}>
                      {p.categoryName}
                    </span>
                  )}
                  <span className={clsx("border px-1.5 py-0.5 text-[10px] font-semibold", STATUS.find((x) => x.v === p.status)!.tone)} style={R}>
                    {STATUS.find((x) => x.v === p.status)!.l}
                  </span>
                  <span className="flex w-24 items-center gap-1.5" title={`${p.progress}% lido`}>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-rpg-bg-2">
                      <span className={clsx("block h-full", p.progress === 100 ? "bg-rpg-green" : "bg-rpg-purple")} style={{ width: `${p.progress}%` }} />
                    </span>
                    <span className="text-[10px] text-rpg-muted">{p.progress}%</span>
                  </span>
                  {sort === "position" && !qText && !status && !favOnly && (
                    <span className="flex flex-col">
                      <button type="button" disabled={i === 0} onClick={() => move(p, -1)} className="text-rpg-muted disabled:opacity-30" aria-label="Subir">
                        <ArrowUp size={12} aria-hidden />
                      </button>
                      <button type="button" disabled={i === papers.length - 1} onClick={() => move(p, 1)} className="text-rpg-muted disabled:opacity-30" aria-label="Descer">
                        <ArrowDown size={12} aria-hidden />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-3">
          <section className="rpg-ornate flex items-end gap-3 overflow-hidden p-3" aria-label="Bibliotecário">
            <div className="shrink-0">
              <CharacterPortrait look={LIBRARIAN} size={80} crop="full" pose="stand" />
            </div>
            <div className="min-w-0 flex-1 border-2 border-rpg-gold/60 bg-rpg-panel p-3" style={R}>
              <p className="font-rpg font-bold text-rpg-gold-light">Bibliotecária da Vila</p>
              <p className="mt-1 text-xs text-rpg-text">{librarianSays(hub)}</p>
            </div>
          </section>
          <section className="rpg-panel space-y-2 p-4" aria-label="Meta de leitura">
            <h2 className="font-rpg text-lg font-bold text-rpg-text">Desafio de leitura</h2>
            <div className="flex items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded bg-rpg-bg-2">
                <span className="block h-full bg-rpg-green" style={{ width: `${s && s.weekly.goal ? Math.min(100, (s.weekly.read / s.weekly.goal) * 100) : 0}%` }} />
              </span>
              <span className="text-xs text-rpg-text">
                {s?.weekly.read ?? 0}/{s?.weekly.goal ?? 0} nesta semana
              </span>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-rpg-muted">
              Meta semanal (artigos lidos)
              <input type="number" min={0} max={50} defaultValue={s?.weekly.goal ?? 3} key={s?.weekly.goal} onBlur={(e) => a.settings.mutate({ weeklyGoal: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} className="w-16 border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-sm text-rpg-text" style={R} />
            </label>
            <p className="text-[10px] text-rpg-muted">XP real: +5 ao salvar (até 10 por dia), +20 ao terminar a leitura e +40 ao fichar — uma vez por artigo.</p>
            {s && s.saved > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-semibold text-rpg-text">Progresso por categoria</p>
                {hub!.categories
                  .map((c) => ({ c, st: s.byCategory.find((b) => b.categoryId === c.id) }))
                  .filter((x) => x.st)
                  .map(({ c, st }) => (
                    <div key={c.id} className="flex items-center gap-2 text-[11px] text-rpg-muted">
                      <span className="w-32 truncate">{c.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded bg-rpg-bg-2">
                        <span className="block h-full bg-rpg-purple" style={{ width: `${(st!.done / st!.total) * 100}%` }} />
                      </span>
                      <span>
                        {st!.done}/{st!.total}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={`Fichamento${detail.data ? ` — ${detail.data.paper.title.slice(0, 60)}` : ""}`} size="lg">
        {detail.isLoading || !detail.data ? <div className="h-60 animate-pulse rounded bg-rpg-bg-2" /> : <ReviewEditor detail={detail.data} />}
      </Modal>
      <Modal open={exportAll} onClose={() => setExportAll(false)} title="Exportar referências">
        <ExportPanel ids={papers.map((p) => p.id)} label={`${papers.length} artigo(s) da lista atual (filtros aplicados).`} />
      </Modal>
      <Modal
        open={newCat !== null}
        onClose={() => setNewCat(null)}
        title={newCat?.startsWith("rename:") ? "Renomear categoria" : "Nova categoria"}
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (name.length < 2) return;
            if (newCat?.startsWith("rename:")) {
              const id = newCat.split(":")[1]!;
              a.renameCategory.mutate({ id, name }, { onSuccess: () => setNewCat(null), onError: (er) => notify(errMsg(er, "Não foi possível renomear."), "error") });
            } else a.createCategory.mutate(name, { onSuccess: (c) => (setNewCat(null), setCat(c.id)), onError: (er) => notify(errMsg(er, "Não foi possível criar."), "error") });
          }}
        >
          <input name="name" defaultValue={newCat?.startsWith("rename:") ? newCat.split(":").slice(2).join(":") : ""} placeholder="ex.: Capítulo 3 — Modelos" maxLength={60} className={inputCls} style={R} autoFocus aria-label="Nome da categoria" />
          <RPGButton variant="gold" type="submit">
            Salvar
          </RPGButton>
        </form>
      </Modal>
    </div>
  );
}
