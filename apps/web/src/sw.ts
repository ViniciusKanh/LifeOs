/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

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
