import PDFDocument from "pdfkit";
import type { JournalAutoData } from "./journalService.js";

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
  media: Array<{
    kind: "photo" | "audio" | "video" | "document";
    dataUri: string;
    caption: string | null;
    story?: string | null;
    fileName?: string | null;
    durationSeconds: number | null;
  }>;
  locationLabel?: string | null;
  tags?: string[];
  /** Organização por IA já confirmada pelo usuário (null quando nunca foi salva). */
  ai?: {
    title: string | null;
    summary: string | null;
    highlights: string[];
    gratitude: string | null;
    categories: Array<{ name: string; points: string[] }>;
  } | null;
  auto: JournalAutoData;
}

/* ============================================================
   Paleta de impressão — fundo branco/pergaminho claro mesmo quando o
   app está no tema RPG escuro: o PDF é para ler, imprimir e guardar.
   Tons inspirados no RPG (bronze/dourado envelhecido) só nos detalhes.
   ============================================================ */
const INK = "#2b2622";
const MUTED = "#6f655a";
const BRONZE = "#8a5a1c";
const ACCENT = "#b0336f"; // rosa do Diário, escurecido para contraste em papel
const PARCHMENT = "#f7f0e1";
const PARCHMENT_EDGE = "#e3d3b0";
const RULE = "#e6dccb";

const PAGE_MARGIN = { top: 56, bottom: 64, left: 56, right: 56 };
const FOOTER_TEXT = "LifeOS — Crônicas da Jornada";

/** Caracteres extras que as fontes padrão do PDF (WinAnsi) conseguem desenhar além do Latin-1. */
const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/**
 * As fontes embutidas do PDF (Helvetica/Times) só desenham WinAnsi: emoji
 * e símbolos fora disso virariam lixo no arquivo. Remove-os sem mexer no
 * restante do texto do usuário (acentos do português continuam intactos).
 */
export function toPdfSafeText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(ch)) out += ch;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** Parágrafo extraído do HTML do editor rico: mantém quebras, listas e parágrafos só em negrito (perguntas do assistente). */
interface PdfParagraph {
  text: string;
  bullet: boolean;
  bold: boolean;
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Converte o HTML do editor em parágrafos — stripHtml achata tudo em uma linha, o que deixava o PDF um bloco único de texto. */
export function htmlToParagraphs(html: string | null | undefined): PdfParagraph[] {
  if (!html) return [];
  const blocks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\u0001")
    .split(/<\/(?:p|div|li|h[1-6]|blockquote)>/i);
  const out: PdfParagraph[] = [];
  for (const raw of blocks) {
    const bullet = raw.includes("\u0001");
    const trimmedHtml = raw.replace(/\u0001/g, "").replace(/<\/?(?:ul|ol)[^>]*>/gi, "").trim();
    const bold = /^<(strong|b)>[\s\S]*<\/(strong|b)>$/i.test(trimmedHtml.replace(/^<(?:p|h[1-6]|div)[^>]*>/i, "").trim());
    const text = toPdfSafeText(decodeEntities(trimmedHtml.replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n"));
    if (text) out.push({ text, bullet, bold });
  }
  return out;
}

function fmtDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function formatEntryDate(date: string) {
  const d = new Date(`${date}T12:00:00`);
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const SELF_CARE_LABEL: Record<string, string> = {
  meditar: "Meditar / respirar",
  exercicio: "Fazer exercício",
  ler: "Ler algo",
  evitar_redes: "Evitar redes sociais em excesso",
};

/**
 * "Compartilhar entrada" (Fase 16 do Diário): monta o PDF de uma única
 * entrada no visual "Crônicas da Jornada" — capa com data e título, faixa
 * com o estado real do dia, seções tipografadas (relato, momentos,
 * gratidão, cuidado, fechamento), fotos em grade com legendas, rodapé com
 * numeração. Nunca inventa nada: uma seção só aparece se o dado existir de
 * verdade, e o que veio da IA é sinalizado como tal.
 */
export async function buildJournalEntryPdf(entry: JournalEntryForPdf): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: PAGE_MARGIN,
    bufferPages: true,
    info: { Title: `Diário — ${formatShortDate(entry.date)}`, Author: "LifeOS", Subject: "Crônicas da Jornada" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = PAGE_MARGIN.left;
  const contentWidth = doc.page.width - PAGE_MARGIN.left - PAGE_MARGIN.right;
  const bottomLimit = () => doc.page.height - PAGE_MARGIN.bottom;
  /** Garante espaço para um bloco inteiro — se não couber, começa nova página (nada de bloco cortado ao meio). */
  const ensureSpace = (height: number) => {
    if (doc.y + height > bottomLimit()) {
      doc.addPage();
      doc.y = PAGE_MARGIN.top;
    }
  };

  // ---------- Capa / cabeçalho ----------
  const ai = entry.ai ?? null;
  const aiTitle = ai?.title ? toPdfSafeText(ai.title) : "";
  const metaParts: string[] = [];
  if (entry.isFavorite) metaParts.push("Dia favorito");
  if (entry.locationLabel) metaParts.push(toPdfSafeText(entry.locationLabel));
  const tags = (entry.tags ?? []).map((t) => toPdfSafeText(t)).filter(Boolean);

  const bandHeight = 150 + (aiTitle ? 22 : 0) + (tags.length > 0 ? 14 : 0);
  doc.save();
  doc.rect(0, 0, doc.page.width, bandHeight).fill(PARCHMENT);
  doc.rect(0, bandHeight - 6, doc.page.width, 2).fill(PARCHMENT_EDGE);
  doc.rect(0, bandHeight - 2, doc.page.width, 2).fill(BRONZE);
  doc.restore();

  doc.y = 44;
  doc.fillColor(BRONZE).font("Helvetica-Bold").fontSize(8.5).text("LIFEOS  ·  CRÔNICAS DA JORNADA", left, doc.y, { characterSpacing: 1.6, width: contentWidth });
  doc.moveDown(0.9);
  doc.fillColor(INK).font("Times-Bold").fontSize(26).text(formatEntryDate(entry.date), left, doc.y, { width: contentWidth, lineGap: 2 });
  if (aiTitle) {
    doc.moveDown(0.15);
    doc.fillColor(MUTED).font("Times-Italic").fontSize(14).text(aiTitle, { width: contentWidth });
  }
  doc.moveDown(0.5);
  if (metaParts.length > 0) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(metaParts.join("   ·   "), { width: contentWidth });
  }
  if (tags.length > 0) {
    doc.fillColor(ACCENT).font("Helvetica").fontSize(9).text(tags.map((t) => `#${t}`).join("   "), { width: contentWidth });
  }
  doc.y = bandHeight + 22;

  // ---------- Estado do dia (dados reais de outros módulos) ----------
  const auto = entry.auto;
  const stats: Array<{ label: string; value: string }> = [];
  if (auto.mood) {
    stats.push({ label: "Humor", value: `${auto.mood.mood}/5` });
    stats.push({ label: "Energia", value: `${auto.mood.energy}/5` });
    if (auto.mood.stress != null) stats.push({ label: "Estresse", value: `${auto.mood.stress}/5` });
  }
  if (auto.sleep?.durationMinutes) stats.push({ label: "Sono", value: fmtMinutes(auto.sleep.durationMinutes) });
  if (auto.tasksToday.total > 0) stats.push({ label: "Tarefas", value: `${auto.tasksToday.done}/${auto.tasksToday.total}` });
  if (auto.habitsToday.total > 0) stats.push({ label: "Hábitos", value: `${auto.habitsToday.done}/${auto.habitsToday.total}` });
  if (auto.waterMl > 0) stats.push({ label: "Água", value: `${(auto.waterMl / 1000).toFixed(1).replace(".", ",")} L` });
  if (auto.exerciseMinutes > 0) stats.push({ label: "Exercício", value: fmtMinutes(auto.exerciseMinutes) });
  if (auto.reading.pages > 0) stats.push({ label: "Leitura", value: `${auto.reading.pages} pág.` });

  if (stats.length > 0) {
    const perRow = Math.min(5, stats.length);
    const gap = 8;
    const cellW = (contentWidth - gap * (perRow - 1)) / perRow;
    const cellH = 40;
    doc.fillColor(BRONZE).font("Helvetica-Bold").fontSize(8).text("ESTADO DO DIA", left, doc.y, { characterSpacing: 1.2 });
    doc.moveDown(0.4);
    let y = doc.y;
    stats.forEach((s, i) => {
      const col = i % perRow;
      if (i > 0 && col === 0) y += cellH + gap;
      const x = left + col * (cellW + gap);
      doc.save();
      doc.roundedRect(x, y, cellW, cellH, 3).lineWidth(0.8).fillAndStroke("#fbf8f2", PARCHMENT_EDGE);
      doc.restore();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(s.value, x + 8, y + 7, { width: cellW - 16, lineBreak: false });
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(s.label, x + 8, y + 24, { width: cellW - 16, lineBreak: false });
    });
    doc.x = left;
    doc.y = y + cellH + 6;
    doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(7.5).text("Dados registrados nos outros módulos do LifeOS neste dia.", left, doc.y, { width: contentWidth });
    doc.moveDown(1.2);
  }

  // ---------- Helpers de seção ----------
  const sectionHeading = (title: string, note?: string) => {
    // título + pelo menos ~3 linhas de corpo na mesma página (sem título órfão no pé da página)
    ensureSpace(80);
    doc.moveDown(0.3);
    const y = doc.y;
    doc.save();
    doc.rect(left, y + 5, 6, 6).fill(BRONZE);
    doc.restore();
    doc.fillColor(INK).font("Times-Bold").fontSize(15).text(title, left + 14, y, { width: contentWidth - 14 });
    if (note) doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5).text(note, left + 14, doc.y + 1, { width: contentWidth - 14 });
    const ruleY = doc.y + 4;
    doc.save();
    doc.moveTo(left, ruleY).lineTo(left + contentWidth, ruleY).lineWidth(0.8).strokeColor(RULE).stroke();
    doc.restore();
    doc.x = left;
    doc.y = ruleY + 8;
  };

  const paragraphs = (items: PdfParagraph[]) => {
    for (const p of items) {
      doc.font(p.bold ? "Helvetica-Bold" : "Helvetica").fontSize(11);
      const indent = p.bullet ? 14 : 0;
      const h = doc.heightOfString(p.text, { width: contentWidth - indent, lineGap: 3.5 });
      // parágrafos curtos não se partem entre páginas; longos podem fluir normalmente
      if (h < 120) ensureSpace(h + 4);
      const y = doc.y;
      if (p.bullet) doc.fillColor(ACCENT).font("Helvetica-Bold").text("•", left + 2, y, { lineBreak: false });
      doc.fillColor(INK).font(p.bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).text(p.text, left + indent, y, { width: contentWidth - indent, lineGap: 3.5 });
      doc.x = left;
      doc.moveDown(0.55);
    }
    doc.moveDown(0.4);
  };

  /** Altura total de uma lista — usada para manter listas curtas inteiras na mesma página. */
  const measureList = (items: string[]) => {
    doc.font("Helvetica").fontSize(11);
    return items.reduce((sum, raw) => sum + doc.heightOfString(toPdfSafeText(raw) || " ", { width: contentWidth - 20, lineGap: 3 }) + 6, 0);
  };

  const bulletList = (items: string[], numbered = false) => {
    const total = measureList(items);
    if (total < 220) ensureSpace(total);
    items.forEach((raw, i) => {
      const text = toPdfSafeText(raw);
      if (!text) return;
      doc.font("Helvetica").fontSize(11);
      const h = doc.heightOfString(text, { width: contentWidth - 20, lineGap: 3 });
      ensureSpace(h + 4);
      const y = doc.y;
      doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(numbered ? 10.5 : 11).text(numbered ? `${i + 1}.` : "•", left + 2, y, { lineBreak: false });
      doc.fillColor(INK).font("Helvetica").fontSize(11).text(text, left + 20, y, { width: contentWidth - 20, lineGap: 3 });
      doc.x = left;
      doc.moveDown(0.35);
    });
    doc.moveDown(0.5);
  };

  /** Caixa em tom pergaminho para conteúdo derivado (resumo da IA): mede o texto antes para não partir a caixa. */
  const softBox = (text: string, label: string) => {
    const safe = toPdfSafeText(text);
    if (!safe) return;
    const pad = 12;
    doc.font("Times-Italic").fontSize(12);
    const textH = doc.heightOfString(safe, { width: contentWidth - pad * 2, lineGap: 3 });
    const boxH = textH + pad * 2 + 14;
    ensureSpace(boxH + 6);
    const y = doc.y;
    doc.save();
    doc.rect(left, y, contentWidth, boxH).fill(PARCHMENT);
    doc.rect(left, y, 3, boxH).fill(BRONZE);
    doc.restore();
    doc.fillColor(BRONZE).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), left + pad, y + pad - 2, { characterSpacing: 1, width: contentWidth - pad * 2 });
    doc.fillColor(INK).font("Times-Italic").fontSize(12).text(safe, left + pad, y + pad + 12, { width: contentWidth - pad * 2, lineGap: 3 });
    doc.x = left;
    doc.y = y + boxH + 10;
  };

  // ---------- Conteúdo escrito pelo usuário ----------
  const writtenSection = (title: string, html: string | null | undefined) => {
    const items = htmlToParagraphs(html);
    if (items.length === 0) return;
    sectionHeading(title);
    paragraphs(items);
  };

  // Campos guiados antigos só aparecem se ainda não foram migrados (0050).
  writtenSection("Intenção do dia", entry.intention);
  writtenSection("Como foi meu dia", entry.thoughts);

  if (ai && (ai.summary || ai.highlights.length > 0 || ai.categories.length > 0)) {
    sectionHeading("Momentos do dia", "Organizado pelo LifeOS Copilot a partir do seu texto e confirmado por você.");
    if (ai.summary) softBox(ai.summary, "Resumo");
    if (ai.highlights.length > 0) bulletList(ai.highlights);
    for (const cat of ai.categories) {
      const points = cat.points.map((p) => toPdfSafeText(p)).filter(Boolean);
      const name = toPdfSafeText(cat.name);
      if (!name || points.length === 0) continue;
      // título da categoria nunca fica separado dos seus pontos
      ensureSpace(Math.min(240, 22 + measureList(points)));
      doc.fillColor(BRONZE).font("Helvetica-Bold").fontSize(9.5).text(name.toUpperCase(), left, doc.y, { characterSpacing: 0.8, width: contentWidth });
      doc.moveDown(0.3);
      bulletList(points);
    }
  }

  if (entry.gratitude.length > 0) {
    sectionHeading("Gratidão", "Hoje sou grato por:");
    bulletList(entry.gratitude, true);
    if (ai?.gratitude) softBox(ai.gratitude, "Reflexão sobre a gratidão (IA)");
  }

  const selfCareAll = [...entry.selfCare.map((k) => SELF_CARE_LABEL[k] ?? k), ...(entry.selfCareOther ? [entry.selfCareOther] : [])];
  if (selfCareAll.length > 0) {
    sectionHeading("Cuidado comigo");
    bulletList(selfCareAll);
  }

  writtenSection("Desafios", entry.challenges);
  writtenSection("Como tornar este dia mais leve", entry.lighterPlan);
  writtenSection("O que me fez bem hoje", entry.feelGood);

  const takeaway = htmlToParagraphs(entry.nightTakeaway);
  const helped = htmlToParagraphs(entry.nightHelped);
  if (takeaway.length > 0 || helped.length > 0 || entry.nightMood != null) {
    sectionHeading("Fechamento do dia", "O que levo para amanhã");
    paragraphs([...takeaway, ...helped]);
    if (entry.nightMood != null) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(`Humor anotado no diário: ${entry.nightMood}/5`, left, doc.y, { width: contentWidth });
      doc.moveDown(0.8);
    }
  }

  // ---------- Fotos em grade (2 colunas) com legenda e história ----------
  type PdfPhoto = { buf: Buffer | null; caption: string | null; story: string | null };
  // openImage existe no pdfkit em runtime, mas não nos tipos publicados.
  const canDecode = (buf: Buffer) => {
    try {
      (doc as unknown as { openImage: (src: Buffer) => unknown }).openImage(buf);
      return true;
    } catch {
      return false;
    }
  };
  const photos: PdfPhoto[] = [];
  for (const m of entry.media) {
    if (m.kind !== "photo") continue;
    const base64 = m.dataUri.split(",")[1];
    if (!base64) continue;
    const buf = Buffer.from(base64, "base64");
    // pdfkit só decodifica JPEG/PNG — formato não suportado vira aviso no lugar da foto, sem quebrar o PDF
    photos.push({ buf: canDecode(buf) ? buf : null, caption: m.caption, story: m.story ?? null });
  }

  if (photos.length > 0) {
    // o título "Fotos do dia" só começa onde cabe também a primeira linha da grade
    ensureSpace(60 + 175 + 50);
    sectionHeading("Fotos do dia", `${photos.length} ${photos.length === 1 ? "registro" : "registros"} com as histórias que você contou.`);
    const gap = 14;
    const colW = (contentWidth - gap) / 2;
    const imgH = 175;
    const captionBlock = (p: (typeof photos)[number]) => {
      const caption = p.caption ? toPdfSafeText(p.caption) : "";
      const storyRaw = p.story ? toPdfSafeText(p.story) : "";
      const story = storyRaw.length > 240 ? `${storyRaw.slice(0, 237).trimEnd()}…` : storyRaw;
      doc.font("Helvetica-Bold").fontSize(9.5);
      const capH = caption ? doc.heightOfString(caption, { width: colW, lineGap: 1 }) + 2 : 0;
      doc.font("Helvetica-Oblique").fontSize(8.5);
      const storyH = story ? doc.heightOfString(story, { width: colW, lineGap: 1.5 }) : 0;
      return { caption, story, height: capH + storyH };
    };
    for (let i = 0; i < photos.length; i += 2) {
      const row = photos.slice(i, i + 2);
      const blocks = row.map(captionBlock);
      const rowH = imgH + 8 + Math.max(...blocks.map((b) => b.height)) + 16;
      ensureSpace(rowH);
      const y = doc.y;
      row.forEach((p, j) => {
        const x = left + j * (colW + gap);
        doc.save();
        doc.rect(x, y, colW, imgH).fill("#f3eee6");
        doc.restore();
        if (p.buf) {
          doc.image(p.buf, x + 4, y + 4, { fit: [colW - 8, imgH - 8], align: "center", valign: "center" });
        } else {
          doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5).text("Formato de imagem não suportado no PDF — veja no LifeOS.", x + 12, y + imgH / 2 - 8, { width: colW - 24, align: "center" });
        }
        doc.save();
        doc.rect(x, y, colW, imgH).lineWidth(0.8).strokeColor(PARCHMENT_EDGE).stroke();
        doc.restore();
        const b = blocks[j];
        let ty = y + imgH + 8;
        if (b.caption) {
          doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(b.caption, x, ty, { width: colW, lineGap: 1 });
          ty = doc.y + 2;
        }
        if (b.story) doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5).text(b.story, x, ty, { width: colW, lineGap: 1.5 });
      });
      doc.x = left;
      doc.y = y + rowH;
    }
    doc.moveDown(0.4);
  }

  // ---------- Outros anexos (não renderizáveis em PDF) ----------
  const others = entry.media.filter((m) => m.kind === "video" || m.kind === "document");
  const audios = entry.media.filter((m) => m.kind === "audio");
  if (others.length > 0 || audios.length > 0) {
    sectionHeading("Outros anexos", "Vídeos, documentos e áudios ficam disponíveis no Diário do LifeOS.");
    const lines = [
      ...others.map((m) => {
        const kind = m.kind === "video" ? "Vídeo" : "Documento";
        const name = toPdfSafeText(m.caption || m.fileName || "sem título");
        return `${kind}: ${name}`;
      }),
      ...audios.map((a) => {
        const label = a.durationSeconds ? `Nota de voz (${fmtDuration(a.durationSeconds)})` : "Nota de voz";
        return a.caption ? `${label} — ${a.caption}` : label;
      }),
    ];
    bulletList(lines);
  }

  // ---------- Reflexão do dia (conteúdo curado, não é dado do usuário) ----------
  if (auto.dailyQuote?.text) {
    const quote = `“${toPdfSafeText(auto.dailyQuote.text)}”`;
    const source = `— ${toPdfSafeText(auto.dailyQuote.source)}`;
    doc.font("Times-Italic").fontSize(11.5);
    const h = doc.heightOfString(quote, { width: contentWidth - 80, align: "center" }) + 30;
    ensureSpace(h + 20);
    doc.moveDown(0.8);
    const y = doc.y;
    doc.save();
    doc.moveTo(left + contentWidth / 2 - 30, y).lineTo(left + contentWidth / 2 + 30, y).lineWidth(0.8).strokeColor(BRONZE).stroke();
    doc.restore();
    doc.fillColor(MUTED).font("Times-Italic").fontSize(11.5).text(quote, left + 40, y + 10, { width: contentWidth - 80, align: "center", lineGap: 2 });
    doc.fillColor(BRONZE).font("Helvetica").fontSize(8.5).text(source, left + 40, doc.y + 3, { width: contentWidth - 80, align: "center" });
  }

  // ---------- Rodapé e cabeçalho corrido em todas as páginas ----------
  const range = doc.bufferedPageRange();
  const exportedAt = new Date().toLocaleDateString("pt-BR");
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // zera a margem inferior temporariamente: escrever no rodapé não pode criar página nova
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 42;
    doc.save();
    doc.moveTo(left, footerY - 8).lineTo(left + contentWidth, footerY - 8).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.restore();
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`${FOOTER_TEXT}  ·  exportado em ${exportedAt}`, left, footerY, { width: contentWidth, lineBreak: false });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`Página ${i - range.start + 1} de ${range.count}`, left, footerY, { width: contentWidth, align: "right", lineBreak: false });
    if (i > range.start) {
      doc.fillColor(BRONZE).font("Helvetica-Bold").fontSize(7.5).text(`CRÔNICA DE ${formatShortDate(entry.date)}`, left, 30, { width: contentWidth, align: "right", characterSpacing: 1, lineBreak: false });
    }
    doc.page.margins.bottom = originalBottom;
  }

  doc.end();
  return done;
}

