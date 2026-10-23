import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import {
  buildFightSummary,
  buildStrengthExercises,
  computeStrengthLevel,
  epley1rm,
  exerciseKey,
  weekStartOf,
  type StrengthSetRow,
} from "../src/services/strengthService.js";

const DAY_MS = 86_400_000;
/** Instante ISO "N dias atrás" às 15h UTC (meio-dia em São Paulo). */
function daysAgoIso(n: number) {
  const d = new Date(Date.now() - n * DAY_MS);
  d.setUTCHours(15, 0, 0, 0);
  return d.toISOString();
}

function row(performedAt: string, exercise: string, sets: number | null, reps: number | null, loadKg: number | null): StrengthSetRow {
  return { workoutId: performedAt, performedAt, exercise, sets, reps, loadKg };
}

describe("Atributo Força — regras (unitário)", () => {
  it("1RM estimado por Epley", () => {
    expect(epley1rm(100, 10)).toBeCloseTo(133.333, 2);
    expect(epley1rm(60, 0)).toBe(60);
  });

  it("agrupa exercícios por nome normalizado (caixa, espaços e acentos) e exibe o nome mais recente", () => {
    expect(exerciseKey("  Supino   Réto ")).toBe("supino reto");
    const exercises = buildStrengthExercises(
      [
        row("2026-09-01T15:00:00.000Z", "supino reto", 3, 10, 50),
        row("2026-09-08T15:00:00.000Z", "Supino Réto ", 3, 10, 55),
        row("2026-09-08T15:00:00.000Z", "Agachamento", 4, 8, 80),
      ],
      180
    );
    expect(exercises).toHaveLength(2);
    const supino = exercises.find((e) => e.key === "supino reto")!;
    expect(supino.name).toBe("Supino Réto");
    expect(supino.sessions.map((s) => s.date)).toEqual(["2026-09-01", "2026-09-08"]);
  });

  it("calcula sessão (carga máx., reps na carga máx., volume, 1RM), PRs com data e 'Novo PR' só da última sessão", () => {
    const [ex] = buildStrengthExercises(
      [
        // Dia 1: 60×10 e 70×5 → volume 3×10×60 + 2×5×70 = 2500; 1RM = max(80, 81.67)
        row("2026-09-01T15:00:00.000Z", "Supino", 3, 10, 60),
        row("2026-09-01T15:10:00.000Z", "Supino", 2, 5, 70),
        // Dia 2: carga menor, volume maior
        row("2026-09-05T15:00:00.000Z", "Supino", 5, 10, 62),
        // Dia 3: bate carga e 1RM, mas não o volume; `sets` vazio conta 1 série
        row("2026-09-09T15:00:00.000Z", "Supino", null, 6, 75),
        row("2026-09-09T15:05:00.000Z", "Supino", 1, 3, 75),
      ],
      180
    );
    expect(ex.sessions[0]).toMatchObject({ date: "2026-09-01", maxLoadKg: 70, repsAtMaxLoad: 5, volumeKg: 2500, est1rmKg: 81.7 });
    expect(ex.sessions[2]).toMatchObject({ maxLoadKg: 75, repsAtMaxLoad: 6, volumeKg: 675, est1rmKg: 90 });
    expect(ex.prLoad).toEqual({ value: 75, date: "2026-09-09" });
    expect(ex.pr1rm).toEqual({ value: 90, date: "2026-09-09" });
    expect(ex.prVolume).toEqual({ value: 3100, date: "2026-09-05" });
    expect(ex.lastSession).toMatchObject({ newPrLoad: true, newPr1rm: true, newPrVolume: false });
    // Dia 2 não bateu a carga, mas o 1RM (82,7 > 81,7) → também conta como PR.
    expect(ex.prDates).toEqual(["2026-09-05", "2026-09-09"]);
  });

  it("primeira sessão e empates não são 'Novo PR'; linhas sem carga/reps são ignoradas", () => {
    const [only] = buildStrengthExercises([row("2026-09-01T15:00:00.000Z", "Remada", 3, 10, 40)], 180);
    expect(only.lastSession).toMatchObject({ newPrLoad: false, newPr1rm: false, newPrVolume: false });
    const [tie] = buildStrengthExercises(
      [row("2026-09-01T15:00:00.000Z", "Remada", 3, 10, 40), row("2026-09-03T15:00:00.000Z", "Remada", 3, 10, 40)],
      180
    );
    expect(tie.lastSession.newPrLoad).toBe(false);
    expect(tie.prLoad.date).toBe("2026-09-01");
    expect(buildStrengthExercises([row("2026-09-01T15:00:00.000Z", "Prancha", 3, null, null)], 180)).toHaveLength(0);
  });

  it("usa o dia local do usuário (treino 01h UTC em São Paulo é do dia anterior)", () => {
    const [ex] = buildStrengthExercises([row("2026-09-02T01:00:00.000Z", "Supino", 3, 10, 60)], 180);
    expect(ex.sessions[0].date).toBe("2026-09-01");
  });

  it("luta: rounds e minutos por semana (segunda a domingo) e maior sessão", () => {
    expect(weekStartOf("2026-10-22")).toBe("2026-10-19");
    const summary = buildFightSummary(
      [
        { performedAt: "2026-10-20T22:00:00.000Z", durationMinutes: 60, rounds: 5, roundMinutes: 3, modality: "muay_thai" },
        { performedAt: "2026-10-21T22:00:00.000Z", durationMinutes: 90, rounds: 8, roundMinutes: 3, modality: "boxe" },
        { performedAt: "2026-10-14T22:00:00.000Z", durationMinutes: 45, rounds: null, roundMinutes: null, modality: null },
        { performedAt: "2026-01-01T22:00:00.000Z", durationMinutes: 45, rounds: 20, roundMinutes: 3, modality: null },
      ],
      180,
      "2026-10-22"
    );
    expect(summary.weeks).toHaveLength(8);
    expect(summary.weeks[7]).toEqual({ weekStart: "2026-10-19", sessions: 2, rounds: 13, minutes: 150 });
    expect(summary.weeks[6]).toEqual({ weekStart: "2026-10-12", sessions: 1, rounds: 0, minutes: 45 });
    expect(summary.totalRounds).toBe(13);
    expect(summary.biggestSession).toEqual({ date: "2026-10-21", rounds: 8, minutes: 90, modality: "boxe" });
  });

  it("nível de Força segue a fórmula documentada", () => {
    expect(computeStrengthLevel(0, 0, 0)).toMatchObject({ level: 1, points: 0 });
    // 3 musculação + 2 luta + 2 PRs = 50 + 10 = 60 → nível 2, 20 pts no nível
    expect(computeStrengthLevel(3, 2, 2)).toMatchObject({ level: 2, points: 60, pointsIntoLevel: 20, pointsPerLevel: 40 });
  });
});

describe("Atributo Força — API", () => {
  it("GET /api/health/strength agrega séries reais, respeita o período e isola por usuário", async () => {
    const { agent } = await createAuthenticatedAgent();
    const other = await createAuthenticatedAgent();

    const post = (body: Record<string, unknown>) => agent.post("/api/health/workouts").send(body);
    expect((await post({ category: "musculacao", durationMinutes: 60, performedAt: daysAgoIso(10), sets: [{ exercise: "Supino reto", sets: 3, reps: 10, loadKg: 60 }] })).status).toBe(201);
    expect((await post({ category: "musculacao", durationMinutes: 60, performedAt: daysAgoIso(3), sets: [{ exercise: "supino RETO", sets: 3, reps: 8, loadKg: 70 }] })).status).toBe(201);
    expect((await post({ category: "luta", modality: "muay_thai", rounds: 6, roundMinutes: 3, durationMinutes: 60, performedAt: daysAgoIso(1) })).status).toBe(201);
    // Fora do período pedido (days=30): não entra nos exercícios.
    await post({ category: "musculacao", durationMinutes: 60, performedAt: daysAgoIso(60), sets: [{ exercise: "Supino reto", sets: 3, reps: 10, loadKg: 100 }] });

    const res = await agent.get("/api/health/strength?days=30&tz=180");
    expect(res.status).toBe(200);
    expect(res.body.exercises).toHaveLength(1);
    const supino = res.body.exercises[0];
    expect(supino.name).toBe("supino RETO");
    expect(supino.sessions).toHaveLength(2);
    expect(supino.prLoad.value).toBe(70);
    expect(supino.lastSession).toMatchObject({ newPrLoad: true, newPr1rm: true });
    // 2 musculação + 1 luta nos últimos 28 dias + 1 PR = 30 + 5 = 35 → nível 1
    expect(res.body.level).toMatchObject({ strengthSessions: 2, fightSessions: 1, prs: 1, points: 35, level: 1 });
    expect(res.body.fight.totalRounds).toBe(6);

    const otherRes = await other.agent.get("/api/health/strength?tz=180");
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.exercises).toEqual([]);
    expect(otherRes.body.level).toMatchObject({ points: 0, level: 1 });
    expect(otherRes.body.fight.totalSessions).toBe(0);

    expect((await agent.get("/api/health/strength?days=3")).status).toBe(400);
  });
});
