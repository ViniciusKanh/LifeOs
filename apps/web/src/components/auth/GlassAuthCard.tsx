import React, { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Cartão de vidro escuro usado nas telas de senha (recuperar/redefinir):
 * fundo com orbes nas cores da marca, cabeçalho com ícone em gradiente.
 * A página força a classe "dark" para os componentes internos
 * (PasswordStrengthPanel etc.) usarem as variantes escuras do design system.
 */
export function GlassAuthCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="dark">
      <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden text-[#E7EAF2] bg-[radial-gradient(circle_at_20%_20%,#3b2a7a_0%,transparent_32%),radial-gradient(circle_at_80%_80%,#5b1f4f_0%,transparent_32%),#0A0912]">
        <motion.span aria-hidden className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-brand-500 blur-[100px] opacity-25" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 9, repeat: Infinity }} />
        <motion.span aria-hidden className="pointer-events-none absolute -bottom-36 -right-36 w-96 h-96 rounded-full bg-signal blur-[110px] opacity-20" animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 11, repeat: Infinity }} />

        <motion.main
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          className="relative z-10 w-full max-w-[460px] rounded-3xl border border-white/10 bg-[rgba(21,18,31,0.78)] backdrop-blur-2xl p-6 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-4 mb-7">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-brand-500 to-signal shadow-glow-brand shrink-0 text-white">{icon}</span>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-[22px] tracking-tight leading-tight">{title}</h1>
              <p className="text-[13px] text-[#9aa0bd] mt-1">{subtitle}</p>
            </div>
          </div>
          {children}
          <div className="flex items-center justify-center gap-2 mt-7 text-[11px] text-[#9aa0bd]">
            <img src="/logo/icon-64.png" alt="" className="w-4 h-4 rounded" /> LifeOS · Transforme sua rotina em progresso
          </div>
        </motion.main>
      </div>
    </div>
  );
}

/** Campo de vidro com rótulo flutuante e anel violeta no foco. */
export const GlassField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; togglePassword?: boolean }
>(function GlassField({ label, error, togglePassword, type, id, ...props }, ref) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div
        className={`group relative h-[62px] rounded-2xl border bg-[#110f1a] transition-all focus-within:border-brand-500 focus-within:shadow-[0_0_0_4px_rgba(124,77,255,0.12)] ${
          error ? "border-drop/60" : "border-[#2E2941]"
        }`}
      >
        <input
          id={inputId}
          ref={ref}
          type={togglePassword ? (visible ? "text" : "password") : type}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="peer w-full h-full bg-transparent pl-4 pr-14 pt-5 pb-1 text-base text-white outline-none rounded-2xl focus-visible:ring-0"
          {...props}
        />
        <label
          htmlFor={inputId}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[#7e8499] transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-100 peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:text-brand-100"
        >
          {label}
        </label>
        {togglePassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-[#7e8499] hover:bg-white/5 hover:text-white transition-colors"
          >
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 ml-1 text-xs text-drop">
          {error}
        </p>
      )}
    </div>
  );
});

export function GlassButton({ busy, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="w-full h-13 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-brand-500 to-signal shadow-glow-brand hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
    >
      {children}
    </button>
  );
}
