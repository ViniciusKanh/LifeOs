import type { Request, Response, NextFunction } from "express";

/**
 * Deve sempre ser usado DEPOIS de requireAuth. A verificação de
 * role acontece contra o valor decodificado do JWT assinado pelo
 * servidor — nunca contra algo enviado pelo cliente no corpo da
 * requisição, e nunca por comparação de e-mail no frontend.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  return next();
}
