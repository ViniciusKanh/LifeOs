import { useState } from "react";
import clsx from "clsx";
import { ArrowUp, BookmarkPlus, Database, Download, ExternalLink, Flame, Heart, MessageSquare, Undo2, X, Boxes } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { EmptyNote, R, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { shortDay, type Notify } from "@/components/integrations/PublicApiKit";
import { useHfActions, useHfTrends } from "@/hooks/usePublicApis";
import type { HfHubItem, HfPaper } from "@/services/publicApisService";

const compact = (n: number) => n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function PaperRow({ p, notify, onOpenPaper }: { p: HfPaper; notify: Notify; onOpenPaper?: (id: string) => void }) {
  const a = useHfActions();
  const [open, setOpen] = useState(false);
  const decide = (decision: "salvar" | "dispensar" | "desfazer") =>
    a.decide.mutate(
      { arxivId: p.arxivId, decision },
      {
        onSuccess: (r) => notify(decision === "salvar" ? `Paper salvo na biblioteca${r.xp ? ` (+${r.xp} XP)` : ""}.` : decision === "dispensar" ? `Dispensado${r.xp ? ` (+${r.xp} XP de triagem)` : ""}.` : "Triagem desfeita."),
        onError: (e) => notify(errMsg(e, "Não foi possível registrar a triagem."), "error"),
      },
    );
  return (
    <li className={clsx("flex gap-2 border-b border-dashed border-rpg-border/60 py-2", p.decision === "dispensado" && "opacity-55")}>
      <span className="flex w-11 shrink-0 flex-col items-center justify-center border border-rpg-border bg-rpg-bg-2 py-1 text-rpg-orange" style={R} aria-label={`${p.upvotes} votos`}>
        <ArrowUp size={14} aria-hidden />
        <span className="text-[11px] font-bold tabular-nums text-rpg-text">{p.upvotes}</span>
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-left text-sm font-semibold leading-snug text-rpg-text hover:underline">
          {p.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-rpg-muted">
          <span>arXiv {p.arxivId}</span>
          {p.authors[0] && <span className="max-w-[14rem] truncate">{p.authors[0]}{p.authors.length > 1 ? " et al." : ""}</span>}
          {p.comments > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare size={10} aria-hidden /> {p.comments}
            </span>
          )}
          {p.topics.map((t) => (
            <span key={t} className="border border-rpg-green/50 bg-rpg-green/10 px-1 font-semibold text-rpg-green" style={{ borderRadius: 3 }}>
              {t}
            </span>
          ))}
        </p>
        {open && p.summary && <p className="mt-1 text-[11px] leading-relaxed text-rpg-muted">{p.summary}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {p.decision === null ? (
            <>
              <RPGButton variant="gold" className="px-2 py-0.5 text-[11px]" disabled={a.decide.isPending} onClick={() => decide("salvar")}>
                <BookmarkPlus size={12} aria-hidden /> Salvar
              </RPGButton>
              <RPGButton variant="secondary" className="px-2 py-0.5 text-[11px]" disabled={a.decide.isPending} onClick={() => decide("dispensar")}>
                <X size={12} aria-hidden /> Dispensar
              </RPGButton>
            </>
          ) : (
            <>
              <span className={clsx("text-[11px] font-semibold", p.decision === "salvo" ? "text-rpg-green" : "text-rpg-muted")}>{p.decision === "salvo" ? "Na biblioteca" : "Dispensado"}</span>
              {p.decision === "salvo" && p.paperId && onOpenPaper && (
                <button type="button" className="text-[11px] text-rpg-blue underline" onClick={() => onOpenPaper(p.paperId!)}>
                  abrir
                </button>
              )}
              <button type="button" className="inline-flex items-center gap-0.5 text-[11px] text-rpg-muted hover:text-rpg-text" onClick={() => decide("desfazer")} aria-label="Desfazer triagem">
                <Undo2 size={11} aria-hidden /> desfazer
              </button>
            </>
          )}
          <a href={`https://huggingface.co/papers/${p.arxivId}`} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-rpg-blue hover:underline">
            HF <ExternalLink size={10} aria-hidden />
          </a>
          <a href={`https://arxiv.org/abs/${p.arxivId}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-[11px] text-rpg-blue hover:underline">
            arXiv <ExternalLink size={10} aria-hidden />
          </a>
        </div>
      </div>
    </li>
  );
}

function HubItem({ kind, it }: { kind: "modelo" | "dataset"; it: HfHubItem }) {
  return (
    <a href={it.url} target="_blank" rel="noreferrer noopener" className="block border border-rpg-border bg-rpg-bg-2/60 p-2 hover:border-rpg-orange/70" style={R}>
      <p className="flex items-center gap-1 text-[11px] text-rpg-muted">
        {kind === "modelo" ? <Boxes size={11} className="text-rpg-orange" aria-hidden /> : <Database size={11} className="text-rpg-blue" aria-hidden />} {kind}
        {it.task && <span className="truncate">· {it.task}</span>}
      </p>
      <p className="truncate text-xs font-semibold text-rpg-text" title={it.id}>
        {it.id}
      </p>
      <p className="flex gap-2 text-[10px] text-rpg-muted">
        <span className="inline-flex items-center gap-0.5">
          <Download size={10} aria-hidden /> {compact(it.downloads)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Heart size={10} aria-hidden /> {compact(it.likes)}
        </span>
      </p>
    </a>
  );
}

/**
 * Papers em Alta — Daily Papers do Hugging Face, com destaque para os que batem
 * com os temas do Radar, e os modelos/datasets mais baixados desses temas.
 */
export function HfTrends({ notify, onOpenPaper }: { notify: Notify; onOpenPaper?: (id: string) => void }) {
  const q = useHfTrends();
  const o = q.data;
  const [all, setAll] = useState(false);
  const papers = o ? (all ? o.papers : o.papers.slice(0, 6)) : [];
  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Papers em Alta (Hugging Face)">
      <IntegrationBanner
        icon={<Flame size={22} />}
        tone="orange"
        title="Papers em Alta"
        subtitle="Daily Papers do Hugging Face e modelos/datasets nos temas do seu Radar."
        right={o ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null}
      />
      {q.isLoading ? (
        <div className="h-48 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar os papers em alta.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <div>
            <p className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-rpg-muted">
              <span>
                Daily Papers de <b className="text-rpg-text">{shortDay(o.day)}</b>
              </span>
              <span>
                · triagem hoje {o.triagedToday}/{o.rules.dailyCap} (+{o.rules.triage} XP cada)
              </span>
            </p>
            {o.unavailable ? (
              <p className="text-sm text-rpg-orange" role="status">
                {o.unavailable}
              </p>
            ) : papers.length === 0 ? (
              <EmptyNote>Nenhum paper em alta encontrado nos últimos dias.</EmptyNote>
            ) : (
              <ul>
                {papers.map((p) => (
                  <PaperRow key={p.arxivId} p={p} notify={notify} onOpenPaper={onOpenPaper} />
                ))}
              </ul>
            )}
            {o.papers.length > 6 && (
              <button type="button" className="mt-1 text-[11px] text-rpg-blue underline" onClick={() => setAll((v) => !v)}>
                {all ? "Mostrar menos" : `Ver todos os ${o.papers.length}`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-rpg-text">Nos seus temas</p>
            {o.topics.length === 0 ? (
              <EmptyNote>Adicione temas no Radar de Artigos para ver modelos e datasets em alta.</EmptyNote>
            ) : (
              o.hub.map((h) => (
                <div key={h.topic} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-rpg-green">{h.topic}</p>
                  {h.models.length + h.datasets.length === 0 ? (
                    <p className="text-[11px] text-rpg-muted">Nada encontrado no Hub para esse tema.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 [&>*]:min-w-0">
                      {h.models.slice(0, 2).map((m) => (
                        <HubItem key={m.id} kind="modelo" it={m} />
                      ))}
                      {h.datasets.slice(0, 2).map((d) => (
                        <HubItem key={d.id} kind="dataset" it={d} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <p className="text-[10px] text-rpg-muted">{o.triagedTotal} paper(s) triados no total. Conquista: Curador da Fronteira (20).</p>
          </div>
        </div>
      )}
    </section>
  );
}
