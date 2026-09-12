import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo/favicon-32.png", "logo/icon-192.png", "logo/icon-512.png"],
      manifest: {
        name: "LifeOS — Transforme sua rotina em progresso",
        short_name: "LifeOS",
        description: "Transforme sua rotina em progresso.",
        theme_color: "#14181F",
        background_color: "#14181F",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/logo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/logo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache básico de shell: preparado para evoluir com sincronização
        // offline de tarefas/hábitos/leitura (ver seção 47 do briefing).
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
