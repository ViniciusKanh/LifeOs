import { api } from "./api";

export interface PushStatus {
  subscribed: boolean;
  count: number;
}

/**
 * Espelha apps/api/src/routes/push.routes.ts. A conversão de chave
 * VAPID (base64url) para o Uint8Array que a PushManager exige vive em
 * usePush.ts, junto do resto da lógica de Service Worker/permissão —
 * aqui é só a camada HTTP fina, igual aos outros *Service.ts do app.
 */
export const pushService = {
  getVapidPublicKey: () => api.get<{ publicKey: string }>("/push/vapid-public-key"),
  getStatus: () => api.get<PushStatus>("/push/subscribe"),
  subscribe: (subscription: PushSubscriptionJSON) => api.post<{ ok: boolean }>("/push/subscribe", subscription),
  unsubscribe: (endpoint: string) => api.delete<void>("/push/subscribe", { endpoint }),
  sendTest: () => api.post<{ ok: boolean; sent: number }>("/push/test", {}),
};
