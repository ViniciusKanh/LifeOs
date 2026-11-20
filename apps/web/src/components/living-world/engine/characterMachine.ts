/**
 * Máquina de estados dos personagens do Meu Mundo.
 *
 * - Um estado por vez; transições inválidas são ignoradas.
 * - Intenções têm prioridade: domínio (dado real: missão em andamento, agente
 *   executando) > manual (clique do usuário) > ambiente (Vida Autônoma).
 *   Uma intenção de prioridade menor nunca interrompe uma maior.
 * - Estados de ambiente são só visuais: não geram atividade, XP nem eventos.
 */
import type { StationAnim } from "./worldMap";

export type CharState = "idle" | "walking" | "working" | "studying" | "exercising" | "resting" | "interacting" | "celebrating" | "thinking" | "error";
export type IntentSource = "domain" | "manual" | "ambient";

const RANK: Record<IntentSource, number> = { domain: 3, manual: 2, ambient: 1 };

export interface Intent {
  source: IntentSource;
  /** Estado a assumir ao chegar ao destino. */
  arriveState: CharState;
  target: { x: number; y: number };
  /** Rótulo para o balão/indicador (ex.: título da missão). */
  label?: string;
}

const ALLOWED: Record<CharState, CharState[]> = {
  idle: ["walking", "working", "studying", "exercising", "resting", "interacting", "celebrating", "thinking", "error"],
  walking: ["idle", "walking", "working", "studying", "exercising", "resting", "interacting", "thinking", "error"],
  working: ["idle", "walking", "celebrating", "error", "thinking"],
  studying: ["idle", "walking", "celebrating", "error", "thinking"],
  exercising: ["idle", "walking", "celebrating", "error"],
  resting: ["idle", "walking", "celebrating"],
  interacting: ["idle", "walking", "celebrating", "error", "working"],
  celebrating: ["idle", "walking", "working", "studying", "exercising", "resting", "interacting"],
  thinking: ["idle", "walking", "working", "studying", "error"],
  error: ["idle", "walking", "thinking"],
};

export function canTransition(from: CharState, to: CharState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export function canOverride(current: Intent | null, next: Intent): boolean {
  if (!current) return true;
  return RANK[next.source] >= RANK[current.source];
}

export function stateForAnim(anim: StationAnim): CharState {
  switch (anim) {
    case "typing":
      return "working";
    case "reading":
      return "studying";
    case "exercising":
      return "exercising";
    case "sleeping":
      return "resting";
    case "interacting":
      return "interacting";
    default:
      return "idle";
  }
}

export class CharacterBrain {
  state: CharState = "idle";
  intent: Intent | null = null;

  /** Aceita uma nova intenção se a prioridade permitir; devolve se aceitou. */
  propose(next: Intent): boolean {
    if (!canOverride(this.intent, next)) return false;
    this.intent = next;
    return true;
  }

  /** Encerra uma intenção (ex.: a missão saiu de "Em Andamento"). Só a própria fonte encerra. */
  release(source: IntentSource): void {
    if (this.intent?.source === source) this.intent = null;
  }

  set(to: CharState): boolean {
    if (!canTransition(this.state, to)) return false;
    this.state = to;
    return true;
  }
}
