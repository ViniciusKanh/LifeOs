import type { Client } from "@libsql/client";
import { REWARD_CATEGORIES } from "../validators/gamification.schema.js";
import { extractJson, str } from "./aiJson.js";
import { coinBalance } from "./gamificationService.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { createReward, listRewards, type RewardInput } from "./rewardsService.js";

type Category = (typeof REWARD_CATEGORIES)[number];

/**
 * Pacote inicial da loja: recompensas comuns de descanso e lazer com
 * custos calibrados pela economia atual (tarefa média ≈ 4 moedas).
 * Só cria o que o usuário ainda não tem (comparação por nome).
 */
export const STARTER_REWARDS: RewardInput[] = [
  { name: "Café especial", icon: "☕", category: "comida", cost: 15, cooldownHours: 24, description: "Um café da cafeteria favorita." },
  { name: "Episódio da série favorita", icon: "📺", category: "lazer", cost: 20, cooldownHours: 12, description: "Um episódio sem culpa depois das missões." },
  { name: "1 hora de videogame", icon: "🎮", category: "lazer", cost: 30, cooldownHours: 24, description: "Uma hora de jogo livre." },
  { name: "Manhã para dormir mais", icon: "😴", category: "descanso", cost: 60, cooldownHours: 168, description: "Sem despertador em um dia de folga." },
  { name: "Pedir uma pizza", icon: "🍕", category: "comida", cost: 80, cooldownHours: 168, description: "Jantar especial da semana." },
  { name: "Sessão de cinema", icon: "🎬", category: "experiencia", cost: 100, cooldownHours: 168, description: "Ir ao cinema ver um lançamento." },
  { name: "Comprar um livro novo", icon: "📚", category: "compras", cost: 120, cooldownHours: 336, description: "Um livro escolhido sem pressa." },
  { name: "Tarde de folga total", icon: "🛋️", category: "descanso", cost: 200, cooldownHours: 336, description: "Uma tarde inteira sem tarefas." },
];

export async function addStarterRewards(db: Client, ownerId: string): Promise<{ created: number }> {
  const existing = new Set((await listRewards(db, ownerId, true)).map((r) => r.name.trim().toLowerCase()));
  let created = 0;
  for (const r of STARTER_REWARDS) {
    if (existing.has(r.name.toLowerCase())) continue;
    await createReward(db, ownerId, r);
    created++;
  }
  return { created };
}

export interface RewardSuggestion {
  name: string;
  description: string | null;
  icon: string | null;
  category: Category;
  cost: number;
  cooldownHours: number;
  /** Por que o custo faz sentido (inferência da IA sobre os dados reais). */
  rationale: string | null;
}

export interface RewardSuggestionResult {
  /** Dados reais usados no cálculo. */
  basedOn: { balance: number; coinsLast30Days: number; avgCoinsPerDay: number };
  suggestions: RewardSuggestion[];
}

/** O Gemini sugere recompensas e custos a partir do ganho real de moedas. Nada é salvo. */
export async function suggestRewards(
  db: Client,
  ownerId: string,
  wish: string | undefined,
): Promise<{ ok: true; data: RewardSuggestionResult } | { ok: false; message: string }> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "A IA do LifeOS Copilot ainda não foi configurada. Peça a um administrador para cadastrar a API Key do Gemini." };

  const [balance, earned, rewards] = await Promise.all([
    coinBalance(db, ownerId),
    db.execute({
      sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM coin_ledger WHERE owner_id = ? AND amount > 0 AND created_at >= datetime('now', '-30 days')",
      args: [ownerId],
    }),
    listRewards(db, ownerId, true),
  ]);
  const coinsLast30Days = Number(earned.rows[0]?.total ?? 0);
  const avgCoinsPerDay = Math.round((coinsLast30Days / 30) * 10) / 10;
  const existing = rewards.map((r) => `${r.name} (${r.cost})`).join(", ") || "nenhuma";

  const prompt = `Você é o LifeOS Copilot e ajuda a montar a Loja de Recompensas de um app de produtividade gamificado.
Moedas são ganhas com tarefas, hábitos e foco (uma tarefa média rende cerca de 4 moedas). Não existe dinheiro real nem sorteio.
Dados reais do usuário: saldo ${balance} moedas; ganhou ${coinsLast30Days} moedas nos últimos 30 dias (média ${avgCoinsPerDay}/dia).
Recompensas já cadastradas (nome e custo): ${existing}.
${wish ? `Pedido do usuário: """${wish.slice(0, 600)}"""` : "Sugira recompensas saudáveis e variadas de descanso, lazer e experiências."}
Regras: 3 a 5 recompensas novas (sem repetir as existentes); recompensas saudáveis, sem incentivar excessos;
custo proporcional ao ganho real (pequenas ≈ 1 dia de moedas, grandes ≈ 1 a 3 semanas); se a média for 0, use a referência de 4 moedas por tarefa.
Categorias válidas: ${REWARD_CATEGORIES.join(", ")}. "icon" é um único emoji.
Responda SOMENTE com JSON:
{"suggestions":[{"name":"...","description":"...","icon":"🎧","category":"lazer","cost":40,"cooldownHours":24,"rationale":"..."}]}`;

  const result = await generateText(prompt, config);
  if (!result.ok) return { ok: false, message: result.message };
  const json = extractJson(result.text) as { suggestions?: unknown } | null;
  const taken = new Set(rewards.map((r) => r.name.trim().toLowerCase()));
  const suggestions: RewardSuggestion[] = (Array.isArray(json?.suggestions) ? json!.suggestions : [])
    .map((raw) => {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const name = str(o.name, 80);
      if (!name || taken.has(name.toLowerCase())) return null;
      const cost = typeof o.cost === "number" && Number.isFinite(o.cost) ? Math.min(5000, Math.max(5, Math.round(o.cost))) : 30;
      const cooldown = typeof o.cooldownHours === "number" && Number.isFinite(o.cooldownHours) ? Math.min(24 * 60, Math.max(0, Math.round(o.cooldownHours))) : 0;
      const icon = str(o.icon, 8);
      return {
        name,
        description: str(o.description, 300),
        icon: icon ? Array.from(icon).slice(0, 2).join("") : null,
        category: (REWARD_CATEGORIES as readonly string[]).includes(String(o.category)) ? (o.category as Category) : "outro",
        cost,
        cooldownHours: cooldown,
        rationale: str(o.rationale, 240),
      };
    })
    .filter((s): s is RewardSuggestion => s !== null)
    .slice(0, 5);
  if (suggestions.length === 0) return { ok: false, message: "A IA não trouxe recompensas novas. Tente descrever o que você gostaria de ganhar." };
  return { ok: true, data: { basedOn: { balance, coinsLast30Days, avgCoinsPerDay }, suggestions } };
}
