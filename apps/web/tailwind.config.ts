import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Tokens de identidade visual do LifeOS — linha "energia/progresso" (v4).
 * Antes disso o app usava o kit "SaaS genérico": índigo neutro + âmbar
 * discreto + Inter em tudo. Essa v4 puxa pra uma identidade mais viva e
 * autoral, alinhada ao conceito Planejar → Executar → Registrar → Medir
 * → Melhorar: violeta elétrico como cor estrutural (navegação, links,
 * ícone do logo) e um gradiente quente âmbar→coral ("signal") reservado
 * só pra CTAs e destaques de progresso — a ideia de "acender" uma ação.
 * Cores de categoria (blue/purple/green/pink/teal) continuam com o
 * mesmo significado em toda a aplicação, só ganharam mais saturação.
 *
 * Tipografia: Bricolage Grotesque para títulos/números de destaque (tem
 * personalidade própria, não é só "Inter maior e bold") + Inter pro
 * corpo de texto e UI, onde legibilidade em telas densas importa mais.
 *
 * Modo escuro: em vez de um azul-marinho plano, a escala "ink" tem um
 * degradê de 4 tons com nota violeta — fundo mais escuro, cartão
 * ("raised") visivelmente mais claro, e um tom extra ("overlay") só
 * pra hover/estados ativos. O "shadow-card-dark" substitui a sombra
 * por um brilho sutil na borda superior do cartão — sombra não se vê
 * sobre fundo escuro, mas um highlight sim.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fundo/superfícies — modo escuro
        // A escala "ink" lê variáveis CSS (index.css): no tema RPG ela vira o
        // navy do RPG, e as telas ainda não migradas já herdam a paleta certa.
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          raised: "rgb(var(--ink-raised) / <alpha-value>)",
          overlay: "rgb(var(--ink-overlay) / <alpha-value>)",
          border: "rgb(var(--ink-border) / <alpha-value>)",
        },
        // Tema RPG (pixel art) — tokens centralizados em index.css (.rpg).
        rpg: {
          bg: "rgb(var(--rpg-bg) / <alpha-value>)",
          "bg-2": "rgb(var(--rpg-bg-secondary) / <alpha-value>)",
          panel: "rgb(var(--rpg-panel) / <alpha-value>)",
          "panel-light": "rgb(var(--rpg-panel-light) / <alpha-value>)",
          "panel-hover": "rgb(var(--rpg-panel-hover) / <alpha-value>)",
          gold: "rgb(var(--rpg-gold) / <alpha-value>)",
          "gold-light": "rgb(var(--rpg-gold-light) / <alpha-value>)",
          bronze: "rgb(var(--rpg-bronze) / <alpha-value>)",
          purple: "rgb(var(--rpg-purple) / <alpha-value>)",
          blue: "rgb(var(--rpg-blue) / <alpha-value>)",
          green: "rgb(var(--rpg-green) / <alpha-value>)",
          red: "rgb(var(--rpg-red) / <alpha-value>)",
          orange: "rgb(var(--rpg-orange) / <alpha-value>)",
          cyan: "rgb(var(--rpg-cyan) / <alpha-value>)",
          pink: "rgb(var(--rpg-pink) / <alpha-value>)",
          text: "rgb(var(--rpg-text) / <alpha-value>)",
          muted: "rgb(var(--rpg-text-muted) / <alpha-value>)",
          border: "rgb(var(--rpg-border) / <alpha-value>)",
          parchment: "rgb(var(--rpg-parchment) / <alpha-value>)",
          ink: "rgb(var(--rpg-parchment-ink) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "#F6F4FB",
          raised: "#FFFFFF",
          border: "#E8E2F3",
        },
        // Marca — navegação ativa, links, ícone do logo (violeta elétrico)
        brand: {
          50: "#F1ECFF",
          100: "#E3D8FF",
          500: "#7C4DFF",
          600: "#6935E8",
          700: "#5A2BC7",
        },
        // Acento de ação (CTAs primários) — gradiente quente, "acende" a ação
        signal: {
          DEFAULT: "#FF7A45",
          deep: "#E8551F",
        },
        slate: "rgb(var(--slate) / <alpha-value>)",
        growth: "#12B76A",
        drop: "#FF4757",
        // Cores de categoria — mesmo significado em todo o app.
        // Os pares "dark" são a mesma cor levemente clareada, usada
        // com "dark:text-cat-blue-dark" etc. para manter contraste
        // AA sobre o fundo escuro (as versões base ficam um pouco
        // "surdas" sobre #0A0912).
        cat: {
          blue: "#2F80FF",
          "blue-dark": "#5B9CFF",
          purple: "#9550FF",
          "purple-dark": "#B37CFF",
          green: "#12B76A",
          "green-dark": "#4ADE94",
          pink: "#FF3D93",
          "pink-dark": "#FF6BAF",
          teal: "#08B6A6",
          "teal-dark": "#3AD9C9",
        },
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        // RPG: serifa clássica para títulos e fonte pixel só em rótulos curtos.
        rpg: ["Cinzel", "Georgia", "serif"],
        pixel: ["Pixelify Sans", "Inter", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        "card-dark": "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 10px 28px -14px rgba(0,0,0,0.65)",
        "glow-brand": "0 0 0 1px rgba(124,77,255,0.35), 0 8px 28px -10px rgba(124,77,255,0.5)",
        "glow-signal": "0 8px 24px -8px rgba(232,85,31,0.55)",
        rpg: "var(--rpg-shadow)",
        "rpg-inset": "var(--rpg-shadow-inset)",
      },
      backgroundImage: {
        "ink-wash": "radial-gradient(120% 140% at 100% 0%, rgba(124,77,255,0.18) 0%, rgba(124,77,255,0) 55%)",
        aurora:
          "radial-gradient(60% 90% at 10% 0%, rgba(124,77,255,0.30) 0%, rgba(124,77,255,0) 60%), radial-gradient(50% 80% at 100% 0%, rgba(255,122,69,0.28) 0%, rgba(255,122,69,0) 55%)",
      },
      // Comemoração de troféu (seção Conquistas) — um único momento
      // orquestrado (entrada) em vez de efeitos espalhados: o medalhão
      // "estala" pra dentro enquanto um brilho varre a superfície uma vez.
      keyframes: {
        "trophy-in": {
          "0%": { opacity: "0", transform: "translateY(-16px) scale(0.85)" },
          "60%": { opacity: "1", transform: "translateY(2px) scale(1.04)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "trophy-shine": {
          "0%": { transform: "translateX(-120%) rotate(20deg)" },
          "100%": { transform: "translateX(220%) rotate(20deg)" },
        },
        // Diário — o "tique" do checkbox de cuidado comigo estala ao marcar,
        // um único micro-momento em resposta ao clique (nunca automático).
        "check-pop": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "trophy-in": "trophy-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "trophy-shine": "trophy-shine 1.1s ease-out 0.15s 1",
        "check-pop": "check-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      },
    },
  },
  plugins: [
    // Variante `rpg:` — vale quando <html> tem a classe "rpg" (useTheme).
    plugin(({ addVariant }) => {
      addVariant("rpg", ".rpg &");
    }),
  ],
} satisfies Config;
