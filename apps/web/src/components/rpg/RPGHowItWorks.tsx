import { useState, type ReactNode } from "react";
import { ChevronDown, Lightbulb, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { RPG_TONE_TEXT, type RpgTone } from "./rpgAssets";

export interface HowItWorksStep {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: RpgTone;
}

const readOpen = (storageKey: string) => {
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
};

/**
 * Bloco "Como funciona": 3 passos curtos com ícone para explicar a tela a
 * quem nunca a usou. Pode ser recolhido; a preferência fica só no navegador
 * (conveniência por usuário — nenhum dado de negócio).
 */
export function RPGHowItWorks({ storageKey, title = "Como funciona", steps, footer }: { storageKey: string; title?: string; steps: HowItWorksStep[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen(storageKey));
  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(storageKey, v ? "0" : "1");
      } catch {
        /* armazenamento indisponível: só não lembra a preferência */
      }
      return !v;
    });
  };
  const bodyId = `${storageKey}-body`;
  return (
    <section className="rpg-panel" aria-label={title}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
      >
        <span className="inline-flex w-7 h-7 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
          <Lightbulb size={15} />
        </span>
        <span className="font-pixel uppercase tracking-[0.08em] text-[13px] text-rpg-gold-light">{title}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-rpg-muted">
          {open ? "Ocultar" : "Mostrar"}
          <ChevronDown size={14} className={clsx("transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div id={bodyId} className="px-4 pb-4">
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3 border border-rpg-border/60 bg-rpg-bg-2/50 p-3 min-w-0" style={{ borderRadius: 3 }}>
                <span className="relative shrink-0">
                  <span className={clsx("flex h-10 w-10 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg", RPG_TONE_TEXT[s.tone ?? "gold"])} style={{ borderRadius: 3 }} aria-hidden>
                    <s.icon size={20} />
                  </span>
                  <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-rpg-gold bg-rpg-bg font-pixel text-[9px] text-rpg-gold-light" aria-hidden>
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-rpg-text">
                    <span className="sr-only">Passo {i + 1}: </span>
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-rpg-text/80">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {footer && <div className="mt-3 text-xs text-rpg-muted">{footer}</div>}
        </div>
      )}
    </section>
  );
}
