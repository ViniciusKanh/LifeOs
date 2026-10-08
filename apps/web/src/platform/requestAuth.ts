import { IS_DESKTOP } from "./index";

/**
 * Autenticação por requisição, compartilhada por todo fetch para a API.
 * Web: nada a acrescentar (o cookie httpOnly viaja com credentials: "include").
 * Desktop: identifica o cliente e envia o token salvo como Bearer.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!IS_DESKTOP) return {};
  const { desktopSessionToken } = await import("./desktopSession");
  const token = desktopSessionToken();
  return { "X-LifeOS-Client": "desktop", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Lê o token renovado/emitido pela API (cabeçalho X-LifeOS-Session) e o persiste no Desktop. */
export async function captureSession(res: Response): Promise<void> {
  if (!IS_DESKTOP) return;
  const next = res.headers.get("X-LifeOS-Session");
  const { storeDesktopSession, clearDesktopSession } = await import("./desktopSession");
  if (next) await storeDesktopSession(next);
  else if (res.status === 401) await clearDesktopSession();
}

export async function clearSessionOnLogout(): Promise<void> {
  if (!IS_DESKTOP) return;
  const { clearDesktopSession } = await import("./desktopSession");
  await clearDesktopSession();
}
