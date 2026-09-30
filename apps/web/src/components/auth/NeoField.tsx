import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo das telas de autenticação: ícone à esquerda, rótulo flutuante e
 * anel em gradiente do logo no foco. forwardRef é obrigatório para o
 * react-hook-form enxergar o valor (mesmo motivo do Field em primitives).
 */
export const NeoField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; togglePassword?: boolean; icon?: React.ReactNode }
>(function NeoField({ label, error, togglePassword, type, id, icon, ...props }, ref) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const effectiveType = togglePassword ? (visible ? "text" : "password") : type;

  return (
    <div>
      <div className="neo-field" data-invalid={!!error}>
        <div className="neo-field__border" />
        {icon && <span className="neo-field__icon">{icon}</span>}
        <input
          id={inputId}
          ref={ref}
          type={effectiveType}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        <label htmlFor={inputId}>{label}</label>
        {togglePassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-[4] w-9 h-9 rounded-xl flex items-center justify-center text-[var(--auth-muted)] hover:text-[var(--auth-accent)] transition-colors"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
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
