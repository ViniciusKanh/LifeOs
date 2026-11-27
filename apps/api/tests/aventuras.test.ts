import { afterEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { computeMaxHp, simulateRaid, strikesFromHits, weekBounds } from "../src/services/raidService.js";
import type { ActivityHit } from "../src/services/activitySignals.js";
import { computeStatus, resolveAppearance, stageForXp, traitsFromHits } from "../src/services/companionService.js";
import { cellsAround } from "../src/services/atlasService.js";
import { dailyFromSnapshots, getSteamGame, syncSteamAchievements, writeSnapshots } from "../src/services/steamService.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { encryptSecret } from "../src/services/cryptoService.js";

afterEach(() => setIntegrationFetchForTests(null));

const hit = (kind: ActivityHit["kind"], day: string, i = 0, minutes: number | null = null): ActivityHit => ({ kind, id: `${kind}:${day}:${i}`, at: `${day}T15:00:00.000Z`, day, label: kind, minutes, boost: 1 });

/* ───────────── Raid ───────────── */

describe("Chefe da Semana (Raid)", () => {
  it("semana vai de segunda a domingo", () => {
    expect(weekBounds("2026-11-22")).toEqual({ start: "2026-11-16", end: "2026-11-22" }); // domingo
    expect(weekBounds("2026-11-23")).toEqual({ start: "2026-11-23", end: "2026-11-29" }); // segunda
  });

  it("vida acompanha o histórico com piso, teto e dificuldade", () => {
    expect(computeMaxHp(0, "normal", 1)).toBeGreaterThanOrEqual(1500);
    expect(computeMaxHp(10_000_000, "desafiador", 99)).toBe(60000);
    expect(computeMaxHp(8000, "leve", 10)).toBeLessThan(computeMaxHp(8000, "desafiador", 10));
  });

  it("limita golpes repetidos por dia e aplica fator de duração", () => {
    const hits = Array.from({ length: 20 }, (_, i) => hit("tarefa", "2026-11-17", i));
    expect(strikesFromHits(hits, null)).toHaveLength(15);
    const [long] = strikesFromHits([hit("treino", "2026-11-17", 0, 90)], null);
    const [short] = strikesFromHits([hit("treino", "2026-11-17", 1, 10)], null);
    expect(long!.damage).toBe(360);
    expect(short!.damage).toBe(90);
    const [boosted] = strikesFromHits([hit("estudo", "2026-11-17", 0, 45)], { families: ["estudo"], pct: 20 });
    expect(boosted!.damage).toBe(180);
  });

  it("cura uma vez por dia parado, com teto semanal e respeitando descanso", () => {
    const strikes = strikesFromHits([hit("tarefa", "2026-11-16", 0)], null);
    const opts = { weekStart: "2026-11-16", weekEnd: "2026-11-22", today: "2026-11-22", healingEnabled: true, restWeekdays: [] as number[], restDays: new Set<string>() };
    const sim = simulateRaid(10000, strikes, opts);
    // 5 dias parados (ter–sáb) × 4% = 20%, mas o teto é 12% e a cura nunca passa do dano sofrido.
    expect(sim.healed).toBe(100);
    const big = simulateRaid(10000, strikesFromHits(Array.from({ length: 15 }, (_, i) => hit("tarefa", "2026-11-16", i)), null), opts);
    expect(big.healed).toBe(1200);
    expect(big.heals.every((h) => h.amount <= 400)).toBe(true);
    const rest = simulateRaid(10000, strikes, { ...opts, restWeekdays: [2, 3, 4, 5, 6] });
    expect(rest.healed).toBe(0);
    const off = simulateRaid(10000, strikes, { ...opts, healingEnabled: false });
    expect(off.healed).toBe(0);
  });

  it("dano vem de atividades reais, não duplica e a derrota paga uma única vez", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    const first = await agent.get("/api/raid");
    expect(first.status).toBe(200);
    expect(first.body.state).toBe("nao_iniciada");
    expect(first.body.raid.hp).toBe(first.body.raid.maxHp);
    for (let i = 0; i < 3; i++) {
      await db.execute({ sql: "INSERT INTO tasks (id, owner_id, title, status, completed_at) VALUES (?, ?, ?, 'Concluído', ?)", args: [nanoid(), userId, `Missão ${i}`, new Date().toISOString()] });
    }
    const a = await agent.get("/api/raid");
    const b = await agent.get("/api/raid");
    expect(a.body.damage.total).toBeGreaterThanOrEqual(300);
    expect(b.body.damage.total).toBe(a.body.damage.total);
    expect(a.body.recentStrikes[0].family).toBe("tarefas");

    await db.execute({ sql: "UPDATE raids SET max_hp = 100 WHERE owner_id = ?", args: [userId] });
    const won = await agent.get("/api/raid");
    expect(won.body.state).toBe("derrotado");
    expect(won.body.raid.rewarded).toBe(true);
    await agent.get("/api/raid");
    const xp = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'raid'", args: [userId] });
    expect(Number(xp.rows[0]!.n)).toBe(1);
    const ev = await db.execute({ sql: "SELECT COUNT(*) AS n FROM world_events WHERE owner_id = ? AND type = 'raid_defeated'", args: [userId] });
    expect(Number(ev.rows[0]!.n)).toBe(1);
    const inv = await agent.get("/api/inventory");
    expect(JSON.stringify(inv.body)).toContain("trophy:raid:");
  });

  it("valida configurações e dias de descanso", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.put("/api/raid/settings").send({ difficulty: "desafiador", healingEnabled: false, restWeekdays: [0] })).status).toBe(200);
    expect((await agent.put("/api/raid/settings").send({ difficulty: "impossivel", healingEnabled: true, restWeekdays: [] })).status).toBe(400);
    expect((await agent.put("/api/raid/rest-days/2001-01-01").send({ rest: true })).status).toBe(400);
  });
});

/* ───────────── Companheiro ───────────── */

describe("Companheiro", () => {
  it("estágios, traços e aparência derivados da rotina", () => {
    expect(stageForXp(0).stage.key).toBe("filhote");
    expect(stageForXp(900).stage.key).toBe("explorador");
    expect(stageForXp(99999).next).toBeNull();
    const traits = traitsFromHits(Array.from({ length: 9 }, (_, i) => hit("commit", "2026-11-10", i)));
    expect(traits.find((t) => t.key === "dev")!.active).toBe(true);
    const look = resolveAppearance({}, ["coleira", "headset"], traits);
    expect(look).toEqual({ pescoco: "coleira", cabeca: "headset", costas: null });
    expect(resolveAppearance({ cabeca: null }, ["headset"], traits).cabeca).toBeNull();
  });

  it("status tem piso (nunca morre) e humor reage", () => {
    const st = computeStatus({}, { now: new Date("2026-11-20T15:00:00Z"), tz: "UTC", activeToday: false, lastActivity: null, careDays7: 0, activeDays7: 0 });
    expect(st.fome).toBeGreaterThanOrEqual(10);
    expect(st.energia).toBeGreaterThanOrEqual(15);
    expect(st.mood).not.toBe("feliz");
    const focused = computeStatus(
      { alimentar: "2026-11-20T14:00:00Z", hidratar: "2026-11-20T14:00:00Z", brincar: "2026-11-20T14:00:00Z", descansar: "2026-11-20T09:00:00Z" },
      { now: new Date("2026-11-20T15:00:00Z"), tz: "UTC", activeToday: true, lastActivity: { ...hit("commit", "2026-11-20"), at: "2026-11-20T14:40:00Z" }, careDays7: 3, activeDays7: 3 }
    );
    expect(focused.mood).toBe("focado");
  });

  it("adoção, cuidados com cooldown, XP limitado e persistência", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    expect((await agent.get("/api/companion")).body.adopted).toBe(false);
    expect((await agent.post("/api/companion/care/alimentar")).status).toBe(404);
    const adopt = await agent.post("/api/companion/adopt").send({ name: "Rex", color: "cinza" });
    expect(adopt.status).toBe(201);
    expect(adopt.body.companion.stage.key).toBe("filhote");
    const fed = await agent.post("/api/companion/care/alimentar");
    expect(fed.status).toBe(200);
    expect(fed.body.companion.care.today).toContain("alimentar");
    expect((await agent.post("/api/companion/care/alimentar")).status).toBe(429);
    expect((await agent.patch("/api/companion").send({ equipped: { cabeca: "coleira" } })).status).toBe(400);
    expect((await agent.patch("/api/companion").send({ name: "Rex II", equipped: { pescoco: "coleira" } })).status).toBe(200);
    const again = await agent.get("/api/companion");
    expect(again.body.companion.name).toBe("Rex II");
    expect(again.body.companion.appearance.pescoco).toBe("coleira");
    const xp = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'companion'", args: [userId] });
    expect(Number(xp.rows[0]!.n)).toBe(1);
  });
});

/* ───────────── Atlas ───────────── */

describe("Atlas de Exploração", () => {
  it("check-in revela 3×3 células", () => {
    expect(cellsAround(-23.55, -46.63, 1)).toHaveLength(9);
  });

  it("check-in manual revela só o entorno, revisita não duplica descoberta e GPS exige consentimento", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    setIntegrationFetchForTests(async () =>
      new Response(JSON.stringify({ lat: "-23.52", lon: "-46.54", osm_type: "node", osm_id: 42, name: "Basílica da Penha", display_name: "Basílica da Penha, Penha", category: "amenity", type: "place_of_worship", address: { suburb: "Penha", city: "São Paulo", state: "São Paulo", country: "Brasil", country_code: "br" } }), { status: 200 })
    );
    const c1 = await agent.post("/api/atlas/checkins").send({ lat: -23.5201, lng: -46.5402, method: "manual" });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ isNewPlace: true, revealedCells: 9 });
    expect(c1.body.xp).toBeGreaterThan(40);
    const c2 = await agent.post("/api/atlas/checkins").send({ lat: -23.5201, lng: -46.5402, method: "manual" });
    expect(c2.body).toMatchObject({ isNewPlace: false, revealedCells: 0 });
    expect((await agent.post("/api/atlas/checkins").send({ lat: -23.5, lng: -46.5, method: "localizacao" })).status).toBe(403);
    await agent.put("/api/atlas/settings").send({ locationEnabled: true });
    const gps = await agent.post("/api/atlas/checkins").send({ name: "Parque", lat: -23.512345, lng: -46.598765, method: "localizacao", city: "São Paulo", state: "São Paulo", country: "Brasil" });
    expect(gps.status).toBe(201);
    const place = await getDb().execute({ sql: "SELECT lat, lng FROM atlas_places WHERE id = ?", args: [gps.body.placeId] });
    expect(place.rows[0]).toMatchObject({ lat: -23.512, lng: -46.599 }); // precisão aproximada por padrão

    const ov = await agent.get("/api/atlas");
    expect(ov.body.progress).toMatchObject({ places: 2, cities: 1, neighborhoods: 1 });
    expect(ov.body.cells.length).toBeGreaterThanOrEqual(9);
    await agent.delete(`/api/atlas/places/${gps.body.placeId}`);
    expect((await agent.get("/api/atlas")).body.cells).toHaveLength(9);
    expect((await agent.delete("/api/atlas/history").send({ confirm: "nao" })).status).toBe(400);
    expect((await agent.delete("/api/atlas/history").send({ confirm: "APAGAR" })).status).toBe(200);
    const left = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM atlas_cells WHERE owner_id = ?", args: [userId] });
    expect(Number(left.rows[0]!.n)).toBe(0);
  });

  it("diário valida foto", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/atlas/journal").send({ title: "Passeio", visitedOn: "2026-11-20", photo: "javascript:alert(1)" })).status).toBe(400);
    const ok = await agent.post("/api/atlas/journal").send({ title: "Passeio", visitedOn: "2026-11-20", rating: 5, photo: "data:image/png;base64,iVBORw0KGgo=" });
    expect(ok.status).toBe(201);
    expect((await agent.get(`/api/atlas/journal/${ok.body.id}/photo`)).body.photo).toContain("data:image/png");
  });
});

/* ───────────── Steam ───────────── */

describe("Tempo de Jogo (Steam)", () => {
  it("tempo diário só existe com snapshots e intervalos maiores ficam marcados", () => {
    const d = dailyFromSnapshots(
      [
        { day: "2026-11-15", total: 1000 },
        { day: "2026-11-16", total: 1090 },
        { day: "2026-11-19", total: 1300 },
      ],
      "2026-11-15",
      "2026-11-20"
    );
    expect(d.map((x) => x.minutes)).toEqual([null, 90, null, null, 210, null]);
    expect(d[4]!.spanDays).toBe(3);
  });

  it("snapshot por jogo só quando muda, troféu fixado entra uma vez na Coleção", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    await db.execute({ sql: "INSERT INTO steam_accounts (owner_id, steam_id, persona_name, visibility) VALUES (?, '76561198000000000', 'vitor', 3)", args: [userId] });
    const games = [{ appid: 10, name: "Jogo A", playtime_forever: 100 }, { appid: 20, name: "Jogo B", playtime_forever: 0 }];
    await writeSnapshots(db, userId, "2026-11-20", games, "2026-11-20T20:00:00Z");
    await writeSnapshots(db, userId, "2026-11-21", games, "2026-11-21T20:00:00Z");
    const snaps = await db.execute({ sql: "SELECT appid, day_key FROM steam_playtime_snapshots WHERE owner_id = ? ORDER BY day_key, appid", args: [userId] });
    expect(snaps.rows.map((r) => `${r.appid}@${r.day_key}`)).toEqual(["0@2026-11-20", "10@2026-11-20", "0@2026-11-21"]);
    await db.execute({ sql: "INSERT INTO steam_games (owner_id, appid, name) VALUES (?, 10, 'Jogo A')", args: [userId] });
    await db.execute({ sql: "INSERT INTO steam_achievements (owner_id, appid, api_name, name, unlock_time) VALUES (?, 10, 'BOSS', 'Herói', 1700000000)", args: [userId] });
    expect((await agent.post("/api/integrations/steam/trophies").send({ appid: 10, apiName: "BOSS", pin: true })).status).toBe(200);
    expect((await agent.post("/api/integrations/steam/trophies").send({ appid: 10, apiName: "BOSS", pin: true })).status).toBe(200);
    const inv = await db.execute({ sql: "SELECT COUNT(*) AS n FROM inventory_transactions WHERE owner_id = ? AND item_key = 'trophy:steam:10:BOSS'", args: [userId] });
    expect(Number(inv.rows[0]!.n)).toBe(1);
    expect((await agent.post("/api/integrations/steam/trophies").send({ appid: 10, apiName: "NADA", pin: true })).status).toBe(404);
  });

  it("admin_settings aceita a credencial da Steam (migration 0107)", async () => {
    const db = getDb();
    for (const integration of ["steam"]) {
      await db.execute({ sql: "INSERT OR REPLACE INTO admin_settings (id, integration, key_name, encrypted_value, is_active) VALUES (?, ?, 'teste', ?, 1)", args: [nanoid(), integration, encryptSecret("x")] });
    }
    const r = await db.execute("SELECT COUNT(*) AS n FROM admin_settings WHERE key_name = 'teste'");
    expect(Number(r.rows[0]!.n)).toBe(1);
    await db.execute("DELETE FROM admin_settings WHERE key_name = 'teste'");
  });

  it("conquistas: lê em lote, classifica jogo sem conquistas sem repetir chamadas e mostra bloqueadas no detalhe", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const db = getDb();
    process.env.STEAM_WEB_API_KEY = "chave-teste";
    await db.execute({ sql: "INSERT INTO steam_accounts (owner_id, steam_id, persona_name, visibility, connected_at) VALUES (?, '76561198000000001', 'v', 3, '2020-01-01 00:00:00')", args: [userId] });
    await db.execute({ sql: "INSERT INTO steam_games (owner_id, appid, name, playtime_forever, rtime_last_played) VALUES (?, 10, 'Com conquistas', 300, 1700000000), (?, 20, 'Sem conquistas', 100, 1600000000), (?, 30, 'Nunca jogado', 0, NULL)", args: [userId, userId, userId] });
    const calls: string[] = [];
    setIntegrationFetchForTests(async (url) => {
      calls.push(url);
      if (url.includes("appid=20")) return new Response(JSON.stringify({ playerstats: { error: "Requested app has no stats", success: false } }), { status: 400 });
      if (url.includes("GetPlayerAchievements")) return new Response(JSON.stringify({ playerstats: { success: true, achievements: [{ apiname: "A1", achieved: 1, unlocktime: 1700000000, name: "Primeiro passo" }, { apiname: "A2", achieved: 0, unlocktime: 0, name: "Lenda" }] } }), { status: 200 });
      if (url.includes("GetSchemaForGame")) return new Response(JSON.stringify({ game: { availableGameStats: { achievements: [{ name: "A1", displayName: "Primeiro passo", icon: "https://x/a1.jpg" }, { name: "A2", displayName: "Lenda", icon: "https://x/a2.jpg", icongray: "https://x/a2g.jpg" }] } } }), { status: 200 });
      if (url.includes("GlobalAchievement")) return new Response(JSON.stringify({ achievementpercentages: { achievements: [{ name: "A1", percent: 81.2 }, { name: "A2", percent: "3.4" }] } }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const r = await syncSteamAchievements(db, userId);
    expect(r).toMatchObject({ checked: 2, newAchievements: 1, pending: 0 });
    // O jogo sem estatísticas foi consultado uma vez só (sem retentativas).
    expect(calls.filter((u) => u.includes("GetPlayerAchievements") && u.includes("appid=20"))).toHaveLength(1);
    const st = await db.execute({ sql: "SELECT appid, ach_status, ach_total, ach_unlocked FROM steam_games WHERE owner_id = ? ORDER BY appid", args: [userId] });
    expect(st.rows.map((x) => [x.appid, x.ach_status, x.ach_total, x.ach_unlocked])).toEqual([[10, "ok", 2, 1], [20, "sem_conquistas", null, null], [30, null, null, null]]);
    expect((await syncSteamAchievements(db, userId)).checked).toBe(0);
    const game = await getSteamGame(db, userId, 10);
    expect(game.achievements.map((a) => [a.apiName, a.achieved, a.globalPct])).toEqual([["A1", true, 81.2], ["A2", false, 3.4]]);
    expect(game.achievements[1]!.icon).toBe("https://x/a2g.jpg");
    const ov = await agent.get("/api/integrations/steam");
    expect(ov.body.achievementSync).toMatchObject({ playedGames: 2, withAchievements: 1, noAchievements: 1, pending: 0 });
    expect(ov.body.recentAchievements[0]).toMatchObject({ name: "Primeiro passo", game: "Com conquistas" });
    delete process.env.STEAM_WEB_API_KEY;
  });

  it("isolamento: um usuário não vê a Steam do outro e conectar exige configuração", async () => {
    const { agent } = await createAuthenticatedAgent();
    const ov = await agent.get("/api/integrations/steam");
    expect(ov.body.account).toBeNull();
    expect((await agent.get("/api/integrations/steam/connect")).status).toBe(503);
  });
});
