import { invoke } from "@tauri-apps/api/core";

/**
 * Sessão do LifeOS Desktop. A janela Tauri roda em outra origem
 * (tauri.localhost), onde o cookie httpOnly da Web não viaja; por isso a API
 * entrega o mesmo token de sessão por cabeçalho e ele fica guardado no
 * Gerenciador de Credenciais do Windows (comandos Rust em session.rs).
 * Em memória só durante a execução — nunca em localStorage.
 */
let token: string | null = null;

export async function loadDesktopSession(): Promise<void> {
  try {
    token = (await invoke<string | null>("session_token_get")) ?? null;
  } catch {
    token = null;
  }
}

export function desktopSessionToken(): string | null {
  return token;
}

/** Guarda um token novo (login, MFA ou renovação automática). */
export async function storeDesktopSession(next: string): Promise<void> {
  if (next === token) return;
  token = next;
  await invoke("session_token_set", { token: next }).catch(() => undefined);
}

export async function clearDesktopSession(): Promise<void> {
  token = null;
  await invoke("session_token_clear").catch(() => undefined);
}
