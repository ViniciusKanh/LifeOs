import clsx from "clsx";
import { Coins } from "lucide-react";

/** Saldo de moedas (recurso gastável na loja). Sempre com texto, nunca só ícone. */
export function RPGWallet({ coins, size = "md", className }: { coins: number | null | undefined; size?: "sm" | "md"; className?: string }) {
  const value = coins == null ? "—" : coins.toLocaleString("pt-BR");
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 border border-rpg-gold/60 bg-rpg-gold/10 text-rpg-gold-light font-pixel font-semibold tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-sm",
        className,
      )}
      style={{ borderRadius: 3 }}
      aria-label={`${value} moedas`}
    >
      <Coins size={size === "sm" ? 12 : 15} aria-hidden />
      {value}
    </span>
  );
}
