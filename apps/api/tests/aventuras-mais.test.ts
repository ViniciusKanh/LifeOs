import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { applyRecords, gameFromRaw, importGames, importPuzzles, resetChessDailyForTests } from "../src/services/chessArenaService.js";
import { aocDays, applyStars, cleanSession, latestEventYear, parseBoard, unlockAt } from "../src/services/adventOfCodeService.js";
import { buildOverpassQuery, kindFromNominatim, parseOverpass, pickMissions, poisFromNominatim, resetExpeditionCacheForTests } from "../src/services/expeditionService.js";
import { importSpecies, rarityOf } from "../src/services/bestiaryService.js";
import { podcastAuthHeaders, resetPodcastCacheForTests } from "../src/services/podcastService.js";
import { userDayContext } from "../src/services/localDayService.js";

afterEach(() => {
  setIntegrationFetchForTests(null);
  resetChessDailyForTests();
  resetExpeditionCacheForTests();
  resetPodcastCacheForTests();
  delete process.env.PODCASTINDEX_KEY;
  delete process.env.PODCASTINDEX_SECRET;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const xpOf = async (owner: string, where: string) => Number((await getDb().execute({ sql: `SELECT COALESCE(SUM(xp), 0) AS x FROM xp_events WHERE owner_id = ? AND ${where}`, args: [owner] })).rows[0]?.x ?? 0);
const past = "2000-01-01T00:00:00.000Z";

/* ───────────── Arena de Xadrez ───────────── */
describe("Arena de Xadrez (Lichess)", () => {
  const game = (id: string, winner: "white" | "black" | undefined, at: number, rated = true) => ({ id, rated, speed: "blitz", lastMoveAt: at, winner, players: { white: { user: { id: "vini", name: "Vini" }, rating: 1490, ratingDiff: 6 }, black: { user: { id: "rival", name: "Rival" }, rating: 1500 } }, opening: { name: "Sicilian Defense" } });

  it("lê a partida do ponto de vista do usuário", () => {
    const g = gameFromRaw(game("g1", "black", Date.parse("2031-03-01T12:00:00Z")), "VINI", "America/Sao_Paulo");
    expect(g).toMatchObject({ color: "white", result: "derrota", opponent: "Rival", myRating: 1490, day: "2031-03-01" });
  });

  it("paga vitórias e puzzles só depois da conexão e uma vez só", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const now = Date.now();
    const since = new Date(now - 3600_000).toISOString();
    const games = [game("a1", "white", now - 60_000), game("a2", undefined, now - 50_000), game("a3", "white", now - 7200_000), game("a4", "white", now - 40_000, false)];
    const r1 = await importGames(db, userId, "vini", games, since, "UTC");
    const r2 = await importGames(db, userId, "vini", games, since, "UTC");
    expect(r1).toMatchObject({ added: 4, xp: 20 });
    expect(r2).toMatchObject({ added: 0, xp: 0 });
    await importPuzzles(db, userId, [{ date: now - 1000, win: true, puzzle: { id: "p1" } }, { date: now - 1000, win: false, puzzle: { id: "p2" } }, { date: now - 7200_000, win: true, puzzle: { id: "p3" } }], since, "UTC");
    expect(await xpOf(userId, "source_type = 'chess'")).toBe(25);
  });

  it("recorde: paga cada centena nova acima do pico, nunca o rating inicial", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({ sql: "INSERT INTO lichess_accounts (owner_id, username, peak_json) VALUES (?, 'vini', ?)", args: [userId, JSON.stringify({ blitz: 1480 })] });
    expect((await applyRecords(db, userId, { blitz: 1495 }, "2031-01-01")).xp).toBe(0);
    expect((await applyRecords(db, userId, { blitz: 1502, rapid: 1600 }, "2031-01-01")).xp).toBe(50);
    expect((await applyRecords(db, userId, { blitz: 1490 }, "2031-01-02")).xp).toBe(0);
    expect((await applyRecords(db, userId, { blitz: 1505 }, "2031-01-03")).xp).toBe(0);
  });

  it("conecta pelo nome, recusa token de outra conta e mostra o puzzle do dia", async () => {
    const { agent } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      // O Lichess não diferencia maiúsculas no nome de usuário.
      if (url.toLowerCase().endsWith("/api/user/vini")) return json({ id: "vini", username: "Vini", perfs: { blitz: { games: 10, rating: 1490 } }, count: { all: 10, win: 6, loss: 3, draw: 1 } });
      if (url.endsWith("/api/account")) return json({ id: "outra" });
      if (url.includes("/rating-history")) return json([{ name: "Blitz", points: [[2031, 0, 1, 1450], [2031, 0, 2, 1490]] }]);
      if (url.includes("/api/games/user/")) return new Response(`${JSON.stringify({ id: "x1", rated: true, lastMoveAt: Date.now(), winner: "white", players: { white: { user: { id: "vini", name: "Vini" } }, black: { user: { id: "r", name: "R" } } } })}\n`, { status: 200 });
      if (url.endsWith("/api/puzzle/daily")) return json({ puzzle: { id: "Abc12", rating: 1900, plays: 100, themes: ["fork"] }, game: { perf: { name: "Blitz" } } });
      throw new Error(url);
    });
    const bad = await agent.post("/api/chess/connect").send({ username: "vini", token: "lip_abcdef" });
    expect(bad.status).toBe(422);
    const ok = await agent.post("/api/chess/connect").send({ username: "vini" });
    expect(ok.status).toBe(201);
    expect(ok.body.sync.error ?? "ok").toBe("ok");
    const o = (await agent.get("/api/chess")).body;
    expect(o.connected).toBe(true);
    expect(o.daily).toMatchObject({ id: "Abc12", solved: false });
    expect(o.perfs[0]).toMatchObject({ key: "blitz", rating: 1490 });
    expect(o.history[0].points).toHaveLength(2);
    expect(o.games).toHaveLength(1);
  });
});

/* ───────────── Advent of Code ───────────── */
describe("Advent of Code", () => {
  it("regras do calendário e limpeza do cookie", () => {
    expect(aocDays(2024)).toBe(25);
    expect(aocDays(2025)).toBe(12);
    expect(latestEventYear(new Date("2026-11-27T12:00:00Z"))).toBe(2025);
    expect(latestEventYear(new Date("2026-12-02T12:00:00Z"))).toBe(2026);
    expect(unlockAt(2026, 1)).toBe("2026-12-01T05:00:00.000Z");
    expect(cleanSession(" session=abc123; Path=/ ")).toBe("abc123");
  });

  it("estrelas novas pagam XP, chefe e evento completo dão bônus, nada em dobro", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const ts = Math.floor(Date.now() / 1000) - 60;
    const days: Record<string, Record<string, { get_star_ts: number }>> = {};
    for (let d = 1; d <= 12; d++) days[String(d)] = { "1": { get_star_ts: ts }, "2": { get_star_ts: ts } };
    const board = parseBoard({ owner_id: 7, members: { "7": { id: 7, name: "Vini", stars: 24, local_score: 300, completion_day_level: days }, "8": { id: 8, name: null, stars: 2, local_score: 20 } } });
    expect(board.members[0]!.name).toBe("Vini");
    expect(board.members[1]!.name).toBe("anônimo #8");
    const me = board.members[0];
    const connected = new Date(Date.now() - 3600_000).toISOString();
    const r1 = await applyStars(db, userId, 2025, me, connected, "UTC");
    const r2 = await applyStars(db, userId, 2025, me, connected, "UTC");
    expect(r1.newStars).toBe(24);
    expect(r1.xp).toBe(12 * 50 + 100 + 300);
    expect(r2).toMatchObject({ xp: 0, newStars: 0 });
  });

  it("estrelas de antes da conexão entram na coleção sem XP; sessão inválida vira mensagem clara", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const old = parseBoard({ members: { "1": { id: 1, name: "V", completion_day_level: { "1": { "1": { get_star_ts: 1700000000 } } } } } });
    expect((await applyStars(db, userId, 2023, old.members[0], new Date().toISOString(), "UTC")).xp).toBe(0);
    setIntegrationFetchForTests(async () => new Response("<html>login</html>", { status: 200 }));
    const r = await agent.post("/api/aoc/connect").send({ session: "a".repeat(96), leaderboardId: "123456" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/sessão/);
  });
});

/* ───────────── Expedições ───────────── */
describe("Expedições da Semana (Overpass)", () => {
  it("monta a consulta, lê o resultado e escolhe missões variadas e estáveis", () => {
    const q = buildOverpassQuery(-23.55, -46.63, 3000, ["parque", "museu"]);
    expect(q).toContain('nwr["amenity"="library"]'.slice(0, 0));
    expect(q).toContain("around:3000,-23.55000,-46.63000");
    const pois = parseOverpass({ elements: [
      { type: "way", id: 1, center: { lat: -23.56, lon: -46.62 }, tags: { leisure: "park", name: "Parque A" } },
      { type: "node", id: 2, lat: -23.55, lon: -46.64, tags: { tourism: "museum", name: "Museu B" } },
      { type: "node", id: 3, lat: -23.55, lon: -46.64, tags: { amenity: "library", name: "Biblioteca C" } },
      { type: "node", id: 4, lat: -23.55, lon: -46.64, tags: { amenity: "cafe", name: "Café" } },
      { type: "node", id: 5, lat: -23.55, lon: -46.64, tags: { tourism: "museum" } },
    ] });
    expect(pois.map((p) => p.osmRef)).toEqual(["w1", "n2", "n3"]);
    const withDist = pois.map((p, i) => ({ ...p, distanceM: 100 * (i + 1) }));
    const a = pickMissions(withDist, 3, "semana-1", new Set(["n3"]));
    expect(a.map((p) => p.osmRef).sort()).toEqual(["n2", "w1"]);
    expect(pickMissions(withDist, 2, "s", new Set())).toEqual(pickMissions(withDist, 2, "s", new Set()));
  });

  it("lê o Nominatim: classe OSM certa, dentro do raio, sem praças nem lugares sem nome", () => {
    expect(kindFromNominatim("tourism", "museum")).toBe("museu");
    expect(kindFromNominatim("historic", "monument")).toBe("cultura");
    expect(kindFromNominatim("amenity", "parking")).toBeNull();
    const pois = poisFromNominatim(
      [
        { place_id: 1, osm_type: "way", osm_id: 10, lat: "-23.551", lon: "-46.633", name: "Museu A", display_name: "Museu A, SP", category: "tourism", type: "museum" },
        { place_id: 2, osm_type: "way", osm_id: 11, lat: "-23.552", lon: "-46.633", name: "Praça B", display_name: "Praça B", category: "leisure", type: "park" },
        { place_id: 3, osm_type: "way", osm_id: 12, lat: "-23.552", lon: "-46.633", name: "", display_name: "Rua X", category: "leisure", type: "park" },
        { place_id: 4, osm_type: "node", osm_id: 13, lat: "-23.90", lon: "-46.633", name: "Museu Longe", display_name: "x", category: "tourism", type: "museum" },
        { place_id: 5, osm_type: "way", osm_id: 14, lat: "-23.553", lon: "-46.633", name: "Museu", display_name: "x", category: "amenity", type: "parking" },
      ],
      { lat: -23.55, lng: -46.633 },
      3000,
    );
    expect(pois.map((p) => `${p.osmRef}:${p.kind}`)).toEqual(["w10:museu"]);
  });

  it("gera 3 missões na cidade do usuário (Nominatim) e conclui com o check-in do Atlas", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({ sql: "UPDATE user_settings SET context_city = 'São Paulo', context_latitude = -23.55, context_longitude = -46.63, context_timezone = 'America/Sao_Paulo' WHERE user_id = ?", args: [userId] });
    let n = 0;
    setIntegrationFetchForTests(async (url) => {
      expect(url).toContain("nominatim.openstreetmap.org/search");
      expect(url).toContain("bounded=1");
      n++;
      // Cada termo devolve um lugar diferente, a ~1 km um do outro.
      return json([{ place_id: n, osm_type: "node", osm_id: 100 + n, lat: String(-23.55 + n / 100), lon: "-46.63", name: `Lugar ${n}`, display_name: `Lugar ${n}`, category: n % 2 ? "tourism" : "amenity", type: n % 2 ? "museum" : "library" }]);
    });
    await db.execute({ sql: "INSERT INTO expedition_settings (owner_id, radius_m, kinds_json) VALUES (?, 15000, '[\"museu\",\"biblioteca\",\"cultura\",\"mirante\"]')", args: [userId] });
    const o = (await agent.get("/api/expeditions")).body;
    expect(o.configured).toBe(true);
    expect(o.unavailable).toBeNull();
    expect(o.missions).toHaveLength(3);
    const m = o.missions[0];
    const swap = await agent.post(`/api/expeditions/${o.missions[1].id}/swap`);
    expect(swap.status).toBe(200);
    expect(swap.body.swapsLeft).toBe(0);
    expect((await agent.post(`/api/expeditions/${swap.body.missions[1].id}/swap`)).status).toBe(409);
    // Check-in normal do Atlas no lugar da missão.
    await db.execute({ sql: "INSERT INTO atlas_places (id, owner_id, name, lat, lng, osm_ref, visits, last_visit_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", args: [nanoid(), userId, m.name, m.lat, m.lng, m.osmRef, new Date().toISOString()] });
    const after = (await agent.get("/api/expeditions")).body;
    expect(after.missions.find((x: { id: string }) => x.id === m.id).status).toBe("concluida");
    expect(await xpOf(userId, "source_type = 'expedition'")).toBe(25);
    const other = await createAuthenticatedAgent();
    expect((await other.agent.post(`/api/expeditions/${m.id}/swap`)).status).toBe(404);
  });

});

/* ───────────── Bestiário ───────────── */
describe("Bestiário (iNaturalist)", () => {
  const sp = (id: number, n: number) => ({ count: 1, taxon: { id, name: `Species ${id}`, preferred_common_name: `Espécie ${id}`, observations_count: n, iconic_taxon_name: "Aves" } });

  it("raridade pelo total mundial", () => {
    expect([rarityOf(100), rarityOf(4000), rarityOf(40000), rarityOf(200000), rarityOf(2e6)]).toEqual(["lendaria", "epica", "rara", "incomum", "comum"]);
  });

  it("primeira sincronização sem XP; espécies novas pagam com bônus de raridade, uma vez", async () => {
    const { userId } = await createAuthenticatedAgent();
    const db = getDb();
    const { today } = await userDayContext(db, userId);
    expect((await importSpecies(db, userId, [sp(1, 2e6)], true, today)).xp).toBe(0);
    const r = await importSpecies(db, userId, [sp(1, 2e6), sp(2, 300), sp(3, 40000)], false, today);
    expect(r).toMatchObject({ newSpecies: 2, xp: 70 + 25 });
    expect((await importSpecies(db, userId, [sp(2, 300)], false, today)).xp).toBe(0);
  });

  it("conecta pelo login e monta a coleção", async () => {
    const { agent } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url) => {
      if (url.includes("/users/autocomplete")) return json({ results: [{ login: "vini_nat", observations_count: 12 }] });
      if (url.includes("species_counts")) return json({ total_results: 2, results: [sp(10, 100), sp(11, 1e6)] });
      if (url.includes("/observations?")) return json({ total_results: 12 });
      throw new Error(url);
    });
    expect((await agent.post("/api/bestiary/connect").send({ login: "@vini_nat" })).status).toBe(201);
    const o = (await agent.get("/api/bestiary")).body;
    expect(o.total).toBe(2);
    expect(o.byRarity.lendaria).toBe(1);
    expect(o.species[0].rarity).toBe("lendaria");
    expect((await agent.post("/api/bestiary/connect").send({ login: "ninguem" })).status).toBe(404);
  });
});

/* ───────────── Leitura em Áudio ───────────── */
describe("Leitura em Áudio (Podcast Index)", () => {
  it("assina a requisição com SHA-1 de chave + segredo + data", () => {
    const h = podcastAuthHeaders("KEY", "SECRET", 1_700_000_000_000);
    expect(h["X-Auth-Date"]).toBe("1700000000");
    expect(h.Authorization).toMatch(/^[0-9a-f]{40}$/);
  });

  it("segue, marca episódio ouvido com a duração real e paga blocos de 30 min", async () => {
    process.env.PODCASTINDEX_KEY = "KEYKEYKEYKEY";
    process.env.PODCASTINDEX_SECRET = "SECRETSECRETSECRETSECRET";
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async (url, init) => {
      expect(new Headers(init?.headers).get("X-Auth-Key")).toBe("KEYKEYKEYKEY");
      if (url.includes("/podcasts/byfeedid")) return json({ feed: { id: 99, title: "Data Hackers", author: "DH", image: "http://img/x.jpg" } });
      if (url.includes("/episodes/byfeedid")) return json({ items: [{ id: 501, feedId: 99, title: "Ep 1", duration: 3700, datePublished: 1700000000, enclosureUrl: "http://a/x.mp3" }] });
      if (url.includes("/episodes/byid")) return json({ episode: { id: 501, feedId: 99, title: "Ep 1", duration: 3700 } });
      throw new Error(url);
    });
    expect((await agent.post("/api/podcasts/follows").send({ feedId: 99 })).status).toBe(201);
    const o = (await agent.get("/api/podcasts")).body;
    expect(o.key.source).toBe("servidor");
    expect(o.episodes[0]).toMatchObject({ episodeId: 501, podcastTitle: "Data Hackers", audioUrl: "https://a/x.mp3", listened: false });
    const l = await agent.post("/api/podcasts/listens").send({ episodeId: 501 });
    expect(l.status).toBe(201);
    expect(l.body.xp).toBe(5 + 20);
    expect((await agent.post("/api/podcasts/listens").send({ episodeId: 501 })).status).toBe(409);
    expect(await xpOf(userId, "source_type = 'podcast'")).toBe(25);
    const other = await createAuthenticatedAgent();
    expect((await other.agent.get("/api/podcasts")).body.follows).toHaveLength(0);
  });
});
