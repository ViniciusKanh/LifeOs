import { useState } from "react";
import { Archive, CheckCircle2, Download, Loader2, MapPin, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { useLifeAdminItem } from "@/hooks/useLifeOs";
import { lifeAdminService } from "@/services/lifeAdminService";
import { LIFE_ADMIN_CATEGORY, LIFE_ADMIN_KIND, RECURRENCE_OPTIONS, formatDateBR, formatMoney } from "@/utils/lifeOsLabels";
import { UrgencyPill, doneVerb } from "./LifeAdminCard";
import type { LifeAdminDetail } from "@/types";

/** Detalhe do item: dados, arquivo, histórico e o registro de "feito" (pagou/renovou/fez). */
export function LifeAdminDetailModal({
  id,
  onClose,
  onEdit,
  onMarkDone,
  onArchive,
  onDelete,
  onRemoveHistory,
}: {
  id: string | null;
  onClose: () => void;
  onEdit: (item: LifeAdminDetail) => void;
  onMarkDone: (input: { id: string; doneAt?: string; amount?: number | null; note?: string | null; nextDueDate?: string | null }) => Promise<unknown>;
  onArchive: (item: LifeAdminDetail) => Promise<unknown>;
  onDelete: (item: LifeAdminDetail) => Promise<unknown>;
  onRemoveHistory: (input: { id: string; historyId: string }) => Promise<unknown>;
}) {
  const { data: item, isLoading } = useLifeAdminItem(id);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneAt, setDoneAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = async () => {
    if (!item) return;
    try {
      const f = await lifeAdminService.file(item.id);
      const w = window.open();
      const safeName = (f.fileName ?? "Documento").replace(/[<>&"]/g, "");
      if (w) {
        // Abre num iframe (PDF) ou imagem; data URI direto em nova aba é bloqueado em alguns navegadores.
        w.document.write(
          f.mime?.startsWith("image/")
            ? `<title>${safeName}</title><img src="${f.dataUri}" style="max-width:100%">`
            : `<title>${safeName}</title><iframe src="${f.dataUri}" style="border:0;width:100%;height:100vh"></iframe>`
        );
      }
    } catch {
      setError("Não foi possível abrir o arquivo.");
    }
  };

  const confirmDone = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const n = amount.trim() ? Number(amount.replace(",", ".")) : undefined;
      await onMarkDone({ id: item.id, doneAt, amount: n ?? null, note: note.trim() || null, nextDueDate: nextDue || null });
      setDoneOpen(false);
      setNote("");
      setAmount("");
      setNextDue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  };

  const rec = item ? RECURRENCE_OPTIONS.find((o) => o.value === item.recurrenceMonths)?.label ?? `A cada ${item.recurrenceMonths} meses` : "";

  return (
    <Modal open={!!id} onClose={onClose} title={item?.title ?? "Item"} size="lg">
      {isLoading || !item ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-xs bg-black/[0.04] dark:bg-white/[0.06]">
              {LIFE_ADMIN_KIND[item.kind].emoji} {LIFE_ADMIN_KIND[item.kind].label}
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs bg-black/[0.04] dark:bg-white/[0.06]">
              {LIFE_ADMIN_CATEGORY[item.category].emoji} {LIFE_ADMIN_CATEGORY[item.category].label}
            </span>
            {item.status === "archived" ? (
              <span className="rounded-full px-2.5 py-1 text-xs bg-slate/10 text-slate">Arquivado</span>
            ) : (
              <UrgencyPill item={item} />
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {[
              ["Vencimento", formatDateBR(item.dueDate)],
              ["Repetição", rec],
              ["Aviso", item.remindDaysBefore === 0 ? "No dia" : `${item.remindDaysBefore} dias antes`],
              ["Valor", formatMoney(item.amount) ?? "—"],
              ["Referência", item.reference ?? "—"],
              ["Último feito", formatDateBR(item.lastDoneAt)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper dark:bg-ink border border-paper-border dark:border-ink-border p-2.5">
                <dt className="text-[10px] uppercase tracking-wide text-slate">{k}</dt>
                <dd className="mt-0.5 font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>

          {item.location && (
            <p className="flex items-center gap-1.5 text-xs text-slate">
              <MapPin size={13} /> Guardado em: <span className="text-inherit font-medium">{item.location}</span>
            </p>
          )}
          {item.notes && <p className="text-sm whitespace-pre-line">{item.notes}</p>}
          {item.hasFile && (
            <button onClick={openFile} className="inline-flex items-center gap-1.5 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2 text-xs font-semibold hover:border-brand-500">
              <Download size={14} /> Abrir {item.fileName ?? "arquivo"}
            </button>
          )}

          {item.status === "active" && (
            <div className="rounded-2xl border border-growth/30 bg-growth/[0.06] p-3.5">
              {!doneOpen ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs flex-1 min-w-[180px]">
                    {item.recurrenceMonths
                      ? "Ao registrar, o próximo vencimento é calculado sozinho."
                      : item.kind === "conta" || item.kind === "manutencao"
                        ? "Sem repetição: ao registrar, o item vai para os arquivados."
                        : "Sem repetição: informe a nova validade, se houver."}
                  </p>
                  <Button onClick={() => setDoneOpen(true)} className="!bg-none !bg-growth !shadow-none">
                    <CheckCircle2 size={15} /> {doneVerb(item.kind)}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FormRow label="Quando" htmlFor="la-done-at">
                      <input id="la-done-at" type="date" className={inputClass} value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
                    </FormRow>
                    <FormRow label="Valor pago (opcional)" htmlFor="la-done-amount">
                      <input id="la-done-amount" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={item.amount != null ? String(item.amount) : "0,00"} />
                    </FormRow>
                    {!item.recurrenceMonths && item.kind !== "conta" && item.kind !== "manutencao" && (
                      <FormRow label="Nova validade" htmlFor="la-next-due">
                        <input id="la-next-due" type="date" className={inputClass} value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
                      </FormRow>
                    )}
                  </div>
                  <FormRow label="Anotação (opcional)" htmlFor="la-done-note">
                    <input id="la-done-note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Oficina, protocolo, observação…" maxLength={1000} />
                  </FormRow>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setDoneOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={confirmDone} disabled={busy}>
                      {busy && <Loader2 size={14} className="animate-spin" />} Registrar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <section>
            <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Histórico</h3>
            {item.history.length === 0 ? (
              <p className="text-xs text-slate">Nada registrado ainda.</p>
            ) : (
              <ol className="relative border-l border-paper-border dark:border-ink-border ml-1.5 space-y-3">
                {item.history.map((h) => (
                  <li key={h.id} className="pl-4 relative group">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-growth" />
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">
                          {formatDateBR(h.doneAt)}
                          {h.amount != null && <span className="text-slate font-normal"> · {formatMoney(h.amount)}</span>}
                          {h.dueDate && <span className="text-slate font-normal"> · vencimento {formatDateBR(h.dueDate)}</span>}
                        </p>
                        {h.note && <p className="text-[11px] text-slate">{h.note}</p>}
                      </div>
                      <button
                        onClick={() => onRemoveHistory({ id: item.id, historyId: h.id })}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate hover:text-drop"
                        aria-label="Remover registro do histórico"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {error && (
            <p className="text-xs text-drop" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-paper-border dark:border-ink-border">
            <Button variant="secondary" onClick={() => onEdit(item)}>
              <Pencil size={14} /> Editar
            </Button>
            <Button variant="secondary" onClick={() => onArchive(item)}>
              {item.status === "archived" ? <RotateCcw size={14} /> : <Archive size={14} />} {item.status === "archived" ? "Reativar" : "Arquivar"}
            </Button>
            <Button variant="ghost" className="ml-auto !text-drop" onClick={() => onDelete(item)}>
              <Trash2 size={14} /> Excluir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
