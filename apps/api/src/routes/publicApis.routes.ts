import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { IntegrationError } from "../services/integrationsCore.js";
import { deletePublicKey, resolvePublicKey, savePublicKey, validatePublicKey, type PublicApiProvider } from "../services/publicApiKeysService.js";
import { VideoCourseError, deleteCourse, enrollPlaylist, getVideoCoursesOverview, resyncCourse, setLessonDone, updateCourse } from "../services/videoCourseService.js";
import { getAirOverview } from "../services/airQualityService.js";
import { HfError, decideHfPaper, getHfOverview } from "../services/hfTrendsService.js";
import { TransitError, addStop, createJourney, deleteJourney, deleteStop, geocode, getStationOverview, planRoute, recordDeparture, searchStops, setPrimaryJourney, stopsNear, updateStop } from "../services/transitService.js";
import { GtfsError, importGtfsStep } from "../services/gtfsService.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { LoreError, getLoreOverview, readScroll } from "../services/loreScrollService.js";
import { SkyError, collectSky, getSkyOverview } from "../services/skyWindowService.js";
import { CinemaError, addTitle, deleteTitle, getCinemaOverview, saveCinemaGoal, searchTitles, trendingTitles, updateTitle } from "../services/cinemaService.js";
import { getThermometer } from "../services/marketThermometerService.js";

/**
 * APIs públicas gratuitas por tela:
 *   /api/public-keys     → chaves pessoais (YouTube, NASA, TMDB, SPTrans), criptografadas
 *   /api/video-courses   → Educação · Cursos em Vídeo (YouTube)
 *   /api/air             → Saúde · Ar do Treino (Open-Meteo)
 *   /api/hf              → Biblioteca do Mestrado · Papers em Alta (Hugging Face)
 *   /api/transit         → Estação das Carruagens (GTFS SPTrans + Olho Vivo + OSRM)
 *   /api/lore            → Taverna · Pergaminho do Dia (Wikipédia)
 *   /api/sky             → Meu Mundo · Vitral do Céu (NASA APOD)
 *   /api/cinema          → Sala de Cinema (TMDB)
 *   /api/thermometer     → Banco do Reino · Termômetro do Reino (Banco Central)
 * Todas exigem login; toda consulta e escrita é filtrada pelo usuário autenticado.
 */

const KNOWN = [VideoCourseError, HfError, TransitError, GtfsError, LoreError, SkyError, CinemaError, IntegrationError];
const isKnown = (e: unknown): e is Error & { status: number } => KNOWN.some((K) => e instanceof K);

function handler(tag: string, fallback: string) {
  return (res: Response, err: unknown) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
    if (isKnown(err)) return res.status(err.status).json({ error: err.message });
    console.error(`[${tag}] erro:`, err instanceof Error ? err.message : "desconhecido");
    return res.status(500).json({ error: fallback });
  };
}

const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 40, message: "Muitas ações seguidas. Aguarde um minuto." });
const searchLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: "Muitas buscas seguidas. Aguarde um minuto." });
const ID = z.string().min(1).max(40);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const PROVIDERS = ["youtube", "nasa", "tmdb", "sptrans"] as const;

/* ───────────── Chaves pessoais ───────────── */
export const publicKeysRouter = Router();
publicKeysRouter.use(requireAuth);
const kFail = handler("chaves", "Não foi possível salvar a chave.");
const keyLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, message: "Muitas tentativas de chave. Aguarde alguns minutos." });

publicKeysRouter.get("/", async (req, res) => {
  try {
    const entries = await Promise.all(PROVIDERS.map(async (p) => [p, (await resolvePublicKey(getDb(), req.user!.id, p)).status] as const));
    return res.json(Object.fromEntries(entries));
  } catch (e) {
    return kFail(res, e);
  }
});
publicKeysRouter.put("/:provider", keyLimit, async (req, res) => {
  try {
    const provider = z.enum(PROVIDERS).parse(req.params.provider) as PublicApiProvider;
    const { key } = z.object({ key: z.string().trim().min(8, "Cole a chave completa.").max(400).regex(/^[\x21-\x7e]+$/, "A chave tem caracteres inválidos.") }).strict().parse(req.body);
    const problem = await validatePublicKey(provider, key);
    if (problem) return res.status(422).json({ error: problem });
    await savePublicKey(getDb(), req.user!.id, provider, key);
    return res.json((await resolvePublicKey(getDb(), req.user!.id, provider)).status);
  } catch (e) {
    return kFail(res, e);
  }
});
publicKeysRouter.delete("/:provider", async (req, res) => {
  try {
    await deletePublicKey(getDb(), req.user!.id, z.enum(PROVIDERS).parse(req.params.provider));
    return res.status(204).send();
  } catch (e) {
    return kFail(res, e);
  }
});

/* ───────────── Cursos em Vídeo ───────────── */
export const videoCoursesRouter = Router();
videoCoursesRouter.use(requireAuth);
const vFail = handler("cursos-video", "Não foi possível concluir a ação nos Cursos em Vídeo.");
const ytLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "Muitas consultas ao YouTube. Aguarde alguns minutos." });

videoCoursesRouter.get("/", async (req, res) => {
  try {
    return res.json(await getVideoCoursesOverview(getDb(), req.user!.id));
  } catch (e) {
    return vFail(res, e);
  }
});
videoCoursesRouter.post("/", ytLimit, async (req, res) => {
  try {
    const p = z.object({ playlist: z.string().trim().min(10, "Cole o link da playlist.").max(400), subjectId: ID.nullable().optional() }).strict().parse(req.body);
    return res.status(201).json(await enrollPlaylist(getDb(), req.user!.id, p));
  } catch (e) {
    return vFail(res, e);
  }
});
videoCoursesRouter.post("/:id/sync", ytLimit, async (req, res) => {
  try {
    return res.json(await resyncCourse(getDb(), req.user!.id, ID.parse(req.params.id)));
  } catch (e) {
    return vFail(res, e);
  }
});
videoCoursesRouter.patch("/:id", async (req, res) => {
  try {
    const p = z.object({ subjectId: ID.nullable().optional(), archived: z.boolean().optional() }).strict().parse(req.body);
    await updateCourse(getDb(), req.user!.id, ID.parse(req.params.id), p);
    return res.json({ ok: true });
  } catch (e) {
    return vFail(res, e);
  }
});
videoCoursesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteCourse(getDb(), req.user!.id, ID.parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return vFail(res, e);
  }
});
videoCoursesRouter.post("/lessons/:id", writeLimit, async (req, res) => {
  try {
    const { done } = z.object({ done: z.boolean() }).strict().parse(req.body);
    return res.json(await setLessonDone(getDb(), req.user!.id, ID.parse(req.params.id), done));
  } catch (e) {
    return vFail(res, e);
  }
});

/* ───────────── Ar do Treino ───────────── */
export const airRouter = Router();
airRouter.use(requireAuth);
const aFail = handler("ar", "Não foi possível ler a qualidade do ar.");
airRouter.get("/", async (req, res) => {
  try {
    return res.json(await getAirOverview(getDb(), req.user!.id));
  } catch (e) {
    return aFail(res, e);
  }
});

/* ───────────── Papers em Alta ───────────── */
export const hfRouter = Router();
hfRouter.use(requireAuth);
const hfFail = handler("hugging-face", "Não foi possível concluir a ação nos Papers em Alta.");
hfRouter.get("/", async (req, res) => {
  try {
    return res.json(await getHfOverview(getDb(), req.user!.id));
  } catch (e) {
    return hfFail(res, e);
  }
});
hfRouter.post("/decide", writeLimit, async (req, res) => {
  try {
    const p = z.object({ arxivId: z.string().regex(/^\d{4}\.\d{4,5}$/, "Identificador do arXiv inválido."), decision: z.enum(["salvar", "dispensar", "desfazer"]) }).strict().parse(req.body);
    return res.json(await decideHfPaper(getDb(), req.user!.id, p.arxivId, p.decision));
  } catch (e) {
    return hfFail(res, e);
  }
});

/* ───────────── Estação das Carruagens ───────────── */
export const transitRouter = Router();
transitRouter.use(requireAuth);
const tFail = handler("estacao", "Não foi possível consultar a Estação das Carruagens.");
const lines = z.array(z.string().trim().regex(/^[0-9A-Za-zÀ-ú -]{2,16}$/, "Linha inválida (ex.: 875A-10).")).max(10);
const COORD = { lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) };
const place = z.object({ label: z.string().trim().min(1).max(80), ...COORD }).strict();

transitRouter.get("/", async (req, res) => {
  try {
    return res.json(await getStationOverview(getDb(), req.user!.id));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.get("/stops/search", searchLimit, async (req, res) => {
  try {
    const q = z.string().trim().min(3, "Digite pelo menos 3 letras.").max(80).parse(req.query.q);
    return res.json(await searchStops(getDb(), req.user!.id, q));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.get("/stops/near", searchLimit, async (req, res) => {
  try {
    const p = z.object(COORD).parse(req.query);
    return res.json(await stopsNear(getDb(), p.lat, p.lon));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.get("/geocode", searchLimit, async (req, res) => {
  try {
    const q = z.string().trim().min(3, "Digite pelo menos 3 letras.").max(120).parse(req.query.q);
    return res.json(await geocode(q));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.post("/stops", writeLimit, async (req, res) => {
  try {
    const p = z
      .object({ code: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), address: z.string().trim().max(160).nullable().optional(), walkMinutes: z.number().int().min(0).max(60).optional(), rideMinutes: z.number().int().min(1).max(240).nullable().optional(), lines: lines.optional(), from: z.object(COORD).strict().nullable().optional() })
      .strict()
      .parse(req.body);
    return res.status(201).json(await addStop(getDb(), req.user!.id, p));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.patch("/stops/:id", writeLimit, async (req, res) => {
  try {
    const p = z.object({ walkMinutes: z.number().int().min(0).max(60).optional(), rideMinutes: z.number().int().min(1).max(240).nullable().optional(), lines: lines.optional(), first: z.boolean().optional() }).strict().parse(req.body);
    await updateStop(getDb(), req.user!.id, ID.parse(req.params.id), p);
    return res.json({ ok: true });
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.delete("/stops/:id", async (req, res) => {
  try {
    await deleteStop(getDb(), req.user!.id, ID.parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.post("/plan", searchLimit, async (req, res) => {
  try {
    const p = z.object({ from: place, to: place }).strict().parse(req.body);
    return res.json(await planRoute(getDb(), req.user!.id, p.from, p.to));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.post("/journeys", writeLimit, async (req, res) => {
  try {
    const p = z.object({ name: z.string().trim().min(1).max(60), origin: place, dest: place, tripId: z.string().trim().min(1).max(40), boardSeq: z.number().int().min(0), alightSeq: z.number().int().min(1) }).strict().parse(req.body);
    return res.status(201).json(await createJourney(getDb(), req.user!.id, p));
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.post("/journeys/:id/primary", writeLimit, async (req, res) => {
  try {
    await setPrimaryJourney(getDb(), req.user!.id, ID.parse(req.params.id));
    return res.json({ ok: true });
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.delete("/journeys/:id", async (req, res) => {
  try {
    await deleteJourney(getDb(), req.user!.id, ID.parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return tFail(res, e);
  }
});
transitRouter.post("/depart", writeLimit, async (req, res) => {
  try {
    const p = z.object({ stopId: ID.optional(), journeyId: ID.optional() }).strict().refine((x) => !!x.stopId !== !!x.journeyId, "Informe a jornada ou o ponto.").parse(req.body);
    return res.status(201).json(await recordDeparture(getDb(), req.user!.id, p));
  } catch (e) {
    return tFail(res, e);
  }
});
// GTFS: dados globais de referência — só o administrador importa (em passos de até 60 s).
transitRouter.post("/gtfs/import", requireAdmin, async (req, res) => {
  try {
    const { step } = z.object({ step: z.number().int().min(0).max(60) }).strict().parse(req.body);
    return res.json(await importGtfsStep(getDb(), step));
  } catch (e) {
    return tFail(res, e);
  }
});

/* ───────────── Pergaminho do Dia ───────────── */
export const loreRouter = Router();
loreRouter.use(requireAuth);
const lFail = handler("pergaminho", "Não foi possível abrir o Pergaminho do Dia.");
loreRouter.get("/", async (req, res) => {
  try {
    return res.json(await getLoreOverview(getDb(), req.user!.id));
  } catch (e) {
    return lFail(res, e);
  }
});
loreRouter.post("/read", writeLimit, async (req, res) => {
  try {
    const { index } = z.object({ index: z.number().int().min(0).max(11) }).strict().parse(req.body);
    return res.status(201).json(await readScroll(getDb(), req.user!.id, index));
  } catch (e) {
    return lFail(res, e);
  }
});

/* ───────────── Vitral do Céu ───────────── */
export const skyRouter = Router();
skyRouter.use(requireAuth);
const sFail = handler("ceu", "Não foi possível abrir o Vitral do Céu.");
skyRouter.get("/", async (req, res) => {
  try {
    return res.json(await getSkyOverview(getDb(), req.user!.id));
  } catch (e) {
    return sFail(res, e);
  }
});
skyRouter.post("/collect", writeLimit, async (req, res) => {
  try {
    const { date } = z.object({ date: DAY }).strict().parse(req.body);
    return res.status(201).json(await collectSky(getDb(), req.user!.id, date));
  } catch (e) {
    return sFail(res, e);
  }
});

/* ───────────── Sala de Cinema ───────────── */
export const cinemaRouter = Router();
cinemaRouter.use(requireAuth);
const cFail = handler("cinema", "Não foi possível concluir a ação na Sala de Cinema.");
const STATUS = z.enum(["quero_ver", "assistindo", "visto", "abandonado"]);

cinemaRouter.get("/", async (req, res) => {
  try {
    return res.json(await getCinemaOverview(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.get("/search", searchLimit, async (req, res) => {
  try {
    const q = z.string().trim().min(2, "Digite pelo menos 2 letras.").max(100).parse(req.query.q);
    return res.json(await searchTitles(getDb(), req.user!.id, q));
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.get("/trending", searchLimit, async (req, res) => {
  try {
    return res.json(await trendingTitles(getDb(), req.user!.id));
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.post("/items", writeLimit, async (req, res) => {
  try {
    const p = z.object({ mediaType: z.enum(["movie", "tv"]), tmdbId: z.number().int().positive(), status: z.enum(["quero_ver", "assistindo", "visto"]).optional() }).strict().parse(req.body);
    return res.status(201).json(await addTitle(getDb(), req.user!.id, p));
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.patch("/items/:id", writeLimit, async (req, res) => {
  try {
    const p = z.object({ status: STATUS.optional(), rating: z.number().int().min(1).max(10).nullable().optional(), review: z.string().trim().max(2000).nullable().optional(), watchedDay: DAY.nullable().optional() }).strict().parse(req.body);
    return res.json(await updateTitle(getDb(), req.user!.id, ID.parse(req.params.id), p));
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.delete("/items/:id", async (req, res) => {
  try {
    await deleteTitle(getDb(), req.user!.id, ID.parse(req.params.id));
    return res.status(204).send();
  } catch (e) {
    return cFail(res, e);
  }
});
cinemaRouter.put("/goal", async (req, res) => {
  try {
    const { goal } = z.object({ goal: z.number().int().min(1).max(60).nullable() }).strict().parse(req.body);
    await saveCinemaGoal(getDb(), req.user!.id, goal);
    return res.json({ goal });
  } catch (e) {
    return cFail(res, e);
  }
});

/* ───────────── Termômetro do Reino ───────────── */
export const thermometerRouter = Router();
thermometerRouter.use(requireAuth);
const thFail = handler("termometro", "Não foi possível ler as taxas do Banco Central.");
thermometerRouter.get("/", async (_req, res) => {
  try {
    return res.json(await getThermometer(getDb()));
  } catch (e) {
    return thFail(res, e);
  }
});
