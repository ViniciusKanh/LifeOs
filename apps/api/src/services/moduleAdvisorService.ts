import type { Client } from "@libsql/client";
import { extractJson, str } from "./aiJson.js";
import { generateText, getGeminiConfig } from "./geminiService.js";
import { getBankHub } from "./bankHubService.js";
import { getEducationHub } from "./educationHubService.js";
import { getHealthHub } from "./healthHubService.js";
import { getChronicleHub, getLabHub } from "./chronicleLabService.js";
import { getBuildOverview } from "./characterBuildService.js";
import { listAchievements } from "./achievementsService.js";
import { getTreasureHub } from "./heroHubService.js";
import { getHabitsHub } from "./habitsHubService.js";
import { getLibraryHub } from "./libraryHubService.js";
import { getAdminHub } from "./lifeAdminHubService.js";
import { focusBlocks, getTodayHub, nextBestAction } from "./todayHubService.js";
import { getGuildHub as getPactGuildHub } from "./contractGuildService.js";
import { getAgendaHub, getCouncilHub, getGuildHub, getMissionsHub } from "./planningHubService.js";

/**
 * Conselheiros dos módulos (Banco, Educação, Saúde).
 *
 * Sempre há uma resposta DETERMINÍSTICA calculada só com os dados reais;
 * a IA (Gemini) é opcional e apenas reescreve/organiza esses mesmos fatos.
 * Cada item é rotulado: "dado" (registro real), "inferencia" (leitura dos
 * dados) ou "sugestao" (recomendação). O conselheiro NUNCA executa ações —
 * investir, criar tarefas etc. continua exigindo um clique do usuário.
 */

export type AdvisorModule = "bank" | "education" | "health" | "agenda" | "council" | "missions" | "quests" | "diary" | "lab" | "hero" | "treasure" | "habits" | "library" | "admin" | "today" | "contracts";
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
  agenda: "Sugestões de horário — nada é reagendado sem a sua aprovação.",
  council: "Plano proposto a partir dos seus registros; você decide o que selar.",
  missions: "Subtarefas e prioridades sugeridas só são salvas com a sua aprovação.",
  quests: "As recompensas seguem as regras do Quadro de Avisos — a IA não cria quests nem XP.",
  diary: "Leitura só com números e etiquetas do Diário (o texto das crônicas não é enviado). Não é avaliação psicológica.",
  lab: "Estudo pessoal observacional: sem prova de causa e efeito. Nada é criado sem a sua confirmação.",
  hero: "Leitura dos seus registros — não é teste de personalidade. Metas e missões só são criadas com a sua aprovação.",
  treasure: "Moedas virtuais do LifeOS. A IA só sugere: nenhum resgate acontece sem a sua confirmação.",
  habits: "Sugestões sobre seus hábitos — nada é alterado sem você.",
  library: "Baseado nas suas sessões e anotações. Nenhum trecho de livro é reproduzido.",
  admin: "Valores em dinheiro real são só informativos e não se misturam às moedas do LifeOS. Nada é pago ou cancelado automaticamente.",
  today: "Sugestões para o seu dia — nenhum compromisso ou tarefa é criado ou alterado sem a sua aprovação.",
  contracts: "Conselhos da Guilda — nenhum contrato é criado, alterado, cancelado ou selado sem a sua aprovação.",
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


async function agendaFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getAgendaHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [
    { kind: "dado", text: `Semana: ${i.eventsWeek} compromisso(s)/prazo(s), ${hm(i.plannedMinutes)} planejadas, ${i.focusBlocks} bloco(s) de foco agendado(s).` },
  ];
  if (i.completionPct != null) items.push({ kind: "dado", text: `Cumprimento das missões planejadas até hoje: ${i.completionPct}%.` });
  if (h.conflicts.length > 0) {
    const c = h.conflicts[0]!;
    items.push({ kind: "inferencia", text: `${h.conflicts.length} conflito(s) de horário. “${c.a.title}” e “${c.b.title}” se sobrepõem ${c.overlapMinutes} min.` });
    if (c.suggestion) items.push({ kind: "sugestao", text: `Mover “${c.b.title}” para ${c.suggestion.start}–${c.suggestion.end} resolve o primeiro conflito.` });
  }
  const overdue = h.tower.filter((b) => b.overdue).length;
  if (overdue) items.push({ kind: "sugestao", text: `${overdue} missão(ões) planejada(s) em dias anteriores ainda abertas — use o Replanejamento para redistribuir.` });
  const loose = h.tower.filter((b) => b.kind === "task").length;
  if (loose) items.push({ kind: "sugestao", text: `${loose} missão(ões) de hoje sem horário. Reserve um bloco de foco na Torre do Tempo.` });
  if (i.plannedMinutes > 50 * 60) items.push({ kind: "inferencia", text: "Mais de 50h planejadas na semana — risco de sobrecarga." });
  return { items, insufficient: i.eventsWeek === 0 && h.tower.length === 0 };
}

async function councilFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getCouncilHub(db, ownerId);
  const l = h.load;
  const items: AdvisorItem[] = [{ kind: "dado", text: `Capacidade livre declarada na semana: ${hm(l.freeMinutes)} · missões planejadas: ${hm(l.plannedMinutes)}.` }];
  if (l.occupancyPct != null) items.push({ kind: "inferencia", text: l.overloaded ? `Ocupação de ${l.occupancyPct}%: o plano passa da capacidade. Tire ou adie missões de menor prioridade.` : `Ocupação de ${l.occupancyPct}% da capacidade.` });
  else items.push({ kind: "inferencia", text: "Sem capacidade declarada no Capacity Planner — não dá para medir sobrecarga com segurança." });
  if (l.unestimatedTasks) items.push({ kind: "sugestao", text: `${l.unestimatedTasks} missão(ões) planejada(s) sem estimativa de tempo. Estimar ajuda a equilibrar os dias.` });
  const heavy = l.byDay.filter((d) => d.freeMinutes > 0 && d.plannedMinutes > d.freeMinutes);
  if (heavy.length) items.push({ kind: "sugestao", text: `Dias acima da capacidade: ${heavy.map((d) => d.date.slice(8, 10) + "/" + d.date.slice(5, 7)).join(", ")}.` });
  const stalled = h.campaigns.filter((c) => c.status === "active" && c.total > 0 && c.pct < 30);
  if (stalled.length) items.push({ kind: "sugestao", text: `Campanha com pouco avanço: ${stalled[0]!.title} (${stalled[0]!.pct}%). Considere torná-la um dos focos.` });
  return { items, insufficient: l.plannedMinutes === 0 && h.campaigns.length === 0 };
}

async function missionsFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getMissionsHub(db, ownerId);
  const l = h.load;
  const items: AdvisorItem[] = [{ kind: "dado", text: `${l.pending} missão(ões) abertas, ${l.overdue} atrasada(s), ${hm(l.pendingEstimateMinutes)} estimadas.` }];
  if (h.featured) items.push({ kind: "sugestao", text: `Próxima ação: “${h.featured.title}”${h.featured.overdue ? " (atrasada)" : ""}${h.featured.subtasks.total ? ` — ${h.featured.subtasks.done}/${h.featured.subtasks.total} subtarefas` : ""}.` });
  if (l.occupancyPct != null && l.occupancyPct > 100) items.push({ kind: "inferencia", text: `O estimado (${hm(l.pendingEstimateMinutes)}) passa da capacidade livre do resto da semana (${hm(l.freeMinutesRestOfWeek)}).` });
  if (l.unestimated) items.push({ kind: "sugestao", text: `${l.unestimated} missão(ões) sem estimativa — o Mestre de Missões pode dividir as maiores.` });
  if (h.combo.current > 0) items.push({ kind: "dado", text: `Combo de execução: ${h.combo.current} dia(s) seguido(s) (recorde ${h.combo.best}).` });
  return { items, insufficient: l.pending === 0 };
}

async function questsFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getGuildHub(db, ownerId);
  const items: AdvisorItem[] = [{ kind: "dado", text: `Quests de hoje: ${h.progress.dailyDone}/${h.progress.dailyTotal} · semanais: ${h.progress.weeklyDone}/${h.progress.weeklyTotal}.` }];
  if (h.chest.claimable.length) items.push({ kind: "sugestao", text: `${h.chest.claimable.length} recompensa(s) prontas no baú (${h.chest.xp} XP). Abra o baú para resgatar.` });
  const close = [...h.board.daily.quests, ...h.board.weekly.quests].filter((q) => !q.completed && q.target > 0).sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  if (close) items.push({ kind: "sugestao", text: `Quest mais perto do fim: ${close.title} (${close.progress}/${close.target}).` });
  if (h.notices.deadlines.length) items.push({ kind: "dado", text: `Prazo próximo: ${h.notices.deadlines[0]!.title} (${h.notices.deadlines[0]!.date.slice(8, 10)}/${h.notices.deadlines[0]!.date.slice(5, 7)}).` });
  if (h.notices.reviewsDue) items.push({ kind: "sugestao", text: `${h.notices.reviewsDue} cartão(ões) do Grimório para revisar hoje — costuma valer quest de estudo.` });
  return { items, insufficient: h.progress.dailyTotal === 0 };
}

async function diaryFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  // Privacidade: só contagens e etiquetas — nenhum trecho das crônicas vai para a IA.
  const h = await getChronicleHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [
    { kind: "dado", text: `Sequência atual: ${i.streak} dia(s) (recorde ${i.bestStreak}). ${h.insights.last30} crônica(s) nos últimos 30 dias, ${h.insights.prev30} nos 30 anteriores.` },
    { kind: "dado", text: `${i.reflectionsClosed} dia(s) com fechamento e ${i.gratitudes} gratidão(ões) registradas.` },
  ];
  const best = [...h.insights.writingByWeekday].sort((a, b) => b.count - a.count)[0];
  if (best && best.count > 0) items.push({ kind: "inferencia", text: `Dia da semana com mais crônicas nos últimos 90 dias: ${best.label}.` });
  if (h.insights.themes.length) items.push({ kind: "dado", text: `Temas mais frequentes: ${h.insights.themes.slice(0, 4).map((t) => t.label).join(", ")}.` });
  const pending = h.ritual.filter((r) => !r.done).map((r) => r.title.toLowerCase());
  if (pending.length) items.push({ kind: "sugestao", text: `Ritual de hoje: falta ${pending.slice(0, 2).join(" e ")}.` });
  if (!h.retrospectives.some((r) => r.savedAt)) items.push({ kind: "sugestao", text: "Experimente salvar uma retrospectiva semanal na aba Insights — ela é gerada só com o que você escreveu." });
  if (h.insights.last30 < h.insights.prev30) items.push({ kind: "sugestao", text: "A frequência caiu em relação ao mês anterior. Um registro curto já mantém o hábito." });
  return { items, insufficient: i.entries < 3 };
}

async function labFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getLabHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [{ kind: "dado", text: `${i.active} experimento(s) ativo(s), ${i.completed} concluído(s), ${i.inAnalysis} aguardando análise, ${i.discoveries} descoberta(s) documentada(s).` }];
  if (h.featured) items.push({ kind: "dado", text: `Em destaque: ${h.featured.title} — ${h.featured.doneDays} de ${h.featured.elapsedDays} dia(s) cumpridos.` });
  for (const e of h.experiments.filter((x) => x.status === "active" && x.missingDays >= 2).slice(0, 2)) items.push({ kind: "inferencia", text: `${e.title} tem ${e.missingDays} dia(s) sem registro — a análise ficará menos confiável.` });
  for (const e of h.experiments.filter((x) => x.stage === "analise" && !x.conclusion).slice(0, 2)) items.push({ kind: "sugestao", text: `${e.title}: o período terminou. Revise os resultados e documente a conclusão (inconclusivo também vale).` });
  if (i.active === 0) items.push({ kind: "sugestao", text: "Escolha um protocolo da biblioteca ou descreva um objetivo para a IA Cientista propor um experimento." });
  if (i.active > 2) items.push({ kind: "inferencia", text: "Vários experimentos ao mesmo tempo dificultam separar o efeito de cada um (fatores de confusão)." });
  return { items, insufficient: h.experiments.length === 0 };
}

async function heroFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const [b, ach] = await Promise.all([getBuildOverview(db, ownerId), listAchievements(ownerId)]);
  const items: AdvisorItem[] = [];
  if (!b.sufficiency.enough || !b.archetype) {
    items.push({ kind: "dado", text: `Ainda há pouco XP na janela de ${b.windowDays} dias (${b.sufficiency.windowXp} de ${b.sufficiency.minWindowXp}) para ler a build com segurança.` });
  } else {
    items.push({ kind: "dado", text: `Arquétipo atual: ${b.archetype.name} (afinidade ${b.archetype.affinity}%)${b.archetype.secondary ? `; o mais próximo depois dele é ${b.archetype.secondary.name} (${b.archetype.secondary.affinity}%)` : ""}.` });
    const top = [...b.attributes].sort((x, y) => y.score - x.score).slice(0, 2);
    items.push({ kind: "dado", text: `Atributos mais fortes: ${top.map((a) => `${a.label} ${a.score}/100`).join(" e ")}.` });
    for (const g of b.gaps.filter((x) => x.status === "below").sort((x, y) => y.gap - x.gap).slice(0, 2))
      items.push({ kind: "sugestao", text: `${g.label}: ${g.current} de ${g.target} pontos na build desejada. Pequenas ações frequentes dessa área fecham a distância.` });
    const d30 = b.comparisons.d30 as Record<string, number>;
    const deltas = b.attributes.map((a) => ({ label: a.label, d: a.score - (d30[a.key] ?? 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    if (deltas[0] && deltas[0].d !== 0) items.push({ kind: "inferencia", text: `Maior mudança em 30 dias: ${deltas[0].label} (${deltas[0].d > 0 ? "+" : ""}${deltas[0].d} pontos).` });
  }
  const near = ach.filter((a) => !a.unlockedAt && a.progress >= 70).sort((x, y) => y.progress - x.progress).slice(0, 2);
  for (const a of near) items.push({ kind: "dado", text: `Conquista perto: ${a.title} (${a.progress}%).` });
  return { items, insufficient: !b.sufficiency.enough };
}

async function treasureFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getTreasureHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [{ kind: "dado", text: `Saldo: ${i.coins} moedas e ${i.gems} gemas; ${i.available} recompensa(s) disponível(is); ${i.redemptions} resgate(s) no total.` }];
  items.push({ kind: "dado", text: `Últimos 30 dias: +${i.earned30} ganhas, −${i.spent30} gastas.` });
  for (const g of h.goals.slice(0, 2)) items.push({ kind: "dado", text: `Meta ${g.title}: ${g.current}/${g.target} ${g.unit}${g.eta ? ` · ~${g.eta} dia(s) no ritmo atual` : ""}.` });
  for (const t of h.tips) items.push({ kind: t.kind, text: t.text });
  return { items, insufficient: h.goalOptions.rewards.length === 0 };
}

async function habitsFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getHabitsHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [{ kind: "dado", text: `${i.active} hábito(s) ativo(s), ${i.doneToday}/${i.scheduledToday} do ritual de hoje; consistência de 30 dias: ${i.consistency30 ?? "—"}%.` }];
  items.push({ kind: "dado", text: `Maior sequência ativa: ${i.currentStreak} dia(s); melhor já registrada: ${i.bestStreak}.` });
  if (i.consistencyDeltaPts != null) items.push({ kind: "inferencia", text: `A consistência ${i.consistencyDeltaPts >= 0 ? "subiu" : "caiu"} ${Math.abs(i.consistencyDeltaPts)} ponto(s) em relação aos 30 dias anteriores.` });
  const peak = h.hoursUtc.indexOf(Math.max(...h.hoursUtc));
  if (Math.max(...h.hoursUtc) >= 5) items.push({ kind: "inferencia", text: `Seus registros de hábito acontecem mais por volta das ${peak}h (UTC).` });
  for (const c of h.habits.filter((x) => !x.paused && x.consistency30.expected >= 5 && (x.consistency30.pct ?? 100) < 40).slice(0, 2))
    items.push({ kind: "sugestao", text: `${c.name}: ${c.consistency30.pct}% em 30 dias. Considere reduzir a frequência ou a meta (${c.target}${c.unit ? ` ${c.unit}` : ""}) — você decide.` });
  if (i.active > 8) items.push({ kind: "sugestao", text: "Rotina com muitos hábitos ativos: pausar os menos importantes costuma ajudar a manter os essenciais." });
  return { items, insufficient: i.consistency30 == null };
}

async function libraryFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getLibraryHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [{ kind: "dado", text: `${i.total} livro(s), ${i.reading} em leitura, ${i.completed} concluído(s); ${i.pagesRead} página(s) registradas em sessões (${i.uniquePages} inéditas).` }];
  if (h.featured) items.push({ kind: "dado", text: `Leitura atual: ${h.featured.title}, página ${h.featured.currentPage}${h.featured.totalPages ? ` de ${h.featured.totalPages}` : ""}.` });
  items.push({ kind: "dado", text: `Sequência de leitura: ${i.streak} dia(s); ${h.desk.readDays30} dia(s) com leitura nos últimos 30.` });
  if (i.yearBooks) items.push({ kind: "inferencia", text: `Meta anual: ${i.yearBooks.done}/${i.yearBooks.target} livros — ritmo ${i.yearBooks.status.replace("_", " ")}.` });
  if (i.reading > 3) items.push({ kind: "sugestao", text: `${i.reading} livros em leitura ao mesmo tempo: concentrar em um ou dois costuma acelerar as conclusões.` });
  if (!h.desk.dailyGoal && h.desk.readDays30 > 0) items.push({ kind: "sugestao", text: `Uma meta diária pequena (ex.: ${Math.max(5, Math.round(i.pagesRead / Math.max(1, h.desk.readDays30) / 2))} páginas) tende a ser sustentável com o seu ritmo atual.` });
  if (h.learnings.length) items.push({ kind: "sugestao", text: `Você tem ${h.learnings.length} aprendizado(s) registrado(s): transformar em flashcards ajuda a revisar.` });
  return { items, insufficient: i.total === 0 };
}

async function adminFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getAdminHub(db, ownerId);
  const i = h.indicators;
  const items: AdvisorItem[] = [{ kind: "dado", text: `${i.total} registro(s): ${i.overdue} atrasado(s), ${i.soon} perto do prazo, ${i.withFile} com arquivo.` }];
  if (h.order) items.push({ kind: "dado", text: `Índice de Ordem ${h.order.score}/100 (prazo ${h.order.parts.onTimePct}%, lembretes ${h.order.parts.remindersPct}%, completude ${h.order.parts.completePct}%).` });
  for (const c of h.critical.slice(0, 3)) items.push({ kind: "dado", text: `Prioritário: ${c.title} (${c.urgency === "overdue" ? `${Math.abs(c.daysLeft ?? 0)} dia(s) de atraso` : `vence em ${c.daysLeft} dia(s)`}).` });
  for (const t of h.subscriptions.totals) items.push({ kind: "dado", text: `Assinaturas (dinheiro real, ${t.currency}): ${t.count} item(ns), ~${t.monthly.toFixed(2)}/mês. Não são moedas do LifeOS.` });
  if (h.subscriptions.items.length >= 3) items.push({ kind: "sugestao", text: "Revise as assinaturas: alguma deixou de ser usada? Cancelar é uma ação sua, fora do LifeOS." });
  if (h.missingFiles.length) items.push({ kind: "sugestao", text: `${h.missingFiles.length} documento(s)/conta(s) sem comprovante anexado.` });
  return { items, insufficient: i.total === 0 };
}

async function todayFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getTodayHub(db, ownerId);
  const items: AdvisorItem[] = [];
  items.push({ kind: "dado", text: `Hoje: ${h.indicators.missionsDone} missão(ões) concluída(s), ${h.missions.length} pendente(s); hábitos ${h.habits.done}/${h.habits.total}; ${h.indicators.focusMinutes} min de foco; ${h.profile.xpToday} XP.` });
  if (h.main) items.push({ kind: "dado", text: `Missão principal (fixada por você): ${h.main.title}${h.main.subtasks.total ? ` (${h.main.subtasks.done}/${h.main.subtasks.total} subtarefas)` : ""}.` });
  if (h.focusNow.length) items.push({ kind: "dado", text: `Foco agora (ranking por prazo e prioridade): ${h.focusNow.map((m) => m.title).join(", ")}.` });
  const overdue = h.missions.filter((m) => m.overdue);
  if (overdue.length) items.push({ kind: "dado", text: `${overdue.length} missão(ões) atrasada(s): ${overdue.slice(0, 3).map((m) => m.title).join(", ")}.` });
  for (const c of h.conflicts.slice(0, 2)) items.push({ kind: "dado", text: `Conflito na agenda: ${c.a} e ${c.b} se sobrepõem em ${c.minutes} min.` });
  const pct = h.indicators.prioritiesTotal ? Math.round((h.indicators.prioritiesDone / h.indicators.prioritiesTotal) * 100) : null;
  if (pct != null) items.push({ kind: "inferencia", text: `${pct}% das missões previstas para hoje já foram concluídas.` });
  const na = nextBestAction(h);
  items.push({ kind: "sugestao", text: na.text });
  const now = new Date();
  const blocks = focusBlocks(h, now.getHours() * 60 + now.getMinutes(), 2);
  if (blocks.length) items.push({ kind: "sugestao", text: `Janelas livres para foco: ${blocks.map((b) => `${b.start}–${b.end}`).join(", ")} (horário do servidor).` });
  return { items, insufficient: !h.missions.length && !h.habits.total && !h.agenda.length };
}

async function contractsFacts(db: Client, ownerId: string): Promise<{ items: AdvisorItem[]; insufficient: boolean }> {
  const h = await getPactGuildHub(db, ownerId);
  const items: AdvisorItem[] = [];
  const i = h.indicators;
  items.push({ kind: "dado", text: `${i.active} contrato(s) em andamento, ${i.paused} pausado(s) e ${i.readyToSeal} pronto(s) para selar; ${i.openTasks} obrigação(ões) aberta(s).` });
  items.push({ kind: "dado", text: `Reputação da Guilda: ${h.reputation.title} (${h.reputation.points} pontos); ${i.seals} selo(s) conquistado(s).` });
  for (const c of h.contracts.filter((x) => x.risk && (x.risk.level === "alto" || x.risk.level === "moderado")).slice(0, 3)) {
    items.push({ kind: "dado", text: `Risco ${c.risk!.level} em “${c.title}”: ${c.risk!.reasons[0]}` });
  }
  const ready = h.contracts.find((c) => c.phase === "pronto_selar");
  if (ready) items.push({ kind: "sugestao", text: `Selar “${ready.title}” — todas as obrigações já foram concluídas.` });
  const high = h.contracts.find((c) => c.risk?.level === "alto");
  if (high) items.push({ kind: "inferencia", text: `No ritmo atual, “${high.title}” não deve caber no prazo — vale replanejar ou reduzir o escopo.` });
  const next = h.contracts.find((c) => (c.phase === "ativo" || c.phase === "em_andamento") && c.nextAction);
  if (next) items.push({ kind: "sugestao", text: `Próximo passo em “${next.title}”: ${next.nextAction}` });
  return { items, insufficient: h.contracts.length === 0 };
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
  const loaders: Record<AdvisorModule, () => Promise<{ items: AdvisorItem[]; insufficient: boolean }>> = {
    bank: () => bankFacts(db, ownerId),
    education: () => educationFacts(db, ownerId, !!opts.research),
    health: () => healthFacts(db, ownerId),
    agenda: () => agendaFacts(db, ownerId),
    council: () => councilFacts(db, ownerId),
    missions: () => missionsFacts(db, ownerId),
    quests: () => questsFacts(db, ownerId),
    diary: () => diaryFacts(db, ownerId),
    lab: () => labFacts(db, ownerId),
    hero: () => heroFacts(db, ownerId),
    treasure: () => treasureFacts(db, ownerId),
    habits: () => habitsFacts(db, ownerId),
    library: () => libraryFacts(db, ownerId),
    admin: () => adminFacts(db, ownerId),
    today: () => todayFacts(db, ownerId),
    contracts: () => contractsFacts(db, ownerId),
  };
  const base = await loaders[module]();
  const fallback: AdvisorAnswer = { ai: false, items: base.items, disclaimer: DISCLAIMER[module], insufficient: base.insufficient };
  if (!opts.useAi) return fallback;
  const config = await getGeminiConfig();
  if (!config) return fallback;
  const facts = base.items.map((x) => `- [${x.kind}] ${x.text}`).join("\n");
  const rules = {
    bank: "As moedas são virtuais (jogo). Não fale de dinheiro real, não prometa rendimentos e não invente números.",
    education: "Nunca invente referências bibliográficas, autores, artigos, resultados científicos ou evidências. Se pedirem fontes, diga para consultar a biblioteca/orientador.",
    health: "Não diagnostique nem infira doenças ou condições psicológicas. Recomendações prudentes e gerais. Nunca incentive excesso de água, restrição de sono ou treino excessivo.",
    agenda: "Não mova compromissos: apenas sugira horários e justifique com os fatos.",
    council: "Justifique cada recomendação com os números dados. Não presuma disponibilidade que não esteja nos fatos.",
    missions: "Não invente prazos ou estimativas; baseie a prioridade nos fatos.",
    quests: "Não invente quests, recompensas, participantes ou rankings.",
    diary: "Você não tem acesso ao texto das crônicas, só a estatísticas. Não interprete sentimentos nem faça diagnósticos; não invente acontecimentos.",
    lab: "Diferencie correlação de causalidade, aponte amostras pequenas e fatores de confusão. Nunca diga que algo foi comprovado.",
    hero: "Não faça avaliação de personalidade; baseie-se nos atributos e números dados. Não crie metas nem tarefas, apenas sugira.",
    treasure: "Não invente recompensas, preços ou saldos. Não incentive gastar todas as moedas. Nunca fale de dinheiro real.",
    habits: "Justifique com consistência e horários reais. Não altere hábitos; sugira ajustes de frequência ou simplificação.",
    library: "Não invente livros, autores, trechos ou conteúdo de obras. Use apenas títulos e números dados.",
    admin: "Diferencie valores em dinheiro real (R$) das moedas virtuais. Não recomende pagamentos ou cancelamentos automáticos.",
    today: "Baseie a ordem do dia em prazos, prioridades e horários dados. Não invente compromissos nem mova eventos; apenas sugira.",
    contracts: "Use apenas prazos, etapas, riscos e selos dados. Não invente probabilidades. Nunca proponha selar, cancelar ou alterar sem a confirmação do usuário.",
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
