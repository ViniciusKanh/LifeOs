import PDFDocument from "pdfkit";
import type { JournalAutoData } from "./journalService.js";
import { stripHtml } from "./journalService.js";

/** Formato mínimo que este serviço precisa da entrada do dia — o mesmo shape devolvido por buildJournalResponse (journal.routes.ts). */
export interface JournalEntryForPdf {
  date: string;
  intention: string | null;
  thoughts: string | null;
  gratitude: string[];
  selfCare: string[];
  selfCareOther: string | null;
  challenges: string | null;
  lighterPlan: string | null;
  feelGood: string | null;
  nightMood: number | null;
  nightHelped: string | null;
  nightTakeaway: string | null;
  isFavorite: boolean;
  media: Array<{ kind: "photo" | "audio" | "video" | "document"; dataUri: string; caption: string | null; durationSeconds: number | null }>;
  auto: JournalAutoData;
}

const PINK = "#FF3D93";
const INK = "#2b2622";
const SLATE = "#7a7168";

function fmtDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatEntryDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

/**
 * "Compartilhar entrada" (Fase 16 do Diário — Apple Journal): monta um PDF
 * de uma única entrada, com o mesmo conteúdo real que aparece no editor do
 * dia (texto, gratidão, cuidado comigo, humor/energia reais, fotos). Notas
 * de voz não têm como tocar num PDF — aparecem listadas com a duração.
 * Nunca inventa nada: uma seção só aparece se o dado existir de verdade.
 */
export async function buildJournalEntryPdf(entry: JournalEntryForPdf): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Cabeçalho
  doc.fillColor(PINK).font("Helvetica-Bold").fontSize(10).text("LIFEOS · DIÁRIO", { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(formatEntryDate(entry.date), { paragraphGap: 4 });
  if (entry.isFavorite) {
    doc.fillColor(PINK).font("Helvetica").fontSize(9).text("★ Dia marcado como favorito");
  }
  doc.moveDown(0.6);
  doc.strokeColor("#e5ded6").lineWidth(1).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);

  // Humor/energia reais do dia (Saúde), quando existem
  if (entry.auto.mood) {
    const { mood, energy, stress } = entry.auto.mood;
    doc.fillColor(SLATE).font("Helvetica").fontSize(10);
    const parts = [`Humor: ${mood}/5`, `Energia: ${energy}/5`];
    if (stress != null) parts.push(`Estresse: ${stress}/5`);
    doc.text(parts.join("   ·   "));
    doc.moveDown(0.6);
  }

  const section = (title: string, body: string | null | undefined) => {
    const text = body ? stripHtml(body).trim() : "";
    if (!text) return;
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text(title.toUpperCase(), { characterSpacing: 0.5 });
    doc.moveDown(0.2);
    doc.fillColor(INK).font("Helvetica").fontSize(11).text(text, { lineGap: 3 });
    doc.moveDown(0.8);
  };

  // Campos guiados antigos só aparecem se ainda não foram migrados (0050).
  section("Intenção do dia", entry.intention);
  section("Como foi meu dia", entry.thoughts);

  if (entry.gratitude.length > 0) {
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text("GRATIDÃO", { characterSpacing: 0.5 });
    doc.moveDown(0.2);
    doc.fillColor(INK).font("Helvetica").fontSize(11);
    for (const item of entry.gratitude) doc.text(`•  ${item}`, { lineGap: 2 });
    doc.moveDown(0.8);
  }

  const selfCareAll = [...entry.selfCare, ...(entry.selfCareOther ? [entry.selfCareOther] : [])];
  if (selfCareAll.length > 0) {
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text("CUIDADO COMIGO", { characterSpacing: 0.5 });
    doc.moveDown(0.2);
    doc.fillColor(INK).font("Helvetica").fontSize(11).text(selfCareAll.join(", "), { lineGap: 3 });
    doc.moveDown(0.8);
  }

  section("Desafios", entry.challenges);
  section("Como tornar este dia mais leve", entry.lighterPlan);
  section("O que me fez bem hoje", entry.feelGood);

  if (entry.nightMood != null || entry.nightHelped || entry.nightTakeaway) {
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text("O QUE LEVO PARA AMANHÃ", { characterSpacing: 0.5 });
    doc.moveDown(0.2);
    doc.fillColor(INK).font("Helvetica").fontSize(11);
    if (entry.nightTakeaway) doc.text(stripHtml(entry.nightTakeaway), { lineGap: 3 });
    if (entry.nightHelped) doc.text(stripHtml(entry.nightHelped), { lineGap: 3 });
    if (entry.nightMood != null) doc.text(`Humor anotado no diário: ${entry.nightMood}/5`, { lineGap: 3 });
    doc.moveDown(0.8);
  }

  const photos = entry.media.filter((m) => m.kind === "photo");
  const audios = entry.media.filter((m) => m.kind === "audio");

  if (photos.length > 0) {
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text("FOTOS DO DIA", { characterSpacing: 0.5 });
    doc.moveDown(0.3);
    for (const photo of photos) {
      const base64 = photo.dataUri.split(",")[1];
      if (!base64) continue;
      const buf = Buffer.from(base64, "base64");
      const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      try {
        if (doc.y + 220 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        doc.image(buf, { fit: [Math.min(280, maxWidth), 210] });
        if (photo.caption) {
          doc.fillColor(SLATE).font("Helvetica-Oblique").fontSize(9).text(photo.caption);
        }
        doc.moveDown(0.5);
      } catch {
        // formato de imagem que o pdfkit não decodifica (ex.: webp) — pula sem quebrar o PDF inteiro
        continue;
      }
    }
    doc.moveDown(0.3);
  }

  if (audios.length > 0) {
    doc.fillColor(PINK).font("Helvetica-Bold").fontSize(11).text("NOTAS DE VOZ", { characterSpacing: 0.5 });
    doc.moveDown(0.2);
    doc.fillColor(INK).font("Helvetica").fontSize(10);
    for (const audio of audios) {
      const label = audio.durationSeconds ? `Nota de voz (${fmtDuration(audio.durationSeconds)})` : "Nota de voz";
      doc.text(`🎙 ${label}${audio.caption ? ` — ${audio.caption}` : ""}`, { lineGap: 2 });
    }
    doc.text("Áudio não reproduzível em PDF — abra o Diário no LifeOS para ouvir.", {
      lineGap: 2,
    }).fillColor(SLATE).fontSize(8);
    doc.moveDown(0.5);
  }

  doc.fontSize(8).fillColor(SLATE).text(`Exportado do LifeOS em ${new Date().toLocaleDateString("pt-BR")}`, {
    align: "center",
  });

  doc.end();
  return done;
}
