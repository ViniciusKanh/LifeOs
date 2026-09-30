import { motion } from "motion/react";
import { Check, Info, Shield, ShieldCheck, ShieldHalf } from "lucide-react";
import { evaluatePassword } from "@/lib/validation";

/**
 * Painel de força da senha: barra animada, selo (Fraca/Média/Forte) e a
 * grade de requisitos que "acende" em verde conforme cada regra é
 * cumprida. As regras são as mesmas validadas no backend.
 */
const LEVEL = {
  weak: { label: "Fraca", color: "#FF4757", width: "22%", Icon: Shield },
  medium: { label: "Média", color: "#F59E0B", width: "62%", Icon: ShieldHalf },
  strong: { label: "Forte", color: "#12B76A", width: "100%", Icon: ShieldCheck },
} as const;

export function PasswordStrengthPanel({ password, compact = false }: { password: string; compact?: boolean }) {
  const { checks, level } = evaluatePassword(password);
  const meta = LEVEL[level];
  const empty = password.length === 0;

  return (
    <div className="space-y-3" aria-live="polite">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate">
            Força da senha{" "}
            <strong style={{ color: empty ? undefined : meta.color }} className={empty ? "text-slate" : ""}>
              {empty ? "—" : meta.label}
            </strong>
          </p>
          <motion.span
            key={level}
            initial={{ scale: 0.6, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: empty ? undefined : meta.color, backgroundColor: empty ? undefined : `${meta.color}1A` }}
          >
            <meta.Icon size={16} className={empty ? "text-slate" : ""} />
          </motion.span>
        </div>
        <div className="h-[7px] rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            animate={{ width: empty ? "0%" : meta.width, backgroundColor: meta.color }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
          />
        </div>
      </div>

      {!compact && (
        <div>
          <p className="flex items-center justify-between text-[11px] font-semibold text-slate mb-2">
            Requisitos da senha <Info size={13} />
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checks.map((c, i) => (
              <li
                key={c.key}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11.5px] transition-colors ${
                  i === checks.length - 1 ? "sm:col-span-2" : ""
                } ${c.ok ? "border-growth/35 bg-growth/[0.07] text-inherit" : "border-paper-border dark:border-ink-border text-slate"}`}
              >
                <motion.span
                  animate={{ scale: c.ok ? 1.05 : 1, backgroundColor: c.ok ? "#12B76A" : "rgba(110,115,145,0.15)" }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${c.ok ? "text-white" : "text-slate"}`}
                >
                  <Check size={12} />
                </motion.span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
