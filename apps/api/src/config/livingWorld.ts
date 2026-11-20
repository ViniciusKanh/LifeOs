/**
 * Meu Mundo — definições fixas do lado do servidor (fonte única para validação).
 * A geometria completa do mapa fica no frontend (renderização); aqui ficam só
 * os ambientes, os slots de decoração (validados no servidor) e os agentes.
 */
import type { AdvisorModule } from "../services/moduleAdvisorService.js";

export const WORLD_ROOMS = ["biblioteca", "escritorio", "academia", "guilda", "casa", "jardim", "praca"] as const;
export type WorldRoom = (typeof WORLD_ROOMS)[number];

/** Slots de decoração: tiles livres do mapa onde um item do inventário pode ser colocado. */
export const DECOR_SLOTS: Array<{ key: string; room: WorldRoom; x: number; y: number }> = [
  { key: "bib-1", room: "biblioteca", x: 2, y: 7 },
  { key: "bib-2", room: "biblioteca", x: 3, y: 8 },
  { key: "bib-3", room: "biblioteca", x: 8, y: 3 },
  { key: "esc-1", room: "escritorio", x: 22, y: 6 },
  { key: "esc-2", room: "escritorio", x: 28, y: 7 },
  { key: "esc-3", room: "escritorio", x: 26, y: 7 },
  { key: "gui-1", room: "guilda", x: 2, y: 17 },
  { key: "gui-2", room: "guilda", x: 7, y: 13 },
  { key: "gui-3", room: "guilda", x: 8, y: 17 },
  { key: "aca-1", room: "academia", x: 22, y: 17 },
  { key: "aca-2", room: "academia", x: 28, y: 17 },
  { key: "aca-3", room: "academia", x: 26, y: 18 },
  { key: "cas-1", room: "casa", x: 7, y: 22 },
  { key: "cas-2", room: "casa", x: 2, y: 27 },
  { key: "cas-3", room: "casa", x: 8, y: 27 },
  { key: "jar-1", room: "jardim", x: 22, y: 25 },
  { key: "jar-2", room: "jardim", x: 28, y: 22 },
  { key: "jar-3", room: "jardim", x: 24, y: 21 },
  { key: "pra-1", room: "praca", x: 12, y: 18 },
  { key: "pra-2", room: "praca", x: 18, y: 12 },
  { key: "pra-3", room: "praca", x: 11, y: 14 },
];

export interface WorldAgentDef {
  key: string;
  name: string;
  specialty: string;
  /** Conselheiro existente do LifeOS que executa o trabalho (sem nova infraestrutura de IA). */
  advisor: AdvisorModule;
  room: WorldRoom;
  /** Pedido padrão quando o usuário só clica em "Executar". */
  defaultQuestion: string;
  color: string;
}

export const WORLD_AGENTS: WorldAgentDef[] = [
  { key: "planejador", name: "Planejador", specialty: "Organiza tarefas, prazos e o plano da semana", advisor: "council", room: "escritorio", defaultQuestion: "Organize minhas prioridades desta semana considerando os prazos existentes.", color: "#59A9F8" },
  { key: "mentor", name: "Mentor de Estudos", specialty: "Acompanha estudos, metas acadêmicas e revisões", advisor: "education", room: "biblioteca", defaultQuestion: "Como estão meus estudos e o que devo revisar agora?", color: "#A875F5" },
  { key: "analista", name: "Analista de Produtividade", specialty: "Lê missões concluídas e padrões de execução", advisor: "missions", room: "escritorio", defaultQuestion: "Quais padrões de execução aparecem nas minhas missões recentes?", color: "#F1C66A" },
  { key: "habitos", name: "Assistente de Hábitos", specialty: "Consistência, sequências e ajustes de hábitos", advisor: "habits", room: "jardim", defaultQuestion: "Como está a consistência dos meus hábitos e o que posso simplificar?", color: "#4FD49A" },
];

/** Execução "running" mais antiga que isso foi interrompida (ex.: a função caiu). */
export const AGENT_RUN_STALE_MS = 3 * 60 * 1000;

export const DEFAULT_WORLD_SETTINGS = {
  quality: "high" as "low" | "medium" | "high",
  effects: 2 as 0 | 1 | 2,
  animSpeed: 1 as 0.5 | 1 | 1.5,
  sound: false,
  autonomous: true,
  showNames: true,
  showIndicators: true,
  showLabels: true,
  followAvatar: false,
};
export type WorldSettings = typeof DEFAULT_WORLD_SETTINGS;

export const DEFAULT_AVATAR = {
  name: null as string | null,
  skin: "#E8B48A",
  hair: "#3A2418",
  shirt: "#C8423B",
  pants: "#2B3A67",
  x: 14,
  y: 17,
};
export type WorldAvatar = typeof DEFAULT_AVATAR;
