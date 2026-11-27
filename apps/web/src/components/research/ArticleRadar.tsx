import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { BookmarkPlus, Check, ChevronDown, ExternalLink, FileDown, Flame, Plus, Radar, RotateCcw, Satellite, Undo2, X } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, errMsg, fmtDay } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { useRadar, useRadarActions } from "@/hooks/usePersonalIntegrations";
import type { RadarItem } from "@/services/personalIntegrationsService";

/** Sugestões de partida (o usuário escolhe; nada é adicionado sozinho). */
const SUGGESTIONS = ["mineração de dados", "ensemble learning", "manutenção preditiva", "explainable AI", "séries temporais"];
type Tab = "novo" | "salvo" | "dispensado";

/** Varredura animada do radar (decorativa). */
function RadarDish({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-rpg-purple/70 bg-rpg-purple/10" aria-hidden>
      <span className="absolute inset-1 rounded-full border border-rpg-purple/40" />
      <span className="absolute inset-3 rounded-full border border-rpg-purple/30" />
      <span className={clsx("absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(168,85,247,0.55),transparent_35%)]", active ? "animate-spin" : "animate-[spin_6s_linear_infinite]")} />
      <Radar size={18} className="relative text-rpg-purple" />
    </span>
  );
}

function ItemCard({ it, busy, onDecide, onOpen }: { it: RadarItem; busy: boolean; onDecide: (d: "salvar" | "dispensar" | "desfazer") => void; onOpen: (paperId: string) => void }) {
  const [open, setOpen] = useState(false);
  const authors = it.authors.length > 3 ? `${it.authors.slice(0, 3).join(", ")} et al.` : it.authors.join(", ");
  return (
    <li className={clsx("rpg-tile space-y-1.5 p-3", it.status === "dispensado" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={clsx("border px-1.5 py-0.5 font-bold uppercase tracking-wide", it.source === "arxiv" ? "border-rpg-red/60 text-rpg-red" : "border-rpg-cyan/60 text-rpg-cyan")} style={R}>
          {it.source === "arxiv" ? "arXiv" : "OpenAlex"}
        </span>
        {it.topic && (
          <span className="border border-rpg-purple/50 px-1.5 py-0.5 text-rpg-purple" style={R}>
            {it.topic}
          </span>
        )}
        {it.published && <span className="text-rpg-muted">{new Date(`${it.published}T12:00:00`).toLocaleDateString("pt-BR")}</span>}
        {it.citedBy != null && it.citedBy > 0 && <span className="text-rpg-muted">· {it.citedBy} citação(ões)</span>}
      </div>
      <p className="font-semibold leading-snug text-rpg-text">{it.title}</p>
      <p className="text-[11px] text-rpg-muted">
        {authors || "Autores não informados"}
        {it.venue ? ` · ${it.venue}` : ""}
      </p>
      {it.abstract && (
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-rpg-blue" aria-expanded={open}>
            <ChevronDown size={12} className={clsx("transition-transform", open && "rotate-180")} aria-hidden /> Resumo
          </button>
          {open && <p className="mt-1 max-h-48 overflow-y-auto text-xs leading-relaxed text-rpg-muted">{it.abstract}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {it.status === "novo" && (
          <>
            <RPGButton variant="success" className="text-xs" disabled={busy} onClick={() => onDecide("salvar")}>
              {busy ? <Spinner /> : <BookmarkPlus size={13} aria-hidden />} Salvar na biblioteca
            </RPGButton>
            <RPGButton variant="ghost" className="text-xs" disabled={busy} onClick={() => onDecide("dispensar")}>
              <X size={13} aria-hidden /> Dispensar
            </RPGButton>
          </>
        )}
        {it.status === "salvo" && (
          <>
            <span className="flex items-center gap-1 text-xs font-semibold text-rpg-green">
              <Check size={13} aria-hidden /> Na biblioteca
            </span>
            {it.paperId && (
              <RPGButton variant="secondary" className="text-xs" onClick={() => onOpen(it.paperId!)}>
                Abrir
              </RPGButton>
            )}
          </>
        )}
        {it.status === "dispensado" && (
          <RPGButton variant="ghost" className="text-xs" disabled={busy} onClick={() => onDecide("desfazer")}>
            <Undo2 size={13} aria-hidden /> Desfazer
          </RPGButton>
        )}
        <span className="flex-1" />
        {it.url && (
          <a href={it.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-[11px] text-rpg-blue" aria-label={`Abrir “${it.title}” na fonte`}>
            <ExternalLink size={12} aria-hidden /> Fonte
          </a>
        )}
        {it.pdfUrl && (
          <a href={it.pdfUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-[11px] text-rpg-green" aria-label={`PDF de “${it.title}”`}>
            <FileDown size={12} aria-hidden /> PDF
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Radar de Artigos — toda semana, artigos novos nos temas do usuário (arXiv +
 * OpenAlex). Triagem completa da semana rende XP; salvar usa o fluxo da biblioteca.
 */
export function ArticleRadar({ notify, onOpenPaper }: { notify: (msg: string, tone?: "success" | "error") => void; onOpenPaper: (paperId: string) => void }) {
  const q = useRadar();
  const a = useRadarActions();
  const [tab, setTab] = useState<Tab>("novo");
  const [topic, setTopic] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const autoScanned = useRef(false);
  const o = q.data;

  // Primeira visita da semana com temas: varre sozinho (uma vez).
  useEffect(() => {
    if (o?.needsScan && !autoScanned.current && !a.scan.isPending) {
      autoScanned.current = true;
      a.scan.mutate(undefined, { onError: (e) => notify(errMsg(e, "O Radar não conseguiu varrer agora."), "error") });
    }
  }, [o?.needsScan, a.scan, notify]);

  const addTopic = (value: string) => {
    const v = value.trim();
    if (v.length < 3) return;
    a.addTopic.mutate(v, {
      onSuccess: () => {
        setTopic("");
        notify(`Tema “${v}” adicionado ao Radar.`);
      },
      onError: (e) => notify(errMsg(e, "Não foi possível adicionar o tema."), "error"),
    });
  };
  const decide = (key: string, decision: "salvar" | "dispensar" | "desfazer") => {
    setBusyKey(key);
    a.decide.mutate(
      { key, decision },
      {
        onSuccess: (r) => {
          if (r.triaged) notify(`Triagem da semana concluída! +${o?.reward.xp ?? 25} XP e ${o?.reward.coins ?? 5} moedas.`);
          else if (decision === "salvar") notify(r.xp ? `Artigo salvo na biblioteca. +${r.xp} XP` : "Artigo salvo na biblioteca.");
        },
        onError: (e) => notify(errMsg(e, "Não foi possível concluir."), "error"),
        onSettled: () => setBusyKey(null),
      },
    );
  };

  const items = o?.items.filter((i) => i.status === tab) ?? [];
  const decided = (o?.counts.salvo ?? 0) + (o?.counts.dispensado ?? 0);
  const scanning = a.scan.isPending;

  return (
    <section className="rpg-panel p-4" aria-label="Radar de Artigos">
      <IntegrationBanner
        icon={<RadarDish active={scanning} />}
        tone="purple"
        title="Radar de Artigos"
        subtitle="Toda semana, artigos novos nos seus temas (arXiv + OpenAlex). Salve com um clique."
        right={
          o && o.topics.length > 0 ? (
            <RPGButton variant="secondary" className="text-xs" disabled={scanning} onClick={() => a.scan.mutate(true, { onSuccess: (r) => notify(r.found ? `${r.found} artigo(s) novo(s) no Radar.` : "Nada novo desde a última varredura."), onError: (e) => notify(errMsg(e, "Não foi possível varrer."), "error") })}>
              {scanning ? <Spinner /> : <RotateCcw size={13} aria-hidden />} Varrer de novo
            </RPGButton>
          ) : null
        }
      />
      {q.isLoading ? (
        <div className="h-48 animate-pulse bg-rpg-bg-2" style={R} />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível abrir o Radar.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {o.topics.map((t) => (
              <span key={t.id} className="flex items-center gap-1 border border-rpg-purple/60 bg-rpg-purple/10 py-0.5 pl-2 pr-1 text-xs text-rpg-text" style={R}>
                <Satellite size={11} className="text-rpg-purple" aria-hidden /> {t.query}
                <button type="button" className="p-0.5 text-rpg-muted hover:text-rpg-red" aria-label={`Remover tema ${t.query}`} onClick={() => a.removeTopic.mutate(t.id)}>
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
            {o.topics.length < o.maxTopics && (
              <form
                className="flex min-w-[200px] flex-1 gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTopic(topic);
                }}
              >
                <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} placeholder="Novo tema (ex.: gradient boosting)" className={INPUT + " min-w-0 flex-1 py-1 text-xs"} style={R} aria-label="Novo tema do Radar" />
                <RPGButton type="submit" variant="secondary" className="text-xs" disabled={topic.trim().length < 3 || a.addTopic.isPending} aria-label="Adicionar tema">
                  <Plus size={13} aria-hidden />
                </RPGButton>
              </form>
            )}
          </div>

          {o.topics.length === 0 ? (
            <div className="space-y-2 border border-dashed border-rpg-purple/50 p-3" style={R}>
              <p className="text-sm text-rpg-text">Diga ao Radar o que vigiar. Sugestões para começar:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => addTopic(s)} className="border border-rpg-border px-2 py-0.5 text-xs text-rpg-muted hover:border-rpg-purple hover:text-rpg-purple" style={R}>
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid [&>*]:min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <RPGProgressBar value={decided} max={Math.max(1, o.counts.total)} tone="purple" label={`Triagem da semana ${fmtDay(o.week)}–${fmtDay(o.weekEnd)}`} valueLabel={o.counts.total ? `${decided}/${o.counts.total}` : "sem artigos"} />
                <div className="flex items-center gap-1.5">
                  {o.triagedThisWeek ? (
                    <span className="flex items-center gap-1 border border-rpg-green/60 bg-rpg-green/10 px-1.5 py-0.5 text-[10px] font-bold text-rpg-green" style={R}>
                      <Check size={11} aria-hidden /> Triagem concluída
                    </span>
                  ) : (
                    <XpChip xp={o.reward.xp} coins={o.reward.coins} />
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-rpg-orange" title="Semanas seguidas com triagem completa">
                    <Flame size={12} aria-hidden /> {o.weekStreak} sem.
                  </span>
                </div>
              </div>
              {o.scan && o.scan.errors.length > 0 && <p className="text-[11px] text-rpg-orange">Fontes que não responderam na última varredura: {o.scan.errors.join(", ")}.</p>}
              <div className="flex gap-1" role="tablist" aria-label="Situação dos artigos">
                {(["novo", "salvo", "dispensado"] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("border px-2.5 py-1 text-xs font-semibold", tab === t ? "border-rpg-purple bg-rpg-purple/10 text-rpg-purple" : "border-rpg-border text-rpg-muted")} style={R}>
                    {t === "novo" ? "Novos" : t === "salvo" ? "Salvos" : "Dispensados"} ({o.counts[t]})
                  </button>
                ))}
              </div>
              {scanning && !o.items.length ? (
                <p className="flex items-center gap-2 text-sm text-rpg-muted">
                  <Spinner /> Varrendo arXiv e OpenAlex…
                </p>
              ) : items.length === 0 ? (
                <EmptyNote>{tab === "novo" ? (o.counts.total ? "Nada pendente: a triagem desta semana está feita." : o.scan ? "Nenhum artigo novo nos seus temas nesta semana." : "O Radar ainda não varreu esta semana.") : tab === "salvo" ? "Nenhum artigo salvo do Radar nesta semana." : "Nenhum artigo dispensado."}</EmptyNote>
              ) : (
                <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {items.map((it) => (
                    <ItemCard key={it.key} it={it} busy={busyKey === it.key} onDecide={(d) => decide(it.key, d)} onOpen={onOpenPaper} />
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-rpg-muted">
                {o.savedTotal} artigo(s) salvos pelo Radar no total · {o.triagedWeeks} semana(s) com triagem completa. Cada artigo aparece uma única vez.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
