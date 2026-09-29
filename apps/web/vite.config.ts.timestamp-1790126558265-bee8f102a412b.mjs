// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///sessions/rcw-01ud1ztzjjvnzwizumfdawkq/mnt/LifeOS/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/rcw-01ud1ztzjjvnzwizumfdawkq/mnt/LifeOS/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/rcw-01ud1ztzjjvnzwizumfdawkq/mnt/LifeOS/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_import_meta_url = "file:///sessions/rcw-01ud1ztzjjvnzwizumfdawkq/mnt/LifeOS/apps/web/vite.config.ts";
var vite_config_default = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest (em vez de generateSW): o service worker agora é
      // escrito à mão (src/sw.ts) porque precisa reagir a eventos 'push'
      // e 'notificationclick' (Web Push/VAPID) — o generateSW automático
      // não permite código customizado, só cache de shell.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // Mesmo padrão de arquivos que o generateSW cacheava antes.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      },
      registerType: "autoUpdate",
      includeAssets: ["logo/favicon-32.png", "logo/icon-192.png", "logo/icon-512.png"],
      manifest: {
        name: "LifeOS \u2014 Transforme sua rotina em progresso",
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
          { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    // Code-splitting: cada rota já vira um chunk via React.lazy (App.tsx);
    // aqui separamos as libs pesadas usadas só por parte do app (gráficos,
    // formulários) do vendor principal, pra elas só baixarem quando a
    // tela que precisa delas é visitada.
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvcmN3LTAxdWQxenR6amp2bnp3aXp1bWZkYXdrcS9tbnQvTGlmZU9TL2FwcHMvd2ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvcmN3LTAxdWQxenR6amp2bnp3aXp1bWZkYXdrcS9tbnQvTGlmZU9TL2FwcHMvd2ViL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9yY3ctMDF1ZDF6dHpqanZuendpenVtZmRhd2txL21udC9MaWZlT1MvYXBwcy93ZWIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tIFwibm9kZTp1cmxcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmNcIiwgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgfSxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICAvLyBpbmplY3RNYW5pZmVzdCAoZW0gdmV6IGRlIGdlbmVyYXRlU1cpOiBvIHNlcnZpY2Ugd29ya2VyIGFnb3JhIFx1MDBFOVxuICAgICAgLy8gZXNjcml0byBcdTAwRTAgbVx1MDBFM28gKHNyYy9zdy50cykgcG9ycXVlIHByZWNpc2EgcmVhZ2lyIGEgZXZlbnRvcyAncHVzaCdcbiAgICAgIC8vIGUgJ25vdGlmaWNhdGlvbmNsaWNrJyAoV2ViIFB1c2gvVkFQSUQpIFx1MjAxNCBvIGdlbmVyYXRlU1cgYXV0b21cdTAwRTF0aWNvXG4gICAgICAvLyBuXHUwMEUzbyBwZXJtaXRlIGNcdTAwRjNkaWdvIGN1c3RvbWl6YWRvLCBzXHUwMEYzIGNhY2hlIGRlIHNoZWxsLlxuICAgICAgc3RyYXRlZ2llczogXCJpbmplY3RNYW5pZmVzdFwiLFxuICAgICAgc3JjRGlyOiBcInNyY1wiLFxuICAgICAgZmlsZW5hbWU6IFwic3cudHNcIixcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XG4gICAgICAgIC8vIE1lc21vIHBhZHJcdTAwRTNvIGRlIGFycXVpdm9zIHF1ZSBvIGdlbmVyYXRlU1cgY2FjaGVhdmEgYW50ZXMuXG4gICAgICAgIGdsb2JQYXR0ZXJuczogW1wiKiovKi57anMsY3NzLGh0bWwsc3ZnLHBuZyxpY299XCJdLFxuICAgICAgfSxcbiAgICAgIHJlZ2lzdGVyVHlwZTogXCJhdXRvVXBkYXRlXCIsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbXCJsb2dvL2Zhdmljb24tMzIucG5nXCIsIFwibG9nby9pY29uLTE5Mi5wbmdcIiwgXCJsb2dvL2ljb24tNTEyLnBuZ1wiXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6IFwiTGlmZU9TIFx1MjAxNCBUcmFuc2Zvcm1lIHN1YSByb3RpbmEgZW0gcHJvZ3Jlc3NvXCIsXG4gICAgICAgIHNob3J0X25hbWU6IFwiTGlmZU9TXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRyYW5zZm9ybWUgc3VhIHJvdGluYSBlbSBwcm9ncmVzc28uXCIsXG4gICAgICAgIHRoZW1lX2NvbG9yOiBcIiMxNDE4MUZcIixcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogXCIjMTQxODFGXCIsXG4gICAgICAgIGRpc3BsYXk6IFwic3RhbmRhbG9uZVwiLFxuICAgICAgICBzdGFydF91cmw6IFwiL1wiLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiBcIi9sb2dvL2ljb24tMTkyLnBuZ1wiLCBzaXplczogXCIxOTJ4MTkyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwiYW55XCIgfSxcbiAgICAgICAgICB7IHNyYzogXCIvbG9nby9pY29uLTUxMi5wbmdcIiwgc2l6ZXM6IFwiNTEyeDUxMlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcImFueVwiIH0sXG4gICAgICAgICAgeyBzcmM6IFwiL2xvZ28vaWNvbi0xOTIucG5nXCIsIHNpemVzOiBcIjE5MngxOTJcIiwgdHlwZTogXCJpbWFnZS9wbmdcIiwgcHVycG9zZTogXCJtYXNrYWJsZVwiIH0sXG4gICAgICAgICAgeyBzcmM6IFwiL2xvZ28vaWNvbi01MTIucG5nXCIsIHNpemVzOiBcIjUxMng1MTJcIiwgdHlwZTogXCJpbWFnZS9wbmdcIiwgcHVycG9zZTogXCJtYXNrYWJsZVwiIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICB9LFxuICBidWlsZDoge1xuICAgIC8vIENvZGUtc3BsaXR0aW5nOiBjYWRhIHJvdGEgalx1MDBFMSB2aXJhIHVtIGNodW5rIHZpYSBSZWFjdC5sYXp5IChBcHAudHN4KTtcbiAgICAvLyBhcXVpIHNlcGFyYW1vcyBhcyBsaWJzIHBlc2FkYXMgdXNhZGFzIHNcdTAwRjMgcG9yIHBhcnRlIGRvIGFwcCAoZ3JcdTAwRTFmaWNvcyxcbiAgICAvLyBmb3JtdWxcdTAwRTFyaW9zKSBkbyB2ZW5kb3IgcHJpbmNpcGFsLCBwcmEgZWxhcyBzXHUwMEYzIGJhaXhhcmVtIHF1YW5kbyBhXG4gICAgLy8gdGVsYSBxdWUgcHJlY2lzYSBkZWxhcyBcdTAwRTkgdmlzaXRhZGEuXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIGNoYXJ0czogW1wicmVjaGFydHNcIl0sXG4gICAgICAgICAgZm9ybXM6IFtcInJlYWN0LWhvb2stZm9ybVwiLCBcIkBob29rZm9ybS9yZXNvbHZlcnNcIiwgXCJ6b2RcIl0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1csU0FBUyxlQUFlLFdBQVc7QUFDblksU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUhvTSxJQUFNLDJDQUEyQztBQU03USxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLGNBQWMsSUFBSSxJQUFJLFNBQVMsd0NBQWUsQ0FBQztBQUFBLElBQ3REO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLTixZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixnQkFBZ0I7QUFBQTtBQUFBLFFBRWQsY0FBYyxDQUFDLGdDQUFnQztBQUFBLE1BQ2pEO0FBQUEsTUFDQSxjQUFjO0FBQUEsTUFDZCxlQUFlLENBQUMsdUJBQXVCLHFCQUFxQixtQkFBbUI7QUFBQSxNQUMvRSxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsVUFDTCxFQUFFLEtBQUssc0JBQXNCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxNQUFNO0FBQUEsVUFDakYsRUFBRSxLQUFLLHNCQUFzQixPQUFPLFdBQVcsTUFBTSxhQUFhLFNBQVMsTUFBTTtBQUFBLFVBQ2pGLEVBQUUsS0FBSyxzQkFBc0IsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLFdBQVc7QUFBQSxVQUN0RixFQUFFLEtBQUssc0JBQXNCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxXQUFXO0FBQUEsUUFDeEY7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLEVBQ1I7QUFBQSxFQUNBLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBS0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sY0FBYztBQUFBLFVBQ1osUUFBUSxDQUFDLFVBQVU7QUFBQSxVQUNuQixPQUFPLENBQUMsbUJBQW1CLHVCQUF1QixLQUFLO0FBQUEsUUFDekQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
