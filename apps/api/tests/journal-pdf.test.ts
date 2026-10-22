import { describe, it, expect } from "vitest";
import { createAuthenticatedAgent } from "./helpers.js";
import { htmlToParagraphs, toPdfSafeText } from "../src/services/journalPdfService.js";

// JPEG 1x1 válido — a grade de fotos do PDF precisa decodificar a imagem de verdade.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

describe("Diário — PDF da entrada (Crônicas da Jornada)", () => {
  it("preserva parágrafos, listas e perguntas em negrito do editor rico", () => {
    const paragraphs = htmlToParagraphs("<p>Primeiro.</p><ul><li>Item A</li><li>Item B</li></ul><p><strong>Pergunta?</strong></p><p></p>");
    expect(paragraphs).toEqual([
      { text: "Primeiro.", bullet: false, bold: false },
      { text: "Item A", bullet: true, bold: false },
      { text: "Item B", bullet: true, bold: false },
      { text: "Pergunta?", bullet: false, bold: true },
    ]);
  });

  it("remove emoji e símbolos que as fontes do PDF não desenham, sem perder acentos", () => {
    expect(toPdfSafeText("Dia ótimo 😊 — ação ★")).toBe("Dia ótimo — ação");
  });

  it("gera um PDF só do dono autenticado, com fotos e texto", async () => {
    const { agent } = await createAuthenticatedAgent();
    const date = "2030-04-12";
    await agent.put(`/api/journal/${date}`).send({ thoughts: "<p>Um dia bom.</p>", gratitude: ["Família"] });
    await agent.post(`/api/journal/${date}/media`).send({ dataUri: TINY_JPEG, caption: "Praia" });

    const res = await agent.get(`/api/journal/${date}/export/pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejeita data inválida", async () => {
    const { agent } = await createAuthenticatedAgent();
    const res = await agent.get("/api/journal/12-04-2030/export/pdf");
    expect(res.status).toBe(400);
  });
});
