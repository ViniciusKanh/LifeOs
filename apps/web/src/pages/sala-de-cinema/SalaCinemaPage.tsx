import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Clapperboard, Clock, Film, Flame, ListPlus, Play, Plus, Search, Star, Target, Trash2, Tv, X } from "lucide-react";
import { RPGButton, RPGProgressBar } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { AdventureHeader, EmptyNote, INPUT, PageError, PageSkeleton, R, StatTile, errMsg } from "@/components/adventures/AdventureKit";
import { XpChip } from "@/components/integrations/IntegrationKit";
import { KeySourceNote, PublicKeyForm, useLocalToast, type Notify } from "@/components/integrations/PublicApiKit";
import { useCinema, useCinemaActions, useCinemaSearch, useCinemaTrending } from "@/hooks/usePublicApis";
import type { CinemaItem, CinemaOverview, CinemaSearchResult, CinemaStatus } from "@/services/publicApisService";

const TABS = [
  { v: "assistindo", label: "Assistindo", icon: <Play size={14} /> },
  { v: "quero_ver", label: "Quero ver", icon: <ListPlus size={14} /> },
  { v: "visto", label: "Vistos", icon: <CheckCircle2 size={14} /> },
  { v: "abandonado", label: "Abandonados", icon: <X size={14} /> },
  { v: "descobrir", label: "Descobrir", icon: <Search size={14} /> },
] as const;
type TabV = (typeof TABS)[number]["v"];

const STATUS_LABEL: Record<CinemaStatus, string> = { quero_ver: "Quero ver", assistindo: "Assistindo", visto: "Visto", abandonado: "Abandonado" };
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`);

/** Pôster com proporção fixa (2:3); sem imagem vira um cartaz com o título. */
function Poster({ url, title, className }: { url: string | null; title: string; className?: string }) {
  return url ? (
    <img src={url} alt={`Pôster de ${title}`} className={clsx("aspect-[2/3] w-full border border-rpg-border object-cover", className)} style={R} loading="lazy" />
  ) : (
    <span className={clsx("flex aspect-[2/3] w-full items-center justify-center border border-rpg-border bg-gradient-to-b from-rpg-panel-light to-rpg-bg-2 p-2 text-center font-rpg text-xs text-rpg-muted", className)} style={R}>
      {title}
    </span>
  );
}

/** Nota de 1 a 10 em 5 estrelas (meia estrela = 1 ponto). */
function Stars({ rating, size = 11 }: { rating: number | null; size?: number }) {
  if (rating == null) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-rpg-gold-light" aria-label={`Nota ${rating} de 10`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={size} className={rating >= (i + 1) * 2 ? "fill-current" : rating >= i * 2 + 1 ? "fill-current opacity-50" : "opacity-30"} aria-hidden />
      ))}
    </span>
  );
}

function ItemCard({ it, onOpen }: { it: CinemaItem; onOpen: () => void }) {
  return (
    <li className="min-w-0">
      <button type="button" onClick={onOpen} className="group block w-full text-left" aria-label={`${it.title}: ${STATUS_LABEL[it.status]}. Abrir detalhes`}>
        <div className="relative">
          <Poster url={it.posterUrl} title={it.title} className="transition-transform group-hover:-translate-y-0.5 group-hover:border-rpg-gold" />
          <span className="absolute left-1 top-1 border border-black/40 bg-black/70 px-1 text-[9px] font-bold uppercase text-white" style={{ borderRadius: 3 }}>
            {it.mediaType === "tv" ? "Série" : "Filme"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-rpg-text" title={it.title}>
          {it.title}
        </p>
        <p className="truncate text-[10px] text-rpg-muted">
          {it.year ?? "—"}
          {it.genres[0] ? ` · ${it.genres[0]}` : ""}
        </p>
        <Stars rating={it.rating} />
      </button>
    </li>
  );
}

function ItemModal({ it, onClose, notify }: { it: CinemaItem; onClose: () => void; notify: Notify }) {
  const a = useCinemaActions();
  const [status, setStatus] = useState<CinemaStatus>(it.status);
  const [rating, setRating] = useState<number | null>(it.rating);
  const [review, setReview] = useState(it.review ?? "");
  const [day, setDay] = useState(it.watchedDay ?? "");
  const [confirm, setConfirm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const save = () =>
    a.update.mutate(
      { id: it.id, status: status !== it.status ? status : undefined, rating, review: review.trim() || null, watchedDay: status === "visto" && day ? day : undefined },
      {
        onSuccess: (r) => {
          notify(r.monthGoal ? `Meta do mês batida! +${r.xp} XP.` : r.xp ? `Registrado: +${r.xp} XP.` : "Salvo.");
          onClose();
        },
        onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error"),
      },
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={it.title}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {confirm ? (
            <>
              <RPGButton variant="danger" className="text-xs" onClick={() => a.remove.mutate(it.id, { onSuccess: () => (notify("Removido da Sala de Cinema."), onClose()) })}>
                Confirmar remoção
              </RPGButton>
              <RPGButton variant="ghost" className="text-xs" onClick={() => setConfirm(false)}>
                Cancelar
              </RPGButton>
            </>
          ) : (
            <RPGButton variant="ghost" className="text-xs" onClick={() => setConfirm(true)}>
              <Trash2 size={13} aria-hidden /> Remover
            </RPGButton>
          )}
          <span className="flex-1" />
          <RPGButton variant="secondary" onClick={onClose}>
            Fechar
          </RPGButton>
          <RPGButton variant="gold" onClick={save} disabled={a.update.isPending}>
            Salvar
          </RPGButton>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div className="mx-auto w-32 sm:w-full">
          <Poster url={it.posterUrl} title={it.title} />
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-xs text-rpg-muted">
            {it.mediaType === "tv" ? "Série" : "Filme"} · {it.year ?? "—"}
            {it.runtimeMinutes ? ` · ${it.runtimeMinutes} min${it.mediaType === "tv" ? "/episódio" : ""}` : ""}
            {it.seasons ? ` · ${it.seasons} temporada(s)` : ""}
            {it.originalTitle && it.originalTitle !== it.title ? ` · ${it.originalTitle}` : ""}
          </p>
          {it.genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {it.genres.map((g) => (
                <span key={g} className="border border-rpg-pink/50 bg-rpg-pink/10 px-1.5 text-[10px] font-semibold text-rpg-pink" style={{ borderRadius: 3 }}>
                  {g}
                </span>
              ))}
            </div>
          )}
          {it.overview && <p className="text-xs leading-relaxed text-rpg-muted">{it.overview}</p>}
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-rpg-text">Situação</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_LABEL) as CinemaStatus[]).map((s) => (
                <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={clsx("border px-2.5 py-1 text-xs font-semibold", status === s ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
          {status === "visto" && (
            <label className="flex items-center gap-2 text-xs text-rpg-muted">
              Assisti em
              <input type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} className={clsx(INPUT, "py-1")} style={R} />
              <span className="text-[10px]">(vazio = hoje)</span>
            </label>
          )}
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-rpg-text">Sua nota {rating != null && <span className="text-rpg-gold-light">· {rating}/10</span>}</legend>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" aria-pressed={rating === n} aria-label={`Nota ${n}`} onClick={() => setRating(rating === n ? null : n)} className={clsx("h-8 w-8 border text-xs font-bold", rating != null && n <= rating ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-semibold text-rpg-text">
            Comentário
            <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={2000} rows={3} className={clsx(INPUT, "mt-1 w-full font-normal")} style={R} placeholder="O que achou? (só você vê)" />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function ResultCard({ r, notify }: { r: CinemaSearchResult; notify: Notify }) {
  const a = useCinemaActions();
  const add = (status: "quero_ver" | "visto") =>
    a.add.mutate(
      { mediaType: r.mediaType, tmdbId: r.tmdbId, status },
      { onSuccess: (x) => notify(status === "visto" ? `Marcado como visto${x.xp ? `: +${x.xp} XP` : ""}.` : "Adicionado à lista Quero ver."), onError: (e) => notify(errMsg(e, "Não foi possível adicionar."), "error") },
    );
  return (
    <li className="min-w-0">
      <Poster url={r.posterUrl} title={r.title} />
      <p className="mt-1 truncate text-xs font-semibold text-rpg-text" title={r.title}>
        {r.title}
      </p>
      <p className="truncate text-[10px] text-rpg-muted">
        {r.mediaType === "tv" ? "Série" : "Filme"} · {r.year ?? "—"}
        {r.voteAverage ? ` · ★ ${r.voteAverage.toLocaleString("pt-BR")}` : ""}
      </p>
      {r.mine ? (
        <p className="mt-1 text-[10px] font-semibold text-rpg-green">Na sua sala · {STATUS_LABEL[r.mine.status as CinemaStatus] ?? r.mine.status}</p>
      ) : (
        <div className="mt-1 flex gap-1">
          <RPGButton variant="gold" className="flex-1 justify-center px-1 py-0.5 text-[10px]" disabled={a.add.isPending} onClick={() => add("quero_ver")} aria-label={`Quero ver ${r.title}`}>
            <Plus size={11} aria-hidden /> Quero ver
          </RPGButton>
          <RPGButton variant="secondary" className="px-1.5 py-0.5 text-[10px]" disabled={a.add.isPending} onClick={() => add("visto")} aria-label={`Já vi ${r.title}`}>
            <CheckCircle2 size={11} aria-hidden />
          </RPGButton>
        </div>
      )}
    </li>
  );
}

function Discover({ notify }: { notify: Notify }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 400);
    return () => window.clearTimeout(t);
  }, [text]);
  const search = useCinemaSearch(q);
  const trending = useCinemaTrending(q.length < 2);
  const list = q.length >= 2 ? search : trending;
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Buscar filme ou série</span>
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar filme ou série…" className={clsx(INPUT, "w-full pl-8")} style={R} type="search" />
      </label>
      <p className="flex items-center gap-1 text-xs font-semibold text-rpg-text">{q.length >= 2 ? <>Resultados para "{q}"</> : <><Flame size={13} className="text-rpg-orange" aria-hidden /> Em alta na semana</>}</p>
      {list.isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse bg-rpg-bg-2" style={R} />
          ))}
        </div>
      ) : list.isError ? (
        <p className="text-sm text-rpg-red" role="alert">
          {errMsg(list.error, "Não foi possível buscar no TMDB.")}
        </p>
      ) : !list.data?.length ? (
        <EmptyNote>Nada encontrado.</EmptyNote>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {list.data.map((r) => (
            <ResultCard key={`${r.mediaType}-${r.tmdbId}`} r={r} notify={notify} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalEditor({ o, notify }: { o: CinemaOverview; notify: Notify }) {
  const a = useCinemaActions();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(o.goal ?? 4);
  return (
    <div className="rpg-tile col-span-2 space-y-1.5 p-3 lg:col-span-1">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-rpg-pink" aria-hidden />
        <p className="min-w-0 flex-1 text-xs font-semibold text-rpg-text">Meta do mês</p>
        <button type="button" className="text-[11px] text-rpg-blue underline" onClick={() => setEdit((x) => !x)}>
          {edit ? "fechar" : o.goal ? "ajustar" : "definir"}
        </button>
      </div>
      {o.goal ? (
        <RPGProgressBar value={Math.min(o.stats.month, o.goal)} max={o.goal} tone="pink" label={`+${o.rules.monthGoal} XP ao bater`} valueLabel={`${o.stats.month}/${o.goal}`} />
      ) : (
        <p className="text-[11px] text-rpg-muted">Sem meta. Defina quantos títulos quer ver por mês.</p>
      )}
      {edit && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            a.goal.mutate(v, { onSuccess: () => (notify("Meta do mês salva."), setEdit(false)) });
          }}
        >
          <input type="number" min={1} max={60} value={v} onChange={(e) => setV(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className={clsx(INPUT, "w-16 py-1")} style={R} aria-label="Títulos por mês" />
          <span className="text-[11px] text-rpg-muted">por mês</span>
          <RPGButton type="submit" variant="secondary" className="px-2 py-0.5 text-xs">
            Salvar
          </RPGButton>
          {o.goal && (
            <button type="button" className="text-[11px] text-rpg-muted underline" onClick={() => a.goal.mutate(null, { onSuccess: () => setEdit(false) })}>
              sem meta
            </button>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * Sala de Cinema — filmes e séries do herói: lista do que quer ver, o que está
 * assistindo, vistos com nota e comentário, meta do mês e coleção de gêneros.
 * Metadados do TMDB; registros e notas ficam só no LifeOS.
 */
export function SalaCinemaPage() {
  const q = useCinema();
  const o = q.data;
  const [notify, toast] = useLocalToast();
  const [tab, setTab] = useState<TabV>("quero_ver");
  const [openId, setOpenId] = useState<string | null>(null);
  const items = useMemo(() => (o ? o.items.filter((i) => i.status === tab) : []), [o, tab]);
  // Abre (uma vez) na aba que faz sentido: assistindo > quero ver > vistos > descobrir.
  const [tabReady, setTabReady] = useState(false);
  useEffect(() => {
    if (!o || tabReady) return;
    setTab(o.stats.watching ? "assistindo" : o.stats.queue ? "quero_ver" : o.stats.watched ? "visto" : "descobrir");
    setTabReady(true);
  }, [o, tabReady]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !o) return <PageError what="a Sala de Cinema" onRetry={() => void q.refetch()} />;
  const opened = o.items.find((i) => i.id === openId) ?? null;
  const counts: Record<TabV, number> = { assistindo: o.stats.watching, quero_ver: o.stats.queue, visto: o.stats.watched, abandonado: o.items.filter((i) => i.status === "abandonado").length, descobrir: 0 };

  return (
    <div className="space-y-3 px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <AdventureHeader icon={<Clapperboard size={34} className="text-rpg-pink" />} title="Sala de Cinema" subtitle="Filmes e séries: o que quer ver, o que está vendo e o que achou.">
        <XpChip xp={o.xpTotal} className="text-[11px]" />
      </AdventureHeader>

      {!o.key.source ? (
        <section className="rpg-panel p-4" aria-label="Conectar o TMDB">
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <PublicKeyForm
              provider="tmdb"
              service="TMDB"
              placeholder="chave da API (v3) ou token de leitura (v4)"
              minLength={20}
              notify={notify}
              link={{ href: "https://www.themoviedb.org/settings/api", text: "Pedir a chave grátis no TMDB" }}
              steps={[
                <>Crie uma conta grátis em themoviedb.org.</>,
                <>Em <b>Configurações → API</b>, peça uma chave para uso pessoal.</>,
                <>Cole a <b>chave da API</b> (v3) ou o <b>token de leitura</b> (v4).</>,
              ]}
            />
            <div className="space-y-2 border border-dashed border-rpg-pink/50 p-3 text-xs text-rpg-muted" style={R}>
              <p className="font-rpg text-sm font-bold text-rpg-pink">Como a Sala paga</p>
              <p>
                <b className="text-rpg-text">+{o.rules.watched} XP e {o.rules.coins} moeda</b> por título visto (até {o.rules.dailyCap} por dia).
              </p>
              <p>
                <b className="text-rpg-text">+{o.rules.monthGoal} XP e {o.rules.monthGoalCoins} moedas</b> ao bater a meta do mês.
              </p>
              <p>Conquistas: Crítico da Taverna (10 títulos com nota) e Explorador de Gêneros (5 gêneros).</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)] [&>*]:min-w-0">
            <StatTile icon={<CheckCircle2 size={14} />} tone="text-rpg-green" value={o.stats.month} label="Vistos no mês" />
            <StatTile icon={<Film size={14} />} tone="text-rpg-pink" value={o.stats.watched} label="Vistos no total" hint={o.stats.movieMinutes ? `${hours(o.stats.movieMinutes)} de filmes` : undefined} />
            <StatTile icon={<Star size={14} />} tone="text-rpg-gold" value={o.stats.avgRating != null ? o.stats.avgRating.toLocaleString("pt-BR") : "—"} label="Sua nota média" />
            <StatTile icon={<Clock size={14} />} tone="text-rpg-blue" value={o.stats.queue} label="Na fila" hint={o.stats.watching ? `${o.stats.watching} assistindo` : undefined} />
            <GoalEditor o={o} notify={notify} />
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className="rpg-panel min-w-0 p-4" aria-label="Sua sala">
              <div role="tablist" aria-label="Listas" className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {TABS.map((t) => (
                  <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => setTab(t.v)} className={clsx("flex min-h-[38px] shrink-0 items-center gap-1.5 border-2 px-3 text-sm font-semibold", tab === t.v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border bg-rpg-panel text-rpg-muted hover:text-rpg-text")} style={R}>
                    {t.icon} {t.label}
                    {t.v !== "descobrir" && counts[t.v] > 0 && <span className="text-[10px] opacity-80">({counts[t.v]})</span>}
                  </button>
                ))}
              </div>
              {tab === "descobrir" ? (
                <Discover notify={notify} />
              ) : items.length === 0 ? (
                <div className="space-y-2">
                  <EmptyNote>{tab === "quero_ver" ? "Sua lista está vazia." : tab === "assistindo" ? "Nada em andamento." : tab === "visto" ? "Nenhum título visto ainda." : "Nada abandonado."}</EmptyNote>
                  <div className="text-center">
                    <RPGButton variant="gold" className="text-sm" onClick={() => setTab("descobrir")}>
                      <Search size={14} aria-hidden /> Descobrir títulos
                    </RPGButton>
                  </div>
                </div>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {items.map((it) => (
                    <ItemCard key={it.id} it={it} onOpen={() => setOpenId(it.id)} />
                  ))}
                </ul>
              )}
            </section>
            <aside className="min-w-0 space-y-3" aria-label="Gêneros e conquistas">
              <section className="rpg-panel p-4">
                <h2 className="mb-2 flex items-center gap-1.5 font-rpg text-base font-bold text-rpg-text">
                  <Tv size={16} className="text-rpg-pink" aria-hidden /> Gêneros vistos
                </h2>
                {o.genres.length === 0 ? (
                  <p className="text-xs text-rpg-muted">Marque títulos como vistos para montar seu mapa de gêneros.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {o.genres.slice(0, 8).map((g) => (
                      <li key={g.name}>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-rpg-text">{g.name}</span>
                          <span className="tabular-nums text-rpg-muted">{g.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden bg-rpg-bg" style={{ borderRadius: 3 }} aria-hidden>
                          <span className="block h-full bg-rpg-pink" style={{ width: `${(g.count / o.genres[0]!.count) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <RPGProgressBar className="mt-3" value={Math.min(o.genres.length, 5)} max={5} tone="purple" label="Explorador de Gêneros" valueLabel={`${Math.min(o.genres.length, 5)}/5`} />
              </section>
            </aside>
          </div>
          <KeySourceNote provider="tmdb" status={o.key} service="TMDB" notify={notify} />
        </>
      )}
      <p className="text-[10px] text-rpg-muted">Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB. Dados de filmes e séries: The Movie Database (TMDB).</p>
      {opened && <ItemModal key={opened.id} it={opened} onClose={() => setOpenId(null)} notify={notify} />}
      {toast}
    </div>
  );
}
