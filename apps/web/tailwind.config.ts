import type { Config } from "tailwindcss";

/**
 * Tokens de identidade visual do LifeOS.
 * Ink (grafite-azulado) no lugar de preto puro, papel morno no
 * lugar de creme-clichê, âmbar como cor de "sinal de progresso".
 * Ver DESIGN_SYSTEM.md para o racional completo.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14181F",
          raised: "#1B2029",
          border: "#272E3A",
        },
        paper: {
          DEFAULT: "#F6F4EF",
          raised: "#FFFFFF",
          border: "#E4E0D6",
        },
        signal: {
          DEFAULT: "#E8A33D",
          deep: "#B87A22",
        },
        slate: "#5B6B7A",
        growth: "#4F8F63",
        drop: "#C75146",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
