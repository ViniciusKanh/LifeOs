import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * `--mode desktop` gera o frontend do LifeOS Desktop (Tauri 2): sem PWA/Service
 * Worker, saída em dist-desktop e API absoluta (a janela nativa não tem o proxy
 * /api da Vercel). A URL da API é pública; nenhum segredo entra no bundle.
 */
const DEFAULT_DESKTOP_API_URL = "https://lifeos-sigma-five.vercel.app/api";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
  define: desktop
    ? {
        "import.meta.env.VITE_PLATFORM": JSON.stringify("desktop"),
        "import.meta.env.VITE_API_URL": JSON.stringify(process.env.LIFEOS_DESKTOP_API_URL ?? DEFAULT_DESKTOP_API_URL),
      }
    : {},
  // No `tauri dev` a saída do Vite fica visível junto com a do Rust.
  clearScreen: !desktop,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    !desktop && VitePWA({
      // injectManifest (em vez de generateSW): o service worker agora é
      // escrito à mão (src/sw.ts) porque precisa reagir a eventos 'push'
      // e 'notificationclick' (Web Push/VAPID) — o generateSW automático
      // não permite código customizado, só cache de shell.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // Mesmo padrão de arquivos que o generateSW cacheava antes.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
      registerType: "autoUpdate",
      includeAssets: ["logo/favicon-32.png", "logo/icon-192.png", "logo/icon-512.png"],
      manifest: {
        name: "LifeOS — Transforme sua rotina em progresso",
        short_name: "LifeOS",
        description: "Transforme sua rotina em progresso.",
        theme_color: "#14181F",
        background_color: "#14181F",
        display: "standalone",
        start_url: "/dashboard",
        // Compartilhar do celular (menu "Compartilhar" do Android/Windows) → /compartilhar
        // já com título, texto e link preenchidos para virar Inbox, nota ou tarefa.
        share_target: {
          action: "/compartilhar",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
        shortcuts: [
          { name: "Captura rápida", short_name: "Capturar", url: "/compartilhar", icons: [{ src: "/logo/icon-192.png", sizes: "192x192" }] },
          { name: "Hoje", url: "/hoje", icons: [{ src: "/logo/icon-192.png", sizes: "192x192" }] },
          { name: "Nova nota", url: "/notas?nova=1", icons: [{ src: "/logo/icon-192.png", sizes: "192x192" }] },
        ],
        icons: [
          { src: "/logo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/logo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: desktop,
  },
  build: {
    outDir: desktop ? "dist-desktop" : "dist",
    // Code-splitting: cada rota já vira um chunk via React.lazy (App.tsx);
    // aqui separamos as libs pesadas usadas só por parte do app (gráficos,
    // formulários) do vendor principal, pra elas só baixarem quando a
    // tela que precisa delas é visitada.
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
};
});
