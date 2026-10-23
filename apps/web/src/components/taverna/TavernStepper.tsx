import clsx from "clsx";
import { Check, type LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";

export interface TavernStepDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Trilha de passos da Taverna. Cada passo é um botão (dá para pular para
 * qualquer um); setas ←/→, Home e End movem entre eles. No celular só o
 * passo atual mostra o rótulo, para caber sem rolagem horizontal.
 */
export function TavernStepper({
  steps,
  current,
  visited,
  onSelect,
  label = "Passos do ritual de fim de dia",
}: {
  steps: TavernStepDef[];
  current: number;
  visited: Set<number>;
  onSelect: (i: number) => void;
  /** Rótulo acessível da trilha (reaproveitada pelo Conselho de Guerra). */
  label?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: steps.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = Math.min(steps.length - 1, Math.max(0, keys[e.key]));
    onSelect(next);
    // Leva o foco junto para o botão do passo escolhido.
    window.requestAnimationFrame(() => document.getElementById(`taverna-step-btn-${next}`)?.focus());
  };
  return (
    <nav aria-label={label} className="rpg-panel px-2 py-2 sm:px-3">
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} onKeyDown={onKey}>
        {steps.map((s, i) => {
          const active = i === current;
          const done = visited.has(i) && !active;
          const Icon = s.icon;
          return (
            <li key={s.id} className="min-w-0">
              <button
                id={`taverna-step-btn-${i}`}
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                aria-label={`Passo ${i + 1} de ${steps.length}: ${s.label}${done ? " (visitado)" : ""}`}
                tabIndex={active ? 0 : -1}
                className={clsx(
                  "flex w-full min-h-[44px] items-center justify-center gap-2 border px-1.5 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold sm:justify-start sm:px-2.5",
                  active ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:border-rpg-border hover:text-rpg-text",
                )}
                style={{ borderRadius: 3 }}
              >
                <span
                  className={clsx(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 bg-rpg-bg",
                    active ? "border-rpg-gold text-rpg-gold-light" : done ? "border-rpg-green/70 text-rpg-green" : "border-rpg-border",
                  )}
                  style={{ borderRadius: 3 }}
                  aria-hidden
                >
                  {done ? <Check size={14} /> : <Icon size={14} />}
                </span>
                <span className={clsx("min-w-0 leading-tight", active ? "hidden min-[420px]:block" : "hidden lg:block")}>
                  <span className="block font-pixel text-[10px] uppercase tracking-wide opacity-80">Passo {i + 1}</span>
                  <span className="block truncate text-xs font-semibold">{s.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
