import clsx from "clsx";

/**
 * Abas RPG (role="tablist"): moldura bronze, aba ativa com borda dourada.
 * `size="sm"` para sub-abas (ex.: Mensal/Trimestral/Anual).
 */
export function RPGTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  tabs: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={clsx("inline-flex max-w-full overflow-x-auto border border-rpg-border bg-rpg-bg-2/80 p-0.5", className)} style={{ borderRadius: 4 }}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={clsx(
              "shrink-0 border font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text",
            )}
            style={{ borderRadius: 3 }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
