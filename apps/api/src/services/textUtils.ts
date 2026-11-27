/**
 * Utilitários de texto compartilhados (extraídos do antigo journalService
 * quando o Diário foi removido): HTML do editor rico → texto puro.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mesmo que stripHtml, aceitando qualquer valor (null/não-string → ""). */
export function plainText(html: unknown): string {
  return typeof html === "string" ? stripHtml(html) : "";
}
