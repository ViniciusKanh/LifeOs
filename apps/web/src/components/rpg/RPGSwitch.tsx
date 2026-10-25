import clsx from "clsx";

/**
 * Alternância (liga/desliga) no estilo RPG -- mesmo papel do <Switch> genérico
 * (components/ui/Switch.tsx), mas com as cores do tema (dourado quando ligado,
 * painel/borda escuros quando desligado), pra usar em configurações dentro de
 * telas RPG como o Banco.
 */
export function RPGSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rpg-gold disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "border-rpg-gold bg-rpg-gold/90" : "border-rpg-border bg-rpg-bg",
      )}
    >
      <span
        className={clsx(
          "h-4 w-4 rounded-full shadow-sm transition-transform",
          checked ? "translate-x-5 bg-rpg-bg" : "translate-x-0 bg-rpg-muted",
        )}
      />
    </button>
  );
}
