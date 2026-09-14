import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { getGeminiConfig, embedText, type GeminiConfig } from "./geminiService.js";

/**
 * Busca semântica — camada de embeddings. Turso/libSQL suporta busca
 * vetorial nativa (`vector_distance_cos`, índice `libsql_vector_idx`),
 * mas essas funções não existem no SQLite local usado nos testes/dev
 * (`@libsql/client` em modo arquivo), então comparamos vetores por
 * similaridade de cosseno aqui mesmo, em JavaScript, contra um cache
 * de embeddings (`search_embeddings`) — funciona igual em qualquer
 * ambiente, sem depender de recurso exclusivo do Turso hospedado.
 */

type Db = ReturnType<typeof getDb>;

export type SearchEntityType = "task" | "goal" | "habit" | "book" | "academic_project" | "project";

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Devolve o embedding em cache de uma entidade se o texto não mudou
 * (mesmo content_hash); senão gera um novo via Gemini e atualiza o
 * cache. `null` quando a chamada ao Gemini falha — quem chama deve
 * simplesmente pular essa entidade na busca semântica, nunca quebrar
 * a busca textual por causa disso.
 */
export async function getOrCreateEmbedding(
  db: Db,
  config: GeminiConfig,
  ownerId: string,
  entityType: SearchEntityType,
  entityId: string,
  text: string
): Promise<number[] | null> {
  const contentHash = hashText(text);

  const cached = await db.execute({
    sql: "SELECT embedding, content_hash FROM search_embeddings WHERE owner_id = ? AND entity_type = ? AND entity_id = ?",
    args: [ownerId, entityType, entityId],
  });
  const row = cached.rows[0] as { embedding?: string; content_hash?: string } | undefined;
  if (row?.content_hash === contentHash && row.embedding) {
    try {
      return JSON.parse(row.embedding) as number[];
    } catch {
      // cache corrompido — recalcula abaixo.
    }
  }

  const result = await embedText(text, config);
  if (!result.ok) return null;

  await db.execute({
    sql: `INSERT INTO search_embeddings (id, owner_id, entity_type, entity_id, content_hash, embedding, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id, entity_type, entity_id)
          DO UPDATE SET content_hash = excluded.content_hash, embedding = excluded.embedding, updated_at = datetime('now')`,
    args: [nanoid(), ownerId, entityType, entityId, contentHash, JSON.stringify(result.vector)],
  });

  return result.vector;
}

export interface SemanticCandidate {
  entityType: SearchEntityType;
  entityId: string;
  text: string;
}

export interface SemanticMatch {
  entityType: SearchEntityType;
  entityId: string;
  similarity: number;
}

/**
 * Rankeia candidatos por similaridade semântica com a query. Limita
 * quantos embeddings novos calcula por chamada (`maxNewEmbeddings`)
 * para não estourar a latência/custo de uma única busca — o cache vai
 * se completando ao longo de buscas sucessivas.
 */
export async function rankSemanticCandidates(
  ownerId: string,
  query: string,
  candidates: SemanticCandidate[],
  maxNewEmbeddings = 25
): Promise<SemanticMatch[]> {
  const config = await getGeminiConfig();
  if (!config) return [];

  const db = getDb();
  const queryEmbedding = await embedText(query, config);
  if (!queryEmbedding.ok) return [];

  let newlyComputed = 0;
  const matches: SemanticMatch[] = [];

  for (const candidate of candidates) {
    const contentHash = hashText(candidate.text);
    const cached = await db.execute({
      sql: "SELECT embedding, content_hash FROM search_embeddings WHERE owner_id = ? AND entity_type = ? AND entity_id = ?",
      args: [ownerId, candidate.entityType, candidate.entityId],
    });
    const row = cached.rows[0] as { embedding?: string; content_hash?: string } | undefined;

    let vector: number[] | null = null;
    if (row?.content_hash === contentHash && row.embedding) {
      try {
        vector = JSON.parse(row.embedding) as number[];
      } catch {
        vector = null;
      }
    }

    if (!vector) {
      if (newlyComputed >= maxNewEmbeddings) continue; // deixa pra próxima busca completar o cache
      vector = await getOrCreateEmbedding(db, config, ownerId, candidate.entityType, candidate.entityId, candidate.text);
      newlyComputed += 1;
    }
    if (!vector) continue;

    matches.push({
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      similarity: cosineSimilarity(queryEmbedding.vector, vector),
    });
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
