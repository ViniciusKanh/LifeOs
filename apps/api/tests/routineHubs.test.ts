import { describe, expect, it } from "vitest";
import { consistency, habitStreak, isScheduledOn, parseHabit } from "../src/services/habitsHubService.js";
import { normalizeSession, positionAfter } from "../src/services/libraryHubService.js";
import { orderIndex, subscriptionCost, tranquility } from "../src/services/lifeAdminHubService.js";

const habit = (o: Record<string, unknown>) => parseHabit({ id: "h", name: "H", frequency: "daily", target_count: 1, created_at: "2026-10-01 10:00:00", ...o });

describe("Hábitos 3.0 — frequência e sequência", () => {
  it("dias específicos só são previstos nos dias escolhidos", () => {
    const h = habit({ frequency: "specific_days", frequency_config: JSON.stringify({ days: [1, 3] }) });
    expect(isScheduledOn(h, "2026-11-02")).toBe(true); // segunda
    expect(isScheduledOn(h, "2026-11-03")).toBe(false); // terça
  });
  it("semanal não falha em dia não previsto e conta por ciclo", () => {
    const h = habit({ frequency: "weekly" });
    expect(isScheduledOn(h, "2026-11-03")).toBe(false);
    expect(habitStreak(h, new Set(["2026-10-21", "2026-10-28"]), "2026-11-02")).toBe(2);
  });
  it("sequência diária não quebra por hoje ainda em aberto", () => {
    const h = habit({});
    expect(habitStreak(h, new Set(["2026-10-31", "2026-11-01"]), "2026-11-02")).toBe(2);
  });
  it("pausa congela: dias pausados não contam como falha", () => {
    const h = habit({ paused_at: "2026-10-30 09:00:00" });
    const c = consistency([h], new Map([["h", new Set(["2026-10-28", "2026-10-29"])]]), "2026-10-28", "2026-11-02");
    expect(c).toEqual({ expected: 2, fulfilled: 2, pct: 100 });
  });
});

describe("Biblioteca 3.0 — páginas", () => {
  it("página final além do total é recusada", () => {
    expect(() => normalizeSession({ startPage: 10, endPage: 400 }, 300)).toThrow();
    expect(normalizeSession({ startPage: 10, endPage: 30 }, 300).pages).toBe(20);
  });
  it("releitura não avança a posição do livro", () => {
    expect(positionAfter(120, { startPage: 50, endPage: 80, pages: 30 }, 300)).toBe(120);
    expect(positionAfter(120, { endPage: 150, pages: 30 }, 300)).toBe(150);
    expect(positionAfter(290, { pages: 30 }, 300)).toBe(300);
  });
});

describe("Administração 3.0", () => {
  it("sem registros não há índice de ordem", () => {
    expect(orderIndex([])).toBeNull();
  });
  it("índice pondera prazo, lembretes e completude", () => {
    const o = orderIndex([
      { kind: "documento", category: "documentos", hasFile: true, amount: null, dueDate: "2027-01-01", urgency: "ok", remindDaysBefore: 15 },
      { kind: "conta", category: "casa", hasFile: false, amount: null, dueDate: "2026-10-01", urgency: "overdue", remindDaysBefore: 0 },
    ]);
    expect(o?.score).toBe(Math.round(0.5 * 50 + 0.5 * 20 + 0.5 * 30));
  });
  it("assinaturas: custo mensal por moeda real", () => {
    expect(subscriptionCost([{ category: "assinaturas", amount: 120, recurrenceMonths: 12, currency: "BRL" }, { category: "assinaturas", amount: 20, recurrenceMonths: 1 }])).toEqual([{ currency: "BRL", count: 2, monthly: 30, yearly: 360 }]);
  });
  it("tranquilidade zera com pendência vencida", () => {
    expect(tranquility("2026-11-02", "2026-09-01", [], true).days).toBe(0);
    expect(tranquility("2026-11-02", "2026-09-01", ["2026-10-20"], false)).toEqual({ days: 13, since: "2026-10-20" });
  });
});
