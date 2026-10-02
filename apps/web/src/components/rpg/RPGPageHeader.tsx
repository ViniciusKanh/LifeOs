import type { ReactNode } from "react";
import clsx from "clsx";
import { RPG_BANNERS, type RpgBanner } from "./rpgAssets";

/**
 * Cabeçalho de página com banner pixel art. O texto fica sobre uma faixa
 * escurecida (contraste garantido) e o conteúdo extra — personagem, Life
 * Score — entra em `aside`. No celular o banner encolhe e o aside desce.
 */
export function RPGPageHeader({
  banner,
  eyebrow,
  title,
  subtitle,
  actions,
  aside,
  leading,
  footnote,
  size = "lg",
  children,
  className,
}: {
  banner: RpgBanner;
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  /** Conteúdo à esquerda do título (ex.: retrato do personagem). */
  leading?: ReactNode;
  /** Linha curta sob o subtítulo (data, classe). */
  footnote?: ReactNode;
  /** "md" = banner mais baixo, para telas de registro (Diário, Notas…). */
  size?: "lg" | "md";
  children?: ReactNode;
  className?: string;
}) {
  // No cabeçalho compacto as ações ficam à direita, como nas telas de referência.
  const sideActions = size === "md" && !aside && !!actions;
  const side = aside ?? (sideActions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null);
  return (
    <header className={clsx("rpg-panel rpg-panel-gold overflow-hidden", className)}>
      <div className="relative">
        <img
          src={RPG_BANNERS[banner]}
          alt=""
          aria-hidden
          decoding="async"
          className="pixelated absolute inset-0 w-full h-full object-cover object-[50%_70%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg/85 via-rpg-bg/30 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-rpg-bg/70 to-transparent" aria-hidden />
        <div className={`relative flex flex-col lg:flex-row lg:items-center gap-4 px-4 sm:px-6 ${size === "md" ? "py-3 sm:py-4 min-h-[88px] sm:min-h-[112px]" : "py-4 sm:py-6 min-h-[120px] sm:min-h-[168px] lg:min-h-[196px]"}`}>
          <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-5">
            {leading && <div className="shrink-0">{leading}</div>}
            <div className="min-w-0">
              {eyebrow && <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">{eyebrow}</p>}
              <h1 className={`rpg-title font-bold leading-tight ${size === "md" ? "text-2xl sm:text-3xl" : "text-2xl sm:text-3xl lg:text-4xl"}`}>{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-rpg-text/90 max-w-2xl">{subtitle}</p>}
              {footnote && <div className="mt-2 font-pixel text-xs text-rpg-gold-light/90">{footnote}</div>}
              {actions && !sideActions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>
          {side && <div className="shrink-0 min-w-0">{side}</div>}
        </div>
      </div>
      <div className="rpg-ornament-line" aria-hidden />
      {children}
    </header>
  );
}
