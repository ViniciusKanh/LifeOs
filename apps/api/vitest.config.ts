import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Testes de integração tocam um banco SQLite real (arquivo
    // temporário por execução) — rodar em série evita duas suites
    // disputando a mesma transação/tabela ao mesmo tempo.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
