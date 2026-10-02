import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

/**
 * Modal acessível reutilizável (role="dialog", Esc fecha, foco vai para o
 * diálogo). No celular vira "folha" presa embaixo, ocupando a largura toda.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => ref.current?.focus(), 10);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={`w-full ${width} max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-2xl outline-none`}
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-paper-border dark:border-ink-border">
              <p className="text-sm font-semibold truncate">{title}</p>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
            {footer && <div className="px-5 py-3 border-t border-paper-border dark:border-ink-border flex flex-wrap items-center justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Campo de formulário com rótulo (texto, número, data, select ou textarea são passados como children). */
export function FormRow({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-slate/80">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500 transition-colors";
