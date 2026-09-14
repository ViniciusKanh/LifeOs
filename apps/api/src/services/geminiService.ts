import { getDb } from "../db/client.js";
import { decryptSecret } from "./cryptoService.js";

/**
 * Integração com a API do Gemini (LifeOS Copilot). Credenciais vêm
 * de admin_settings (integration = 'gemini'), sempre descriptografadas
 * só no momento do uso — nunca expostas de volta ao frontend.
 *
 * Modelos válidos: a lista muda com o tempo (a Google aposenta
 * versões antigas), então NUNCA fixe um nome de modelo sem antes
 * conferir a documentação oficial (https://ai.google.dev/gemini-api/docs/models).
 * Os IDs abaixo foram checados na documentação em 13/09/2026, após a
 * Google aposentar "gemini-2.5-flash" para contas novas — revise-os
 * de novo se o teste de conexão voltar a falhar com "model not found"
 * ou "no longer available".
 */
export const GEMINI_MODELS = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (recomendado — rápido e econômico)" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (mais inteligente, tarefas complexas)" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (mais econômico)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (raciocínio avançado)" },
] as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const VALID_MODEL_IDS = new Set<string>(GEMINI_MODELS.map((m) => m.id));

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

type Db = ReturnType<typeof getDb>;

async function readSetting(db: Db, keyName: string): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT encrypted_value FROM admin_settings WHERE integration = 'gemini' AND key_name = ? AND is_active = 1",
    args: [keyName],
  });
  const row = result.rows[0] as { encrypted_value?: string } | undefined;
  if (!row?.encrypted_value) return null;
  return decryptSecret(row.encrypted_value);
}

/**
 * Se o modelo salvo no banco não existir mais na lista atual (a Google
 * aposentou/renomeou), cai pro padrão em vez de continuar chamando um
 * modelo morto — evita reviver o mesmo erro "no longer available"
 * sempre que a Google descontinuar outro modelo antigo salvo aqui.
 */
export async function getGeminiConfig(): Promise<GeminiConfig | null> {
  const db = getDb();
  const [apiKey, model] = await Promise.all([readSetting(db, "api_key"), readSetting(db, "model")]);
  if (!apiKey) return null;
  const resolvedModel = model && VALID_MODEL_IDS.has(model) ? model : DEFAULT_GEMINI_MODEL;
  return { apiKey, model: resolvedModel };
}

export type GeminiCallResult = { ok: true; text: string } | { ok: false; message: string };

/**
 * Chamada genérica à API do Gemini — usada tanto pelo teste de
 * conexão quanto pelo LifeOS Copilot (geração de insights). Nunca
 * mascara o erro real da Google: se a chave, o modelo ou a cota
 * estiverem com problema, a mensagem devolvida é a da própria API.
 */
export async function generateText(prompt: string, config: GeminiConfig): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = (await res.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }
      | null;

    if (!res.ok) {
      const apiMessage = data?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, message: `Gemini recusou a chamada (modelo "${config.model}"): ${apiMessage}` };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return { ok: false, message: `Conexão com o modelo "${config.model}" funcionando, mas a resposta veio vazia.` };
    }
    return { ok: true, text };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? `Falha ao chamar a API do Gemini: ${err.message}` : "Falha ao chamar a API do Gemini." };
  }
}

/**
 * Declaração de uma função no formato que a API do Gemini espera em
 * `tools[0].functionDeclarations` (subset de JSON Schema). Usada pelo
 * Copilot com ações reais (copilotActionsService.ts) — cada ação
 * disponível (criar tarefa, marcar hábito etc.) vira uma dessas.
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export type GeminiToolCallResult =
  | { ok: true; text?: string; functionCall?: GeminiFunctionCall }
  | { ok: false; message: string };

/**
 * Chamada com function calling (tools): o Gemini pode responder com
 * texto normal OU pedir para chamar uma das funções declaradas — quem
 * decide se/como executar essa função é sempre o backend do LifeOS,
 * nunca o Gemini diretamente (ver copilotActionsService.ts: toda
 * ação proposta exige confirmação explícita do usuário antes de
 * gravar qualquer coisa no banco).
 */
export async function generateWithTools(
  prompt: string,
  tools: GeminiFunctionDeclaration[],
  config: GeminiConfig
): Promise<GeminiToolCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ functionDeclarations: tools }],
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> };
          }>;
          error?: { message?: string };
        }
      | null;

    if (!res.ok) {
      const apiMessage = data?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, message: `Gemini recusou a chamada (modelo "${config.model}"): ${apiMessage}` };
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = parts.find((p) => p.functionCall?.name);
    if (functionCallPart?.functionCall?.name) {
      return {
        ok: true,
        functionCall: { name: functionCallPart.functionCall.name, args: functionCallPart.functionCall.args ?? {} },
      };
    }

    const text = parts.find((p) => p.text)?.text?.trim();
    if (!text) {
      return { ok: false, message: `Conexão com o modelo "${config.model}" funcionando, mas a resposta veio vazia.` };
    }
    return { ok: true, text };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? `Falha ao chamar a API do Gemini: ${err.message}` : "Falha ao chamar a API do Gemini." };
  }
}

export type EmbeddingResult = { ok: true; vector: number[] } | { ok: false; message: string };

/**
 * Embedding de texto via `text-embedding-004` — usado pela busca
 * semântica (searchService.ts). Vetor de 768 dimensões; guardamos
 * como JSON no banco e comparamos por similaridade de cosseno em
 * JavaScript (ver embeddingsService.ts) em vez de depender de função
 * de vetor nativa do SQLite/libSQL local usado nos testes.
 */
export async function embedText(text: string, config: GeminiConfig): Promise<EmbeddingResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${config.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    const data = (await res.json().catch(() => null)) as
      | { embedding?: { values?: number[] }; error?: { message?: string } }
      | null;
    if (!res.ok) {
      return { ok: false, message: data?.error?.message ?? `HTTP ${res.status}` };
    }
    const vector = data?.embedding?.values;
    if (!vector || vector.length === 0) {
      return { ok: false, message: "Embedding vazio." };
    }
    return { ok: true, vector };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Falha ao gerar embedding." };
  }
}

/**
 * Testa a chave de verdade: manda um prompt trivial para a API do
 * Gemini e devolve a resposta (ou o erro real da Google, sem
 * mascarar) — assim dá pra saber se a chave, o modelo e a cota
 * estão realmente funcionando, não só se o formato da chave parece ok.
 */
export async function testGeminiConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getGeminiConfig();
  if (!config) {
    return { ok: false, message: "Configure a API Key do Gemini antes de testar." };
  }

  const result = await generateText("Responda em uma frase curta: você está funcionando?", config);
  if (!result.ok) return result;
  return { ok: true, message: `Modelo "${config.model}" respondeu: "${result.text}"` };
}
