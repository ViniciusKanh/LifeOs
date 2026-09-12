import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../services/authService.js";
import type { AuthenticatedUser } from "../types/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const COOKIE_NAME = "lifeos_session";

/**
 * Exige uma sessão válida. O token vive em um cookie httpOnly
 * (nunca em localStorage) para reduzir a superfície de XSS.
 * Toda rota que lida com dados de um usuário DEVE passar por este
 * middleware antes de tocar no banco — é aqui que req.user.id
 * nasce e é ele que toda query subsequente usa para filtrar
 * "WHERE owner_id = req.user.id".
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Sessão não encontrada. Faça login novamente." });
  }

  try {
    const payload = verifySessionToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
