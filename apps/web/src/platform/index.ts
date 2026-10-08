/**
 * Camada de plataforma: o mesmo código React roda na Web (Vercel) e no
 * LifeOS Desktop (Tauri 2 / WebView2). A plataforma é decidida em tempo de
 * build (`vite build --mode desktop`), então o bundle Web não carrega nada do
 * Tauri — os imports nativos ficam em chunks dinâmicos só alcançados no Desktop.
 */
export const IS_DESKTOP = import.meta.env.VITE_PLATFORM === "desktop";

/** Recursos que dependem do ambiente (o Desktop não usa Service Worker nem OAuth por redirecionamento). */
export const platformFeatures = {
  webPush: !IS_DESKTOP,
  googleOAuthRedirect: !IS_DESKTOP,
} as const;

/** Prepara a plataforma antes do primeiro render (no Desktop, carrega a sessão salva). */
export async function initPlatform(): Promise<void> {
  if (!IS_DESKTOP) return;
  const { loadDesktopSession } = await import("./desktopSession");
  await loadDesktopSession();
}

/** Versão do app nativo (null na Web). */
export async function desktopVersion(): Promise<string | null> {
  if (!IS_DESKTOP) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}
