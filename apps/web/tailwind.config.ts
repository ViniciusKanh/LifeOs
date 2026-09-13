import type { Config } from "tailwindcss";

/**
 * Tokens de identidade visual do LifeOS — linha "SaaS moderno" (v2).
 * Fundo off-white azulado, cartões brancos com borda suave e sombra
 * discreta, uma cor de marca (índigo) para navegação/links e um
 * acento âmbar reservado para ações primárias (CTAs). Cores de
 * categoria (blue/purple/green/pink) identificam cada módulo em
 * badges de ícone e barras de progresso, sempre com o mesmo
 * significado em toda a aplicação.
 *
 * Modo escuro (v3): em vez de um azul-marinho plano (que deixava os
 * cartões "grudados" no fundo, sem profundidade), a escala "ink" ganhou
 * um degradê de 4 tons com uma leve nota violeta — o fundo é o mais
 * escuro, o cartão ("raised") já é visivelmente mais claro, e existe
 * um tom extra ("overlay") só para hover/estados ativos. Isso some
 * com o "shadow-card-dark" (ver abaixo), que substitui a sombra por um
 * brilho sutil na borda superior do cartão — sombra não se vê sobre
 * fundo escuro, mas um highlight sim.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fundo/superfícies — modo escuro
        ink: {
          DEFAULT: "#0A0E17",
          raised: "#141A29",
          overlay: "#1C2438",
          border: "#28324A",
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
        // Cores de categoria — mesmo significado em todo o app.
        // Os pares "dark" são a mesma cor levemente clareada, usada
        // com "dark:text-cat-blue-dark" etc. para manter contraste
        // AA sobre o fundo escuro (as versões base ficam um pouco
        // "surdas" sobre #0A0E17).
        cat: {
          blue: "#3B82F6",
          "blue-dark": "#60A5FA",
          purple: "#8B5CF6",
          "purple-dark": "#A78BFA",
          green: "#16A34A",
          "green-dark": "#4ADE80",
          pink: "#EC4899",
          "pink-dark": "#F472B6",
          teal: "#0D9488",
          "teal-dark": "#2DD4BF",
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
        "card-dark": "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 10px 28px -14px rgba(0,0,0,0.65)",
        "glow-brand": "0 0 0 1px rgba(91,110,245,0.35), 0 8px 28px -10px rgba(91,110,245,0.45)",
      },
      backgroundImage: {
        "ink-wash": "radial-gradient(120% 140% at 100% 0%, rgba(91,110,245,0.16) 0%, rgba(91,110,245,0) 55%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
