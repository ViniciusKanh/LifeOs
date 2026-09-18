import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getContextLocation, updateContextLocation } from "../services/contextLocationService.js";
import { getContextDashboard } from "../services/contextService.js";
import { OpenMeteoWeatherProvider } from "../services/openMeteoProvider.js";

export const contextRouter = Router();

// Toda rota exige sessão — localização e sinais ambientais pertencem
// ao usuário autenticado, nunca lidos/gravados sem isso.
contextRouter.use(requireAuth);

const periodSchema = z.enum(["today", "7d", "30d"]).catch("today");

/** GET /api/context/today?period= — dashboard completo (KPIs, clima do dia, resumo, dica, agenda, impactos, insights, comparativo). */
contextRouter.get("/today", async (req, res) => {
  const db = getDb();
  const period = periodSchema.parse(req.query.period);
  const dashboard = await getContextDashboard(db, req.user!.id, period);
  res.json(dashboard);
});

/** GET /api/context/location — configuração de localização do usuário (nunca histórico, só a localização atual). */
contextRouter.get("/location", async (req, res) => {
  const db = getDb();
  const location = await getContextLocation(db, req.user!.id);
  res.json(location);
});

const updateLocationSchema = z.object({
  city: z.string().trim().min(1).max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  autoLocation: z.boolean().optional(),
  tempUnit: z.enum(["celsius", "fahrenheit"]).optional(),
  windUnit: z.enum(["kmh", "mph"]).optional(),
  showAirQuality: z.boolean().optional(),
  showUv: z.boolean().optional(),
  weatherAlerts: z.boolean().optional(),
});

/** PATCH /api/context/location — atualiza cidade/coordenadas/preferências. Nunca aceita localização sem confirmação explícita do usuário (regra 5/6). */
contextRouter.patch("/location", async (req, res) => {
  const parsed = updateLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados de localização inválidos.", details: parsed.error.flatten() });
  }
  const db = getDb();
  const location = await updateContextLocation(db, req.user!.id, parsed.data);
  res.json(location);
});

/** GET /api/context/geocode?q=São Paulo — resolve cidade digitada em coordenadas/timezone via Open-Meteo Geocoding (regra 6). */
contextRouter.get("/geocode", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) return res.json([]);
  const results = await OpenMeteoWeatherProvider.geocodeLocation(query);
  res.json(results);
});
