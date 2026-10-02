import { useEffect, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Modal, FormRow, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { prepareUpload } from "@/utils/files";
import { LIFE_ADMIN_CATEGORY, LIFE_ADMIN_KIND, RECURRENCE_OPTIONS } from "@/utils/lifeOsLabels";
import type { LifeAdminInput } from "@/services/lifeAdminService";
import type { LifeAdminCategory, LifeAdminDetail, LifeAdminKind } from "@/types";

/** Modelos prontos: preenchem tipo, categoria, recorrência e antecedência do aviso — o usuário só põe a data. */
export const LIFE_ADMIN_TEMPLATES: Array<{ title: string; kind: LifeAdminKind; category: LifeAdminCategory; recurrenceMonths: number | null; remindDaysBefore: number }> = [
  { title: "CNH", kind: "vencimento", category: "documentos", recurrenceMonths: null, remindDaysBefore: 60 },
  { title: "Passaporte", kind: "vencimento", category: "documentos", recurrenceMonths: null, remindDaysBefore: 120 },
  { title: "IPVA", kind: "vencimento", category: "veiculo", recurrenceMonths: 12, remindDaysBefore: 20 },
  { title: "Licenciamento do carro", kind: "vencimento", category: "veiculo", recurrenceMonths: 12, remindDaysBefore: 20 },
  { title: "Seguro do carro", kind: "vencimento", category: "seguros", recurrenceMonths: 12, remindDaysBefore: 30 },
  { title: "Revisão do carro", kind: "manutencao", category: "veiculo", recurrenceMonths: 12, remindDaysBefore: 15 },
  { title: "Troca de óleo", kind: "manutencao", category: "veiculo", recurrenceMonths: 6, remindDaysBefore: 10 },
  { title: "Filtro de água", kind: "manutencao", category: "casa", recurrenceMonths: 6, remindDaysBefore: 7 },
  { title: "Limpeza do ar-condicionado", kind: "manutencao", category: "casa", recurrenceMonths: 6, remindDaysBefore: 7 },
  { title: "Dedetização", kind: "manutencao", category: "casa", recurrenceMonths: 12, remindDaysBefore: 15 },
  { title: "Seguro residencial", kind: "vencimento", category: "seguros", recurrenceMonths: 12, remindDaysBefore: 30 },
  { title: "Vacina do pet", kind: "vencimento", category: "pets", recurrenceMonths: 12, remindDaysBefore: 15 },
  { title: "Check-up anual", kind: "manutencao", category: "saude", recurrenceMonths: 12, remindDaysBefore: 30 },
  { title: "IPTU", kind: "conta", category: "impostos", recurrenceMonths: 12, remindDaysBefore: 15 },
];

type FormState = {
  kind: LifeAdminKind;
  title: string;
  category: LifeAdminCategory;
  dueDate: string;
  recurrenceMonths: number | null;
  remindDaysBefore: number;
  amount: string;
  reference: string;
  location: string;
  notes: string;
};

const EMPTY: FormState = {
  kind: "vencimento",
  title: "",
  category: "outro",
  dueDate: "",
  recurrenceMonths: null,
  remindDaysBefore: 15,
  amount: "",
  reference: "",
  location: "",
  notes: "",
};

export function LifeAdminForm({
  open,
  onClose,
  initial,
  preset,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial: LifeAdminDetail | null;
  /** Modelo escolhido fora do formulário (ex.: chips do estado vazio). */
  preset?: (typeof LIFE_ADMIN_TEMPLATES)[number] | null;
  onSubmit: (input: LifeAdminInput) => Promise<unknown>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [file, setFile] = useState<{ dataUri: string; fileName: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(undefined);
    setForm(
      initial
        ? {
            kind: initial.kind,
            title: initial.title,
            category: initial.category,
            dueDate: initial.dueDate ?? "",
            recurrenceMonths: initial.recurrenceMonths,
            remindDaysBefore: initial.remindDaysBefore,
            amount: initial.amount != null ? String(initial.amount) : "",
            reference: initial.reference ?? "",
            location: initial.location ?? "",
            notes: initial.notes ?? "",
          }
        : preset
          ? { ...EMPTY, title: preset.title, kind: preset.kind, category: preset.category, recurrenceMonths: preset.recurrenceMonths, remindDaysBefore: preset.remindDaysBefore }
          : EMPTY
    );
  }, [open, initial, preset]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const prepared = await prepareUpload(f, ["image", "document"]);
      setFile({ dataUri: prepared.dataUri, fileName: prepared.fileName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
    }
  };

  const submit = async () => {
    if (!form.title.trim()) return setError("Dê um nome ao item.");
    const amount = form.amount.trim() ? Number(form.amount.replace(",", ".")) : null;
    if (amount != null && (Number.isNaN(amount) || amount < 0)) return setError("Valor inválido.");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        kind: form.kind,
        title: form.title.trim(),
        category: form.category,
        dueDate: form.dueDate || null,
        recurrenceMonths: form.recurrenceMonths,
        remindDaysBefore: form.remindDaysBefore,
        amount,
        reference: form.reference.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        ...(file !== undefined ? { fileDataUri: file?.dataUri ?? null, fileName: file?.fileName ?? null } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const currentFileName = file === undefined ? (initial?.hasFile ? initial.fileName ?? "arquivo" : null) : file?.fileName ?? null;
  const showAmount = form.kind === "conta" || form.kind === "manutencao" || form.kind === "vencimento";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar item" : "Novo item"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!initial && (
          <div>
            <p className="text-xs font-medium text-slate mb-1.5">Começar de um modelo</p>
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
              {LIFE_ADMIN_TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  onClick={() => set({ title: t.title, kind: t.kind, category: t.category, recurrenceMonths: t.recurrenceMonths, remindDaysBefore: t.remindDaysBefore })}
                  className="shrink-0 rounded-full border border-paper-border dark:border-ink-border px-3 py-1 text-xs hover:border-brand-500 hover:text-brand-600"
                >
                  {LIFE_ADMIN_CATEGORY[t.category].emoji} {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(LIFE_ADMIN_KIND) as LifeAdminKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={form.kind === k}
              onClick={() => set({ kind: k })}
              className={`rounded-xl border p-2.5 text-left transition-all ${
                form.kind === k ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30" : "border-paper-border dark:border-ink-border hover:border-brand-500/40"
              }`}
            >
              <span className="text-lg">{LIFE_ADMIN_KIND[k].emoji}</span>
              <span className="block text-xs font-semibold mt-0.5">{LIFE_ADMIN_KIND[k].label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate -mt-2">{LIFE_ADMIN_KIND[form.kind].hint}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormRow label="Nome" htmlFor="la-title">
            <input id="la-title" className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Seguro do carro" maxLength={160} />
          </FormRow>
          <FormRow label="Categoria" htmlFor="la-cat">
            <select id="la-cat" className={inputClass} value={form.category} onChange={(e) => set({ category: e.target.value as LifeAdminCategory })}>
              {(Object.keys(LIFE_ADMIN_CATEGORY) as LifeAdminCategory[]).map((c) => (
                <option key={c} value={c}>
                  {LIFE_ADMIN_CATEGORY[c].emoji} {LIFE_ADMIN_CATEGORY[c].label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label={form.kind === "documento" ? "Validade (opcional)" : form.kind === "manutencao" ? "Próxima manutenção" : "Vencimento"} htmlFor="la-due">
            <input id="la-due" type="date" className={inputClass} value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </FormRow>
          <FormRow label="Repetição" htmlFor="la-rec">
            <select
              id="la-rec"
              className={inputClass}
              value={form.recurrenceMonths ?? ""}
              onChange={(e) => set({ recurrenceMonths: e.target.value ? Number(e.target.value) : null })}
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.label} value={o.value ?? ""}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Avisar com antecedência" htmlFor="la-remind" hint="Você recebe um push quando entrar nesta janela, no dia e se atrasar.">
            <select id="la-remind" className={inputClass} value={form.remindDaysBefore} onChange={(e) => set({ remindDaysBefore: Number(e.target.value) })}>
              {[0, 3, 7, 15, 30, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Só no dia" : `${d} dias antes`}
                </option>
              ))}
            </select>
          </FormRow>
          {showAmount && (
            <FormRow label="Valor (opcional)" htmlFor="la-amount">
              <input id="la-amount" inputMode="decimal" className={inputClass} value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" />
            </FormRow>
          )}
          <FormRow label="Referência (opcional)" htmlFor="la-ref" hint="Nº da apólice, placa, protocolo…">
            <input id="la-ref" className={inputClass} value={form.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={120} />
          </FormRow>
          <FormRow label="Onde está guardado (opcional)" htmlFor="la-loc">
            <input id="la-loc" className={inputClass} value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Gaveta do escritório, pasta azul…" maxLength={200} />
          </FormRow>
        </div>

        <FormRow label="Observações" htmlFor="la-notes">
          <textarea id="la-notes" rows={3} className={`${inputClass} resize-none`} value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={4000} />
        </FormRow>

        <div className="rounded-xl border border-dashed border-paper-border dark:border-ink-border p-3 flex items-center gap-3">
          <FileText size={18} className="text-slate shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{currentFileName ?? "Foto ou PDF do documento (opcional)"}</p>
            <p className="text-[11px] text-slate">Até ~3 MB. Fica guardado só na sua conta.</p>
          </div>
          {currentFileName && (
            <button type="button" onClick={() => setFile(null)} className="text-slate hover:text-drop" aria-label="Remover arquivo">
              <Trash2 size={15} />
            </button>
          )}
          <label className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-paper-border dark:border-ink-border px-3 py-1.5 text-xs font-semibold cursor-pointer hover:border-brand-500">
            <Paperclip size={13} /> {currentFileName ? "Trocar" : "Anexar"}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        </div>

        {error && (
          <p className="text-xs text-drop" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
