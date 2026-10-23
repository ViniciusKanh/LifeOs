import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Peças visuais compartilhadas do Grimório e do mural de citações.
 * Funcionam nos dois temas: classe clássica + variante `rpg:`.
 */

export const textareaClass =
  "w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 transition-colors resize-y rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg rpg:focus:border-rpg-gold";

export const selectClass =
  "w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 rpg:rounded-[3px] rpg:border-rpg-border rpg:bg-rpg-bg rpg:focus:border-rpg-gold";

/** Chip curto de status — o texto sempre acompanha a cor. */
export function Chip({ tone = "slate", children, className }: { tone?: "slate" | "purple" | "green" | "orange" | "red" | "blue" | "pink" | "gold"; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-black/[0.04] dark:bg-white/[0.06] text-slate rpg:bg-rpg-bg-2 rpg:text-rpg-muted rpg:border-rpg-border",
    purple: "bg-cat-purple/10 text-cat-purple dark:text-cat-purple-dark rpg:bg-rpg-purple/15 rpg:text-rpg-purple rpg:border-rpg-purple/50",
    green: "bg-cat-green/10 text-cat-green dark:text-cat-green-dark rpg:bg-rpg-green/15 rpg:text-rpg-green rpg:border-rpg-green/50",
    orange: "bg-signal/15 text-signal-deep dark:text-signal rpg:bg-rpg-orange/15 rpg:text-rpg-orange rpg:border-rpg-orange/50",
    red: "bg-drop/10 text-drop rpg:bg-rpg-red/15 rpg:text-rpg-red rpg:border-rpg-red/50",
    blue: "bg-cat-blue/10 text-cat-blue dark:text-cat-blue-dark rpg:bg-rpg-blue/15 rpg:text-rpg-blue rpg:border-rpg-blue/50",
    pink: "bg-cat-pink/10 text-cat-pink dark:text-cat-pink-dark rpg:bg-rpg-pink/15 rpg:text-rpg-pink rpg:border-rpg-pink/50",
    gold: "bg-signal/15 text-signal-deep dark:text-signal rpg:bg-rpg-gold/15 rpg:text-rpg-gold-light rpg:border-rpg-gold/60",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight rpg:rounded-[2px] rpg:border rpg:font-pixel rpg:uppercase rpg:tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Aviso flutuante (sucesso/erro), anunciado por leitores de tela; fecha sozinho. */
export function InlineToast({ message, tone = "success", onClose }: { message: string | null; tone?: "success" | "error"; onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => closeRef.current(), 4500);
    return () => window.clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <button
      type="button"
      role="status"
      onClick={onClose}
      className={clsx(
        "fixed bottom-20 md:bottom-5 right-4 left-4 sm:left-auto z-[70] max-w-sm rounded-xl border px-4 py-3 text-left text-sm shadow-2xl",
        "bg-paper-raised dark:bg-ink-raised rpg:rounded-[3px] rpg:border-2 rpg:bg-rpg-panel rpg:text-rpg-text",
        tone === "success" ? "border-growth rpg:border-rpg-green" : "border-drop rpg:border-rpg-red",
      )}
    >
      {message}
    </button>
  );
}

/** Esqueleto de carregamento discreto. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse motion-reduce:animate-none rounded-2xl bg-black/[0.05] dark:bg-white/[0.06] rpg:rounded-[3px] rpg:bg-rpg-panel", className)} />;
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}
