import { describe, expect, it } from "vitest";
import { LEDGER_CATEGORIES, ledgerCategoryByKey, ledgerCategoryOf } from "./ledgerCategory";

describe("ledgerCategoryOf — categoria visual do extrato a partir do source_type real", () => {
  it("mapeia source_types conhecidos para a categoria correta", () => {
    expect(ledgerCategoryOf("task").key).toBe("missoes");
    expect(ledgerCategoryOf("habit_streak").key).toBe("habitos");
    expect(ledgerCategoryOf("bank_loan").key).toBe("banco");
  });

  it("source_type desconhecido cai em 'Outros' em vez de quebrar ou inventar categoria", () => {
    const fallback = ledgerCategoryOf("algo-que-nao-existe");
    expect(fallback.key).toBe("outros");
    expect(fallback.label).toBe("Outros");
  });

  it("cada source_type pertence a exatamente uma categoria (sem sobreposição no catálogo)", () => {
    const seen = new Map<string, string>();
    for (const cat of LEDGER_CATEGORIES) {
      for (const sourceType of cat.sourceTypes) {
        expect(seen.has(sourceType)).toBe(false);
        seen.set(sourceType, cat.key);
      }
    }
  });
});

describe("ledgerCategoryByKey — lookup pelo key do filtro selecionado", () => {
  it("encontra uma categoria existente", () => {
    expect(ledgerCategoryByKey("foco")?.label).toBe("Foco");
  });

  it("devolve undefined para um key que não existe no catálogo", () => {
    expect(ledgerCategoryByKey("inexistente")).toBeUndefined();
  });
});
