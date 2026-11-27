import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { award } from "./gamificationService.js";
import { shiftDayKey, userDayContext } from "./localDayService.js";
import { fetchJson, IntegrationError } from "./integrationsCore.js";
import { recordWorldEvent } from "./livingWorldService.js";

/**
 * Cozinha do Herói (Saúde) — refeições registradas pelo usuário, com dados
 * nutricionais do Open Food Facts (base aberta, sem chave) por código de barras
 * ou digitados à mão. Nada é estimado: campo que o produto não informa fica null
 * e não entra nas somas como zero escondido (a UI avisa "sem dado").
 *
 * Gamificação idempotente (xp_events UNIQUE):
 *  - refeição registrada (hoje ou ontem) → +5 XP, até 4 por dia;
 *  - meta de proteína do dia batida → +15 XP e 3 moedas, uma vez por dia.
 */

export const MEAL_TYPES = ["cafe", "almoco", "lanche", "jantar", "ceia"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const NUTRITION_XP = { meal: 5, mealDailyCap: 4, protein: 15, proteinCoins: 3 } as const;

export class NutritionError extends Error {
  constructor(message: string, public status: 400 | 404 | 422 | 502 = 400) {
    super(message);
  }
}

export interface FoodProduct {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: string | null;
  servingGrams: number | null;
  servingLabel: string | null;
  /** Valores por 100 g (null quando o produto não informa). */
  per100: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
}

const BARCODE = /^\d{6,14}$/;
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

type OffProduct = {
  product_name?: string;
  product_name_pt?: string;
  generic_name_pt?: string;
  brands?: string;
  image_front_small_url?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function mapOff(barcode: string, p: OffProduct): FoodProduct | null {
  const name = (p.product_name_pt || p.product_name || p.generic_name_pt || "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  // Alguns produtos só trazem energia em kJ: converte (1 kcal = 4,184 kJ).
  const kj = numOrNull(n["energy-kj_100g"] ?? n["energy_100g"]);
  const kcal = numOrNull(n["energy-kcal_100g"]) ?? (kj != null ? round1(kj / 4.184) : null);
  return {
    barcode,
    name: name.slice(0, 120),
    brand: p.brands ? p.brands.split(",")[0]!.trim().slice(0, 80) || null : null,
    imageUrl: p.image_front_small_url && /^https:\/\//.test(p.image_front_small_url) ? p.image_front_small_url : null,
    quantity: p.quantity?.slice(0, 40) ?? null,
    servingGrams: numOrNull(p.serving_quantity),
    servingLabel: p.serving_size?.slice(0, 40) ?? null,
    per100: { kcal, protein: numOrNull(n["proteins_100g"]), carbs: numOrNull(n["carbohydrates_100g"]), fat: numOrNull(n["fat_100g"]) },
  };
}

const PRODUCT_TTL_DAYS = 30;

/** Produto por código de barras, com cache (inclusive do "não encontrado", por 2 dias). */
export async function lookupProduct(db: Client, barcodeRaw: string): Promise<FoodProduct> {
  const barcode = barcodeRaw.replace(/\D/g, "");
  if (!BARCODE.test(barcode)) throw new NutritionError("Código de barras inválido (use de 6 a 14 dígitos).", 422);
  const cached = await db.execute({ sql: "SELECT data_json, found, fetched_at FROM food_products WHERE barcode = ?", args: [barcode] });
  const row = cached.rows[0];
  if (row) {
    const age = (Date.now() - Date.parse(String(row.fetched_at).replace(" ", "T") + "Z")) / 86_400_000;
    if (Number(row.found) === 1 && age < PRODUCT_TTL_DAYS) return JSON.parse(String(row.data_json)) as FoodProduct;
    if (Number(row.found) === 0 && age < 2) throw new NutritionError("Produto não encontrado no Open Food Facts. Registre manualmente.", 404);
  }
  let body: { status?: number; product?: OffProduct } | null = null;
  try {
    body = await fetchJson<{ status?: number; product?: OffProduct }>(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_pt,generic_name_pt,brands,image_front_small_url,quantity,serving_size,serving_quantity,nutriments`,
      { headers: { Accept: "application/json", "User-Agent": "LifeOS/1.0 (https://github.com/ViniciusKanh/LifeOs)" } },
      { label: "Open Food Facts", timeoutMs: 8000, retries: 1 },
    );
  } catch (err) {
    if (!(err instanceof IntegrationError && err.status === 404)) {
      if (row && Number(row.found) === 1) return JSON.parse(String(row.data_json)) as FoodProduct; // cache vencido é melhor que nada
      throw new NutritionError("O Open Food Facts não respondeu agora. Tente de novo ou registre manualmente.", 502);
    }
  }
  const product = body && body.status === 1 && body.product ? mapOff(barcode, body.product) : null;
  await db.execute({
    sql: `INSERT INTO food_products (barcode, data_json, found, fetched_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT (barcode) DO UPDATE SET data_json = excluded.data_json, found = excluded.found, fetched_at = excluded.fetched_at`,
    args: [barcode, JSON.stringify(product ?? {}), product ? 1 : 0],
  });
  if (!product) throw new NutritionError("Produto não encontrado no Open Food Facts. Registre manualmente.", 404);
  return product;
}

export interface MealInput {
  mealType: MealType;
  day?: string;
  barcode?: string | null;
  grams?: number | null;
  name?: string | null;
  brand?: string | null;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

const scale = (per100: number | null, grams: number) => (per100 == null ? null : round1((per100 * grams) / 100));

export async function addMeal(db: Client, ownerId: string, input: MealInput) {
  const { today } = await userDayContext(db, ownerId);
  const day = input.day ?? today;
  if (day > today) throw new NutritionError("Não dá para registrar refeição no futuro.");
  if (day < shiftDayKey(today, -30)) throw new NutritionError("Registre refeições de até 30 dias atrás.");
  let row: { barcode: string | null; name: string; brand: string | null; grams: number | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; source: "openfoodfacts" | "manual"; image: string | null };
  if (input.barcode) {
    const p = await lookupProduct(db, input.barcode);
    const grams = input.grams ?? p.servingGrams;
    if (!grams || grams <= 0) throw new NutritionError("Informe a quantidade em gramas.", 422);
    row = { barcode: p.barcode, name: input.name?.trim() || p.name, brand: p.brand, grams, kcal: scale(p.per100.kcal, grams), protein: scale(p.per100.protein, grams), carbs: scale(p.per100.carbs, grams), fat: scale(p.per100.fat, grams), source: "openfoodfacts", image: p.imageUrl };
  } else {
    const name = input.name?.trim();
    if (!name) throw new NutritionError("Dê um nome para a refeição.", 422);
    row = { barcode: null, name: name.slice(0, 120), brand: input.brand?.trim().slice(0, 80) || null, grams: input.grams ?? null, kcal: input.kcal ?? null, protein: input.proteinG ?? null, carbs: input.carbsG ?? null, fat: input.fatG ?? null, source: "manual", image: null };
  }
  const id = nanoid();
  // Refeição de dia passado fica às 12h UTC daquele dia (só a data importa).
  const eatenAt = day === today ? new Date().toISOString() : `${day}T12:00:00.000Z`;
  await db.execute({
    sql: `INSERT INTO meals (id, owner_id, day_key, eaten_at, meal_type, barcode, name, brand, grams, kcal, protein_g, carbs_g, fat_g, source, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, ownerId, day, eatenAt, input.mealType, row.barcode, row.name, row.brand, row.grams, row.kcal, row.protein, row.carbs, row.fat, row.source, row.image],
  });
  const rewards = await rewardMeal(db, ownerId, id, row.name, day, today);
  return { id, ...rewards };
}

/** XP só para registros do dia (ou de ontem, para quem lança à noite): evita farm retroativo. */
async function rewardMeal(db: Client, ownerId: string, mealId: string, name: string, day: string, today: string) {
  let xp = 0;
  let proteinGoalHit = false;
  if (day !== today && day !== shiftDayKey(today, -1)) return { xp, proteinGoalHit };
  const used = await db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'nutrition' AND event_type = 'meal_logged' AND day_key = ?", args: [ownerId, day] });
  if (Number(used.rows[0]?.n ?? 0) < NUTRITION_XP.mealDailyCap) {
    if (await award(db, ownerId, { sourceType: "nutrition", sourceId: mealId, eventType: "meal_logged", xp: NUTRITION_XP.meal, coins: 0, label: `Refeição registrada: ${name.slice(0, 60)}` }, day)) xp += NUTRITION_XP.meal;
  }
  const goals = await getNutritionSettings(db, ownerId);
  if (goals.proteinGoalG) {
    const t = await db.execute({ sql: "SELECT COALESCE(SUM(protein_g), 0) AS p FROM meals WHERE owner_id = ? AND day_key = ?", args: [ownerId, day] });
    if (Number(t.rows[0]?.p ?? 0) >= goals.proteinGoalG) {
      const granted = await award(db, ownerId, { sourceType: "nutrition", sourceId: `protein:${day}`, eventType: "protein_goal", xp: NUTRITION_XP.protein, coins: NUTRITION_XP.proteinCoins, label: `Meta de proteína batida (${goals.proteinGoalG} g)` }, day);
      if (granted) {
        xp += NUTRITION_XP.protein;
        proteinGoalHit = true;
        await recordWorldEvent(db, ownerId, { type: "nutrition.protein_goal", title: "A Cozinha do Herói bateu a meta de proteína", detail: `${goals.proteinGoalG} g no dia`, refId: day });
      }
    }
  }
  return { xp, proteinGoalHit };
}

export async function deleteMeal(db: Client, ownerId: string, id: string) {
  const r = await db.execute({ sql: "DELETE FROM meals WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rowsAffected) throw new NutritionError("Refeição não encontrada.", 404);
}

export async function getNutritionSettings(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT kcal_goal, protein_goal_g FROM nutrition_settings WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  return { kcalGoal: row?.kcal_goal == null ? null : Number(row.kcal_goal), proteinGoalG: row?.protein_goal_g == null ? null : Number(row.protein_goal_g) };
}

export async function saveNutritionSettings(db: Client, ownerId: string, s: { kcalGoal: number | null; proteinGoalG: number | null }) {
  await db.execute({
    sql: `INSERT INTO nutrition_settings (owner_id, kcal_goal, protein_goal_g) VALUES (?, ?, ?)
          ON CONFLICT (owner_id) DO UPDATE SET kcal_goal = excluded.kcal_goal, protein_goal_g = excluded.protein_goal_g, updated_at = datetime('now')`,
    args: [ownerId, s.kcalGoal, s.proteinGoalG],
  });
  return s;
}

const n = (v: unknown) => (v == null ? null : Number(v));

function mapMeal(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    day: String(r.day_key),
    eatenAt: String(r.eaten_at),
    mealType: String(r.meal_type) as MealType,
    barcode: r.barcode == null ? null : String(r.barcode),
    name: String(r.name),
    brand: r.brand == null ? null : String(r.brand),
    grams: n(r.grams),
    kcal: n(r.kcal),
    proteinG: n(r.protein_g),
    carbsG: n(r.carbs_g),
    fatG: n(r.fat_g),
    source: String(r.source) as "openfoodfacts" | "manual",
    imageUrl: r.image_url == null ? null : String(r.image_url),
  };
}

/** Visão da Cozinha do Herói para um dia (padrão: hoje) + histórico de 14 dias. */
export async function getNutritionOverview(db: Client, ownerId: string, dayRaw?: string) {
  const { today } = await userDayContext(db, ownerId);
  const day = dayRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) && dayRaw <= today ? dayRaw : today;
  const from = shiftDayKey(today, -13);
  const [meals, hist, recent, settings, xpToday, proteinDays, allDays] = await Promise.all([
    db.execute({ sql: "SELECT * FROM meals WHERE owner_id = ? AND day_key = ? ORDER BY eaten_at", args: [ownerId, day] }),
    db.execute({
      sql: `SELECT day_key, COUNT(*) AS n, SUM(kcal) AS kcal, SUM(protein_g) AS protein, SUM(CASE WHEN kcal IS NULL THEN 1 ELSE 0 END) AS missing
              FROM meals WHERE owner_id = ? AND day_key >= ? GROUP BY day_key`,
      args: [ownerId, from],
    }),
    db.execute({
      sql: `SELECT barcode, name, brand, grams, kcal, protein_g, carbs_g, fat_g, image_url, MAX(eaten_at) AS last, COUNT(*) AS uses
              FROM meals WHERE owner_id = ? AND day_key >= ? GROUP BY COALESCE(barcode, lower(name)) ORDER BY uses DESC, last DESC LIMIT 8`,
      args: [ownerId, shiftDayKey(today, -60)],
    }),
    getNutritionSettings(db, ownerId),
    db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_events WHERE owner_id = ? AND source_type = 'nutrition' AND day_key = ?", args: [ownerId, day] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM xp_events WHERE owner_id = ? AND source_type = 'nutrition' AND event_type = 'protein_goal'", args: [ownerId] }),
    db.execute({ sql: "SELECT DISTINCT day_key FROM meals WHERE owner_id = ? AND day_key >= ? ORDER BY day_key DESC", args: [ownerId, shiftDayKey(today, -400)] }),
  ]);
  const list = meals.rows.map((r) => mapMeal(r as Record<string, unknown>));
  const sum = (k: "kcal" | "proteinG" | "carbsG" | "fatG") => {
    const vals = list.map((m) => m[k]).filter((v): v is number => v != null);
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0)) : null;
  };
  const histMap = new Map(hist.rows.map((r) => [String(r.day_key), r]));
  const history: Array<{ day: string; meals: number; kcal: number | null; protein: number | null; incomplete: boolean }> = [];
  for (let d = from; d <= today; d = shiftDayKey(d, 1)) {
    const r = histMap.get(d);
    history.push({ day: d, meals: r ? Number(r.n) : 0, kcal: r?.kcal == null ? null : round1(Number(r.kcal)), protein: r?.protein == null ? null : round1(Number(r.protein)), incomplete: r ? Number(r.missing) > 0 : false });
  }
  // Sequência: dias seguidos com pelo menos uma refeição, terminando hoje ou ontem.
  const days = new Set(allDays.rows.map((r) => String(r.day_key)));
  let streak = 0;
  let cursor = days.has(today) ? today : shiftDayKey(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  return {
    day,
    today,
    goals: settings,
    totals: { kcal: sum("kcal"), proteinG: sum("proteinG"), carbsG: sum("carbsG"), fatG: sum("fatG"), incomplete: list.some((m) => m.kcal == null || m.proteinG == null) },
    meals: list,
    history,
    recent: recent.rows.map((r) => ({
      barcode: r.barcode == null ? null : String(r.barcode),
      name: String(r.name),
      brand: r.brand == null ? null : String(r.brand),
      grams: n(r.grams),
      kcal: n(r.kcal),
      proteinG: n(r.protein_g),
      carbsG: n(r.carbs_g),
      fatG: n(r.fat_g),
      imageUrl: r.image_url == null ? null : String(r.image_url),
      uses: Number(r.uses),
    })),
    rewards: { xpToday: Number(xpToday.rows[0]?.xp ?? 0), mealXp: NUTRITION_XP.meal, mealDailyCap: NUTRITION_XP.mealDailyCap, proteinXp: NUTRITION_XP.protein, proteinGoalDays: Number(proteinDays.rows[0]?.n ?? 0) },
    streak,
  };
}

/** Linha do tempo: um resumo por dia com refeições (não um evento por prato). */
export async function nutritionTimelineEvents(db: Client, ownerId: string, from: string, to: string) {
  const r = await db.execute({
    sql: `SELECT day_key, COUNT(*) AS n, SUM(kcal) AS kcal, SUM(protein_g) AS protein, MAX(eaten_at) AS at FROM meals
           WHERE owner_id = ? AND day_key >= ? AND day_key <= ? GROUP BY day_key`,
    args: [ownerId, from, to],
  });
  return r.rows.map((x) => ({
    type: "nutrition",
    icon: "🍽️",
    id: `nutrition-${String(x.day_key)}`,
    label: `${Number(x.n)} refeição(ões) registrada(s)${x.kcal != null ? ` · ${Math.round(Number(x.kcal))} kcal` : ""}${x.protein != null ? ` · ${Math.round(Number(x.protein))} g de proteína` : ""}`,
    at: String(x.at),
  }));
}
