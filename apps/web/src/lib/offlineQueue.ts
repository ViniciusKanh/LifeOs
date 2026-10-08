import { API_URL } from "@/services/api";
import { authHeaders } from "@/platform/requestAuth";

/**
 * Fila offline de capturas. Quando não há conexão, POSTs de captura (Inbox,
 * tarefa rápida, nota) ficam guardados neste aparelho e são enviados assim
 * que a conexão volta. Só entram rotas de criação idempotentes o bastante
 * para reenvio — nada de exclusão ou edição.
 *
 * Fica no localStorage do aparelho e é apagada no logout (ver clearOfflineData).
 */

const KEY = "lifeos.offlineQueue.v1";
const EVENT = "lifeos:offline-queue";

export interface QueuedRequest {
  id: string;
  path: string;
  body: unknown;
  label: string;
  createdAt: string;
}

const ALLOWED = [/^\/inbox$/, /^\/tasks$/, /^\/notes$/];

function read(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // armazenamento cheio/indisponível: não há como guardar offline
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items.length }));
}

export function pendingCount(): number {
  return read().length;
}

export function onQueueChange(cb: (count: number) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<number>).detail ?? read().length);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Erro de rede (sem resposta do servidor) — diferente de um 4xx/5xx. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}

export function canQueue(path: string): boolean {
  return ALLOWED.some((r) => r.test(path));
}

export function enqueue(path: string, body: unknown, label: string): QueuedRequest {
  const item: QueuedRequest = { id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, path, body, label, createdAt: new Date().toISOString() };
  write([...read(), item]);
  return item;
}

let flushing = false;

/** Envia a fila em ordem; para no primeiro erro de rede (tenta de novo depois). Erros 4xx descartam o item. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    let items = read();
    while (items.length > 0) {
      const [next, ...rest] = items;
      try {
        const res = await fetch(`${API_URL}${next.path}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify(next.body),
        });
        if (res.status === 401) break; // sessão expirou: mantém a fila até o login
        if (res.ok) sent += 1;
        else failed += 1; // dado inválido não vai passar num reenvio
      } catch {
        break;
      }
      items = rest;
      write(items);
    }
  } finally {
    flushing = false;
  }
  if (sent > 0) window.dispatchEvent(new CustomEvent("lifeos:offline-synced", { detail: sent }));
  return { sent, failed };
}

/** Logout: apaga fila e o cache de leituras do service worker deste aparelho. */
export async function clearOfflineData() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
  if (typeof caches !== "undefined") await caches.delete("lifeos-api").catch(() => undefined);
}
