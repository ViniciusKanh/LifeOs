import { IS_DESKTOP } from "./index";

/**
 * Ponte com a parte nativa do LifeOS Desktop (Tauri 2).
 * - notify: notificação nativa do Windows via comando `desktop_notify` (o texto
 *   é validado/limitado também no Rust; a permissão só vale no domínio publicado);
 * - onDesktopEvent: ações vindas da bandeja/atalho global. O app nativo dispara
 *   eventos DOM fixos (`lifeos:desktop`), então não é preciso permissão de eventos.
 * Na Web tudo vira no-op, sem carregar nada do Tauri.
 */

export type DesktopAction = "tavern" | "check-updates";

const DESKTOP_EVENT = "lifeos:desktop";
const ACTIONS: readonly DesktopAction[] = ["tavern", "check-updates"];

export function isDesktop(): boolean {
  return IS_DESKTOP;
}

/** Mostra uma notificação nativa. Retorna false fora do Desktop ou se falhar. */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!IS_DESKTOP) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_notify", { title, body });
    return true;
  } catch {
    return false;
  }
}

function isDesktopAction(value: unknown): value is DesktopAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/** Escuta as ações do app nativo (menu da bandeja). Retorna a função de cancelamento. */
export function onDesktopEvent(handler: (action: DesktopAction) => void): () => void {
  if (!IS_DESKTOP) return () => undefined;
  const listener = (event: Event) => {
    const action = (event as CustomEvent<{ action?: unknown }>).detail?.action;
    if (isDesktopAction(action)) handler(action);
  };
  window.addEventListener(DESKTOP_EVENT, listener);
  return () => window.removeEventListener(DESKTOP_EVENT, listener);
}
