import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE, clearSession, sessionTokenFrom, getAuthState, issueSession, readSession, shouldRenew, touchLastSeen } from "../services/sessionService.js";
import type { AuthenticatedUser } from "../types/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Exige uma sessão válida. O token vive em um cookie httpOnly
 * (nunca em localStorage) para reduzir a superfície de XSS.
 * Toda rota que lida com dados de um usuário DEVE passar por este
 * middleware antes de tocar no banco — é aqui que req.user.id
 * nasce e é ele que toda query subsequente usa para filtrar
 * "WHERE owner_id = req.user.id".
 *
 * Além de validar o JWT, confere no banco (com cache curto) se o
 * usuário ainda existe e se a sessão não foi revogada (session_version),
 * e usa o papel ATUAL do banco — não o que estava no token. Renova a
 * sessão sozinha enquanto o usuário usa o app ("permanecer conectado").
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = sessionTokenFrom(req);
  if (!token) {
    return res.status(401).json({ error: "Sessão não encontrada. Faça login novamente." });
  }

  let claims;
  try {
    claims = readSession(token);
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }

  const state = await getAuthState(claims.sub);
  if (!state.exists || claims.sv < state.sessionVersion) {
    clearSession(res);
    return res.status(401).json({ error: "Sua sessão foi encerrada. Faça login novamente." });
  }

  req.user = { id: claims.sub, role: state.role };

  if (shouldRenew(claims)) {
    issueSession(res, { id: claims.sub, role: state.role, session_version: state.sessionVersion }, claims.rm);
    touchLastSeen(claims.sub).catch(() => undefined);
  }
  return next();
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
