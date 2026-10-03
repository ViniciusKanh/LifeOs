import { useState } from "react";
import { Check, Sparkles, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useContractAI, useContracts } from "@/hooks/useContracts";
import { DIFFICULTIES, difficultyLabel } from "@/services/gamificationService";
import type { ContractProposal } from "@/services/contractsService";
import type { Difficulty } from "@/types";
import { DIFFICULTY_TONE, dateInDays, rpgField } from "./contractUi";

/**
 * Firmar contrato: manual ou com o Gemini. A IA só PROPÕE — o usuário revisa,
 * desmarca/edita tarefas e só então confirma a criação.
 */
export function ContractCreateModal({ mode, onClose, onCreated }: { mode: "manual" | "ai"; onClose: () => void; onCreated: (id: string, msg: string) => void }) {
  const { create } = useContracts(false);
  const { propose } = useContractAI();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medio");
  const [dueDate, setDueDate] = useState("");
  const [tasksText, setTasksText] = useState("");
  const [goal, setGoal] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [proposal, setProposal] = useState<ContractProposal | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);

  const askAI = async () => {
    setError(null);
    try {
      const days = Number(deadlineDays);
      const { proposal: p } = await propose.mutateAsync({ goal: goal.trim(), difficulty, deadlineDays: Number.isFinite(days) && days > 0 ? days : undefined });
      setProposal(p);
      setPicked(p.tasks.map(() => true));
      setTitle(p.title);
      setDescription(p.description ?? "");
      setObjective(p.objective ?? "");
      setDifficulty(p.difficulty);
      setDueDate(dateInDays(p.dueInDays) ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu montar o contrato.");
    }
  };

  const submit = async () => {
    setError(null);
    const tasks = proposal
      ? proposal.tasks
          .filter((_, i) => picked[i])
          .map((t) => ({ title: t.title, description: t.description, priority: t.priority, difficulty: t.difficulty, dueDate: dateInDays(t.dueInDays), estimateMinutes: t.estimateMinutes }))
      : tasksText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 30)
          .map((t) => ({ title: t.slice(0, 200) }));
    try {
      const c = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        objective: objective.trim() || null,
        difficulty,
        dueDate: dueDate || null,
        aiGenerated: !!proposal,
        tasks,
      });
      onCreated(c.id, `Contrato firmado com ${tasks.length} tarefa(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível firmar o contrato.");
    }
  };

  const showForm = mode === "manual" || !!proposal;
  const canSave = title.trim().length >= 2 && !create.isPending;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={mode === "ai" ? "Criar contrato com a IA" : "Novo contrato"}
      footer={
        showForm ? (
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={onClose}>Cancelar</RPGButton>
            <RPGButton variant="gold" disabled={!canSave} onClick={submit}>
              <Check size={14} aria-hidden /> {create.isPending ? "Firmando…" : "Firmar contrato"}
            </RPGButton>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {mode === "ai" && (
          <section className="space-y-2">
            <label className="block text-xs font-semibold text-rpg-muted" htmlFor="ai-goal">Qual é o objetivo do contrato?</label>
            <textarea id="ai-goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} className={rpgField} style={{ borderRadius: 3 }} placeholder="Ex.: terminar o capítulo 2 da dissertação até o fim do mês" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-rpg-muted">
                Dificuldade
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }}>
                  {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-rpg-muted">
                Prazo (dias, opcional)
                <input type="number" min={1} max={365} value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} />
              </label>
            </div>
            <RPGButton variant="primary" disabled={goal.trim().length < 8 || propose.isPending} onClick={askAI}>
              <Wand2 size={14} aria-hidden /> {propose.isPending ? "O Copilot está redigindo…" : proposal ? "Gerar outra proposta" : "Gerar proposta"}
            </RPGButton>
            <p className="text-[11px] text-rpg-muted">A IA usa só o objetivo descrito e a contagem real das suas tarefas. Nada é salvo antes da sua confirmação.</p>
          </section>
        )}

        {proposal && (
          <section className="rpg-panel p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-purple"><Sparkles size={13} aria-hidden /> Sugestão da IA — revise as tarefas</p>
            <ul className="space-y-1.5">
              {proposal.tasks.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={picked[i] ?? false}
                    onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                    className="mt-1 accent-[rgb(var(--rpg-gold))]"
                    aria-label={`Incluir tarefa ${t.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      value={t.title}
                      onChange={(e) => setProposal((p) => (p ? { ...p, tasks: p.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) } : p))}
                      className={`${rpgField} !py-1`}
                      style={{ borderRadius: 3 }}
                      aria-label="Título da tarefa"
                    />
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-rpg-muted">
                      <RPGBadge tone={DIFFICULTY_TONE[t.difficulty]}>{difficultyLabel(t.difficulty)}</RPGBadge>
                      <span>{t.priority}</span>
                      {t.dueInDays != null && <span>· em {t.dueInDays} dia(s)</span>}
                      {t.estimateMinutes && <span>· ~{t.estimateMinutes} min</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showForm && (
          <section className="space-y-3">
            <label className="block text-[11px] text-rpg-muted">
              Nome do contrato
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} maxLength={160} />
            </label>
            <label className="block text-[11px] text-rpg-muted">
              Resultado esperado
              <input value={objective} onChange={(e) => setObjective(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} maxLength={600} placeholder="Como você saberá que cumpriu?" />
            </label>
            <label className="block text-[11px] text-rpg-muted">
              Descrição
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-rpg-muted">
                Dificuldade
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }}>
                  {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-rpg-muted">
                Prazo
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} />
              </label>
            </div>
            {mode === "manual" && (
              <label className="block text-[11px] text-rpg-muted">
                Tarefas (uma por linha)
                <textarea rows={4} value={tasksText} onChange={(e) => setTasksText(e.target.value)} className={`${rpgField} mt-1`} style={{ borderRadius: 3 }} placeholder={"Levantar referências\nEscrever rascunho\nRevisar com o orientador"} />
              </label>
            )}
          </section>
        )}
        {error && <p className="text-xs text-rpg-red" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
