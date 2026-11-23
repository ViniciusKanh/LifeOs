import { useEffect, useMemo, useState } from "react";
import type { EngineData, EngineSettings } from "./engine/WorldEngine";
import type { RoomKey } from "./engine/worldMap";
import { buildMarkers, type WorldFacts } from "./engine/village";
import type { WorldState } from "@/services/livingWorldService";
import { itemArtUrl } from "@/utils/inventoryDisplay";

/*
 * Entradas do motor do Meu Mundo derivadas do estado real (GET /api/world).
 * Compartilhado pela tela principal e pelo painel do clima, para as duas
 * Vilas serem idênticas.
 */

export function usePrefersReducedMotion() {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setV(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return v;
}

/** Status curto de cada ambiente, sempre derivado de dado real. */
export function roomStatus(w: WorldState, pendingAgent: string | null): Partial<Record<RoomKey, string>> {
  const busy = (key: string) => pendingAgent === key || w.agents.find((a) => a.key === key)?.lastRun?.status === "running";
  const done = w.habits.filter((h) => h.doneToday).length;
  const inProgress = w.missions.open.filter((m) => m.status === "Em Andamento").length;
  return {
    biblioteca: w.activity?.room === "biblioteca" ? "Estudando" : busy("mentor") ? "Mentor analisando" : w.rooms.library.studyMinutesToday ? `${w.rooms.library.studyMinutesToday} min de estudo hoje` : "Estudos e leitura",
    escritorio: w.activity?.room === "escritorio" ? "Trabalhando" : busy("planejador") || busy("analista") ? "Agente ativo" : `${inProgress} em andamento`,
    guilda: `${w.missions.open.length} missão(ões) aberta(s)`,
    academia: w.rooms.gym.today.length ? "Treino feito hoje" : "Disponível",
    casa: w.rooms.home.journalWordsToday ? "Diário escrito hoje" : "Descanso e diário",
    jardim: w.habits.length ? `${done}/${w.habits.length} hábitos hoje` : "Sem hábitos",
    praca: "Centro do mundo",
  };
}


export function useWorldEngineInputs(w: WorldState | undefined, pendingAgent: string | null, reduced: boolean) {
  const engineSettings: EngineSettings = useMemo(() => {
    const s = w?.settings;
    return {
      quality: s?.quality ?? "high",
      effects: s?.effects ?? 2,
      animSpeed: s?.animSpeed ?? 1,
      sound: s?.sound ?? false,
      autonomous: s?.autonomous ?? true,
      showNames: s?.showNames ?? true,
      showIndicators: s?.showIndicators ?? true,
      showLabels: s?.showLabels ?? true,
      followAvatar: s?.followAvatar ?? false,
      reducedMotion: reduced,
    };
  }, [w?.settings, reduced]);

  // Fatos reais do dia → brasões de pendência nas casas e assunto das conversas dos agentes.
  const facts: WorldFacts | null = useMemo(() => (w?.pendencies ? { ...w.pendencies, activityTitle: w.activity?.title ?? null } : null), [w]);
  const markers = useMemo(() => buildMarkers(facts), [facts]);

  const engineData: EngineData | null = useMemo(() => {
    if (!w) return null;
    return {
      avatar: w.avatar,
      activity: w.activity ? { room: w.activity.room, title: w.activity.title } : null,
      agents: w.agents.map((a) => ({ key: a.key, name: a.nickname ?? a.name, color: a.color, look: a.look, status: pendingAgent === a.key ? "running" : a.lastRun ? a.lastRun.status : "idle", finishedAt: a.lastRun?.finishedAt ?? null })),
      habits: w.habits.map((h) => ({ id: h.id, name: h.name, stage: h.stage, doneToday: h.doneToday, pendingToday: h.pendingToday })),
      decor: w.decor.objects
        .map((o) => {
          const slot = w.decor.slots.find((s) => s.key === o.slotKey);
          return slot ? { slotKey: o.slotKey, x: slot.x, y: slot.y, art: itemArtUrl(o.art, o.artSet), name: o.name } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
      slots: w.decor.slots,
      roomStatus: roomStatus(w, pendingAgent),
      localHour: w.localHour,
      facts,
      markers,
    };
  }, [w, pendingAgent, facts, markers]);

  return { engineSettings, engineData, facts, markers };
}
