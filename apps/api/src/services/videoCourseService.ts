import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { resolvePublicKey } from "./publicApiKeysService.js";

/**
 * Cursos em Vídeo (Educação) — uma playlist pública do YouTube vira um curso
 * com aulas, duração e progresso. Usa só a YouTube Data API v3 com chave de API
 * (dados públicos): não lê histórico nem conta do usuário. O progresso é o que
 * o próprio usuário marca como concluído.
 *
 * XP (fonte "video_course"): +15 XP e 1 moeda por aula concluída (até 20 aulas
 * pagas por dia) e +150 XP e 15 moedas ao concluir o curso. Chaves idempotentes:
 * desmarcar e marcar de novo nunca paga duas vezes.
 */

export const VIDEO_XP = { lesson: 15, lessonCoins: 1, dailyLessonCap: 20, course: 150, courseCoins: 15 } as const;
const MAX_ITEMS = 300;
const YT = "https://www.googleapis.com/youtube/v3";

export class VideoCourseError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422 | 429 | 502 = 400) {
    super(message);
  }
}

function friendly(err: unknown): never {
  if (err instanceof IntegrationError) {
    if (err.status === 400 && /key/i.test(err.message)) throw new VideoCourseError("O YouTube recusou a chave de API. Confira a chave da YouTube Data API v3.", 422);
    if (err.status === 401 || err.status === 403) throw new VideoCourseError("O YouTube recusou a chave (ou a cota diária acabou). Confira a chave da YouTube Data API v3.", 422);
    if (err.status === 404) throw new VideoCourseError("Playlist não encontrada. Ela precisa ser pública ou não listada.", 404);
    if (err.status === 429) throw new VideoCourseError("Cota do YouTube atingida. Tente mais tarde.", 429);
    throw new VideoCourseError(err.message, 502);
  }
  throw err;
}

/** Aceita o link da playlist (ou de um vídeo dentro dela) ou o ID puro. */
export function parsePlaylistId(input: string): string | null {
  const raw = input.trim();
  let id = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(u.hostname)) return null;
      id = u.searchParams.get("list") ?? "";
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{12,64}$/.test(id) ? id : null;
}

/** Duração ISO 8601 do YouTube (PT1H2M3S, P1DT2H) em segundos. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? "");
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return (d ?? 0) * 86400 + (h ?? 0) * 3600 + (mi ?? 0) * 60 + (s ?? 0);
}

type Thumbs = Record<string, { url?: string } | undefined> | undefined;
const bestThumb = (t: Thumbs) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;

interface YtPlaylist { items?: Array<{ snippet?: { title?: string; channelTitle?: string; thumbnails?: Thumbs } }> }
interface YtItems { nextPageToken?: string; items?: Array<{ snippet?: { title?: string; position?: number; thumbnails?: Thumbs; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }> }
interface YtVideos { items?: Array<{ id: string; contentDetails?: { duration?: string } }> }

async function ytKey(db: Client, ownerId: string): Promise<string> {
  const { key } = await resolvePublicKey(db, ownerId, "youtube");
  if (!key) throw new VideoCourseError("Configure a chave da YouTube Data API para matricular playlists.", 422);
  return key;
}

export interface FetchedLesson { videoId: string; position: number; title: string; thumb: string | null; seconds: number | null; unavailable: boolean }

async function fetchPlaylist(key: string, playlistId: string) {
  const p = await fetchJson<YtPlaylist>(`${YT}/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(key)}`, {}, { label: "YouTube", retries: 1 }).catch(friendly);
  const sn = p?.items?.[0]?.snippet;
  if (!sn) throw new VideoCourseError("Playlist não encontrada. Ela precisa ser pública ou não listada.", 404);
  const lessons: FetchedLesson[] = [];
  let token: string | undefined;
  do {
    const page = await fetchJson<YtItems>(
      `${YT}/playlistItems?part=snippet,status&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(key)}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`,
      {},
      { label: "YouTube" },
    ).catch(friendly);
    for (const it of page?.items ?? []) {
      const vid = it.snippet?.resourceId?.videoId;
      if (!vid || lessons.some((l) => l.videoId === vid)) continue;
      const title = (it.snippet?.title ?? "").slice(0, 200);
      const gone = title === "Private video" || title === "Deleted video" || it.status?.privacyStatus === "private";
      lessons.push({ videoId: vid, position: lessons.length, title: gone ? "Vídeo indisponível" : title, thumb: bestThumb(it.snippet?.thumbnails), seconds: null, unavailable: gone });
    }
    token = page?.nextPageToken;
  } while (token && lessons.length < MAX_ITEMS);
  // Duração: videos.list aceita até 50 IDs por chamada.
  for (let i = 0; i < lessons.length; i += 50) {
    const chunk = lessons.slice(i, i + 50).filter((l) => !l.unavailable);
    if (!chunk.length) continue;
    const v = await fetchJson<YtVideos>(`${YT}/videos?part=contentDetails&id=${chunk.map((l) => l.videoId).join(",")}&key=${encodeURIComponent(key)}`, {}, { label: "YouTube" }).catch(friendly);
    const dur = new Map((v?.items ?? []).map((x) => [x.id, parseIsoDuration(x.contentDetails?.duration)]));
    for (const l of chunk) l.seconds = dur.get(l.videoId) ?? null;
  }
  return { title: (sn.title ?? "Curso sem título").slice(0, 200), channel: sn.channelTitle?.slice(0, 120) ?? null, thumb: bestThumb(sn.thumbnails), lessons };
}

/** Grava/atualiza as aulas preservando o que já foi concluído. Exportada para testes. */
export async function upsertLessons(db: Client, ownerId: string, courseId: string, lessons: FetchedLesson[]) {
  if (!lessons.length) return;
  await db.batch(
    lessons.map((l) => ({
      sql: `INSERT INTO video_lessons (id, course_id, owner_id, video_id, position, title, duration_seconds, thumbnail_url, unavailable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (course_id, video_id) DO UPDATE SET position = excluded.position, title = excluded.title,
              duration_seconds = COALESCE(excluded.duration_seconds, video_lessons.duration_seconds), thumbnail_url = COALESCE(excluded.thumbnail_url, video_lessons.thumbnail_url), unavailable = excluded.unavailable`,
      args: [nanoid(), courseId, ownerId, l.videoId, l.position, l.title, l.seconds, l.thumb, l.unavailable ? 1 : 0],
    })),
    "write",
  );
}

async function ownedSubject(db: Client, ownerId: string, subjectId: string | null | undefined) {
  if (!subjectId) return null;
  const r = await db.execute({ sql: "SELECT id FROM subjects WHERE id = ? AND owner_id = ?", args: [subjectId, ownerId] });
  if (!r.rows[0]) throw new VideoCourseError("Disciplina não encontrada.", 404);
  return subjectId;
}

export async function enrollPlaylist(db: Client, ownerId: string, input: { playlist: string; subjectId?: string | null }) {
  const playlistId = parsePlaylistId(input.playlist);
  if (!playlistId) throw new VideoCourseError("Cole o link de uma playlist do YouTube (com ?list=…).", 400);
  const dup = await db.execute({ sql: "SELECT id FROM video_courses WHERE owner_id = ? AND playlist_id = ?", args: [ownerId, playlistId] });
  if (dup.rows[0]) throw new VideoCourseError("Essa playlist já está nos seus cursos.", 409);
  const subjectId = await ownedSubject(db, ownerId, input.subjectId);
  const data = await fetchPlaylist(await ytKey(db, ownerId), playlistId);
  if (!data.lessons.length) throw new VideoCourseError("Essa playlist está vazia.", 422);
  const id = nanoid();
  await db.execute({
    sql: "INSERT INTO video_courses (id, owner_id, playlist_id, title, channel, thumbnail_url, subject_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, ownerId, playlistId, data.title, data.channel, data.thumb, subjectId, new Date().toISOString()],
  });
  await upsertLessons(db, ownerId, id, data.lessons);
  await recordWorldEvent(db, ownerId, { type: "video_course.enrolled", title: `Matrícula no curso em vídeo "${data.title}"`, detail: `${data.lessons.length} aulas`, refId: id });
  return { id, title: data.title, lessons: data.lessons.length };
}

export async function resyncCourse(db: Client, ownerId: string, courseId: string) {
  const r = await db.execute({ sql: "SELECT playlist_id FROM video_courses WHERE id = ? AND owner_id = ?", args: [courseId, ownerId] });
  if (!r.rows[0]) throw new VideoCourseError("Curso não encontrado.", 404);
  const data = await fetchPlaylist(await ytKey(db, ownerId), String(r.rows[0].playlist_id));
  const before = await db.execute({ sql: "SELECT COUNT(*) AS n FROM video_lessons WHERE course_id = ?", args: [courseId] });
  await upsertLessons(db, ownerId, courseId, data.lessons);
  await db.execute({ sql: "UPDATE video_courses SET title = ?, channel = ?, thumbnail_url = ?, synced_at = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [data.title, data.channel, data.thumb, new Date().toISOString(), courseId, ownerId] });
  const added = Math.max(0, data.lessons.length - Number(before.rows[0]?.n ?? 0));
  await refreshCompletion(db, ownerId, courseId);
  return { added, lessons: data.lessons.length };
}

/** Marca o curso como concluído (e paga o bônus) quando todas as aulas disponíveis foram vistas. */
async function refreshCompletion(db: Client, ownerId: string, courseId: string) {
  const r = await db.execute({
    sql: `SELECT c.title, c.status, SUM(CASE WHEN l.unavailable = 0 THEN 1 ELSE 0 END) AS total, SUM(CASE WHEN l.unavailable = 0 AND l.done_at IS NOT NULL THEN 1 ELSE 0 END) AS done
          FROM video_courses c LEFT JOIN video_lessons l ON l.course_id = c.id WHERE c.id = ? AND c.owner_id = ? GROUP BY c.id`,
    args: [courseId, ownerId],
  });
  const row = r.rows[0];
  if (!row) return { completed: false, xp: 0 };
  const total = Number(row.total ?? 0);
  const done = Number(row.done ?? 0);
  const complete = total > 0 && done >= total;
  if (!complete) {
    if (String(row.status) === "concluido") await db.execute({ sql: "UPDATE video_courses SET status = 'ativo', completed_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [courseId, ownerId] });
    return { completed: false, xp: 0 };
  }
  if (String(row.status) === "concluido") return { completed: true, xp: 0 };
  await db.execute({ sql: "UPDATE video_courses SET status = 'concluido', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [courseId, ownerId] });
  const { today } = await userDayContext(db, ownerId);
  const ok = await award(db, ownerId, { sourceType: "video_course", sourceId: `course:${courseId}`, eventType: "completed", xp: VIDEO_XP.course, coins: VIDEO_XP.courseCoins, label: `Curso em vídeo concluído: ${String(row.title).slice(0, 80)}` }, today);
  if (ok) await recordWorldEvent(db, ownerId, { type: "video_course.completed", title: `Curso concluído: ${String(row.title)}`, detail: `+${VIDEO_XP.course} XP`, refId: courseId });
  return { completed: true, xp: ok ? VIDEO_XP.course : 0 };
}

export async function setLessonDone(db: Client, ownerId: string, lessonId: string, done: boolean) {
  const r = await db.execute({ sql: "SELECT id, course_id, title, done_at, unavailable FROM video_lessons WHERE id = ? AND owner_id = ?", args: [lessonId, ownerId] });
  const l = r.rows[0];
  if (!l) throw new VideoCourseError("Aula não encontrada.", 404);
  if (done && Number(l.unavailable)) throw new VideoCourseError("Esse vídeo não está mais disponível no YouTube.", 409);
  const { today } = await userDayContext(db, ownerId);
  let xp = 0;
  if (done) {
    if (l.done_at == null) await db.execute({ sql: "UPDATE video_lessons SET done_at = ?, done_day = ? WHERE id = ? AND owner_id = ?", args: [new Date().toISOString(), today, lessonId, ownerId] });
    const paidToday = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'video_course' AND event_type = 'lesson' AND day_key = ?", args: [ownerId, today] });
    if (Number(paidToday.rows[0]?.n ?? 0) < VIDEO_XP.dailyLessonCap) {
      const ok = await award(db, ownerId, { sourceType: "video_course", sourceId: `lesson:${lessonId}`, eventType: "lesson", xp: VIDEO_XP.lesson, coins: VIDEO_XP.lessonCoins, label: `Aula concluída: ${String(l.title).slice(0, 90)}` }, today);
      if (ok) xp += VIDEO_XP.lesson;
    }
  } else {
    // Desmarcar não devolve XP (o ledger é histórico), só corrige o progresso.
    await db.execute({ sql: "UPDATE video_lessons SET done_at = NULL, done_day = NULL WHERE id = ? AND owner_id = ?", args: [lessonId, ownerId] });
  }
  const c = await refreshCompletion(db, ownerId, String(l.course_id));
  return { xp: xp + c.xp, courseCompleted: c.completed };
}

export async function updateCourse(db: Client, ownerId: string, courseId: string, patch: { subjectId?: string | null; archived?: boolean }) {
  const r = await db.execute({ sql: "SELECT status FROM video_courses WHERE id = ? AND owner_id = ?", args: [courseId, ownerId] });
  if (!r.rows[0]) throw new VideoCourseError("Curso não encontrado.", 404);
  if (patch.subjectId !== undefined) {
    const sid = await ownedSubject(db, ownerId, patch.subjectId);
    await db.execute({ sql: "UPDATE video_courses SET subject_id = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [sid, courseId, ownerId] });
  }
  if (patch.archived !== undefined) {
    if (patch.archived) await db.execute({ sql: "UPDATE video_courses SET status = 'arquivado', updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status <> 'concluido'", args: [courseId, ownerId] });
    else {
      await db.execute({ sql: "UPDATE video_courses SET status = 'ativo', updated_at = datetime('now') WHERE id = ? AND owner_id = ? AND status = 'arquivado'", args: [courseId, ownerId] });
      await refreshCompletion(db, ownerId, courseId);
    }
  }
}

export async function deleteCourse(db: Client, ownerId: string, courseId: string) {
  const r = await db.execute({ sql: "DELETE FROM video_courses WHERE id = ? AND owner_id = ?", args: [courseId, ownerId] });
  if (!r.rowsAffected) throw new VideoCourseError("Curso não encontrado.", 404);
}

export async function getVideoCoursesOverview(db: Client, ownerId: string) {
  const { today } = await userDayContext(db, ownerId);
  const [courses, lessons, subjects, xp, todayDone, key] = await Promise.all([
    db.execute({ sql: "SELECT c.*, s.name AS subject_name FROM video_courses c LEFT JOIN subjects s ON s.id = c.subject_id AND s.owner_id = c.owner_id WHERE c.owner_id = ? ORDER BY CASE c.status WHEN 'ativo' THEN 0 WHEN 'concluido' THEN 1 ELSE 2 END, c.updated_at DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT id, course_id, video_id, position, title, duration_seconds, thumbnail_url, unavailable, done_at, done_day FROM video_lessons WHERE owner_id = ? ORDER BY course_id, position", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name FROM subjects WHERE owner_id = ? ORDER BY name LIMIT 200", args: [ownerId] }),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'video_course'", args: [ownerId] }),
    db.execute({ sql: "SELECT COUNT(*) AS n, COALESCE(SUM(duration_seconds), 0) AS s FROM video_lessons WHERE owner_id = ? AND done_day = ?", args: [ownerId, today] }),
    resolvePublicKey(db, ownerId, "youtube"),
  ]);
  const byCourse = new Map<string, typeof lessons.rows>();
  for (const l of lessons.rows) {
    const k = String(l.course_id);
    if (!byCourse.has(k)) byCourse.set(k, []);
    byCourse.get(k)!.push(l);
  }
  const list = courses.rows.map((c) => {
    const ls = byCourse.get(String(c.id)) ?? [];
    const avail = ls.filter((l) => !Number(l.unavailable));
    const done = avail.filter((l) => l.done_at != null);
    const sum = (arr: typeof ls) => arr.reduce((a, l) => a + Number(l.duration_seconds ?? 0), 0);
    const next = avail.find((l) => l.done_at == null);
    return {
      id: String(c.id),
      playlistId: String(c.playlist_id),
      title: String(c.title),
      channel: c.channel == null ? null : String(c.channel),
      thumbnailUrl: c.thumbnail_url == null ? null : String(c.thumbnail_url),
      subject: c.subject_id == null ? null : { id: String(c.subject_id), name: c.subject_name == null ? "" : String(c.subject_name) },
      status: String(c.status) as "ativo" | "concluido" | "arquivado",
      completedAt: c.completed_at == null ? null : String(c.completed_at),
      syncedAt: c.synced_at == null ? null : String(c.synced_at),
      total: avail.length,
      done: done.length,
      totalSeconds: sum(avail),
      doneSeconds: sum(done),
      nextLessonId: next ? String(next.id) : null,
      lessons: ls.map((l) => ({
        id: String(l.id),
        videoId: String(l.video_id),
        position: Number(l.position),
        title: String(l.title),
        seconds: l.duration_seconds == null ? null : Number(l.duration_seconds),
        thumbnailUrl: l.thumbnail_url == null ? null : String(l.thumbnail_url),
        unavailable: !!Number(l.unavailable),
        doneAt: l.done_at == null ? null : String(l.done_at),
      })),
    };
  });
  return {
    key: key.status,
    courses: list,
    subjects: subjects.rows.map((s) => ({ id: String(s.id), name: String(s.name) })),
    today: { lessons: Number(todayDone.rows[0]?.n ?? 0), seconds: Number(todayDone.rows[0]?.s ?? 0) },
    xpTotal: Number(xp.rows[0]?.xp ?? 0),
    stats: { active: list.filter((c) => c.status === "ativo").length, completed: list.filter((c) => c.status === "concluido").length, lessonsDone: list.reduce((a, c) => a + c.done, 0), secondsDone: list.reduce((a, c) => a + c.doneSeconds, 0) },
    rules: VIDEO_XP,
  };
}

export async function videoCourseTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({
    sql: `SELECT l.done_day, COUNT(*) AS n, COALESCE(SUM(l.duration_seconds), 0) AS s, MAX(c.title) AS course FROM video_lessons l JOIN video_courses c ON c.id = l.course_id
          WHERE l.owner_id = ? AND l.done_day >= ? AND l.done_day <= ? GROUP BY l.done_day`,
    args: [ownerId, from, to],
  });
  return r.rows.map((x) => ({ type: "education", icon: "🎬", id: `video-${String(x.done_day)}`, label: `${Number(x.n)} aula(s) em vídeo (${Math.round(Number(x.s) / 60)} min) · ${String(x.course ?? "")}`.slice(0, 160), at: `${String(x.done_day)}T19:00:00.000Z` }));
}
