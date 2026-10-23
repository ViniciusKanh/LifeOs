import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { aiRateLimit } from "../middleware/rateLimit.js";
import { getSignalsDashboard, type SignalPeriod } from "../services/signalsService.js";
import { complementWithAI, buildRecommendation } from "../services/signalsRecommendationService.js";
import { detectPatterns } from "../services/signalsPatternService.js";
import { localDailyAggregate, shiftDayKey, userDayContext } from "../services/localDayService.js";

export const signalsRouter = Router();

// Toda rota exige sessão — Signals lê sinais de OUTROS módulos, então
// o isolamento por owner_id é ainda mais crítico aqui (nunca aceitar
// período/valor vindo do corpo sem authenticar o usuário antes).
signalsRouter.use(requireAuth);

const periodSchema = z.enum(["today", "7d", "30d"]).catch("7d");

const TREND_SIGNALS = ["sleep", "mood", "energy", "exercise", "reading"] as const;
type TrendSignal = (typeof TREND_SIGNALS)[number];

type TrendQuery = Pick<Parameters<typeof localDailyAggregate>[2], "table" | "column" | "valueExpr" | "agg"> & { scale: (v: number) => number };

const TREND_QUERIES: Record<TrendSignal, TrendQuery> = {
  sleep: {
    table: "sleep_entries",
    column: "woke_up_at",
    valueExpr: "duration_minutes",
    agg: "avg",
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 480) * 100))),
  },
  mood: {
    table: "mood_entries",
    column: "recorded_at",
    valueExpr: "mood",
    agg: "avg",
    scale: (v) => Math.max(0, Math.min(100, Math.round(((v - 1) / 4) * 100))),
  },
  energy: {
    table: "mood_entries",
    column: "recorded_at",
    valueExpr: "energy",
    agg: "avg",
    scale: (v) => Math.max(0, Math.min(100, Math.round(((v - 1) / 4) * 100))),
  },
  exercise: {
    table: "workouts",
    column: "performed_at",
    valueExpr: "duration_minutes",
    agg: "sum",
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 30) * 100))),
  },
  reading: {
    table: "reading_sessions",
    column: "started_at",
    valueExpr: "pages_read",
    agg: "sum",
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 20) * 100))),
  },
};

/** Período em dias locais do usuário (o dia UTC já virou às 21h em São Paulo). */
function periodBounds(period: SignalPeriod, today: string) {
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  return { from: shiftDayKey(today, -(days - 1)), to: today };
}

/** GET /api/signals?period=today|7d|30d — dashboard agregado (cards, radar, padrões, sugestão-base). */
signalsRouter.get("/", async (req, res) => {
  const db = getDb();
  const period = periodSchema.parse(req.query.period);
  const dashboard = await getSignalsDashboard(db, req.user!.id, period);
  res.json(dashboard);
});

/** GET /api/signals/trend?period=&signal= — série diária normalizada (0-100) de um sinal, para o gráfico "Variação dos sinais". */
signalsRouter.get("/trend", async (req, res) => {
  const period = periodSchema.parse(req.query.period);
  const signal = TREND_SIGNALS.includes(req.query.signal as TrendSignal) ? (req.query.signal as TrendSignal) : "sleep";
  const db = getDb();
  const { tz, today } = await userDayContext(db, req.user!.id);
  const { from, to } = periodBounds(period, today);
  const { scale, ...query } = TREND_QUERIES[signal];
  const byDay = await localDailyAggregate(db, req.user!.id, { ...query, fromDay: from, toDay: to, timeZone: tz });
  const series = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, value: scale(v) }));
  res.json({ signal, from, to, series });
});

/** POST /api/signals/suggestion/ai — complemento opcional do Gemini sobre a sugestão determinística (nunca bloqueia o dashboard principal). */
signalsRouter.post("/suggestion/ai", aiRateLimit(20), async (req, res) => {
  const db = getDb();
  const period = periodSchema.parse(req.body?.period);
  const dashboard = await getSignalsDashboard(db, req.user!.id, period);
  const patterns = await detectPatterns(db, req.user!.id, dashboard.from, dashboard.to);
  const base = buildRecommendation(dashboard.signals, patterns, dashboard.radar);
  const recommendation = await complementWithAI(base, dashboard.signals, dashboard.radar);
  res.json(recommendation);
});
