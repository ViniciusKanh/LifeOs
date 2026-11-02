import type { Client } from "@libsql/client";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { getBankHub } from "./bankHubService.js";
import { getEducationHub } from "./educationHubService.js";
import { getHealthHub } from "./healthHubService.js";

/**
 * Conselheiros dos módulos (Banco, Educação, Saúde).
 *
 * Sempre há uma resposta DETERMINÍSTICA calculada só com os dados reais;
 * a IA (Gemini) é opcional e apenas reescreve/organiza esses mesmos fatos.
 * Cada item é rotulado: "dado" (registro real), "inferencia" (leitura dos
 * dados) ou "sugestao" (recomendação). O conselheiro NUNCA executa ações —
 * investir, criar tarefas etc. continua exigindo um clique do usuário.
 */

export type AdvisorModule = "bank" | "education" | "health";
export interface AdvisorItem {
  kind: "dado" | "inferencia" | "sugestao";
  text: string;
}
export interface AdvisorAnswer {
  ai: boolean;
  items: AdvisorItem[];
  disclaimer: string;
  /** Quando faltam dados para conclusões, isso é dito explicitamente. */
  insufficient: boolean;
}

const DISCLAIMER: Record<AdvisorModule, string> = {
  bank: "Moedas virtuais do LifeOS — não é dinheiro real nem recomendação financeira.",
  education: "Rank e sugestões de jogo — não substituem orientação acadêmica. Referências nunca são inventadas.",
  health: "Gamificação de autocuidado, não diagnóstico. Em caso de sintomas ou dúvidas, procure um profissional de saúde.",
};

const hm = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

async function bankFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getBankHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [
    { kind: "dado", text: `Saldo disponível: ${i.balance} moedas · ${i.activeInvestments} cofre(s) ativo(s) com ${i.activeInvested} moedas.` },
    { kind: "dado", text: `Score de crédito: ${i.creditScore} · impostos já pagos: ${i.taxesPaid} moedas.` },
  ];
  if (i.activeInvestments > 0) items.push({ kind: "inferencia", text: `Pelos planos contratados, os cofres rendem cerca de ${i.dailyYieldEstimate} moeda(s) por dia (estimativa).` });
  if (h.summary.claimable.length > 0) items.push({ kind: "sugestao", text: `${h.summary.claimable.length} cofre(s) já venceram — resgate para liberar o rendimento.` });
  if (h.summary.loan.active) items.push({ kind: h.summary.loan.active.overdue ? "inferencia" : "dado", text: h.summary.loan.active.overdue ? "O empréstimo está atrasado e acumula multa — quitar primeiro protege seu score." : `Empréstimo ativo: ${h.summary.loan.active.totalDue} moedas a pagar.` });
  if (i.balance > 0 && i.activeInvestments === 0) items.push({ kind: "sugestao", text: "Você tem saldo parado. O Cofre Livre permite resgatar a qualquer momento, sem perder o rendimento já acumulado." });
  if (!h.summary.autoInvest.enabled) items.push({ kind: "sugestao", text: "Ligue a Reserva automática para guardar uma parte de cada moeda ganha sem esforço." });
  const nextMission = h.missions.find((m) => !m.done);
  if (nextMission) items.push({ kind: "sugestao", text: `Próxima missão da Jornada Financeira: ${nextMission.title} (${nextMission.current}/${nextMission.target}).` });
  return { items, insufficient: i.transactions === 0 };
}

async function educationFacts(db: Client, ownerId: string, research: boolean): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getEducationHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [
    { kind: "dado", text: `${i.activeEducations} formação(ões) ativa(s), ${i.subjectsInProgress} disciplina(s) em andamento, ${hm(i.studyMinutesWeek)} de estudo nesta semana.` },
  ];
  const goal = h.educations.filter((e) => e.progressPct < 100).reduce((a, e) => a + e.weeklyGoalMinutes, 0);
  if (goal > 0) items.push({ kind: "inferencia", text: i.studyMinutesWeek >= goal ? "Meta semanal de estudo já alcançada." : `Faltam ${hm(goal - i.studyMinutesWeek)} para a meta semanal de estudo.` });
  if (i.overdueDeadlines > 0) items.push({ kind: "sugestao", text: `${i.overdueDeadlines} prazo(s) passaram sem conclusão — revise se ainda valem ou marque como concluídos.` });
  const next = h.deadlines.find((d) => !d.overdue);
  if (next) items.push({ kind: "dado", text: `Próximo prazo: ${next.title} em ${next.dueDate}${next.subjectName ? ` (${next.subjectName})` : ""}.` });
  const noDeck = h.subjects.filter((s) => s.status === "Em andamento" && s.decks.length === 0);
  if (noDeck.length > 0) items.push({ kind: "sugestao", text: `Crie um baralho no Grimório para ${noDeck[0]!.name} — revisão espaçada ajuda a fixar o conteúdo.` });
  const stage = h.stages.find((s) => s.status === "active") ?? h.stages.find((s) => s.status === "pending");
  if (research) {
    if (stage) items.push({ kind: "sugestao", text: `Etapa atual da pesquisa: "${stage.title}". Quebre-a em entregas semanais pequenas e registre as fontes que você já leu (o assistente não sugere referências).` });
    else items.push({ kind: "sugestao", text: "Cadastre as etapas da campanha (ex.: projeto, qualificação, escrita) para o assistente organizar os próximos passos." });
  }
  if (!h.pendingPlan && i.subjectsInProgress > 0) items.push({ kind: "sugestao", text: "Gere o Plano semanal de estudo para distribuir as horas entre as disciplinas." });
  return { items, insufficient: h.educations.length === 0 };
}

async function healthFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getHealthHub(db, ownerId);
  const p = h.vitality.pillars;
  const items: AdvisorItem[] = [{ kind: "dado", text: `Vitalidade de hoje: ${h.vitality.score}/100 (água ${p.water.score ?? 0}%, sono ${p.sleep.score ?? 0}%, movimento ${p.move.score ?? 0}%, check-in ${p.mood.score ? "feito" : "pendente"}).` }];
  if (h.sleep.weekAvgMinutes != null) items.push({ kind: "dado", text: `Sono: média de ${hm(h.sleep.weekAvgMinutes)} em ${h.sleep.weekNights} noite(s) registrada(s) nos últimos 7 dias.` });
  if (h.sleep.inconsistent.length > 0) items.push({ kind: "sugestao", text: `${h.sleep.inconsistent.length} registro(s) de sono parecem inconsistentes (ex.: mais de 16h). Revise no histórico — eles não entram nas médias.` });
  if (h.sleep.weekAvgMinutes != null && h.sleep.weekAvgMinutes < h.goals.sleepGoalMinutes - 60) items.push({ kind: "sugestao", text: "Seu sono médio está abaixo da sua meta. Um horário fixo para deitar costuma ajudar." });
  if (h.week.workouts < h.goals.weeklyWorkouts) items.push({ kind: "sugestao", text: `Faltam ${h.goals.weeklyWorkouts - h.week.workouts} treino(s) para sua meta semanal — leve conta: caminhada também vale.` });
  if ((p.water.score ?? 0) < 50) items.push({ kind: "sugestao", text: "Distribua a água ao longo do dia em pequenas doses, sem exagerar." });
  const dataDays = h.pulse.filter((d) => d.water != null || d.sleep != null || d.move != null || d.mood != null).length;
  return { items, insufficient: dataDays < 3 };
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { kind: { type: "string", enum: ["dado", "inferencia", "sugestao"] }, text: { type: "string" } }, required: ["kind", "text"] },
    },
  },
  required: ["items"],
};

export async function askAdvisor(db: Client, ownerId: string, module: AdvisorModule, opts: { useAi: boolean; question?: string; research?: boolean }): Promise<AdvisorAnswer> {
  const base = module === "bank" ? await bankFacts(db, ownerId) : module === "education" ? await educationFacts(db, ownerId, !!opts.research) : await healthFacts(db, ownerId);
  const fallback: AdvisorAnswer = { ai: false, items: base.items, disclaimer: DISCLAIMER[module], insufficient: base.insufficient };
  if (!opts.useAi) return fallback;
  const config = await getGeminiConfig();
  if (!config) return fallback;
  const facts = base.items.map((x) => `- [${x.kind}] ${x.text}`).join("\n");
  const rules = {
    bank: "As moedas são virtuais (jogo). Não fale de dinheiro real, não prometa rendimentos e não invente números.",
    education: "Nunca invente referências bibliográficas, autores, artigos, resultados científicos ou evidências. Se pedirem fontes, diga para consultar a biblioteca/orientador.",
    health: "Não diagnostique nem infira doenças ou condições psicológicas. Recomendações prudentes e gerais. Nunca incentive excesso de água, restrição de sono ou treino excessivo.",
  }[module];
  const prompt = `Você é o conselheiro do LifeOS (módulo ${module}). Responda em português do Brasil, em até 6 itens curtos.
Use SOMENTE os fatos abaixo (dados reais do usuário). Não crie números novos. ${rules}
Rotule cada item: "dado" (repete um fato), "inferencia" (leitura dos fatos) ou "sugestao" (recomendação). Você não executa ações.
${base.insufficient ? "Há poucos dados: diga isso claramente." : ""}
FATOS:
${facts}
${opts.question ? `PERGUNTA DO USUÁRIO: ${str(opts.question, 400)}` : ""}`;
  const r = await generateText(prompt, config, { responseSchema: SCHEMA, timeoutMs: 20_000, retries: 1, maxOutputTokens: 1200 });
  if (!r.ok) return fallback;
  const parsed = extractJson(r.text) as { items?: Array<{ kind?: string; text?: string }> } | null;
  const items = (parsed?.items ?? [])
    .filter((x) => typeof x.text === "string" && ["dado", "inferencia", "sugestao"].includes(String(x.kind)))
    .slice(0, 8)
    .map((x) => ({ kind: x.kind as AdvisorItem["kind"], text: str(x.text, 400) ?? "" }));
  return items.length ? { ai: true, items, disclaimer: DISCLAIMER[module], insufficient: base.insufficient } : fallback;
}
