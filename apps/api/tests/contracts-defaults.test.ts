import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { withTaskDefaults, DEFAULT_ESTIMATE } from "../src/services/contractsService.js";

type TaskRow = { title: string; description: string | null; difficulty: string | null; estimate_minutes: number | null; due_date: string | null; priority: string };

describe("Contratos: tarefas sempre completas", () => {
  it("preenche dificuldade, prioridade, prazo, estimativa e descrição a partir do contrato", () => {
    const t = withTaskDefaults({ title: "  Escrever rascunho " }, { title: "Artigo", objective: "Submeter o artigo", difficulty: "dificil", dueDate: "2030-05-10" });
    expect(t).toMatchObject({ title: "Escrever rascunho", difficulty: "dificil", priority: "Alta", dueDate: "2030-05-10", estimateMinutes: DEFAULT_ESTIMATE.dificil });
    expect(t.description).toContain("Artigo");
    // O que o usuário informou nunca é sobrescrito.
    const own = withTaskDefaults({ title: "X", description: "Minha descrição", difficulty: "facil", estimateMinutes: 15, dueDate: "2030-05-01", priority: "Média" }, { title: "C", objective: null, difficulty: "epico", dueDate: "2030-06-01" });
    expect(own).toMatchObject({ description: "Minha descrição", difficulty: "facil", estimateMinutes: 15, dueDate: "2030-05-01", priority: "Média" });
  });

  it("tarefas criadas só com título (no contrato e depois) chegam completas no banco", async () => {
    const { agent } = await createAuthenticatedAgent();
    const c = await agent.post("/api/contracts").send({ title: "Maratona de estudos", objective: "Fechar a disciplina", difficulty: "medio", dueDate: "2030-07-01", tasks: [{ title: "Resumir capítulo 1" }] });
    expect(c.status).toBe(201);
    await agent.post(`/api/contracts/${c.body.id}/tasks`).send({ tasks: [{ title: "Fazer lista de exercícios" }] });
    const tasks = (await agent.get(`/api/contracts/${c.body.id}`)).body.tasks as TaskRow[];
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(t.description).toBeTruthy();
      expect(t.difficulty).toBe("medio");
      expect(t.estimate_minutes).toBe(DEFAULT_ESTIMATE.medio);
      expect(t.due_date?.slice(0, 10)).toBe("2030-07-01");
    }
  });
});
