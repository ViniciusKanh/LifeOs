import { describe, expect, it } from "vitest";
import { evaluateSeals, guildPoints, pactPhase, pactRisk, sanitizePactProposal, spreadDates } from "../src/services/contractGuildService.js";
import { resolveStageStatuses } from "../src/services/contractStages.js";
import { chapterOf } from "../src/services/chronicleEntryService.js";

const base = { isDraft: false, status: "ativo", pausedAt: null, cancelledAt: null, sealedAt: null, doneTasks: 0 };

describe("Contratos 3.0 — estados derivados", () => {
  it("deriva cada estado do ciclo de vida", () => {
    expect(pactPhase({ ...base, isDraft: true })).toBe("rascunho");
    expect(pactPhase(base)).toBe("ativo");
    expect(pactPhase({ ...base, doneTasks: 1 })).toBe("em_andamento");
    expect(pactPhase({ ...base, pausedAt: "x" })).toBe("pausado");
    expect(pactPhase({ ...base, status: "concluido" })).toBe("pronto_selar");
    expect(pactPhase({ ...base, status: "concluido", sealedAt: "x" })).toBe("cumprido");
    expect(pactPhase({ ...base, status: "arquivado" })).toBe("arquivado");
    expect(pactPhase({ ...base, status: "arquivado", cancelledAt: "x" })).toBe("cancelado");
  });
});

describe("Etapas", () => {
  it("conclui etapa com tarefas feitas e ativa a primeira pendente", () => {
    const r = resolveStageStatuses([
      { id: "a", total: 2, done: 2, manualDone: false },
      { id: "b", total: 3, done: 1, manualDone: false },
      { id: "c", total: 0, done: 0, manualDone: false },
    ]);
    expect(r).toEqual({ a: "concluida", b: "ativa", c: "pendente" });
  });
  it("reabre etapa quando uma tarefa volta a ficar aberta", () => {
    expect(resolveStageStatuses([{ id: "a", total: 2, done: 1, manualDone: true }]).a).toBe("ativa");
  });
  it("etapa sem tarefas mantém a conclusão manual", () => {
    expect(resolveStageStatuses([{ id: "a", total: 0, done: 0, manualDone: true }]).a).toBe("concluida");
  });
});

describe("Selos", () => {
  const t = (doneDay: string, dueDate: string | null = null) => ({ doneDay, dueDate });
  it("disciplina só com tudo no prazo", () => {
    expect(evaluateSeals({ category: null, difficulty: "medio", dueDate: "2026-11-10", tasks: [t("2026-11-01"), t("2026-11-02", "2026-11-03")], stagesDone: 1 })).toContain("disciplina");
    expect(evaluateSeals({ category: null, difficulty: "medio", dueDate: "2026-11-10", tasks: [t("2026-11-05", "2026-11-03")], stagesDone: 1 })).not.toContain("disciplina");
    expect(evaluateSeals({ category: null, difficulty: "medio", dueDate: null, tasks: [t("2026-11-01")], stagesDone: 1 })).not.toContain("disciplina");
  });
  it("constância, conhecimento, execução e maestria por critérios objetivos", () => {
    const days = ["01", "02", "03", "04", "05", "06", "07", "08"].map((d) => t(`2026-11-${d}`));
    const s = evaluateSeals({ category: "estudos", difficulty: "epico", dueDate: null, tasks: days, stagesDone: 3 });
    expect(s).toEqual(expect.arrayContaining(["constancia", "conhecimento", "execucao", "maestria"]));
    expect(evaluateSeals({ category: "saude", difficulty: "facil", dueDate: null, tasks: days.slice(0, 2), stagesDone: 5 })).toEqual([]);
  });
});

describe("Risco de quebra", () => {
  it("sem dados quando não há prazo ou obrigações", () => {
    expect(pactRisk({ today: "2026-11-04", startDay: "2026-11-01", dueDate: null, total: 3, done: 0, overdueOpen: 0, lastActivityDay: null }).level).toBe("sem_dados");
    expect(pactRisk({ today: "2026-11-04", startDay: "2026-11-01", dueDate: "2026-12-01", total: 0, done: 0, overdueOpen: 0, lastActivityDay: null }).level).toBe("sem_dados");
  });
  it("alto com prazo vencido", () => {
    expect(pactRisk({ today: "2026-11-04", startDay: "2026-10-01", dueDate: "2026-11-01", total: 4, done: 2, overdueOpen: 0, lastActivityDay: "2026-11-03" }).level).toBe("alto");
  });
  it("baixo quando o ritmo atual cobre o necessário", () => {
    const r = pactRisk({ today: "2026-11-04", startDay: "2026-10-29", dueDate: "2026-11-30", total: 10, done: 4, overdueOpen: 0, lastActivityDay: "2026-11-04" });
    expect(r.level).toBe("baixo");
    expect(r.reasons.at(-1)).toMatch(/Ritmo atual/);
  });
  it("moderado com uma tarefa atrasada", () => {
    expect(pactRisk({ today: "2026-11-04", startDay: "2026-10-29", dueDate: "2026-11-30", total: 10, done: 4, overdueOpen: 1, lastActivityDay: "2026-11-04" }).level).toBe("moderado");
  });
});

describe("Utilidades da Guilda", () => {
  it("distribui datas no replanejamento", () => {
    expect(spreadDates(2, "2026-11-04", "2026-11-14")).toEqual(["2026-11-09", "2026-11-14"]);
    expect(spreadDates(1, "2026-11-04", "2026-11-04")).toEqual(["2026-11-04"]);
    expect(spreadDates(0, "2026-11-04", "2026-11-14")).toEqual([]);
  });
  it("reputação por regra explícita", () => {
    expect(guildPoints({ sealed: 1, seals: 2, stagesDone: 3, tasksDone: 5 })).toBe(100 + 80 + 30 + 10);
  });
  it("Escriba: respeita prazo pedido e descarta etapas vazias", () => {
    const r = sanitizePactProposal(
      {
        title: "Pacto",
        difficulty: "medio",
        dueInDays: 90,
        stages: [
          { name: "Planejar", objective: "o", criterion: "c", tasks: [{ title: "Fazer A", dueInDays: 50, dependsOn: "nenhuma" }, { title: "Fazer B", dueInDays: 5, dependsOn: "Fazer A" }] },
          { name: "", tasks: [] },
        ],
      },
      {},
      { startIn: 0, deadline: 30 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dueInDays).toBe(30);
    expect(r.data.stages).toHaveLength(1);
    expect(r.data.stages[0]!.tasks[0]!.dueInDays).toBe(30);
    expect(r.data.stages[0]!.tasks[0]!.dependsOn).toBeNull();
    expect(r.data.stages[0]!.tasks[1]!.dependsOn).toBe("Fazer A");
  });
});

describe("Diário 3.0 — capítulos", () => {
  it("capítulos por dias escritos, nunca por palavras", () => {
    expect(chapterOf(0).title).toBe("Primeiras Páginas");
    expect(chapterOf(7).title).toBe("O Início da Disciplina");
    const c = chapterOf(40);
    expect(c.title).toBe("Guardião das Memórias");
    expect(c.roman).toBe("III");
    expect(c.pct).toBe(33);
    expect(chapterOf(500).next).toBeNull();
  });
});
