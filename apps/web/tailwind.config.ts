import type { Config } from "tailwindcss";

/**
 * Tokens de identidade visual do LifeOS — linha "SaaS moderno" (v2).
 * Fundo off-white azulado, cartões brancos com borda suave e sombra
 * discreta, uma cor de marca (índigo) para navegação/links e um
 * acento âmbar reservado para ações primárias (CTAs). Cores de
 * categoria (blue/purple/green/pink) identificam cada módulo em
 * badges de ícone e barras de progresso, sempre com o mesmo
 * significado em toda a aplicação.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fundo/superfícies
        ink: {
          DEFAULT: "#0F1420",
          raised: "#171E2E",
          border: "#2A3346",
        },
        paper: {
          DEFAULT: "#F6F7FB",
          raised: "#FFFFFF",
          border: "#E6E9F2",
        },
        // Marca — navegação ativa, links, ícone do logo
        brand: {
          50: "#EEF1FF",
          100: "#E0E5FF",
          500: "#5B6EF5",
          600: "#4C5FE0",
          700: "#3F4FC4",
        },
        // Acento de ação (CTAs primários)
        signal: {
          DEFAULT: "#F0A93B",
          deep: "#D9860F",
        },
        slate: "#6B7690",
        growth: "#22A06B",
        drop: "#E5484D",
        // Cores de categoria — mesmo significado em todo o app
        cat: {
          blue: "#3B82F6",
          purple: "#8B5CF6",
          green: "#16A34A",
          pink: "#EC4899",
          teal: "#0D9488",
        },
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
