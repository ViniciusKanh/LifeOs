import type { Client } from "@libsql/client";
import { extractJson } from "./aiJson.js";
import { DIFFICULTY_GUIDE, sanitizeTasks, type ContractProposal } from "./contractsService.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { todayKeyFor } from "./gamificationService.js";

/**
 * Sugestão de missões para uma campanha (wizard da Forja). O Gemini só
 * recebe o nome/descrição da campanha e os títulos já escolhidos; a
 * resposta é sanitizada e NADA é salvo sem confirmação do usuário.
 */
export async function suggestCampaignMissions(
  db: Client,
  ownerId: string,
  input: { title: string; description?: string | null; existing?: string[] },
): Promise<{ ok: true; data: ContractProposal["tasks"] } | { ok: false; message: string }> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini." };
  const today = await todayKeyFor(db, ownerId);
  const existing = (input.existing ?? []).map((t) => `- ${t}`).join("\n") || "(nenhuma ainda)";
  const prompt = `Você é o LifeOS Copilot ajudando a planejar uma campanha (objetivo de médio/longo prazo). Hoje é ${today}.
Campanha: ${input.title}
Propósito: ${input.description ?? "-"}
Missões já escolhidas (não repita):
${existing}
${DIFFICULTY_GUIDE}
Sugira de 3 a 8 missões novas, concretas e executáveis, em ordem lógica. Não invente dados sobre o usuário.
Responda SOMENTE com JSON: {"tasks":[{"title":"...","description":"...","priority":"Média","difficulty":"medio","dueInDays":7,"estimateMinutes":60}]}`;
  const r = await generateText(prompt, config);
  if (!r.ok) return { ok: false, message: r.message };
  const json = extractJson(r.text) as { tasks?: unknown } | null;
  const taken = new Set((input.existing ?? []).map((t) => t.trim().toLowerCase()));
  const tasks = sanitizeTasks(json?.tasks, "medio", 8).filter((t) => !taken.has(t.title.toLowerCase()));
  if (tasks.length === 0) return { ok: false, message: "A IA não trouxe missões novas. Tente detalhar o propósito." };
  return { ok: true, data: tasks };
}
