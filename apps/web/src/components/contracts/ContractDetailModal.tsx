import { useState } from "react";
import { Archive, ArchiveRestore, CheckSquare, Plus, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { useContractAI, useContractDetail, useContractRefresh, useContracts } from "@/hooks/useContracts";
import { taskService } from "@/services/taskService";
import { DIFFICULTIES, difficultyLabel } from "@/services/gamificationService";
import type { ProposedTask } from "@/services/contractsService";
import type { Difficulty } from "@/types";
import { DIFFICULTY_TONE, STATUS_LABEL, STATUS_TONE, dateInDays, fmtDate, rpgField } from "./contractUi";
import { ContractTaskEditor, draftsToInput, emptyDraft, type TaskDraft } from "./ContractTaskEditor";

const DONE = "Concluído";

/**
 * Detalhe do contrato: tarefas reais (concluir aqui = concluir a tarefa,
 * com XP pelo backend), novas tarefas manuais ou sugeridas pela IA e ações
 * de arquivo/exclusão — toda ação destrutiva pede confirmação.
 */
export function ContractDetailModal({ id, onClose, onToast }: { id: string; onClose: () => void; onToast: (msg: string, tone?: "success" | "error") => void }) {
  const { data, isLoading, isError } = useContractDetail(id);
  const { update, remove, addTasks } = useContracts(false);
  const { proposeTasks } = useContractAI();
  const refresh = useContractRefresh();
  const [drafts, setDrafts] = useState<TaskDraft[]>([emptyDraft()]);
  const [hint, setHint] = useState("");
  const [suggestions, setSuggestions] = useState<ProposedTask[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const c = data?.contract;
  const tasks = data?.tasks ?? [];

  const toggle = async (taskId: string, done: boolean) => {
    setBusyTask(taskId);
    try {
      await taskService.update(taskId, { status: done ? "A Fazer" : DONE });
      refresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível atualizar a tarefa.", "error");
    } finally {
      setBusyTask(null);
    }
  };

  const addManual = async () => {
    const tasks = draftsToInput(drafts);
    if (tasks.length === 0) return;
    try {
      await addTasks.mutateAsync({ id, tasks });
      setDrafts([emptyDraft()]);
      onToast(`${tasks.length} tarefa(s) adicionada(s) ao contrato.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível adicionar a tarefa.", "error");
    }
  };

  const askAI = async () => {
    try {
      const r = await proposeTasks.mutateAsync({ id, hint: hint.trim() || undefined });
      setSuggestions(r.tasks);
      setPicked(r.tasks.map(() => true));
    } catch (err) {
      onToast(err instanceof Error ? err.message : "A IA não conseguiu sugerir tarefas.", "error");
    }
  };

  const acceptAI = async () => {
    if (!suggestions) return;
    const chosen = suggestions.filter((_, i) => picked[i]);
    if (chosen.length === 0) return;
    try {
      await addTasks.mutateAsync({
        id,
        tasks: chosen.map((t) => ({ title: t.title, description: t.description, priority: t.priority, difficulty: t.difficulty, dueDate: dateInDays(t.dueInDays), estimateMinutes: t.estimateMinutes })),
      });
      setSuggestions(null);
      onToast(`${chosen.length} tarefa(s) adicionada(s) ao contrato.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível adicionar as tarefas.", "error");
    }
  };

  const doDelete = async (deleteOpenTasks: boolean) => {
    try {
      await remove.mutateAsync({ id, deleteOpenTasks });
      onToast("Contrato excluído.");
      onClose();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível excluir.", "error");
    }
  };

  return (
    <Modal open size="lg" onClose={onClose} title={c?.title ?? "Contrato"}>
      {isLoading && <p className="text-sm text-rpg-muted py-6">Abrindo o pergaminho…</p>}
      {isError && <p className="text-sm text-rpg-red py-6" role="alert">Não foi possível carregar o contrato.</p>}
      {c && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <RPGBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</RPGBadge>
            {c.aiGenerated && <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />}>Criado com IA</RPGBadge>}
            {c.dueDate && <span className="text-xs text-rpg-muted">Prazo: {fmtDate(c.dueDate)}</span>}
            <label className="ml-auto text-[11px] text-rpg-muted flex items-center gap-1.5">
              Dificuldade
              <select
                value={c.difficulty}
                disabled={c.status !== "ativo" || update.isPending}
                onChange={(e) => update.mutate({ id, input: { difficulty: e.target.value as Difficulty } })}
                className={`${rpgField} !w-auto !py-1`}
                style={{ borderRadius: 3 }}
              >
                {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </div>
          {c.objective && <p className="text-sm text-rpg-text">🎯 {c.objective}</p>}
          {c.description && <p className="text-sm text-rpg-muted whitespace-pre-line">{c.description}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
            <div className="rpg-panel p-2"><p className="font-pixel text-lg text-rpg-gold-light">+{c.reward.xp} XP</p><p className="text-[10px] text-rpg-muted">bônus ao cumprir</p></div>
            <div className="rpg-panel p-2"><p className="font-pixel text-lg text-rpg-gold-light">+{c.reward.coins} 🪙</p><p className="text-[10px] text-rpg-muted">moedas do bônus</p></div>
            <div className="rpg-panel p-2"><p className="font-pixel text-lg text-rpg-green">{c.earned.xp} XP</p><p className="text-[10px] text-rpg-muted">já ganhos aqui (dado real)</p></div>
          </div>
          <RPGProgressBar value={c.doneTasks} max={Math.max(1, c.totalTasks)} tone="gold" label="Progresso do contrato" valueLabel={`${c.doneTasks}/${c.totalTasks} tarefas`} />

          <section>
            <p className="font-rpg font-semibold text-rpg-text mb-2">Tarefas do contrato</p>
            {tasks.length === 0 && <p className="text-sm text-rpg-muted">Nenhuma tarefa ainda. Adicione abaixo ou peça sugestões à IA.</p>}
            <ul className="space-y-1">
              {tasks.map((t) => {
                const done = t.status === DONE;
                return (
                  <li key={t.id} className="flex items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 px-2 py-1.5" style={{ borderRadius: 3 }}>
                    <button
                      type="button"
                      disabled={busyTask === t.id || c.status === "arquivado"}
                      onClick={() => toggle(t.id, done)}
                      className="shrink-0 p-1 text-rpg-gold-light disabled:opacity-50"
                      aria-label={done ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
                      aria-pressed={done}
                    >
                      {done ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                    <span className={`min-w-0 flex-1 text-sm ${done ? "line-through text-rpg-muted" : "text-rpg-text"}`}>{t.title}</span>
                    {t.difficulty && <RPGBadge tone={DIFFICULTY_TONE[t.difficulty]}>{difficultyLabel(t.difficulty)}</RPGBadge>}
                    {t.due_date && <span className="hidden sm:inline text-[11px] text-rpg-muted">{fmtDate(t.due_date)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {c.status !== "arquivado" && (
            <section className="space-y-2">
              <ContractTaskEditor drafts={drafts} onChange={setDrafts} contractDue={c.dueDate} />
              <RPGButton variant="secondary" disabled={!drafts.some((d) => d.title.trim()) || addTasks.isPending} onClick={addManual}>
                <Plus size={14} aria-hidden /> Adicionar ao contrato
              </RPGButton>

              <div className="rpg-panel p-3 space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-purple"><Wand2 size={13} aria-hidden /> Próximas tarefas com o Copilot</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Opcional: foque em… (ex.: revisão final)" className={rpgField} style={{ borderRadius: 3 }} aria-label="Orientação para a IA" />
                  <RPGButton variant="primary" disabled={proposeTasks.isPending} onClick={askAI}>{proposeTasks.isPending ? "Pensando…" : "Sugerir tarefas"}</RPGButton>
                </div>
                {suggestions && (
                  <>
                    <p className="text-[11px] text-rpg-muted">Sugestão da IA — marque o que entra no contrato:</p>
                    <ul className="space-y-1">
                      {suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 accent-[rgb(var(--rpg-gold))]" aria-label={`Incluir ${s.title}`} />
                          <span className="min-w-0 flex-1 text-rpg-text">{s.title}{s.description && <span className="block text-[11px] text-rpg-muted">{s.description}</span>}</span>
                          <RPGBadge tone={DIFFICULTY_TONE[s.difficulty]}>{difficultyLabel(s.difficulty)}</RPGBadge>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <RPGButton variant="gold" disabled={addTasks.isPending || !picked.some(Boolean)} onClick={acceptAI}>Adicionar selecionadas</RPGButton>
                      <RPGButton variant="ghost" onClick={() => setSuggestions(null)}>Descartar</RPGButton>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          <footer className="flex flex-wrap gap-2 border-t border-rpg-border/60 pt-3">
            {c.status === "arquivado" ? (
              <RPGButton variant="secondary" onClick={() => update.mutate({ id, input: { status: "ativo" } })}><ArchiveRestore size={14} aria-hidden /> Reativar</RPGButton>
            ) : (
              <RPGButton variant="secondary" onClick={() => update.mutate({ id, input: { status: "arquivado" } })}><Archive size={14} aria-hidden /> Arquivar</RPGButton>
            )}
            {!confirmDelete ? (
              <RPGButton variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden /> Excluir</RPGButton>
            ) : (
              <div className="ml-auto flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-rpg-orange">Excluir o contrato? XP já ganho é mantido.</span>
                <RPGButton variant="danger" onClick={() => doDelete(false)}>Manter tarefas</RPGButton>
                <RPGButton variant="danger" onClick={() => doDelete(true)}>Apagar tarefas abertas</RPGButton>
                <RPGButton variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</RPGButton>
              </div>
            )}
          </footer>
        </div>
      )}
    </Modal>
  );
}
