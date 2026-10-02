import type { ReactNode } from "react";
import { ScrollText } from "lucide-react";
import { RPGBadge } from "./RPGBadge";
import { PRIORITY_TONE } from "./rpgAssets";

/**
 * Missão principal em pergaminho — reservado para a tarefa em destaque.
 * Mostra a tarefa real (título, prazo, prioridade) e as ações que a tela
 * já tinha; sem tarefa, explica o que fazer.
 */
export function RPGQuestCard({
  label = "Missão principal",
  title,
  onTitleClick,
  priority,
  facts = [],
  reasons,
  actions,
  emptyText,
}: {
  label?: string;
  title: string | null;
  onTitleClick?: () => void;
  priority?: string | null;
  facts?: Array<{ icon: ReactNode; label: string; value: string }>;
  reasons?: string | null;
  actions?: ReactNode;
  emptyText: string;
}) {
  return (
    <article className="rpg-parchment px-4 sm:px-5 py-4 mx-1.5 my-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-pixel text-[11px] font-bold uppercase tracking-[0.12em] text-rpg-ink/80">
          <ScrollText size={14} aria-hidden /> {label}
        </span>
        {title && priority && (
          <RPGBadge tone={PRIORITY_TONE[priority] ?? "muted"} className="!bg-rpg-ink/10 !text-rpg-ink">
            Prioridade {priority}
          </RPGBadge>
        )}
      </div>
      {title ? (
        <>
          {onTitleClick ? (
            <button type="button" onClick={onTitleClick} className="mt-1.5 block text-left font-rpg text-lg sm:text-xl font-bold leading-snug text-rpg-ink hover:underline underline-offset-4 line-clamp-2">
              {title}
            </button>
          ) : (
            <p className="mt-1.5 font-rpg text-lg sm:text-xl font-bold leading-snug text-rpg-ink line-clamp-2">{title}</p>
          )}
          {reasons && <p className="mt-1 text-xs text-rpg-ink/75">{reasons}</p>}
          {facts.length > 0 && (
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-2 border border-rpg-bronze/40 bg-rpg-ink/[0.06] px-2.5 py-1.5" style={{ borderRadius: 3 }}>
                  <span className="text-rpg-ink/70" aria-hidden>{f.icon}</span>
                  <div className="min-w-0">
                    <dt className="text-[10px] text-rpg-ink/65">{f.label}</dt>
                    <dd className="text-sm font-semibold text-rpg-ink truncate">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
          {actions && <div className="mt-3.5 flex flex-col sm:flex-row gap-2">{actions}</div>}
        </>
      ) : (
        <p className="mt-2 text-sm text-rpg-ink/85">{emptyText}</p>
      )}
    </article>
  );
}
