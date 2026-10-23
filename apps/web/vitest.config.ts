import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes de unidade do front (utilitários puros e hooks sem DOM).
 * Config separada do vite.config.ts para não carregar o plugin de PWA.
 * Ambiente "node": não há jsdom no projeto — componentes não são testados aqui.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
