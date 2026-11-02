import type { Client } from "@libsql/client";
import { GAMIFICATION_RULES } from "../config/gamification.js";
import { award, todayKeyFor } from "./gamificationService.js";
import { listLifeAdminItems, daysBetween, type LifeAdminItem } from "./lifeAdminService.js";
import { mondayKey, notifyFromAutomation, readAutomationState, writeAutomationState } from "./automationService.js";
import { shiftDayKey } from "./localDayService.js";

/**
 * Administração da Vida 3.0 — O Reino da Organização (camada derivada).
 *
 * Fonte única: life_admin_items + life_admin_history. Valores em dinheiro
 * real (R$ etc.) são só informativos e NUNCA se misturam às moedas virtuais.
 * Nenhuma automação paga, cancela ou contrata nada fora do LifeOS.
 */

type Outcome = { status: "ok" | "skipped" | "error"; summary: string };

export class AdminHubError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Pesos públicos do Índice de Ordem (mostrados na UI). */
export const ORDER_WEIGHTS = { onTime: 50, reminders: 20, completeness: 30 } as const;

/** Item "completo": documento com arquivo; conta/assinatura com valor; demais com data definida. */
export function isComplete(i: Pick<LifeAdminItem, "kind" | "category" | "hasFile" | "amount" | "dueDate">) {
  if (i.kind === "documento") return i.hasFile;
  if (i.kind === "conta" || i.category === "assinaturas") return i.amount != null;
  return i.dueDate != null;
}

/**
 * Índice de Ordem (0–100). Sem registros, não há índice — a ausência de dados
 * não é tratada como "tudo organizado".
 */
export function orderIndex(items: Array<Pick<LifeAdminItem, "kind" | "category" | "hasFile" | "amount" | "dueDate" | "urgency" | "remindDaysBefore">>) {
  if (!items.length) return null;
  const dated = items.filter((i) => i.dueDate);
  const onTime = dated.length ? dated.filter((i) => i.urgency !== "overdue").length / dated.length : 1;
  const reminders = dated.length ? dated.filter((i) => i.remindDaysBefore > 0).length / dated.length : 0;
  const complete = items.filter(isComplete).length / items.length;
  const score = Math.round(onTime * ORDER_WEIGHTS.onTime + reminders * ORDER_WEIGHTS.reminders + complete * ORDER_WEIGHTS.completeness);
  return { score, parts: { onTimePct: Math.round(onTime * 100), remindersPct: Math.round(reminders * 100), completePct: Math.round(complete * 100) }, basis: { items: items.length, dated: dated.length } };
}

/** Custo mensal previsto de assinaturas recorrentes (valor ÷ meses), agrupado por moeda real. */
export function subscriptionCost(items: Array<{ category: string; amount: number | null; recurrenceMonths: number | null; currency?: string }>) {
  const byCurrency: Record<string, { monthly: number; yearly: number; count: number }> = {};
  for (const i of items) {
    if (i.category !== "assinaturas" || i.amount == null || !i.recurrenceMonths) continue;
    const cur = i.currency || "BRL";
    const c = byCurrency[cur] ?? { monthly: 0, yearly: 0, count: 0 };
    c.monthly += i.amount / i.recurrenceMonths;
    c.yearly += (i.amount * 12) / i.recurrenceMonths;
    c.count++;
    byCurrency[cur] = c;
  }
  return Object.entries(byCurrency).map(([currency, v]) => ({ currency, count: v.count, monthly: Math.round(v.monthly * 100) / 100, yearly: Math.round(v.yearly * 100) / 100 }));
}

/**
 * Dias de tranquilidade: desde o último momento com pendência vencida
 * (histórico resolvido com atraso ou item vencido agora). Começa na criação
 * do primeiro item — sem registros, não há sequência.
 */
export function tranquility(today: string, firstItemDay: string | null, lateResolvedDays: string[], hasOverdueNow: boolean) {
  if (!firstItemDay || hasOverdueNow) return { days: 0, since: null as string | null };
  const lastLate = lateResolvedDays.sort().at(-1) ?? null;
  const since = lastLate && lastLate > firstItemDay ? lastLate : firstItemDay;
  return { days: Math.max(0, daysBetween(since, today)), since };
}

export async function getAdminHub(db: Client, ownerId: string, month?: string) {
  const today = await todayKeyFor(db, ownerId);
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [items, meta, history, claimed] = await Promise.all([
    listLifeAdminItems(db, ownerId, false),
    db.execute({ sql: "SELECT id, priority, currency, created_at FROM life_admin_items WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT h.item_id, h.done_at, h.due_date, i.title, i.kind FROM life_admin_history h JOIN life_admin_items i ON i.id = h.item_id WHERE h.owner_id = ? ORDER BY h.done_at DESC", args: [ownerId] }),
    db.execute({ sql: "SELECT source_id FROM xp_events WHERE owner_id = ? AND source_type = 'life_admin' AND event_type = 'chest'", args: [ownerId] }),
  ]);
  const extra = new Map(meta.rows.map((r) => [String(r.id), { priority: r.priority == null ? null : String(r.priority), currency: String(r.currency ?? "BRL"), createdDay: String(r.created_at).slice(0, 10) }]));
  const enriched = items.map((i) => ({ ...i, priority: extra.get(i.id)?.priority ?? null, currency: extra.get(i.id)?.currency ?? "BRL" }));
  const count = (u: LifeAdminItem["urgency"][]) => enriched.filter((i) => u.includes(i.urgency)).length;
  const critical = enriched.filter((i) => i.urgency === "overdue" || ((i.urgency === "today" || i.urgency === "soon") && i.priority === "Alta"));
  const firstDay = [...extra.values()].map((e) => e.createdDay).sort()[0] ?? null;
  const lateDays = history.rows.filter((h) => h.due_date && String(h.done_at) > String(h.due_date)).map((h) => String(h.done_at));
  const calm = tranquility(today, firstDay, lateDays, count(["overdue"]) > 0);
  const chestRule = GAMIFICATION_RULES.lifeAdmin.chest;
  const chestKey = calm.since ? `tranquility:${calm.since}` : null;

  // Calendário do mês: vencimentos ativos + o que foi resolvido no mês.
  const monthDays = Array.from({ length: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate() }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  const calendar = monthDays.map((d) => ({
    day: d,
    due: enriched.filter((i) => i.dueDate === d).map((i) => ({ id: i.id, title: i.title, kind: i.kind, urgency: i.urgency, amount: i.amount, currency: i.currency })),
    done: history.rows.filter((h) => String(h.done_at) === d).map((h) => ({ itemId: String(h.item_id), title: String(h.title) })),
  }));

  const order = orderIndex(enriched);
  const lateThisWeek = history.rows.filter((h) => String(h.done_at) >= mondayKey(today) && h.due_date && String(h.done_at) > String(h.due_date)).length;
  const dated = enriched.filter((i) => i.dueDate);
  return {
    today,
    month: ym,
    indicators: {
      overdue: count(["overdue"]),
      soon: count(["today", "soon"]),
      ok: count(["ok"]),
      noDate: count(["no_date"]),
      withFile: enriched.filter((i) => i.hasFile).length,
      remindersActive: dated.filter((i) => i.remindDaysBefore > 0).length,
      critical: critical.length,
      nextMaintenance: enriched.filter((i) => i.kind === "manutencao" && i.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0] ?? null,
      total: enriched.length,
    },
    order,
    orderWeights: ORDER_WEIGHTS,
    critical: critical.map((i) => ({ id: i.id, title: i.title, urgency: i.urgency, daysLeft: i.daysLeft, priority: i.priority })),
    upcoming: dated.filter((i) => (i.daysLeft ?? 0) >= 0).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 8),
    calendar,
    subscriptions: { items: enriched.filter((i) => i.category === "assinaturas").map((i) => ({ id: i.id, title: i.title, amount: i.amount, currency: i.currency, recurrenceMonths: i.recurrenceMonths, dueDate: i.dueDate })), totals: subscriptionCost(enriched) },
    missingFiles: enriched.filter((i) => (i.kind === "documento" || i.kind === "conta") && !i.hasFile).map((i) => ({ id: i.id, title: i.title, kind: i.kind })),
    chest: {
      days: calm.days,
      since: calm.since,
      target: chestRule.days,
      xp: chestRule.xp,
      coins: chestRule.coins,
      claimable: !!chestKey && calm.days >= chestRule.days && !claimed.rows.some((r) => String(r.source_id) === chestKey),
      claimedTotal: claimed.rows.length,
    },
    missions: [
      { key: "a_overdue", title: "Resolver as pendências vencidas", current: lateThisWeek, target: Math.max(1, count(["overdue"]) + lateThisWeek), done: count(["overdue"]) === 0 },
      { key: "a_reminders", title: "Lembrete configurado em todos os itens com prazo", current: dated.filter((i) => i.remindDaysBefore > 0).length, target: Math.max(1, dated.length), done: dated.length > 0 && dated.every((i) => i.remindDaysBefore > 0) },
      { key: "a_files", title: "Guardar arquivo nos documentos e contas", current: enriched.filter((i) => (i.kind === "documento" || i.kind === "conta") && i.hasFile).length, target: Math.max(1, enriched.filter((i) => i.kind === "documento" || i.kind === "conta").length), done: enriched.filter((i) => (i.kind === "documento" || i.kind === "conta") && !i.hasFile).length === 0 },
    ],
    recentDone: history.rows.slice(0, 8).map((h) => ({ itemId: String(h.item_id), title: String(h.title), doneAt: String(h.done_at), dueDate: h.due_date == null ? null : String(h.due_date), late: !!h.due_date && String(h.done_at) > String(h.due_date) })),
  };
}

/** Baú de Tranquilidade: resgate único por sequência (chave = início da sequência). */
export async function claimChest(db: Client, ownerId: string) {
  const hub = await getAdminHub(db, ownerId);
  if (!hub.chest.claimable || !hub.chest.since) throw new AdminHubError(`O baú abre com ${hub.chest.target} dias sem pendência vencida (agora: ${hub.chest.days}).`, 409);
  const rule = GAMIFICATION_RULES.lifeAdmin.chest;
  const ok = await award(db, ownerId, { sourceType: "life_admin", sourceId: `tranquility:${hub.chest.since}`, eventType: "chest", xp: rule.xp, coins: rule.coins, label: `Baú de Tranquilidade: ${hub.chest.days} dias em ordem` }, hub.today);
  return { awarded: ok, xp: rule.xp, coins: rule.coins };
}

export async function updateAdminMeta(db: Client, ownerId: string, itemId: string, input: { priority?: "Baixa" | "Média" | "Alta" | null; currency?: string }) {
  const sets: string[] = [];
  const args: Array<string | null> = [];
  if (input.priority !== undefined) (sets.push("priority = ?"), args.push(input.priority));
  if (input.currency) (sets.push("currency = ?"), args.push(input.currency.toUpperCase().slice(0, 3)));
  if (!sets.length) return;
  const r = await db.execute({ sql: `UPDATE life_admin_items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`, args: [...args, itemId, ownerId] });
  if (!r.rowsAffected) throw new AdminHubError("Item não encontrado.", 404);
}

/**
 * Reabrir: desfaz a última resolução (volta a data coberta e reativa o item).
 * O histórico desfeito sai; XP já pago não é pago de novo ao resolver outra vez
 * (a recompensa é idempotente por vencimento coberto).
 */
export async function reopenItem(db: Client, ownerId: string, itemId: string) {
  const h = await db.execute({ sql: "SELECT id, due_date FROM life_admin_history WHERE item_id = ? AND owner_id = ? ORDER BY done_at DESC, created_at DESC LIMIT 1", args: [itemId, ownerId] });
  const last = h.rows[0];
  if (!last) throw new AdminHubError("Este item ainda não foi resolvido.", 409);
  const prev = await db.execute({ sql: "SELECT done_at FROM life_admin_history WHERE item_id = ? AND owner_id = ? AND id != ? ORDER BY done_at DESC LIMIT 1", args: [itemId, ownerId, String(last.id)] });
  await db.batch(
    [
      { sql: "DELETE FROM life_admin_history WHERE id = ? AND owner_id = ?", args: [String(last.id), ownerId] },
      { sql: "UPDATE life_admin_items SET due_date = ?, status = 'active', last_done_at = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?", args: [last.due_date == null ? null : String(last.due_date), prev.rows[0]?.done_at == null ? null : String(prev.rows[0].done_at), itemId, ownerId] },
    ],
    "write",
  );
}

/* ─────────────────────────────── Automações ─────────────────────────────── */

async function notifyOnce(db: Client, ownerId: string, key: string, ids: string[]) {
  const state = await readAutomationState(db, ownerId, "admin", key);
  const sent = new Set(Array.isArray(state.sent) ? (state.sent as string[]) : []);
  const fresh = ids.filter((i) => !sent.has(i));
  await writeAutomationState(db, ownerId, "admin", key, { sent: [...new Set([...sent, ...ids])].slice(-300) });
  return fresh;
}

/** C · Documentos: validade nos próximos 30 dias ou expirada (aviso uma vez por vencimento). */
export async function runDocumentCheck(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const items = (await listLifeAdminItems(db, ownerId)).filter((i) => i.kind === "documento" && i.dueDate && (i.daysLeft ?? 99) <= 30);
  const fresh = await notifyOnce(db, ownerId, "documents", items.map((i) => `${i.id}:${i.dueDate}`));
  if (!fresh.length) return { status: "skipped", summary: "Nenhum documento novo perto da validade." };
  const list = items.filter((i) => fresh.includes(`${i.id}:${i.dueDate}`));
  await notifyFromAutomation(db, ownerId, { eventType: "admin_documents", title: "🪪 Documentos perto da validade", body: list.map((i) => `${i.title} (${(i.daysLeft ?? 0) < 0 ? "expirado" : `${i.daysLeft} dia(s)`})`).join(", "), url: "/administracao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${list.length} documento(s) avisado(s).` };
}

/** D · Assinaturas: custo mensal previsto (dinheiro real, informativo). */
export async function runSubscriptionDigest(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const totals = subscriptionCost((await listLifeAdminItems(db, ownerId)).map((i) => ({ ...i })));
  if (!totals.length) return { status: "skipped", summary: "Nenhuma assinatura com valor e recorrência." };
  const body = totals.map((t) => `${t.count} assinatura(s): ${t.monthly.toLocaleString("pt-BR", { style: "currency", currency: t.currency })}/mês`).join(" · ");
  await notifyFromAutomation(db, ownerId, { eventType: "admin_subscriptions", title: "🔁 Resumo de assinaturas", body: `${body} (valores reais cadastrados por você).`, url: "/administracao?aba=assinaturas", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** F · Arquivos: registros que costumam precisar de comprovante e ainda estão sem anexo. */
export async function runMissingFiles(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const missing = (await listLifeAdminItems(db, ownerId)).filter((i) => (i.kind === "documento" || i.kind === "conta") && !i.hasFile);
  if (!missing.length) return { status: "skipped", summary: "Todos os documentos e contas têm arquivo." };
  await notifyFromAutomation(db, ownerId, { eventType: "admin_files", title: "📎 Registros sem comprovante", body: `${missing.length} registro(s) sem arquivo: ${missing.slice(0, 3).map((i) => i.title).join(", ")}.`, url: "/administracao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${missing.length} registro(s) sem arquivo.` };
}

/** G · Resumo administrativo semanal. */
export async function runAdminSummary(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const hub = await getAdminHub(db, ownerId);
  if (!hub.indicators.total) return { status: "skipped", summary: "Nenhum registro administrativo." };
  const from = shiftDayKey(mondayKey(hub.today), -7);
  const done = hub.recentDone.filter((d) => d.doneAt >= from).length;
  const body = `${hub.indicators.overdue} atrasado(s), ${hub.indicators.soon} próximo(s) do prazo, ${done} resolvido(s) desde a semana passada${hub.order ? ` · Ordem ${hub.order.score}/100` : ""}.`;
  await notifyFromAutomation(db, ownerId, { eventType: "admin_summary", title: "🏰 Resumo do Reino", body, url: "/administracao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: body };
}

/** H · Alertas de risco: atrasados e documentos expirados (uma vez por vencimento). */
export async function runRiskAlerts(db: Client, ownerId: string, config: Record<string, unknown>): Promise<Outcome> {
  const items = (await listLifeAdminItems(db, ownerId)).filter((i) => i.urgency === "overdue");
  const fresh = await notifyOnce(db, ownerId, "risk", items.map((i) => `${i.id}:${i.dueDate}`));
  if (!fresh.length) return { status: "skipped", summary: "Nenhum risco novo." };
  const list = items.filter((i) => fresh.includes(`${i.id}:${i.dueDate}`));
  await notifyFromAutomation(db, ownerId, { eventType: "admin_risk", title: "⚠️ Pendências vencidas", body: list.map((i) => `${i.title} (${Math.abs(i.daysLeft ?? 0)} dia(s) de atraso)`).join(", "), url: "/administracao", inApp: config.inApp !== false, push: config.push === true });
  return { status: "ok", summary: `${list.length} alerta(s) enviado(s).` };
}
