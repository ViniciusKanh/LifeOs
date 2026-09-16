import { Check, Minus } from "lucide-react";

export function Switch({
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
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${checked ? "border-growth bg-growth" : "border-paper-border bg-paper-border dark:border-ink-border dark:bg-ink-border"}`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6 text-growth" : "translate-x-0 text-slate"}`}>
        {checked ? <Check size={13} strokeWidth={3} /> : <Minus size={12} strokeWidth={2.5} />}
      </span>
    </button>
  );
}
