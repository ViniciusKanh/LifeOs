import { useMemo, useState } from "react";
import { Check, ChevronDown, Sparkles, Target, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useContractAI, useContracts } from "@/hooks/useContracts";
import { useGoals } from "@/hooks/useGoals";
import { useProjects } from "@/hooks/useProjects";
import { DIFFICULTIES, difficultyLabel } from "@/services/gamificationService";
import type { ContractProposal, ProposeContractInput } from "@/services/contractsService";
import type { Difficulty } from "@/types";
import { addDaysKey, todayKey } from "@/utils/localDate";
import { DIFFICULTY_TONE, rpgField } from "./contractUi";
import { ContractDocument, brDate } from "./ContractDocument";
import { ContractTaskEditor, draftsToInput, emptyDraft, type TaskDraft } from "./ContractTaskEditor";

/** Escolha de vínculo: nenhum, uma Meta/Projeto já existente, ou criar um novo. */
type LinkChoice = "none" | "new" | (string & {});

const AREAS = ["Estudos", "Trabalho", "Saúde e treino", "Finanças", "Carreira", "Relacionamentos", "Criatividade", "Casa e rotina"];
const TASK_COUNTS: Array<{ value: NonNullable<ProposeContractInput["taskCount"]>; label: string }> = [
  { value: "enxuto", label: "Enxuto (3–4 tarefas)" },
  { value: "equilibrado", label: "Equilibrado (5–6)" },
  { value: "detalhado", label: "Detalhado (7–8)" },
];

const fieldStyle = { borderRadius: 3 };
const label = "block text-[11px] text-rpg-muted";

/** Dias entre hoje e uma data YYYY-MM-DD (null se vazia ou no passado). */
function daysFromToday(key: string): number | null {
  if (!key) return null;
  const t = todayKey();
  const [a, b] = [t, key].map((k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));
  const d = Math.round((b - a) / 86_400_000);
  return d >= 0 ? d : null;
}

/**
 * Firmar contrato: manual ou com o Gemini. O usuário passa os parâmetros
 * (objetivo, motivação, vigência, horas por semana, tamanho, Meta/Projeto),
 * a IA redige uma MINUTA e o contrato aparece como documento. Nada é salvo
 * antes de o usuário revisar as cláusulas e clicar em "Assinar e firmar".
 */
export function ContractCreateModal({ mode, onClose, onCreated }: { mode: "manual" | "ai"; onClose: () => void; onCreated: (id: string, msg: string) => void }) {
  const { user } = useAuth();
  const { create } = useContracts(false);
  const { propose } = useContractAI();
  const { goals } = useGoals();
  const { projects } = useProjects();
  const today = todayKey();

  // Parâmetros enviados à IA.
  const [goal, setGoal] = useState("");
  const [area, setArea] = useState("");
  const [taskCount, setTaskCount] = useState<NonNullable<ProposeContractInput["taskCount"]>>("equilibrado");
  const [suggestNew, setSuggestNew] = useState(true);

  // Cláusulas do contrato (editáveis em qualquer modo).
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [why, setWhy] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [stakes, setStakes] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medio");
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [drafts, setDrafts] = useState<TaskDraft[]>([emptyDraft(), emptyDraft()]);
  const [proposal, setProposal] = useState<ContractProposal | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(mode === "manual");

  // Meta/Projeto anexados — muitos contratos representam um objetivo maior.
  const [goalChoice, setGoalChoice] = useState<LinkChoice>("none");
  const [goalNewTitle, setGoalNewTitle] = useState("");
  const [goalNewDue, setGoalNewDue] = useState("");
  const [projectChoice, setProjectChoice] = useState<LinkChoice>("none");
  const [projectNewName, setProjectNewName] = useState("");
  const [projectNewStart, setProjectNewStart] = useState("");
  const [projectNewDue, setProjectNewDue] = useState("");

  const existingGoalId = goalChoice !== "none" && goalChoice !== "new" ? goalChoice : undefined;
  const existingProjectId = projectChoice !== "none" && projectChoice !== "new" ? projectChoice : undefined;
  const at = (days: number | null | undefined) => (days == null ? "" : addDaysKey(today, days));

  const askAI = async () => {
    setError(null);
    const hours = Number(weeklyHours);
    const startIn = daysFromToday(startDate) ?? 0;
    const deadline = daysFromToday(dueDate);
    try {
      const { proposal: p } = await propose.mutateAsync({
        goal: goal.trim(),
        why: why.trim() || undefined,
        area: area || undefined,
        difficulty,
        startInDays: startIn,
        deadlineDays: deadline && deadline > startIn ? deadline : undefined,
        weeklyHours: Number.isFinite(hours) && hours > 0 ? Math.min(80, Math.round(hours)) : undefined,
        taskCount,
        goalId: existingGoalId,
        projectId: existingProjectId,
        suggestGoalProject: suggestNew,
      });
      setProposal(p);
      setPicked(p.tasks.map(() => true));
      setTitle(p.title);
      setDescription(p.description ?? "");
      setObjective(p.objective ?? "");
      setWhy(p.why ?? why);
      setRewardText(p.rewardText ?? "");
      setStakes(p.stakes ?? "");
      setDifficulty(p.difficulty);
      setStartDate(at(p.startInDays) || today);
      setDueDate(at(p.dueInDays));
      if (p.weeklyHours) setWeeklyHours(String(p.weeklyHours));
      // Vínculos já escolhidos pelo usuário prevalecem; sugestões novas só preenchem o que está vazio.
      if (!existingGoalId) {
        if (p.goal) {
          setGoalChoice("new");
          setGoalNewTitle(p.goal.title);
          setGoalNewDue(at(p.goal.dueInDays));
        } else setGoalChoice("none");
      }
      if (!existingProjectId) {
        if (p.project) {
          setProjectChoice("new");
          setProjectNewName(p.project.name);
          setProjectNewStart(at(p.project.startInDays));
          setProjectNewDue(at(p.project.dueInDays));
        } else setProjectChoice("none");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu redigir o contrato.");
    }
  };

  const chosenTasks = useMemo(
    () =>
      proposal
        ? proposal.tasks
            .filter((_, i) => picked[i])
            .map((t) => ({ title: t.title, description: t.description, priority: t.priority, difficulty: t.difficulty, startDate: at(t.startInDays) || null, dueDate: at(t.dueInDays) || null, estimateMinutes: t.estimateMinutes }))
        : draftsToInput(drafts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposal, picked, drafts],
  );

  const submit = async () => {
    setError(null);
    const hours = Number(weeklyHours);
    try {
      const c = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        objective: objective.trim() || null,
        why: why.trim() || null,
        rewardText: rewardText.trim() || null,
        stakes: stakes.trim() || null,
        difficulty,
        startDate: startDate || null,
        dueDate: dueDate || null,
        weeklyHours: Number.isFinite(hours) && hours > 0 ? Math.min(80, Math.round(hours)) : null,
        aiGenerated: !!proposal,
        tasks: chosenTasks,
        goalId: existingGoalId,
        newGoal: goalChoice === "new" && goalNewTitle.trim() ? { title: goalNewTitle.trim(), dueDate: goalNewDue || null } : undefined,
        projectId: existingProjectId,
        newProject: projectChoice === "new" && projectNewName.trim() ? { name: projectNewName.trim(), startDate: projectNewStart || null, dueDate: projectNewDue || null } : undefined,
      });
      onCreated(c.id, `Contrato firmado com ${chosenTasks.length} obrigação(ões).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível firmar o contrato.");
    }
  };

  const showDocument = mode === "manual" || !!proposal;
  const canSave = title.trim().length >= 2 && !create.isPending && (!dueDate || !startDate || dueDate >= startDate);
  const goalTitle = goalChoice === "new" ? goalNewTitle : goals.find((g) => g.id === goalChoice)?.title ?? null;
  const projectName = projectChoice === "new" ? projectNewName : projects.find((p) => p.id === projectChoice)?.name ?? null;

  const linkFields = (
    <fieldset className="rpg-panel space-y-2 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-rpg-purple">
        <Target size={12} aria-hidden /> Meta e Projeto anexados
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={label}>
          Meta
          <select value={goalChoice} onChange={(e) => setGoalChoice(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle}>
            <option value="none">Nenhuma</option>
            <option value="new">+ Criar nova meta…</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          {goalChoice === "new" && (
            <div className="mt-1.5 space-y-1.5">
              <input value={goalNewTitle} onChange={(e) => setGoalNewTitle(e.target.value)} className={rpgField} style={fieldStyle} placeholder="Título da meta" maxLength={200} aria-label="Título da nova meta" />
              <input type="date" value={goalNewDue} onChange={(e) => setGoalNewDue(e.target.value)} className={rpgField} style={fieldStyle} aria-label="Prazo da meta" />
            </div>
          )}
        </label>
        <label className={label}>
          Projeto
          <select value={projectChoice} onChange={(e) => setProjectChoice(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle}>
            <option value="none">Nenhum</option>
            <option value="new">+ Criar novo projeto…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projectChoice === "new" && (
            <div className="mt-1.5 space-y-1.5">
              <input value={projectNewName} onChange={(e) => setProjectNewName(e.target.value)} className={rpgField} style={fieldStyle} placeholder="Nome do projeto" maxLength={200} aria-label="Nome do novo projeto" />
              <div className="grid grid-cols-2 gap-1.5">
                <input type="date" value={projectNewStart} onChange={(e) => setProjectNewStart(e.target.value)} className={rpgField} style={fieldStyle} aria-label="Início do projeto" />
                <input type="date" value={projectNewDue} onChange={(e) => setProjectNewDue(e.target.value)} className={rpgField} style={fieldStyle} aria-label="Entrega do projeto" />
              </div>
            </div>
          )}
        </label>
      </div>
      {mode === "ai" && (
        <label className="flex items-start gap-2 text-[11px] text-rpg-muted">
          <input type="checkbox" checked={suggestNew} onChange={(e) => setSuggestNew(e.target.checked)} className="mt-0.5 accent-[rgb(var(--rpg-gold))]" />
          Se eu não escolher, a IA pode sugerir uma Meta e/ou um Projeto novos, com início e prazo calculados a partir de hoje.
        </label>
      )}
    </fieldset>
  );

  const termFields = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className={label}>
        Início da vigência
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} />
      </label>
      <label className={label}>
        Prazo final {mode === "ai" && <span className="opacity-70">(opcional)</span>}
        <input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} />
      </label>
      <label className={label}>
        Horas por semana
        <input type="number" inputMode="numeric" min={1} max={80} value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} placeholder="Ex.: 5" />
      </label>
      <label className={label}>
        Dificuldade
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={`${rpgField} mt-1`} style={fieldStyle}>
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={mode === "ai" ? "Redigir contrato com o Copilot" : "Novo contrato"}
      footer={
        showDocument ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dueDate && startDate && dueDate < startDate && <span className="mr-auto text-xs text-rpg-red">O prazo final precisa ser depois do início.</span>}
            <RPGButton variant="ghost" onClick={onClose}>
              Cancelar
            </RPGButton>
            <RPGButton variant="gold" disabled={!canSave} onClick={submit}>
              <Check size={14} aria-hidden /> {create.isPending ? "Firmando…" : "Assinar e firmar"}
            </RPGButton>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {mode === "ai" && (
          <section className="space-y-3" aria-labelledby="ai-params">
            <h3 id="ai-params" className="font-rpg text-sm font-semibold text-rpg-gold-light">
              1. Os termos que a IA precisa respeitar
            </h3>
            <label className={label} htmlFor="ai-goal">
              Qual é o compromisso? <span className="text-rpg-red">*</span>
            </label>
            <textarea id="ai-goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} className={rpgField} style={fieldStyle} placeholder="Ex.: terminar o capítulo 2 da dissertação e enviar ao orientador" />
            <label className={label}>
              Por que isso importa para você? <span className="opacity-70">(vira a cláusula de motivação)</span>
              <input value={why} onChange={(e) => setWhy(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={600} placeholder="Ex.: a qualificação depende desse capítulo" />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={label}>
                Área da vida
                <select value={area} onChange={(e) => setArea(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle}>
                  <option value="">A IA decide</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Tamanho do contrato
                <select value={taskCount} onChange={(e) => setTaskCount(e.target.value as typeof taskCount)} className={`${rpgField} mt-1`} style={fieldStyle}>
                  {TASK_COUNTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {termFields}
            {linkFields}
            <div className="flex flex-wrap items-center gap-2">
              <RPGButton variant="primary" disabled={goal.trim().length < 8 || propose.isPending} onClick={askAI}>
                <Wand2 size={14} aria-hidden /> {propose.isPending ? "O Copilot está redigindo…" : proposal ? "Redigir outra minuta" : "Redigir minuta"}
              </RPGButton>
              <p className="text-[11px] text-rpg-muted">
                Hoje é {brDate(today)}: a IA calcula as datas a partir daqui. Ela recebe só estes termos e a contagem real das suas tarefas — nada é salvo antes da sua assinatura.
              </p>
            </div>
          </section>
        )}

        {showDocument && (
          <section className="space-y-3" aria-labelledby="doc-title">
            <h3 id="doc-title" className="flex items-center gap-1.5 font-rpg text-sm font-semibold text-rpg-gold-light">
              {mode === "ai" ? "2. Minuta do contrato" : "Seu contrato"}
              {proposal && (
                <RPGBadge tone="purple" icon={<Sparkles size={9} aria-hidden />}>
                  Sugestão da IA
                </RPGBadge>
              )}
            </h3>
            <ContractDocument
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
                aiGenerated: !!proposal,
                obligations: chosenTasks,
                signerName: user?.name ?? "Você",
              }}
            />

            <div className="rpg-panel">
              <button
                type="button"
                onClick={() => setEditOpen((v) => !v)}
                aria-expanded={editOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-rpg-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold"
              >
                {mode === "ai" ? "3. Revisar e ajustar as cláusulas" : "Preencher as cláusulas"}
                <ChevronDown size={16} className={editOpen ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden />
              </button>
              {editOpen && (
                <div className="space-y-3 border-t border-rpg-border/60 p-3">
                  <label className={label}>
                    Nome do contrato
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={160} placeholder="Ex.: Concluir o capítulo 2 até 15/11" />
                  </label>
                  <label className={label}>
                    Objeto (o que está sendo pactuado)
                    <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} />
                  </label>
                  <label className={label}>
                    Critério de cumprimento
                    <input value={objective} onChange={(e) => setObjective(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={600} placeholder="Como você saberá que cumpriu?" />
                  </label>
                  {mode === "manual" && (
                    <label className={label}>
                      Motivação (“Considerando que…”)
                      <input value={why} onChange={(e) => setWhy(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={600} />
                    </label>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className={label}>
                      Recompensa pessoal ao cumprir
                      <input value={rewardText} onChange={(e) => setRewardText(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={300} placeholder="Ex.: uma noite livre com um filme" />
                    </label>
                    <label className={label}>
                      Se não cumprir no prazo
                      <input value={stakes} onChange={(e) => setStakes(e.target.value)} className={`${rpgField} mt-1`} style={fieldStyle} maxLength={300} placeholder="Ex.: replanejar na revisão semanal" />
                    </label>
                  </div>
                  {mode === "manual" && termFields}
                  {mode === "manual" && linkFields}
                  {proposal ? (
                    <fieldset>
                      <legend className="mb-1 text-[11px] text-rpg-muted">Obrigações sugeridas — desmarque o que não entra</legend>
                      <ul className="space-y-1.5">
                        {proposal.tasks.map((t, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={picked[i] ?? false}
                              onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                              className="mt-1.5 accent-[rgb(var(--rpg-gold))]"
                              aria-label={`Incluir ${t.title}`}
                            />
                            <div className="min-w-0 flex-1">
                              <input
                                value={t.title}
                                onChange={(e) => setProposal((p) => (p ? { ...p, tasks: p.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) } : p))}
                                className={`${rpgField} !py-1`}
                                style={fieldStyle}
                                aria-label="Título da obrigação"
                              />
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-rpg-muted">
                                <RPGBadge tone={DIFFICULTY_TONE[t.difficulty]}>{difficultyLabel(t.difficulty)}</RPGBadge>
                                <span>{t.priority}</span>
                                {t.dueInDays != null && <span>· até {brDate(at(t.dueInDays))}</span>}
                                {t.estimateMinutes ? <span>· ~{t.estimateMinutes} min</span> : null}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  ) : (
                    mode === "manual" && (
                      <fieldset>
                        <legend className="mb-1 text-[11px] text-rpg-muted">Obrigações (tarefas)</legend>
                        <ContractTaskEditor drafts={drafts} onChange={setDrafts} contractDue={dueDate || null} />
                      </fieldset>
                    )
                  )}
                </div>
              )}
            </div>
          </section>
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
