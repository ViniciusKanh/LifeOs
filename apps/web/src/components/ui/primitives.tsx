import React from "react";
import clsx from "clsx";

/* ============================================================
   Design system mínimo do LifeOS. Todo componente novo deve
   reaproveitar estas primitivas em vez de estilizar do zero
   (ver seção 66 do briefing: evitar duplicação).
   ============================================================ */

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-4 py-2.5 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-signal text-ink hover:opacity-90",
    secondary: "border border-paper-border dark:border-ink-border text-inherit hover:opacity-80",
    ghost: "text-slate hover:opacity-80",
  };
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border bg-paper-raised border-paper-border dark:bg-ink-raised dark:border-ink-border",
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate">
        {label}
      </label>
      <input
        id={id}
        className={clsx(
          "mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border",
          error ? "border-drop" : "border-paper-border dark:border-ink-border"
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
}

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
      <p className="font-display text-xl">{title}</p>
      <p className="text-sm mt-2 text-slate">{description}</p>
      <Button className="mt-6" onClick={onCta}>
        {ctaLabel}
      </Button>
    </div>
  );
}
