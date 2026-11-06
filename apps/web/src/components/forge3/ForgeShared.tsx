import type { ReactNode } from "react";
import clsx from "clsx";
import { BookOpen, Dumbbell, Leaf, Sun, Zap, Brain } from "lucide-react";
import { RPGBadge, RPGPanel } from "@/components/rpg";
import { ApiError } from "@/services/api";
import { STATUS_LABEL, STATUS_TONE, fmtNum, isReg, type ForgeModel, type Metrics, type Primary } from "@/services/forgeService";

/** Arte e utilitários comuns da Forja 3.0. */
export const FORGE_ART = "/assets/rpg/modules/forge3";
export const R = { borderRadius: 4 };
export type Notify = (m: string, tone?: "success" | "error") => void;
export const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-purple";

export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d })}%`);

const ICONS: Record<string, ReactNode> = {
  flame: <Dumbbell size={18} />,
  book: <BookOpen size={18} />,
  bolt: <Zap size={18} />,
  sun: <Sun size={18} />,
  leaf: <Leaf size={18} />,
};
export const templateIcon = (k: string | null | undefined) => (k && ICONS[k]) || <Brain size={18} />;

export function StatusBadge({ m }: { m: ForgeModel }) {
  return <RPGBadge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</RPGBadge>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 border-2 border-dashed border-rpg-border bg-rpg-bg-2/50 p-5 text-center" style={R}>
      <span className="text-rpg-purple" aria-hidden>
        {icon}
      </span>
      <p className="text-sm font-semibold text-rpg-text">{title}</p>
      {children && <div className="max-w-md text-xs text-rpg-muted">{children}</div>}
    </div>
  );
}

/** Seletor de modelo usado pelas abas de análise. */
export function ModelPicker({ models, value, onChange, filter }: { models: ForgeModel[]; value: string | null; onChange: (id: string) => void; filter?: (m: ForgeModel) => boolean }) {
  const list = filter ? models.filter(filter) : models;
  if (!list.length) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-rpg-muted">
      Modelo
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={clsx(FIELD, "max-w-xs py-1.5")} style={{ borderRadius: 3 }}>
        {list.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {STATUS_LABEL[m.status]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tabela de métricas completas (classificação ou regressão), sem misturar escalas. */
export function MetricsGrid({ m, compare, compareLabel = "Baseline" }: { m: Metrics; compare?: Metrics | null; compareLabel?: string }) {
  const rows: Array<[string, number | null, number | null, string]> = isReg(m)
    ? [
        ["MAE", m.mae, compare && isReg(compare) ? compare.mae : null, "Erro absoluto médio, na unidade do alvo."],
        ["RMSE", m.rmse, compare && isReg(compare) ? compare.rmse : null, "Penaliza erros grandes."],
        ["R²", m.r2, compare && isReg(compare) ? compare.r2 : null, "Variância explicada no holdout (pode ser negativo)."],
      ]
    : [
        ["Acurácia balanceada", m.balancedAccuracy, compare && !isReg(compare) ? compare.balancedAccuracy : null, "Média de sensibilidade e especificidade."],
        ["Acurácia", m.accuracy, compare && !isReg(compare) ? compare.accuracy : null, "Acertos / total (sensível a desbalanceamento)."],
        ["Precisão", m.precision, compare && !isReg(compare) ? compare.precision : null, "Dos dias previstos como positivos, quantos foram."],
        ["Recall", m.recall, compare && !isReg(compare) ? compare.recall : null, "Dos dias positivos, quantos o modelo encontrou."],
        ["F1", m.f1, compare && !isReg(compare) ? compare.f1 : null, "Média harmônica de precisão e recall."],
        ["ROC-AUC", m.rocAuc, compare && !isReg(compare) ? compare.rocAuc : null, "Capacidade de ordenar dias positivos acima dos negativos."],
        ["PR-AUC", m.prAuc, compare && !isReg(compare) ? compare.prAuc : null, "Área sob a curva precisão-recall."],
        ["Brier", m.brier, compare && !isReg(compare) ? compare.brier : null, "Erro quadrático da probabilidade (menor é melhor)."],
        ["Log-loss", m.logLoss, compare && !isReg(compare) ? compare.logLoss : null, "Penaliza probabilidades confiantes e erradas."],
      ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-xs">
        <thead>
          <tr className="text-left text-rpg-muted">
            <th className="py-1 pr-2 font-normal">Métrica</th>
            <th className="py-1 pr-2 text-right font-normal">Modelo</th>
            {compare && <th className="py-1 text-right font-normal">{compareLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, v, c, hint]) => (
            <tr key={l} className="border-t border-rpg-border/60" title={hint}>
              <td className="py-1 pr-2 text-rpg-text">{l}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-rpg-text">{fmtNum(v)}</td>
              {compare && <td className="py-1 text-right tabular-nums text-rpg-muted">{fmtNum(c)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-rpg-muted">n = {m.n} dias avaliados.</p>
    </div>
  );
}

export const lowerBetter = (p: Primary) => p !== "balanced_accuracy";

/** Painel das abas da Forja: mesmo cabeçalho do RPGPanel usado na Visão Geral (consistência visual). */
export function Section({ title, icon, action, tone, className, children }: { title: string; icon: ReactNode; action?: ReactNode; tone?: "gold" | "legendary"; className?: string; children: ReactNode }) {
  return (
    <RPGPanel title={title} icon={icon} actions={action} variant={tone ?? "default"} className={className}>
      {children}
    </RPGPanel>
  );
}
