import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { RELICS, TITLES, type Rarity } from "../config/codex.js";
import { EFFECT_RULES, FRAME_ITEMS, INVENTORY_RULES, ITEM_CATALOG, ITEM_SETS, itemDef, type ItemType, type TimedEffect } from "../config/items.js";
import { isTitleUnlocked, syncCodexUnlocks } from "./codexService.js";
import { getLevelHistory } from "./gamificationService.js";
import { useRedemption } from "./rewardsService.js";
import { listActiveEffects, sqlTime, sqlToIso, type ActiveEffectView } from "./itemEffectService.js";

/**
 * Coleção / Inventário. Fontes únicas, sem duplicar dados:
 * - pilhas próprias (consumíveis, ferramentas, materiais) → user_inventory_items;
 * - relíquias e títulos → codex_unlocks (Códex);
 * - cupons de recompensa → reward_redemptions disponíveis (Tesouro);
 * - molduras → conquistas oficiais; emblemas → conjuntos completos;
 * - itens de missão → campanhas ativas.
 * Toda concessão passa pelo ledger inventory_transactions (idempotente).
 */

const REWARD_RARITY: Record<string, Rarity> = { comum: "common", incomum: "uncommon", raro: "rare", epico: "epic", lendario: "legendary" };
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export interface InventoryItemView {
  key: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  art: string;
  /** "items" = public/assets/rpg/items; "rewards" = artes do Tesouro; "codex" = relíquias do Códex (mesma arte). */
  artSet: "items" | "rewards" | "codex";
  quantity: number;
  stackable: boolean;
  maxStack: number;
  effectText: string | null;
  durationText: string | null;
  obtainedBy: string | null;
  origin: { sourceType: string; label: string | null; at: string | null; link: string | null } | null;
  acquiredAt: string | null;
  lastAcquiredAt: string | null;
  useCount: number;
  favorite: boolean;
  archived: boolean;
  equipped: boolean;
  /** Ações válidas para este item (a UI nunca mostra ação inválida). */
  actions: Array<"use" | "equip" | "unequip">;
  /** Item de missão preso a uma campanha ativa: não pode ser descartado/consumido. */
  locked: boolean;
}

/* ------------------------------- Concessões ------------------------------- */

interface Grant {
  itemKey: string;
  qty: number;
  sourceType: string;
  sourceId: string;
  label: string;
  at: string | null;
  /** Pilha própria (atualiza quantidade) ou só registro de aquisição (derivado). */
  stack: boolean;
}

const sqlFrom = (v: unknown) => (typeof v === "string" && v ? (v.includes("T") ? sqlTime(new Date(v)) : v) : null);

/** Lista todas as concessões merecidas a partir de dados reais. */
async function collectGrants(db: Client, ownerId: string): Promise<Grant[]> {
  const G = INVENTORY_RULES.grants;
  const [levels, focus, journal, campaigns, milestones, achievements, codex, redemptions] = await Promise.all([
    getLevelHistory(db, ownerId),
    db.execute({ sql: "SELECT created_at FROM xp_events WHERE owner_id = ? AND source_type = 'focus' ORDER BY created_at ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT created_at FROM xp_events WHERE owner_id = ? AND source_type = 'journal' ORDER BY created_at ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT id, title, completed_at FROM campaigns WHERE owner_id = ? AND status = 'completed' AND completed_at IS NOT NULL ORDER BY completed_at ASC", args: [ownerId] }),
    db.execute({ sql: "SELECT id, title, completed_at FROM campaign_milestones WHERE owner_id = ? AND status = 'completed' AND completed_at IS NOT NULL", args: [ownerId] }),
    db.execute({
      sql: "SELECT a.id, a.title, a.tier, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.owner_id = ? ORDER BY ua.unlocked_at ASC",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT kind, item_id, unlocked_at FROM codex_unlocks WHERE owner_id = ? AND kind IN ('relic', 'title')", args: [ownerId] }),
    db.execute({ sql: "SELECT id, reward_id, reward_name, redeemed_at FROM reward_redemptions WHERE owner_id = ? AND status != 'canceled'", args: [ownerId] }),
  ]);
  const out: Grant[] = [];
  for (const l of levels) {
    const at = sqlFrom(l.reachedAt);
    out.push({ itemKey: "pocao-foco", qty: G.potionPerLevel, sourceType: "level", sourceId: String(l.level), label: `Nível ${l.level} alcançado`, at, stack: true });
    if (l.level % G.scrollEveryLevels === 0) out.push({ itemKey: "pergaminho-disciplina", qty: 1, sourceType: "level", sourceId: String(l.level), label: `Nível ${l.level} alcançado`, at, stack: true });
    if (l.level === G.backpackLevel) out.push({ itemKey: "mochila-explorador", qty: 1, sourceType: "level", sourceId: String(l.level), label: `Nível ${l.level} alcançado`, at, stack: true });
  }
  if (focus.rows.length >= G.lanternFocusSessions) {
    out.push({ itemKey: "lanterna-explorador", qty: 1, sourceType: "focus_count", sourceId: String(G.lanternFocusSessions), label: `${G.lanternFocusSessions} sessões de foco`, at: sqlFrom(focus.rows[G.lanternFocusSessions - 1].created_at), stack: true });
  }
  for (let n = G.penEveryJournalEntries; n <= journal.rows.length; n += G.penEveryJournalEntries) {
    out.push({ itemKey: "pena-escriba", qty: 1, sourceType: "journal_count", sourceId: String(n), label: `${n} crônicas no Diário`, at: sqlFrom(journal.rows[n - 1].created_at), stack: true });
  }
  campaigns.rows.forEach((c, i) => {
    const at = sqlFrom(c.completed_at);
    const label = `Campanha concluída: ${String(c.title)}`;
    out.push({ itemKey: "pergaminho-disciplina", qty: G.scrollsPerCampaign, sourceType: "campaign", sourceId: String(c.id), label, at, stack: true });
    if (i === 0) out.push({ itemKey: "kit-acampamento", qty: 1, sourceType: "campaign", sourceId: String(c.id), label, at, stack: true });
  });
  for (const m of milestones.rows) out.push({ itemKey: "fragmento-cristal", qty: 1, sourceType: "milestone", sourceId: String(m.id), label: `Marco concluído: ${String(m.title)}`, at: sqlFrom(m.completed_at), stack: true });
  for (const a of achievements.rows) out.push({ itemKey: "fragmento-cristal", qty: 1, sourceType: "achievement", sourceId: String(a.id), label: `Conquista: ${String(a.title)}`, at: sqlFrom(a.unlocked_at), stack: true });
  // Molduras: liberadas pela primeira conquista do nível exigido (a de bronze já vem com a conta).
  for (const f of FRAME_ITEMS) {
    const first = f.requires ? achievements.rows.find((a) => String(a.tier) === f.requires) : null;
    if (f.requires && !first) continue;
    out.push({ itemKey: `frame:${f.id}`, qty: 1, sourceType: f.requires ? "achievement" : "profile", sourceId: `frame-${f.id}`, label: `Moldura liberada: ${f.name}`, at: first ? sqlFrom(first.unlocked_at) : null, stack: false });
  }
  // Derivados: só registram a aquisição (a fonte continua sendo o Códex / Tesouro).
  for (const u of codex.rows) {
    const kind = String(u.kind);
    const id = String(u.item_id);
    const name = kind === "relic" ? RELICS.find((r) => r.id === id)?.name : TITLES.find((t) => t.id === id)?.name;
    out.push({ itemKey: `${kind}:${id}`, qty: 1, sourceType: "codex", sourceId: id, label: `${kind === "relic" ? "Relíquia descoberta" : "Título conquistado"}: ${name ?? id}`, at: sqlFrom(u.unlocked_at), stack: false });
  }
  for (const r of redemptions.rows) out.push({ itemKey: `voucher:${String(r.reward_id)}`, qty: 1, sourceType: "treasure", sourceId: String(r.id), label: `Resgatada no Tesouro: ${String(r.reward_name)}`, at: sqlFrom(r.redeemed_at), stack: false });
  return out;
}

async function applyGrants(db: Client, ownerId: string, grants: Grant[]): Promise<void> {
  const done = await db.execute({ sql: "SELECT item_key, source_type, source_id FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire'", args: [ownerId] });
  const seen = new Set(done.rows.map((r) => `${String(r.item_key)}|${String(r.source_type)}|${String(r.source_id)}`));
  const fresh = grants.filter((g) => !seen.has(`${g.itemKey}|${g.sourceType}|${g.sourceId}`));
  if (fresh.length === 0) return;
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const g of fresh) {
    const txId = nanoid();
    const at = g.at ?? sqlTime(new Date());
    stmts.push({
      sql: `INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label, created_at)
            VALUES (?, ?, ?, 'acquire', ?, ?, ?, ?, ?)`,
      args: [txId, ownerId, g.itemKey, g.qty, g.sourceType, g.sourceId, g.label, at],
    });
    if (!g.stack) continue;
    const max = itemDef(g.itemKey)?.maxStack ?? 1;
    // Só soma se ESTA concessão entrou no ledger (corrida entre dois syncs não duplica).
    stmts.push({
      sql: `INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, acquired_at, last_acquired_at, source_type, source_id)
            SELECT ?, ?, ?, MIN(?, ?), ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM inventory_transactions WHERE id = ?)
            ON CONFLICT (owner_id, item_key) DO UPDATE SET
              quantity = MIN(?, quantity + excluded.quantity),
              acquired_at = COALESCE(acquired_at, excluded.acquired_at),
              last_acquired_at = excluded.last_acquired_at,
              updated_at = datetime('now')`,
      args: [nanoid(), ownerId, g.itemKey, max, g.qty, at, at, g.sourceType, g.sourceId, txId, max],
    });
  }
  await db.batch(stmts, "write");
}

/** Emblemas de conjunto completo (cosmético), concedidos uma única vez. */
async function grantSetEmblems(db: Client, ownerId: string, collected: Set<string>): Promise<void> {
  const grants: Grant[] = ITEM_SETS.filter((s) => s.items.every((k) => collected.has(k))).map((s) => ({
    itemKey: `emblem:${s.id}`,
    qty: 1,
    sourceType: "set",
    sourceId: s.id,
    label: `Conjunto completo: ${s.name}`,
    at: null,
    stack: false,
  }));
  if (grants.length) await applyGrants(db, ownerId, grants);
}

/** Itens já obtidos alguma vez (consumir não "descompleta" um conjunto). */
async function collectedKeys(db: Client, ownerId: string): Promise<Set<string>> {
  const r = await db.execute({ sql: "SELECT DISTINCT item_key FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire'", args: [ownerId] });
  return new Set(r.rows.map((x) => String(x.item_key)));
}

export async function syncInventory(db: Client, ownerId: string): Promise<void> {
  await syncCodexUnlocks(db, ownerId);
  await applyGrants(db, ownerId, await collectGrants(db, ownerId));
  await grantSetEmblems(db, ownerId, await collectedKeys(db, ownerId));
}

/* -------------------------------- Leitura -------------------------------- */

async function readPrefs(db: Client, ownerId: string): Promise<Record<string, unknown>> {
  const r = await db.execute({ sql: "SELECT rpg_prefs_json FROM users WHERE id = ?", args: [ownerId] });
  try {
    const v = JSON.parse(String(r.rows[0]?.rpg_prefs_json ?? "{}"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

async function unlockedTiers(db: Client, ownerId: string): Promise<Set<string>> {
  const r = await db.execute({ sql: "SELECT DISTINCT a.tier FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.owner_id = ?", args: [ownerId] });
  return new Set(r.rows.map((x) => String(x.tier)));
}

export async function isFrameUnlocked(db: Client, ownerId: string, frame: string): Promise<boolean> {
  const f = FRAME_ITEMS.find((x) => x.id === frame);
  if (!f) return false;
  return !f.requires || (await unlockedTiers(db, ownerId)).has(f.requires);
}

export async function isEmblemUnlocked(db: Client, ownerId: string, setId: string): Promise<boolean> {
  const r = await db.execute({ sql: "SELECT 1 FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'acquire' LIMIT 1", args: [ownerId, `emblem:${setId}`] });
  return r.rows.length > 0;
}

const ORIGIN_LINK: Record<string, string> = { campaign: "/forja-campanhas", milestone: "/forja-campanhas", achievement: "/conquistas", codex: "/codex", treasure: "/tesouro", level: "/perfil", set: "/inventario" };

export interface InventoryData {
  items: InventoryItemView[];
  kpis: { totalItems: number; rareRelics: number; consumables: number; cosmetics: number; slotsUsed: number; capacity: number; activeBonuses: number };
  counts: Partial<Record<ItemType | "all", number>>;
  effects: ActiveEffectView[];
  sets: Array<{ id: string; name: string; description: string; owned: number; total: number; items: Array<{ key: string; name: string; art: string; artSet: "items" | "codex"; owned: boolean }>; bonus: string; complete: boolean }>;
  recent: Array<{ key: string; name: string; rarity: Rarity; art: string; artSet: "items" | "rewards" | "codex"; at: string; label: string | null }>;
  equipped: { title: string | null; frame: string; emblem: string | null };
}

export async function getInventory(db: Client, ownerId: string): Promise<InventoryData> {
  await syncInventory(db, ownerId);
  const [stacks, codex, vouchers, tiers, prefs, txs, quests, effects] = await Promise.all([
    db.execute({ sql: "SELECT * FROM user_inventory_items WHERE owner_id = ?", args: [ownerId] }),
    db.execute({ sql: "SELECT kind, item_id, unlocked_at FROM codex_unlocks WHERE owner_id = ? AND kind IN ('relic', 'title')", args: [ownerId] }),
    db.execute({
      sql: `SELECT rr.reward_id, COUNT(*) AS n, MIN(rr.redeemed_at) AS first_at, MAX(rr.redeemed_at) AS last_at, rw.name, rw.description, rw.rarity, rw.art
            FROM reward_redemptions rr JOIN rewards rw ON rw.id = rr.reward_id AND rw.owner_id = rr.owner_id
            WHERE rr.owner_id = ? AND rr.status = 'available' GROUP BY rr.reward_id`,
      args: [ownerId],
    }),
    unlockedTiers(db, ownerId),
    readPrefs(db, ownerId),
    db.execute({
      sql: "SELECT item_key, source_type, label, created_at FROM inventory_transactions WHERE owner_id = ? AND type = 'acquire' ORDER BY created_at ASC, rowid ASC",
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT id, title, created_at FROM campaigns WHERE owner_id = ? AND status IN ('planned', 'active', 'paused')", args: [ownerId] }),
    listActiveEffects(db, ownerId),
  ]);
  // Primeira aquisição (origem) e última por item.
  const firstTx = new Map<string, { sourceType: string; label: string | null; at: string }>();
  const lastTx = new Map<string, string>();
  for (const t of txs.rows) {
    const key = String(t.item_key);
    const at = sqlToIso(t.created_at)!;
    if (!firstTx.has(key)) firstTx.set(key, { sourceType: String(t.source_type), label: t.label == null ? null : String(t.label), at });
    lastTx.set(key, at);
  }
  const flags = new Map(stacks.rows.map((r) => [String(r.item_key), r]));
  const flag = (key: string) => flags.get(key);
  const origin = (key: string) => {
    const f = firstTx.get(key);
    return f ? { sourceType: f.sourceType, label: f.label, at: f.at, link: ORIGIN_LINK[f.sourceType] ?? null } : null;
  };
  const base = (key: string) => ({
    acquiredAt: firstTx.get(key)?.at ?? null,
    lastAcquiredAt: lastTx.get(key) ?? null,
    useCount: Number(flag(key)?.use_count ?? 0),
    favorite: Number(flag(key)?.favorite ?? 0) === 1,
    archived: Number(flag(key)?.archived ?? 0) === 1,
    origin: origin(key),
  });
  const passiveKeys = new Set<string>();
  const items: InventoryItemView[] = [];

  for (const def of ITEM_CATALOG) {
    const q = Number(flag(def.id)?.quantity ?? 0);
    if (q <= 0) continue;
    if (def.effect?.passive) passiveKeys.add(def.id);
    items.push({
      key: def.id,
      name: def.name,
      description: def.description,
      type: def.type,
      rarity: def.rarity,
      art: def.art,
      artSet: "items",
      quantity: q,
      stackable: def.stackable,
      maxStack: def.maxStack,
      effectText: def.effectText,
      durationText: def.durationText,
      obtainedBy: def.obtainedBy,
      equipped: false,
      actions: def.type === "consumable" && def.effect && !def.effect.passive ? ["use"] : [],
      locked: false,
      ...base(def.id),
    });
  }
  for (const u of codex.rows) {
    const kind = String(u.kind);
    const id = String(u.item_id);
    const key = `${kind}:${id}`;
    if (kind === "relic") {
      const r = RELICS.find((x) => x.id === id);
      if (!r) continue;
      items.push({ key, name: r.name, description: r.description, type: "relic", rarity: r.rarity, art: `relic-${id}`, artSet: "codex", quantity: 1, stackable: false, maxStack: 1, effectText: "Comemorativa — sem bônus de jogo", durationText: "Permanente", obtainedBy: r.obtainedBy, equipped: false, actions: [], locked: false, ...base(key) });
    } else {
      const t = TITLES.find((x) => x.id === id);
      if (!t) continue;
      const equipped = prefs.title === id;
      items.push({ key, name: t.name, description: t.description, type: "title", rarity: t.rarity, art: "title", artSet: "items", quantity: 1, stackable: false, maxStack: 1, effectText: "Exibido no perfil — sem bônus", durationText: null, obtainedBy: null, equipped, actions: [equipped ? "unequip" : "equip"], locked: false, ...base(key) });
    }
  }
  for (const f of FRAME_ITEMS) {
    if (f.requires && !tiers.has(f.requires)) continue;
    const key = `frame:${f.id}`;
    const equipped = (prefs.frame ?? "bronze") === f.id;
    items.push({ key, name: f.name, description: "Moldura do retrato do personagem.", type: "cosmetic", rarity: f.rarity, art: `frame-${f.id}`, artSet: "items", quantity: 1, stackable: false, maxStack: 1, effectText: "Aparência — sem bônus", durationText: null, obtainedBy: f.obtainedBy, equipped, actions: equipped ? [] : ["equip"], locked: false, ...base(key), acquiredAt: firstTx.get(key)?.at ?? null });
  }
  for (const s of ITEM_SETS) {
    const key = `emblem:${s.id}`;
    if (!firstTx.has(key)) continue;
    const equipped = prefs.emblem === s.id;
    items.push({ key, name: s.emblem.name, description: `Bônus cosmético do ${s.name}.`, type: "cosmetic", rarity: s.emblem.rarity, art: "emblem", artSet: "items", quantity: 1, stackable: false, maxStack: 1, effectText: "Emblema no perfil — sem bônus", durationText: null, obtainedBy: `Completar o ${s.name}`, equipped, actions: [equipped ? "unequip" : "equip"], locked: false, ...base(key) });
  }
  for (const v of vouchers.rows) {
    const key = `voucher:${String(v.reward_id)}`;
    items.push({
      key,
      name: String(v.name),
      description: v.description == null ? "Recompensa pessoal resgatada no Tesouro." : String(v.description),
      type: "reward",
      rarity: REWARD_RARITY[String(v.rarity)] ?? "common",
      art: v.art == null ? "gift" : String(v.art),
      artSet: "rewards",
      quantity: Number(v.n),
      stackable: true,
      maxStack: 999,
      effectText: "Cupom: usar consome 1 unidade",
      durationText: "Uso único",
      obtainedBy: "Tesouro & Recompensas",
      equipped: false,
      actions: ["use"],
      locked: false,
      ...base(key),
    });
  }
  for (const c of quests.rows) {
    const key = `quest:${String(c.id)}`;
    items.push({
      key,
      name: `Mapa: ${String(c.title)}`,
      description: "Mapa da campanha em andamento. Fica guardado enquanto a campanha estiver ativa.",
      type: "quest",
      rarity: "uncommon",
      art: "map",
      artSet: "items",
      quantity: 1,
      stackable: false,
      maxStack: 1,
      effectText: "Item de missão — não pode ser descartado",
      durationText: null,
      obtainedBy: "Campanha da Forja",
      equipped: false,
      actions: [],
      locked: true,
      ...base(key),
      origin: { sourceType: "campaign", label: `Campanha: ${String(c.title)}`, at: sqlToIso(c.created_at), link: "/forja-campanhas" },
      acquiredAt: sqlToIso(c.created_at),
    });
  }

  const collected = await collectedKeys(db, ownerId);
  const nameOf = (k: string) =>
    k.startsWith("relic:") ? (RELICS.find((r) => `relic:${r.id}` === k)?.name ?? k) : k.startsWith("title:") ? (TITLES.find((t) => `title:${t.id}` === k)?.name ?? k) : (itemDef(k)?.name ?? k);
  const artOf = (k: string) => (k.startsWith("relic:") ? `relic-${k.slice(6)}` : k.startsWith("title:") ? "title" : k.startsWith("frame:") ? `frame-${k.slice(6)}` : k.startsWith("emblem:") ? "emblem" : (itemDef(k)?.art ?? "crystal"));
  const artSetOf = (k: string): "items" | "codex" => (k.startsWith("relic:") ? "codex" : "items");
  const sets = ITEM_SETS.map((s) => {
    const list = s.items.map((k) => ({ key: k, name: nameOf(k), art: artOf(k), artSet: artSetOf(k), owned: collected.has(k) }));
    const owned = list.filter((i) => i.owned).length;
    return { id: s.id, name: s.name, description: s.description, owned, total: list.length, items: list, bonus: `${s.emblem.name} (cosmético)`, complete: owned === list.length };
  });

  const recentRows = [...txs.rows].reverse().slice(0, 8);
  const recent = recentRows.map((t) => {
    const key = String(t.item_key);
    const it = items.find((i) => i.key === key);
    return {
      key,
      name: it?.name ?? nameOf(key),
      rarity: it?.rarity ?? (itemDef(key)?.rarity ?? "common"),
      art: it?.art ?? artOf(key),
      artSet: it?.artSet ?? artSetOf(key),
      at: sqlToIso(t.created_at)!,
      label: t.label == null ? null : String(t.label),
    };
  });

  const capacity = INVENTORY_RULES.baseCapacity + [...passiveKeys].reduce((s, k) => s + (itemDef(k)?.effect?.type === "INVENTORY_CAPACITY" ? itemDef(k)!.effect!.value : 0), 0);
  const visible = items.filter((i) => !i.archived);
  const counts: Partial<Record<ItemType | "all", number>> = { all: visible.length };
  for (const i of visible) counts[i.type] = (counts[i.type] ?? 0) + 1;

  return {
    items,
    kpis: {
      totalItems: items.reduce((s, i) => s + i.quantity, 0),
      rareRelics: items.filter((i) => i.type === "relic" && RARITY_ORDER.indexOf(i.rarity) >= RARITY_ORDER.indexOf("epic")).length,
      consumables: items.filter((i) => i.type === "consumable").reduce((s, i) => s + i.quantity, 0),
      cosmetics: items.filter((i) => i.type === "cosmetic" || i.type === "title").length,
      slotsUsed: items.length,
      capacity,
      activeBonuses: effects.length + passiveKeys.size,
    },
    counts,
    effects,
    sets,
    recent,
    equipped: { title: typeof prefs.title === "string" ? prefs.title : null, frame: typeof prefs.frame === "string" ? prefs.frame : "bronze", emblem: typeof prefs.emblem === "string" ? prefs.emblem : null },
  };
}

/* -------------------------------- Ações -------------------------------- */

export type ActionResult = { ok: true; replayed?: boolean; message: string } | { ok: false; status: 400 | 403 | 404 | 409; message: string };

/**
 * Usa 1 unidade. Idempotente por requestId (clique duplo/refresh). O
 * consumo, o ledger e o efeito vão no mesmo batch e só acontecem se ainda
 * houver quantidade no momento da escrita.
 */
export async function useItem(db: Client, ownerId: string, itemKey: string, requestId: string): Promise<ActionResult> {
  const done = await db.execute({
    sql: "SELECT 1 FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'use' AND source_type = 'request' AND source_id = ?",
    args: [ownerId, itemKey, requestId],
  });
  if (done.rows.length) return { ok: true, replayed: true, message: "Item já usado." };

  // Cupom do Tesouro: a fonte é o resgate (mesmo dado do Tesouro).
  if (itemKey.startsWith("voucher:")) {
    const rewardId = itemKey.slice(8);
    const next = await db.execute({
      sql: "SELECT id, reward_name FROM reward_redemptions WHERE owner_id = ? AND reward_id = ? AND status = 'available' ORDER BY redeemed_at ASC LIMIT 1",
      args: [ownerId, rewardId],
    });
    const row = next.rows[0];
    if (!row) return { ok: false, status: 409, message: "Nenhuma unidade disponível." };
    if (!(await useRedemption(db, ownerId, String(row.id)))) return { ok: false, status: 409, message: "Esta unidade acabou de ser usada." };
    await db.execute({
      sql: "INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label) VALUES (?, ?, ?, 'use', 1, 'request', ?, ?)",
      args: [nanoid(), ownerId, itemKey, requestId, `Recompensa utilizada: ${String(row.reward_name)}`],
    });
    return { ok: true, message: `Recompensa utilizada: ${String(row.reward_name)}.` };
  }

  const def = itemDef(itemKey);
  if (!def || def.type !== "consumable" || !def.effect || def.effect.passive) return { ok: false, status: 400, message: "Este item não pode ser usado." };
  const stack = await db.execute({ sql: "SELECT quantity FROM user_inventory_items WHERE owner_id = ? AND item_key = ?", args: [ownerId, itemKey] });
  if (Number(stack.rows[0]?.quantity ?? 0) <= 0) return { ok: false, status: 404, message: "Você não possui este item." };

  const effectType = def.effect.type as TimedEffect;
  const rule = EFFECT_RULES[effectType];
  const now = new Date();
  const active = (await listActiveEffects(db, ownerId, now)).find((e) => e.effectType === effectType);
  let expires = new Date(now.getTime() + rule.durationMin * 60_000);
  if (active) {
    // Iguais não somam %: ou estende (com teto) ou é bloqueado.
    if (rule.stacking === "block") return { ok: false, status: 409, message: `Já existe um efeito ativo: ${rule.label}. Use depois que ele for consumido.` };
    const cap = new Date(now.getTime() + rule.maxRemainingMin * 60_000);
    const extended = new Date(Math.min(Date.parse(active.expiresAt) + rule.durationMin * 60_000, cap.getTime()));
    if (extended.getTime() <= Date.parse(active.expiresAt)) return { ok: false, status: 409, message: `O efeito já está na duração máxima (${rule.maxRemainingMin} min).` };
    expires = extended;
  }
  const txId = nanoid();
  const guard = "EXISTS (SELECT 1 FROM inventory_transactions WHERE id = ?)";
  const stmts: Array<{ sql: string; args: Array<string | number | null> }> = [
    {
      sql: `INSERT OR IGNORE INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
            SELECT ?, ?, ?, 'use', 1, 'request', ?, ? WHERE EXISTS (SELECT 1 FROM user_inventory_items WHERE owner_id = ? AND item_key = ? AND quantity > 0)`,
      args: [txId, ownerId, itemKey, requestId, `Item usado: ${def.name}`, ownerId, itemKey],
    },
    {
      sql: `UPDATE user_inventory_items SET quantity = quantity - 1, use_count = use_count + 1, updated_at = datetime('now')
            WHERE owner_id = ? AND item_key = ? AND quantity > 0 AND ${guard}`,
      args: [ownerId, itemKey, txId],
    },
    active
      ? { sql: `UPDATE active_item_effects SET expires_at = ? WHERE id = ? AND owner_id = ? AND ${guard}`, args: [sqlTime(expires), active.id, ownerId, txId] }
      : {
          sql: `INSERT INTO active_item_effects (id, owner_id, item_key, effect_type, value, started_at, expires_at, use_tx_id)
                SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`,
          args: [nanoid(), ownerId, itemKey, effectType, def.effect.value, sqlTime(now), sqlTime(expires), txId, txId],
        },
  ];
  await db.batch(stmts, "write");
  const ok = await db.execute({ sql: "SELECT 1 FROM inventory_transactions WHERE id = ?", args: [txId] });
  if (!ok.rows.length) {
    const replay = await db.execute({
      sql: "SELECT 1 FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'use' AND source_type = 'request' AND source_id = ?",
      args: [ownerId, itemKey, requestId],
    });
    return replay.rows.length ? { ok: true, replayed: true, message: "Item já usado." } : { ok: false, status: 409, message: "Não há mais unidades deste item." };
  }
  return { ok: true, message: active ? `${def.name}: duração estendida.` : `${def.name} ativada: ${def.effectText}.` };
}

const EQUIP_PREF: Record<string, "title" | "frame" | "emblem"> = { title: "title", frame: "frame", emblem: "emblem" };

/** Equipa/desequipa cosméticos atualizando as preferências do Perfil (estado único). */
export async function setEquipped(db: Client, ownerId: string, itemKey: string, equip: boolean): Promise<ActionResult> {
  const [kind, id] = itemKey.split(":");
  const pref = EQUIP_PREF[kind ?? ""];
  if (!pref || !id) return { ok: false, status: 400, message: "Este item não é equipável." };
  if (equip) {
    const unlocked = kind === "title" ? await isTitleUnlocked(db, ownerId, id) : kind === "frame" ? await isFrameUnlocked(db, ownerId, id) : await isEmblemUnlocked(db, ownerId, id);
    if (!unlocked) return { ok: false, status: 403, message: "Item ainda não conquistado." };
  }
  const prefs = await readPrefs(db, ownerId);
  const value = equip ? id : pref === "frame" ? "bronze" : null;
  await db.batch(
    [
      { sql: "UPDATE users SET rpg_prefs_json = ?, updated_at = datetime('now') WHERE id = ?", args: [JSON.stringify({ ...prefs, [pref]: value }), ownerId] },
      {
        sql: "INSERT INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label) VALUES (?, ?, ?, ?, 0, 'profile', ?, ?)",
        args: [nanoid(), ownerId, itemKey, equip ? "equip" : "unequip", nanoid(), equip ? "Cosmético equipado" : "Cosmético removido"],
      },
    ],
    "write",
  );
  return { ok: true, message: equip ? "Equipado no perfil." : "Removido do perfil." };
}

/** Favoritar/arquivar valem para qualquer item que o usuário realmente possua. */
export async function setFlags(db: Client, ownerId: string, itemKey: string, flags: { favorite?: boolean; archived?: boolean }): Promise<ActionResult> {
  const owned = await db.execute({ sql: "SELECT 1 FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'acquire' LIMIT 1", args: [ownerId, itemKey] });
  const isQuest = itemKey.startsWith("quest:");
  if (!owned.rows.length && !isQuest) return { ok: false, status: 404, message: "Item não encontrado no seu inventário." };
  if (isQuest) {
    const c = await db.execute({ sql: "SELECT 1 FROM campaigns WHERE id = ? AND owner_id = ?", args: [itemKey.slice(6), ownerId] });
    if (!c.rows.length) return { ok: false, status: 404, message: "Item não encontrado no seu inventário." };
    if (flags.archived) return { ok: false, status: 409, message: "Itens de campanha ativa não podem ser arquivados." };
  }
  const sets: string[] = [];
  const args: Array<string | number> = [];
  if (flags.favorite !== undefined) {
    sets.push("favorite = excluded.favorite");
  }
  if (flags.archived !== undefined) sets.push("archived = excluded.archived");
  args.push(nanoid(), ownerId, itemKey, flags.favorite ? 1 : 0, flags.archived ? 1 : 0);
  await db.execute({
    sql: `INSERT INTO user_inventory_items (id, owner_id, item_key, quantity, favorite, archived) VALUES (?, ?, ?, 0, ?, ?)
          ON CONFLICT (owner_id, item_key) DO UPDATE SET ${sets.join(", ") || "favorite = favorite"}, updated_at = datetime('now')`,
    args,
  });
  return { ok: true, message: "Atualizado." };
}

export async function getHistory(db: Client, ownerId: string, type?: "acquire" | "use" | "equip", limit = 100) {
  const r = await db.execute({
    sql: `SELECT id, item_key, type, quantity, source_type, label, created_at FROM inventory_transactions
          WHERE owner_id = ? ${type === "equip" ? "AND type IN ('equip', 'unequip')" : type ? "AND type = ?" : ""}
          ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    args: type && type !== "equip" ? [ownerId, type, limit] : [ownerId, limit],
  });
  return r.rows.map((x) => {
    const key = String(x.item_key);
    const name = key.startsWith("relic:")
      ? RELICS.find((r) => `relic:${r.id}` === key)?.name
      : key.startsWith("title:")
        ? TITLES.find((t) => `title:${t.id}` === key)?.name
        : key.startsWith("frame:")
          ? FRAME_ITEMS.find((f) => `frame:${f.id}` === key)?.name
          : key.startsWith("emblem:")
            ? ITEM_SETS.find((st) => `emblem:${st.id}` === key)?.emblem.name
            : itemDef(key)?.name;
    return {
      id: String(x.id),
      itemKey: key,
      itemName: name ?? (x.label == null ? key : String(x.label).replace(/^[^:]+:\s*/, "")),
      type: String(x.type),
      quantity: Number(x.quantity),
      sourceType: String(x.source_type),
      label: x.label == null ? null : String(x.label),
      at: sqlToIso(x.created_at)!,
    };
  });
}
