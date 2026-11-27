import { useState } from "react";
import clsx from "clsx";
import { BookOpenCheck, ChevronLeft, ChevronRight, ExternalLink, Flame, ScrollText } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { EmptyNote, R, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { shortDay, type Notify } from "@/components/integrations/PublicApiKit";
import { useLore, useLoreActions } from "@/hooks/usePublicApis";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const longDay = (d: string) => `${Number(d.slice(8, 10))} de ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/**
 * Pergaminho do Dia — fatos "Neste dia" da Wikipédia para ler na Taverna. Ler
 * um guarda o pergaminho na coleção (um por dia) e mantém a sequência.
 */
export function LoreScroll({ notify }: { notify: Notify }) {
  const q = useLore();
  const a = useLoreActions();
  const o = q.data;
  const [idx, setIdx] = useState(0);
  if (q.isLoading) return <div className="rpg-panel h-64 animate-pulse" aria-busy="true" aria-label="Abrindo o pergaminho" />;
  if (q.isError || !o)
    return (
      <div className="rpg-panel p-3 text-sm text-rpg-red" role="alert">
        Não foi possível abrir o Pergaminho do Dia.
      </div>
    );
  const read = o.readToday;
  const facts = o.facts;
  const f = read ?? facts[Math.min(idx, Math.max(0, facts.length - 1))];
  // Progresso dentro do ciclo atual de 7 dias (7/7 logo depois de fechar um ciclo).
  const cycle = o.streak === 0 ? 0 : o.streak % o.rules.streakEvery || o.rules.streakEvery;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <section className="rpg-panel p-4" aria-label="Pergaminho do Dia (Wikipédia)">
        <IntegrationBanner icon={<ScrollText size={22} />} tone="gold" title="Pergaminho do Dia" subtitle={`"Neste dia" da Wikipédia${o.lang === "en" ? " (em inglês: a versão em português não respondeu)" : ""}, para ler no fim do dia.`} right={<XpChip xp={o.xpTotal} className="text-[11px]" />} />
        {!f ? (
          <EmptyNote>{o.unavailable ?? "Sem fatos para hoje."}</EmptyNote>
        ) : (
          <div className="rpg-parchment p-4 sm:p-5">
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em]">
                  {longDay(o.day)}
                  {f.year != null && ` · ${f.year}`}
                </p>
                <p className="mt-1 font-rpg text-base leading-snug sm:text-lg">{f.text}</p>
                {"extract" in f && f.extract && !read && <p className="mt-2 line-clamp-3 text-xs opacity-80">{f.extract}</p>}
              </div>
              {f.thumbUrl && <img src={f.thumbUrl} alt={f.pageTitle ?? ""} className="hidden h-24 w-24 shrink-0 border-2 border-rpg-bronze object-cover sm:block" style={{ borderRadius: 4 }} loading="lazy" />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {read ? (
                <span className="inline-flex items-center gap-1 text-sm font-bold">
                  <BookOpenCheck size={15} aria-hidden /> Guardado na coleção
                </span>
              ) : (
                <RPGButton
                  variant="gold"
                  className="text-sm"
                  disabled={a.read.isPending}
                  onClick={() =>
                    a.read.mutate(Math.min(idx, facts.length - 1), {
                      onSuccess: (r) => notify(`Pergaminho guardado: +${r.xp} XP. Sequência de ${r.streak} dia(s).`),
                      onError: (e) => notify(errMsg(e, "Não foi possível guardar o pergaminho."), "error"),
                    })
                  }
                >
                  <BookOpenCheck size={15} aria-hidden /> Li o pergaminho
                </RPGButton>
              )}
              {f.pageUrl && (
                <a href={f.pageUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2">
                  {f.pageTitle ? `Ler "${f.pageTitle}"` : "Abrir na Wikipédia"} <ExternalLink size={11} aria-hidden />
                </a>
              )}
              {!read && facts.length > 1 && (
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setIdx((i) => (i - 1 + facts.length) % facts.length)} className="flex h-8 w-8 items-center justify-center border border-rpg-bronze" style={R} aria-label="Fato anterior">
                    <ChevronLeft size={15} aria-hidden />
                  </button>
                  <span className="text-[11px] tabular-nums">
                    {Math.min(idx, facts.length - 1) + 1}/{facts.length}
                  </span>
                  <button type="button" onClick={() => setIdx((i) => (i + 1) % facts.length)} className="flex h-8 w-8 items-center justify-center border border-rpg-bronze" style={R} aria-label="Próximo fato">
                    <ChevronRight size={15} aria-hidden />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] text-rpg-muted">Texto da Wikipédia, licença CC BY-SA. Escolha o fato que mais te interessa: só um entra na coleção por dia.</p>
      </section>

      <section className="rpg-panel p-4" aria-label="Coleção de pergaminhos">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-rpg text-base font-bold text-rpg-text">Coleção · {o.total} pergaminho(s)</h3>
          <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold", o.streak > 0 ? "text-rpg-orange" : "text-rpg-muted")}>
            <Flame size={13} aria-hidden /> {o.streak} dia(s)
          </span>
        </div>
        <RPGProgressBar value={cycle} max={o.rules.streakEvery} tone="gold" label={`Bônus a cada ${o.rules.streakEvery} dias seguidos (+${o.rules.streakBonus} XP)`} valueLabel={`${cycle}/${o.rules.streakEvery} dias`} />
        {o.collection.length === 0 ? (
          <p className="mt-3 text-xs text-rpg-muted">Sua coleção começa com o primeiro pergaminho lido.</p>
        ) : (
          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {o.collection.map((c) => (
              <li key={c.day} className="flex gap-2 border-b border-dashed border-rpg-border/60 pb-1.5">
                <span className="w-11 shrink-0 text-center">
                  <span className="block text-[10px] text-rpg-muted">{shortDay(c.day)}</span>
                  <span className="block font-rpg text-xs font-bold text-rpg-gold-light">{c.year ?? "—"}</span>
                </span>
                {c.pageUrl ? (
                  <a href={c.pageUrl} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 text-[11px] leading-snug text-rpg-text hover:underline">
                    {c.text}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-rpg-text">{c.text}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-rpg-muted">Conquista: Guardião dos Pergaminhos (30 lidos).</p>
      </section>
    </div>
  );
}
