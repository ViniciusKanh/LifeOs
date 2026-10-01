/**
 * Utilitários para respostas estruturadas do Gemini. O modelo às vezes
 * embrulha o JSON em ```json ou adiciona texto em volta — aqui só extraímos
 * e nunca confiamos no conteúdo sem validação posterior (cada serviço
 * sanitiza os campos contra catálogos/limites próprios).
 */

/** Extrai o primeiro objeto JSON da resposta. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** String aparada e limitada, ou null. */
export const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
