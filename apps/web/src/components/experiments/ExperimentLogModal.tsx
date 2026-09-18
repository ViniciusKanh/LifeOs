import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import { Button, Field, IconBadge } from "@/components/ui/primitives";
import { useExperimentMetricsCatalog } from "@/hooks/useExperiments";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./experimentDisplay";
import type { Experiment, ExperimentCheckinDay, ExperimentCheckinStatus, ExperimentLog, ExperimentPerception } from "@/types";

const PERCEPTION_OPTIONS: Array<{ value: ExperimentPerception; label: string; emoji: string }> = [
  { value: "muito_ruim", label: "Muito ruim", emoji: "😞" },
  { value: "ruim", label: "Ruim", emoji: "🙁" },
  { value: "neutro", label: "Neutro", emoji: "😐" },
  { value: "bom", label: "Bom", emoji: "🙂" },
  { value: "muito_bom", label: "Muito bom", emoji: "😄" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatDatePt(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });
}

/**
 * Modal "Registrar check-in" (seção 17). A confusão relatada pelo usuário
 * vinha daqui: o modal era o mesmo para experimentos automáticos e manuais.
 * Agora ele se adapta ao `verification_type`: automático mostra o que o
 * LifeOS já verificou (via `checkins`, calculado em getExperimentDetail) e
 * direciona para o módulo de origem quando falta dado; manual mantém o
 * Sim/Não, mas pré-preenche com o check-in já salvo naquele dia.
 */
export function ExperimentLogModal({
  experiment,
  checkins,
  logs,
  onClose,
  onSave,
  isSaving,
}: {
  experiment: Experiment;
  /** Status já calculado por dia (fonte automática ou manual) — vem de ExperimentDetail. */
  checkins?: ExperimentCheckinDay[];
  /** Observações/checkins manuais já salvos — usado para pré-preencher ao reabrir um dia já registrado. */
  logs?: ExperimentLog[];
  onClose: () => void;
  onSave: (input: { logDate: string; checkinStatus?: ExperimentCheckinStatus | null; perception?: ExperimentPerception | null; notes?: string | null }) => Promise<unknown>;
  isSaving?: boolean;
}) {
  const { data: catalog = [] } = useExperimentMetricsCatalog();
  const [logDate, setLogDate] = useState(today());

  const existingLog = useMemo(() => logs?.find((l) => l.log_date === logDate) ?? null, [logs, logDate]);
  const [notes, setNotes] = useState(existingLog?.notes ?? "");
  const [perception, setPerception] = useState<ExperimentPerception | null>(existingLog?.perception ?? null);
  const [checkinStatus, setCheckinStatus] = useState<ExperimentCheckinStatus | null>(existingLog?.checkin_status ?? null);
  const [touchedDate, setTouchedDate] = useState(false);

  const handleDateChange = (value: string) => {
    setLogDate(value);
    const found = logs?.find((l) => l.log_date === value) ?? null;
    setNotes(found?.notes ?? "");
    setPerception(found?.perception ?? null);
    setCheckinStatus(found?.checkin_status ?? null);
    setTouchedDate(true);
  };
  void touchedDate;

  const dayStatus = useMemo(() => checkins?.find((c) => c.date === logDate) ?? null, [checkins, logDate]);
  const primaryDef = catalog.find((m) => m.key === experiment.primary_metric);
  const CategoryIcon = CATEGORY_ICON[experiment.category];
  const isAutomatic = experiment.verification_type === "automatic";

  const handleSave = async () => {
    await onSave({
      logDate,
      notes: notes.trim() || null,
      perception,
      checkinStatus: isAutomatic ? null : checkinStatus,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 sticky top-0 bg-paper-raised dark:bg-ink-raised border-b border-paper-border dark:border-ink-border z-10">
          <IconBadge icon={<CategoryIcon size={17} />} tone="purple" size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{experiment.title}</p>
            <p className="text-[11px] text-slate">{CATEGORY_LABEL[experiment.category]} · Check-in de {formatDatePt(logDate)}</p>
          </div>
          <button onClick={onClose} className="text-slate shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Data" type="date" value={logDate} max={today()} onChange={(e) => handleDateChange(e.target.value)} />

          {isAutomatic ? (
            <AutomaticStatusPanel dayStatus={dayStatus} metricLabel={primaryDef?.label} sourcePath={primaryDef?.sourcePath} sourceLabel={primaryDef?.sourceLabel} />
          ) : (
            <div>
              <p className="text-xs text-slate mb-1.5">Você seguiu o comportamento proposto neste dia?</p>
              <div className="flex gap-2">
                <Button type="button" variant={checkinStatus === "done" ? "primary" : "secondary"} onClick={() => setCheckinStatus("done")}>
                  Sim
                </Button>
                <Button type="button" variant={checkinStatus === "missed" ? "primary" : "secondary"} onClick={() => setCheckinStatus("missed")}>
                  Não
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate">Como foi esse dia?</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Ex.: Dormi às 22h40 e acordei bem disposto."
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border resize-none"
            />
            <p className="text-[11px] text-slate mt-1">Opcional — a observação registrada aparece no histórico do experimento.</p>
          </div>

          <div>
            <label className="text-xs text-slate">Percepção</label>
            <div className="flex items-center gap-2 mt-1.5">
              {PERCEPTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPerception(perception === opt.value ? null : opt.value)}
                  aria-label={opt.label}
                  title={opt.label}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg border transition-colors ${
                    perception === opt.value ? "border-brand-500 bg-brand-500/10" : "border-paper-border dark:border-ink-border"
                  }`}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-paper-border dark:border-ink-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

/** Painel de status para experimentos com verificação automática (seção 17 — o ponto que faltava). */
function AutomaticStatusPanel({
  dayStatus,
  metricLabel,
  sourcePath,
  sourceLabel,
}: {
  dayStatus: ExperimentCheckinDay | null;
  metricLabel?: string;
  sourcePath?: string;
  sourceLabel?: string;
}) {
  if (dayStatus && dayStatus.status === "done") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-cat-green/30 bg-cat-green/[0.07] px-3.5 py-3">
        <CheckCircle2 size={17} className="text-cat-green shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-cat-green">Verificado automaticamente: cumprido</p>
          <p className="text-[11px] text-slate mt-0.5">O LifeOS já confirmou isso a partir do seu registro de {metricLabel ?? "métrica"} em {sourceLabel ?? "outro módulo"}. Nada a fazer aqui — só registre uma observação se quiser.</p>
        </div>
      </div>
    );
  }
  if (dayStatus && dayStatus.status === "missed") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-drop/30 bg-drop/[0.06] px-3.5 py-3">
        <XCircle size={17} className="text-drop shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-drop">Verificado automaticamente: não cumprido</p>
          <p className="text-[11px] text-slate mt-0.5">Seu registro de {metricLabel ?? "métrica"} nesse dia não atingiu o critério definido. Isso é calculado automaticamente, não precisa confirmar manualmente.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-signal/30 bg-signal/[0.08] px-3.5 py-3">
      <Clock size={17} className="text-signal-deep shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-signal-deep">Ainda sem dado de {metricLabel ?? "métrica"} nesse dia</p>
        <p className="text-[11px] text-slate mt-0.5">
          Este experimento é verificado automaticamente — não existe um botão de "confirmar" aqui. Registre {metricLabel ?? "o dado"} em {sourceLabel ?? "outro módulo"} e o LifeOS atualiza o check-in sozinho.
        </p>
        {sourcePath && (
          <Link to={sourcePath} className="inline-flex items-center gap-1 text-[11px] font-semibold text-cat-purple hover:underline mt-1.5">
            Registrar em {sourceLabel} <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}
