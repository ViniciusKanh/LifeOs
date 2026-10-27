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
    // Fuso fixo de São Paulo em todos os testes, em qualquer SO (inclusive
    // CI do GitHub Actions, onde isso quebrava). Precisa ser passado como
    // env do processo do worker, não só reatribuído em setup.ts: o V8
    // resolve e fixa o timezone ao criar o worker/isolate, então mudar
    // process.env.TZ depois (dentro do próprio teste) não tem mais efeito.
    // "forks" (child_process) respeita poolOptions.forks.env de verdade;
    // o pool padrão "threads" (worker_threads) não repassava a tempo.
    pool: "forks",
    poolOptions: { forks: { env: { TZ: "America/Sao_Paulo" } } },
  },
});
