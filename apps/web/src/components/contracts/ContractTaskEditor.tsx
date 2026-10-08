import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { DIFFICULTIES } from "@/services/gamificationService";
import type { ContractTaskInput } from "@/services/contractsService";
import type { Difficulty } from "@/types";
import { rpgField } from "./contractUi";

/** Rascunho de tarefa no formulário (strings, para inputs controlados). */
export interface TaskDraft {
  title: string;
  description: string;
  difficulty: Difficulty | "";
  dueDate: string;
  estimate: string;
  open: boolean;
}

export const emptyDraft = (): TaskDraft => ({ title: "", description: "", difficulty: "", dueDate: "", estimate: "", open: false });

/** Rascunhos preenchidos → entrada da API. Campos vazios ficam para os padrões do contrato (backend). */
export function draftsToInput(drafts: TaskDraft[]): ContractTaskInput[] {
  return drafts
    .filter((d) => d.title.trim())
    .slice(0, 30)
    .map((d) => {
      const est = Number(d.estimate);
      return {
        title: d.title.trim().slice(0, 200),
        description: d.description.trim() || null,
        difficulty: d.difficulty || null,
        dueDate: d.dueDate || null,
        estimateMinutes: Number.isFinite(est) && est > 0 ? Math.min(480, Math.round(est)) : null,
      };
    });
}

/**
 * Editor de tarefas do contrato: título obrigatório e detalhes opcionais
 * (descrição, dificuldade, prazo, estimativa). O que ficar vazio herda do
 * contrato no servidor, então nenhuma tarefa nasce "sem dados".
 */
export function ContractTaskEditor({ drafts, onChange, contractDue }: { drafts: TaskDraft[]; onChange: (d: TaskDraft[]) => void; contractDue?: string | null }) {
  const set = (i: number, patch: Partial<TaskDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-2">
      {drafts.map((d, i) => (
        <div key={i} className="border border-rpg-border/70 bg-rpg-bg-2/40 p-2 space-y-2" style={{ borderRadius: 3 }}>
          <div className="flex gap-2">
            <input
              value={d.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder={`Tarefa ${i + 1} — ex.: Escrever o rascunho da introdução`}
              aria-label={`Título da tarefa ${i + 1}`}
              className={rpgField}
              style={{ borderRadius: 3 }}
              maxLength={200}
            />
            <button type="button" onClick={() => set(i, { open: !d.open })} aria-expanded={d.open} aria-label="Detalhes da tarefa" className="shrink-0 px-2 text-rpg-muted hover:text-rpg-gold-light">
              <ChevronDown size={16} className={d.open ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {drafts.length > 1 && (
              <button type="button" onClick={() => onChange(drafts.filter((_, j) => j !== i))} aria-label={`Remover tarefa ${i + 1}`} className="shrink-0 px-2 text-rpg-muted hover:text-rpg-red">
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {d.open && (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="sm:col-span-3 text-[11px] text-rpg-muted">
                Descrição / critério de pronto
                <textarea rows={2} value={d.description} onChange={(e) => set(i, { description: e.target.value })} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} maxLength={2000} placeholder="O que fazer e como saber que terminou" />
              </label>
              <label className="text-[11px] text-rpg-muted">
                Dificuldade
                <select value={d.difficulty} onChange={(e) => set(i, { difficulty: e.target.value as Difficulty | "" })} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }}>
                  <option value="">Do contrato</option>
                  {DIFFICULTIES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-rpg-muted">
                Prazo
                <input type="date" value={d.dueDate} max={contractDue ?? undefined} onChange={(e) => set(i, { dueDate: e.target.value })} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} />
              </label>
              <label className="text-[11px] text-rpg-muted">
                Estimativa (min)
                <input type="number" min={5} max={480} step={5} value={d.estimate} onChange={(e) => set(i, { estimate: e.target.value })} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} placeholder="padrão" />
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RPGButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onChange([...drafts, emptyDraft()])}>
          <Plus size={13} aria-hidden /> Mais uma tarefa
        </RPGButton>
        <p className="text-[11px] text-rpg-muted">Campos vazios usam o prazo, a dificuldade e uma estimativa padrão do contrato — e a tarefa já nasce pronta para render XP.</p>
      </div>
    </div>
  );
}
