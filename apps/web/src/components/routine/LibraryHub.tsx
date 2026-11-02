import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookMarked, BookOpen, CalendarDays, Clock, Flame, GraduationCap, Heart, Hourglass, Library, Map as MapIcon, Pencil, Plus, Sparkles, Target, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection, MODULE_ART } from "@/components/rpg-modules/ModuleKit";
import { useGoals } from "@/hooks/useGoals";
import { useRoutineActions } from "@/hooks/useRoutineHubs";
import type { BookStatus } from "@/types";
import type { LibBook, LibSession, LibraryHub, Trail } from "@/services/routineHubService";
import { FIELD, HeatGrid, ProgressRing, R, fmtDay, nf } from "./RoutineShared";

const ART = `${MODULE_ART}/library`;
const STATUSES: BookStatus[] = ["Quero Ler", "Lendo", "Pausado", "Concluído", "Abandonado"];
const pctOf = (b: { currentPage: number; totalPages: number | null }) => (b.totalPages ? Math.min(100, Math.round((b.currentPage / b.totalPages) * 100)) : null);
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function LibraryIndicators({ hub }: { hub: LibraryHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <IndicatorCard icon={<Library size={22} />} label="Livros" value={i.total} hint="cadastrados" />
      <IndicatorCard icon={<BookOpen size={22} />} label="Lendo agora" value={i.reading} tone="blue" />
      <IndicatorCard icon={<BookMarked size={22} />} label="Concluídos" value={i.completed} hint={`${i.completedYear} neste ano`} tone="green" />
      <IndicatorCard icon={<Sparkles size={22} />} label="Páginas lidas" value={nf(i.pagesRead)} hint={`${nf(i.uniquePages)} inéditas`} tone="purple" title="Lidas = soma das sessões (inclui releitura). Inéditas = posição atual de cada livro." />
      <IndicatorCard icon={<Flame size={22} />} label="Sequência" value={`${i.streak} dias`} hint={`melhor: ${i.bestStreak}`} tone="red" />
      <IndicatorCard icon={<Sparkles size={22} />} label="XP literário" value={`+${nf(i.xp)}`} hint="hábitos e conquistas de leitura" tone="purple" />
      <IndicatorCard icon={<Target size={22} />} label="Meta anual" value={i.yearBooks ? `${i.yearBooks.done}/${i.yearBooks.target}` : "—"} hint={i.yearBooks ? `${i.yearBooks.pct}%` : "sem meta definida"} tone="orange" />
      <IndicatorCard icon={<Clock size={22} />} label="Tempo de leitura" value={`${Math.round(i.minutesYear / 60)}h`} hint={`neste ano · ${Math.round(i.minutesTotal / 60)}h total`} tone="blue" />
    </div>
  );
}

function Cover({ b, className }: { b: { coverUrl: string | null; title: string }; className?: string }) {
  return b.coverUrl ? (
    <img src={b.coverUrl} alt={`Capa de ${b.title}`} loading="lazy" className={clsx("border-2 border-rpg-gold/60 object-cover", className)} style={R} />
  ) : (
    <span className={clsx("flex items-center justify-center border-2 border-rpg-border bg-rpg-bg-2 p-1 text-center text-[10px] text-rpg-muted", className)} style={R}>
      {b.title}
    </span>
  );
}

/** Livro em destaque: o “Continuar lendo” abre o registro de sessão (não há leitura do conteúdo aqui). */
export function FeaturedBook({ hub, onSession }: { hub: LibraryHub; onSession: (bookId: string) => void }) {
  const f = hub.featured;
  if (!f) return <KitSection title="Leitura atual" icon={<BookOpen size={16} />}><p className="text-sm text-rpg-muted">Nenhum livro com status “Lendo”. Escolha um na estante.</p></KitSection>;
  const pct = pctOf(f);
  return (
    <section className="rpg-panel rpg-panel-legendary flex gap-3 p-3" aria-label="Livro em destaque">
      <Cover b={f} className="h-40 w-28 shrink-0 sm:h-48 sm:w-32" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <RPGBadge tone="green" className="self-start">Lendo agora</RPGBadge>
        <Link to={`/biblioteca/${f.id}`} className="font-rpg text-xl font-bold leading-tight text-rpg-text hover:underline">
          {f.title}
        </Link>
        {f.author && <p className="text-sm text-rpg-muted">{f.author}</p>}
        <RPGProgressBar label="Progresso" value={f.currentPage} max={Math.max(1, f.totalPages ?? f.currentPage)} valueLabel={`Página ${f.currentPage}${f.totalPages ? ` de ${f.totalPages} · ${pct}%` : ""}`} tone="purple" />
        <p className="text-[11px] text-rpg-muted">
          {f.lastSession ? `Última sessão: ${fmtDay(f.lastSession.day)} · ${f.lastSession.pages} pág.${f.lastSession.minutes ? ` · ${f.lastSession.minutes} min` : ""}` : "Nenhuma sessão registrada ainda."}
          {hub.desk.dailyGoal ? ` · Meta do dia: ${hub.desk.dailyGoal.target} pág.` : ""}
        </p>
        <RPGButton variant="primary" className="mt-auto self-start" onClick={() => onSession(f.id)}>
          <BookOpen size={15} aria-hidden /> Continuar lendo
        </RPGButton>
      </div>
    </section>
  );
}

/** Mesa do Leitor: ritual diário (meta, tempo, sequência) e sessões recentes corrigíveis. */
export function ReaderDesk({ hub, onSession, onEdit }: { hub: LibraryHub; onSession: () => void; onEdit: (s: LibSession) => void }) {
  const d = hub.desk;
  const target = d.dailyGoal?.target ?? 0;
  return (
    <KitSection title="Mesa do Leitor" icon={<Hourglass size={16} />} tone="gold" action={<RPGButton variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={onSession}><Plus size={13} aria-hidden /> Registrar sessão</RPGButton>}>
      <div className="flex flex-wrap items-center gap-3">
        <ProgressRing value={d.pagesToday} max={Math.max(1, target || d.pagesToday || 1)} label="Páginas hoje" tone="gold">
          <span className="font-rpg text-2xl font-bold text-rpg-gold-light tabular-nums">{d.streak}</span>
          <span className="font-pixel text-[9px] uppercase text-rpg-muted">dias seguidos</span>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-1.5">
          {d.dailyGoal ? (
            <RPGProgressBar label={`Meta de hoje (${d.dailyGoal.title})`} value={d.pagesToday} max={Math.max(1, target)} valueLabel={`${d.pagesToday}/${target} páginas`} tone={d.pagesToday >= target ? "green" : "purple"} />
          ) : (
            <p className="text-xs text-rpg-muted">
              Hoje: {d.pagesToday} página(s). Para uma meta diária, crie em <Link to="/metas" className="text-rpg-blue hover:underline">Metas</Link> uma meta numérica “páginas por dia”.
            </p>
          )}
          <p className="text-xs text-rpg-text">
            <Clock size={12} className="inline" aria-hidden /> {d.minutesToday} min hoje · {d.readDays30} dia(s) com leitura em 30 dias
          </p>
        </div>
        <img src={`${ART}/chest.webp`} alt="" aria-hidden className="pixelated hidden h-14 w-auto sm:block" />
      </div>
      <p className="mt-3 font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Sessões recentes</p>
      {hub.recentSessions.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma sessão ainda.</p>
      ) : (
        <ul className="mt-1 divide-y divide-rpg-border/50">
          {hub.recentSessions.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-14 shrink-0 text-[11px] text-rpg-muted">{fmtDay(s.day)}</span>
              <span className="min-w-0 flex-1 truncate text-rpg-text">{s.title}</span>
              <span className="shrink-0 text-[11px] text-rpg-muted tabular-nums">
                {s.startPage != null && s.endPage != null ? `p. ${s.startPage}–${s.endPage}` : `${s.pages} pág.`}
                {s.minutes ? ` · ${s.minutes}min` : ""}
              </span>
              <button type="button" onClick={() => onEdit(s)} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-text" aria-label={`Corrigir sessão de ${s.title}`}>
                <Pencil size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/** Registrar ou corrigir sessão (posição validada no servidor contra o total do livro). */
export function SessionModal({ open, hub, bookId, session, onClose, onToast }: { open: boolean; hub: LibraryHub; bookId: string | null; session: LibSession | null; onClose: () => void; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { addSession, updateSession, deleteSession } = useRoutineActions();
  const [f, setF] = useState({ bookId: "", date: todayLocal(), minutes: "", start: "", end: "", pages: "", note: "", learning: "" });
  useEffect(() => {
    if (!open) return;
    if (session) setF({ bookId: session.bookId, date: session.day, minutes: session.minutes?.toString() ?? "", start: session.startPage?.toString() ?? "", end: session.endPage?.toString() ?? "", pages: session.pages.toString(), note: session.note ?? "", learning: session.learning ?? "" });
    else {
      const b = hub.books.find((x) => x.id === bookId) ?? hub.featured ?? null;
      setF({ bookId: b?.id ?? "", date: todayLocal(), minutes: "", start: b ? String(b.currentPage) : "", end: "", pages: "", note: "", learning: "" });
    }
  }, [open, session, bookId, hub.books, hub.featured]);
  const book = hub.books.find((b) => b.id === f.bookId);
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
  const payload = { date: f.date, durationMinutes: num(f.minutes), startPage: num(f.start), endPage: num(f.end), pages: num(f.pages), note: f.note.trim() || null, learning: f.learning.trim() || null };
  const derived = payload.startPage != null && payload.endPage != null ? payload.endPage - payload.startPage : null;
  const tooFar = book?.totalPages != null && payload.endPage != null && payload.endPage > book.totalPages;
  const submit = () => {
    const done = (msg: string) => ({ onSuccess: () => (onToast(msg), onClose()), onError: (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível salvar.", "error") });
    if (session) updateSession.mutate({ id: session.id, input: payload }, done("Sessão corrigida — progresso recalculado."));
    else addSession.mutate({ bookId: f.bookId, ...payload }, done("Sessão registrada."));
  };
  const busy = addSession.isPending || updateSession.isPending || deleteSession.isPending;
  return (
    <Modal open={open} onClose={onClose} title={session ? "Corrigir sessão" : "Registrar sessão de leitura"} size="sm">
      <div className="space-y-2.5 text-sm">
        <label className="block">
          <span className="text-xs text-rpg-muted">Livro</span>
          <select className={FIELD} style={R} value={f.bookId} disabled={!!session} onChange={(e) => setF({ ...f, bookId: e.target.value, start: String(hub.books.find((b) => b.id === e.target.value)?.currentPage ?? "") })}>
            <option value="">Escolha…</option>
            {hub.books.filter((b) => b.status !== "Concluído" || b.id === f.bookId).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-rpg-muted">Data</span>
            <input type="date" className={FIELD} style={R} value={f.date} max={todayLocal()} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-rpg-muted">Duração (min)</span>
            <input type="number" min={0} className={FIELD} style={R} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-rpg-muted">Página inicial</span>
            <input type="number" min={0} className={FIELD} style={R} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-rpg-muted">Página final{book?.totalPages ? ` (de ${book.totalPages})` : ""}</span>
            <input type="number" min={0} className={FIELD} style={R} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-invalid={tooFar} />
          </label>
        </div>
        {derived == null && (
          <label className="block">
            <span className="text-xs text-rpg-muted">Ou quantidade de páginas</span>
            <input type="number" min={0} className={FIELD} style={R} value={f.pages} onChange={(e) => setF({ ...f, pages: e.target.value })} />
          </label>
        )}
        {derived != null && <p className="text-xs text-rpg-text">{derived} página(s) nesta sessão. Reler trechos já lidos não avança a posição do livro.</p>}
        {tooFar && <p className="text-xs text-rpg-red">A página final passa do total do livro.</p>}
        <label className="block">
          <span className="text-xs text-rpg-muted">Observação (opcional)</span>
          <input className={FIELD} style={R} maxLength={600} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs text-rpg-muted">Aprendizado (opcional — pode virar flashcard)</span>
          <textarea className={clsx(FIELD, "min-h-[64px]")} style={R} maxLength={600} value={f.learning} onChange={(e) => setF({ ...f, learning: e.target.value })} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {session && (
            <RPGButton
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                if (!confirm("Excluir esta sessão? O progresso do livro será recalculado.")) return;
                deleteSession.mutate(session.id, { onSuccess: () => (onToast("Sessão excluída — progresso recalculado."), onClose()), onError: () => onToast("Não foi possível excluir.", "error") });
              }}
            >
              <Trash2 size={13} aria-hidden /> Excluir
            </RPGButton>
          )}
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="gold" onClick={submit} disabled={busy || !f.bookId || tooFar || (!derived && !payload.pages && !payload.durationMinutes)}>
            Salvar
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}

type Sort = "recent" | "progress" | "title" | "lastRead";
/** Estante: capa, status (alterável, com histórico preservado), progresso, favoritos, filtros e ordenação. */
export function Bookshelf({ hub, onStatus, onSession }: { hub: LibraryHub; onStatus: (b: LibBook, status: BookStatus) => void; onSession: (bookId: string) => void }) {
  const { favorite } = useRoutineActions();
  const [status, setStatus] = useState<BookStatus | "all" | "fav">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return hub.books
      .filter((b) => (status === "all" || (status === "fav" ? b.favorite : b.status === status)) && (!t || `${b.title} ${b.author ?? ""} ${b.categories ?? ""}`.toLowerCase().includes(t)))
      .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "progress" ? (pctOf(b) ?? 0) - (pctOf(a) ?? 0) : sort === "lastRead" ? (b.lastReadDay ?? "").localeCompare(a.lastReadDay ?? "") : b.updatedAt.localeCompare(a.updatedAt)));
  }, [hub.books, status, q, sort]);
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(["all", ...STATUSES, "fav"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={clsx("min-h-[36px] shrink-0 border-2 px-3 text-xs", status === s ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
              {s === "all" ? "Todos" : s === "fav" ? "★ Favoritos" : s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <input aria-label="Buscar na estante" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, autor ou assunto…" className={clsx(FIELD, "lg:w-56")} style={R} />
          <select aria-label="Ordenar" className={clsx(FIELD, "w-40")} style={R} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Mais recentes</option>
            <option value="lastRead">Última leitura</option>
            <option value="progress">Progresso</option>
            <option value="title">Título</option>
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="rpg-panel py-8 text-center text-sm text-rpg-muted">Nenhum livro com esses filtros.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((b) => {
            const pct = pctOf(b);
            return (
              <li key={b.id} className="rpg-panel flex gap-2.5 p-2.5">
                <Link to={`/biblioteca/${b.id}`} className="shrink-0">
                  <Cover b={b} className="h-28 w-20" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start gap-1">
                    <Link to={`/biblioteca/${b.id}`} className="min-w-0 flex-1 truncate font-semibold text-rpg-text hover:underline">
                      {b.title}
                    </Link>
                    <button type="button" onClick={() => favorite.mutate({ id: b.id, favorite: !b.favorite })} aria-pressed={b.favorite} aria-label={b.favorite ? "Remover dos favoritos" : "Favoritar"} className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <Heart size={14} className={b.favorite ? "fill-rpg-pink text-rpg-pink" : "text-rpg-muted"} aria-hidden />
                    </button>
                  </div>
                  <p className="truncate text-[11px] text-rpg-muted">{b.author ?? "Autor desconhecido"}{b.categories ? ` · ${b.categories.split(",")[0]}` : ""}</p>
                  <RPGProgressBar label={b.title} showLabel={false} value={b.currentPage} max={Math.max(1, b.totalPages ?? b.currentPage)} tone={b.status === "Concluído" ? "green" : "purple"} />
                  <p className="text-[10px] text-rpg-muted">
                    {b.currentPage}
                    {b.totalPages ? `/${b.totalPages} pág. · ${pct}%` : " pág."} · {b.lastReadDay ? `lido ${fmtDay(b.lastReadDay)}` : "sem sessões"}
                  </p>
                  <div className="mt-auto flex gap-1.5">
                    <select aria-label={`Status de ${b.title}`} className="min-h-[34px] flex-1 border border-rpg-border bg-rpg-bg-2 px-1.5 text-xs text-rpg-text" style={R} value={b.status} onChange={(e) => onStatus(b, e.target.value as BookStatus)}>
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {b.status !== "Concluído" && (
                      <RPGButton variant="secondary" className="min-h-[34px] px-2 text-xs" onClick={() => onSession(b.id)} aria-label={`Registrar sessão de ${b.title}`}>
                        <Plus size={12} aria-hidden />
                      </RPGButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Trilhas de leitura — só com livros cadastrados por você; pode ser vinculada a uma meta. */
export function TrailsPanel({ hub, onToast }: { hub: LibraryHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { saveTrail, deleteTrail } = useRoutineActions();
  const { goals } = useGoals();
  const [editing, setEditing] = useState<Partial<Trail> | null>(null);
  const [bookIds, setBookIds] = useState<string[]>([]);
  const open = (t: Partial<Trail>) => {
    setEditing(t);
    setBookIds(t.books?.map((b) => b.id) ?? []);
  };
  const save = () => {
    if (!editing?.name?.trim()) return;
    saveTrail.mutate(
      { id: editing.id, input: { name: editing.name.trim(), theme: editing.theme ?? null, objective: editing.objective ?? null, goalId: editing.goalId || null, bookIds } },
      { onSuccess: () => (onToast("Trilha salva."), setEditing(null)), onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível salvar.", "error") },
    );
  };
  return (
    <div className="space-y-3">
      <KitSection title="Trilhas de leitura" icon={<MapIcon size={16} />} tone="gold" action={<RPGButton variant="gold" className="min-h-[36px] px-2 text-xs" onClick={() => open({ name: "" })}><Plus size={13} aria-hidden /> Nova trilha</RPGButton>}>
        {hub.trails.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-rpg-muted">Monte uma jornada com livros da sua estante. Modelos para começar:</p>
            <div className="flex flex-wrap gap-1.5">
              {hub.trailTemplates.map((t) => (
                <RPGButton key={t.name} variant="secondary" className="min-h-[36px] px-2 text-xs" onClick={() => open({ name: t.name, theme: t.theme, objective: t.objective })}>
                  {t.name}
                </RPGButton>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {hub.trails.map((t) => (
              <li key={t.id} className="border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-rpg font-bold text-rpg-text">{t.name}</p>
                  {t.theme && <RPGBadge tone="blue">{t.theme}</RPGBadge>}
                  {t.goalTitle && <RPGBadge tone="green">Meta: {t.goalTitle}</RPGBadge>}
                  <span className="ml-auto flex gap-1">
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-muted" aria-label={`Editar trilha ${t.name}`} onClick={() => open(t)}>
                      <Pencil size={13} aria-hidden />
                    </button>
                    <button type="button" className="flex h-9 w-9 items-center justify-center text-rpg-red" aria-label={`Excluir trilha ${t.name}`} onClick={() => confirm(`Excluir a trilha "${t.name}"? Os livros continuam na estante.`) && deleteTrail.mutate(t.id)}>
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </span>
                </div>
                {t.objective && <p className="text-[11px] text-rpg-muted">{t.objective}</p>}
                <RPGProgressBar className="mt-1" label="Trilha" value={t.done} max={Math.max(1, t.books.length)} valueLabel={`${t.done}/${t.books.length} livros · ${t.pct}%`} tone="gold" />
                <ol className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {t.books.map((b, i) => (
                    <li key={b.id} className="flex shrink-0 items-center gap-1.5">
                      <Link to={`/biblioteca/${b.id}`} className={clsx("flex w-32 items-center gap-1.5 border-2 p-1.5", b.status === "Concluído" ? "border-rpg-green/70" : b.id === t.nextBookId ? "border-rpg-gold" : "border-rpg-border")} style={R}>
                        <Cover b={b} className="h-10 w-7 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-pixel text-[9px] uppercase text-rpg-gold">{b.status === "Concluído" ? "Concluído" : b.id === t.nextBookId ? "Agora" : `Etapa ${i + 1}`}</span>
                          <span className="line-clamp-2 text-[11px] text-rpg-text">{b.title}</span>
                        </span>
                      </Link>
                      {i < t.books.length - 1 && <span className="text-rpg-muted" aria-hidden>›</span>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </KitSection>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar trilha" : "Nova trilha"} size="sm">
        {editing && (
          <div className="space-y-2.5 text-sm">
            <input aria-label="Nome da trilha" className={FIELD} style={R} placeholder="Nome" maxLength={80} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Tema" className={FIELD} style={R} placeholder="Tema" maxLength={40} value={editing.theme ?? ""} onChange={(e) => setEditing({ ...editing, theme: e.target.value })} />
              <select aria-label="Meta vinculada" className={FIELD} style={R} value={editing.goalId ?? ""} onChange={(e) => setEditing({ ...editing, goalId: e.target.value || null })}>
                <option value="">Sem meta</option>
                {goals.filter((g) => g.status === "active").map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <input aria-label="Objetivo" className={FIELD} style={R} placeholder="Objetivo" maxLength={240} value={editing.objective ?? ""} onChange={(e) => setEditing({ ...editing, objective: e.target.value })} />
            <p className="text-xs text-rpg-muted">Livros da trilha (na ordem em que forem marcados):</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {hub.books.map((b) => {
                const pos = bookIds.indexOf(b.id);
                return (
                  <li key={b.id}>
                    <label className="flex min-h-[36px] items-center gap-2 text-sm">
                      <input type="checkbox" checked={pos >= 0} onChange={(e) => setBookIds(e.target.checked ? [...bookIds, b.id] : bookIds.filter((x) => x !== b.id))} />
                      <span className="min-w-0 flex-1 truncate text-rpg-text">{b.title}</span>
                      {pos >= 0 && <span className="font-pixel text-[10px] text-rpg-gold">#{pos + 1}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            {hub.books.length === 0 && <p className="text-xs text-rpg-muted">Cadastre livros na estante primeiro.</p>}
            <div className="flex justify-end gap-2">
              <RPGButton variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </RPGButton>
              <RPGButton variant="gold" onClick={save} disabled={saveTrail.isPending || !editing.name?.trim()}>
                Salvar trilha
              </RPGButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Calendário de leitura + aprendizados → flashcards (o usuário revisa antes de criar). */
export function ReadingCalendar({ hub }: { hub: LibraryHub }) {
  const past = hub.calendar.filter((c) => !c.future);
  return (
    <KitSection title="Calendário de leitura" icon={<CalendarDays size={16} />} action={<span className="font-pixel text-[10px] text-rpg-green">{past.filter((c) => c.pages > 0 || c.minutes > 0).length}/{past.length} dias</span>}>
      <HeatGrid cells={hub.calendar} level={(c) => (c.pages >= 20 ? 3 : c.pages >= 5 || c.minutes >= 15 ? 2 : c.pages > 0 || c.minutes > 0 ? 1 : 0)} title={(c) => `${fmtDay(c.day)}: ${c.pages} página(s), ${c.minutes} min`} />
    </KitSection>
  );
}

export function LearningsPanel({ hub, onToast }: { hub: LibraryHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { sessionCard } = useRoutineActions();
  const [card, setCard] = useState<{ sessionId: string; front: string; back: string } | null>(null);
  return (
    <KitSection title="Aprendizados → Grimório" icon={<GraduationCap size={16} />}>
      {hub.learnings.length === 0 ? (
        <p className="text-sm text-rpg-muted">Registre um aprendizado ao salvar uma sessão. Ele pode virar um flashcard no Grimório.</p>
      ) : (
        <ul className="space-y-1.5">
          {hub.learnings.map((l) => (
            <li key={l.sessionId} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2 text-sm" style={R}>
              <p className="text-[11px] text-rpg-muted">
                {l.title} · {fmtDay(l.day)}
              </p>
              <p className="text-rpg-text">{l.learning}</p>
              <RPGButton variant="secondary" className="mt-1 min-h-[34px] px-2 text-xs" onClick={() => setCard({ sessionId: l.sessionId, front: "", back: l.learning })}>
                <Wand2 size={12} aria-hidden /> Virar flashcard
              </RPGButton>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!card} onClose={() => setCard(null)} title="Novo flashcard (revise antes de criar)" size="sm">
        {card && (
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="text-xs text-rpg-muted">Frente (pergunta)</span>
              <input className={FIELD} style={R} maxLength={500} value={card.front} onChange={(e) => setCard({ ...card, front: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-rpg-muted">Verso (resposta)</span>
              <textarea className={clsx(FIELD, "min-h-[80px]")} style={R} maxLength={1000} value={card.back} onChange={(e) => setCard({ ...card, back: e.target.value })} />
            </label>
            <p className="text-[11px] text-rpg-muted">O cartão vai para o baralho deste livro no Grimório (criado se ainda não existir).</p>
            <div className="flex justify-end gap-2">
              <RPGButton variant="ghost" onClick={() => setCard(null)}>
                Cancelar
              </RPGButton>
              <RPGButton
                variant="gold"
                disabled={sessionCard.isPending || card.front.trim().length < 2 || !card.back.trim()}
                onClick={() => sessionCard.mutate({ id: card.sessionId, front: card.front.trim(), back: card.back.trim() }, { onSuccess: () => (onToast("Flashcard criado no Grimório."), setCard(null)), onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível criar.", "error") })}
              >
                Criar flashcard
              </RPGButton>
            </div>
          </div>
        )}
      </Modal>
    </KitSection>
  );
}

export const LIBRARY_MEDALS = [
  { code: "lib_first_tome", img: `${ART}/medal-2.webp`, fallbackTitle: "Primeiro Tomo" },
  { code: "lib_consistent", img: `${ART}/medal-1.webp`, fallbackTitle: "Leitor Consistente" },
  { code: "lib_explorer", img: `${ART}/medal-3.webp`, fallbackTitle: "Explorador do Conhecimento" },
  { code: "lib_guardian", img: `${ART}/medal-1.webp`, fallbackTitle: "Guardião da Biblioteca" },
  { code: "lib_master", img: `${ART}/medal-3.webp`, fallbackTitle: "Mestre das Leituras" },
];
