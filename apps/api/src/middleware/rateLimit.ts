import type { Request, Response, NextFunction } from "express";

/**
 * Rate limiter em memória, por IP + rota. Suficiente para uma
 * instância única; em produção com múltiplas instâncias, trocar
 * por um backend compartilhado (ex: Redis) mantendo a mesma
 * interface (windowMs, max).
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs
    ?? Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  const max = options?.max
    ?? Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Muitas tentativas. Tente novamente em alguns minutos.",
      });
    }

    bucket.count += 1;
    return next();
  };
}
