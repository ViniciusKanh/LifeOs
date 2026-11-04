import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, FileClock, Plus, Sparkles, Target, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useContracts } from "@/hooks/useContracts";
import { useGuildActions } from "@/hooks/useContractGuild";
import { useGoals } from "@/hooks/useGoals";
import { useProjects } from "@/hooks/useProjects";
import { useCampaigns } from "@/hooks/useCampaigns";
import { DIFFICULTIES } from "@/services/gamificationService";
import type { Contract, ContractInput } from "@/services/contractsService";
import { CATEGORIES, CATEGORY_LABEL, type PactProposal } from "@/services/contractGuildService";
import type { Difficulty } from "@/types";
import { addDaysKey, todayKey } from "@/utils/localDate";
import { rpgField } from "@/components/contracts/contractUi";
import { ContractDocument, brDate } from "@/components/contracts/ContractDocument";
import { ContractTaskEditor, draftsToInput, emptyDraft, type TaskDraft } from "@/components/contracts/ContractTaskEditor";

type LinkChoice = "none" | "new" | (string & {});
type StageDraft = { name: string; objective: string; criterion: string };

const DEFAULT_STAGES: StageDraft[] = [
  { name: "Planejar", objective: "Definir o plano, os recursos e o primeiro passo.", criterion: "Plano registrado e primeiras tarefas criadas." },
  { name: "Iniciar", objective: "Começar a executar as primeiras obrigações.", criterion: "Primeiras tarefas concluídas." },
  { name: "Manter", objective: "Sustentar o ritmo combinado.", criterion: "Tarefas do meio do pacto concluídas no prazo." },
  { name: "Consolidar", objective: "Fechar pendências e revisar o resultado.", criterion: "Critérios de sucesso conferidos." },
  { name: "Selar", objective: "Revisar o pacto e selar o compromisso.", criterion: "Todas as obrigações concluídas." },
];

const R = { borderRadius: 3 };
const label = "block text-[11px] text-rpg-muted";

function daysFromToday(key: string): number | null {
  if (!key) return null;
  const t = todayKey();
  const [a, b] = [t, key].map((k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));
  const d = Math.round((b - a) / 86_400_000);
  return d >= 0 ? d : null;
}

/**
 * Formulário do pacto (Contratos 3.0): criar manualmente, com o Escriba dos
 * Pactos (IA propõe etapas, tarefas, prazos, dependências e critérios — o
 * usuário revisa tudo antes de firmar), salvar como rascunho, ou editar as
 * cláusulas de um contrato existente. Nada é salvo sem clicar em firmar/salvar.
 */
export function PactForm({
  mode,
  editing,
  prefill,
  onClose,
  onDone,
}: {
  mode: "manual" | "ai";
  editing?: Contract | null;
  prefill?: { title?: string; goalId?: string } | null;
  onClose: () => void;
  onDone: (id: string, msg: string) => void;
}) {
  const { user } = useAuth();
  const { create, update } = useContracts(false);
  const { scribe } = useGuildActions();
  const { goals } = useGoals();
  const { projects } = useProjects();
  const { campaigns } = useCampaigns();
  const today = todayKey();
  const isEdit = !!editing;
  const e = editing;

  // Parâmetros do Escriba.
  const [goalText, setGoalText] = useState(prefill?.title ?? "");
  const [stageCount, setStageCount] = useState(4);

  // Cláusulas.
  const [title, setTitle] = useState(e?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(e?.description ?? "");
  const [objective, setObjective] = useState(e?.objective ?? "");
  const [why, setWhy] = useState(e?.why ?? "");
  const [rewardText, setRewardText] = useState(e?.rewardText ?? "");
  const [stakes, setStakes] = useState(e?.stakes ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(e?.difficulty ?? "medio");
  const [priority, setPriority] = useState<"Baixa" | "Média" | "Alta">(e?.priority ?? "Média");
  const [category, setCategory] = useState(e?.category ?? "");
  const [startDate, setStartDate] = useState(e?.startDate ?? today);
  const [dueDate, setDueDate] = useState(e?.dueDate ?? "");
  const [weeklyHours, setWeeklyHours] = useState(e?.weeklyHours ? String(e.weeklyHours) : "");
  const [reminderDays, setReminderDays] = useState(e?.reminderDays != null ? String(e.reminderDays) : "3");
  const [criteria, setCriteria] = useState<string[]>(e?.successCriteria?.length ? e.successCriteria : [""]);
  const [campaignId, setCampaignId] = useState(e?.campaignId ?? "");
  const [stages, setStages] = useState<StageDraft[]>(DEFAULT_STAGES);
  const [drafts, setDrafts] = useState<TaskDraft[]>([emptyDraft(), emptyDraft()]);
  const [aiUsed, setAiUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openClauses, setOpenClauses] = useState(mode === "manual" || isEdit);

  const [goalChoice, setGoalChoice] = useState<LinkChoice>(e?.goalId ?? prefill?.goalId ?? "none");
  const [goalNewTitle, setGoalNewTitle] = useState("");
  const [goalNewDue, setGoalNewDue] = useState("");
  const [projectChoice, setProjectChoice] = useState<LinkChoice>(e?.projectId ?? "none");
  const [projectNewName, setProjectNewName] = useState("");
  const existingGoalId = goalChoice !== "none" && goalChoice !== "new" ? goalChoice : null;
  const existingProjectId = projectChoice !== "none" && projectChoice !== "new" ? projectChoice : null;
  const at = (days: number | null | undefined) => (days == null ? "" : addDaysKey(today, days));

  /** Proposta do Escriba vira o mesmo formulário editável do modo manual. */
  const applyProposal = (p: PactProposal) => {
    setTitle(p.title);
    setDescription(p.description ?? "");
    setObjective(p.objective ?? "");
    setWhy(p.why ?? why);
    setRewardText(p.rewardText ?? "");
    setStakes(p.stakes ?? "");
    setDifficulty(p.difficulty);
    setPriority(p.priority);
    if (p.category) setCategory(p.category);
    setStartDate(at(p.startInDays) || today);
    setDueDate(at(p.dueInDays));
    if (p.weeklyHours) setWeeklyHours(String(p.weeklyHours));
    setCriteria(p.successCriteria.length ? p.successCriteria : [""]);
    setStages(p.stages.map((s) => ({ name: s.name, objective: s.objective ?? "", criterion: s.criterion ?? "" })));
    setDrafts(
      p.stages.flatMap((s, si) =>
        s.tasks.map((t) => ({
          ...emptyDraft(),
          title: t.title,
          description: [t.description ?? "", t.dependsOn ? `Depende de: ${t.dependsOn}` : ""].filter(Boolean).join("\n"),
          difficulty: t.difficulty,
          dueDate: at(t.dueInDays),
          estimate: t.estimateMinutes ? String(t.estimateMinutes) : "",
          stage: String(si),
        })),
      ),
    );
    setAiUsed(true);
    setOpenClauses(true);
  };

  const askScribe = async () => {
    setError(null);
    const hours = Number(weeklyHours);
    const startIn = daysFromToday(startDate) ?? 0;
    const deadline = daysFromToday(dueDate);
    try {
      const { proposal } = await scribe.mutateAsync({
        goal: goalText.trim(),
        why: why.trim() || undefined,
        category: category || undefined,
        difficulty,
        startInDays: startIn,
        deadlineDays: deadline && deadline > startIn ? deadline : undefined,
        weeklyHours: Number.isFinite(hours) && hours > 0 ? Math.min(80, Math.round(hours)) : undefined,
        stageCount,
      });
      applyProposal(proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "O Escriba não conseguiu redigir o pacto.");
    }
  };

  const tasks = useMemo(() => draftsToInput(drafts), [drafts]);
  const cleanCriteria = criteria.map((c) => c.trim()).filter(Boolean).slice(0, 10);
  const cleanStages = stages.filter((s) => s.name.trim());
  const dateError = !!dueDate && !!startDate && dueDate < startDate;
  const stageError = stages.some((s) => !s.name.trim());
  const canSave = title.trim().length >= 2 && !dateError && !stageError && !create.isPending && !update.isPending;

  const payload = (isDraft: boolean): ContractInput => {
    const hours = Number(weeklyHours);
    const rem = Number(reminderDays);
    return {
      title: title.trim(),
      description: description.trim() || null,
      objective: objective.trim() || null,
      why: why.trim() || null,
      rewardText: rewardText.trim() || null,
      stakes: stakes.trim() || null,
      difficulty,
      priority,
      category: category || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      weeklyHours: Number.isFinite(hours) && hours > 0 ? Math.min(80, Math.round(hours)) : null,
      reminderDays: reminderDays !== "" && Number.isFinite(rem) ? Math.min(30, Math.max(0, Math.round(rem))) : null,
      successCriteria: cleanCriteria,
      campaignId: campaignId || null,
      aiGenerated: aiUsed,
      stages: cleanStages.map((s) => ({ name: s.name.trim(), objective: s.objective.trim() || null, criterion: s.criterion.trim() || null })),
      tasks,
      goalId: existingGoalId,
      newGoal: goalChoice === "new" && goalNewTitle.trim() ? { title: goalNewTitle.trim(), dueDate: goalNewDue || null } : undefined,
      projectId: existingProjectId,
      newProject: projectChoice === "new" && projectNewName.trim() ? { name: projectNewName.trim(), startDate: startDate || null, dueDate: dueDate || null } : undefined,
      isDraft,
    };
  };

  const submit = async (isDraft: boolean) => {
    setError(null);
    try {
      if (isEdit && e) {
        const p = payload(false);
        await update.mutateAsync({
          id: e.id,
          input: {
            title: p.title,
            description: p.description,
            objective: p.objective,
            why: p.why,
            rewardText: p.rewardText,
            stakes: p.stakes,
            difficulty: p.difficulty,
            priority: p.priority,
            category: p.category,
            startDate: p.startDate,
            dueDate: p.dueDate,
            weeklyHours: p.weeklyHours,
            reminderDays: p.reminderDays,
            successCriteria: p.successCriteria,
            campaignId: p.campaignId,
            goalId: existingGoalId,
            projectId: existingProjectId,
          },
        });
        onDone(e.id, "Cláusulas atualizadas.");
        return;
      }
      const c = await create.mutateAsync(payload(isDraft));
      onDone(c.id, isDraft ? "Rascunho guardado. Ative quando estiver pronto." : `Pacto firmado com ${tasks.length} obrigação(ões) em ${cleanStages.length} etapa(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o pacto.");
    }
  };

  const setStage = (i: number, patch: Partial<StageDraft>) => setStages((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveStage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    setStages((s) => {
      const n = [...s];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
    // Tarefas acompanham a etapa movida.
    setDrafts((d) => d.map((t) => (t.stage === String(i) ? { ...t, stage: String(j) } : t.stage === String(j) ? { ...t, stage: String(i) } : t)));
  };
  const removeStage = (i: number) => {
    setStages((s) => s.filter((_, j) => j !== i));
    setDrafts((d) => d.map((t) => (t.stage === String(i) ? { ...t, stage: "" } : t.stage && Number(t.stage) > i ? { ...t, stage: String(Number(t.stage) - 1) } : t)));
  };

  const goalTitle = goalChoice === "new" ? goalNewTitle : goals.find((g) => g.id === goalChoice)?.title ?? null;
  const projectName = projectChoice === "new" ? projectNewName : projects.find((p) => p.id === projectChoice)?.name ?? null;
  const showBody = mode === "manual" || isEdit || aiUsed;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isEdit ? "Editar pacto" : mode === "ai" ? "Escriba dos Pactos" : "Novo contrato"}
      footer={
        showBody ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dateError && <span className="mr-auto text-xs text-rpg-red">O prazo final precisa ser depois do início.</span>}
            {stageError && <span className="mr-auto text-xs text-rpg-red">Toda etapa precisa de um nome.</span>}
            {!isEdit && tasks.length < 2 && !dateError && !stageError && <span className="mr-auto text-[11px] text-rpg-muted">O bônus oficial do contrato exige ao menos 2 obrigações.</span>}
            <RPGButton variant="ghost" onClick={onClose}>
              Cancelar
            </RPGButton>
            {!isEdit && (
              <RPGButton variant="secondary" disabled={!canSave} onClick={() => void submit(true)}>
                <FileClock size={14} aria-hidden /> Salvar rascunho
              </RPGButton>
            )}
            <RPGButton variant="gold" disabled={!canSave} onClick={() => void submit(false)}>
              <Check size={14} aria-hidden /> {create.isPending || update.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Assinar e firmar"}
            </RPGButton>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {mode === "ai" && !isEdit && (
          <section className="space-y-3 border border-rpg-purple/50 bg-rpg-purple/5 p-3" style={R} aria-labelledby="scribe-title">
            <h3 id="scribe-title" className="flex items-center gap-1.5 font-rpg text-sm font-semibold text-rpg-gold-light">
              <Wand2 size={14} aria-hidden /> O que você quer pactuar?
            </h3>
            <textarea rows={3} value={goalText} onChange={(ev) => setGoalText(ev.target.value)} className={rpgField} style={R} placeholder="Ex.: voltar a treinar 4 vezes por semana até o fim do mês" aria-label="Objetivo do pacto" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className={label}>
                Categoria
                <select value={category} onChange={(ev) => setCategory(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                  <option value="">O Escriba decide</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Etapas
                <select value={stageCount} onChange={(ev) => setStageCount(Number(ev.target.value))} className={`${rpgField} mt-1`} style={R}>
                  {[3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} etapas
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Prazo final <span className="opacity-70">(opcional)</span>
                <input type="date" value={dueDate} min={today} onChange={(ev) => setDueDate(ev.target.value)} className={`${rpgField} mt-1`} style={R} />
              </label>
              <label className={label}>
                Horas por semana
                <input type="number" min={1} max={80} value={weeklyHours} onChange={(ev) => setWeeklyHours(ev.target.value)} className={`${rpgField} mt-1`} style={R} placeholder="Ex.: 5" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RPGButton variant="primary" disabled={goalText.trim().length < 8 || scribe.isPending} onClick={() => void askScribe()}>
                <Sparkles size={14} aria-hidden /> {scribe.isPending ? "O Escriba está redigindo…" : aiUsed ? "Redigir outra proposta" : "Pedir proposta ao Escriba"}
              </RPGButton>
              <p className="text-[11px] text-rpg-muted">Hoje é {brDate(today)}. O Escriba recebe só estes termos e a contagem real das suas tarefas. Você revisa etapas, tarefas, prazos e critérios antes de firmar.</p>
            </div>
          </section>
        )}

        {showBody && (
          <>
            {aiUsed && (
              <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />}>
                Proposta do Escriba — revise antes de firmar
              </RPGBadge>
            )}
            {!isEdit && (
              <ContractDocument
                compact
                data={{
                  title: title.trim() || "Contrato sem título",
                  description: description.trim() || null,
                  objective: objective.trim() || null,
                  why: why.trim() || null,
                  rewardText: rewardText.trim() || null,
                  stakes: stakes.trim() || null,
                  startDate: startDate || null,
                  dueDate: dueDate || null,
                  weeklyHours: Number(weeklyHours) > 0 ? Math.round(Number(weeklyHours)) : null,
                  difficulty,
                  goalTitle: goalTitle || null,
                  projectName: projectName || null,
                  aiGenerated: aiUsed,
                  obligations: tasks,
                  signerName: user?.name ?? "Você",
                }}
              />
            )}
            <div className="rpg-panel">
              <button type="button" onClick={() => setOpenClauses((v) => !v)} aria-expanded={openClauses} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-rpg-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
                Cláusulas do pacto
                <ChevronDown size={16} className={openClauses ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden />
              </button>
              {openClauses && (
                <div className="space-y-3 border-t border-rpg-border/60 p-3">
                  <label className={label}>
                    Nome do contrato <span className="text-rpg-red">*</span>
                    <input value={title} onChange={(ev) => setTitle(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={160} placeholder="Ex.: Domínio da Rotina em 30 dias" />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className={label}>
                      Objetivo (verificável)
                      <input value={objective} onChange={(ev) => setObjective(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={600} placeholder="Como você saberá que cumpriu?" />
                    </label>
                    <label className={label}>
                      Categoria
                      <select value={category} onChange={(ev) => setCategory(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                        <option value="">Sem categoria</option>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className={label}>
                    Descrição (o que está sendo pactuado)
                    <textarea rows={2} value={description} onChange={(ev) => setDescription(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={2000} />
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className={label}>
                      Prioridade
                      <select value={priority} onChange={(ev) => setPriority(ev.target.value as typeof priority)} className={`${rpgField} mt-1`} style={R}>
                        {(["Baixa", "Média", "Alta"] as const).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={label}>
                      Dificuldade
                      <select value={difficulty} onChange={(ev) => setDifficulty(ev.target.value as Difficulty)} className={`${rpgField} mt-1`} style={R}>
                        {DIFFICULTIES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={label}>
                      Início
                      <input type="date" value={startDate} onChange={(ev) => setStartDate(ev.target.value)} className={`${rpgField} mt-1`} style={R} />
                    </label>
                    <label className={label}>
                      Prazo final
                      <input type="date" value={dueDate} min={startDate || undefined} onChange={(ev) => setDueDate(ev.target.value)} className={`${rpgField} mt-1`} style={R} />
                    </label>
                    <label className={label}>
                      Horas por semana
                      <input type="number" min={1} max={80} value={weeklyHours} onChange={(ev) => setWeeklyHours(ev.target.value)} className={`${rpgField} mt-1`} style={R} />
                    </label>
                    <label className={label}>
                      Lembrar antes do prazo
                      <select value={reminderDays} onChange={(ev) => setReminderDays(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                        <option value="">Sem lembrete</option>
                        {[1, 2, 3, 5, 7, 14].map((d) => (
                          <option key={d} value={d}>
                            {d} dia(s) antes
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`${label} col-span-2`}>
                      Campanha (Forja)
                      <select value={campaignId} onChange={(ev) => setCampaignId(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                        <option value="">Nenhuma</option>
                        {campaigns.filter((c) => c.status !== "archived").map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <fieldset className="space-y-1.5">
                    <legend className={label}>Critérios de sucesso</legend>
                    {criteria.map((c, i) => (
                      <div key={i} className="flex gap-1.5">
                        <input value={c} onChange={(ev) => setCriteria((l) => l.map((x, j) => (j === i ? ev.target.value : x)))} className={rpgField} style={R} maxLength={200} placeholder={`Critério ${i + 1} — ex.: 12 treinos registrados`} aria-label={`Critério de sucesso ${i + 1}`} />
                        {criteria.length > 1 && (
                          <button type="button" className="px-2 text-rpg-muted hover:text-rpg-red" onClick={() => setCriteria((l) => l.filter((_, j) => j !== i))} aria-label={`Remover critério ${i + 1}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {criteria.length < 10 && (
                      <RPGButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setCriteria((l) => [...l, ""])}>
                        <Plus size={12} aria-hidden /> Critério
                      </RPGButton>
                    )}
                  </fieldset>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className={label}>
                      Motivação (“Considerando que…”)
                      <input value={why} onChange={(ev) => setWhy(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={600} />
                    </label>
                    <label className={label}>
                      Recompensa pessoal
                      <input value={rewardText} onChange={(ev) => setRewardText(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={300} placeholder="Ex.: uma noite livre" />
                    </label>
                    <label className={label}>
                      Se não cumprir
                      <input value={stakes} onChange={(ev) => setStakes(ev.target.value)} className={`${rpgField} mt-1`} style={R} maxLength={300} placeholder="Ex.: replanejar na revisão semanal" />
                    </label>
                  </div>
                  <fieldset className="rpg-panel space-y-2 p-3">
                    <legend className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-rpg-purple">
                      <Target size={12} aria-hidden /> Meta e Projeto vinculados
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className={label}>
                        Meta
                        <select value={goalChoice} onChange={(ev) => setGoalChoice(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                          <option value="none">Nenhuma</option>
                          {!isEdit && <option value="new">+ Criar nova meta…</option>}
                          {goals.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.title}
                            </option>
                          ))}
                        </select>
                        {goalChoice === "new" && (
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                            <input value={goalNewTitle} onChange={(ev) => setGoalNewTitle(ev.target.value)} className={rpgField} style={R} placeholder="Título da meta" aria-label="Título da nova meta" />
                            <input type="date" value={goalNewDue} onChange={(ev) => setGoalNewDue(ev.target.value)} className={rpgField} style={R} aria-label="Prazo da meta" />
                          </div>
                        )}
                      </label>
                      <label className={label}>
                        Projeto
                        <select value={projectChoice} onChange={(ev) => setProjectChoice(ev.target.value)} className={`${rpgField} mt-1`} style={R}>
                          <option value="none">Nenhum</option>
                          {!isEdit && <option value="new">+ Criar novo projeto…</option>}
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {projectChoice === "new" && <input value={projectNewName} onChange={(ev) => setProjectNewName(ev.target.value)} className={`${rpgField} mt-1.5`} style={R} placeholder="Nome do projeto" aria-label="Nome do novo projeto" />}
                      </label>
                    </div>
                  </fieldset>
                </div>
              )}
            </div>

            {!isEdit && (
              <section className="space-y-2" aria-labelledby="stages-title">
                <div className="flex items-center gap-2">
                  <h3 id="stages-title" className="font-rpg text-sm font-semibold text-rpg-gold-light">
                    Etapas do pacto
                  </h3>
                  <span className="text-[11px] text-rpg-muted">Cada etapa conclui sozinha quando as tarefas dela terminam.</span>
                </div>
                <ol className="space-y-2">
                  {stages.map((s, i) => (
                    <li key={i} className="border border-rpg-border/70 bg-rpg-bg-2/40 p-2" style={R}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-pixel text-[10px] text-rpg-gold">{i + 1}</span>
                        <input value={s.name} onChange={(ev) => setStage(i, { name: ev.target.value })} className={`${rpgField} !py-1`} style={R} maxLength={80} aria-label={`Nome da etapa ${i + 1}`} />
                        <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Mover etapa para cima">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Mover etapa para baixo">
                          <ArrowDown size={14} />
                        </button>
                        {stages.length > 1 && (
                          <button type="button" onClick={() => removeStage(i)} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover etapa ${i + 1}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <input value={s.objective} onChange={(ev) => setStage(i, { objective: ev.target.value })} className={`${rpgField} !py-1 text-xs`} style={R} maxLength={300} placeholder="Objetivo da etapa" aria-label={`Objetivo da etapa ${i + 1}`} />
                        <input value={s.criterion} onChange={(ev) => setStage(i, { criterion: ev.target.value })} className={`${rpgField} !py-1 text-xs`} style={R} maxLength={300} placeholder="Critério de conclusão" aria-label={`Critério da etapa ${i + 1}`} />
                      </div>
                    </li>
                  ))}
                </ol>
                {stages.length < 10 && (
                  <RPGButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setStages((s) => [...s, { name: `Etapa ${s.length + 1}`, objective: "", criterion: "" }])}>
                    <Plus size={12} aria-hidden /> Etapa
                  </RPGButton>
                )}
                <h3 className="pt-2 font-rpg text-sm font-semibold text-rpg-gold-light">Obrigações (tarefas reais)</h3>
                <ContractTaskEditor drafts={drafts} onChange={setDrafts} contractDue={dueDate || null} stages={stages.map((s) => s.name || "Etapa")} />
              </section>
            )}
          </>
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
