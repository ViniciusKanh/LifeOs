import { Router, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit, rateLimit } from "../middleware/rateLimit.js";
import { CITY_APIS, CITY_API_DEFS, type CityApi } from "../config/apilib.js";
import { CityError, cleanCredential, deleteCredential, listApiStatus, saveCredential, setDisabledApis, testConnections } from "../services/apilibClient.js";
import {
  CITY_ACTIONS,
  CITY_DOMAINS,
  CITY_WIDGETS,
  PROTOCOL_STATUS,
  addFavorite,
  askOracle,
  catalog,
  cityData,
  cityInsights,
  favoriteToEvent,
  favoriteToTask,
  getOverview,
  getPrefs,
  listFavorites,
  listHistory,
  listProtocols,
  recordActivity,
  removeFavorite,
  removeProtocol,
  savePrefs,
  saveProtocol,
} from "../services/cityService.js";

/**
 * /api/city — Cidade Inteligente (São Paulo, APILIB).
 * Tudo exige login. Dados pessoais (credencial, favoritos, protocolos, histórico,
 * preferências) são filtrados pelo usuário autenticado. A credencial nunca volta ao frontend.
 */
export const cityRouter = Router();
cityRouter.use(requireAuth);

function fail(res: Response, err: unknown) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Dados inválidos." });
  if (err instanceof CityError) return res.status(err.status).json({ error: err.message, state: err.state });
  console.error("[cidade] erro:", err instanceof Error ? err.message : "desconhecido");
  return res.status(500).json({ error: "Não foi possível concluir a ação na Cidade Inteligente." });
}

const readLimit = rateLimit({ windowMs: 60 * 1000, max: 60, message: "Muitas consultas seguidas. Aguarde um minuto." });
const writeLimit = rateLimit({ windowMs: 60 * 1000, max: 40, message: "Muitas ações seguidas. Aguarde um minuto." });
const credLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, message: "Muitas tentativas de credencial. Aguarde alguns minutos." });
const testLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 6, message: "Teste de conexão feito há pouco. Aguarde alguns minutos." });

const API = z.enum(CITY_APIS);
const ID = z.string().min(1).max(40);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const SECRET = z.string().trim().min(8, "Cole o valor completo.").max(2000).regex(/^[\x21-\x7e ]+$/, "O valor tem caracteres inválidos.");

/** Query → parâmetros simples (string). Validação de verdade acontece no catálogo. */
function queryParams(q: Record<string, unknown>, skip: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) if (!skip.includes(k) && typeof v === "string" && k.length <= 30) out[k] = v.slice(0, 120);
  return out;
}

/* ───────────── catálogo, status e credencial ───────────── */

cityRouter.get("/catalog", (_req, res) => res.json(catalog()));

cityRouter.get("/status", async (req, res) => {
  try {
    return res.json(await listApiStatus(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.put("/credentials", credLimit, async (req, res) => {
  try {
    const body = z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("token"), token: SECRET }).strict(),
        z.object({ mode: z.literal("client"), key: SECRET, secret: SECRET }).strict(),
      ])
      .parse(req.body);
    if (body.mode === "token" && cleanCredential(body.token).length < 8) return res.status(400).json({ error: "Token inválido." });
    await saveCredential(getDb(), req.user!.id, body);
    // Cadastrar não basta: só "Conectada" depois de uma consulta real (teste a seguir).
    const apis = await testConnections(getDb(), req.user!.id);
    return res.json({ ok: true, apis });
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.delete("/credentials", credLimit, async (req, res) => {
  try {
    await deleteCredential(getDb(), req.user!.id);
    return res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.put("/apis/disabled", writeLimit, async (req, res) => {
  try {
    const { disabled } = z.object({ disabled: z.array(API).max(CITY_APIS.length) }).strict().parse(req.body);
    await setDisabledApis(getDb(), req.user!.id, disabled);
    return res.json(await listApiStatus(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.post("/test", testLimit, async (req, res) => {
  try {
    const { apis } = z.object({ apis: z.array(API).max(CITY_APIS.length).optional() }).strict().parse(req.body ?? {});
    return res.json({ apis: await testConnections(getDb(), req.user!.id, apis) });
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── visão geral ───────────── */

cityRouter.get("/overview", readLimit, async (req, res) => {
  try {
    return res.json(await getOverview(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── telas de domínio ───────────── */

/** Explorador genérico: qualquer recurso do catálogo, com parâmetros validados contra ele. */
cityRouter.get("/data/:api/:resource", readLimit, async (req, res) => {
  try {
    const api = API.parse(req.params.api) as CityApi;
    const resource = z.string().max(30).parse(req.params.resource);
    if (!CITY_API_DEFS[api].resources[resource]) return res.status(404).json({ error: "Recurso desconhecido para esta API." });
    const r = await cityData(getDb(), req.user!.id, api, resource, queryParams(req.query as Record<string, unknown>, ["force"]), { force: req.query.force === "1" });
    return res.json({ ...r.meta, columns: r.columns, rows: r.rows });
  } catch (e) {
    return fail(res, e);
  }
});

/** Leituras (rankings, somas, série) calculadas pelo LifeOS sobre uma amostra maior do recurso. */
cityRouter.get("/insights/:api/:resource", readLimit, async (req, res) => {
  try {
    const api = API.parse(req.params.api) as CityApi;
    const resource = z.string().max(30).parse(req.params.resource);
    if (!CITY_API_DEFS[api].resources[resource]) return res.status(404).json({ error: "Recurso desconhecido para esta API." });
    const r = await cityInsights(getDb(), req.user!.id, api, resource, queryParams(req.query as Record<string, unknown>, ["limite", "offset"]));
    return res.json({ ...r.meta, insights: r.insights });
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── atividade (histórico + XP diário) ───────────── */

cityRouter.post("/activity", writeLimit, async (req, res) => {
  try {
    const body = z.object({ api: API, action: z.enum(CITY_ACTIONS), ref: z.string().trim().min(1).max(120), label: z.string().trim().max(160).optional() }).strict().parse(req.body);
    return res.json(await recordActivity(getDb(), req.user!.id, body.api, body.action, body.ref, body.label ?? null));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.get("/history", async (req, res) => {
  try {
    return res.json(await listHistory(getDb(), req.user!.id, 60));
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── favoritos ───────────── */

const SCALAR = z.union([z.string().max(600), z.number(), z.boolean(), z.null()]);

cityRouter.get("/favorites", async (req, res) => {
  try {
    const api = req.query.api ? (API.parse(req.query.api) as CityApi) : undefined;
    return res.json(await listFavorites(getDb(), req.user!.id, api));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.post("/favorites", writeLimit, async (req, res) => {
  try {
    const body = z
      .object({
        api: API,
        itemKey: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(300),
        subtitle: z.string().trim().max(300).nullable().optional(),
        url: z.string().trim().max(500).nullable().optional(),
        payload: z.record(z.string().max(60), SCALAR).optional(),
      })
      .strict()
      .parse(req.body);
    if (body.payload && Object.keys(body.payload).length > 30) return res.status(400).json({ error: "Dados demais no favorito." });
    return res.status(201).json(await addFavorite(getDb(), req.user!.id, body as Parameters<typeof addFavorite>[2]));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.delete("/favorites/:id", writeLimit, async (req, res) => {
  try {
    const ok = await removeFavorite(getDb(), req.user!.id, ID.parse(req.params.id));
    return ok ? res.json({ ok }) : res.status(404).json({ error: "Favorito não encontrado." });
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.post("/favorites/:id/task", writeLimit, async (req, res) => {
  try {
    const { dueDate } = z.object({ dueDate: DAY.nullable().optional() }).strict().parse(req.body ?? {});
    return res.status(201).json(await favoriteToTask(getDb(), req.user!.id, ID.parse(req.params.id), dueDate ?? null));
  } catch (e) {
    return fail(res, e);
  }
});

cityRouter.post("/favorites/:id/event", writeLimit, async (req, res) => {
  try {
    const { startsAt } = z.object({ startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Data e hora inválidas.") }).strict().parse(req.body);
    return res.status(201).json(await favoriteToEvent(getDb(), req.user!.id, ID.parse(req.params.id), startsAt));
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── protocolos ───────────── */

const PROTOCOL = z
  .object({
    kind: z.enum(["sp156", "esic"]),
    number: z.string().trim().min(3, "Informe o número do protocolo.").max(40).regex(/^[\w./-]+$/, "Número com caracteres inválidos."),
    title: z.string().trim().min(2).max(160),
    status: z.enum(PROTOCOL_STATUS).default("aberto"),
    notes: z.string().trim().max(2000).nullable().optional(),
    openedOn: DAY.nullable().optional(),
  })
  .strict();

cityRouter.get("/protocols", async (req, res) => {
  try {
    return res.json(await listProtocols(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});
cityRouter.post("/protocols", writeLimit, async (req, res) => {
  try {
    return res.status(201).json({ id: await saveProtocol(getDb(), req.user!.id, PROTOCOL.parse(req.body)) });
  } catch (e) {
    return fail(res, e);
  }
});
cityRouter.put("/protocols/:id", writeLimit, async (req, res) => {
  try {
    return res.json({ id: await saveProtocol(getDb(), req.user!.id, { ...PROTOCOL.parse(req.body), id: ID.parse(req.params.id) }) });
  } catch (e) {
    return fail(res, e);
  }
});
cityRouter.delete("/protocols/:id", writeLimit, async (req, res) => {
  try {
    const ok = await removeProtocol(getDb(), req.user!.id, ID.parse(req.params.id));
    return ok ? res.json({ ok }) : res.status(404).json({ error: "Protocolo não encontrado." });
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── preferências ───────────── */

cityRouter.get("/prefs", async (req, res) => {
  try {
    return res.json(await getPrefs(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});
cityRouter.put("/prefs", writeLimit, async (req, res) => {
  try {
    const body = z.object({ interests: z.array(z.enum(CITY_DOMAINS as [string, ...string[]])).max(8), widgets: z.array(z.enum(CITY_WIDGETS)).max(6) }).strict().parse(req.body);
    await savePrefs(getDb(), req.user!.id, body as Parameters<typeof savePrefs>[2]);
    return res.json(await getPrefs(getDb(), req.user!.id));
  } catch (e) {
    return fail(res, e);
  }
});

/* ───────────── Oráculo da Cidade ───────────── */

cityRouter.post("/oracle", aiRateLimit(15), async (req, res) => {
  try {
    const body = z
      .object({
        api: API,
        resource: z.string().max(30),
        params: z.record(z.string().max(30), z.union([z.string().max(120), z.number()])).default({}),
        question: z.string().trim().max(300).nullable().optional(),
      })
      .strict()
      .parse(req.body);
    return res.json(await askOracle(getDb(), req.user!.id, { ...body, api: body.api as CityApi, question: body.question ?? null }));
  } catch (e) {
    return fail(res, e);
  }
});
