import { describe, expect, it } from "vitest";
import { countExportedRows, exportFileName } from "./exportService";

describe("exportar meus dados", () => {
  it("nome do arquivo usa a data local", () => {
    expect(exportFileName("2026-10-22")).toBe("lifeos-export-2026-10-22.json");
    expect(exportFileName()).toMatch(/^lifeos-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("conta os registros de todas as tabelas", () => {
    expect(countExportedRows({ data: { tasks: [{}, {}], habits: [{}], vazia: [] } })).toBe(3);
    expect(countExportedRows({ data: {} })).toBe(0);
  });
});
