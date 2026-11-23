import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy, Download, Loader2, Plus, Quote, Trash2 } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { useResearchActions } from "@/hooks/useResearch";
import { REVIEW_FIELDS, researchService, type CitationFormat, type PaperDetail, type PaperMeta, type PaperOverrides, type ReviewFields } from "@/services/researchService";

const R = { borderRadius: 6 };
const inputCls = "w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold";

export const authorsLine = (authors: Array<{ name: string; family: string | null }>, max = 3) =>
  authors.length === 0 ? "Autoria não informada" : authors.length > max ? `${authors.slice(0, max).map((a) => a.family ?? a.name).join(", ")} et al.` : authors.map((a) => a.family ?? a.name).join(", ");

/* ───────────── Edição de metadados (correção só para o usuário) ───────────── */

export function MetadataEditor({ meta, onChange }: { meta: Pick<PaperMeta, "title" | "authors" | "year" | "venue" | "volume" | "issue" | "pages" | "abstract">; onChange: (o: PaperOverrides) => void }) {
  const [title, setTitle] = useState(meta.title);
  const [authors, setAuthors] = useState(meta.authors.map((a) => a.name).join("; "));
  const [year, setYear] = useState(meta.year ? String(meta.year) : "");
  const [venue, setVenue] = useState(meta.venue ?? "");
  const [volume, setVolume] = useState(meta.volume ?? "");
  const [issue, setIssue] = useState(meta.issue ?? "");
  const [pages, setPages] = useState(meta.pages ?? "");
  // Envia só o que mudou em relação ao que veio da fonte.
  useEffect(() => {
    const o: PaperOverrides = {};
    if (title.trim() && title.trim() !== meta.title) o.title = title.trim();
    const names = authors.split(";").map((s) => s.trim()).filter(Boolean);
    if (names.join("; ") !== meta.authors.map((a) => a.name).join("; ")) o.authors = names.map((n) => ({ name: n, given: n.split(/\s+/).slice(0, -1).join(" ") || null, family: n.split(/\s+/).pop() ?? null }));
    const y = Number(year);
    if (year && Number.isInteger(y) && y !== meta.year) o.year = y;
    if ((venue || null) !== meta.venue) o.venue = venue || null;
    if ((volume || null) !== meta.volume) o.volume = volume || null;
    if ((issue || null) !== meta.issue) o.issue = issue || null;
    if ((pages || null) !== meta.pages) o.pages = pages || null;
    onChange(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, authors, year, venue, volume, issue, pages]);
  return (
    <div className="grid gap-2 sm:grid-cols-6">
      <label className="text-[11px] text-rpg-muted sm:col-span-6">
        Título
        <input className={clsx(inputCls, "mt-0.5")} style={R} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
      </label>
      <label className="text-[11px] text-rpg-muted sm:col-span-6">
        Autores (separados por “;”)
        <input className={clsx(inputCls, "mt-0.5")} style={R} value={authors} onChange={(e) => setAuthors(e.target.value)} />
      </label>
      <label className="text-[11px] text-rpg-muted sm:col-span-3">
        Periódico / evento
        <input className={clsx(inputCls, "mt-0.5")} style={R} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={300} />
      </label>
      <label className="text-[11px] text-rpg-muted">
        Ano
        <input className={clsx(inputCls, "mt-0.5")} style={R} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" />
      </label>
      <label className="text-[11px] text-rpg-muted">
        Vol./Nº
        <span className="mt-0.5 flex gap-1">
          <input className={inputCls} style={R} value={volume} onChange={(e) => setVolume(e.target.value)} maxLength={30} aria-label="Volume" />
          <input className={inputCls} style={R} value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={30} aria-label="Número" />
        </span>
      </label>
      <label className="text-[11px] text-rpg-muted">
        Páginas
        <input className={clsx(inputCls, "mt-0.5")} style={R} value={pages} onChange={(e) => setPages(e.target.value)} maxLength={30} />
      </label>
    </div>
  );
}

/* ───────────── Fichamento com autosave ───────────── */

export function ReviewEditor({ detail }: { detail: PaperDetail }) {
  const a = useResearchActions();
  const id = detail.paper.id;
  const [fields, setFields] = useState<ReviewFields>(detail.review.fields);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(detail.review.updatedAt ? "saved" : "idle");
  const dirty = useRef(false);
  useEffect(() => {
    setFields(detail.review.fields);
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (!dirty.current) return;
    setState("saving");
    const h = window.setTimeout(() => {
      a.review.mutate({ id, fields }, { onSuccess: () => setState("saved"), onError: () => setState("error") });
    }, 1200);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, id]);
  const [quote, setQuote] = useState({ text: "", page: "", comment: "" });
  return (
    <div className="space-y-3">
      <p className={clsx("flex items-center justify-end gap-1 text-[11px]", state === "error" ? "text-rpg-red" : "text-rpg-green")} aria-live="polite">
        {state === "saving" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : state === "saved" ? <Check size={12} aria-hidden /> : null}
        {state === "saving" ? "Salvando…" : state === "saved" ? "Salvo automaticamente" : state === "error" ? "Não foi possível salvar — continue editando para tentar de novo" : "As alterações são salvas sozinhas"}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {REVIEW_FIELDS.map(([k, label]) => (
          <label key={k} className="block text-[11px] font-semibold text-rpg-muted">
            {label}
            <textarea
              value={fields[k] ?? ""}
              rows={3}
              maxLength={8000}
              onChange={(e) => {
                dirty.current = true;
                setFields((f) => ({ ...f, [k]: e.target.value }));
              }}
              className={clsx(inputCls, "mt-0.5 font-normal")}
              style={R}
            />
          </label>
        ))}
      </div>
      <div className="space-y-2 border-t border-rpg-border/60 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-rpg-text">
          <Quote size={15} className="text-rpg-purple" aria-hidden /> Citações-chave
        </p>
        <p className="text-[10px] text-rpg-muted">Só trechos que você copiou do artigo — o LifeOS nunca gera citações literais.</p>
        {detail.quotes.length === 0 && <p className="text-xs text-rpg-muted">Nenhuma citação registrada.</p>}
        <ul className="space-y-1.5">
          {detail.quotes.map((q) => (
            <li key={q.id} className="rpg-tile flex items-start gap-2 p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm italic text-rpg-text">“{q.text}”{q.page ? <span className="not-italic text-rpg-muted"> (p. {q.page})</span> : null}</p>
                {q.comment && <p className="text-xs text-rpg-muted">{q.comment}</p>}
              </div>
              <button type="button" onClick={() => a.removeQuote.mutate(q.id)} className="text-rpg-muted hover:text-rpg-red" aria-label="Remover citação">
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-1.5 sm:grid-cols-[1fr_80px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!quote.text.trim()) return;
            a.addQuote.mutate({ id, text: quote.text.trim(), page: quote.page.trim() || null, comment: quote.comment.trim() || null }, { onSuccess: () => setQuote({ text: "", page: "", comment: "" }) });
          }}
        >
          <textarea className={inputCls} style={R} rows={2} placeholder="Trecho do artigo" value={quote.text} onChange={(e) => setQuote((q) => ({ ...q, text: e.target.value }))} aria-label="Trecho do artigo" maxLength={3000} />
          <input className={inputCls} style={R} placeholder="Página" value={quote.page} onChange={(e) => setQuote((q) => ({ ...q, page: e.target.value }))} aria-label="Página" maxLength={20} />
          <input className={clsx(inputCls, "sm:col-span-2")} style={R} placeholder="Comentário (opcional)" value={quote.comment} onChange={(e) => setQuote((q) => ({ ...q, comment: e.target.value }))} aria-label="Comentário" maxLength={2000} />
          <RPGButton variant="secondary" type="submit" className="text-xs sm:col-span-2" disabled={!quote.text.trim() || a.addQuote.isPending}>
            <Plus size={13} aria-hidden /> Adicionar citação
          </RPGButton>
        </form>
      </div>
    </div>
  );
}

/* ───────────── Exportação de referências ───────────── */

const FORMATS: Array<[CitationFormat, string, string]> = [
  ["abnt", "ABNT NBR 6023", "txt"],
  ["apa", "APA 7", "txt"],
  ["bibtex", "BibTeX", "bib"],
  ["ris", "RIS", "ris"],
];

export function ExportPanel({ ids, label }: { ids: string[] | null; label: string }) {
  const [format, setFormat] = useState<CitationFormat>("abnt");
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    researchService
      .exportRefs(format, ids)
      .then((r) => alive && setText(r.text))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Não foi possível gerar."))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [format, ids]);
  const ext = FORMATS.find((f) => f[0] === format)![2];
  return (
    <div className="space-y-2">
      <p className="text-xs text-rpg-muted">{label}</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Formato">
        {FORMATS.map(([f, l]) => (
          <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)} className={clsx("border px-2.5 py-1 text-xs font-semibold", format === f ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            {l}
          </button>
        ))}
      </div>
      {busy ? <div className="h-28 animate-pulse rounded bg-rpg-bg-2" /> : error ? <p className="text-sm text-rpg-red">{error}</p> : <textarea readOnly value={text ?? ""} rows={8} className={clsx(inputCls, "font-mono text-xs")} style={R} aria-label="Referências geradas" />}
      <p className="text-[10px] text-rpg-muted">Campos que as bases não informam ficam de fora (nada é inventado). Em ABNT/APA, aplique o destaque do periódico no seu editor de texto.</p>
      <div className="flex gap-2">
        <RPGButton
          variant="secondary"
          className="text-xs"
          disabled={!text}
          onClick={() => {
            void navigator.clipboard.writeText(text ?? "").then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copiado" : "Copiar"}
        </RPGButton>
        <RPGButton
          variant="ghost"
          className="text-xs"
          disabled={!text}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text ?? ""], { type: "text/plain;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `referencias-${format}.${ext}`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={13} aria-hidden /> Baixar .{ext}
        </RPGButton>
      </div>
    </div>
  );
}
