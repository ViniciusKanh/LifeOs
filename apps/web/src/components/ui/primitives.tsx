import React from "react";
import clsx from "clsx";

/* ============================================================
   Design system mínimo do LifeOS. Todo componente novo deve
   reaproveitar estas primitivas em vez de estilizar do zero
   (ver seção 66 do briefing: evitar duplicação).

   Linha visual "SaaS moderno": cartões brancos com borda suave e
   sombra discreta, CTA primário em gradiente âmbar, navegação e
   links em índigo (brand). Ver tailwind.config.ts para os tokens.
   ============================================================ */

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold px-4 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-b from-signal to-signal-deep text-white shadow-sm shadow-signal-deep/30 hover:brightness-105 active:brightness-95",
    secondary:
      "border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised text-inherit hover:bg-paper dark:hover:bg-ink-overlay",
    ghost: "text-slate hover:bg-black/[0.03] dark:hover:bg-white/[0.06]",
  };
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border bg-paper-raised border-paper-border shadow-card dark:bg-ink-raised dark:border-ink-border/60 dark:shadow-card-dark",
        className
      )}
      {...props}
    />
  );
}

/**
 * Precisa ser forwardRef: o react-hook-form manda um `ref` junto de
 * {...register("campo")} para conseguir ler o valor do input direto
 * do DOM (é assim que ele funciona por baixo dos panos, sem re-render
 * a cada tecla). Sem forwardRef, o React descarta esse ref antes de
 * chegar no <input> real, o campo nunca é registrado de fato e o
 * formulário passa a enxergar o valor como vazio no submit — foi
 * exatamente isso que causava o "Required" em todos os campos mesmo
 * preenchidos (Login, Cadastro e Esqueci a Senha usam este Field).
 */
export const Field = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }
>(function Field({ label, error, className, ...props }, ref) {
  const id = React.useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-xs text-slate">
          {label}
        </label>
      )}
      <input
        id={id}
        ref={ref}
        className={clsx(
          "w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border transition-colors focus:border-brand-500",
          label && "mt-1.5",
          error ? "border-drop" : "border-paper-border dark:border-ink-border",
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-drop">
          {error}
        </p>
      )}
    </div>
  );
});

/**
 * Variante do Field com um ícone fixo à esquerda (usada em
 * Login/Cadastro). Mesma lógica de forwardRef do Field — sem isso o
 * react-hook-form não enxerga o valor digitado (ver comentário acima).
 */
export const IconField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; icon: React.ReactNode }
>(function IconField({ label, error, icon, className, ...props }, ref) {
  const id = React.useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-xs text-slate">
          {label}
        </label>
      )}
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate">{icon}</span>
        <input
          id={id}
          ref={ref}
          className={clsx(
            "w-full rounded-xl pl-10 pr-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border transition-colors focus:border-brand-500",
            error ? "border-drop" : "border-paper-border dark:border-ink-border",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-drop">
          {error}
        </p>
      )}
    </div>
  );
});

export function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto py-16 px-5">
      <p className="font-display font-semibold text-xl">{title}</p>
      <p className="text-sm mt-2 text-slate">{description}</p>
      <Button className="mt-6" onClick={onCta}>
        {ctaLabel}
      </Button>
    </div>
  );
}

/**
 * Badge circular colorido por categoria — mesmo padrão visual usado
 * nos cartões de stat do Dashboard, Hoje, Saúde etc. `tone` decide a
 * cor (sempre com o mesmo significado em toda a aplicação: azul =
 * produtividade/geral, roxo = foco/metas, verde = saúde/hábitos,
 * rosa = leitura, âmbar = energia/ação).
 */
const ICON_TONE: Record<string, string> = {
  blue: "bg-cat-blue/10 text-cat-blue dark:bg-cat-blue/15 dark:text-cat-blue-dark",
  purple: "bg-cat-purple/10 text-cat-purple dark:bg-cat-purple/15 dark:text-cat-purple-dark",
  green: "bg-cat-green/10 text-cat-green dark:bg-cat-green/15 dark:text-cat-green-dark",
  pink: "bg-cat-pink/10 text-cat-pink dark:bg-cat-pink/15 dark:text-cat-pink-dark",
  teal: "bg-cat-teal/10 text-cat-teal dark:bg-cat-teal/15 dark:text-cat-teal-dark",
  amber: "bg-signal/15 text-signal-deep dark:text-signal",
};

export function IconBadge({
  icon,
  tone = "blue",
  size = 40,
}: {
  icon: React.ReactNode;
  tone?: keyof typeof ICON_TONE;
  size?: number;
}) {
  return (
    <span
      className={clsx("inline-flex items-center justify-center rounded-xl shrink-0", ICON_TONE[tone])}
      style={{ width: size, height: size }}
    >
      {icon}
    </span>
  );
}
