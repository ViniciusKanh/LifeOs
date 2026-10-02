import { useEffect, useState } from "react";
import { Compass, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import type { LifeVision } from "@/types";

/** Visão, propósito e valores — o topo da cadeia de "por quê". Texto escrito pelo próprio usuário. */
export function VisionCard({
  vision,
  onSave,
  isSaving,
}: {
  vision: LifeVision;
  onSave: (input: { vision: string | null; purpose: string | null; values: Array<{ name: string; description: string | null }> }) => Promise<unknown>;
  isSaving: boolean;
}) {
  const empty = !vision.vision && !vision.purpose && vision.values.length === 0;
  const [editing, setEditing] = useState(empty);
  const [v, setV] = useState(vision.vision ?? "");
  const [p, setP] = useState(vision.purpose ?? "");
  const [values, setValues] = useState(vision.values);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    setV(vision.vision ?? "");
    setP(vision.purpose ?? "");
    setValues(vision.values);
  }, [vision]);

  const addValue = () => {
    const name = newValue.trim();
    if (!name || values.some((x) => x.name.toLowerCase() === name.toLowerCase()) || values.length >= 12) return;
    setValues([...values, { name, description: null }]);
    setNewValue("");
  };

  const save = async () => {
    await onSave({ vision: v.trim() || null, purpose: p.trim() || null, values });
    setEditing(false);
  };

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-gradient-to-br from-cat-purple/20 to-signal/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-xl bg-cat-purple/12 text-cat-purple flex items-center justify-center">
            <Compass size={16} />
          </span>
          <p className="text-sm font-semibold flex-1">Visão e valores</p>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-slate hover:text-brand-600 inline-flex items-center gap-1">
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="vision-text" className="text-xs font-medium text-slate">
                Visão — como você quer que sua vida esteja daqui a alguns anos?
              </label>
              <textarea id="vision-text" rows={3} value={v} onChange={(e) => setV(e.target.value)} maxLength={4000} className={`${inputClass} mt-1.5 resize-none`} placeholder="Daqui a 5 anos eu…" />
            </div>
            <div>
              <label htmlFor="purpose-text" className="text-xs font-medium text-slate">
                Propósito em uma frase
              </label>
              <input id="purpose-text" value={p} onChange={(e) => setP(e.target.value)} maxLength={400} className={`${inputClass} mt-1.5`} placeholder="Ex.: Construir coisas úteis com saúde e tempo para quem eu amo." />
            </div>
            <div>
              <p className="text-xs font-medium text-slate mb-1.5">Valores (o que não negocia)</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {values.map((val) => (
                  <span key={val.name} className="inline-flex items-center gap-1 rounded-full bg-cat-purple/10 text-cat-purple px-2.5 py-1 text-xs font-medium">
                    {val.name}
                    <button onClick={() => setValues(values.filter((x) => x.name !== val.name))} aria-label={`Remover ${val.name}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValue())}
                  maxLength={60}
                  className={inputClass}
                  placeholder="Saúde, Família, Liberdade, Aprender…"
                  aria-label="Novo valor"
                />
                <Button variant="secondary" onClick={addValue}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {!empty && (
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
              <Button onClick={save} disabled={isSaving}>
                {isSaving && <Loader2 size={14} className="animate-spin" />} Salvar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {vision.purpose && <p className="font-display text-lg sm:text-xl font-semibold leading-snug">“{vision.purpose}”</p>}
            {vision.vision && <p className="text-sm text-slate whitespace-pre-line leading-relaxed">{vision.vision}</p>}
            {vision.values.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {vision.values.map((val) => (
                  <span key={val.name} className="rounded-full bg-cat-purple/10 text-cat-purple px-2.5 py-1 text-xs font-semibold">
                    {val.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
