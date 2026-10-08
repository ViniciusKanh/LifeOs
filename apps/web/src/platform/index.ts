/**
 * Camada de plataforma. O LifeOS Desktop (Tauri 2) é um app nativo instalado
 * que abre esta mesma aplicação publicada na Vercel — por isso Web e Desktop
 * recebem toda atualização juntos, a cada deploy. Aqui só detectamos, em
 * tempo de execução, quando estamos dentro da janela nativa.
 */
export const IS_DESKTOP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Recursos que dependem do ambiente. */
export const platformFeatures = {
  // WebView2 não entrega Web Push; as notificações do Desktop serão nativas (Etapa 4).
  webPush: !IS_DESKTOP,
  // O Google recusa OAuth dentro de webviews: na Web o fluxo é por redirect; no
  // Desktop o login abre no navegador do sistema e volta por deep link
  // (platform/desktopAuth.ts). Vincular o Google pelo Perfil segue só na Web.
  googleOAuthRedirect: !IS_DESKTOP,
} as const;

/** Versão do aplicativo instalado (null na Web). */
export async function desktopVersion(): Promise<string | null> {
  if (!IS_DESKTOP) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion().catch(() => null);
}
