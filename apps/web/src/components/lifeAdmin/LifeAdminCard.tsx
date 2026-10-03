import { CheckCircle2, Paperclip, Repeat } from "lucide-react";
import { LIFE_ADMIN_CATEGORY, LIFE_ADMIN_KIND, RECURRENCE_OPTIONS, formatDateBR, formatMoney } from "@/utils/lifeOsLabels";
import type { LifeAdminItem, LifeAdminKind } from "@/types";

export function doneVerb(kind: LifeAdminKind): string {
  return kind === "conta" ? "Paguei" : kind === "manutencao" ? "Feito" : "Renovei";
}

export function UrgencyPill({ item }: { item: Pick<LifeAdminItem, "urgency" | "daysLeft"> }) {
  const d = item.daysLeft ?? 0;
  const map = {
    overdue: { cls: "bg-drop/12 text-drop rpg:bg-rpg-red/15 rpg:text-rpg-red", text: d === -1 ? "Venceu ontem" : `Venceu há ${Math.abs(d)} dias` },
    today: { cls: "bg-signal/15 text-signal-deep dark:text-signal rpg:bg-rpg-orange/15 rpg:text-rpg-orange", text: "Vence hoje" },
    soon: { cls: "bg-cat-purple/12 text-cat-purple rpg:bg-rpg-orange/15 rpg:text-rpg-orange", text: d === 1 ? "Amanhã" : `Em ${d} dias` },
    ok: { cls: "bg-growth/10 text-growth rpg:bg-rpg-green/15 rpg:text-rpg-green", text: d > 60 ? `Em ${Math.round(d / 30)} meses` : `Em ${d} dias` },
    no_date: { cls: "bg-black/[0.04] dark:bg-white/[0.06] text-slate", text: "Sem data" },
  } as const;
  const m = map[item.urgency];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold rpg:rounded-[2px] rpg:font-pixel ${m.cls}`}>{m.text}</span>;
}

/** Cartão de um item: tocar abre o detalhe; o botão rápido registra "feito" sem abrir nada. */
export function LifeAdminCard({ item, onOpen, onQuickDone }: { item: LifeAdminItem; onOpen: () => void; onQuickDone: () => void }) {
  const cat = LIFE_ADMIN_CATEGORY[item.category];
  const rec = item.recurrenceMonths ? RECURRENCE_OPTIONS.find((o) => o.value === item.recurrenceMonths)?.label ?? `${item.recurrenceMonths} meses` : null;
  const accent =
    item.urgency === "overdue"
      ? "border-l-drop rpg:border-l-rpg-red"
      : item.urgency === "today" || item.urgency === "soon"
        ? "border-l-signal rpg:border-l-rpg-orange"
        : item.urgency === "ok"
          ? "border-l-transparent rpg:border-l-rpg-green"
          : "border-l-transparent rpg:border-l-rpg-blue";

  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl border border-paper-border dark:border-ink-border border-l-[3px] ${accent} bg-paper-raised dark:bg-ink-raised p-3 sm:p-3.5 shadow-card transition-all hover:-translate-y-px hover:shadow-md rpg:rounded-[4px] rpg:border-2 rpg:border-l-4 rpg:border-rpg-border rpg:bg-rpg-panel rpg:hover:border-rpg-gold/50 ${item.urgency === "overdue" && item.status === "active" ? "rpg:bg-rpg-red/[0.07]" : ""}`}
    >
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-lg rpg:rounded-[3px] rpg:border-2 rpg:border-rpg-bronze rpg:bg-rpg-bg-2" aria-hidden>
          {cat.emoji}
        </span>
        <span className="min-w-0 flex-1">
          {item.status === "active" && item.urgency === "overdue" && (
            <span className="hidden rpg:flex items-center gap-1 font-pixel text-[10px] uppercase tracking-wider text-rpg-red">⚠ Ação necessária</span>
          )}
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate rpg:font-rpg">{item.title}</span>
            {item.hasFile && <Paperclip size={12} className="text-slate shrink-0" aria-label="Tem arquivo" />}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate">
            <span>{LIFE_ADMIN_KIND[item.kind].label}</span>
            {item.dueDate && <span>· {formatDateBR(item.dueDate)}</span>}
            {rec && (
              <span className="inline-flex items-center gap-0.5">
                · <Repeat size={10} /> {rec}
              </span>
            )}
            {item.amount != null && <span>· {formatMoney(item.amount)}</span>}
          </span>
        </span>
      </button>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {item.status === "active" && <UrgencyPill item={item} />}
        {item.status === "active" && item.dueDate && (item.urgency === "overdue" || item.urgency === "today" || item.urgency === "soon") && (
          <button
            onClick={onQuickDone}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-growth hover:bg-growth/10 rpg:rounded-[3px] rpg:border rpg:border-rpg-green/60 rpg:text-rpg-green"
          >
            <CheckCircle2 size={12} /> {doneVerb(item.kind)}
          </button>
        )}
      </div>
    </div>
  );
}
