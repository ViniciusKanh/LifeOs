/**
 * Login com Google no LifeOS Desktop.
 *
 * O Google recusa OAuth dentro de webviews embutidas, então o fluxo abre no
 * navegador padrão e volta ao app por deep link (lifeos://auth?code=...).
 * Proteção PKCE: o app gera um verificador aleatório que nunca sai da janela
 * nativa; só o desafio (SHA-256) vai ao navegador. Um código interceptado no
 * caminho não vale nada sem o verificador. O verificador fica em
 * sessionStorage apenas durante o login e é apagado na troca.
 */
const VERIFIER_KEY = "lifeos:desktop-oauth-verifier";

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Abre o login do Google no navegador do sistema (comando nativo `open_google_login`). */
export async function startDesktopGoogleLogin(startUrl: string): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const url = new URL(startUrl, window.location.origin);
  url.searchParams.set("desktop", base64Url(new Uint8Array(digest)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_google_login", { url: url.toString() });
}

/** Lê e descarta o verificador (uso único). */
export function takeDesktopVerifier(): string | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    return verifier;
  } catch {
    return null;
  }
}

/** Deep link que devolve o código ao app instalado. */
export const desktopDeepLink = (code: string) => `lifeos://auth?code=${encodeURIComponent(code)}`;
