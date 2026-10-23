import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import { todayKeyFor } from "../src/services/gamificationService.js";
import { parseLocalCommand, resolveDateWord } from "../src/services/copilotCommandParser.js";
import { localInstantIso } from "../src/services/copilotActionsService.js";

// Sexta-feira — referência fixa para as datas relativas do parser.
const FRI = "2026-10-23";

const count = async (sql: string, args: Array<string | number>) => Number((await getDb().execute({ sql, args })).rows[0]?.n ?? 0);

async function insertBook(ownerId: string, title: string, currentPage = 10) {
  const id = nanoid();
  await getDb().execute({
    sql: "INSERT INTO books (id, owner_id, title, total_pages, current_page, status) VALUES (?, ?, ?, 300, ?, 'Lendo')",
    args: [id, ownerId, title, currentPage],
  });
  return id;
}

describe("Parser local de comandos (sem IA)", () => {
  it("datas relativas: passado x futuro, hoje vale nos dois sentidos", () => {
    expect(resolveDateWord("hoje", FRI, "past")).toBe(FRI);
    expect(resolveDateWord("ontem", FRI, "past")).toBe("2026-10-22");
    expect(resolveDateWord("amanhã", FRI, "future")).toBe("2026-10-24");
    expect(resolveDateWord("sexta", FRI, "future")).toBe(FRI);
    expect(resolveDateWord("segunda", FRI, "future")).toBe("2026-10-26");
    expect(resolveDateWord("segunda-feira", FRI, "past")).toBe("2026-10-19");
    expect(resolveDateWord("02/01", FRI, "future")).toBe("2027-01-02");
    expect(resolveDateWord("30/02", FRI, "future")).toBeNull();
  });

  it("água", () => {
    expect(parseLocalCommand("bebi 500ml", FRI)).toEqual({ action: "registrar_agua", amountMl: 500, date: FRI });
    expect(parseLocalCommand("Água 300", FRI)).toEqual({ action: "registrar_agua", amountMl: 300, date: FRI });
    expect(parseLocalCommand("bebi 1,5 litros de água ontem", FRI)).toEqual({ action: "registrar_agua", amountMl: 1500, date: "2026-10-22" });
    expect(parseLocalCommand("300ml de água", FRI)).toEqual({ action: "registrar_agua", amountMl: 300, date: FRI });
    // Não é água: segue para o Gemini.
    expect(parseLocalCommand("bebi 2 cafés", FRI)).toBeNull();
    expect(parseLocalCommand("bebi 2 litros de suco", FRI)).toBeNull();
  });

  it("treino com modalidade, duração e data", () => {
    expect(parseLocalCommand("treino jiu-jitsu 60min hoje", FRI)).toEqual({
      action: "registrar_treino",
      activity: "Jiu-jitsu",
      category: "luta",
      modality: "jiu_jitsu",
      durationMinutes: 60,
      date: FRI,
    });
    const run = parseLocalCommand("treinei corrida 1h30 ontem", FRI);
    expect(run).toMatchObject({ action: "registrar_treino", category: "corrida", modality: null, durationMinutes: 90, date: "2026-10-22" });
    const gym = parseLocalCommand("treino 45 minutos de musculação", FRI);
    expect(gym).toMatchObject({ category: "musculacao", durationMinutes: 45 });
    // Sem duração não há registro seguro.
    expect(parseLocalCommand("treino de perna", FRI)).toBeNull();
  });

  it("leitura, tarefa, meta, projeto, inbox", () => {
    expect(parseLocalCommand("li 20 páginas de Duna ontem", FRI)).toEqual({
      action: "registrar_leitura",
      bookQuery: "Duna",
      pagesRead: 20,
      durationMinutes: null,
      date: "2026-10-22",
    });
    expect(parseLocalCommand("tarefa Revisar contrato sexta alta", FRI)).toEqual({
      action: "criar_tarefa",
      title: "Revisar contrato",
      dueDate: FRI,
      priority: "Alta",
    });
    expect(parseLocalCommand("cria uma tarefa de pagar o boleto até segunda", FRI)).toEqual({
      action: "criar_tarefa",
      title: "Pagar o boleto",
      dueDate: "2026-10-26",
      priority: "Média",
    });
    expect(parseLocalCommand("meta ler 12 livros", FRI)).toMatchObject({ action: "criar_meta", title: "Ler 12 livros", dueDate: null });
    expect(parseLocalCommand("novo projeto Mudança de casa", FRI)).toEqual({ action: "criar_projeto", name: "Mudança de casa" });
    expect(parseLocalCommand("nota: ligar para o João sobre o orçamento", FRI)).toEqual({
      action: "capturar_inbox",
      content: "ligar para o João sobre o orçamento",
    });
  });

  it("sono e humor: sem dado essencial pede esclarecimento em vez de inventar", () => {
    expect(parseLocalCommand("dormi 7h", FRI)).toMatchObject({ action: "esclarecer" });
    expect(parseLocalCommand("dormi das 23h às 7h", FRI)).toEqual({ action: "registrar_sono", date: FRI, bedTime: "23:00", wakeTime: "07:00" });
    expect(parseLocalCommand("dormi 23:30-6:45 ontem", FRI)).toEqual({ action: "registrar_sono", date: "2026-10-22", bedTime: "23:30", wakeTime: "06:45" });
    expect(parseLocalCommand("humor 4 energia 3", FRI)).toEqual({ action: "registrar_humor", mood: 4, energy: 3, date: FRI });
    expect(parseLocalCommand("humor 4", FRI)).toMatchObject({ action: "esclarecer" });
  });

  it("perguntas e textos livres não viram comando", () => {
    expect(parseLocalCommand("como foi minha semana?", FRI)).toBeNull();
    expect(parseLocalCommand("me ajuda a planejar amanhã", FRI)).toBeNull();
  });

  it("horário local vira instante UTC no fuso do usuário", () => {
    expect(localInstantIso("2026-10-23", "07:00", "America/Sao_Paulo")).toBe("2026-10-23T10:00:00.000Z");
  });
});

describe("Copilot com ações reais (POST /api/copilot/assist, /parse e /assist/confirm)", () => {
  it("exige sessão", async () => {
    const request = (await import("supertest")).default;
    const { app } = await import("../src/app.js");
    expect((await request(app).post("/api/copilot/assist").send({ message: "x" })).status).toBe(401);
    expect((await request(app).post("/api/copilot/parse").send({ message: "x" })).status).toBe(401);
    expect((await request(app).post("/api/copilot/assist/confirm").send({ action: "criar_tarefa", args: {} })).status).toBe(401);
  });

  it("mensagem vazia → 400; sem Gemini e sem comando local → erro claro", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/copilot/assist").send({ message: "" })).status).toBe(400);
    const res = await agent.post("/api/copilot/assist").send({ message: "como foi minha semana?" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Gemini|IA/i);
  });

  it("comando local funciona sem Gemini e a proposta não grava nada", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const res = await agent.post("/api/copilot/assist").send({ message: "bebi 500ml" });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("proposal");
    expect(res.body.proposal).toMatchObject({ action: "registrar_agua", source: "local", args: { amountMl: 500 } });
    expect(res.body.proposal.details.length).toBeGreaterThan(0);

    const parse = await agent.post("/api/copilot/parse").send({ message: "água 300" });
    expect(parse.body.kind).toBe("proposal");
    expect((await agent.post("/api/copilot/parse").send({ message: "oi tudo bem" })).body.kind).toBe("none");

    expect(await count("SELECT COUNT(*) AS n FROM water_entries WHERE owner_id = ?", [userId])).toBe(0);
  });

  it("registrar_agua grava no dia certo; data futura e args inválidos são recusados", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const today = await todayKeyFor(getDb(), userId);
    const { proposal } = (await agent.post("/api/copilot/parse").send({ message: "bebi 500ml" })).body;
    const ok = await agent.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: proposal.args });
    expect(ok.status).toBe(200);
    expect(ok.body.link).toBe("/saude");
    expect(await count("SELECT COUNT(*) AS n FROM water_entries WHERE owner_id = ? AND amount_ml = 500", [userId])).toBe(1);

    const future = await agent.post("/api/copilot/assist/confirm").send({ action: "registrar_agua", args: { amountMl: 200, date: "2999-01-01" } });
    expect(future.status).toBe(400);
    const invalid = await agent.post("/api/copilot/assist/confirm").send({ action: "registrar_agua", args: { amountMl: 99999, date: today } });
    expect(invalid.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM water_entries WHERE owner_id = ?", [userId])).toBe(1);
  });

  it("registrar_treino grava com tipo e modalidade derivados (mesma inserção da tela de Saúde)", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const { proposal } = (await agent.post("/api/copilot/parse").send({ message: "treino jiu-jitsu 60min hoje" })).body;
    expect(proposal.action).toBe("registrar_treino");
    // Mesmo que o cliente adultere a categoria, ela é re-derivada da atividade.
    const res = await agent.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: { ...proposal.args, category: "yoga" } });
    expect(res.status).toBe(200);
    const row = (await getDb().execute({ sql: "SELECT * FROM workouts WHERE owner_id = ?", args: [userId] })).rows[0] as unknown as Record<string, unknown>;
    expect(row).toMatchObject({ category: "luta", modality: "jiu_jitsu", duration_minutes: 60, kind: "Luta" });

    await agent.post("/api/copilot/assist/confirm").send({ action: "registrar_treino", args: { activity: "Escalada", durationMinutes: 40, date: proposal.args.date } });
    const other = (await getDb().execute({ sql: "SELECT kind, category FROM workouts WHERE owner_id = ? AND duration_minutes = 40", args: [userId] })).rows[0];
    expect(other).toMatchObject({ kind: "Escalada", category: "outro" });
  });

  it("registrar_leitura resolve o livro do próprio usuário e avança o progresso; outro usuário não acessa", async () => {
    const { agent: owner, userId } = await createAuthenticatedAgent();
    const { agent: intruder, userId: intruderId } = await createAuthenticatedAgent();
    const bookId = await insertBook(userId, "Duna", 10);

    const parsed = (await owner.post("/api/copilot/parse").send({ message: "li 20 páginas de duna" })).body;
    expect(parsed.kind).toBe("proposal");
    expect(parsed.proposal.args.bookId).toBe(bookId);
    expect(parsed.proposal.details.find((d: { label: string }) => d.label === "Progresso").value).toContain("10 → 30");

    // O intruso não "enxerga" o livro do outro…
    const intruderParse = (await intruder.post("/api/copilot/parse").send({ message: "li 20 páginas de duna" })).body;
    expect(intruderParse.kind).toBe("clarify");
    // …nem consegue gravar usando o id dele.
    const forged = await intruder.post("/api/copilot/assist/confirm").send({ action: "registrar_leitura", args: parsed.proposal.args });
    expect(forged.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM reading_sessions WHERE owner_id = ?", [intruderId])).toBe(0);

    const ok = await owner.post("/api/copilot/assist/confirm").send({ action: "registrar_leitura", args: parsed.proposal.args });
    expect(ok.status).toBe(200);
    const book = (await getDb().execute({ sql: "SELECT current_page FROM books WHERE id = ?", args: [bookId] })).rows[0];
    expect(Number(book.current_page)).toBe(30);
    expect(await count("SELECT COUNT(*) AS n FROM reading_sessions WHERE owner_id = ? AND pages_read = 20", [userId])).toBe(1);
  });

  it("registrar_sono e registrar_humor", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    const sleep = (await agent.post("/api/copilot/parse").send({ message: "dormi das 23h às 7h ontem" })).body;
    expect(sleep.kind).toBe("proposal");
    expect((await agent.post("/api/copilot/assist/confirm").send({ action: "registrar_sono", args: sleep.proposal.args })).status).toBe(200);
    const s = (await getDb().execute({ sql: "SELECT duration_minutes FROM sleep_entries WHERE owner_id = ?", args: [userId] })).rows[0];
    expect(Number(s.duration_minutes)).toBe(480);

    const mood = (await agent.post("/api/copilot/parse").send({ message: "humor 4 energia 3" })).body;
    expect((await agent.post("/api/copilot/assist/confirm").send({ action: "registrar_humor", args: mood.proposal.args })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM mood_entries WHERE owner_id = ? AND mood = 4 AND energy = 3", [userId])).toBe(1);
  });

  it("criar_tarefa, criar_meta, criar_projeto e capturar_inbox gravam para o dono", async () => {
    const { agent, userId } = await createAuthenticatedAgent();
    for (const message of ["tarefa Revisar contrato amanhã alta", "meta ler 12 livros", "novo projeto Reforma", "nota comprar pilhas"]) {
      const { proposal } = (await agent.post("/api/copilot/parse").send({ message })).body;
      const res = await agent.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: proposal.args });
      expect(res.status).toBe(200);
    }
    const task = (await getDb().execute({ sql: "SELECT * FROM tasks WHERE owner_id = ?", args: [userId] })).rows[0] as unknown as Record<string, unknown>;
    expect(task).toMatchObject({ title: "Revisar contrato", priority: "Alta", status: "A Fazer" });
    expect(task.due_date).toBeTruthy();
    expect(await count("SELECT COUNT(*) AS n FROM goals WHERE owner_id = ? AND title = 'Ler 12 livros'", [userId])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE owner_id = ? AND name = 'Reforma'", [userId])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM inbox_items WHERE owner_id = ? AND content = 'comprar pilhas'", [userId])).toBe(1);
  });

  it("concluir_tarefa usa o mesmo fluxo do Kanban (XP) e nunca conclui tarefa de outro usuário", async () => {
    const { agent: owner, userId } = await createAuthenticatedAgent();
    const { agent: intruder } = await createAuthenticatedAgent();
    const created = await owner.post("/api/tasks").send({ title: "Enviar relatório mensal" });

    const forged = await intruder.post("/api/copilot/assist/confirm").send({ action: "concluir_tarefa", args: { taskId: created.body.id } });
    expect(forged.status).toBe(400);
    expect((await owner.get(`/api/tasks/${created.body.id}`)).body.status).not.toBe("Concluído");

    const { proposal } = (await owner.post("/api/copilot/parse").send({ message: "concluir relatório mensal" })).body;
    expect(proposal).toMatchObject({ action: "concluir_tarefa", args: { taskId: created.body.id } });
    expect((await owner.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: proposal.args })).status).toBe(200);
    expect((await owner.get(`/api/tasks/${created.body.id}`)).body.status).toBe("Concluído");
    expect(await count("SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'task' AND source_id = ?", [userId, created.body.id])).toBe(1);
  });

  it("marcar_habito atinge a meta do dia e valida a posse", async () => {
    const { agent: owner, userId } = await createAuthenticatedAgent();
    const { agent: intruder } = await createAuthenticatedAgent();
    const habitId = nanoid();
    await getDb().execute({
      sql: "INSERT INTO habits (id, owner_id, name, frequency, target_count) VALUES (?, ?, 'Meditar', 'daily', 2)",
      args: [habitId, userId],
    });
    const { proposal } = (await owner.post("/api/copilot/parse").send({ message: "hábito meditar" })).body;
    expect(proposal).toMatchObject({ action: "marcar_habito", args: { habitId } });

    expect((await intruder.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: proposal.args })).status).toBe(400);
    expect((await owner.post("/api/copilot/assist/confirm").send({ action: proposal.action, args: proposal.args })).status).toBe(200);
    const entry = (await getDb().execute({ sql: "SELECT count FROM habit_entries WHERE habit_id = ?", args: [habitId] })).rows;
    expect(entry).toHaveLength(1);
    expect(Number(entry[0].count)).toBe(2);
  });

  it("ação desconhecida nunca escreve nada", async () => {
    const { agent } = await createAuthenticatedAgent();
    expect((await agent.post("/api/copilot/assist/confirm").send({ action: "apagar_tudo", args: {} })).status).toBe(400);
  });
});
