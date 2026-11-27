import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Circle, ExternalLink, Headphones, KeyRound, Pause, Play, Plus, Search, Target, Trash2, X } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, StatTile, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip, fmtSec } from "@/components/integrations/IntegrationKit";
import { useLocalToast, type Notify } from "@/components/integrations/PublicApiKit";
import { usePodcastActions, usePodcasts } from "@/hooks/useAdventuresMore";
import { adventuresMore, type PodcastEpisode, type PodcastFeed, type PodcastOverview } from "@/services/adventuresMoreService";

function KeysForm({ notify }: { notify: Notify }) {
  const a = usePodcastActions();
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.keys.mutate({ key: key.trim(), secret: secret.trim() }, { onSuccess: () => notify("Chave do Podcast Index conferida e salva."), onError: (err) => notify(errMsg(err, "Não foi possível salvar a chave."), "error") });
      }}
    >
      <ol className="space-y-1 text-xs text-rpg-muted">
        <li>1. Cadastre-se de graça em api.podcastindex.org (só pede e-mail).</li>
        <li>2. A <b>API Key</b> e o <b>API Secret</b> chegam por e-mail.</li>
        <li>3. Cole os dois aqui. Ficam criptografados no servidor.</li>
      </ol>
      <a href="https://api.podcastindex.org/signup" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-rpg-blue hover:underline">
        Pedir a chave grátis <ExternalLink size={12} aria-hidden />
      </a>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-rpg-text">
          <span className="flex items-center gap-1">
            <KeyRound size={12} className="text-rpg-gold" aria-hidden /> API Key
          </span>
          <input value={key} onChange={(e) => setKey(e.target.value)} className={clsx(INPUT, "mt-1 w-full font-mono font-normal")} style={R} autoComplete="off" spellCheck={false} />
        </label>
        <label className="text-xs font-semibold text-rpg-text">
          API Secret
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={clsx(INPUT, "mt-1 w-full font-mono font-normal")} style={R} autoComplete="off" spellCheck={false} />
        </label>
      </div>
      <RPGButton type="submit" variant="gold" className="w-full justify-center text-sm" disabled={a.keys.isPending || key.trim().length < 10 || secret.trim().length < 20}>
        {a.keys.isPending ? <Spinner /> : <Headphones size={15} aria-hidden />} Conectar Podcast Index
      </RPGButton>
    </form>
  );
}

function SearchBox({ notify }: { notify: Notify }) {
  const a = usePodcastActions();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<PodcastFeed[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setRes(await adventuresMore.podcasts.search(q.trim()));
    } catch (e) {
      notify(errMsg(e, "Não foi possível buscar."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor="pod-q" className="sr-only">
          Buscar podcast
        </label>
        <input id="pod-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar podcast (ex.: ciência de dados)…" className={clsx(INPUT, "min-w-0 flex-1")} style={R} type="search" />
        <RPGButton type="submit" variant="secondary" disabled={busy || q.trim().length < 2} aria-label="Buscar">
          {busy ? <Spinner /> : <Search size={15} aria-hidden />}
        </RPGButton>
        {res && (
          <RPGButton type="button" variant="ghost" onClick={() => setRes(null)} aria-label="Fechar resultados">
            <X size={15} aria-hidden />
          </RPGButton>
        )}
      </form>
      {res && (res.length === 0 ? (
        <p className="text-[11px] text-rpg-muted">Nada encontrado.</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {res.map((f) => (
            <li key={f.feedId} className="flex items-center gap-2 border-b border-dashed border-rpg-border/60 py-1.5">
              {f.imageUrl ? <img src={f.imageUrl} alt="" className="h-10 w-10 shrink-0 object-cover" style={R} loading="lazy" /> : <span className="h-10 w-10 shrink-0 bg-rpg-panel" style={R} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-rpg-text">{f.title}</span>
                <span className="block truncate text-[10px] text-rpg-muted">
                  {f.author ?? ""}
                  {f.episodes ? ` · ${f.episodes} episódios` : ""}
                  {f.language ? ` · ${f.language}` : ""}
                </span>
              </span>
              {f.following ? (
                <span className="text-[10px] font-semibold text-rpg-green">seguindo</span>
              ) : (
                <RPGButton
                  variant="gold"
                  className="px-2 py-0.5 text-[11px]"
                  disabled={a.follow.isPending}
                  onClick={() => a.follow.mutate(f.feedId, { onSuccess: () => (notify(`Seguindo ${f.title}.`), setRes((cur) => cur?.map((x) => (x.feedId === f.feedId ? { ...x, following: true } : x)) ?? null)), onError: (e) => notify(errMsg(e, "Não foi possível seguir."), "error") })}
                >
                  <Plus size={12} aria-hidden /> Seguir
                </RPGButton>
              )}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Player({ ep, onClose, onDone, busy }: { ep: PodcastEpisode; onClose: () => void; onDone: () => void; busy: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    void ref.current?.play().catch(() => undefined);
  }, [ep.episodeId]);
  return (
    <div className="sticky bottom-2 z-10 space-y-2 border-2 border-rpg-pink/60 bg-rpg-panel p-3 shadow-rpg" style={R} aria-label="Tocando agora">
      <div className="flex items-center gap-2">
        {ep.imageUrl ? <img src={ep.imageUrl} alt="" className="h-10 w-10 shrink-0 object-cover" style={R} /> : <Headphones size={20} className="shrink-0 text-rpg-pink" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-rpg-text">{ep.title}</p>
          <p className="truncate text-[10px] text-rpg-muted">{ep.podcastTitle ?? ""}</p>
        </div>
        {!ep.listened && (
          <RPGButton variant="gold" className="text-xs" onClick={onDone} disabled={busy}>
            <CheckCircle2 size={13} aria-hidden /> Ouvi
          </RPGButton>
        )}
        <RPGButton variant="ghost" className="px-2" onClick={onClose} aria-label="Fechar player">
          <X size={14} aria-hidden />
        </RPGButton>
      </div>
      {ep.audioUrl && <audio ref={ref} src={ep.audioUrl} controls preload="none" className="w-full" style={{ colorScheme: "dark" }} onEnded={onDone} />}
    </div>
  );
}

function Goal({ o, notify }: { o: PodcastOverview; notify: Notify }) {
  const a = usePodcastActions();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(o.goal ?? 8);
  return (
    <div className="rpg-tile space-y-1.5 p-3">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-rpg-pink" aria-hidden />
        <p className="flex-1 text-xs font-semibold text-rpg-text">Meta de episódios do mês</p>
        {o.key.source === "pessoal" && (
          <button type="button" className="text-[11px] text-rpg-blue underline" onClick={() => setEdit((x) => !x)}>
            {edit ? "fechar" : o.goal ? "ajustar" : "definir"}
          </button>
        )}
      </div>
      {o.goal ? <RPGProgressBar value={Math.min(o.stats.month, o.goal)} max={o.goal} tone="pink" label={`+${o.rules.goal} XP ao bater`} valueLabel={`${o.stats.month}/${o.goal}`} /> : <p className="text-[11px] text-rpg-muted">{o.stats.month} episódio(s) neste mês.</p>}
      {edit && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            a.goal.mutate(v, { onSuccess: () => (notify("Meta salva."), setEdit(false)), onError: (err) => notify(errMsg(err, "Não foi possível salvar."), "error") });
          }}
        >
          <input type="number" min={1} max={200} value={v} onChange={(e) => setV(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className={clsx(INPUT, "w-16 py-1")} style={R} aria-label="Episódios por mês" />
          <RPGButton type="submit" variant="secondary" className="px-2 py-0.5 text-xs">
            Salvar
          </RPGButton>
        </form>
      )}
    </div>
  );
}

/**
 * Leitura em Áudio — podcasts seguidos (Podcast Index), player dentro do LifeOS
 * e episódios ouvidos contando como tempo de estudo (+XP).
 */
export function AudioReading() {
  const q = usePodcasts();
  const a = usePodcastActions();
  const o = q.data;
  const [notify, toast] = useLocalToast();
  const [playing, setPlaying] = useState<PodcastEpisode | null>(null);
  const [feed, setFeed] = useState<number | "todos">("todos");
  const listen = (ep: PodcastEpisode) =>
    a.listen.mutate(ep.episodeId, {
      onSuccess: (r) => {
        notify(r.goalHit ? `Meta do mês batida! +${r.xp} XP.` : `Episódio registrado: +${r.xp} XP.`);
        setPlaying((cur) => (cur?.episodeId === ep.episodeId ? { ...cur, listened: true } : cur));
      },
      onError: (e) => notify(errMsg(e, "Não foi possível registrar."), "error"),
    });
  const eps = o ? o.episodes.filter((e) => feed === "todos" || e.feedId === feed) : [];

  return (
    <section className="rpg-panel relative mt-4 overflow-hidden p-4" aria-label="Leitura em Áudio (podcasts)">
      <IntegrationBanner icon={<Headphones size={22} />} tone="pink" title="Leitura em Áudio" subtitle="Podcasts que você segue (Podcast Index), tocando aqui mesmo. Episódio ouvido conta como estudo." right={o?.key.source ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null} />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar os podcasts.
        </p>
      ) : !o.key.source ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <KeysForm notify={notify} />
          <div className="space-y-2 border border-dashed border-rpg-pink/50 p-3 text-xs text-rpg-muted" style={R}>
            <p className="font-rpg text-sm font-bold text-rpg-pink">Como a leitura em áudio paga</p>
            <p>
              <b className="text-rpg-text">+{o.rules.episode} XP</b> por episódio ouvido e <b className="text-rpg-text">+{o.rules.block} XP</b> a cada {o.rules.blockMinutes} min no dia (até {o.rules.maxBlocks} blocos).
            </p>
            <p>
              Meta do mês: <b className="text-rpg-text">+{o.rules.goal} XP</b>. Conquistas: Ouvinte da Taverna (10 episódios) e Bardo Erudito (24 h).
            </p>
            <p>A duração vem do próprio feed do podcast, não de um número digitado.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <div className="space-y-3">
              <SearchBox notify={notify} />
              {o.follows.length > 0 && (
                <div role="group" aria-label="Filtrar por podcast" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                  <button type="button" aria-pressed={feed === "todos"} onClick={() => setFeed("todos")} className={clsx("shrink-0 border px-2 py-0.5 text-[11px]", feed === "todos" ? "border-rpg-pink text-rpg-pink" : "border-rpg-border text-rpg-muted")} style={R}>
                    Todos
                  </button>
                  {o.follows.map((f) => (
                    <span key={f.feedId} className={clsx("flex shrink-0 items-center border text-[11px]", feed === f.feedId ? "border-rpg-pink text-rpg-pink" : "border-rpg-border text-rpg-muted")} style={R}>
                      <button type="button" aria-pressed={feed === f.feedId} onClick={() => setFeed(f.feedId)} className="max-w-[10rem] truncate px-2 py-0.5">
                        {f.title}
                      </button>
                      <button type="button" onClick={() => a.unfollow.mutate(f.feedId, { onSuccess: () => notify(`Deixou de seguir ${f.title}.`) })} className="px-1 hover:text-rpg-red" aria-label={`Deixar de seguir ${f.title}`}>
                        <Trash2 size={11} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {o.unavailable && (
                <p className="text-xs text-rpg-orange" role="status">
                  {o.unavailable}
                </p>
              )}
              {o.follows.length === 0 ? (
                <EmptyNote>Busque e siga um podcast para ver os episódios aqui.</EmptyNote>
              ) : eps.length === 0 ? (
                <EmptyNote>Nenhum episódio recente.</EmptyNote>
              ) : (
                <ul className="max-h-[28rem] overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {eps.map((e) => (
                    <li key={e.episodeId} className="flex items-center gap-2 border-b border-dashed border-rpg-border/60 py-1.5">
                      <button type="button" onClick={() => (e.listened ? a.unlisten.mutate(e.episodeId) : listen(e))} className={clsx("shrink-0", e.listened ? "text-rpg-green" : "text-rpg-muted hover:text-rpg-text")} aria-label={e.listened ? `Desmarcar ${e.title}` : `Marcar ${e.title} como ouvido`} aria-pressed={e.listened}>
                        {e.listened ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={clsx("truncate text-xs font-semibold", e.listened ? "text-rpg-muted" : "text-rpg-text")} title={e.title}>
                          {e.title}
                        </p>
                        <p className="truncate text-[10px] text-rpg-muted">
                          {e.podcastTitle ?? ""}
                          {e.durationSeconds ? ` · ${fmtSec(e.durationSeconds)}` : ""}
                          {e.publishedAt ? ` · ${new Date(e.publishedAt).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </div>
                      {e.audioUrl && (
                        <RPGButton variant="secondary" className="px-2 text-xs" onClick={() => setPlaying(playing?.episodeId === e.episodeId ? null : e)} aria-label={playing?.episodeId === e.episodeId ? "Fechar player" : `Tocar ${e.title}`}>
                          {playing?.episodeId === e.episodeId ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
                        </RPGButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
                <StatTile icon={<Headphones size={14} />} tone="text-rpg-pink" value={fmtSec(o.stats.seconds)} label="Ouvido" hint={o.stats.todaySeconds ? `${fmtSec(o.stats.todaySeconds)} hoje` : undefined} />
                <StatTile icon={<CheckCircle2 size={14} />} tone="text-rpg-green" value={o.stats.episodes} label="Episódios" />
                <StatTile icon={<Play size={14} />} tone="text-rpg-blue" value={o.stats.podcasts} label="Podcasts" />
              </div>
              <Goal o={o} notify={notify} />
              {o.recent.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-rpg-text">Ouvidos recentemente</p>
                  <ul className="space-y-0.5">
                    {o.recent.slice(0, 5).map((r) => (
                      <li key={r.episodeId} className="truncate text-[11px] text-rpg-muted" title={r.title}>
                        {r.day.split("-").reverse().slice(0, 2).join("/")} · <span className="text-rpg-text">{r.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-rpg-muted">
                +{o.rules.episode} XP por episódio e +{o.rules.block} XP a cada {o.rules.blockMinutes} min no dia. Catálogo: Podcast Index.{" "}
                {o.key.source === "pessoal" && (
                  <button type="button" className="underline hover:text-rpg-red" onClick={() => a.removeKeys.mutate(undefined, { onSuccess: () => notify("Chave do Podcast Index removida.") })}>
                    remover chave
                  </button>
                )}
              </p>
            </div>
          </div>
          {playing && <Player ep={playing} busy={a.listen.isPending} onClose={() => setPlaying(null)} onDone={() => !playing.listened && listen(playing)} />}
        </div>
      )}
      {toast}
    </section>
  );
}
