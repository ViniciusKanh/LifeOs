import { describe, expect, it } from "vitest";
import { addDaysKey, dateKeyToLocalDate, dateTimeLocalToIso, localDateKey, parseUtcTimestamp, toDateTimeLocal, todayKey } from "./localDate";
import { formatPace, paceMinPerKm, weeklyWorkoutSummary, workoutCategoryOf } from "./workoutStats";
import type { Workout } from "@/types";

/**
 * Rodar com TZ=America/Sao_Paulo (UTC-3), o fuso do relato:
 *   TZ=America/Sao_Paulo npx vitest run src/utils/localDate.test.ts   (em apps/web)
 */
const isSaoPaulo = new Date("2026-10-22T12:00:00Z").getTimezoneOffset() === 180;

describe.runIf(isSaoPaulo)("datas locais em São Paulo", () => {
  it("registro às 22h de 22/10 continua em 22/10 (ida e volta pela API)", () => {
    const iso = dateTimeLocalToIso("2026-10-22T22:00");
    expect(iso).toBe("2026-10-23T01:00:00.000Z");
    expect(localDateKey(iso)).toBe("2026-10-22");
    expect(toDateTimeLocal(iso)).toBe("2026-10-22T22:00");
  });

  it("timestamp UTC sem zona (datetime('now') do SQLite) é lido como UTC, não como hora local", () => {
    expect(parseUtcTimestamp("2026-10-23 01:00:00").toISOString()).toBe("2026-10-23T01:00:00.000Z");
    expect(localDateKey("2026-10-23 01:00:00")).toBe("2026-10-22");
    expect(localDateKey("2026-10-22 15:00:00")).toBe("2026-10-22");
  });

  it("chave de dia vira meia-noite local (new Date('YYYY-MM-DD') seria 21h do dia anterior)", () => {
    expect(localDateKey(dateKeyToLocalDate("2026-10-22"))).toBe("2026-10-22");
    expect(addDaysKey("2026-10-22", 1)).toBe("2026-10-23");
    expect(addDaysKey("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("'hoje' às 22h é o dia local, não o dia UTC", () => {
    expect(todayKey(new Date("2026-10-23T01:00:00.000Z"))).toBe("2026-10-22");
  });

  it("resumo semanal conta treino das 22h de domingo na semana certa", () => {
    const base = { calories: null, intensity: null, notes: null, distance_km: null } as const;
    const workouts: Workout[] = [
      { ...base, id: "a", kind: "Musculação", category: "musculacao", duration_minutes: 60, performed_at: "2026-10-19T12:00:00.000Z" },
      // Domingo 25/10 às 22h em SP = segunda 26/10 01:00 UTC → ainda é a semana de 19 a 25.
      { ...base, id: "b", kind: "Luta", category: "luta", duration_minutes: 90, performed_at: "2026-10-26T01:00:00.000Z" },
      { ...base, id: "c", kind: "Musculacao", duration_minutes: 45, performed_at: "2026-10-19 23:00:00" },
      { ...base, id: "d", kind: "Corrida", category: "corrida", duration_minutes: 30, performed_at: "2026-10-26T04:00:00.000Z" },
    ];
    const s = weeklyWorkoutSummary(workouts, dateKeyToLocalDate("2026-10-19"));
    expect(s.sessions).toBe(3);
    expect(s.minutes).toBe(195);
    expect(s.activeDays).toBe(2);
    expect(s.byCategory).toEqual([
      { category: "musculacao", minutes: 105, sessions: 2 },
      { category: "luta", minutes: 90, sessions: 1 },
    ]);
  });
});

describe("regras de exercício", () => {
  it("pace e inferência de tipo", () => {
    expect(formatPace(paceMinPerKm(44, 8))).toBe("5:30 /km");
    expect(paceMinPerKm(30, null)).toBeNull();
    expect(workoutCategoryOf({ kind: "Jiu-jitsu", category: null })).toBe("luta");
    expect(workoutCategoryOf({ kind: "Ciclismo" })).toBe("bike");
  });
});
