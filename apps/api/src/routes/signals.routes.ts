import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getSignalsDashboard, type SignalPeriod } from "../services/signalsService.js";
import { complementWithAI, buildRecommendation } from "../services/signalsRecommendationService.js";
import { detectPatterns } from "../services/signalsPatternService.js";

export const signalsRouter = Router();

// Toda rota exige sessão — Signals lê sinais de OUTROS módulos, então
// o isolamento por owner_id é ainda mais crítico aqui (nunca aceitar
// período/valor vindo do corpo sem authenticar o usuário antes).
signalsRouter.use(requireAuth);

const periodSchema = z.enum(["today", "7d", "30d"]).catch("7d");

const TREND_SIGNALS = ["sleep", "mood", "energy", "focus", "exercise", "reading"] as const;
type TrendSignal = (typeof TREND_SIGNALS)[number];

const TREND_QUERIES: Record<TrendSignal, { sql: string; scale: (v: number) => number }> = {
  sleep: {
    sql: `SELECT date(woke_up_at) AS d, AVG(duration_minutes) AS v FROM sleep_entries WHERE owner_id = ? AND date(woke_up_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 480) * 100))),
  },
  mood: {
    sql: `SELECT date(recorded_at) AS d, AVG(mood) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round(((v - 1) / 4) * 100))),
  },
  energy: {
    sql: `SELECT date(recorded_at) AS d, AVG(energy) AS v FROM mood_entries WHERE owner_id = ? AND date(recorded_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round(((v - 1) / 4) * 100))),
  },
  focus: {
    sql: `SELECT date(started_at) AS d, SUM(actual_minutes) AS v FROM focus_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 120) * 100))),
  },
  exercise: {
    sql: `SELECT date(performed_at) AS d, SUM(duration_minutes) AS v FROM workouts WHERE owner_id = ? AND date(performed_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 30) * 100))),
  },
  reading: {
    sql: `SELECT date(started_at) AS d, SUM(pages_read) AS v FROM reading_sessions WHERE owner_id = ? AND date(started_at) BETWEEN date(?) AND date(?) GROUP BY d`,
    scale: (v) => Math.max(0, Math.min(100, Math.round((v / 20) * 100))),
  },
};

function periodBounds(period: SignalPeriod) {
  const to = new Date().toISOString().slice(0, 10);
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to };
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
  const { from, to } = periodBounds(period);
  const { sql, scale } = TREND_QUERIES[signal];
  const result = await db.execute({ sql, args: [req.user!.id, from, to] });
  const series = (result.rows as unknown as Array<{ d: string; v: number | null }>)
    .filter((r) => r.v != null)
    .map((r) => ({ date: r.d, value: scale(Number(r.v)) }));
  res.json({ signal, from, to, series });
});

/** POST /api/signals/suggestion/ai — complemento opcional do Gemini sobre a sugestão determinística (nunca bloqueia o dashboard principal). */
signalsRouter.post("/suggestion/ai", async (req, res) => {
  const db = getDb();
  const period = periodSchema.parse(req.body?.period);
  const dashboard = await getSignalsDashboard(db, req.user!.id, period);
  const patterns = await detectPatterns(db, req.user!.id, dashboard.from, dashboard.to);
  const base = buildRecommendation(dashboard.signals, patterns, dashboard.radar);
  const recommendation = await complementWithAI(base, dashboard.signals, dashboard.radar);
  res.json(recommendation);
});
