import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { BOSSES, RAID_DAMAGE, RAID_EFFECTS, RAID_RULES, type RaidFamily } from "../config/raids.js";
import { ACTIVITY_FAMILY, collectActivity, type ActivityHit } from "./activitySignals.js";
import { getHolidayPrefs, holidayMap } from "./holidayService.js";
import { award, levelForXp } from "./gamificationService.js";
import { localDayRangeUtc, shiftDayKey, userDayContext } from "./localDayService.js";
import { recordWorldEvent } from "./livingWorldService.js";
import { grantCollectionItem } from "./adventureCollection.js";

/**
 * Chefe da Semana (Raid). Segunda a domingo no fuso do usuário.
 *
 * Decisão central: o dano é DERIVADO das fontes reais a cada leitura
 * (activitySignals). Não existe tabela de golpes — por isso re-sincronizar
 * o GitHub ou reabrir a tela nunca duplica dano. Só o desfecho é gravado
 * (status/defeated_at) e a recompensa passa por award(), que é idempotente.
 */

type Difficulty = keyof typeof RAID_RULES.difficulty;

export class RaidError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Strike {
  id: string;
  kind: ActivityHit["kind"];
  family: RaidFamily;
  at: string;
  day: string;
  label: string;
  damage: number;
  afterDefeat: boolean;
}

/** Segunda-feira da semana de `day` e o domingo correspondente. */
export function weekBounds(day: string): { start: string; end: string } {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const start = shiftDayKey(day, -((dow + 6) % 7));
  return { start, end: shiftDayKey(start, 6) };
}

export function weekIndex(weekStart: string): number {
  return Math.floor(Date.parse(`${weekStart}T12:00:00Z`) / (7 * 86_400_000));
}

export function effectForWeek(weekStart: string) {
  return RAID_EFFECTS[((weekIndex(weekStart) % RAID_EFFECTS.length) + RAID_EFFECTS.length) % RAID_EFFECTS.length]!;
}

/** Converte atividades em golpes: limite diário por tipo, fator de duração e efeito semanal. */
export function strikesFromHits(hits: ActivityHit[], effect: { families: RaidFamily[]; pct: number } | null): Strike[] {
  const perDayKind = new Map<string, number>();
  const out: Strike[] = [];
  for (const h of hits) {
    const rule = RAID_DAMAGE[h.kind];
    const key = `${h.day}|${h.kind}`;
    const used = perDayKind.get(key) ?? 0;
    if (used >= rule.dailyCap) continue;
    perDayKind.set(key, used + 1);
    const family = ACTIVITY_FAMILY[h.kind];
    let dmg = rule.base * h.boost;
    if (rule.byDuration && h.minutes && h.minutes > 0) dmg *= Math.min(2, Math.max(0.5, h.minutes / rule.byDuration));
    if (effect && effect.families.includes(family)) dmg *= 1 + effect.pct / 100;
    out.push({ id: h.id, kind: h.kind, family, at: h.at, day: h.day, label: h.label, damage: Math.round(dmg), afterDefeat: false });
  }
  return out;
}

export function computeMaxHp(weeklyDamageAvg: number, difficulty: Difficulty, level: number): number {
  const base = weeklyDamageAvg > 0 ? weeklyDamageAvg * RAID_RULES.effortTarget : RAID_RULES.noHistoryHp;
  const lvl = 1 + Math.min(level, RAID_RULES.levelCap) * RAID_RULES.levelHpPct;
  const hp = base * RAID_RULES.difficulty[difficulty] * lvl;
  return Math.round(Math.min(RAID_RULES.maxHp, Math.max(RAID_RULES.minHp, hp)) / 10) * 10;
}

export interface RaidSimulation {
  strikes: Strike[];
  heals: Array<{ day: string; amount: number }>;
  hp: number;
  damage: number;
  healed: number;
  defeatedAt: string | null;
}

/**
 * Simula a semana em ordem cronológica. Dia sem nenhuma atividade (já
 * encerrado, fora de descanso) cura o chefe uma vez, com teto semanal.
 */
export function simulateRaid(
  maxHp: number,
  strikes: Strike[],
  opts: { weekStart: string; weekEnd: string; today: string; healingEnabled: boolean; restWeekdays: number[]; restDays: Set<string> }
): RaidSimulation {
  const byDay = new Map<string, Strike[]>();
  for (const s of strikes) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const healCap = Math.round(maxHp * RAID_RULES.healCapPctPerWeek);
  const healPerDay = Math.round(maxHp * RAID_RULES.healPctPerIdleDay);
  let hp = maxHp;
  let damage = 0;
  let healed = 0;
  let defeatedAt: string | null = null;
  const heals: RaidSimulation["heals"] = [];
  for (let d = opts.weekStart; d <= opts.weekEnd; d = shiftDayKey(d, 1)) {
    const todays = byDay.get(d) ?? [];
    for (const s of todays) {
      if (defeatedAt) {
        s.afterDefeat = true;
        continue;
      }
      hp -= s.damage;
      damage += s.damage;
      if (hp <= 0) {
        hp = 0;
        defeatedAt = s.at;
      }
    }
    const finished = d < opts.today;
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
    const resting = opts.restWeekdays.includes(weekday) || opts.restDays.has(d);
    if (!defeatedAt && finished && todays.length === 0 && opts.healingEnabled && !resting && healed < healCap && hp < maxHp) {
      const amount = Math.min(healPerDay, healCap - healed, maxHp - hp);
      if (amount > 0) {
        hp += amount;
        healed += amount;
        heals.push({ day: d, amount });
      }
    }
  }
  return { strikes, heals, hp, damage, healed, defeatedAt };
}

/* ─────────────────────────── Persistência ─────────────────────────── */

async function userLevel(db: Client, ownerId: string): Promise<number> {
  const r = await db.execute({ sql: "SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE owner_id = ?", args: [ownerId] });
  return levelForXp(Number(r.rows[0]?.total ?? 0)).level;
}

export async function getRaidSettings(db: Client, ownerId: string) {
  const r = await db.execute({ sql: "SELECT difficulty, healing_enabled, rest_weekdays FROM raid_settings WHERE owner_id = ?", args: [ownerId] });
  const row = r.rows[0];
  let rest: number[] = [];
  try {
    rest = row ? (JSON.parse(String(row.rest_weekdays)) as number[]).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [];
  } catch {
    rest = [];
  }
  return {
    difficulty: (row ? String(row.difficulty) : "normal") as Difficulty,
    healingEnabled: row ? Number(row.healing_enabled) === 1 : true,
    restWeekdays: rest,
  };
}

export async function saveRaidSettings(db: Client, ownerId: string, s: { difficulty: Difficulty; healingEnabled: boolean; restWeekdays: number[] }) {
  await db.execute({
    sql: `INSERT INTO raid_settings (owner_id, difficulty, healing_enabled, rest_weekdays, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (owner_id) DO UPDATE SET difficulty = excluded.difficulty, healing_enabled = excluded.healing_enabled,
            rest_weekdays = excluded.rest_weekdays, updated_at = excluded.updated_at`,
    args: [ownerId, s.difficulty, s.healingEnabled ? 1 : 0, JSON.stringify([...new Set(s.restWeekdays)].sort())],
  });
  return getRaidSettings(db, ownerId);
}

export async function setRestDay(db: Client, ownerId: string, day: string, rest: boolean) {
  const { today } = await userDayContext(db, ownerId);
  const wk = weekBounds(today);
  if (day < wk.start || day > wk.end) throw new RaidError(400, "Só é possível marcar descanso em dias da semana atual.");
  if (rest) await db.execute({ sql: "INSERT OR IGNORE INTO raid_rest_days (owner_id, day_key) VALUES (?, ?)", args: [ownerId, day] });
  else await db.execute({ sql: "DELETE FROM raid_rest_days WHERE owner_id = ? AND day_key = ?", args: [ownerId, day] });
}

interface RaidRow {
  id: string;
  week_start: string;
  week_end: string;
  boss_key: string;
  boss_level: number;
  max_hp: number;
  difficulty: Difficulty;
  baseline: { weeklyAvg: number; families: Record<string, number> };
  status: "ativa" | "derrotado" | "encerrada";
  defeated_at: string | null;
  rewarded_at: string | null;
  final_damage: number | null;
}

function mapRaid(r: Record<string, unknown>): RaidRow {
  let baseline = { weeklyAvg: 0, families: {} as Record<string, number> };
  try {
    baseline = { ...baseline, ...JSON.parse(String(r.baseline_json ?? "{}")) };
  } catch {
    /* mantém padrão */
  }
  return {
    id: String(r.id),
    week_start: String(r.week_start),
    week_end: String(r.week_end),
    boss_key: String(r.boss_key),
    boss_level: Number(r.boss_level),
    max_hp: Number(r.max_hp),
    difficulty: String(r.difficulty) as Difficulty,
    baseline,
    status: String(r.status) as RaidRow["status"],
    defeated_at: r.defeated_at == null ? null : String(r.defeated_at),
    rewarded_at: r.rewarded_at == null ? null : String(r.rewarded_at),
    final_damage: r.final_damage == null ? null : Number(r.final_damage),
  };
}

/** Média semanal de dano (sem efeitos) e de golpes por família nas semanas anteriores. */
async function computeBaseline(db: Client, ownerId: string, tz: string, weekStart: string) {
  const from = shiftDayKey(weekStart, -7 * RAID_RULES.baselineWeeks);
  const hits = await collectActivity(db, ownerId, tz, from, shiftDayKey(weekStart, -1));
  const strikes = strikesFromHits(hits, null);
  const families: Record<string, number> = {};
  for (const s of strikes) families[s.family] = (families[s.family] ?? 0) + 1;
  for (const k of Object.keys(families)) families[k] = Math.round((families[k]! / RAID_RULES.baselineWeeks) * 10) / 10;
  const total = strikes.reduce((a, s) => a + s.damage, 0);
  return { weeklyAvg: Math.round(total / RAID_RULES.baselineWeeks), families };
}

/** Garante a Raid da semana atual (criada na primeira leitura a partir de segunda). */
export async function ensureCurrentRaid(db: Client, ownerId: string): Promise<{ raid: RaidRow; tz: string; today: string }> {
  const { tz, today } = await userDayContext(db, ownerId);
  const wk = weekBounds(today);
  const existing = await db.execute({ sql: "SELECT * FROM raids WHERE owner_id = ? AND week_start = ?", args: [ownerId, wk.start] });
  if (existing.rows[0]) return { raid: mapRaid(existing.rows[0] as Record<string, unknown>), tz, today };

  const [settings, level, baseline] = await Promise.all([getRaidSettings(db, ownerId), userLevel(db, ownerId), computeBaseline(db, ownerId, tz, wk.start)]);
  const maxHp = computeMaxHp(baseline.weeklyAvg, settings.difficulty, level);
  await db.execute({
    sql: `INSERT OR IGNORE INTO raids (id, owner_id, week_start, week_end, boss_key, boss_level, max_hp, difficulty, baseline_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [nanoid(), ownerId, wk.start, wk.end, BOSSES[weekIndex(wk.start) % BOSSES.length]!.key, level, maxHp, settings.difficulty, JSON.stringify(baseline)],
  });
  const created = await db.execute({ sql: "SELECT * FROM raids WHERE owner_id = ? AND week_start = ?", args: [ownerId, wk.start] });
  return { raid: mapRaid(created.rows[0] as Record<string, unknown>), tz, today };
}

async function restDaysOf(db: Client, ownerId: string, from: string, to: string): Promise<Set<string>> {
  const [r, prefs] = await Promise.all([
    db.execute({ sql: "SELECT day_key FROM raid_rest_days WHERE owner_id = ? AND day_key >= ? AND day_key <= ?", args: [ownerId, from, to] }),
    getHolidayPrefs(db, ownerId),
  ]);
  const days = new Set(r.rows.map((x) => String(x.day_key)));
  // Trégua de feriado: o chefe não se cura em feriado (nacional ou local), se o usuário quiser.
  if (prefs.raidTruce) for (const d of (await holidayMap(db, ownerId, from, to)).keys()) days.add(d);
  return days;
}

async function evaluate(db: Client, ownerId: string, raid: RaidRow, tz: string, today: string) {
  const [hits, settings, restDays] = await Promise.all([
    collectActivity(db, ownerId, tz, raid.week_start, raid.week_end),
    getRaidSettings(db, ownerId),
    restDaysOf(db, ownerId, raid.week_start, raid.week_end),
  ]);
  const effect = effectForWeek(raid.week_start);
  const sim = simulateRaid(raid.max_hp, strikesFromHits(hits, effect), {
    weekStart: raid.week_start,
    weekEnd: raid.week_end,
    today,
    healingEnabled: settings.healingEnabled,
    restWeekdays: settings.restWeekdays,
    restDays,
  });
  return { sim, settings, effect, restDays };
}

/** Grava o desfecho e entrega a recompensa uma única vez (UPDATE condicional + award idempotente). */
async function settle(db: Client, ownerId: string, raid: RaidRow, sim: RaidSimulation, today: string): Promise<RaidRow> {
  const boss = BOSSES.find((b) => b.key === raid.boss_key) ?? BOSSES[0]!;
  if (sim.defeatedAt && raid.status !== "derrotado") {
    const upd = await db.execute({
      sql: "UPDATE raids SET status = 'derrotado', defeated_at = ?, final_damage = ? WHERE id = ? AND owner_id = ? AND status <> 'derrotado'",
      args: [sim.defeatedAt, sim.damage, raid.id, ownerId],
    });
    if (upd.rowsAffected > 0) {
      await recordWorldEvent(db, ownerId, {
        type: "raid_defeated",
        title: `${boss.name} derrotado!`,
        detail: `Raid de ${raid.week_start} a ${raid.week_end} · ${sim.damage.toLocaleString("pt-BR")} de dano.`,
        refId: raid.id,
      });
    }
    raid = { ...raid, status: "derrotado", defeated_at: sim.defeatedAt, final_damage: sim.damage };
  } else if (!sim.defeatedAt && raid.status === "ativa" && today > raid.week_end) {
    await db.execute({ sql: "UPDATE raids SET status = 'encerrada', final_damage = ? WHERE id = ? AND owner_id = ? AND status = 'ativa'", args: [sim.damage, raid.id, ownerId] });
    raid = { ...raid, status: "encerrada", final_damage: sim.damage };
  }
  if (raid.status === "derrotado" && !raid.rewarded_at) {
    const mult = RAID_RULES.difficulty[raid.difficulty];
    await award(
      db,
      ownerId,
      {
        sourceType: "raid",
        sourceId: raid.id,
        eventType: "defeated",
        xp: Math.round(RAID_RULES.reward.xp * mult),
        coins: Math.round(RAID_RULES.reward.coins * mult),
        label: `Chefe derrotado: ${boss.name}`,
      },
      today
    );
    await grantCollectionItem(db, ownerId, `trophy:raid:${raid.id}`, "raid", raid.id, `${boss.name} · semana de ${raid.week_start.split("-").reverse().join("/")}`);
    const at = new Date().toISOString();
    await db.execute({ sql: "UPDATE raids SET rewarded_at = ? WHERE id = ? AND owner_id = ? AND rewarded_at IS NULL", args: [at, raid.id, ownerId] });
    raid = { ...raid, rewarded_at: at };
  }
  return raid;
}

/** Fecha Raids de semanas passadas que ficaram sem leitura (derrota tardia ainda paga). */
async function settlePastRaids(db: Client, ownerId: string, tz: string, today: string) {
  const r = await db.execute({ sql: "SELECT * FROM raids WHERE owner_id = ? AND week_end < ? AND (status = 'ativa' OR (status = 'derrotado' AND rewarded_at IS NULL)) LIMIT 4", args: [ownerId, today] });
  for (const row of r.rows) {
    const raid = mapRaid(row as Record<string, unknown>);
    const { sim } = await evaluate(db, ownerId, raid, tz, today);
    await settle(db, ownerId, raid, sim, today);
  }
}

function objectivesFor(baseline: RaidRow["baseline"], strikes: Strike[]) {
  const done = (f: RaidFamily) => strikes.filter((s) => s.family === f).length;
  const avg = baseline.families;
  const target = (f: RaidFamily, fallback: number) => Math.max(1, Math.round((avg[f] ?? 0) > 0 ? avg[f]! : fallback));
  const items: Array<{ key: RaidFamily; label: string; target: number; done: number }> = [
    { key: "tarefas", label: "Concluir tarefas", target: target("tarefas", 8), done: done("tarefas") },
    { key: "treinos", label: "Treinar", target: target("treinos", 2), done: done("treinos") },
    { key: "leitura", label: "Ler (livros e artigos)", target: target("leitura", 2), done: done("leitura") },
  ];
  if ((avg.codigo ?? 0) > 0 || done("codigo") > 0) items.push({ key: "codigo", label: "Commits e PRs", target: target("codigo", 5), done: done("codigo") });
  if ((avg.habitos ?? 0) > 0 || done("habitos") > 0) items.push({ key: "habitos", label: "Check-ins de hábitos", target: target("habitos", 7), done: done("habitos") });
  return items.map((i) => ({ ...i, done: Math.min(i.done, i.target), complete: i.done >= i.target }));
}

export async function getRaidOverview(db: Client, ownerId: string) {
  const ensured = await ensureCurrentRaid(db, ownerId);
  const { tz, today } = ensured;
  await settlePastRaids(db, ownerId, tz, today);
  const { sim, settings, effect, restDays } = await evaluate(db, ownerId, ensured.raid, tz, today);
  const raid = await settle(db, ownerId, ensured.raid, sim, today);
  const boss = BOSSES.find((b) => b.key === raid.boss_key) ?? BOSSES[0]!;

  const byFamily: Record<string, number> = {};
  for (const s of sim.strikes) if (!s.afterDefeat) byFamily[s.family] = (byFamily[s.family] ?? 0) + s.damage;
  const mult = RAID_RULES.difficulty[raid.difficulty];
  const history = await db.execute({
    sql: "SELECT id, week_start, week_end, boss_key, max_hp, difficulty, status, defeated_at, final_damage FROM raids WHERE owner_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 12",
    args: [ownerId, raid.week_start],
  });
  const state = raid.status === "derrotado" ? "derrotado" : raid.status === "encerrada" ? "encerrada" : sim.damage === 0 ? "nao_iniciada" : "em_batalha";
  const holidays = await holidayMap(db, ownerId, raid.week_start, raid.week_end);
  const weekDays: Array<{ day: string; damage: number; heal: number; rest: boolean; future: boolean; holiday: string | null }> = [];
  for (let d = raid.week_start; d <= raid.week_end; d = shiftDayKey(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    weekDays.push({
      day: d,
      damage: sim.strikes.filter((s) => s.day === d && !s.afterDefeat).reduce((a, s) => a + s.damage, 0),
      heal: sim.heals.find((h) => h.day === d)?.amount ?? 0,
      rest: settings.restWeekdays.includes(wd) || restDays.has(d),
      future: d > today,
      holiday: holidays.get(d) ?? null,
    });
  }

  return {
    today,
    state,
    boss: { ...boss, level: raid.boss_level },
    raid: {
      id: raid.id,
      weekStart: raid.week_start,
      weekEnd: raid.week_end,
      endsAt: localDayRangeUtc(raid.week_end, tz).end,
      maxHp: raid.max_hp,
      hp: sim.hp,
      difficulty: raid.difficulty,
      status: raid.status,
      defeatedAt: raid.defeated_at,
      rewarded: Boolean(raid.rewarded_at),
      baselineWeeklyAvg: raid.baseline.weeklyAvg,
    },
    damage: { total: sim.damage, byFamily, strikes: sim.strikes.length },
    recentStrikes: [...sim.strikes].reverse().slice(0, 12).map(({ id, family, kind, at, label, damage, afterDefeat }) => ({ id, family, kind, at, label, damage, afterDefeat })),
    healing: { total: sim.healed, days: sim.heals, enabled: settings.healingEnabled, capPct: RAID_RULES.healCapPctPerWeek * 100, perDayPct: RAID_RULES.healPctPerIdleDay * 100 },
    weekDays,
    effect: { key: effect.key, name: effect.name, description: effect.description, pct: effect.pct, families: effect.families },
    objectives: objectivesFor(raid.baseline, sim.strikes.filter((s) => !s.afterDefeat)),
    rewards: { xp: Math.round(RAID_RULES.reward.xp * mult), coins: Math.round(RAID_RULES.reward.coins * mult), trophy: `${boss.name} derrotado`, monument: true },
    settings,
    damageTable: Object.fromEntries(Object.entries(RAID_DAMAGE).map(([k, v]) => [k, v.base])),
    history: history.rows.map((h) => ({
      id: String(h.id),
      weekStart: String(h.week_start),
      weekEnd: String(h.week_end),
      boss: (BOSSES.find((b) => b.key === String(h.boss_key)) ?? BOSSES[0]!).name,
      maxHp: Number(h.max_hp),
      difficulty: String(h.difficulty),
      status: String(h.status),
      defeatedAt: h.defeated_at == null ? null : String(h.defeated_at),
      finalDamage: h.final_damage == null ? null : Number(h.final_damage),
    })),
  };
}

/** Troféus de chefes derrotados (Coleção, Vila e Timeline). */
export async function raidTrophies(db: Client, ownerId: string) {
  const r = await db.execute({
    sql: "SELECT id, week_start, week_end, boss_key, difficulty, defeated_at FROM raids WHERE owner_id = ? AND status = 'derrotado' ORDER BY week_start DESC",
    args: [ownerId],
  });
  return r.rows.map((x) => ({
    id: String(x.id),
    bossKey: String(x.boss_key),
    bossName: (BOSSES.find((b) => b.key === String(x.boss_key)) ?? BOSSES[0]!).name,
    weekStart: String(x.week_start),
    weekEnd: String(x.week_end),
    difficulty: String(x.difficulty),
    defeatedAt: String(x.defeated_at),
  }));
}

/** Resumo leve para a Vila (sem recalcular histórico). */
export async function raidWorldStatus(db: Client, ownerId: string) {
  const o = await getRaidOverview(db, ownerId);
  return { state: o.state, hpPct: Math.round((o.raid.hp / o.raid.maxHp) * 100), bossName: o.boss.name, trophies: (await raidTrophies(db, ownerId)).length };
}
