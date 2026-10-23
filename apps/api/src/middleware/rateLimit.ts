import type { Request, Response, NextFunction } from "express";

/**
 * Rate limiter em memória. Suficiente para uma instância única; em produção
 * com múltiplas instâncias, trocar por um backend compartilhado (ex: Redis)
 * mantendo a mesma interface (windowMs, max, key).
 *
 * Chave: usuário autenticado quando houver (o limiter roda depois do
 * requireAuth), senão IP — mais o caminho *declarado* da rota
 * (`/:date/ai/organize`, não `/2026-10-22/ai/organize`), para que variar um
 * parâmetro da URL não zere o contador.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Limpeza periódica de janelas vencidas para o mapa não crescer sem limite.
const SWEEP_EVERY_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
}

export type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  key?: (req: Request) => string;
  /** Mensagem do 429 (PT-BR). */
  message?: string;
};

function routeKey(req: Request): string {
  const declared = (req.route as { path?: unknown } | undefined)?.path;
  return `${req.baseUrl}${typeof declared === "string" ? declared : req.path}`;
}

function identity(req: Request): string {
  return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
}

export function rateLimit(options?: RateLimitOptions) {
  const windowMs = options?.windowMs ?? Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  const max = options?.max ?? Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
  const message = options?.message ?? "Muitas tentativas. Tente novamente em alguns minutos.";

  return (req: Request, res: Response, next: NextFunction) => {
    // Escape explícito só para suítes automatizadas (nunca ligado em produção).
    if (process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_DISABLED === "true") return next();

    const key = `${options?.key ? options.key(req) : identity(req)}:${routeKey(req)}`;
    const now = Date.now();
    sweep(now);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message, retryAfterSec });
    }

    bucket.count += 1;
    return next();
  };
}

/** Rotas que chamam o Gemini: por usuário, 30 chamadas a cada 10 minutos. */
export function aiRateLimit(max = 30) {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max,
    message: "Muitas solicitações à IA em pouco tempo. Aguarde alguns minutos e tente novamente.",
  });
}

/** Exportação de dados (consulta todas as tabelas do usuário): 5 por hora. */
export const exportRateLimit = () =>
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: "Você já exportou seus dados várias vezes na última hora. Tente novamente mais tarde." });

/** Convites (ex.: Guilda): 20 por hora por usuário, contra spam/enumeração. */
export const inviteRateLimit = () =>
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: "Muitos convites em pouco tempo. Tente novamente mais tarde." });
