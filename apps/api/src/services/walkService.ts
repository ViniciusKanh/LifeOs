import { fetchJson } from "./integrationsCore.js";
import { haversineKm } from "./atlasService.js";

/**
 * Minutos a pé entre dois pontos. Usa o OSRM público do OpenStreetMap
 * (routing.openstreetmap.de, perfil "foot"). Se o serviço não responder, cai
 * numa estimativa honesta — linha reta × 1,3 a 75 m/min — marcada como estimada.
 * Chamado só ao guardar ponto/jornada (o resultado fica gravado), nunca a cada tela.
 */
const OSRM = process.env.OSRM_FOOT_URL?.trim().replace(/\/+$/, "") || "https://routing.openstreetmap.de/routed-foot";
const cache = new Map<string, { minutes: number; meters: number; estimated: boolean }>();

export function estimateWalk(from: [number, number], to: [number, number]) {
  const meters = Math.round(haversineKm(from, to) * 1000 * 1.3);
  return { minutes: Math.max(1, Math.round(meters / 75)), meters, estimated: true };
}

export async function walkMinutes(from: [number, number], to: [number, number]): Promise<{ minutes: number; meters: number; estimated: boolean }> {
  const key = [...from, ...to].map((n) => n.toFixed(5)).join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const r = await fetchJson<{ code?: string; routes?: Array<{ duration: number; distance: number }> }>(
      `${OSRM}/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`,
      { headers: { "User-Agent": "LifeOS/1.0 (estação das carruagens)" } },
      { label: "OSRM", timeoutMs: 6000, retries: 0 },
    );
    const route = r?.routes?.[0];
    if (r?.code !== "Ok" || !route) throw new Error("sem rota");
    const v = { minutes: Math.max(1, Math.round(route.duration / 60)), meters: Math.round(route.distance), estimated: false };
    cache.set(key, v);
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return v;
  } catch {
    return estimateWalk(from, to);
  }
}
