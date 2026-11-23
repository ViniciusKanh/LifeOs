import type { Client } from "@libsql/client";
import { nanoid } from "nanoid";
import type { Rarity } from "../config/codex.js";

/**
 * Itens da Coleção vindos dos sistemas de aventura (troféus de chefes, acessórios
 * do Companheiro, troféus Steam fixados). Ficam no ledger existente
 * (inventory_transactions) com chaves prefixadas; a UNIQUE do ledger garante que
 * cada item é concedido uma única vez.
 */

export interface AdventureItemInfo {
  name: string;
  description: string;
  rarity: Rarity;
  art: string;
  effectText: string;
  obtainedBy: string;
}

export async function grantCollectionItem(db: Client, ownerId: string, itemKey: string, sourceType: string, sourceId: string, label: string) {
  await db.execute({
    sql: `INSERT INTO inventory_transactions (id, owner_id, item_key, type, quantity, source_type, source_id, label)
          VALUES (?, ?, ?, 'acquire', 1, ?, ?, ?) ON CONFLICT DO NOTHING`,
    args: [nanoid(), ownerId, itemKey, sourceType, sourceId, label.slice(0, 200)],
  });
}

export async function revokeCollectionItem(db: Client, ownerId: string, itemKey: string) {
  await db.execute({ sql: "DELETE FROM inventory_transactions WHERE owner_id = ? AND item_key = ? AND type = 'acquire'", args: [ownerId, itemKey] });
}

/** Rótulos dos itens a partir da própria chave (nada é inventado: o rótulo vem da concessão). */
export function describeAdventureItem(key: string, label: string | null): AdventureItemInfo | null {
  if (key.startsWith("trophy:raid:")) {
    return {
      name: label ?? "Troféu de Chefe",
      description: "Troféu de um Chefe da Semana derrotado com atividades reais.",
      rarity: "epic",
      art: "emblem",
      effectText: "Troféu — exibido na Arena dos Chefes",
      obtainedBy: "Derrotar o Chefe da Semana",
    };
  }
  if (key.startsWith("petacc:")) {
    return {
      name: label ?? "Acessório do Companheiro",
      description: "Acessório cosmético para o seu Companheiro.",
      rarity: "uncommon",
      art: "emblem",
      effectText: "Aparência do Companheiro — sem bônus",
      obtainedBy: "Evolução e rotina do Companheiro",
    };
  }
  if (key.startsWith("trophy:steam:")) {
    return {
      name: label ?? "Troféu Steam",
      description: "Conquista real da Steam fixada como troféu cosmético.",
      rarity: "rare",
      art: "title",
      effectText: "Cosmético — sem bônus de jogo",
      obtainedBy: "Conquista Steam importada",
    };
  }
  return null;
}
