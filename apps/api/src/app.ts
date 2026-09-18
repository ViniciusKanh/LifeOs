import "dotenv/config";
// Precisa vir logo no início, antes de qualquer rota: faz o Express
// encaminhar automaticamente uma rejeição de promise dentro de uma
// rota "async (req, res) => {...}" para o error handler central
// abaixo. Sem isso, um erro assíncrono (ex.: tabela ausente no banco)
// nunca chama res.json/res.status — a requisição fica pendurada até
// a function da Vercel bater o timeout (maxDuration) e virar 504,
// em vez de responder 500 na hora.
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { habitsRouter } from "./routes/habits.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { libraryRouter } from "./routes/library.routes.js";
import { educationRouter } from "./routes/education.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { goalsRouter } from "./routes/goals.routes.js";
import { focusRouter } from "./routes/focus.routes.js";
import { reviewsRouter } from "./routes/reviews.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { copilotRouter } from "./routes/copilot.routes.js";
import { eventsRouter } from "./routes/events.routes.js";
import { achievementsRouter } from "./routes/achievements.routes.js";
import { exportRouter } from "./routes/export.routes.js";
import { pushRouter } from "./routes/push.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { inboxRouter } from "./routes/inbox.routes.js";
import { workNotesRouter } from "./routes/work-notes.routes.js";
import { lifemapRouter } from "./routes/lifemap.routes.js";
import { experimentsRouter } from "./routes/experiments.routes.js";
import { cronRouter } from "./routes/cron.routes.js";
import { signalsRouter } from "./routes/signals.routes.js";
import { contextRouter } from "./routes/context.routes.js";
import { runMigrations } from "./db/migrate.js";

/**
 * Configuração do Express extraída para um módulo próprio (sem
 * app.listen) para poder ser reaproveitada tanto pelo servidor
 * tradicional (src/index.ts, usado em dev e em hosts long-running)
 * quanto pela função serverless da Vercel (api/index.ts na raiz do
 * pacote) — ver DEPLOY.md na raiz do monorepo.
 */
export const app = express();

// Aplica migrations pendentes automaticamente no primeiro request de
// cada cold start (na Vercel não há como rodar "npm run migrate" à
// mão contra o banco de produção). runMigrations() é idempotente —
// cada migration só roda uma vez, registrada em schema_migrations —
// então isso é seguro mesmo com várias instâncias da function
// subindo ao mesmo tempo. Se falhar, a promise é descartada para a
// próxima requisição tentar de novo, em vez de travar o servidor
// permanentemente com um erro de conexão passageiro.
let migrationsReady: Promise<void> | null = null;
function ensureMigrations(): Promise<void> {
  if (!migrationsReady) {
    migrationsReady = runMigrations().catch((err) => {
      console.error("✗ falha ao aplicar migrations automaticamente:", err);
      migrationsReady = null;
      throw err;
    });
  }
  return migrationsReady;
}

// Em produção na Vercel, front e back normalmente rodam em domínios
// diferentes; o proxy documentado em DEPLOY.md faz as chamadas do
// front caírem como same-origin, então o CORS abaixo é sobretudo
// para desenvolvimento local e para quem optar por não usar o proxy.
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true, // necessário para o cookie httpOnly de sessão
  })
);
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use(async (_req, _res, next) => {
  await ensureMigrations();
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/admin", adminRouter);
// pushRouter tem uma rota pública (GET /vapid-public-key) e precisa
// ser montado ANTES de libraryRouter/educationRouter: os dois são
// montados no prefixo genérico "/api" com requireAuth incondicional,
// então se viessem antes, qualquer requisição não autenticada a
// /api/push/* seria barrada por eles antes de chegar no pushRouter
// de verdade (Express tenta os middlewares na ordem em que foram
// registrados, e "/api" também "bate" com "/api/push/...").
app.use("/api/push", pushRouter);
app.use("/api", libraryRouter);
app.use("/api", educationRouter);
app.use("/api/health", healthRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/focus", focusRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/copilot", copilotRouter);
app.use("/api/events", eventsRouter);
app.use("/api/achievements", achievementsRouter);
app.use("/api/export", exportRouter);
app.use("/api/search", searchRouter);
app.use("/api/inbox", inboxRouter);
app.use("/api/work-notes", workNotesRouter);
app.use("/api/lifemap", lifemapRouter);
app.use("/api/experiments", experimentsRouter);
app.use("/api/signals", signalsRouter);
app.use("/api/context", contextRouter);
// Sem requireAuth — protegido por segredo próprio (ver cron.routes.ts),
// chamado por um agendador externo, nunca por um usuário logado.
app.use("/api/cron", cronRouter);

// Handler de erro central — nunca vaza stack trace para o cliente.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});
