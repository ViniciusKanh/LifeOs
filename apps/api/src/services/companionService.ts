import type { Client } from "@libsql/client";
import { ACTIVITY_FAMILY, activeDays, atMs, collectActivity, type ActivityHit } from "./activitySignals.js";
import { award } from "./gamificationService.js";
import { localDayOfStored, shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { grantCollectionItem } from "./adventureCollection.js";
import { normalizeStoredUtc } from "./healthService.js";
import { nanoid } from "nanoid";

/**
 * Companheiro virtual. Tudo que importa é derivado de dados persistidos:
 * - XP do companheiro = dias ativos + diversidade semanal + cuidados (com teto)
 *   + conquistas desde a adoção; o maior valor já visto fica em peak_xp,
 *   então a evolução nunca regride;
 * - status (fome, energia...) = tempo desde o último cuidado daquele tipo, com
 *   piso: o companheiro nunca morre nem fica em estado irreversível;
 * - traços visuais = proporção das famílias de atividade dos últimos 30 dias.
 */

export class CompanionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const CARE_ACTIONS = ["alimentar", "hidratar", "brincar", "descansar", "carinho"] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

/** Intervalo mínimo entre cuidados iguais (minutos). */
export const CARE_COOLDOWN_MIN: Record<CareAction, number> = { alimentar: 240, hidratar: 180, brincar: 120, descansar: 360, carinho: 30 };
const CARE_XP_PER_DAY = 4; // ações com XP para o herói por dia
const CARE_PET_XP = 4;
const CARE_PET_XP_DAILY_CAP = 5;

export const STAGES = [
  { key: "filhote", name: "Filhote", minXp: 0, benefits: ["Acompanha você pela Vila"] },
  { key: "aventureiro", name: "Aventureiro", minXp: 250, benefits: ["Desbloqueia o lenço", "Reage às suas missões"] },
  { key: "explorador", name: "Explorador", minXp: 800, benefits: ["Acessórios de rotina liberados", "Celebra conquistas na Vila"] },
  { key: "guardiao", name: "Guardião", minXp: 1800, benefits: ["Capa do Guardião", "Acompanha a Raid na Arena"] },
  { key: "lendario", name: "Lendário", minXp: 3500, benefits: ["Coroa lendária", "Aura na Vila"] },
] as const;

export const ACCESSORIES = [
  { key: "coleira", name: "Coleira de couro", slot: "pescoco", rule: { stage: 0 } },
  { key: "lenco", name: "Lenço de aventureiro", slot: "pescoco", rule: { stage: 1 } },
  { key: "oculos", name: "Óculos de Estudo", slot: "cabeca", rule: { trait: "estudioso" } },
  { key: "headset", name: "Headset Dev", slot: "cabeca", rule: { trait: "dev" } },
  { key: "faixa", name: "Faixa de Treino", slot: "cabeca", rule: { trait: "atleta" } },
  { key: "mochila", name: "Mochila de Viagem", slot: "costas", rule: { trait: "explorador" } },
  { key: "capa", name: "Capa do Guardião", slot: "costas", rule: { stage: 3 } },
  { key: "coroa", name: "Coroa Lendária", slot: "cabeca", rule: { stage: 4 } },
] as const;
export type AccessoryKey = (typeof ACCESSORIES)[number]["key"];
export type Slot = "pescoco" | "cabeca" | "costas";

export const TRAITS = [
  { key: "estudioso", name: "Óculos de Estudo", hint: "Foco e aprendizado", families: ["leitura", "estudo"], min: 6 },
  { key: "dev", name: "Teclado Dev", hint: "Produtividade em código", families: ["codigo"], min: 8 },
  { key: "atleta", name: "Físico Atlético", hint: "Energia e resistência", families: ["treinos"], min: 4 },
  { key: "explorador", name: "Alma Exploradora", hint: "Lugares descobertos", families: ["exploracao"], min: 3 },
] as const;
export type TraitKey = (typeof TRAITS)[number]["key"];

/** Acessório liberado por estágio ou por traço ativo da rotina. */
export function accessoryUnlocked(rule: { stage: number } | { trait: string }, stageIndex: number, traits: Array<{ key: string; active: boolean }>): boolean {
  if ("stage" in rule) return stageIndex >= rule.stage;
  return Boolean(traits.find((t) => t.key === rule.trait)?.active);
}

export function stageForXp(xp: number) {
  let idx = 0;
  STAGES.forEach((s, i) => {
    if (xp >= s.minXp) idx = i;
  });
  const next = STAGES[idx + 1] ?? null;
  return { index: idx, stage: STAGES[idx]!, next, progressPct: next ? Math.round(((xp - STAGES[idx]!.minXp) / (next.minXp - STAGES[idx]!.minXp)) * 100) : 100 };
}

export function traitsFromHits(hits: ActivityHit[]) {
  const count: Record<string, number> = {};
  for (const h of hits) count[ACTIVITY_FAMILY[h.kind]] = (count[ACTIVITY_FAMILY[h.kind]] ?? 0) + 1;
  return TRAITS.map((t) => {
    const n = t.families.reduce((a, f) => a + (count[f] ?? 0), 0);
    return { key: t.key as TraitKey, name: t.name, hint: t.hint, count: n, active: n >= t.min, strength: Math.min(100, Math.round((n / (t.min * 3)) * 100)) };
  });
}

/** XP do companheiro: dias ativos, diversidade semanal, cuidados (teto diário) e conquistas. */
export function computeCompanionXp(hits: ActivityHit[], careDays: Map<string, number>, achievementsSince: number): number {
  const days = activeDays(hits);
  const weeks = new Map<string, Set<string>>();
  for (const h of hits) {
    const dow = new Date(`${h.day}T12:00:00Z`).getUTCDay();
    const wk = shiftDayKey(h.day, -((dow + 6) % 7));
    weeks.set(wk, (weeks.get(wk) ?? new Set()).add(ACTIVITY_FAMILY[h.kind]));
  }
  const diverseWeeks = [...weeks.values()].filter((f) => f.size >= 3).length;
  let care = 0;
  for (const n of careDays.values()) care += Math.min(n, CARE_PET_XP_DAILY_CAP) * CARE_PET_XP;
  return days.size * 15 + diverseWeeks * 25 + care + achievementsSince * 10;
}

function hoursSince(iso: string | null, now: number): number {
  if (!iso) return 999;
  return Math.max(0, (now - Date.parse(normalizeStoredUtc(iso))) / 3_600_000);
}

function localHour(tz: string, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)) % 24;
  } catch {
    return now.getUTCHours();
  }
}

export type Mood = "feliz" | "focado" | "cansado" | "faminto" | "entediado" | "descansando";

/** Status 0–100 com piso: ausência deixa o companheiro abatido, nunca doente ou morto. */
export function computeStatus(lastCare: Partial<Record<CareAction, string>>, opts: { now: Date; tz: string; activeToday: boolean; lastActivity: ActivityHit | null; careDays7: number; activeDays7: number }) {
  const now = opts.now.getTime();
  const clamp = (v: number, min: number) => Math.round(Math.max(min, Math.min(100, v)));
  const hour = localHour(opts.tz, opts.now);
  const night = hour >= 23 || hour < 6;
  const fome = clamp(100 - hoursSince(lastCare.alimentar ?? null, now) * 4, 10);
  const hidratacao = clamp(100 - hoursSince(lastCare.hidratar ?? null, now) * 5, 10);
  const energia = clamp(100 - hoursSince(lastCare.descansar ?? null, now) * 2.5 - (night ? 25 : 0), 15);
  const diversao = 100 - Math.min(hoursSince(lastCare.brincar ?? null, now), hoursSince(lastCare.carinho ?? null, now) * 1.5) * 3.5;
  const bemEstar = clamp(diversao * 0.7 + (opts.activeToday ? 30 : 10), 15);
  const vinculo = clamp((opts.careDays7 / 7) * 60 + (opts.activeDays7 / 7) * 40, 5);

  let mood: Mood = "feliz";
  const recentFocus =
    opts.lastActivity &&
    ["codigo", "estudo", "leitura"].includes(ACTIVITY_FAMILY[opts.lastActivity.kind]) &&
    now - atMs(opts.lastActivity.at) < 90 * 60_000;
  if (hoursSince(lastCare.descansar ?? null, now) < 2) mood = "descansando";
  else if (recentFocus) mood = "focado";
  else if (night || energia < 35) mood = "cansado";
  else if (fome < 35 || hidratacao < 30) mood = "faminto";
  else if (bemEstar < 40) mood = "entediado";
  return { fome, hidratacao, energia, bemEstar, vinculo, mood };
}

/* ─────────────────────────── Persistência ─────────────────────────── */

async function loadRow(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT * FROM companions WHERE owner_id = ?", args: [ownerId] });
  return r.rows[0] as Record<string, unknown> | undefined;
}

export async function adoptCompanion(db: Client, ownerId: string, input: { name: string; species: string; color: string }) {
  const existing = await loadRow(db, ownerId);
  if (existing) {
    await db.execute({ sql: "UPDATE companions SET name = ?, color = ?, updated_at = datetime('now') WHERE owner_id = ?", args: [input.name, input.color, ownerId] });
  } else {
    await db.execute({ sql: "INSERT INTO companions (owner_id, name, species, color) VALUES (?, ?, ?, ?)", args: [ownerId, input.name, input.species, input.color] });
    await recordWorldEvent(db, ownerId, { type: "pet_created", title: `${input.name} chegou à Vila`, detail: "Um novo companheiro de jornada." });
    await grantCollectionItem(db, ownerId, "petacc:coleira", "companion", "coleira", "Coleira de couro");
  }
  return getCompanion(db, ownerId);
}

function parseEquipped(raw: unknown): Partial<Record<Slot, AccessoryKey | "auto" | null>> {
  try {
    return JSON.parse(String(raw ?? "{}"));
  } catch {
    return {};
  }
}

export async function getCompanion(db: Client, ownerId: string, now = new Date()) {
  const row = await loadRow(db, ownerId);
  const { tz, today } = await userDayContext(db, ownerId, now);
  if (!row) return { adopted: false as const, today, stages: STAGES, careActions: CARE_ACTIONS };

  // Dia local da adoção (adopted_at é UTC; à noite em São Paulo o dia UTC já virou).
  const adoptedLocal = localDayOfStored(String(row.adopted_at), tz);
  const adoptedDay = adoptedLocal > today ? today : adoptedLocal;
  // Janela de cálculo: desde a adoção, limitada a 365 dias (o pico guardado preserva o restante).
  const from = adoptedDay > shiftDayKey(today, -365) ? adoptedDay : shiftDayKey(today, -365);
  const [hits, care, achievements] = await Promise.all([
    collectActivity(db, ownerId, tz, from, today),
    db.execute({ sql: "SELECT action, day_key, created_at FROM companion_care WHERE owner_id = ? AND day_key >= ? ORDER BY created_at DESC", args: [ownerId, from] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM user_achievements WHERE owner_id = ? AND unlocked_at >= ?", args: [ownerId, String(row.adopted_at)] }).catch(() => ({ rows: [{ n: 0 }] })),
  ]);

  const careDays = new Map<string, number>();
  const lastCare: Partial<Record<CareAction, string>> = {};
  for (const c of care.rows) {
    careDays.set(String(c.day_key), (careDays.get(String(c.day_key)) ?? 0) + 1);
    const a = String(c.action) as CareAction;
    if (!lastCare[a]) lastCare[a] = String(c.created_at);
  }
  const computed = computeCompanionXp(hits, careDays, Number(achievements.rows[0]?.n ?? 0));
  const peak = Number(row.peak_xp ?? 0);
  const xp = Math.max(peak, computed);
  const st = stageForXp(xp);
  if (xp > peak) {
    const prevStage = stageForXp(peak).index;
    await db.execute({ sql: "UPDATE companions SET peak_xp = ? WHERE owner_id = ? AND peak_xp < ?", args: [xp, ownerId, xp] });
    if (st.index > prevStage) await onEvolve(db, ownerId, String(row.name), st.index, today);
  }

  const last30 = hits.filter((h) => h.day >= shiftDayKey(today, -29));
  const traits = traitsFromHits(last30);
  const last7Days = new Set(hits.filter((h) => h.day >= shiftDayKey(today, -6)).map((h) => h.day));
  const careDays7 = [...careDays.keys()].filter((d) => d >= shiftDayKey(today, -6)).length;
  const status = computeStatus(lastCare, {
    now,
    tz,
    activeToday: hits.some((h) => h.day === today),
    lastActivity: hits[hits.length - 1] ?? null,
    careDays7,
    activeDays7: last7Days.size,
  });

  const unlocked = ACCESSORIES.filter((a) => accessoryUnlocked(a.rule, st.index, traits)).map((a) => a.key);
  // Acessórios de rotina entram na Coleção quando desbloqueados (uma vez).
  const owned = await db.execute({ sql: "SELECT item_key FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire' AND item_key LIKE 'petacc:%'", args: [ownerId] });
  const ownedKeys = new Set(owned.rows.map((r) => String(r.item_key)));
  for (const key of unlocked) {
    if (ownedKeys.has(`petacc:${key}`)) continue;
    const acc = ACCESSORIES.find((a) => a.key === key)!;
    await grantCollectionItem(db, ownerId, `petacc:${key}`, "companion", key, acc.name);
  }
  const equippedRaw = parseEquipped(row.equipped_json);
  const appearance = resolveAppearance(equippedRaw, unlocked, traits);

  const careToday = care.rows.filter((c) => String(c.day_key) === today).map((c) => String(c.action));
  const cooldowns = Object.fromEntries(
    CARE_ACTIONS.map((a) => {
      const last = lastCare[a];
      const readyAt = last ? Date.parse(normalizeStoredUtc(last)) + CARE_COOLDOWN_MIN[a] * 60_000 : 0;
      return [a, readyAt > now.getTime() ? new Date(readyAt).toISOString() : null];
    })
  );

  return {
    adopted: true as const,
    today,
    stages: STAGES,
    careActions: CARE_ACTIONS,
    companion: {
      name: String(row.name),
      species: String(row.species),
      color: String(row.color),
      showInWorld: Number(row.show_in_world) === 1,
      adoptedAt: String(row.adopted_at),
      xp,
      stage: { index: st.index, key: st.stage.key, name: st.stage.name, benefits: st.stage.benefits, next: st.next ? { name: st.next.name, minXp: st.next.minXp } : null, progressPct: st.progressPct },
      status,
      traits,
      accessories: ACCESSORIES.map((a) => ({ key: a.key, name: a.name, slot: a.slot, unlocked: unlocked.includes(a.key) })),
      equipped: equippedRaw,
      appearance,
      care: { today: careToday, cooldowns, xpActionsLeft: Math.max(0, CARE_XP_PER_DAY - new Set(careToday).size) },
      activeDays: activeDays(hits).size,
    },
    recent: hits.slice(-6).reverse().map((h) => ({ kind: h.kind, family: ACTIVITY_FAMILY[h.kind], label: h.label, at: h.at })),
    careLog: care.rows.slice(0, 8).map((c) => ({ action: String(c.action), at: String(c.created_at) })),
  };
}

/** Aparência final por slot: escolha manual, ou "auto" = traço mais forte desbloqueado. */
export function resolveAppearance(equipped: Partial<Record<Slot, AccessoryKey | "auto" | null>>, unlocked: string[], traits: ReturnType<typeof traitsFromHits>) {
  const out: Record<Slot, AccessoryKey | null> = { pescoco: null, cabeca: null, costas: null };
  const strongest = [...traits].filter((t) => t.active).sort((a, b) => b.count - a.count);
  for (const slot of ["pescoco", "cabeca", "costas"] as Slot[]) {
    // Ausente = automático; null = espaço vazio por escolha do usuário.
    const choice = equipped[slot] === undefined ? "auto" : equipped[slot];
    if (choice === null) continue;
    if (choice !== "auto") {
      if (unlocked.includes(choice)) out[slot] = choice;
      continue;
    }
    const pool = ACCESSORIES.filter((a) => a.slot === slot && unlocked.includes(a.key));
    const byTrait = strongest.map((t) => pool.find((a) => "trait" in a.rule && a.rule.trait === t.key)).find(Boolean);
    out[slot] = (byTrait ?? [...pool].reverse().find((a) => "stage" in a.rule) ?? null)?.key ?? null;
  }
  return out;
}

async function onEvolve(db: Client, ownerId: string, name: string, stageIndex: number, today: string) {
  const stage = STAGES[stageIndex]!;
  await recordWorldEvent(db, ownerId, { type: "pet_evolved", title: `${name} evoluiu para ${stage.name}!`, detail: stage.benefits.join(" · ") });
  await award(db, ownerId, { sourceType: "companion", sourceId: `stage:${stage.key}`, eventType: "evolved", xp: 40 + stageIndex * 20, coins: 10 + stageIndex * 5, label: `Companheiro evoluiu: ${stage.name}` }, today);
}

export async function careFor(db: Client, ownerId: string, action: CareAction, now = new Date()) {
  const row = await loadRow(db, ownerId);
  if (!row) throw new CompanionError(404, "Adote um companheiro primeiro.");
  const last = await db.execute({ sql: "SELECT created_at FROM companion_care WHERE owner_id = ? AND action = ? ORDER BY created_at DESC LIMIT 1", args: [ownerId, action] });
  const lastAt = last.rows[0]?.created_at;
  if (lastAt) {
    const ready = Date.parse(normalizeStoredUtc(String(lastAt))) + CARE_COOLDOWN_MIN[action] * 60_000;
    if (ready > now.getTime()) {
      const min = Math.ceil((ready - now.getTime()) / 60_000);
      throw new CompanionError(429, `${String(row.name)} ainda está satisfeito. Tente de novo em ${min >= 60 ? `${Math.ceil(min / 60)} h` : `${min} min`}.`);
    }
  }
  const { today } = await userDayContext(db, ownerId, now);
  await db.execute({ sql: "INSERT INTO companion_care (id, owner_id, action, day_key, created_at) VALUES (?, ?, ?, ?, ?)", args: [nanoid(), ownerId, action, today, now.toISOString()] });
  // XP para o herói só no primeiro cuidado de cada tipo no dia (até 4 por dia).
  const typesToday = await db.execute({ sql: "SELECT COUNT(DISTINCT action) AS n FROM companion_care WHERE owner_id = ? AND day_key = ?", args: [ownerId, today] });
  if (Number(typesToday.rows[0]?.n ?? 0) <= CARE_XP_PER_DAY) {
    await award(db, ownerId, { sourceType: "companion", sourceId: `${today}:${action}`, eventType: "care", xp: 3, coins: 0, label: `Cuidou do companheiro (${action})` }, today);
  }
  return getCompanion(db, ownerId, now);
}

export async function updateCompanion(db: Client, ownerId: string, patch: { name?: string; color?: string; showInWorld?: boolean; equipped?: Partial<Record<Slot, AccessoryKey | "auto" | null>> }) {
  const row = await loadRow(db, ownerId);
  if (!row) throw new CompanionError(404, "Adote um companheiro primeiro.");
  const equipped = { ...parseEquipped(row.equipped_json), ...(patch.equipped ?? {}) };
  for (const [slot, key] of Object.entries(patch.equipped ?? {})) {
    if (key && key !== "auto" && ACCESSORIES.find((a) => a.key === key)?.slot !== slot) throw new CompanionError(400, "Esse acessório não serve nesse espaço.");
  }
  await db.execute({
    sql: "UPDATE companions SET name = ?, color = ?, show_in_world = ?, equipped_json = ?, updated_at = datetime('now') WHERE owner_id = ?",
    args: [patch.name ?? String(row.name), patch.color ?? String(row.color), patch.showInWorld === undefined ? Number(row.show_in_world) : patch.showInWorld ? 1 : 0, JSON.stringify(equipped), ownerId],
  });
  return getCompanion(db, ownerId);
}

/** Visual para a Vila: leve (estágio pelo pico gravado, traços dos últimos 30 dias). */
export async function companionWorldLook(db: Client, ownerId: string, now = new Date()) {
  const row = await loadRow(db, ownerId);
  if (!row || Number(row.show_in_world) !== 1) return null;
  const { tz, today } = await userDayContext(db, ownerId, now);
  const [hits, care] = await Promise.all([
    collectActivity(db, ownerId, tz, shiftDayKey(today, -29), today),
    db.execute({ sql: "SELECT action, MAX(created_at) AS at FROM companion_care WHERE owner_id = ? GROUP BY action", args: [ownerId] }),
  ]);
  const lastCare: Partial<Record<CareAction, string>> = {};
  for (const c of care.rows) lastCare[String(c.action) as CareAction] = String(c.at);
  const traits = traitsFromHits(hits);
  const st = stageForXp(Number(row.peak_xp ?? 0));
  const unlocked = ACCESSORIES.filter((a) => accessoryUnlocked(a.rule, st.index, traits)).map((a) => a.key);
  const status = computeStatus(lastCare, { now, tz, activeToday: hits.some((h) => h.day === today), lastActivity: hits[hits.length - 1] ?? null, careDays7: 0, activeDays7: 0 });
  return { name: String(row.name), color: String(row.color), stage: st.index, mood: status.mood, appearance: resolveAppearance(parseEquipped(row.equipped_json), unlocked, traits) };
}
