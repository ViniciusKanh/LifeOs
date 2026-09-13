import "dotenv/config";
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

/**
 * Configuração do Express extraída para um módulo próprio (sem
 * app.listen) para poder ser reaproveitada tanto pelo servidor
 * tradicional (src/index.ts, usado em dev e em hosts long-running)
 * quanto pela função serverless da Vercel (api/index.ts na raiz do
 * pacote) — ver DEPLOY.md na raiz do monorepo.
 */
export const app = express();

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

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/admin", adminRouter);
app.use("/api", libraryRouter);
app.use("/api", educationRouter);
app.use("/api/health", healthRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/focus", focusRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/copilot", copilotRouter);

// Handler de erro central — nunca vaza stack trace para o cliente.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});
