import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { gtfsSeconds, headwayAt, parseCsv, readZip, resetGtfsCacheForTests, scheduledPasses } from "../src/services/gtfsService.js";
import { mergeLive, planFrom, resetTransitSessionsForTests } from "../src/services/transitService.js";

/** .zip "stored" (sem compressão) — o leitor aceita os dois métodos. */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const n = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Três pontos em linha (~1,1 km entre cada) e duas linhas.
const FEED = makeZip({
  "agency.txt": '"agency_id","agency_name","agency_url","agency_timezone"\n"1","SPTRANS","http://www.sptrans.com.br/?versao=030626","America/Sao_Paulo"\n',
  "calendar.txt": '"service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"\n"USD","1","1","1","1","1","1","1","20231001","20271231"\n',
  "routes.txt": '"route_id","agency_id","route_short_name","route_long_name","route_type","route_color","route_text_color"\n"875A-10","1","875A-10","Perdizes - Aclimação","3","002F6C","FFFFFF"\n"669A-10","1","669A-10","Volta, de outro jeito","3","FF671F","FFFFFF"\n',
  "trips.txt": '"route_id","service_id","trip_id","trip_headsign","direction_id","shape_id"\n"875A-10","USD","875A-10-0","Perdizes","0","1"\n"669A-10","USD","669A-10-1","Centro","1","2"\n',
  "stops.txt": 'stop_id,"stop_name","stop_desc",stop_lat,stop_lon\n1001,"Av. Paulista, 200","Ref.: R Leoncio",-23.5700,-46.6450\n1002,"Pça. Oswaldo Cruz","",-23.5600,-46.6400\n1003,"Metrô Santana","",-23.5500,-46.6350\n',
  "frequencies.txt": '"trip_id","start_time","end_time","headway_secs"\n"875A-10-0","00:00:00","23:59:59","600"\n"669A-10-1","00:00:00","23:59:59","900"\n',
  "stop_times.txt": '"trip_id","arrival_time","departure_time","stop_id","stop_sequence"\n"875A-10-0","07:00:00","07:00:00","1001","1"\n"875A-10-0","07:10:00","07:10:00","1002","2"\n"875A-10-0","07:20:00","07:20:00","1003","3"\n"669A-10-1","07:00:00","07:00:00","1002","1"\n"669A-10-1","07:08:00","07:08:00","1001","2"\n',
  "shapes.txt": "ignorado",
});

const fakeFetch = async (url: string) => {
  if (url.includes("gtfs")) return new Response(FEED, { status: 200 });
  if (url.includes("/route/v1/foot/")) return new Response(JSON.stringify({ code: "Ok", routes: [{ duration: 300, distance: 400 }] }), { status: 200 });
  throw new Error(`fetch inesperado: ${url}`);
};

afterEach(() => {
  setIntegrationFetchForTests(null);
  resetGtfsCacheForTests();
  resetTransitSessionsForTests();
});

async function importAll(agent: ReturnType<typeof request.agent>) {
  let step: number | null = 0;
  for (let i = 0; step != null && i < 10; i++) {
    const r = await agent.post("/api/transit/gtfs/import").send({ step });
    expect(r.status).toBe(200);
    step = r.body.nextStep;
  }
}

describe("GTFS: leitura", () => {
  it("lê .zip, CSV com vírgula entre aspas e horários acima de 24 h", () => {
    const files = readZip(FEED, new Set(["stops.txt"]));
    expect([...files.keys()]).toEqual(["stops.txt"]);
    const stops = parseCsv(files.get("stops.txt")!);
    expect(stops[0]).toMatchObject({ stop_id: "1001", stop_name: "Av. Paulista, 200", stop_desc: "Ref.: R Leoncio" });
    expect(gtfsSeconds("25:10:30")).toBe(25 * 3600 + 630);
  });

  it("calcula passagens pela frequência e o intervalo da faixa", () => {
    const f = [{ startSec: 7 * 3600, endSec: 8 * 3600, headwaySecs: 600 }, { startSec: 8 * 3600 + 60, endSec: 9 * 3600, headwaySecs: 1200 }];
    // Ponto a 5 min da origem; agora = 07:31 → saídas 07:30 (passa 07:35), 07:40 (07:45)...
    const p = scheduledPasses(f, 300, 7 * 3600 + 31 * 60, 9 * 3600, 3);
    expect(p.map((x) => x.atSec / 60 - 7 * 60)).toEqual([35, 45, 55]);
    expect(headwayAt(f, 8 * 3600 + 600)).toBe(20);
  });

  it("ao vivo substitui só a linha que o Olho Vivo trouxe", () => {
    const base = { stopId: 1, tripId: "t", headsign: "X", color: null, textColor: null, routeType: 3, at: "", headwayMin: 10, source: "programado" as const, accessible: false };
    const merged = mergeLive([{ ...base, line: "A", atSec: 100, inMinutes: 2 }, { ...base, line: "B", atSec: 200, inMinutes: 3 }], [{ line: "A", destination: "Y", inMinutes: 1, at: "08:01", accessible: true }], 1, 40);
    expect(merged.map((p) => `${p.line}:${p.source}`)).toEqual(["A:ao vivo", "B:programado"]);
  });

  it("hora de partir escolhe a última passagem que chega antes do compromisso", () => {
    const pass = (m: number) => ({ stopId: 1, tripId: "t", line: "875A-10", headsign: null, color: null, textColor: null, routeType: 3, atSec: m * 60, at: "", inMinutes: m, headwayMin: 10, source: "programado" as const, accessible: false });
    const plan = planFrom([pass(3), pass(13), pass(23), pass(33)], { walkTo: 5, walkFrom: 4, ride: 20 }, 0, { minutesTo: 50 });
    // 13 + 20 + 4 + 5 de folga = 42 ≤ 50; 23 → 52 não cabe.
    expect(plan).toMatchObject({ pass: { inMinutes: 13 }, leaveInSeconds: 8 * 60, fitsEvent: true });
    expect(planFrom([pass(3)], { walkTo: 5, walkFrom: 4, ride: 20 }, 0, null)).toBeNull();
  });
});

describe("Estação das Carruagens", () => {
  it("só o administrador importa o GTFS", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/transit/gtfs/import").send({ step: 0 })).status).toBe(403);
  });

  it("importa o GTFS, guarda ponto e jornada, mostra horários programados e paga a partida uma vez", async () => {
    setIntegrationFetchForTests(fakeFetch);
    const admin = await createAuthenticatedAgent();
    await getDb().execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [admin.userId] });
    await importAll(admin.agent);

    const { agent, userId } = await createAuthenticatedAgent();
    const before = (await agent.get("/api/transit")).body;
    expect(before.feed).toMatchObject({ ready: true, version: "2026-06-03" });
    expect(before.feed.counts).toMatchObject({ stops: 3, routes: 2, trips: 2, frequencies: 2, stopTimes: 5 });

    const near = (await agent.get("/api/transit/stops/near?lat=-23.5701&lon=-46.6451")).body;
    expect(near[0]).toMatchObject({ code: 1001, name: "Av. Paulista, 200" });
    expect(near[0].lines.map((l: { line: string }) => l.line).sort()).toEqual(["669A-10", "875A-10"]);
    expect((await agent.get("/api/transit/stops/search?q=paulista")).body[0]).toMatchObject({ code: 1001 });

    const st = await agent.post("/api/transit/stops").send({ code: 1001, from: { lat: -23.5701, lon: -46.6451 } });
    expect(st.status).toBe(201);
    expect(st.body.walkMinutes).toBe(5);
    expect((await agent.post("/api/transit/stops").send({ code: 999 })).status).toBe(404);

    const plan = (await agent.post("/api/transit/plan").send({ from: { label: "Casa", lat: -23.5701, lon: -46.6451 }, to: { label: "Trabalho", lat: -23.5501, lon: -46.6351 } })).body;
    expect(plan.options[0]).toMatchObject({ line: "875A-10", ride: 20, board: { stopId: 1001 }, alight: { stopId: 1003 }, headwayMin: 10 });
    expect(plan.options[0].path).toHaveLength(3);
    // A 669A-10 passa em 1001 só depois de 1002 (sentido contrário): não é opção.
    expect(plan.options.some((o: { line: string }) => o.line === "669A-10")).toBe(false);

    const o = plan.options[0];
    const j = await agent.post("/api/transit/journeys").send({ name: "Casa → Trabalho", origin: plan.from, dest: plan.to, tripId: o.tripId, boardSeq: o.board.seq, alightSeq: o.alight.seq });
    expect(j.status).toBe(201);
    expect((await agent.post("/api/transit/journeys").send({ name: "Inválida", origin: plan.from, dest: plan.to, tripId: o.tripId, boardSeq: 3, alightSeq: 1 })).status).toBe(422);

    const ov = (await agent.get("/api/transit")).body;
    expect(ov.stops[0].passes.length).toBeGreaterThan(0);
    expect(ov.stops[0].passes[0]).toMatchObject({ source: "programado" });
    expect(ov.journeys[0]).toMatchObject({ primary: true, ride: 20, walkTo: 5, walkFrom: 5, line: "875A-10", boardName: "Av. Paulista, 200", alightName: "Metrô Santana" });
    expect(ov.journeys[0].path).toHaveLength(3);
    expect(ov.board.length).toBeGreaterThan(0);
    expect(ov.live).toMatchObject({ enabled: false });

    const dep = await agent.post("/api/transit/depart").send({ journeyId: j.body.id });
    expect(dep.status).toBe(201);
    expect(dep.body).toMatchObject({ line: "875A-10", source: "programado" });
    expect((await agent.post("/api/transit/depart").send({ journeyId: j.body.id })).status).toBe(409);
    const xp = await getDb().execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS v FROM xp_events WHERE owner_id = ? AND source_type = 'transit'", args: [userId] });
    expect(Number(xp.rows[0]!.v)).toBe(dep.body.onTime ? 15 : 0);

    const other = await createAuthenticatedAgent();
    expect((await other.agent.delete(`/api/transit/journeys/${j.body.id}`)).status).toBe(404);
    expect((await other.agent.delete(`/api/transit/stops/${st.body.id}`)).status).toBe(404);
    expect((await other.agent.get("/api/transit")).body.journeys).toEqual([]);
  });
});
