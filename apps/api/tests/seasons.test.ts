import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createAuthenticatedAgent } from "./helpers.js";
import { getDb } from "../src/db/client.js";
import {
  daysLeftInSeason,
  parseSeasonRewardKey,
  previousSeasonKey,
  seasonRange,
  seasonRewardKey,
  seasonTheme,
  tierForXp,
} from "../src/services/seasonRules.js";
import { closePreviousSeason, getSeason } from "../src/services/seasonsService.js";
import { getInventory } from "../src/services/inventoryService.js";

async function xp(ownerId: string, dayKey: string, amount: number) {
  await getDb().execute({
    sql: "INSERT INTO xp_events (id, owner_id, source_type, source_id, event_type, xp, label, day_key) VALUES (?, ?, 'review', ?, 'seed', ?, 'seed', ?)",
    args: [nanoid(), ownerId, nanoid(), amount, dayKey],
  });
}

describe("Temporadas — regras puras", () => {
  it("nome temático fixo por mês e intervalos corretos", () => {
    expect(seasonTheme("2026-10").name).toBe("Temporada da Colheita");
    expect(seasonTheme("2027-10").name).toBe("Temporada da Colheita");
    expect(seasonRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(previousSeasonKey("2027-01")).toBe("2026-12");
    expect(daysLeftInSeason("2026-10-23")).toBe(8);
    expect(daysLeftInSeason("2026-10-31")).toBe(0);
  });

  it("tiers por limiar de XP", () => {
    expect(tierForXp(0)).toBe(0);
    expect(tierForXp(99)).toBe(0);
    expect(tierForXp(100)).toBe(1);
    expect(tierForXp(650)).toBe(3);
    expect(tierForXp(99_999)).toBe(6);
    expect(parseSeasonRewardKey(seasonRewardKey("2026-10", 4))).toEqual({ seasonKey: "2026-10", tier: 4 });
    expect(parseSeasonRewardKey("frame:gold")).toBeNull();
  });
});

describe("Temporadas — serviço", () => {
  it("XP do mês, cosméticos no inventário e fechamento idempotente da anterior", async () => {
    const { userId } = await createAuthenticatedAgent();
    const { userId: other } = await createAuthenticatedAgent();
    const db = getDb();
    await xp(userId, "2026-09-10", 200);
    await xp(userId, "2026-09-25", 150);
    await xp(userId, "2026-10-02", 120);
    await xp(other, "2026-10-02", 5000);

    const s = await getSeason(db, userId, "2026-10-23");
    expect(s).toMatchObject({ seasonKey: "2026-10", name: "Temporada da Colheita", xp: 120, tier: 1, daysLeft: 8 });
    expect(s.nextTier).toMatchObject({ tier: 2, missing: 180 });
    expect(s.tiers.filter((t) => t.unlocked).map((t) => t.tier)).toEqual([1]);
    expect(s.previous).toMatchObject({ seasonKey: "2026-09", xp: 350, tier: 2 });

    // Idempotente: repetir não duplica resumo nem cosméticos.
    await getSeason(db, userId, "2026-10-23");
    await closePreviousSeason(db, userId, "2026-10-23");
    const sums = await db.execute({ sql: "SELECT COUNT(*) AS n FROM season_summaries WHERE owner_id = ?", args: [userId] });
    expect(Number(sums.rows[0].n)).toBe(1);
    const tx = await db.execute({ sql: "SELECT item_key FROM inventory_transactions WHERE owner_id = ? AND source_type = 'season' ORDER BY item_key", args: [userId] });
    expect(tx.rows.map((r) => String(r.item_key))).toEqual(["season:2026-09:t1", "season:2026-09:t2", "season:2026-10:t1"]);

    const inv = await getInventory(db, userId);
    const seasonItems = inv.items.filter((i) => i.key.startsWith("season:"));
    expect(seasonItems).toHaveLength(3);
    expect(seasonItems.every((i) => i.type === "cosmetic" && i.actions.length === 0)).toBe(true);

    // Isolamento: o XP do outro usuário não entra.
    const o = await getSeason(db, other, "2026-10-23");
    expect(o.xp).toBe(5000);
    expect(o.previous).toBeNull();
  });

  it("mês anterior sem atividade não gera resumo", async () => {
    const { userId } = await createAuthenticatedAgent();
    expect(await closePreviousSeason(getDb(), userId, "2026-10-05")).toBeNull();
  });
});
