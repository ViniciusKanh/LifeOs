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

const app = express();

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true, // necessário para o cookie httpOnly de sessão
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/admin", adminRouter);
app.use("/api", libraryRouter);
app.use("/api", educationRouter);

// Handler de erro central — nunca vaza stack trace para o cliente.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => {
  console.log(`✓ LifeOS API rodando em http://localhost:${port}`);
});
