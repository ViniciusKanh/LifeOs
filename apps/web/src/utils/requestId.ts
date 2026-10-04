/** Chave de idempotência gerada no cliente (clique duplo/refresh não repete a ação no servidor). */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
