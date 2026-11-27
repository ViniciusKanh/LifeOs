import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, ExternalLink, ImageOff, Play, Sparkles, Star } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { R, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip } from "@/components/integrations/IntegrationKit";
import { KeySourceNote, PublicKeyForm, shortDay, useLocalToast } from "@/components/integrations/PublicApiKit";
import { useSky, useSkyActions } from "@/hooks/usePublicApis";

/** Moldura de vitral: arco gótico com borda de chumbo e filete dourado. */
const ARCH = { borderRadius: "50% 50% 8px 8px / 26% 26% 8px 8px" } as const;

/**
 * Vitral do Céu — a foto astronômica do dia da NASA (APOD) vira o vitral da
 * Vila. Céus dos últimos 7 dias podem entrar no álbum (+XP).
 */
export function SkyWindow() {
  const q = useSky();
  const a = useSkyActions();
  const o = q.data;
  const [notify, toast] = useLocalToast();
  const [more, setMore] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const t = o?.today ?? null;
  const collect = (date: string) =>
    a.collect.mutate(date, {
      onSuccess: (r) => notify(`Céu colecionado: +${r.xp} XP. Álbum com ${r.albumCount}.`),
      onError: (e) => notify(errMsg(e, "Não foi possível colecionar esse céu."), "error"),
    });
  const nextMilestone = o ? (Math.floor(o.albumCount / o.rules.milestoneEvery) + 1) * o.rules.milestoneEvery : 10;

  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Vitral do Céu (NASA)">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.18),transparent_60%)]" aria-hidden />
      <IntegrationBanner icon={<Sparkles size={22} />} tone="purple" title="Vitral do Céu" subtitle="A foto astronômica do dia (NASA APOD) vira o vitral da Vila." right={o ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null} />
      {q.isLoading ? (
        <div className="h-64 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível abrir o Vitral do Céu.
        </p>
      ) : (
        <div className="relative space-y-3">
          {o.unavailable && (
            <p className="border border-rpg-orange/60 bg-rpg-orange/10 px-2 py-1.5 text-[11px] text-rpg-orange" style={R} role="status">
              {o.unavailable}
            </p>
          )}
          {t ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <figure className="relative">
                <div className="overflow-hidden border-[6px] border-[#2a1d10] bg-black shadow-[0_0_0_2px_rgb(224_176_74),0_0_28px_rgba(139,92,246,0.35)]" style={ARCH}>
                  {t.thumbUrl ? (
                    <a href={t.hdUrl ?? t.url ?? t.thumbUrl} target="_blank" rel="noreferrer noopener" aria-label={`Abrir a imagem em alta resolução: ${t.title}`}>
                      <img src={t.thumbUrl} alt={t.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center text-rpg-muted">
                      <ImageOff size={28} aria-hidden />
                    </div>
                  )}
                  {t.mediaType === "video" && t.url && (
                    <a href={t.url} target="_blank" rel="noreferrer noopener" className="absolute inset-0 flex items-center justify-center" aria-label="Assistir ao vídeo do dia">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-rpg-gold bg-black/60 text-rpg-gold-light">
                        <Play size={20} aria-hidden />
                      </span>
                    </a>
                  )}
                </div>
                {/* Chumbo do vitral: duas hastes finas sobre a imagem. */}
                <span className="pointer-events-none absolute inset-y-[6px] left-1/2 w-[3px] -translate-x-1/2 bg-[#2a1d10]/70" style={{ borderRadius: 2 }} aria-hidden />
                <span className="pointer-events-none absolute inset-x-[6px] top-[42%] h-[3px] bg-[#2a1d10]/70" aria-hidden />
              </figure>
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-rpg-muted">Céu de {shortDay(t.date)}</p>
                  <h3 className="font-rpg text-lg font-bold leading-snug text-rpg-text">{t.title}</h3>
                  {t.copyright && <p className="text-[11px] text-rpg-muted">Crédito: {t.copyright}</p>}
                </div>
                <p className={clsx("text-xs leading-relaxed text-rpg-muted", !more && "line-clamp-4")} lang="en">
                  {t.explanation}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="text-[11px] text-rpg-blue underline" onClick={() => setMore((v) => !v)} aria-expanded={more}>
                    {more ? "Mostrar menos" : "Ler a descrição completa (em inglês)"}
                  </button>
                  <a href={`https://apod.nasa.gov/apod/ap${t.date.slice(2).replace(/-/g, "")}.html`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-[11px] text-rpg-blue hover:underline">
                    página da NASA <ExternalLink size={10} aria-hidden />
                  </a>
                </div>
                {t.collected ? (
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-rpg-green">
                    <CheckCircle2 size={15} aria-hidden /> No seu álbum
                  </p>
                ) : (
                  <RPGButton variant="gold" className="text-sm" disabled={a.collect.isPending} onClick={() => collect(t.date)}>
                    <Star size={15} aria-hidden /> Colecionar (+{o.rules.collect} XP)
                  </RPGButton>
                )}
                <RPGProgressBar value={o.albumCount} max={nextMilestone} tone="purple" label={`Álbum: bônus de +${o.rules.milestone} XP a cada ${o.rules.milestoneEvery} céus`} valueLabel={`${o.albumCount}/${nextMilestone}`} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-rpg-muted">O céu de hoje ainda não foi publicado pela NASA. Volte mais tarde.</p>
          )}

          {o.recent.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-rpg-text">Últimos {o.rules.windowDays} dias (dá para recuperar céus perdidos)</p>
              <ul className="grid grid-cols-4 gap-1.5 sm:max-w-3xl sm:grid-cols-7">
                {o.recent.map((r) => (
                  <li key={r.date} className="min-w-0">
                    <button
                      type="button"
                      disabled={r.collected || a.collect.isPending}
                      onClick={() => collect(r.date)}
                      className={clsx("group relative block w-full overflow-hidden border", r.collected ? "border-rpg-green/70" : "border-rpg-border hover:border-rpg-gold")}
                      style={R}
                      aria-label={r.collected ? `${r.title} (${shortDay(r.date)}) já está no álbum` : `Colecionar ${r.title} (${shortDay(r.date)})`}
                      title={r.title}
                    >
                      {r.thumbUrl ? <img src={r.thumbUrl} alt="" className={clsx("aspect-square w-full object-cover", !r.collected && "opacity-60 group-hover:opacity-100")} loading="lazy" /> : <span className="flex aspect-square w-full items-center justify-center bg-rpg-bg-2 text-rpg-muted"><ImageOff size={14} aria-hidden /></span>}
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] text-white">{shortDay(r.date)}</span>
                      {r.collected && <CheckCircle2 size={13} className="absolute right-0.5 top-0.5 text-rpg-green" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {o.album.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-rpg-text">Álbum completo ({o.albumCount})</summary>
              <ul className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {o.album.map((s) => (
                  <li key={s.date} className="min-w-0" title={`${s.title} · ${shortDay(s.date)}`}>
                    {s.thumbUrl ? <img src={s.thumbUrl} alt={s.title} className="aspect-square w-full border border-rpg-border object-cover" style={R} loading="lazy" /> : <span className="flex aspect-square w-full items-center justify-center border border-rpg-border bg-rpg-bg-2 text-[9px] text-rpg-muted" style={R}>{shortDay(s.date)}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {o.usingDemoKey ? (
            <div className="border-t border-rpg-border/50 pt-2 text-[11px] text-rpg-muted">
              Usando a chave pública DEMO_KEY da NASA (limite baixo e compartilhado).{" "}
              <button type="button" className="text-rpg-blue underline" onClick={() => setShowKey((v) => !v)} aria-expanded={showKey}>
                Usar minha chave grátis
              </button>
              {showKey && (
                <div className="mt-2">
                  <PublicKeyForm
                    provider="nasa"
                    service="NASA"
                    placeholder="chave de 40 caracteres"
                    minLength={20}
                    notify={notify}
                    link={{ href: "https://api.nasa.gov/", text: "Gerar chave em api.nasa.gov" }}
                    steps={[<>Preencha nome e e-mail em api.nasa.gov: a chave chega na hora.</>, <>Cole aqui para ter limite próprio (1.000 consultas por hora).</>]}
                  />
                </div>
              )}
            </div>
          ) : (
            <KeySourceNote provider="nasa" status={o.key} service="NASA" notify={notify} />
          )}
        </div>
      )}
      {toast}
    </section>
  );
}
