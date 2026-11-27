import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { parseIsoDuration, parsePlaylistId } from "../src/services/videoCourseService.js";
import { awardCleanAirWorkouts, bestWindow, hoursForDay, resetAirCacheForTests, type AirHour } from "../src/services/airQualityService.js";
import { matchTopics, normalizeDaily, resetHfCacheForTests } from "../src/services/hfTrendsService.js";
import { parsePrediction, recommend, resetTransitSessionsForTests } from "../src/services/transitService.js";
import { compactSeries, periodRate } from "../src/services/marketThermometerService.js";
import { localDayRangeUtc, userDayContext } from "../src/services/localDayService.js";

const ENV_KEYS = ["YOUTUBE_API_KEY", "TMDB_API_KEY", "NASA_API_KEY", "SPTRANS_TOKEN"] as const;
afterEach(() => {
  setIntegrationFetchForTests(null);
  resetAirCacheForTests();
  resetHfCacheForTests();
  resetTransitSessionsForTests();
  for (const k of ENV_KEYS) delete process.env[k];
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const xpOf = async (owner: string, where: string) => Number((await getDb().execute({ sql: `SELECT COALESCE(SUM(xp), 0) AS x FROM xp_events WHERE owner_id = ? AND ${where}`, args: [owner] })).rows[0]?.x ?? 0);

/* ───────────── Cursos em Vídeo ───────────── */
describe("Cursos em Vídeo (YouTube)", () => {
  it("entende links de playlist e durações ISO", () => {
    expect(parsePlaylistId("https://www.youtube.com/playlist?list=PLabcdefghijklmnop")).toBe("PLabcdefghijklmnop");
    expect(parsePlaylistId("https://youtube.com/watch?v=xyz&list=PLqwertyuiopasdfg")).toBe("PLqwertyuiopasdfg");
    expect(parsePlaylistId("https://evil.com/?list=PLqwertyuiopasdfg")).toBeNull();
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1M")).toBe(86460);
  });

  it("matricula a playlist, paga XP por aula e bônus ao concluir, sem pagar duas vezes", async () => {
    process.env.YOUTUBE_API_KEY = "teste-yt";
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      expect(url).not.toContain("undefined");
      if (url.includes("/playlists?")) return json({ items: [{ snippet: { title: "Estatística", channelTitle: "Canal", thumbnails: { medium: { url: "https://i.ytimg.com/a.jpg" } } } }] });
      if (url.includes("/playlistItems?"))
        return json({ items: [{ snippet: { title: "Aula 1", resourceId: { videoId: "vid1" } } }, { snippet: { title: "Aula 2", resourceId: { videoId: "vid2" } } }, { snippet: { title: "Private video", resourceId: { videoId: "vid3" } }, status: { privacyStatus: "private" } }] });
      if (url.includes("/videos?")) return json({ items: [{ id: "vid1", contentDetails: { duration: "PT10M" } }, { id: "vid2", contentDetails: { duration: "PT20M" } }] });
      throw new Error(`URL inesperada: ${url}`);
    });
    const r = await agent.post("/api/video-courses").send({ playlist: "https://www.youtube.com/playlist?list=PLabcdefghijklmnop" });
    expect(r.status).toBe(201);
    expect((await agent.post("/api/video-courses").send({ playlist: "PLabcdefghijklmnop" })).status).toBe(409);

    const o = (await agent.get("/api/video-courses")).body;
    const c = o.courses[0];
    expect(c.total).toBe(2);
    expect(c.totalSeconds).toBe(1800);
    const [l1, l2] = c.lessons;
    expect(c.lessons[2].unavailable).toBe(true);

    expect((await agent.post(`/api/video-courses/lessons/${l1.id}`).send({ done: true })).body.xp).toBe(15);
    await agent.post(`/api/video-courses/lessons/${l1.id}`).send({ done: false });
    expect((await agent.post(`/api/video-courses/lessons/${l1.id}`).send({ done: true })).body.xp).toBe(0);
    const fin = await agent.post(`/api/video-courses/lessons/${l2.id}`).send({ done: true });
    expect(fin.body).toMatchObject({ xp: 165, courseCompleted: true });
    expect(await xpOf(userId, "source_type = 'video_course'")).toBe(180);

    // Isolamento: outro usuário não marca aula nem apaga curso alheio.
    const other = await createAuthenticatedAgent();
    expect((await other.agent.post(`/api/video-courses/lessons/${l1.id}`).send({ done: true })).status).toBe(404);
    expect((await other.agent.delete(`/api/video-courses/${c.id}`)).status).toBe(404);
    expect((await other.agent.get("/api/video-courses")).body.courses).toHaveLength(0);
  });

  it("sem chave explica o que configurar", async () => {
    const { agent } = await createAuthenticatedAgent();
    const r = await agent.post("/api/video-courses").send({ playlist: "PLabcdefghijklmnop" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/chave/i);
  });
});

/* ───────────── Ar do Treino ───────────── */
describe("Ar do Treino (Open-Meteo)", () => {
  const hour = (h: number, aqi: number, uv = 0): AirHour => ({ hour: h, aqi, pm25: null, pm10: null, uv, pollen: null });

  it("lê as horas do dia e acha a janela de ouro", () => {
    const resp = { hourly: { time: ["2031-05-01T05:00", "2031-05-01T06:00", "2031-05-02T06:00"], us_aqi: [40, 42, 90], uv_index: [0, 1, 2], pm2_5: [5, null, 9] } };
    const hs = hoursForDay(resp, "2031-05-01");
    expect(hs).toHaveLength(2);
    expect(hs[1]).toMatchObject({ hour: 6, aqi: 42, pm25: null });
    const day = [hour(5, 80), hour(6, 30), hour(7, 32), hour(8, 35), hour(9, 70), hour(12, 40, 11), hour(13, 40, 11)];
    expect(bestWindow(day)).toMatchObject({ start: 6, end: 9, quality: "ouro" });
    expect(bestWindow([hour(10, 120), hour(11, 130)])?.quality).toBe("ruim");
  });

  it("paga bônus para treino ao ar livre em hora de ar bom, uma vez", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const { tz, today } = await userDayContext(db, userId);
    const hours = Array.from({ length: 24 }, (_, h) => hour(h, h === 7 ? 30 : 120));
    await db.execute({ sql: "INSERT INTO air_quality_days (owner_id, day_key, hourly_json) VALUES (?, ?, ?)", args: [userId, today, JSON.stringify(hours)] });
    // 07:30 local em UTC (início do dia local + 7h30).
    const at = new Date(Date.parse(localDayRangeUtc(today, tz).start) + 7.5 * 3600_000).toISOString();
    await db.execute({ sql: "INSERT INTO workouts (id, owner_id, kind, category, duration_minutes, performed_at) VALUES (?, ?, 'Corrida', 'corrida', 30, ?)", args: [nanoid(), userId, at] });
    await db.execute({ sql: "INSERT INTO workouts (id, owner_id, kind, category, duration_minutes, performed_at) VALUES (?, ?, 'Musculação', 'musculacao', 60, ?)", args: [nanoid(), userId, at] });
    const first = await awardCleanAirWorkouts(db, userId);
    await awardCleanAirWorkouts(db, userId);
    expect(await xpOf(userId, "source_type = 'workout' AND event_type = 'clean_air'")).toBe(20);
    expect(first.find((w) => w.kind === "Musculação")?.outdoor).toBe(false);
  });

  it("sem localização configurada pede para configurar", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.get("/api/air")).body).toEqual({ configured: false });
  });
});

/* ───────────── Papers em Alta ───────────── */
describe("Papers em Alta (Hugging Face)", () => {
  const raw = [
    { paper: { id: "2611.01234", title: "Scaling small language models", summary: "We study language models for Portuguese.", upvotes: 50, authors: [{ name: "Ana Souza" }] }, numComments: 3 },
    { paper: { id: "2611.04321", title: "Tabular foundation models", summary: "Survey.", upvotes: 90, authors: [] } },
    { paper: { id: "lixo", title: "x" } },
  ];

  it("normaliza, ordena por votos e casa com os temas", () => {
    const ps = normalizeDaily(raw);
    expect(ps.map((p) => p.arxivId)).toEqual(["2611.04321", "2611.01234"]);
    expect(matchTopics(ps[1]!, ["language models", "visão computacional"])).toEqual(["language models"]);
  });

  it("salvar manda para a biblioteca e paga a triagem uma vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      if (url.includes("/daily_papers")) return json(raw);
      return json([]);
    });
    const o = (await agent.get("/api/hf")).body;
    expect(o.papers).toHaveLength(2);
    const s = await agent.post("/api/hf/decide").send({ arxivId: "2611.01234", decision: "salvar" });
    expect(s.status).toBe(200);
    expect(s.body.paperId).toBeTruthy();
    expect((await agent.post("/api/hf/decide").send({ arxivId: "2611.01234", decision: "dispensar" })).status).toBe(409);
    await agent.post("/api/hf/decide").send({ arxivId: "2611.04321", decision: "dispensar" });
    expect(await xpOf(userId, "event_type = 'hf_triage'")).toBe(10);
    const paper = await getDb().execute({ sql: "SELECT p.doi FROM user_papers u JOIN research_papers p ON p.id = u.paper_id WHERE u.owner_id = ?", args: [userId] });
    expect(String(paper.rows[0]?.doi)).toBe("10.48550/arxiv.2611.01234");
    const after = (await agent.get("/api/hf")).body;
    expect(after.papers.find((p: { arxivId: string }) => p.arxivId === "2611.01234").decision).toBe("salvo");
  });
});

/* ───────────── Hora de Sair ───────────── */
describe("Estação das Carruagens: Olho Vivo (SPTrans)", () => {
  const pred = { hr: "13:50", p: { cp: 1, np: "Ponto", l: [{ c: "875A-10", sl: 1, lt0: "Centro", lt1: "Perdizes", vs: [{ t: "13:53" }, { t: "14:04", a: true }] }, { c: "669A-10", sl: 2, lt0: "Princesa Isabel", lt1: "X", vs: [{ t: "13:59" }] }] } };

  it("converte a previsão e recomenda o ônibus certo", () => {
    const { arrivals } = parsePrediction(pred);
    expect(arrivals.map((a) => `${a.line}@${a.inMinutes}`)).toEqual(["875A-10@3", "669A-10@9", "875A-10@14"]);
    expect(arrivals[1]!.destination).toBe("Princesa Isabel");
    expect(parsePrediction(pred, ["669A-10"]).arrivals).toHaveLength(1);
    // Caminhada de 6 min: o das 13:53 não dá; o primeiro alcançável é o de 9 min.
    expect(recommend(arrivals, 6)).toMatchObject({ line: "669A-10", leaveInMinutes: 3 });
    // Compromisso em 40 min, viagem de 20: só o de 9 min chega com folga (9+20+5 ≤ 40); o de 14 também (39).
    expect(recommend(arrivals, 6, { minutesToEvent: 40, ride: 20 })).toMatchObject({ inMinutes: 14, fitsEvent: true });
    expect(recommend(arrivals, 6, { minutesToEvent: 20, ride: 20 })?.fitsEvent).toBe(false);
  });

  it("salva ponto, registra a partida do dia e paga a missão uma vez", async () => {
    process.env.SPTRANS_TOKEN = "token-teste";
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      if (url.includes("/Login/Autenticar")) return new Response("true", { status: 200, headers: { "set-cookie": "apiCredentials=abc; path=/" } });
      if (url.includes("/Previsao/Parada")) return json({ ...pred, hr: "13:50" });
      if (url.includes("/Parada/Buscar")) return json([{ cp: 340015329, np: "PAULISTA B/C", ed: "Av. Paulista, 1000" }]);
      throw new Error(url);
    });
    const found = (await agent.get("/api/transit/stops/search?q=paulista")).body;
    expect(found[0]).toMatchObject({ code: 340015329 });
    const st = await agent.post("/api/transit/stops").send({ code: 340015329, name: "PAULISTA B/C", walkMinutes: 2 });
    expect(st.status).toBe(201);
    const o = (await agent.get("/api/transit")).body;
    // Sem GTFS importado, as passagens vêm só do Olho Vivo (ao vivo).
    expect(o.stops[0].passes[0]).toMatchObject({ line: "875A-10", inMinutes: 3, source: "ao vivo" });
    expect(o.live).toMatchObject({ enabled: true, ok: true });
    const dep = await agent.post("/api/transit/depart").send({ stopId: st.body.id });
    expect(dep.status).toBe(201);
    expect(dep.body).toMatchObject({ onTime: true, xp: 15 });
    expect((await agent.post("/api/transit/depart").send({ stopId: st.body.id })).status).toBe(409);
    expect(await xpOf(userId, "source_type = 'transit'")).toBe(15);
    const other = await createAuthenticatedAgent();
    expect((await other.agent.delete(`/api/transit/stops/${st.body.id}`)).status).toBe(404);
  });
});

describe("Hora de Sair: login tolerante", () => {
  it("aceita o token entre aspas e tenta o http quando o https não devolve true", async () => {
    const { agent } = await createAuthenticatedAgent();
    const bases: string[] = [];
    setIntegrationFetchForTests(async (url, init) => {
      expect(new Headers(init?.headers).get("User-Agent")).toContain("LifeOS");
      expect(url).toContain("token=abc123token456");
      bases.push(url.startsWith("https:") ? "https" : "http");
      return url.startsWith("https:") ? new Response("<html>redirect</html>", { status: 200 }) : new Response('"true"', { status: 200 });
    });
    const r = await agent.put("/api/public-keys/sptrans").send({ key: '"abc123token456"' });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("pessoal");
    expect(bases).toEqual(["https", "http"]);
  });

  it("só diz que recusou quando nenhum endereço aceitou", async () => {
    const { agent } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async () => new Response("false", { status: 200 }));
    const r = await agent.put("/api/public-keys/sptrans").send({ key: "abc123token456" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/recusou/);
  });
});

/* ───────────── Pergaminho do Dia ───────────── */
describe("Pergaminho do Dia (Wikipédia)", () => {
  it("lê o feed, guarda o pergaminho uma vez por dia e usa cache", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    let calls = 0;
    setIntegrationFetchForTests(async (url) => {
      calls++;
      expect(url).toContain("pt.wikipedia.org/api/rest_v1/feed/onthisday/selected/");
      return json({ selected: [{ text: "Alfred Nobel assina seu testamento em Paris.", year: 1895, pages: [{ titles: { normalized: "Alfred Nobel" }, thumbnail: { source: "https://upload.wikimedia.org/x.jpg" }, content_urls: { desktop: { page: "https://pt.wikipedia.org/wiki/Alfred_Nobel" } } }] }] });
    });
    const o = (await agent.get("/api/lore")).body;
    expect(o.facts[0]).toMatchObject({ year: 1895, pageTitle: "Alfred Nobel" });
    await agent.get("/api/lore");
    expect(calls).toBe(1);
    const r = await agent.post("/api/lore/read").send({ index: 0 });
    expect(r.status).toBe(201);
    expect(r.body.xp).toBe(5);
    expect((await agent.post("/api/lore/read").send({ index: 0 })).status).toBe(409);
    const after = (await agent.get("/api/lore")).body;
    expect(after.total).toBe(1);
    expect(after.streak).toBe(1);
    expect(await xpOf(userId, "source_type = 'lore'")).toBe(5);
  });
});

/* ───────────── Vitral do Céu ───────────── */
describe("Vitral do Céu (NASA APOD)", () => {
  it("busca os 7 dias com a DEMO_KEY, coleciona uma vez e recusa datas fora da janela", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const { today } = await userDayContext(getDb(), userId);
    // Data distante para não colidir com o cache global de outros testes.
    setIntegrationFetchForTests(async (url) => {
      expect(url).toContain("api_key=DEMO_KEY");
      return json([{ date: today, title: "Nebulosa da Águia", explanation: "Texto", media_type: "image", url: "http://apod.nasa.gov/a.jpg", copyright: "Fulano" }]);
    });
    const o = (await agent.get("/api/sky")).body;
    expect(o.usingDemoKey).toBe(true);
    expect(o.today).toMatchObject({ title: "Nebulosa da Águia", thumbUrl: "https://apod.nasa.gov/a.jpg" });
    const c = await agent.post("/api/sky/collect").send({ date: today });
    expect(c.status).toBe(201);
    expect(c.body.xp).toBe(5);
    expect((await agent.post("/api/sky/collect").send({ date: today })).status).toBe(409);
    expect((await agent.post("/api/sky/collect").send({ date: "2001-01-01" })).status).toBe(400);
  });
});

/* ───────────── Sala de Cinema ───────────── */
describe("Sala de Cinema (TMDB)", () => {
  it("adiciona, marca como visto com nota, paga XP e a meta do mês", async () => {
    process.env.TMDB_API_KEY = "abc123";
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      expect(url).toContain("api_key=abc123");
      if (url.includes("/movie/603")) return json({ id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-31", poster_path: "/m.jpg", runtime: 136, genres: [{ id: 28, name: "Ação" }, { id: 878, name: "Ficção científica" }] });
      if (url.includes("/genre/")) return json({ genres: [{ id: 28, name: "Ação" }] });
      if (url.includes("/search/multi")) return json({ results: [{ id: 603, media_type: "movie", title: "Matrix", genre_ids: [28] }, { id: 1, media_type: "person", name: "X" }] });
      throw new Error(url);
    });
    const s = (await agent.get("/api/cinema/search?q=matrix")).body;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tmdbId: 603, genres: ["Ação"], mine: null });
    await agent.put("/api/cinema/goal").send({ goal: 1 });
    const add = await agent.post("/api/cinema/items").send({ mediaType: "movie", tmdbId: 603 });
    expect(add.status).toBe(201);
    expect((await agent.post("/api/cinema/items").send({ mediaType: "movie", tmdbId: 603 })).status).toBe(409);
    const upd = await agent.patch(`/api/cinema/items/${add.body.id}`).send({ status: "visto", rating: 9, review: "Clássico." });
    expect(upd.body).toMatchObject({ xp: 60, monthGoal: true });
    const o = (await agent.get("/api/cinema")).body;
    expect(o.stats).toMatchObject({ watched: 1, month: 1, avgRating: 9, movieMinutes: 136 });
    expect(o.genres.map((g: { name: string }) => g.name)).toEqual(["Ação", "Ficção científica"]);
    expect(await xpOf(userId, "source_type = 'cinema'")).toBe(60);
    const other = await createAuthenticatedAgent();
    expect((await other.agent.patch(`/api/cinema/items/${add.body.id}`).send({ rating: 1 })).status).toBe(404);
  });
});

/* ───────────── Termômetro do Reino ───────────── */
describe("Termômetro do Reino (Banco Central)", () => {
  it("compacta séries diárias e calcula taxa no período", () => {
    const pts = [{ date: "2031-01-02", value: 1 }, { date: "2031-01-31", value: 2 }, { date: "2031-02-03", value: 3 }];
    expect(compactSeries(pts, true).map((p) => p.value)).toEqual([2, 3]);
    expect(compactSeries(pts, false)).toHaveLength(3);
    expect(periodRate(10, 365)).toBeCloseTo(10, 5);
    expect(periodRate(10, 7)).toBeCloseTo(0.1829, 3);
  });

  it("lê o SGS e monta o termômetro com juro real", async () => {
    const { agent } = await createAuthenticatedAgent();
    await getDb().execute("DELETE FROM sgs_fetch");
    setIntegrationFetchForTests(async (url) => {
      const series = Number(/sgs\.(\d+)/.exec(url)?.[1]);
      const v: Record<number, string> = { 432: "15.00", 4389: "14.90", 13522: "4.68", 433: "0.26", 195: "0.6700" };
      return json([{ data: "01/10/2031", valor: v[series] ?? "1" }]);
    });
    const o = (await agent.get("/api/thermometer")).body;
    expect(o.available).toBe(true);
    expect(o.selic.value).toBe(15);
    expect(o.realRate).toBeCloseTo((1.149 / 1.0468 - 1) * 100, 5);
    expect(o.plans.length).toBeGreaterThan(0);
    expect(o.plans[0].cdiSamePeriodPct).toBeGreaterThan(0);
  });
});

/* ───────────── WakaTime (token OAuth pessoal) ───────────── */
describe("WakaTime: token OAuth pessoal", () => {
  it("limpa o token colado, usa Bearer com User-Agent e cai para ?api_key= se o Bearer for recusado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const seen: string[] = [];
    setIntegrationFetchForTests(async (url, init) => {
      const h = new Headers(init?.headers);
      expect(h.get("User-Agent")).toContain("LifeOS");
      if (url.includes("/users/current/summaries")) return json({ data: [] });
      if (h.get("Authorization")) {
        seen.push("bearer");
        expect(h.get("Authorization")).toBe("Bearer waka_tok_abc123def456ghi789");
        return json({ error: "Unauthorized" }, 401);
      }
      seen.push("query");
      expect(url).toContain("api_key=waka_tok_abc123def456ghi789");
      return json({ data: { username: "vini", display_name: "Vini" } });
    });
    const r = await agent.post("/api/wakatime/connect").send({ key: ' "waka_tok_abc123def456ghi789"\n' });
    expect(r.status).toBe(201);
    expect(r.body.username).toBe("vini");
    expect(seen.slice(0, 2)).toEqual(["bearer", "query"]);
  });

  it("recusa a Secret API Key do plugin sem nem chamar o WakaTime", async () => {
    const { agent } = await createAuthenticatedAgent();
    let calls = 0;
    setIntegrationFetchForTests(async () => (calls++, json({})));
    // Montada em tempo de execução: o literal no formato de chave seria barrado pelo secret scanning do GitHub.
    const pluginKey = ["waka", ["00000000", "1111", "4222", "8333", "444444444444"].join("-")].join("_");
    const r = await agent.post("/api/wakatime/connect").send({ key: pluginKey });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/wakatime.com\/oauth/);
    expect(calls).toBe(0);
  });

  it("explica o motivo quando o WakaTime nega (403), sem vazar o token", async () => {
    const { agent } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async () => json({ error: "Forbidden." }, 403));
    const r = await agent.post("/api/wakatime/connect").send({ key: "waka_tok_abc123def456ghi789" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/403/);
    expect(r.body.error).not.toContain("waka_tok_abc");
  });
});
