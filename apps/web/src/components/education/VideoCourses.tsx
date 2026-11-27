import { useState } from "react";
import clsx from "clsx";
import { Archive, ArchiveRestore, BookOpenCheck, CheckCircle2, ChevronDown, Circle, Clock, GraduationCap, ListVideo, PlayCircle, RefreshCw, Trash2, Trophy } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { EmptyNote, INPUT, R, Spinner, StatTile, errMsg } from "@/components/adventures/AdventureKit";
import { IntegrationBanner, XpChip, fmtSec } from "@/components/integrations/IntegrationKit";
import { KeySourceNote, PublicKeyForm, useLocalToast, type Notify } from "@/components/integrations/PublicApiKit";
import { useVideoCourseActions, useVideoCourses } from "@/hooks/usePublicApis";
import type { VideoCourse, VideoCoursesOverview } from "@/services/publicApisService";

const watchUrl = (c: VideoCourse, videoId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&list=${encodeURIComponent(c.playlistId)}`;

function EnrollForm({ o, notify }: { o: VideoCoursesOverview; notify: Notify }) {
  const a = useVideoCourseActions();
  const [link, setLink] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const looksOk = /list=|^[A-Za-z0-9_-]{12,64}$/.test(link.trim());
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!looksOk) return;
        a.enroll.mutate(
          { playlist: link.trim(), subjectId: subjectId || null },
          {
            onSuccess: (r) => {
              notify(`Matrícula feita: "${r.title}" com ${r.lessons} aulas.`);
              setLink("");
            },
            onError: (err) => notify(errMsg(err, "Não foi possível matricular a playlist."), "error"),
          },
        );
      }}
    >
      <label htmlFor="yt-playlist" className="sr-only">
        Link da playlist do YouTube
      </label>
      <input id="yt-playlist" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link da playlist (youtube.com/playlist?list=…)" className={clsx(INPUT, "min-w-0 flex-1")} style={R} inputMode="url" autoComplete="off" />
      {o.subjects.length > 0 && (
        <>
          <label htmlFor="yt-subject" className="sr-only">
            Vincular a uma disciplina
          </label>
          <select id="yt-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={clsx(INPUT, "sm:w-48")} style={R}>
            <option value="">Sem disciplina</option>
            {o.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}
      <RPGButton type="submit" variant="gold" disabled={!looksOk || a.enroll.isPending} className="justify-center text-sm">
        {a.enroll.isPending ? <Spinner /> : <GraduationCap size={15} aria-hidden />} Matricular
      </RPGButton>
    </form>
  );
}

function CourseCard({ c, o, notify }: { c: VideoCourse; o: VideoCoursesOverview; notify: Notify }) {
  const a = useVideoCourseActions();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const next = c.lessons.find((l) => l.id === c.nextLessonId) ?? null;
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const toggle = (id: string, done: boolean) =>
    a.lesson.mutate(
      { id, done },
      {
        onSuccess: (r) => {
          if (r.courseCompleted && r.xp >= o.rules.course) notify(`Curso concluído! +${r.xp} XP e a conquista está mais perto.`);
          else if (done) notify(r.xp ? `Aula concluída: +${r.xp} XP.` : "Aula marcada como vista.");
        },
        onError: (e) => notify(errMsg(e, "Não foi possível atualizar a aula."), "error"),
      },
    );
  return (
    <article className={clsx("border bg-rpg-bg-2/60 p-3", c.status === "concluido" ? "border-rpg-green/60" : "border-rpg-border")} style={R} aria-label={`Curso ${c.title}`}>
      <div className="flex gap-3">
        {c.thumbnailUrl ? (
          <img src={c.thumbnailUrl} alt="" className="hidden h-[68px] w-[120px] shrink-0 object-cover sm:block" style={{ borderRadius: 4 }} loading="lazy" />
        ) : (
          <span className="hidden h-[68px] w-[120px] shrink-0 items-center justify-center bg-rpg-panel sm:flex" style={{ borderRadius: 4 }} aria-hidden>
            <ListVideo size={22} className="text-rpg-muted" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate font-semibold text-rpg-text" title={c.title}>
              {c.title}
            </h3>
            {c.status === "concluido" && (
              <span className="inline-flex shrink-0 items-center gap-1 border border-rpg-green/60 bg-rpg-green/10 px-1.5 py-0.5 text-[10px] font-bold text-rpg-green" style={R}>
                <Trophy size={11} aria-hidden /> Concluído
              </span>
            )}
            {c.status === "arquivado" && <span className="shrink-0 text-[10px] text-rpg-muted">arquivado</span>}
          </div>
          <p className="truncate text-[11px] text-rpg-muted">
            {c.channel ?? "YouTube"} · {c.total} aulas · {fmtSec(c.totalSeconds)}
            {c.subject && <> · 📘 {c.subject.name}</>}
          </p>
          <div className="mt-1.5 h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 3 }} role="progressbar" aria-valuenow={c.done} aria-valuemax={c.total} aria-label="Aulas concluídas">
            <span className={clsx("block h-full bg-gradient-to-r", c.status === "concluido" ? "from-rpg-green to-rpg-green" : "from-rpg-red to-rpg-orange")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 text-[10px] text-rpg-muted">
            {c.done}/{c.total} aulas · {fmtSec(c.doneSeconds)} assistidas{c.totalSeconds > c.doneSeconds ? ` · faltam ~${fmtSec(c.totalSeconds - c.doneSeconds)}` : ""}
          </p>
        </div>
      </div>

      {next && c.status !== "arquivado" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border border-rpg-gold/50 bg-rpg-panel/60 p-2" style={R}>
          <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
            <p className="text-[10px] uppercase tracking-wide text-rpg-muted">Próxima aula</p>
            <p className="truncate text-sm font-semibold text-rpg-text" title={next.title}>
              {next.position + 1}. {next.title}
            </p>
          </div>
          <span className="hidden text-[11px] text-rpg-muted sm:inline">{fmtSec(next.seconds)}</span>
          <a href={watchUrl(c, next.videoId)} target="_blank" rel="noreferrer noopener" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-xs">
            <PlayCircle size={13} aria-hidden /> Assistir
          </a>
          <RPGButton variant="gold" className="text-xs" disabled={a.lesson.isPending} onClick={() => toggle(next.id, true)}>
            <CheckCircle2 size={13} aria-hidden /> Concluí
          </RPGButton>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-rpg-blue">
          <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} aria-hidden /> {open ? "Esconder aulas" : `Ver aulas (${c.lessons.length})`}
        </button>
        <span className="flex-1" />
        {o.subjects.length > 0 && (
          <select
            aria-label="Disciplina vinculada"
            value={c.subject?.id ?? ""}
            onChange={(e) => a.update.mutate({ id: c.id, subjectId: e.target.value || null }, { onSuccess: () => notify("Disciplina do curso atualizada.") })}
            className={clsx(INPUT, "max-w-[11rem] py-1 text-[11px]")}
            style={R}
          >
            <option value="">Sem disciplina</option>
            {o.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <RPGButton variant="ghost" className="px-2 text-xs" aria-label="Atualizar aulas da playlist" disabled={a.sync.isPending} onClick={() => a.sync.mutate(c.id, { onSuccess: (r) => notify(r.added ? `${r.added} aula(s) nova(s) na playlist.` : "Playlist em dia."), onError: (e) => notify(errMsg(e, "Falha ao atualizar."), "error") })}>
          <RefreshCw size={13} className={clsx(a.sync.isPending && "animate-spin")} aria-hidden />
        </RPGButton>
        {c.status !== "concluido" && (
          <RPGButton variant="ghost" className="px-2 text-xs" aria-label={c.status === "arquivado" ? "Reativar curso" : "Arquivar curso"} onClick={() => a.update.mutate({ id: c.id, archived: c.status !== "arquivado" })}>
            {c.status === "arquivado" ? <ArchiveRestore size={13} aria-hidden /> : <Archive size={13} aria-hidden />}
          </RPGButton>
        )}
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <RPGButton variant="danger" className="text-xs" onClick={() => a.remove.mutate(c.id, { onSuccess: () => notify("Curso removido. O XP ganho continua.") })}>
              Excluir
            </RPGButton>
            <RPGButton variant="ghost" className="text-xs" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </RPGButton>
          </span>
        ) : (
          <RPGButton variant="ghost" className="px-2 text-xs" aria-label="Excluir curso" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} aria-hidden />
          </RPGButton>
        )}
      </div>

      {open && (
        <ol className="mt-2 max-h-80 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {c.lessons.map((l) => (
            <li key={l.id} className="flex min-w-0 items-center gap-2 border-b border-dashed border-rpg-border/60 py-1.5">
              <button
                type="button"
                disabled={l.unavailable || a.lesson.isPending}
                onClick={() => toggle(l.id, !l.doneAt)}
                className={clsx("flex h-6 w-6 shrink-0 items-center justify-center", l.doneAt ? "text-rpg-green" : "text-rpg-muted hover:text-rpg-text", l.unavailable && "opacity-40")}
                aria-label={l.doneAt ? `Desmarcar aula ${l.position + 1}` : `Marcar aula ${l.position + 1} como concluída`}
                aria-pressed={!!l.doneAt}
              >
                {l.doneAt ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
              </button>
              <a href={l.unavailable ? undefined : watchUrl(c, l.videoId)} target="_blank" rel="noreferrer noopener" className={clsx("min-w-0 flex-1 truncate text-xs", l.doneAt ? "text-rpg-muted line-through" : "text-rpg-text hover:underline", l.unavailable && "pointer-events-none italic")} title={l.title}>
                {l.position + 1}. {l.title}
              </a>
              <span className="shrink-0 text-[10px] tabular-nums text-rpg-muted">{fmtSec(l.seconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/**
 * Cursos em Vídeo — playlists do YouTube viram cursos da Educação: aulas com
 * duração, próxima aula e progresso marcado pelo próprio aluno (+XP por aula).
 */
export function VideoCourses() {
  const q = useVideoCourses();
  const o = q.data;
  const [notify, toast] = useLocalToast();
  const [showArchived, setShowArchived] = useState(false);
  const visible = o?.courses.filter((c) => showArchived || c.status !== "arquivado") ?? [];
  const archivedCount = o?.courses.filter((c) => c.status === "arquivado").length ?? 0;

  return (
    <section className="rpg-panel relative overflow-hidden p-4" aria-label="Cursos em Vídeo (YouTube)">
      <div className="pointer-events-none absolute -right-16 -top-10 h-40 w-56 bg-[radial-gradient(ellipse_at_top,rgba(229,72,77,0.16),transparent_70%)]" aria-hidden />
      <IntegrationBanner icon={<PlayCircle size={22} />} tone="orange" title="Cursos em Vídeo" subtitle="Uma playlist do YouTube vira curso: aulas, duração, próxima aula e progresso." right={o && o.courses.length > 0 ? <XpChip xp={o.xpTotal} className="text-[11px]" /> : null} />
      {q.isLoading ? (
        <div className="h-40 animate-pulse bg-rpg-bg-2" style={R} aria-busy="true" />
      ) : q.isError || !o ? (
        <div role="alert" className="text-sm text-rpg-red">
          Não foi possível carregar os cursos em vídeo.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : !o.key.source ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <PublicKeyForm
            provider="youtube"
            service="YouTube"
            placeholder="AIzaSy…"
            minLength={30}
            notify={notify}
            link={{ href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", text: "Ativar a YouTube Data API v3 no Google Cloud" }}
            steps={[
              <>No Google Cloud, crie (ou use) um projeto e ative a <b>YouTube Data API v3</b> (grátis, com cota diária).</>,
              <>Em <b>APIs e serviços → Credenciais</b>, crie uma <b>chave de API</b> e, se quiser, restrinja à YouTube Data API.</>,
              <>Cole a chave aqui. Ela só lê playlists públicas: nada da sua conta ou histórico.</>,
            ]}
          />
          <div className="space-y-2 border border-dashed border-rpg-orange/50 p-3 text-xs text-rpg-muted" style={R}>
            <p className="font-rpg text-sm font-bold text-rpg-orange">Como a escola paga</p>
            <p>
              <b className="text-rpg-text">+{o.rules.lesson} XP e {o.rules.lessonCoins} moeda</b> por aula concluída (até {o.rules.dailyLessonCap} aulas por dia).
            </p>
            <p>
              <b className="text-rpg-text">+{o.rules.course} XP e {o.rules.courseCoins} moedas</b> ao concluir todas as aulas do curso.
            </p>
            <p>Conquistas: Aluno da Tela Brilhante (10 aulas), Formado na Escola do Vídeo (1 curso) e Erudito das Playlists (5 cursos).</p>
            <p>Opcional: vincule o curso a uma disciplina da Educação.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <EnrollForm o={o} notify={notify} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            <StatTile icon={<ListVideo size={14} />} tone="text-rpg-orange" value={o.stats.active} label="Cursos ativos" />
            <StatTile icon={<BookOpenCheck size={14} />} tone="text-rpg-green" value={o.stats.lessonsDone} label="Aulas vistas" />
            <StatTile icon={<Clock size={14} />} tone="text-rpg-blue" value={fmtSec(o.stats.secondsDone)} label="Tempo de estudo" />
            <StatTile icon={<Trophy size={14} />} tone="text-rpg-gold" value={o.stats.completed} label="Concluídos" hint={o.today.lessons ? `${o.today.lessons} aula(s) hoje` : undefined} />
          </div>
          {visible.length === 0 ? (
            <EmptyNote>Nenhum curso ainda. Cole o link de uma playlist de aulas para começar.</EmptyNote>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">
              {visible.map((c) => (
                <CourseCard key={c.id} c={c} o={o} notify={notify} />
              ))}
            </div>
          )}
          {archivedCount > 0 && (
            <button type="button" className="text-[11px] text-rpg-muted underline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Esconder arquivados" : `Mostrar ${archivedCount} arquivado(s)`}
            </button>
          )}
          <KeySourceNote provider="youtube" status={o.key} service="YouTube" notify={notify} />
        </div>
      )}
      {toast}
    </section>
  );
}
