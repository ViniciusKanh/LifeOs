import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { RPGButton } from "@/components/rpg";
import { RPG_TONE_TEXT, rpgFieldClass } from "@/components/rpg/rpgAssets";
import type { BuildOverview, Scores } from "@/services/buildService";
import { ATTR_UI } from "@/utils/codexDisplay";

/** Acima disso a meta tende a ser irreal (o servidor devolve o mesmo aviso). */
const SUM_WARNING = 480;

/**
 * Build desejada: presets prontos ou ajuste fino por atributo. Nada é
 * salvo até "Salvar build"; restaurar volta ao preset padrão do servidor.
 */
export function DesiredBuildModal({
  open,
  onClose,
  data,
  saving,
  onSave,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  data: BuildOverview;
  saving: boolean;
  onSave: (input: { presetId: string | null; name: string; targets: Scores }) => Promise<string | null>;
  onReset: () => Promise<void>;
}) {
  const [presetId, setPresetId] = useState<string | null>(data.desired.presetId);
  const [name, setName] = useState(data.desired.name);
  const [targets, setTargets] = useState<Scores>(data.desired.targets);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresetId(data.desired.presetId);
    setName(data.desired.name);
    setTargets(data.desired.targets);
    setError(null);
  }, [open, data.desired]);

  const sum = Object.values(targets).reduce((a, b) => a + b, 0);
  const pickPreset = (p: BuildOverview["presets"][number]) => {
    setPresetId(p.id);
    setName(p.name);
    setTargets(p.targets);
  };
  const setOne = (key: keyof Scores, v: number) => {
    setPresetId(null);
    setTargets((t) => ({ ...t, [key]: v }));
  };
  const save = async () => {
    if (!name.trim()) return setError("Dê um nome à sua build.");
    try {
      await onSave({ presetId, name: name.trim(), targets });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a build.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustar build desejada"
      size="lg"
      footer={
        <>
          <RPGButton variant="ghost" onClick={() => void onReset().then(onClose)} disabled={saving}>
            <RotateCcw size={14} aria-hidden /> Restaurar padrão
          </RPGButton>
          <RPGButton variant="secondary" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="gold" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar build"}
          </RPGButton>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-2">Presets</legend>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={presetId === p.id}
                onClick={() => pickPreset(p)}
                className={clsx("border-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold", presetId === p.id ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-text hover:border-rpg-gold/60")}
                style={{ borderRadius: 3 }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs text-rpg-muted">Nome da build</span>
          <input className={clsx(rpgFieldClass, "mt-1")} style={{ borderRadius: 3 }} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>

        <fieldset className="space-y-3">
          <legend className="font-pixel text-[10px] uppercase tracking-[0.14em] text-rpg-gold mb-1">Meta por atributo (0–100)</legend>
          {data.attributes.map((a) => {
            const ui = ATTR_UI[a.key];
            const id = `desired-${a.key}`;
            return (
              <div key={a.key} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_40px] items-center gap-3">
                <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-rpg-text min-w-0">
                  <ui.icon size={16} className={RPG_TONE_TEXT[ui.tone]} aria-hidden />
                  <span className="truncate">{a.label}</span>
                </label>
                <input id={id} type="range" min={0} max={100} step={5} value={targets[a.key]} onChange={(e) => setOne(a.key, Number(e.target.value))} className="w-full accent-rpg-gold" aria-valuetext={`${targets[a.key]} (hoje ${a.score})`} />
                <span className="font-pixel text-sm tabular-nums text-rpg-gold-light text-right">{targets[a.key]}</span>
              </div>
            );
          })}
          <p className="text-[11px] text-rpg-muted">Soma: {sum} · referência de hoje: {data.attributes.reduce((s, a) => s + a.score, 0)}</p>
        </fieldset>

        {sum > SUM_WARNING && (
          <p className="flex items-start gap-2 border border-rpg-orange/60 bg-rpg-orange/10 px-3 py-2 text-xs text-rpg-orange" role="status">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden />
            Meta muito alta em todos os atributos ao mesmo tempo. Builds sustentáveis escolhem 2–3 prioridades e mantêm o resto estável.
          </p>
        )}
        {error && (
          <p className="text-xs text-rpg-red" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
