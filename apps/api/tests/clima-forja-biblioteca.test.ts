import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { worldWeatherVisual } from "../src/services/weatherCodeUtils.js";
import { forgeLevelFromXp, setGithubFetchForTests } from "../src/services/codeForgeService.js";
import { normalizeDoi, setResearchFetchForTests, abstractFromInverted } from "../src/services/researchProviders.js";
import { formatCitation } from "../src/services/citationFormat.js";

afterEach(() => {
  vi.restoreAllMocks();
  setGithubFetchForTests(null);
  setResearchFetchForTests(null);
});

/* ───────────── Clima ───────────── */

describe("Clima real no Meu Mundo", () => {
  it("mapeia códigos WMO para estados visuais, com fallback", () => {
    expect(worldWeatherVisual(0)).toBe("clear");
    expect(worldWeatherVisual(3)).toBe("cloudy");
    expect(worldWeatherVisual(45)).toBe("fog");
    expect(worldWeatherVisual(53)).toBe("drizzle");
    expect(worldWeatherVisual(61)).toBe("rain");
    expect(worldWeatherVisual(65)).toBe("heavy_rain");
    expect(worldWeatherVisual(73)).toBe("snow");
    expect(worldWeatherVisual(95)).toBe("storm");
    expect(worldWeatherVisual(1234)).toBe("cloudy");
    expect(worldWeatherVisual(null)).toBe("cloudy");
  });

  it("sem localização diz que não está configurado; com localização usa a Open-Meteo e guarda o último clima válido", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.get("/api/world/weather")).body).toEqual({ configured: false });
    await agent.patch("/api/context/location").send({ city: "Cidade Teste", latitude: -10.123, longitude: -40.456, timezone: "America/Sao_Paulo" });
    const hours = Array.from({ length: 48 }, (_, i) => new Date(Date.now() - 3 * 3600_000 + i * 3600_000).toISOString().slice(0, 13) + ":00");
    const forecast = {
      current: { temperature_2m: 22, apparent_temperature: 21, weather_code: 63, relative_humidity_2m: 84, wind_speed_10m: 11, wind_direction_10m: 45, is_day: 1, time: "2026-11-22T14:00" },
      hourly: { time: hours, temperature_2m: hours.map(() => 20), apparent_temperature: hours.map(() => 19), precipitation_probability: hours.map(() => 78), weather_code: hours.map(() => 95) },
      daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], uv_index_max: [], sunrise: [], sunset: [], daylight_duration: [] },
    };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(forecast), { status: 200 }));
    const ok = await agent.get("/api/world/weather");
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ configured: true, stale: false, source: "Open-Meteo", current: { visual: "rain", temperature: 22, humidity: 84, windDirection: 45, label: "Chuva moderada" } });
    expect(ok.body.hourly.length).toBeLessThanOrEqual(12);
    expect(ok.body.hourly[0].visual).toBe("storm");
    spy.mockRestore();
    // Open-Meteo fora do ar: devolve o último clima válido marcado como desatualizado.
    // (outra coordenada evita o cache em memória do provider)
    await agent.patch("/api/context/location").send({ latitude: -10.123, longitude: -40.456 });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rede"));
    const { OpenMeteoWeatherProvider } = await import("../src/services/openMeteoProvider.js");
    vi.spyOn(OpenMeteoWeatherProvider, "getForecast").mockRejectedValue(new Error("fora do ar"));
    const stale = await agent.get("/api/world/weather");
    expect(stale.body).toMatchObject({ configured: true, stale: true, current: { visual: "rain" } });
  });

  it("salva preferências de clima e valida intensidade", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.put("/api/world/settings").send({ weatherEnabled: false, weatherIntensity: 1, weatherParticles: false })).status).toBe(200);
    expect((await agent.put("/api/world/settings").send({ weatherIntensity: 5 })).status).toBe(400);
    const w = await agent.get("/api/world");
    expect(w.body.settings).toMatchObject({ weatherEnabled: false, weatherIntensity: 1, weatherParticles: false });
  });
});

/* ───────────── Forja do Código ───────────── */

type Handler = (url: string) => { status?: number; body: unknown; headers?: Record<string, string> };
function fakeGithub(handler: Handler) {
  setGithubFetchForTests(async (url) => {
    const r = handler(url);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null }, json: async () => r.body };
  });
}

const today = new Date().toISOString();
const commits = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => ({ sha: `${prefix}${i}`, html_url: `https://github.com/x/${prefix}${i}`, commit: { message: i === 0 ? "Merge branch 'main'" : `feat: item ${i}`, author: { date: today }, committer: null } }));

function githubWorld(opts: { commitsPerRepo?: number } = {}): Handler {
  return (url) => {
    if (url.endsWith("/users/vitor-dev")) return { body: { login: "vitor-dev" } };
    if (url.includes("/users/vitor-dev/repos")) return { body: [{ id: 1, full_name: "vitor-dev/LifeOS", description: "Vila", language: "TypeScript", html_url: "https://github.com/vitor-dev/LifeOS", private: false, pushed_at: today, fork: false }] };
    if (url.includes("/repos/vitor-dev/LifeOS/commits")) return { body: commits(opts.commitsPerRepo ?? 3) };
    if (url.includes("/search/issues") && url.includes("is%3Amerged")) return { body: { total_count: 1, items: [{ id: 900, number: 9, title: "Forja", html_url: "https://github.com/pr/9", created_at: today, closed_at: today, repository_url: "https://api.github.com/repos/vitor-dev/LifeOS", pull_request: { merged_at: today } }] } };
    if (url.includes("/search/issues") && url.includes("is%3Aopen")) return { body: { total_count: 4, items: [] } };
    if (url.includes("/search/issues")) return { body: { total_count: 1, items: [{ id: 900, number: 9, title: "Forja", html_url: "https://github.com/pr/9", created_at: today, closed_at: null, repository_url: "https://api.github.com/repos/vitor-dev/LifeOS" }] } };
    if (url.includes("/events")) return { body: [{ id: "e1", type: "ReleaseEvent", created_at: today, repo: { name: "vitor-dev/LifeOS" }, payload: { action: "published", release: { id: 77, name: "v1.0", tag_name: "v1.0", html_url: "https://github.com/r/77" } } }] };
    return { status: 404, body: {} };
  };
}

describe("Forja do Código", () => {
  it("níveis da oficina crescem com o XP", () => {
    expect(forgeLevelFromXp(0).level).toBe(1);
    expect(forgeLevelFromXp(120).level).toBe(2);
    expect(forgeLevelFromXp(359).level).toBe(2);
    expect(forgeLevelFromXp(360).level).toBe(3);
  });

  it("conecta no modo público, importa atividade real e não duplica XP ao sincronizar de novo", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    fakeGithub(githubWorld());
    const c = await agent.post("/api/code-forge/connect").send({ username: "vitor-dev" });
    expect(c.status).toBe(201);
    expect(c.body.sync.ok).toBe(true);
    const o = (await agent.get("/api/code-forge")).body;
    // 3 commits (o de merge é registrado mas não pontua), PR aberta, PR mesclada e release.
    expect(o.counts).toMatchObject({ commit: 3, pr_opened: 1, pr_merged: 1, release: 1, openPrs: 4 });
    expect(o.xp.total).toBe(2 * 10 + 25 + 60 + 100);
    expect(o.repos[0]).toMatchObject({ fullName: "vitor-dev/LifeOS", commits: 3, monitored: true });
    expect(o.heatmap.source).toBe("imported_activity");
    expect(o.heatmap.days.some((d: { count: number | null }) => d.count === null)).toBe(true);
    // Sincronizar de novo (forçado no serviço) não soma nada.
    const { syncGithub } = await import("../src/services/codeForgeService.js");
    const again = await syncGithub(getDb(), userId, { force: true });
    expect(again).toMatchObject({ inserted: 0, xp: 0 });
    const xp = await getDb().execute({ sql: "SELECT COALESCE(SUM(xp),0) AS x FROM xp_events WHERE owner_id = ? AND source_type = 'code'", args: [userId] });
    expect(Number(xp.rows[0]!.x)).toBe(205);
    // Sincronização manual logo em seguida respeita o intervalo mínimo.
    expect((await agent.post("/api/code-forge/sync")).status).toBe(429);
  });

  it("respeita o teto diário de commits e as regras desligadas; isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    fakeGithub(githubWorld({ commitsPerRepo: 40 }));
    await agent.post("/api/code-forge/connect").send({ username: "vitor-dev" });
    const o = (await agent.get("/api/code-forge")).body;
    expect(o.counts.commit).toBe(40);
    expect(o.recent.filter((e: { kind: string; xp: number }) => e.kind === "commit" && e.xp > 0)).toHaveLength(15);
    expect((await agent.put("/api/code-forge/rules").send({ commit: false })).body.commit).toBe(false);
    expect((await agent.put("/api/code-forge/rules").send({ hack: true })).status).toBe(400);
    const theirs = (await other.agent.get("/api/code-forge")).body;
    expect(theirs).toMatchObject({ connected: false, xp: { total: 0 } });
    expect(theirs.repos).toHaveLength(0);
  });

  it("trata limite do GitHub sem quebrar e desconecta apagando o token", async () => {
    const { agent } = await createAuthenticatedAgent();
    fakeGithub((url) => (url.endsWith("/users/vitor-dev") ? { body: { login: "vitor-dev" } } : { status: 403, body: {}, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1999999999" } }));
    const c = await agent.post("/api/code-forge/connect").send({ username: "vitor-dev" });
    expect(c.status).toBe(201);
    expect(c.body.sync.ok).toBe(false);
    const o = (await agent.get("/api/code-forge")).body;
    expect(o.integration.lastSyncStatus).toBe("rate_limited");
    expect(JSON.stringify(o)).not.toContain("token_enc");
    expect((await agent.delete("/api/code-forge/connect")).status).toBe(204);
    expect((await agent.get("/api/code-forge")).body.connected).toBe(false);
  });
});

/* ───────────── Biblioteca do Mestrado ───────────── */

const OA_WORK = {
  id: "https://openalex.org/W111",
  doi: "https://doi.org/10.1145/3464301",
  display_name: "Transformers for Time Series Forecasting: A Survey",
  publication_year: 2021,
  type: "article",
  cited_by_count: 1342,
  authorships: [{ author: { display_name: "Bryan Lim" } }, { author: { display_name: "Stefan Zohren" } }],
  primary_location: { landing_page_url: "https://dl.acm.org/x", source: { display_name: "ACM Computing Surveys", host_organization_name: "ACM" } },
  biblio: { volume: "54", issue: "10", first_page: "1", last_page: "36" },
  abstract_inverted_index: { Apresenta: [0], um: [1], levantamento: [2] },
  keywords: [{ display_name: "Transformers" }],
  open_access: { oa_url: null },
  related_works: ["https://openalex.org/W222"],
  referenced_works: ["https://openalex.org/W333"],
};

function fakeScholarly() {
  setResearchFetchForTests(async (url) => {
    if (url.includes("api.openalex.org/works/https://doi.org/10.1145")) return { status: 200, body: OA_WORK };
    if (url.includes("api.openalex.org/works/https://doi.org/")) return { status: 404, body: null };
    if (url.includes("api.crossref.org/works/10.9999")) return { status: 200, body: { message: { title: ["Só no Crossref"], author: [{ given: "Ana", family: "Souza" }], issued: { "date-parts": [[2020]] }, "container-title": ["Revista X"] } } };
    if (url.includes("api.crossref.org")) return { status: 404, body: null };
    if (url.includes("semanticscholar")) return { status: 404, body: null };
    if (url.includes("filter=openalex:W222")) return { status: 200, body: { results: [{ id: "https://openalex.org/W222", doi: "https://doi.org/10.1/rel", display_name: "Informer", publication_year: 2021, cited_by_count: 895, authorships: [{ author: { display_name: "Haoyi Zhou" } }] }] } };
    if (url.includes("filter=cites:W111")) return { status: 200, body: { results: [] } };
    return { status: 404, body: null };
  });
}

describe("Biblioteca do Mestrado", () => {
  it("normaliza DOI e reconstrói o resumo do OpenAlex", () => {
    expect(normalizeDoi("https://doi.org/10.1145/3464301")).toBe("10.1145/3464301");
    expect(normalizeDoi("doi: 10.1038/S41586-021-03819-2")).toBe("10.1038/s41586-021-03819-2");
    expect(normalizeDoi("não é doi")).toBeNull();
    expect(abstractFromInverted({ b: [1], a: [0] })).toBe("a b");
  });

  it("formata referências só com os campos conhecidos", () => {
    const p = { doi: "10.1/x", title: "Um título", authors: [{ name: "Bryan Lim", given: "Bryan", family: "Lim" }], year: 2021, venue: "Revista", volume: "5", issue: null, pages: "1-10", publisher: null, url: null, type: "article" };
    const abnt = formatCitation(p, "abnt", new Date(2026, 10, 22));
    expect(abnt).toContain("LIM, B. Um título. Revista, v. 5, p. 1-10, 2021. DOI: 10.1/x.");
    expect(abnt).not.toContain("n.");
    expect(formatCitation(p, "apa")).toBe("Lim, B. (2021). Um título. Revista, 5, 1-10. https://doi.org/10.1/x");
    expect(formatCitation(p, "bibtex")).toContain("pages = {1--10}");
    expect(formatCitation(p, "ris")).toContain("EP  - 10");
  });

  it("prévia, salva por DOI sem duplicar, organiza, ficha e exporta", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();
    fakeScholarly();
    expect((await agent.get("/api/research/doi?doi=nao-e-doi")).status).toBe(422);
    const prev = await agent.get("/api/research/doi?doi=https://doi.org/10.1145/3464301");
    expect(prev.status).toBe(200);
    expect(prev.body).toMatchObject({ title: OA_WORK.display_name, year: 2021, venue: "ACM Computing Surveys", citedBy: 1342, citedBySource: "OpenAlex", abstract: "Apresenta um levantamento", savedId: null, pages: "1-36" });
    const hub = (await agent.get("/api/research")).body;
    expect(hub.categories.map((c: { name: string }) => c.name)).toContain("Estado da Arte");
    const cat = hub.categories.find((c: { name: string }) => c.name === "Estado da Arte");
    const saved = await agent.post("/api/research/papers").send({ doi: "10.1145/3464301", categoryId: cat.id, overrides: { title: "Título corrigido por mim" } });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ title: "Título corrigido por mim", categoryName: "Estado da Arte", status: "para_ler" });
    expect((await agent.post("/api/research/papers").send({ doi: "10.1145/3464301" })).status).toBe(409);
    // Outro usuário salva o mesmo DOI: metadado compartilhado, correção NÃO.
    const theirs = await other.agent.post("/api/research/papers").send({ doi: "10.1145/3464301" });
    expect(theirs.body.title).toBe(OA_WORK.display_name);
    expect((await other.agent.get(`/api/research/papers/${saved.body.id}`)).status).toBe(404);
    // Crossref como fallback quando o OpenAlex não conhece o DOI.
    const cr = await agent.post("/api/research/papers").send({ doi: "10.9999/abc" });
    expect(cr.body).toMatchObject({ title: "Só no Crossref", venue: "Revista X", year: 2020, citedBy: null });

    // Progresso 100% marca como lido; fichado rende XP uma vez só.
    const id = saved.body.id;
    expect((await agent.patch(`/api/research/papers/${id}`).send({ progress: 100 })).body.status).toBe("lido");
    expect((await agent.put(`/api/research/papers/${id}/review`).send({ objetivo: "Revisar Transformers", resultados: "4 categorias" })).status).toBe(200);
    expect((await agent.post(`/api/research/papers/${id}/quotes`).send({ text: "Trecho que eu copiei", page: "17" })).status).toBe(201);
    expect((await agent.patch(`/api/research/papers/${id}`).send({ status: "fichado" })).body.status).toBe("fichado");
    await agent.patch(`/api/research/papers/${id}`).send({ status: "lido" });
    await agent.patch(`/api/research/papers/${id}`).send({ status: "fichado" });
    const xp = await getDb().execute({ sql: "SELECT event_type, SUM(xp) AS x FROM xp_events WHERE owner_id = ? AND source_type = 'research' GROUP BY event_type", args: [userId] });
    expect(Object.fromEntries(xp.rows.map((r) => [String(r.event_type), Number(r.x)]))).toEqual({ paper_added: 10, paper_read: 20, paper_reviewed: 40 });
    const detail = (await agent.get(`/api/research/papers/${id}`)).body;
    expect(detail.review.fields).toMatchObject({ objetivo: "Revisar Transformers" });
    expect(detail.quotes[0]).toMatchObject({ text: "Trecho que eu copiei", page: "17" });
    expect(detail.history.some((h: { field: string }) => h.field === "status")).toBe(true);

    const rel = await agent.get(`/api/research/papers/${id}/related?kind=related`);
    expect(rel.body).toMatchObject({ kind: "related", proven: false, items: [{ title: "Informer", citedBy: 895 }] });
    const exp = await agent.post("/api/research/export").send({ format: "bibtex", ids: [id] });
    expect(exp.body.text).toContain("@article{");
    const stats = (await agent.get("/api/research")).body.stats;
    expect(stats).toMatchObject({ saved: 2, reviewed: 1, read: 1, pending: 1 });
    expect(stats.citations).toMatchObject({ total: 1342, papersWithData: 1, sources: ["OpenAlex"] });
    expect((await agent.delete(`/api/research/papers/${id}`)).status).toBe(204);
  });
});
