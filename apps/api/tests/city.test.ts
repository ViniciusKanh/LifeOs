import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client.js";
import { createAuthenticatedAgent } from "./helpers.js";
import { setIntegrationFetchForTests } from "../src/services/integrationsCore.js";
import { buildUrl, faultDetail, normalizePayload, resetCityBreakersForTests, retryDelay, setCitySleepForTests, validateParams } from "../src/services/apilibClient.js";
import { computeInsights, labelOf, parseDateLoose, parseDuration, parseNumberBR, shapeRows } from "../src/services/cityValues.js";
import { CITY_API_DEFS } from "../src/config/apilib.js";
import { lastClosedSemester, previousMonth } from "../src/services/cityService.js";

/**
 * Cidade Inteligente — tudo com fetch simulado (nenhuma chamada real ao APILIB).
 * Os registros abaixo copiam o formato real das bases do Portal de Dados Abertos
 * (campos, acentos, números em texto, datas mistas) conferido em 27/11/2026.
 */

type Call = { url: string; auth: string | null; method: string };
let calls: Call[] = [];
let sleeps: number[] = [];

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const CONTRATOS = [
  { _id: 1, "Orgão": "EDUCAÇÃO", Retranca: "EGILADM", Modalidade: "TERMO DE COLABORAÇÃO - DESPACHO", "Número Processo": "6016.2017/0048189-8 ", Evento: "EXTRATO DO TERMO DE COLABORAÇÃO", objeto: "DESPACHO TERMO DE COLABORAÇÃO - CEI", "Data  Publicação Extrato": "2018-08-02T00:00:00", Fornecedor: "CRER EDUCAÇÃO", "Fornecedor Tipo": "PJ", "Fornecedor Documento": 5235465000145, "Data Assinatura Extrato": "2018-01-29T00:00:00", "Validade Extrato": 60, "Valor Contrato": "4.611.717,30" },
  { _id: 2, "Orgão": "PIRITUBA/JARAGUÁ", Retranca: "EEHWADM", Modalidade: "PREGÃO ELETRÔNICO", "Número Processo": "2014-0.207.159-7", Evento: "EXTRATO DE ADITAMENTO", objeto: "limpeza mecanizada", "Data  Publicação Extrato": "2018-08-03T00:00:00", Fornecedor: "João da Silva", "Fornecedor Tipo": "PF", "Fornecedor Documento": "123.456.789-00", "Data Assinatura Extrato": "2018-02-10T00:00:00", "Validade Extrato": 12, "Valor Contrato": "1.000,00" },
  { _id: 3, "Orgão": "EDUCAÇÃO", Retranca: "EGILADM", Modalidade: "PREGÃO ELETRÔNICO", "Número Processo": "x", Evento: "EXTRATO DE CONTRATO", objeto: "merenda", "Data  Publicação Extrato": "2018-08-04T00:00:00", Fornecedor: "ALIMENTOS SA", "Fornecedor Tipo": "PJ", "Fornecedor Documento": "12.345.678/0001-90", "Data Assinatura Extrato": "2018-02-11T00:00:00", "Validade Extrato": 12, "Valor Contrato": "500,50" },
];
const LIGACOES = [
  { _id: 1, Data: "01/07/2024", "Quantidade de ligações entrantes": "24.953", "Quantidade de ligações atendidas": "23.202", "Quantidade de ligações abandonadas": 1.742, "Tempo Médio de Atendimento": "00:03:18", "Tempo Médio de Espera": "00:00:28", "Nível de serviço -  até 15 segundos (%)": 8800 },
  { _id: 2, Data: "02/07/2024", "Quantidade de ligações entrantes": "28.045", "Quantidade de ligações atendidas": "23.567", "Quantidade de ligações abandonadas": 3.49, "Tempo Médio de Atendimento": "00:03:14", "Tempo Médio de Espera": "00:00:30", "Nível de serviço -  até 15 segundos (%)": 8550 },
];
const ESIC = [
  { cd_atendimento_pedido: 380572, dc_status_pedido: "Em tramitação", cd_orgao: 16, nm_orgao: "SME - Secretaria Municipal de Educação", cd_pedido: 62544, dc_pedido: "Necessito das estatísticas de matrícula", dc_resposta: "Pedido Registrado no Sistema", dt_resposta_atendimento: "01-jan-22" },
  { cd_atendimento_pedido: 381196, dc_status_pedido: "Atendido", cd_orgao: 16, nm_orgao: "SME - Secretaria Municipal de Educação", cd_pedido: 62545, dc_pedido: "Quero saber vagas", dc_resposta: "Segue planilha", dt_resposta_atendimento: "03-fev-22" },
];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;

const defaultHandler: Handler = (url) => {
  if (url.includes("/sg/licitacoes/")) return json({ total: 12621, data: CONTRATOS });
  if (url.includes("/smit/sp156/v1/ligacoes/DadosGerais")) return json({ total: 185, data: LIGACOES });
  if (url.includes("/cgm/esic/")) return json({ total: 12750, data: ESIC });
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
  setIntegrationFetchForTests(async (url, init) => {
    const h = init?.headers as Record<string, string> | undefined;
    calls.push({ url, auth: h?.Authorization ?? null, method: init?.method ?? "GET" });
    return handler(url, init);
  });
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
  it("só tem as 8 fontes ativas e aceita só parâmetros declarados", () => {
    expect(Object.keys(CITY_API_DEFS).sort()).toEqual(["escolas", "esic", "lentidao", "licitacoes", "prato", "procon", "sof", "sp156"]);
    expect(validateParams("licitacoes", "contratos", { ano: 2010, limite: 50 })).toEqual({ ano: "2010", limite: "50" });
    expect(() => validateParams("licitacoes", "contratos", { ano: 2025 })).toThrow(/intervalo/);
    expect(() => validateParams("licitacoes", "contratos", { ano: 2010, url: "http://evil" })).toThrow(/não suportado/);
    expect(() => validateParams("sof", "funcoes", {})).toThrow(/exercício/i);
    expect(() => validateParams("escolas", "escolas", { search: "a<script>" })).toThrow(/caracteres/);
  });

  it("monta URLs só no gateway do APILIB, com segmentos codificados", () => {
    expect(buildUrl("sp156", "ligacoes", { ano: "2024", semestre: "2", limite: "5" })).toBe("https://gateway.apilib.prefeitura.sp.gov.br/smit/sp156/v1/ligacoes/DadosGerais/2024/2?limite=5");
    expect(buildUrl("escolas", "escola", { codesc: "../x" })).toBe("https://gateway.apilib.prefeitura.sp.gov.br/sme/EscolaAberta/v1/api/escolas/..%2Fx/");
  });

  it("remove dados pessoais (inclusive documento de pessoa física) e mantém CNPJ", () => {
    const n = normalizePayload({ total: 3, data: CONTRATOS });
    expect(n.items[0]!["Fornecedor Documento"]).toBe(5235465000145); // CNPJ sem o zero à esquerda
    expect(n.items[1]).not.toHaveProperty("Fornecedor Documento");
    expect(n.items[2]!["Fornecedor Documento"]).toBe("12.345.678/0001-90");
    expect(n.redacted).toContain("Fornecedor Documento");
    const p = normalizePayload({ data: [{ nome_consumidor: "Fulano", email: "f@x.com", empresa: "ACME" }] });
    expect(p.items[0]).toEqual({ empresa: "ACME" });
  });

  it("backoff com jitter e Retry-After com teto", () => {
    expect(retryDelay(0, "2")).toBe(2000);
    expect(retryDelay(0, "120")).toBe(8000);
    const d = retryDelay(1, null);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThan(1500);
  });
});

describe("valores como a Prefeitura publica", () => {
  it("números, datas e tempos em todos os formatos das bases", () => {
    expect(parseNumberBR("4.611.717,30")).toBe(4611717.3);
    expect(parseNumberBR("24.953")).toBe(24953);
    expect(parseNumberBR("500,5")).toBe(500.5);
    expect(parseNumberBR("abc")).toBeNull();
    expect(parseDateLoose("2018-08-02T00:00:00")).toBe("2018-08-02");
    expect(parseDateLoose("2015-04-01T14:30:00")).toBe("2015-04-01T14:30");
    expect(parseDateLoose(" 08/08/2016")).toBe("2016-08-08");
    expect(parseDateLoose(20250126)).toBe("2025-01-26");
    expect(parseDateLoose("01-jan-22")).toBe("2022-01-01");
    expect(parseDateLoose("03-fev-22")).toBe("2022-02-03");
    expect(parseDuration("00:03:18")).toBe(198);
  });

  it("rótulos em português", () => {
    expect(labelOf("txtDescricaoOrgao")).toBe("Órgão");
    expect(labelOf("valOrcadoAtualizado")).toBe("Orçado atualizado");
    expect(labelOf("RAZÃO SOCIAL DA EMPRESA")).toBe("Razão social da empresa");
    expect(labelOf("nm_orgao")).toBe("Órgão");
    expect(labelOf("valCongeladoExtra")).toBe("Congelado extra");
  });

  it("contratos: valor em reais, datas, código como texto e sem _id", () => {
    const { columns, rows } = shapeRows(normalizePayload({ data: CONTRATOS }).items);
    const kind = Object.fromEntries(columns.map((c) => [c.key, c.kind]));
    expect(kind["Valor Contrato"]).toBe("money");
    expect(kind["Data Assinatura Extrato"]).toBe("date");
    expect(kind["Número Processo"]).toBe("code");
    expect(kind["Validade Extrato"]).toBe("number");
    expect(columns.find((c) => c.key === "_id")).toBeUndefined();
    expect(rows[0]!["Valor Contrato"]).toBe(4611717.3);
    expect(rows[0]!["Data Assinatura Extrato"]).toBe("2018-01-29");
    expect(rows[0]!["Número Processo"]).toBe("6016.2017/0048189-8");
  });

  it("ligações: milhar lido como decimal, percentual sem vírgula e tempo médio", () => {
    const { columns, rows } = shapeRows(LIGACOES);
    expect(rows[0]!["Quantidade de ligações entrantes"]).toBe(24953);
    expect(rows[0]!["Quantidade de ligações abandonadas"]).toBe(1742);
    expect(rows[1]!["Quantidade de ligações abandonadas"]).toBe(3490);
    expect(rows[0]!["Nível de serviço -  até 15 segundos (%)"]).toBe(88);
    expect(rows[0]!["Tempo Médio de Atendimento"]).toBe(198);
    expect(columns.find((c) => c.key === "Data")!.kind).toBe("date");
    const ins = computeInsights({ columns, rows }, CITY_API_DEFS.sp156.resources.ligacoes!.insights!);
    expect(ins.measures.find((m) => m.label === "Ligações recebidas")!.value).toBe(52998);
    expect(ins.measures.find((m) => m.label === "Nível de serviço médio (%)")!.value).toBeCloseTo(86.75);
    expect(ins.series!.points).toEqual([
      { x: "2024-07-01", y: 24953 },
      { x: "2024-07-02", y: 28045 },
    ]);
  });

  it("leituras dos contratos: ranking por valor e soma", () => {
    const shaped = shapeRows(normalizePayload({ data: CONTRATOS }).items);
    const ins = computeInsights(shaped, CITY_API_DEFS.licitacoes.resources.contratos!.insights!);
    expect(ins.ranking!.items[0]).toEqual({ label: "EDUCAÇÃO", value: 4612217.8 });
    expect(ins.measures.find((m) => m.agg === "sum")!.value).toBeCloseTo(4613217.8);
    expect(ins.dims.find((d) => d.label === "Modalidades")!.items[0]).toEqual({ label: "PREGÃO ELETRÔNICO", count: 2 });
  });

  it("semestre e mês de referência do radar", () => {
    expect(lastClosedSemester("2026-11-27")).toEqual({ ano: 2026, semestre: 1 });
    expect(lastClosedSemester("2026-03-01")).toEqual({ ano: 2025, semestre: 2 });
    expect(previousMonth("2026-01-15")).toEqual({ ano: 2025, mes: 12 });
  });
});

describe("/api/city — credencial e status", () => {
  it("sem credencial: não configurada e nada é consultado", async () => {
    const { agent } = await createAuthenticatedAgent();
    const st = await agent.get("/api/city/status");
    expect(st.body.apis).toHaveLength(8);
    expect(st.body.apis.every((a: { state: string }) => a.state === "nao_configurada")).toBe(true);
    const r = await agent.get("/api/city/data/esic/pedidos?ano=2022");
    expect(r.status).toBe(412);
    expect(r.body.state).toBe("nao_configurada");
    expect(calls).toHaveLength(0);
  });

  it("token salvo: testa de verdade, separa recusa do APILIB e da fonte e nunca devolve o segredo", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => {
      if (url.includes("/sf/sof/")) return json({ fault: { code: 900908, message: "Resource forbidden", description: "Bearer token-secreto-999999 nao pode" } }, 403);
      if (url.includes("/smj/proconsp/")) return json({ success: false, error: { message: "Acesso negado: Usuário não está autorizado", __type: "Authorization Error" } }, 403);
      if (url.includes("/cet/lentidao/")) return new Response('<am:fault xmlns:am="http://wso2.org/apimanager"><am:code>303001</am:code><am:message>Runtime Error</am:message><am:description>Address endpoint [ State : SUSPENDED ]</am:description></am:fault>', { status: 500, headers: { "Content-Type": "application/xml" } });
      return defaultHandler(url);
    };
    const r = await agent.put("/api/city/credentials").send({ mode: "token", token: "Bearer token-secreto-999999" });
    expect(r.status).toBe(200);
    expect(calls.every((c) => c.url.startsWith("https://gateway.apilib.prefeitura.sp.gov.br/"))).toBe(true);
    expect(calls.filter((c) => c.auth).every((c) => c.auth === "Bearer token-secreto-999999")).toBe(true);
    const st = await agent.get("/api/city/status");
    expect(JSON.stringify(st.body)).not.toContain("token-secreto");
    expect(st.body.credential).toMatchObject({ source: "pessoal", mode: "token", masked: "••••9999" });
    const by = Object.fromEntries(st.body.apis.map((a: { api: string; state: string; message: string | null }) => [a.api, a]));
    expect(by.esic.state).toBe("conectada");
    expect(by.sof.state).toBe("sem_autorizacao");
    expect(by.sof.message).toContain("APILIB: 900908 · Resource forbidden");
    expect(by.procon.state).toBe("indisponivel");
    expect(by.procon.message).toContain("Authorization Error");
    expect(by.lentidao.state).toBe("indisponivel");
    expect(by.lentidao.message).toContain("SUSPENDED");
  });

  it("client_credentials: pede um único token (Basic) e reaproveita", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => (url.endsWith("/token") ? json({ access_token: "acesso-temporario", expires_in: 3600 }) : defaultHandler(url));
    const r = await agent.put("/api/city/credentials").send({ mode: "client", key: "consumer-key-1", secret: "consumer-secret-1" });
    expect(r.status).toBe(200);
    const tokenCalls = calls.filter((c) => c.url.endsWith("/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.auth).toBe(`Basic ${Buffer.from("consumer-key-1:consumer-secret-1").toString("base64")}`);
    expect(calls.filter((c) => !c.url.endsWith("/token")).every((c) => c.auth === "Bearer acesso-temporario")).toBe(true);
  });

  it("401 vira credencial inválida e 429 respeita Retry-After antes de desistir", async () => {
    const agent = await configured();
    handler = () => new Response("", { status: 401 });
    const r = await agent.get("/api/city/data/esic/pedidos?ano=2022&force=1");
    expect(r.status).toBe(422);
    expect(r.body.state).toBe("credencial_invalida");
    handler = () => new Response("", { status: 429, headers: { "Retry-After": "3" } });
    const r2 = await agent.get("/api/city/data/licitacoes/contratos?ano=2011");
    expect(r2.status).toBe(429);
    expect(sleeps).toEqual([3000, 3000]);
  });

  it("lê fault em XML", async () => {
    const xml = await faultDetail(new Response('<am:fault xmlns:am="http://wso2.org/apimanager"><am:code>303001</am:code><am:message>Runtime Error</am:message><am:description>Currently , Address endpoint : [ State : SUSPENDED ]</am:description></am:fault>', { status: 500 }));
    expect(xml).toEqual({ origin: "gateway", text: "303001 · Runtime Error · Currently , Address endpoint : [ State : SUSPENDED ]" });
  });
});

describe("/api/city — dados, leituras, cache e fallback", () => {
  it("/data devolve colunas tipadas e valores limpos", async () => {
    const agent = await configured();
    const r = await agent.get("/api/city/data/licitacoes/contratos?ano=2018&limite=100");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(12621);
    expect(r.body.columns.find((c: { key: string }) => c.key === "Valor Contrato")).toEqual({ key: "Valor Contrato", label: "Valor do contrato", kind: "money" });
    expect(r.body.rows[0]["Valor Contrato"]).toBe(4611717.3);
    expect(r.body.redacted).toContain("Fornecedor Documento");
  });

  it("/insights consulta a amostra grande e devolve rankings", async () => {
    const agent = await configured();
    const r = await agent.get("/api/city/insights/esic/pedidos?ano=2022");
    expect(r.status).toBe(200);
    expect(calls.at(-1)!.url).toContain("limite=500");
    expect(r.body.insights.dims.find((d: { label: string }) => d.label === "Situação").items).toHaveLength(2);
    expect(r.body.insights.series.points).toEqual([
      { x: "2022-01", y: 1 },
      { x: "2022-02", y: 1 },
    ]);
  });

  it("retry em 503 e depois cache válido sem nova chamada", async () => {
    const agent = await configured();
    let n = 0;
    handler = (url) => (url.includes("/cet/lentidao/") && n++ === 0 ? new Response("", { status: 503 }) : json({ total: 1, data: [{ corredor: "Marginal  ", tamanho: 800 }] }));
    const r = await agent.get("/api/city/data/lentidao/registros?ano=2015&limite=10");
    expect(r.status).toBe(200);
    expect(r.body.rows).toEqual([{ corredor: "Marginal", tamanho: 800 }]);
    expect(sleeps).toHaveLength(1);
    const again = await agent.get("/api/city/data/lentidao/registros?limite=10&ano=2015");
    expect(again.body.fromCache).toBe(true);
    expect(calls.filter((c) => c.url.includes("/cet/lentidao/"))).toHaveLength(2);
  });

  it("API fora do ar com cache vencido: devolve o cache marcado como desatualizado", async () => {
    const agent = await configured();
    await agent.get("/api/city/data/esic/pedidos?ano=2020&limite=5").expect(200);
    await getDb().execute("UPDATE city_cache SET expires_at = datetime('now', '-1 hour') WHERE api = 'esic'");
    handler = () => new Response("", { status: 502 });
    const r = await agent.get("/api/city/data/esic/pedidos?ano=2020&limite=5");
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(r.body.staleReason).toMatch(/respondeu 502/);
    const st = await agent.get("/api/city/status");
    expect(st.body.apis.find((a: { api: string }) => a.api === "esic").state).toBe("desatualizada");
  });

  it("chamadas simultâneas iguais viram uma só", async () => {
    const agent = await configured();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    handler = async () => {
      await gate;
      return json({ total: 1, data: [{ x: 1 }] });
    };
    const p1 = agent.get("/api/city/data/procon/reclamacoes?ano=2018&limite=3");
    const p2 = agent.get("/api/city/data/procon/reclamacoes?ano=2018&limite=3");
    await new Promise((r) => setTimeout(r, 80));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(calls.filter((c) => c.url.includes("/proconsp/"))).toHaveLength(1);
  });

  it("parâmetro fora do catálogo e APIs retiradas são recusados antes de qualquer fetch", async () => {
    const agent = await configured();
    expect((await agent.get("/api/city/data/procon/reclamacoes?ano=2018&host=evil.com")).status).toBe(400);
    expect((await agent.get("/api/city/data/procon/qualquer?ano=2018")).status).toBe(404);
    expect((await agent.get("/api/city/data/dom/publicacoes")).status).toBe(400);
    expect((await agent.get("/api/city/data/fila/postos")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("API desativada pelo usuário não é consultada", async () => {
    const agent = await configured();
    await agent.put("/api/city/apis/disabled").send({ disabled: ["esic"] }).expect(200);
    const r = await agent.get("/api/city/data/esic/pedidos?ano=2022");
    expect(r.status).toBe(409);
    expect(calls).toHaveLength(0);
  });
});

describe("/api/city — dados pessoais e XP", () => {
  it("favoritos isolados por usuário; XP de contrato uma vez por item e no máximo 3 por dia", async () => {
    const agent = await configured();
    const { agent: other } = await createAuthenticatedAgent();
    const fav = (k: string) => agent.post("/api/city/favorites").send({ api: "licitacoes", itemKey: k, title: `Contrato ${k}`, url: "https://evil.example.com/x" });
    const a = await fav("A");
    expect(a.status).toBe(201);
    expect(a.body.xp).toBe(10);
    expect((await fav("A")).body).toMatchObject({ created: false, xp: 0 });
    await fav("B");
    await fav("C");
    expect((await fav("D")).body.xp).toBe(0);
    const list = await agent.get("/api/city/favorites");
    expect(list.body).toHaveLength(4);
    expect(list.body[0].url).toBeNull();
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
    const r1 = await agent.post("/api/city/activity").send({ api: "esic", action: "read", ref: "62544" });
    expect(r1.body).toEqual({ recorded: true, xp: 5 });
    const r2 = await agent.post("/api/city/activity").send({ api: "esic", action: "read", ref: "62544" });
    expect(r2.body).toEqual({ recorded: false, xp: 0 });
    const r3 = await agent.post("/api/city/activity").send({ api: "licitacoes", action: "read", ref: "x" });
    expect(r3.body).toEqual({ recorded: true, xp: 0 });
    expect((await agent.post("/api/city/activity").send({ api: "esic", action: "hack", ref: "x" })).status).toBe(400);
  });

  it("protocolos pessoais (sem XP) e isolados", async () => {
    const agent = await configured();
    const { agent: other } = await createAuthenticatedAgent();
    const p = await agent.post("/api/city/protocols").send({ kind: "esic", number: "2026-001", title: "Pedido de dados de poda" });
    expect(p.status).toBe(201);
    expect((await other.put(`/api/city/protocols/${p.body.id}`).send({ kind: "esic", number: "2026-001", title: "Outro", status: "encerrado" })).status).toBe(404);
    expect((await agent.get("/api/city/protocols")).body[0].status).toBe("aberto");
  });

  it("visão geral: dados mais recentes e cada bloco do radar falha sozinho", async () => {
    const agent = await configured();
    await getDb().execute("DELETE FROM city_cache WHERE api IN ('publico', 'sof')");
    handler = (url) => {
      if (url.includes("/sf/sof/v4/despesas")) return json({ lstDespesas: [{ valOrcadoAtualizado: 1000, valEmpenhadoLiquido: 500, valLiquidado: 400, valPagoExercicio: 300 }] });
      if (url.includes("/sf/sof/v4/contratos")) return json({ lstContratos: [{ codContrato: "1", codEmpresa: "81", numOriginalContrato: "7/2026", txtDescricaoModalidade: "Pregão Eletrônico", datAssinaturaContrato: "2026-06-19", valPrincipal: 1000 }] });
      if (url.startsWith("https://dados.prefeitura.sp.gov.br/") || url.startsWith("https://escolaaberta.")) return new Response("", { status: 500 });
      return defaultHandler(url);
    };
    const r = await agent.get("/api/city/overview");
    expect(r.status).toBe(200);
    expect(r.body.apis).toHaveLength(8);
    expect(r.body.radar.orcamento.ok).toBe(true);
    expect(r.body.radar.orcamento.data.ano).toBe(new Date().getFullYear());
    expect(r.body.radar.orcamento.data.latest.execPago).toBe(30);
    expect(r.body.radar.contratos.ok).toBe(true);
    expect(r.body.radar.contratos.data.modalidades[0].label).toBe("Pregão Eletrônico");
    expect(r.body.radar.transparencia.ok).toBe(false);
    expect(r.body.radar.atendimento.ok).toBe(false);
  });
});

/* ───────────── Cidadania e Consumo (Portal de Dados Abertos/CKAN) ───────────── */
import { classifyEsic, classifyOutcome, companyKey, monthKey, normCategory, resolutionRate } from "../src/services/civicService.js";
import { maskPII, parsePeriod, safeTerms } from "../src/services/publicDataClient.js";
import { modalitiesOf } from "../src/services/educationService.js";

const PROCON_2019 = [
  { _id: 1, "Data de entrada": "02/01/2019", "Região": "OESTE", "Razão Social": "Notre Dame Intermedica", "Área": "Serviços Privados", "Motivo de baixa no Backoffice": "Baixa de CIP -  Com resolução total", "OBSERVAÇÃO": "" },
  { _id: 2, "Data de entrada": "02/01/2019", "Região": "SUL", "Razão Social": "Credz Administradora de Cartões LTDA", "Área": "Assuntos Financeiros", "Motivo de baixa no Backoffice": "Encerrado - Desistência do Consumidor", "OBSERVAÇÃO": "" },
];

/** UUIDs fictícios no formato do portal. */
const RID = {
  p2025: "11111111-0000-4000-8000-000000002025",
  p2024top: "11111111-0000-4000-8000-00000000a024",
  p2019: "11111111-0000-4000-8000-000000002019",
  pDen: "11111111-0000-4000-8000-00000000d025",
  s25a: "22222222-0000-4000-8000-000000025001",
  s25b: "22222222-0000-4000-8000-000000025002",
  s24: "22222222-0000-4000-8000-000000024003",
  lig: "33333333-0000-4000-8000-000000024002",
  e23: "44444444-0000-4000-8000-000000002023",
};
const PACKAGES: Record<string, Array<{ id: string; name: string }>> = {
  "dados-de-reclamacoes-procon-paulistano": [
    { id: RID.p2025, name: "Reclamação (2025)" },
    { id: RID.pDen, name: "Denúncia (2025)" },
    { id: RID.p2024top, name: "Reclamação (2024) - Planilha Geral" },
    { id: RID.p2019, name: "Base de Reclamações - 2019" },
  ],
  "dados-do-sp156": [
    { id: RID.s25a, name: "Dados do SP156 - 1º TRI 2025" },
    { id: RID.s25b, name: "Dados do SP156 - 1º TRI 2025" },
    { id: RID.s24, name: "Dados do SP156 - 3º TRI 2024" },
  ],
  "dados-do-sp156-ligacoes": [{ id: RID.lig, name: "Dados Gerais - Ligações SP156 (1° SEM de 2025)" }],
  "pedidos-de-informacao-protocolados-a-prefeitura-via-e-sic1": [{ id: RID.e23, name: "Base de Pedidos de Informação (2023)" }],
};
const F = (ids: string[], types: Record<string, string> = {}) => ids.map((id) => ({ id, type: types[id] ?? "text" }));
const FIELDS: Record<string, { fields: Array<{ id: string; type: string }>; total: number }> = {
  [RID.p2025]: { fields: F(["DATA DE ENTRADA", "REGIÃO", "RAZÃO SOCIAL DA EMPRESA", "ÁREA DE ATUAÇÃO", "STATUS DA RECLAMAÇÃO"], { "DATA DE ENTRADA": "timestamp" }), total: 36169 },
  [RID.p2024top]: { fields: F(["FORNECEDORES MAIS RECLAMADOS 2024 - JANEIRO A OUTUBRO"]), total: 24 },
  [RID.p2019]: { fields: F(["Data de entrada", "Região", "Razão Social", "Área", "Motivo de baixa no Backoffice"]), total: 1526 },
  [RID.pDen]: { fields: F(["REGIÃO", "RAZÃO SOCIAL DA EMPRESA"]), total: 10 },
  [RID.s25a]: { fields: F(["Data de abertura", "Data de finalização", "Tema", "Serviço", "Status da solicitação", "Subprefeitura", "Nível Satisfação"], { "Data de abertura": "timestamp", "Data de finalização": "timestamp" }), total: 95500 },
  [RID.s25b]: { fields: F(["Data de abertura", "Tema"], { "Data de abertura": "timestamp" }), total: 11750 },
  [RID.s24]: { fields: F(["Data de abertura", "Tema"], { "Data de abertura": "timestamp" }), total: 114250 },
  [RID.lig]: { fields: F(["Data", "Quantidade de ligações entrantes"]), total: 2 },
  [RID.e23]: { fields: F(["cd_atendimento_pedido", "dc_status_pedido", "nm_orgao", "cd_pedido", "dc_pedido", "dc_resposta", "dt_resposta_atendimento"], { cd_pedido: "numeric", dt_resposta_atendimento: "timestamp" }), total: 9750 },
};
const ok = (result: unknown) => json({ help: "h", success: true, result });
const records = (rs: unknown[]) => ok({ records: rs, fields: [] });
let sqls: string[] = [];

/** Responde como o CKAN: package_show, datastore_search (campos/linhas) e datastore_search_sql. */
function portal(sqlAnswer: (s: string) => unknown[] | "BLOCK"): Handler {
  return (url) => {
    if (!url.startsWith("https://dados.prefeitura.sp.gov.br/")) return defaultHandler(url);
    const u = new URL(url);
    const action = u.pathname.split("/").pop();
    if (action === "package_show") return ok({ resources: (PACKAGES[u.searchParams.get("id")!] ?? []).map((r) => ({ ...r, datastore_active: true })) });
    if (action === "datastore_search") {
      const id = u.searchParams.get("resource_id")!;
      if (u.searchParams.get("limit") === "0") return ok({ ...FIELDS[id], records: [] });
      return records(LIGACOES);
    }
    const s = u.searchParams.get("sql")!;
    sqls.push(s);
    const a = sqlAnswer(s);
    if (a === "BLOCK") return new Response("<html><head><title>Requisicao Bloqueada</title></head></html>", { status: 200, headers: { "Content-Type": "text/html" } });
    return records(a);
  };
}

describe("Cidadania e Consumo", () => {
  beforeEach(async () => {
    sqls = [];
    await getDb().execute("DELETE FROM city_cache WHERE api = 'publico'");
  });

  it("desembrulha o envelope do CKAN no APILIB", () => {
    const n = normalizePayload({ help: "h", success: true, result: { records: PROCON_2019, total: 1526, fields: [{ id: "_id" }] } });
    expect(n.total).toBe(1526);
    expect(n.items).toHaveLength(2);
  });

  it("classifica desfechos e status (inclusive os de 2023–2025), períodos e termos seguros", () => {
    expect(classifyOutcome("Decisão - Reclamação Fundamentada Não Atendida")).toBe("nao_resolvido");
    expect(classifyOutcome("Decisão - reclamação fundamentada atendida")).toBe("resolvido");
    expect(classifyOutcome("Baixa de CIP - Com resolução parcial")).toBe("parcial");
    expect(classifyOutcome("Concluído – Extra-Procon")).toBe("encaminhado");
    expect(classifyOutcome("Concluído - Simples Consulta")).toBe("orientacao");
    expect(classifyOutcome("SIMPLES CONSULTA")).toBe("orientacao");
    expect(classifyOutcome("DESISTENCIA")).toBe("desistencia");
    expect(classifyOutcome("RECLAMAÇÃO")).toBe("sem_desfecho");
    expect(classifyOutcome("CONCLUÍDO")).toBe("concluido");
    expect(classifyOutcome("Encerrado - Duplicidade")).toBe("arquivado");
    expect(classifyOutcome("")).toBe("sem_desfecho");
    expect(resolutionRate({ resolvido: 2, parcial: 2, nao_resolvido: 4 })).toEqual({ rate: 37.5, base: 8 });
    expect(normCategory("SERVIÇOS ESSENCIAIS")).toBe("Serviços Essenciais");
    expect(normCategory("Não informado")).toBeNull();
    expect(companyKey("SPTRANS LTDA.")).toBe(companyKey("Sptrans"));
    expect(classifyEsic("Atendido parcialmente")).toBe("parcial");
    expect(classifyEsic("Pedido indeferido")).toBe("negado");
    expect(classifyEsic("Finalizado")).toBe("finalizado");
    expect(classifyEsic("Prazo prorrogado")).toBe("tramitando");
    expect(parsePeriod("Dados do SP156 - 1º TRI 2025")).toMatchObject({ key: "2025-T1", kind: "tri" });
    expect(parsePeriod("Dados Gerais - Ligações SP156 (2° SEM de 2024)")).toMatchObject({ key: "2024-S2" });
    expect(parsePeriod("Base de Pedidos de Informação (2023)")).toMatchObject({ key: "2023", kind: "ano" });
    expect(monthKey(20115)).toBe("2025-01");
    expect(monthKey("01/02/2023")).toBe("2023-02");
    expect(safeTerms("sp'trans; DROP%_ x")).toEqual(["trans", "drop"]);
    expect(maskPII("Fale comigo: ana@x.com, CPF 123.456.789-00, tel (11) 98765-4321")).toBe("Fale comigo: [e-mail], CPF [CPF], tel [telefone]");
  });

  it("PROCON: ano mais recente por padrão, descarta planilhas-resumo e soma na base inteira", async () => {
    const agent = await configured();
    handler = portal((s) => {
      if (s.includes("count(DISTINCT")) return [{ n: "330", d: "136" }];
      if (s.includes(" c, ") && s.includes("GROUP BY c, s")) return [
        { c: "SPTRANS LTDA.", s: "DESISTENCIA", n: "3" },
        { c: "Sptrans", s: "RECLAMAÇÃO", n: "5" },
        { c: "N/A", s: "SIMPLES CONSULTA", n: "40" },
      ];
      if (s.includes("GROUP BY a, s")) return [{ a: "SERVIÇOS ESSENCIAIS", s: "RECLAMAÇÃO", n: "5" }, { a: "Serviços Essenciais", s: "DESISTENCIA", n: "3" }];
      if (s.includes("floor(extract(epoch")) return [{ k: 20115, n: "24" }, { k: 20110, n: "6" }, { k: null, n: "35839" }];
      if (s.includes('"REGIÃO" k')) return [{ k: "ZONA NORTE", n: "10" }];
      return [];
    });
    const r = await agent.get("/api/city/civic/procon");
    expect(r.status).toBe(200);
    expect(r.body.ano).toBe(2025);
    expect(r.body.periods.map((p: { key: string }) => p.key)).toEqual(["2025", "2019"]); // "Planilha Geral" e Denúncia ficam fora
    expect(r.body.total).toBe(330);
    expect(r.body.companies[0]).toMatchObject({ name: "Sptrans", count: 8 });
    expect(r.body.areas[0]).toMatchObject({ label: "Serviços Essenciais", count: 8 });
    expect(r.body.months).toEqual([{ x: "2025-01", y: 30 }]);
    expect(r.body.outcomes.find((o: { key: string }) => o.key === "sem_desfecho").count).toBe(5);
    expect(sqls.every((s) => !/to_char|date_trunc|IS NOT NULL|ORDER BY 1/i.test(s))).toBe(true);
    expect((await agent.get("/api/city/civic/procon?ano=2021")).status).toBe(400);
  });

  it("PROCON: consulta recusada pelo firewall vira aviso e o resto do painel aparece", async () => {
    const agent = await configured();
    handler = portal((s) => (s.includes('"Data de entrada" k') ? "BLOCK" : s.includes("count(DISTINCT") ? [{ n: "2", d: "2" }] : []));
    const r = await agent.get("/api/city/civic/procon?ano=2019");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.months).toEqual([]);
    expect(r.body.warnings.join(" ")).toMatch(/Meses: .*recusou/);
  });

  it("ficha da empresa: busca segura em todos os anos e compara com a cidade", async () => {
    const agent = await configured();
    handler = portal((s) => {
      if (s.includes("ILIKE")) return [
        { c: "Sptrans", s: "Decisão - Reclamação Fundamentada Atendida", a: "Serviços Essenciais", g: "OESTE", d: "03/01/2019" },
        { c: "SPTRANS LTDA.", s: "Decisão - Reclamação Fundamentada Não Atendida", a: "Serviços Essenciais", g: "LESTE", d: "2025-02-01T00:00:00" },
        { c: "Transportes Urbanos", s: "", a: "", g: "", d: "" },
      ];
      if (s.includes("GROUP BY s")) return [{ s: "Decisão - Reclamação Fundamentada Atendida", n: "10" }, { s: "Decisão - Reclamação Fundamentada Não Atendida", n: "10" }];
      return [];
    });
    const r = await agent.get("/api/city/civic/procon/empresa?q=sptrans");
    expect(r.status).toBe(200);
    expect(r.body.yearsRead).toEqual([2019, 2025]);
    expect(r.body.count).toBe(4); // 2 por ano; o terceiro nome não casa com a chave da empresa
    expect(r.body.matches[0].name).toMatch(/sptrans/i);
    expect(r.body.resolution.rate).toBe(50);
    expect(r.body.recent[0].date).toBe("2025-02-01");
    expect(sqls.some((s) => s.includes(`ILIKE '%sptrans%'`))).toBe(true);
    expect((await agent.get("/api/city/civic/procon/empresa?q=ab")).status).toBe(400);
  });

  it("e-SIC: último atendimento de cada pedido, status separados e texto sem dados pessoais", async () => {
    const agent = await configured();
    handler = portal((s) => {
      if (s.includes("count(DISTINCT")) return [{ n: "9750", d: "2340" }];
      if (s.includes("GROUP BY o, s")) return [
        { o: "SME - Secretaria Municipal de Educação", s: "Atendido", n: "30" },
        { o: "SME - Secretaria Municipal de Educação", s: "Pedido indeferido", n: "10" },
        { o: "SMS - Secretaria Municipal da Saúde", s: "Finalizado", n: "50" },
        { o: "SMS - Secretaria Municipal da Saúde", s: "Em tramitação", n: "5" },
      ];
      if (s.includes("ILIKE")) return [
        { p: 1, o: "SME", s: "Atendido", d: "2023-05-01T00:00:00", q: "Quero vagas, meu e-mail é joao@ex.com", a: "Segue planilha" },
        { p: 1, o: "SME", s: "Em tramitação", d: "2023-04-01T00:00:00", q: "Quero vagas, meu e-mail é joao@ex.com", a: "Pedido Registrado" },
      ];
      return [];
    });
    const r = await agent.get("/api/city/civic/esic?q=vagas");
    expect(r.status).toBe(200);
    expect(r.body.ano).toBe(2023);
    expect(r.body.total).toBe(2340);
    expect(r.body.status).toMatchObject({ atendido: 30, negado: 10, finalizado: 50, tramitando: 5 });
    expect(r.body.atendidoPct).toBe(75);
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0].pedido).toBe("Quero vagas, meu e-mail é [e-mail]");
    expect(sqls.some((s) => s.includes("DISTINCT ON"))).toBe(true);
  });

  it("SP156: trimestre mais recente (maior base do período), satisfação e central de ligações", async () => {
    const agent = await configured();
    handler = portal((s) => {
      if (s.includes(RID.s25b)) throw new Error("usou o recurso menor");
      if (/^SELECT count\(\*\) n FROM/.test(s)) return [{ n: "95500" }];
      if (s.includes('"Tema" k') && s.includes("percentile_cont")) return [{ k: "Lixo e limpeza", m: 6.2, n: "40" }];
      if (s.includes("percentile_cont")) return [{ m: 5.81, n: "16856" }];
      if (s.includes('"Tema" k')) return [{ k: "Lixo e limpeza", n: "100" }, { k: "LIXO E LIMPEZA", n: "20" }];
      if (s.includes('"Nível Satisfação" k')) return [{ k: "péssimo", n: "30" }, { k: "excelente", n: "60" }, { k: "", n: "10" }];
      return [];
    });
    const r = await agent.get("/api/city/civic/sp156");
    expect(r.status).toBe(200);
    expect(r.body.periodo).toBe("2025-T1");
    expect(r.body.periods.map((p: { key: string }) => p.key)).toEqual(["2025-T1", "2024-T3"]);
    expect(r.body.solicitacoes.temas[0]).toEqual({ label: "Lixo e Limpeza", count: 120 });
    expect(r.body.solicitacoes.medianDays).toBe(5.8);
    expect(r.body.solicitacoes.satisfacaoBoaPct).toBe(66.7);
    expect(r.body.ligacoes.entrantes).toBe(52998);
    expect(r.body.ligacoes.taxaAtendimento).toBeCloseTo(88.2, 1);
    const old = await agent.get("/api/city/civic/sp156?periodo=2024-T3");
    expect(old.body.ligacoes).toBeNull();
    expect(old.body.ligacoesNote).toMatch(/ainda não publicou/);
    expect((await agent.get("/api/city/civic/sp156?periodo=2099")).status).toBe(400);
  });
});

/* ───────────── Educação (Escola Aberta pública) ───────────── */

describe("Educação — Escola Aberta", () => {
  const VAGAS = [
    { decserie: "", modalidade: "ENSINO FUNDAMENTAL DE 9 ANOS", total_turmas: 3, vagas_oferecidas: 100, atendimentos: 90, vagas_remanecentes: 10, media_atendimento: 30 },
    { decserie: "1. ANO", modalidade: "ENSINO FUNDAMENTAL DE 9 ANOS", total_turmas: 2, vagas_oferecidas: 60, atendimentos: 58, vagas_remanecentes: 2, media_atendimento: 29 },
    { decserie: "2. ANO", modalidade: "ENSINO FUNDAMENTAL DE 9 ANOS", total_turmas: 1, vagas_oferecidas: 40, atendimentos: 32, vagas_remanecentes: 8, media_atendimento: 32 },
    { decserie: "M I", modalidade: "EJA CIEJA", total_turmas: 1, vagas_oferecidas: 50, atendimentos: 20, vagas_remanecentes: 30, media_atendimento: 20 },
  ];
  beforeEach(async () => {
    await getDb().execute("DELETE FROM city_cache WHERE api = 'publico'");
  });

  it("subtotal da modalidade vem da linha sem série; sem ela, soma as séries", () => {
    const m = modalitiesOf(VAGAS);
    expect(m[0]).toMatchObject({ label: "Ensino Fundamental de 9 Anos", vagas: 100, atendimentos: 90, ocupacao: 90 });
    expect(m[0]!.series.map((s) => s.label)).toEqual(["1. Ano", "2. Ano"]);
    expect(m[1]).toMatchObject({ label: "EJA CIEJA", vagas: 50, remanescentes: 30, ocupacao: 40 });
  });

  it("panorama da cidade e da DRE, sem credencial do APILIB e sem notas", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => {
      if (!url.startsWith("https://escolaaberta.sme.prefeitura.sp.gov.br/api/")) return defaultHandler(url);
      if (url.includes("/smevagasmat/")) return json({ results: VAGAS });
      if (url.includes("/smeescolas/")) return json({ results: [{ tipoesc: "EMEF        ", faixa: "251 a 500 estudantes", count: 3 }, { tipoesc: "EMEF", faixa: "1 a 250 estudantes", count: 2 }, { tipoesc: "CEI INDIR", faixa: "1 a 250 estudantes", count: 5 }] });
      if (url.includes("/smeprofissionais/")) return json({ results: [{ titulo: "COORDENADOR PEDAGOGICO", formacao: "LICENCIATURA", total: 4 }] });
      if (url.includes("/smeambientes/")) return json({ results: [{ ambiente: "BIBLIOTECA", total: 7 }] });
      if (url.includes("/dtatualizacao/")) return json({ results: [{ dt_atualizacao: "2026-11-01" }] });
      if (url.includes("/diretorias/")) return json({ results: [{ dre: "BT", diretoria: "DIRETORIA REGIONAL DE EDUCACAO BUTANTA" }] });
      return json({}, 404);
    };
    const r = await agent.get("/api/city/edu/panorama");
    expect(r.status).toBe(200);
    expect(r.body.kpis).toMatchObject({ escolas: 10, vagas: 150, atendimentos: 110, remanescentes: 40, profissionais: 4 });
    expect(r.body.escolasPorTipo[0]).toEqual({ label: "EMEF", count: 5 });
    expect(r.body.escolasPorFaixa.map((x: { label: string }) => x.label)).toEqual(["1 a 250 estudantes", "251 a 500 estudantes"]);
    expect(r.body.sobras[0]).toMatchObject({ label: "M I", remanescentes: 30 });
    expect(r.body.atualizadoEm).toBe("2026-11-01");
    expect(r.body.dres).toEqual([{ value: "BT", label: "Butanta" }]);
    expect(JSON.stringify(r.body)).not.toMatch(/nota|ranking/i);
    const d = await agent.get("/api/city/edu/panorama?dre=BT");
    expect(calls.some((c) => c.url.endsWith("/smevagasmat/BT"))).toBe(true);
    expect(d.body.dreLabel).toBe("Butanta");
    expect((await agent.get("/api/city/edu/panorama?dre=../x")).status).toBe(400);
  });

  it("busca separa o tipo do nome e a ficha valida o código", async () => {
    const { agent } = await createAuthenticatedAgent();
    handler = (url) => {
      if (url.includes("/api/escolas/?")) return json({ count: 1, results: [{ codesc: "000191", nomesc: "ALIPIO CORREA NETO, PROF.", tipoesc: "EMEF", dre: "BT", latitude: -23.61, longitude: -46.74, tel1: "58450121", cep: 5742100 }] });
      return defaultHandler(url);
    };
    const r = await agent.get("/api/city/edu/escolas?search=EMEF%20Alipio");
    expect(r.status).toBe(200);
    const u = new URL(calls.find((c) => c.url.includes("/api/escolas/?"))!.url);
    expect(u.searchParams.get("search")).toBe("Alipio");
    expect(u.searchParams.get("tipoesc")).toBe("EMEF");
    expect(r.body.rows[0]).toMatchObject({ codesc: "000191", telefone: "(11) 5845-0121", cep: "05742-100", lat: -23.61 });
    expect((await agent.get("/api/city/edu/escola/12ab")).status).toBe(400);
  });
});

/* ───────────── Finanças Públicas (SOF) ───────────── */

describe("Finanças Públicas — SOF", () => {
  it("série mês a mês a partir do acumulado, ano anterior e funções", async () => {
    const agent = await configured();
    await getDb().execute("DELETE FROM city_cache WHERE api = 'sof'");
    const desp = (mes: number, ano: number, fn: string | null) => ({
      valOrcadoInicial: 1000, valOrcadoAtualizado: fn ? 100 * Number(fn) : 1200, valEmpenhadoLiquido: (fn ? 10 : 100) * mes, valLiquidado: 80 * mes, valPagoExercicio: (ano === 2025 ? 50 : 70) * mes, valDisponivel: 1, valCongelado: 0,
    });
    handler = (url) => {
      if (!url.includes("/sf/sof/v4/")) return defaultHandler(url);
      const u = new URL(url);
      if (u.pathname.endsWith("/funcoes")) return json({ lstFuncoes: [{ codFuncao: "10", textDescricaoFuncao: "Saúde" }, { codFuncao: "12", textDescricaoFuncao: "Educação" }] });
      if (u.pathname.endsWith("/despesas")) return json({ lstDespesas: [desp(Number(u.searchParams.get("mesDotacao")), Number(u.searchParams.get("anoDotacao")), u.searchParams.get("codFuncao"))] });
      return json({});
    };
    const r = await agent.get("/api/city/sof/resumo?ano=2025");
    expect(r.status).toBe(200);
    expect(r.body.mes).toBe(12);
    expect(r.body.cumulative).toHaveLength(12);
    expect(r.body.monthly[2]).toEqual({ mes: 3, empenhado: 100, liquidado: 80, pago: 50 });
    expect(r.body.latest).toMatchObject({ orcado: 1200, pago: 600, execPago: 50 });
    expect(r.body.previousYear).toMatchObject({ ano: 2024, pago: 840 });
    const f = await agent.get("/api/city/sof/funcoes?ano=2025&mes=12");
    expect(f.body.items.map((x: { label: string }) => x.label)).toEqual(["Educação", "Saúde"]);
    expect(f.body.items[0]).toMatchObject({ orcado: 1200, share: 54.5 });
    expect((await agent.get("/api/city/sof/resumo?ano=2025&orgao=x1")).status).toBe(400);
  });
});
