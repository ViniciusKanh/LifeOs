import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { buildUrl, normalizePayload, resetCityBreakersForTests, retryDelay, setCitySleepForTests, validateParams } from "../src/services/apilibClient.js";
import { lastBusinessDay, parseLooseDate, queueLevel, toPublication, toQueuePost, toTender } from "../src/services/cityService.js";

/**
 * Cidade Inteligente — tudo com fetch simulado (nenhuma chamada real ao APILIB).
 * Os formatos seguem o Swagger oficial de cada API (Diário Oficial, De Olho na Fila, Licitações).
 */

type Call = { url: string; auth: string | null; method: string };
let calls: Call[] = [];
let sleeps: number[] = [];

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const PUBLICACOES = [
  { publicacao: "P1", retrancaNome: "Chamamento público — cultura", tipomateriaNome: "Edital", anuncianteNome: "Secretaria de Cultura", statusPublicacao: "11", statusPublicacaoNome: "Publicado", dataPublicacao: "2026-11-20", cadernoNome: "Cidade de SP", arquivos: [{ nomearquivoOriginal: "edital.pdf" }] },
  { publicacao: "P2", retrancaNome: "Despacho", tipomateriaNome: "Despacho", statusPublicacao: "03", statusPublicacaoNome: "Cancelado", dataPublicacao: "2026-11-20" },
];
const FILA = [
  { unidade: "UBS Vila Mariana", dataHora: "2026-11-20T10:00:00", endereco: "Rua X, 1", statusFila: "Sem fila", influenza: "1", dengue: "0", covid19Menor12: "0", covid19Maior12: "1" },
  { unidade: "UBS Sé", dataHora: "2020-01-01T08:00:00", endereco: "Praça Y", statusFila: "Fila grande", influenza: "1", dengue: "1", covid19Menor12: "1", covid19Maior12: "1" },
];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;

function install() {
  setIntegrationFetchForTests(async (url, init) => {
    const h = init?.headers as Record<string, string> | undefined;
    calls.push({ url, auth: h?.Authorization ?? null, method: init?.method ?? "GET" });
    return handler(url, init);
  });
}

const defaultHandler: Handler = (url) => {
  if (url.includes("/sg/dom/v1/Publicacao")) return json(PUBLICACOES);
  if (url.includes("/sg/dom/v1/Licitacao")) return json([]);
  if (url.includes("/ListaDeOlhoNaFila")) return json(FILA);
  return json({ total: 1, data: [{ a: 1 }] });
};

beforeEach(() => {
  calls = [];
  sleeps = [];
  handler = defaultHandler;
  resetCityBreakersForTests();
  setCitySleepForTests(async (ms) => {
    sleeps.push(ms);
  });
  install();
  delete process.env.APILIB_ACCESS_TOKEN;
  delete process.env.APILIB_CONSUMER_KEY;
  delete process.env.APILIB_CONSUMER_SECRET;
});
afterEach(() => {
  setIntegrationFetchForTests(null);
  setCitySleepForTests(null);
});

async function configured(token = "token-de-teste-123456") {
  const { agent } = await createAuthenticatedAgent();
  const r = await agent.put("/api/city/credentials").send({ mode: "token", token });
  expect(r.status).toBe(200);
  calls = [];
  return agent;
}

describe("catálogo e validação", () => {
  it("só aceita parâmetros declarados e dentro do intervalo", () => {
    expect(validateParams("licitacoes", "contratos", { ano: 2010, limite: 50 })).toEqual({ ano: "2010", limite: "50" });
    expect(() => validateParams("licitacoes", "contratos", { ano: 2025 })).toThrow(/intervalo/);
    expect(() => validateParams("licitacoes", "contratos", { ano: 2010, url: "http://evil" })).toThrow(/não suportado/);
    expect(() => validateParams("idhm", "udh", { ano: 2005 })).toThrow(/inválido/);
    expect(() => validateParams("escolas", "escolas", { search: "a<script>" })).toThrow(/caracteres/);
    expect(() => validateParams("dom", "publicacoes", { caderno: 11 })).toThrow(/data/i);
  });

  it("monta URLs só no gateway do APILIB, com segmentos codificados", () => {
    expect(buildUrl("censo", "arquivo", { arquivo: "basico", ano: "2010", limite: "5" })).toBe("https://gateway.apilib.prefeitura.sp.gov.br/ibge/censo/v1/basico/2010?limite=5");
    expect(buildUrl("escolas", "escola", { codesc: "../x" })).toBe("https://gateway.apilib.prefeitura.sp.gov.br/sme/EscolaAberta/v1/api/escolas/..%2Fx/");
  });

  it("normaliza envelopes e remove dados pessoais", () => {
    const n = normalizePayload({ total: 9, data: [{ nome_consumidor: "Fulano", email: "f@x.com", cpfcnpj: "123.456.789-00", empresa: "ACME", endereco: { bairro: "Sé" } }, { cpfcnpj: "12.345.678/0001-90", empresa: "B" }] });
    expect(n.total).toBe(9);
    expect(n.items[0]).toEqual({ empresa: "ACME", "endereco.bairro": "Sé" });
    expect(n.items[1]).toEqual({ cpfcnpj: "12.345.678/0001-90", empresa: "B" });
    expect(n.redacted).toEqual(["cpfcnpj", "email", "nome_consumidor"]);
    expect(normalizePayload({ count: 2, results: [{ x: 1 }, { x: 2 }] }).items).toHaveLength(2);
    expect(normalizePayload([{ x: 1 }]).total).toBe(1);
  });

  it("backoff com jitter e Retry-After com teto", () => {
    expect(retryDelay(0, "2")).toBe(2000);
    expect(retryDelay(0, "120")).toBe(8000);
    const d = retryDelay(1, null);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThan(1500);
  });
});

describe("regras de domínio", () => {
  it("publicações: status e palavras-chave só nos metadados", () => {
    const p = toPublication(PUBLICACOES[0]!, ["chamamento", "xx", "cultura"]);
    expect(p.status).toBe("publicado");
    expect(p.matches).toEqual(["chamamento", "cultura"]);
    expect(p.files).toEqual(["edital.pdf"]);
    expect(toPublication(PUBLICACOES[1]!).status).toBe("cancelado");
  });

  it("licitação encerrada nunca vira oportunidade aberta; valores por tipo", () => {
    const now = new Date("2026-11-20T12:00:00-03:00");
    const open = toTender({ licitacao: "L1", objetolicitacao: "Reforma", statusLicitacaoDescricao: "Em andamento", dataHoraProposta: "2026-12-01 10:00", valorEstimado: "1.234,56" }, now);
    expect(open.phase).toBe("aberta");
    expect(open.nextDeadline).toEqual({ label: "Entrega de propostas", at: "2026-12-01T10:00:00" });
    expect(open.values).toEqual([{ kind: "estimado", value: 1234.56 }]);
    const closed = toTender({ licitacao: "L2", objetolicitacao: "X", statusLicitacaoDescricao: "Revogada", dataHoraProposta: "2026-12-01 10:00", valorcontrato: 500 }, now);
    expect(closed.phase).toBe("encerrada");
    expect(closed.values[0]?.kind).toBe("contratado");
    expect(toTender({ objetolicitacao: "Y" }, now).phase).toBe("sem_data");
  });

  it("fila: nível pela situação textual, sem inventar minutos", () => {
    expect(queueLevel("Fila pequena")).toBe("pequena");
    expect(queueLevel("SEM FILA")).toBe("sem_fila");
    expect(queueLevel("Posto fechado")).toBe("fechado");
    expect(queueLevel("??")).toBe("desconhecida");
    const post = toQueuePost(FILA[1]!, new Date("2026-11-20T12:00:00-03:00"));
    expect(post.outdated).toBe(true);
    expect(post.vaccines.filter((v) => v.available)).toHaveLength(4);
    expect(post).not.toHaveProperty("waitMinutes");
  });

  it("datas soltas e último dia útil", () => {
    expect(parseLooseDate("05/03/2026 14:30")).toBe("2026-03-05T14:30:00");
    expect(lastBusinessDay("2026-11-22")).toBe("2026-11-20"); // domingo → sexta
  });
});

describe("/api/city — credencial e status", () => {
  it("sem credencial: não configurada e nada é consultado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const st = await agent.get("/api/city/status");
    expect(st.body.apis.every((a: { state: string }) => a.state === "nao_configurada")).toBe(true);
    const r = await agent.get("/api/city/fila");
    expect(r.status).toBe(412);
    expect(r.body.state).toBe("nao_configurada");
    expect(calls).toHaveLength(0);
  });

  it("token salvo: testa de verdade, marca conectada e nunca devolve o segredo", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => (url.includes("/sf/sof/") ? json({ fault: { code: 900908, message: "Resource forbidden", description: "Bearer token-secreto-999999 nao pode" } }, 403) : defaultHandler(url));
    const r = await agent.put("/api/city/credentials").send({ mode: "token", token: "Bearer token-secreto-999999" });
    expect(r.status).toBe(200);
    expect(calls.length).toBeGreaterThanOrEqual(12);
    expect(calls.every((c) => c.auth === "Bearer token-secreto-999999" && c.url.startsWith("https://gateway.apilib.prefeitura.sp.gov.br/"))).toBe(true);
    const st = await agent.get("/api/city/status");
    expect(JSON.stringify(st.body)).not.toContain("token-secreto");
    expect(st.body.apis.find((a: { api: string }) => a.api === "sof").message).toContain("APILIB: 900908 · Resource forbidden");
    expect(st.body.credential).toMatchObject({ source: "pessoal", mode: "token", masked: "••••9999" });
    const by = Object.fromEntries(st.body.apis.map((a: { api: string; state: string }) => [a.api, a.state]));
    expect(by.fila).toBe("conectada");
    expect(by.sof).toBe("sem_autorizacao");
    // 403 da fonte (CKAN do Portal de Dados Abertos) não é falta de inscrição.
    handler = (url) => (url.includes("/ibge/censo/") ? json({ success: false, error: { message: "Acesso negado: Usuário não está autorizado a ler o recurso x", __type: "Authorization Error" } }, 403) : defaultHandler(url));
    await agent.post("/api/city/test").send({ apis: ["censo"] }).expect(200);
    const censo = (await agent.get("/api/city/status")).body.apis.find((a: { api: string }) => a.api === "censo");
    expect(censo.state).toBe("desatualizada"); // havia cópia salva do teste anterior
    expect(censo.message).toContain("Authorization Error");
  });

  it("client_credentials: pede token uma vez (Basic) e reaproveita", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => (url.endsWith("/token") ? json({ access_token: "acesso-temporario", expires_in: 3600 }) : defaultHandler(url));
    const r = await agent.put("/api/city/credentials").send({ mode: "client", key: "consumer-key-1", secret: "consumer-secret-1" });
    expect(r.status).toBe(200);
    const tokenCalls = calls.filter((c) => c.url.endsWith("/token"));
    expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
    expect(tokenCalls.length).toBeLessThanOrEqual(12);
    expect(tokenCalls[0]!.auth).toBe(`Basic ${Buffer.from("consumer-key-1:consumer-secret-1").toString("base64")}`);
    expect(calls.filter((c) => !c.url.endsWith("/token")).every((c) => c.auth === "Bearer acesso-temporario")).toBe(true);
  });

  it("401 vira credencial inválida e 429 respeita Retry-After antes de desistir", async () => {
    const agent = await configured();
    handler = () => new Response("", { status: 401 });
    const r = await agent.get("/api/city/fila?force=1");
    expect(r.status).toBe(422);
    expect(r.body.state).toBe("credencial_invalida");
    handler = () => new Response("", { status: 429, headers: { "Retry-After": "3" } });
    const r2 = await agent.get("/api/city/data/licitacoes/contratos?ano=2011");
    expect(r2.status).toBe(429);
    expect(sleeps).toEqual([3000, 3000]);
  });
});

describe("/api/city — cache, retry e fallback", () => {
  it("retry em 503 e depois cache válido sem nova chamada", async () => {
    const agent = await configured();
    let n = 0;
    handler = (url) => (url.includes("/cet/lentidao/") && n++ === 0 ? new Response("", { status: 503 }) : json({ total: 1, data: [{ via: "Marginal" }] }));
    const r = await agent.get("/api/city/data/lentidao/registros?ano=2015&limite=10");
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([{ via: "Marginal" }]);
    expect(r.body.fromCache).toBe(false);
    expect(sleeps).toHaveLength(1);
    const again = await agent.get("/api/city/data/lentidao/registros?limite=10&ano=2015");
    expect(again.body.fromCache).toBe(true);
    expect(calls.filter((c) => c.url.includes("/cet/lentidao/"))).toHaveLength(2);
  });

  it("API fora do ar com cache vencido: devolve o cache marcado como desatualizado", async () => {
    const agent = await configured();
    await agent.get("/api/city/data/idhm/udh?ano=2010&limite=5").expect(200);
    await getDb().execute("UPDATE city_cache SET expires_at = datetime('now', '-1 hour') WHERE api = 'idhm'");
    handler = () => new Response("", { status: 502 });
    const r = await agent.get("/api/city/data/idhm/udh?ano=2010&limite=5");
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(r.body.staleReason).toMatch(/respondeu 502/);
    const st = await agent.get("/api/city/status");
    expect(st.body.apis.find((a: { api: string }) => a.api === "idhm").state).toBe("desatualizada");
  });

  it("chamadas simultâneas iguais viram uma só", async () => {
    const agent = await configured();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    handler = async () => {
      await gate;
      return json({ total: 1, data: [{ x: 1 }] });
    };
    const p1 = agent.get("/api/city/data/procon/atendimentos?ano=2018&limite=3");
    const p2 = agent.get("/api/city/data/procon/atendimentos?ano=2018&limite=3");
    await new Promise((r) => setTimeout(r, 80));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(calls.filter((c) => c.url.includes("/proconsp/"))).toHaveLength(1);
  });

  it("parâmetro fora do catálogo é recusado antes de qualquer fetch", async () => {
    const agent = await configured();
    expect((await agent.get("/api/city/data/procon/atendimentos?ano=2018&host=evil.com")).status).toBe(400);
    expect((await agent.get("/api/city/data/procon/qualquer?ano=2018")).status).toBe(404);
    expect((await agent.get("/api/city/data/naoexiste/x")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("API desativada pelo usuário não é consultada", async () => {
    const agent = await configured();
    await agent.put("/api/city/apis/disabled").send({ disabled: ["fila"] }).expect(200);
    const r = await agent.get("/api/city/fila");
    expect(r.status).toBe(409);
    expect(calls).toHaveLength(0);
  });
});

describe("/api/city — dados pessoais, XP e alertas", () => {
  it("favoritos isolados por usuário; XP de oportunidade uma vez por item e no máximo 3 por dia", async () => {
    const agent = await configured();
    const { agent: other } = await createAuthenticatedAgent();
    const fav = (k: string) => agent.post("/api/city/favorites").send({ api: "dom", itemKey: k, title: `Edital ${k}`, url: "https://evil.example.com/x" });
    const a = await fav("A");
    expect(a.status).toBe(201);
    expect(a.body.xp).toBe(10);
    expect((await fav("A")).body).toMatchObject({ created: false, xp: 0 });
    await fav("B");
    await fav("C");
    expect((await fav("D")).body.xp).toBe(0);
    const list = await agent.get("/api/city/favorites");
    expect(list.body).toHaveLength(4);
    expect(list.body[0].url).toBeNull(); // URL fora dos domínios oficiais não é guardada
    expect((await other.get("/api/city/favorites")).body).toHaveLength(0);
    expect((await other.delete(`/api/city/favorites/${a.body.id}`)).status).toBe(404);
  });

  it("favorito vira missão só por ação explícita", async () => {
    const agent = await configured();
    const f = await agent.post("/api/city/favorites").send({ api: "licitacoes", itemKey: "K1", title: "Contrato de limpeza" });
    const t = await agent.post(`/api/city/favorites/${f.body.id}/task`).send({ dueDate: "2026-12-10" });
    expect(t.status).toBe(201);
    expect(t.body.title).toBe("Cidade: Contrato de limpeza");
  });

  it("atividade repetida no mesmo dia não gera XP de novo (anti-farm)", async () => {
    const agent = await configured();
    const r1 = await agent.post("/api/city/activity").send({ api: "dom", action: "read", ref: "P1" });
    expect(r1.body).toEqual({ recorded: true, xp: 5 });
    const r2 = await agent.post("/api/city/activity").send({ api: "dom", action: "read", ref: "P1" });
    expect(r2.body).toEqual({ recorded: false, xp: 0 });
    const r3 = await agent.post("/api/city/activity").send({ api: "dom", action: "read", ref: "P9" });
    expect(r3.body).toEqual({ recorded: true, xp: 0 }); // histórico sim, XP só uma vez por dia
    expect((await agent.post("/api/city/activity").send({ api: "dom", action: "hack", ref: "x" })).status).toBe(400);
  });

  it("alertas: cada publicação notifica uma vez", async () => {
    const agent = await configured();
    const a = await agent.post("/api/city/alerts").send({ source: "publicacoes", name: "Cultura", keywords: ["chamamento", "despacho"] });
    expect(a.status).toBe(201);
    const r1 = await agent.post("/api/city/alerts/run").send({});
    expect(r1.body.hits).toBe(1); // o despacho está cancelado e não conta
    const r2 = await agent.post("/api/city/alerts/run").send({});
    expect(r2.body.hits).toBe(0);
    expect((await agent.post("/api/city/alerts").send({ source: "publicacoes", name: "x", keywords: ["ab"] })).status).toBe(400);
  });

  it("protocolos pessoais (sem XP) e isolados", async () => {
    const agent = await configured();
    const { agent: other } = await createAuthenticatedAgent();
    const p = await agent.post("/api/city/protocols").send({ kind: "esic", number: "2026-001", title: "Pedido de dados de poda" });
    expect(p.status).toBe(201);
    expect((await other.put(`/api/city/protocols/${p.body.id}`).send({ kind: "esic", number: "2026-001", title: "Outro", status: "encerrado" })).status).toBe(404);
    expect((await agent.get("/api/city/protocols")).body[0].status).toBe("aberto");
  });

  it("visão geral junta radar, favoritos e status sem quebrar quando uma API falha", async () => {
    const agent = await configured();
    handler = (url) => (url.includes("ListaDeOlhoNaFila") ? new Response("", { status: 500 }) : defaultHandler(url));
    const r = await agent.get("/api/city/overview");
    expect(r.status).toBe(200);
    expect(r.body.radar.publications.ok).toBe(true);
    expect(r.body.radar.queue.ok).toBe(true); // cache do teste de conexão serve o bloco
    expect(r.body.apis).toHaveLength(12);
  });
});
