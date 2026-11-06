import { api } from "./api";

/** Espelho de /api/tavern3 (Taverna 3.0 — ritual de fim do dia). */

export type StepKey = "balance" | "reflection" | "learnings" | "gratitude" | "tomorrow";

export interface Ritual {
  day: string;
  steps: StepKey[];
  highlights: string;
  challenges: string;
  decisions: string;
  learned: string;
  worked: string;
  improve: string;
  repeatThis: string;
  avoidTomorrow: string;
  selfCare: string;
  priorities: string[];
  tomorrowTaskId: string | null;
  completedAt: string | null;
  reward: { xp: number; coins: number };
  updatedAt: string | null;
}

export interface Tavern3 {
  today: string;
  tomorrow: string;
  required: StepKey[];
  ritual: Ritual;
  stepsState: Array<{ key: StepKey; done: boolean; required: boolean }>;
  canClose: boolean;
  reward: { xp: number; coins: number };
  indicators: { xpToday: number; coinsToday: number; missionsDone: number; habits: { done: number; total: number }; focusMinutes: number; streakDays: number; lifeScore: number; lifeScoreAvg7: number | null; achievementsToday: number };
  balance: {
    dims: Array<{ key: string; today: number; avg7: number | null }>;
    days: number;
    method: string;
    details: {
      xp: { today: number; avg7: number | null };
      coins: { today: number; avg7: number | null };
      missions: { count: number; avg7: number | null; items: Array<{ id: string; title: string; priority: string }> };
      habits: { done: number; total: number; avg7: number | null; items: Array<{ id: string; name: string; icon: string | null }> };
      water: { todayMl: number; avg7: number | null };
      exercise: { todayMinutes: number; sessions: number; avg7: number | null };
      sleep: { durationMinutes: number | null; quality: number | null } | null;
    };
    signals: { sleep: { minutes: number; quality: number | null } | null; mood: { mood: number | null; energy: number | null } | null; workoutMinutes: number; waterMl: number; readingPages: number };
  };
  journal: { thoughts: string; words: number; gratitude: string[]; reflection: string; learning: string; pending: string; intention: string; updatedAt: string | null };
  mood: { mood: number | null; energy: number | null } | null;
  achievements: Array<{ id: string; code: string; title: string; description: string | null; icon: string | null; tier: string; unlockedAt: string; reward: { xp: number; coins: number } }>;
  tomorrowPlan: {
    agenda: Array<{ id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; sourceType: string }>;
    conflicts: Array<{ a: string; b: string; minutes: number }>;
    freeWindows: Array<{ start: string; end: string }>;
    mission: {
      primary: { id: string; title: string; priority: string; dueDate: string | null; projectName: string | null; reasons: string[] } | null;
      alternatives: Array<{ id: string; title: string; priority: string; dueDate: string | null; projectName: string | null; reasons: string[] }>;
      dueTomorrow: Array<{ id: string; title: string; priority: string }>;
      pinned: Array<{ id: string; title: string; done: boolean }>;
    };
  };
  forecasts: Array<{ modelId: string; name: string; problem: "classification" | "regression"; targetLabel: string; value: number; lower: number | null; upper: number | null; partial: boolean; degraded: boolean; version: number; validation: { primary: string; model: number; baseline: number } | null; factors: Array<{ label: string; effect: number }> }>;
  legacyProphecies: Array<{ artifactName: string; targetLabel: string; probability: number | null; status: string }>;
  insights: Array<{ kind: "observacao"; title: string; text: string; data: string }>;
  history: Array<{ day: string; steps: StepKey[]; completedAt: string | null; reward: { xp: number; coins: number }; learned: string; highlights: string; lifeScore: number | null; tomorrowTask: string | null }>;
}

export type RitualPatch = Partial<Pick<Ritual, "highlights" | "challenges" | "decisions" | "learned" | "worked" | "improve" | "repeatThis" | "avoidTomorrow" | "selfCare">> & { steps?: StepKey[]; priorities?: string[] };

export const tavern3Service = {
  get: () => api.get<Tavern3>("/tavern3"),
  saveRitual: (patch: RitualPatch) => api.put<Ritual>("/tavern3/ritual", patch),
  saveJournal: (f: { thoughts?: string; reflection?: string; learning?: string; pending?: string; intention?: string; gratitude?: string[]; baseUpdatedAt?: string | null }) => api.put<{ updatedAt: string } | null>("/tavern3/journal", f),
  settings: (required: StepKey[]) => api.put<{ ok: true }>("/tavern3/settings", { required }),
  focusBlock: (input: { start: string; end: string; title: string; taskId?: string | null }) => api.post<{ id: string; date: string }>("/tavern3/focus-block", input),
  tomorrowTask: (taskId: string) => api.post<{ ok: true }>("/tavern3/tomorrow-task", { taskId }),
  close: () => api.post<{ alreadyClosed: boolean; granted: boolean; reward: { xp: number; coins: number } }>("/tavern3/close", {}),
};

export const STEP_LABEL: Record<StepKey, { title: string; hint: string }> = {
  balance: { title: "Balanço da jornada", hint: "O que fiz, o que avancei e o que faltou." },
  reflection: { title: "Diário e reflexão", hint: "Acontecimentos, desafios e decisões do dia." },
  learnings: { title: "Registrar aprendizados", hint: "O que aprendi, o que funcionou e o que evitar." },
  gratitude: { title: "Gratidão e cuidado", hint: "Gratidão, humor, energia e cuidado pessoal." },
  tomorrow: { title: "Preparar o amanhã", hint: "Missão principal, prioridades e blocos de foco." },
};
