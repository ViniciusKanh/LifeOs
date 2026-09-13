import { useCallback, useEffect, useState } from "react";
import { pushService } from "@/services/pushService";

/** Converte a chave pública VAPID (base64url) para o Uint8Array que PushManager.subscribe exige. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type PushSupport = "checking" | "unsupported" | "supported";

/**
 * Push notifications reais (Web Push/VAPID) — pede permissão do
 * navegador, registra a inscrição no PushManager do Service Worker e
 * sincroniza com o backend (push_subscriptions). `isSubscribed` reflete
 * o estado real do navegador (PushManager.getSubscription()), não só
 * o que o backend acha que tem — evita o toggle mentir se o usuário
 * revogou a permissão manualmente nas configurações do navegador.
 */
export function usePush() {
  const [support, setSupport] = useState<PushSupport>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupport("unsupported");
      return;
    }
    setSupport("supported");
    setPermission(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setError("Permissão de notificação negada. Ative nas configurações do navegador para ativar.");
        return;
      }

      const { publicKey } = await pushService.getVapidPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await pushService.subscribe(sub.toJSON() as PushSubscriptionJSON);
      setIsSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar as notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await pushService.unsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar as notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    return pushService.sendTest();
  }, []);

  return { support, permission, isSubscribed, loading, error, subscribe, unsubscribe, sendTest };
}
