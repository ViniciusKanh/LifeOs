/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

/**
 * Service worker customizado (estratégia injectManifest): precisa ser
 * assim — em vez do generateSW automático — porque só um SW escrito à
 * mão pode reagir a eventos 'push' e 'notificationclick'. O
 * precacheAndRoute(self.__WB_MANIFEST) abaixo mantém o mesmo cache do
 * shell do app que o generateSW fazia automaticamente.
 */
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

/**
 * Notificação push recebida com o app fechado (ou em segundo plano).
 * O payload é sempre um JSON simples { title, body, url } — ver
 * PushPayload em apps/api/src/services/pushService.ts.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LifeOS", body: event.data.text() };
  }

  const title = payload.title ?? "LifeOS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: "/logo/icon-192.png",
      badge: "/logo/icon-192.png",
      data: { url: payload.url ?? "/" },
    })
  );
});

/** Clique na notificação: foca uma aba já aberta do LifeOS (navegando pra dentro dela) ou abre uma nova. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => "focus" in c);
      if (existing) {
        await (existing as WindowClient).focus();
        existing.postMessage({ type: "lifeos:navigate", url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});

/* ------------------------------------------------------------------
 * Offline: leituras da API em "rede primeiro, cache como reserva" — sem
 * conexão, as telas abrem com o último dado visto neste aparelho. Ficam
 * de fora rotas sensíveis ou pesadas (login, admin, cron, arquivos,
 * exportações). O cache é apagado no logout (lib/offlineQueue.ts).
 * ------------------------------------------------------------------ */
const API_CACHE_EXCLUDE = /^\/api\/(auth\/(?!me$)|admin|cron|push|export|copilot|search)|\/file$|\/export\//;

registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/") && !API_CACHE_EXCLUDE.test(url.pathname),
  new NetworkFirst({
    cacheName: "lifeos-api",
    networkTimeoutSeconds: 5,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 14 * 24 * 60 * 60 })],
  })
);

// Navegação offline (SPA): qualquer rota do app abre o index.html do cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));
