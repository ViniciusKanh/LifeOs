import crypto from "node:crypto";
import type { getDb } from "../db/client.js";
import { resolveAppUrl } from "./googleAuthService.js";
import { normalizeStoredUtc } from "./healthService.js";
import { getCalendarItems, type CalendarItem } from "./calendarAggregationService.js";

type Db = ReturnType<typeof getDb>;
type AppUrlReq = Parameters<typeof resolveAppUrl>[0];

/**
 * Assinatura de calendário externo (.ics), somente leitura — tarefas com
 * prazo + eventos do Calendário (via calendarAggregationService.ts), no
 * mesmo espírito do "endereço secreto" do Google Calendar: uma URL por
 * usuário, com um token difícil de adivinhar, sem OAuth nem sincronização
 * bidirecional. O token fica em `users.ics_token` (migration 0084).
 */

function generateToken(): string {
  // 24 bytes = 192 bits de entropia, base64url (sem +, / ou = — seguro em path de URL).
  return crypto.randomBytes(24).toString("base64url");
}

function feedUrl(req: AppUrlReq, token: string): string {
  return `${resolveAppUrl(req)}/api/ics/${token}.ics`;
}

/** Token atual do usuário, gerando um na primeira chamada (nunca expira sozinho). */
export async function getOrCreateIcsFeedUrl(db: Db, ownerId: string, req: AppUrlReq): Promise<string> {
  const existing = await db.execute({ sql: "SELECT ics_token FROM users WHERE id = ?", args: [ownerId] });
  const current = (existing.rows[0] as unknown as { ics_token?: string } | undefined)?.ics_token;
  if (current) return feedUrl(req, current);
  return regenerateIcsFeedUrl(db, ownerId, req);
}

/** Gera um token novo (invalida o anterior — útil se o link vazou). */
export async function regenerateIcsFeedUrl(db: Db, ownerId: string, req: AppUrlReq): Promise<string> {
  const token = generateToken();
  await db.execute({ sql: "UPDATE users SET ics_token = ? WHERE id = ?", args: [token, ownerId] });
  return feedUrl(req, token);
}

/** Dono do token (null quando o token não existe/foi regenerado) — usado pela rota pública do feed. */
export async function resolveOwnerByIcsToken(db: Db, token: string): Promise<string | null> {
  if (!token) return null;
  const result = await db.execute({ sql: "SELECT id FROM users WHERE ics_token = ?", args: [token] });
  return (result.rows[0] as unknown as { id?: string } | undefined)?.id ?? null;
}

/** Escapa texto para um campo de texto do iCalendar (RFC 5545 §3.3.11). */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra uma linha de conteúdo em 75 octetos (RFC 5545 §3.1) — continuação com CRLF + espaço. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf-8");
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const limit = first ? 75 : 74; // linhas de continuação perdem 1 octeto pro espaço inicial
    let end = Math.min(offset + limit, bytes.length);
    // Nunca corta no meio de um caractere multi-byte UTF-8.
    while (end > offset && (bytes[end] & 0b1100_0000) === 0b1000_0000) end--;
    chunks.push(bytes.subarray(offset, end).toString("utf-8"));
    offset = end;
    first = false;
  }
  return chunks.join("\r\n ");
}

function icsDateUtc(iso: string): string {
  const ms = Date.parse(normalizeStoredUtc(iso));
  const d = Number.isNaN(ms) ? new Date() : new Date(ms);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function icsDateOnly(value: string): string {
  return value.slice(0, 10).replace(/-/g, "");
}

/**
 * Monta o .ics (RFC 5545) a partir dos itens do calendário. Itens de dia
 * inteiro (allDay, ou prazos de tarefa/meta/TCC — sempre uma data, nunca
 * hora) viram VEVENT de dia inteiro (VALUE=DATE); os demais (eventos
 * manuais com hora marcada) viram VEVENT com hora, em UTC.
 */
export function buildIcsCalendar(items: CalendarItem[], generatedAt = new Date()): string {
  const dtstamp = icsDateUtc(generatedAt.toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LifeOS//Calendar Feed//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:LifeOS",
    "X-WR-CALDESC:Prazos de tarefas e eventos do LifeOS (somente leitura)",
  ];

  for (const item of items) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@lifeos.app`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(item.startsAt)}`);
      if (item.endsAt) lines.push(`DTEND;VALUE=DATE:${icsDateOnly(item.endsAt)}`);
    } else {
      lines.push(`DTSTART:${icsDateUtc(item.startsAt)}`);
      if (item.endsAt) lines.push(`DTEND:${icsDateUtc(item.endsAt)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
    if (item.description) lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Janela do feed: mesmo intervalo relevante pro usuário, bem mais largo que a tela de Calendário (que pagina por mês) — passado recente + bastante futuro, já que apps de calendário só buscam de tempos em tempos. */
export async function buildIcsFeedForOwner(db: Db, ownerId: string): Promise<string> {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const items = await getCalendarItems(db, ownerId, from, to);
  return buildIcsCalendar(items, now);
}
