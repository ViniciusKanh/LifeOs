import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GripVertical, Hammer, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useHabits } from "@/hooks/useHabits";
import { useGoals } from "@/hooks/useGoals";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useDifficultySettings, useGamificationRules } from "@/hooks/useGamification";
import { campaignsService, type CampaignTerm, type MilestoneDraft } from "@/services/campaignsService";
import type { ProposedTask } from "@/services/contractsService";
import { DIFFICULTIES } from "@/services/gamificationService";
import { CAMPAIGN_ART, CAMPAIGN_ICONS, ICON_EMOJI, TERM_LABEL, THEME_TONES, campaignArtSrc } from "@/utils/campaignDisplay";
import { LIFE_AREAS } from "@/utils/lifeOsLabels";
import { previewTaskReward, localToday } from "@/utils/gamification";
import { RPG_TONE_BG } from "@/components/rpg/rpgAssets";
import type { Difficulty, TaskPriority } from "@/types";

const STEPS = ["Propósito", "Projetos", "Missões", "Contratos", "Marcos", "Recompensas", "Aparência", "Revisão"] as const;
const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/70";
const check = "mt-0.5 accent-[rgb(var(--rpg-gold))]";

type NewTask = { title: string; description?: string | null; priority?: TaskPriority; difficulty?: Difficulty | null; dueDate?: string | null; ai?: boolean };

function addDays(n: number | null) {
  if (n == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Forjar campanha em 8 etapas. Nada é persistido antes da Revisão:
 * só "Forjar campanha" cria a campanha e as associações (projetos,
 * tarefas e hábitos são REFERENCIADOS, nunca copiados).
 */
export function CampaignForgeWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { create } = useCampaigns(false);
  const { projects, createProject } = useProjects();
  const { tasks } = useTasks();
  const { habits } = useHabits();
  const { goals } = useGoals();
  const { data: rules } = useGamificationRules();
  const { rewards: scale, priority: priorityScale } = useDifficultySettings();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 1 — propósito
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lifeArea, setLifeArea] = useState("");
  const [goalId, setGoalId] = useState("");
  const [term, setTerm] = useState<CampaignTerm>("medio");
  const [startDate, setStartDate] = useState(localToday());
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Média");
  const [startNow, setStartNow] = useState(true);
  // 2–4 — vínculos
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [newProject, setNewProject] = useState("");
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [newTasks, setNewTasks] = useState<NewTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [aiTasks, setAiTasks] = useState<Array<ProposedTask & { picked: boolean }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [habitIds, setHabitIds] = useState<string[]>([]);
  // 5 — marcos
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // 6 — recompensas
  const [completionXp, setCompletionXp] = useState<number | null>(null);
  const [completionCoins, setCompletionCoins] = useState<number | null>(null);
  const [streakEnabled, setStreakEnabled] = useState(true);
  // 7 — aparência
  const [banner, setBanner] = useState<string>("castelo");
  const [icon, setIcon] = useState<string>("bandeira");
  const [themeColor, setThemeColor] = useState<string>("gold");

  const suggest = useQuery({
    queryKey: ["campaigns", "suggest", term, milestones.length],
    queryFn: () => campaignsService.rewardSuggest(term, milestones.length),
    staleTime: 60_000,
  });
  const limits = suggest.data?.limits;
  // Sugestão do LifeOS até o usuário mexer no valor.
  useEffect(() => {
    if (suggest.data && completionXp === null) {
      setCompletionXp(suggest.data.completion.xp);
      setCompletionCoins(suggest.data.completion.coins);
    }
  }, [suggest.data, completionXp]);

  const projectTasks = useMemo(() => tasks.filter((t) => t.project_id && projectIds.includes(t.project_id)), [tasks, projectIds]);
  const looseTasks = useMemo(
    () => tasks.filter((t) => t.status !== "Concluído" && !(t.project_id && projectIds.includes(t.project_id)) && t.title.toLowerCase().includes(taskQuery.trim().toLowerCase())).slice(0, 60),
    [tasks, projectIds, taskQuery],
  );
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // Potencial (previsão, não ganho): missões abertas + marcos + conclusão.
  const potential = useMemo(() => {
    const today = localToday();
    const linked = [...projectTasks, ...tasks.filter((t) => taskIds.includes(t.id))].filter((t) => t.status !== "Concluído");
    let xp = 0;
    let coins = 0;
    for (const t of linked) {
      const r = previewTaskReward(rules, { priority: t.priority, difficulty: t.difficulty }, today, false, scale, priorityScale);
      xp += r?.xp ?? 0;
      coins += r?.coins ?? 0;
    }
    for (const t of [...newTasks, ...aiTasks.filter((a) => a.picked)]) {
      const r = previewTaskReward(rules, { priority: t.priority ?? "Média", difficulty: t.difficulty }, today, false, scale, priorityScale);
      xp += r?.xp ?? 0;
      coins += r?.coins ?? 0;
    }
    const ms = milestones.reduce((s, m) => ({ xp: s.xp + (m.xpReward ?? 0), coins: s.coins + (m.coinReward ?? 0) }), { xp: 0, coins: 0 });
    return { missions: { xp, coins }, milestones: ms, completion: { xp: completionXp ?? 0, coins: completionCoins ?? 0 } };
  }, [projectTasks, tasks, taskIds, newTasks, aiTasks, milestones, completionXp, completionCoins, rules, scale, priorityScale]);

  const askAI = async () => {
    setAiLoading(true);
    setError(null);
    try {
      const existing = [...projectTasks, ...tasks.filter((t) => taskIds.includes(t.id))].map((t) => t.title).concat(newTasks.map((t) => t.title));
      const r = await campaignsService.suggestMissions({ title: title.trim() || "Campanha", description: description || null, existing });
      setAiTasks(r.tasks.map((t) => ({ ...t, picked: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu sugerir missões.");
    } finally {
      setAiLoading(false);
    }
  };

  const addMilestone = () => {
    const sug = suggest.data?.milestone.normal ?? { xp: 60, coins: 12 };
    setMilestones((m) => [...m, { title: "", description: "", dueDate: null, isMajor: false, xpReward: sug.xp, coinReward: sug.coins, dependsOnIndex: null }]);
  };
  const patchMs = (i: number, p: Partial<MilestoneDraft>) => setMilestones((arr) => arr.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const moveMs = (from: number, to: number) =>
    setMilestones((arr) => {
      if (to < 0 || to >= arr.length) return arr;
      const next = [...arr];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      // Dependências apontam para índices: reordenar invalida as que ficarem "para frente".
      return next.map((m, i) => ({ ...m, dependsOnIndex: m.dependsOnIndex != null && m.dependsOnIndex < i ? m.dependsOnIndex : null }));
    });

  const canNext = step !== 0 || title.trim().length >= 2;
  const submit = async () => {
    setError(null);
    try {
      const chosenAi = aiTasks.filter((a) => a.picked).map((a) => ({ title: a.title, description: a.description, priority: a.priority, difficulty: a.difficulty, dueDate: addDays(a.dueInDays) }));
      const c = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        lifeArea: lifeArea || null,
        goalId: goalId || null,
        term,
        status: startNow ? "active" : "planned",
        startDate: startDate || null,
        endDate: endDate || null,
        priority,
        streakEnabled,
        completionXp: completionXp ?? undefined,
        completionCoins: completionCoins ?? undefined,
        banner,
        icon,
        themeColor,
        projectIds,
        taskIds,
        habitIds,
        newTasks: [...newTasks.map(({ ai: _ai, ...t }) => t), ...chosenAi],
        milestones: milestones.filter((m) => m.title.trim()).map((m) => ({ ...m, title: m.title.trim() })),
      });
      onCreated(c.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível forjar a campanha.");
    }
  };

  const sectionTitle = (t: string, s?: string) => (
    <div className="mb-3">
      <p className="font-rpg text-lg font-bold text-rpg-text">{t}</p>
      {s && <p className="text-xs text-rpg-muted">{s}</p>}
    </div>
  );

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Forjar campanha"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {error && <p className="w-full text-xs text-rpg-red" role="alert">{error}</p>}
          <RPGButton variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? "Cancelar" : <><ArrowLeft size={14} aria-hidden /> Voltar</>}
          </RPGButton>
          <span className="ml-auto font-pixel text-xs text-rpg-muted">Etapa {step + 1} de {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <RPGButton variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Avançar <ArrowRight size={14} aria-hidden />
            </RPGButton>
          ) : (
            <RPGButton variant="gold" disabled={create.isPending || title.trim().length < 2} onClick={submit}>
              <Hammer size={14} aria-hidden /> {create.isPending ? "Forjando…" : "Forjar campanha"}
            </RPGButton>
          )}
        </div>
      }
    >
      <ol className="mb-4 flex gap-1 overflow-x-auto pb-1" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i <= step || canNext) && setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`shrink-0 whitespace-nowrap border px-2 py-1 font-pixel text-[10px] uppercase ${i === step ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : i < step ? "border-rpg-green/50 text-rpg-green" : "border-rpg-border text-rpg-muted"}`}
              style={{ borderRadius: 3 }}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-3">
          {sectionTitle("Propósito", "Que grande objetivo esta campanha vai conquistar?")}
          <label className="block text-[11px] text-rpg-muted">Nome da campanha
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={`${field} mt-1`} style={{ borderRadius: 3 }} placeholder="O Mestrado do Conhecimento" />
          </label>
          <label className="block text-[11px] text-rpg-muted">Descrição
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} placeholder="Concluir o mestrado com alto desempenho…" />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-rpg-muted">Área da vida
              <select value={lifeArea} onChange={(e) => setLifeArea(e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }}>
                <option value="">Sem área</option>
                {LIFE_AREAS.map((a) => <option key={a.key} value={a.key}>{a.emoji} {a.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-rpg-muted">Meta relacionada
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }}>
                <option value="">Sem meta</option>
                {goals.filter((g) => g.status === "active").map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-rpg-muted">Tipo / período
              <select value={term} onChange={(e) => setTerm(e.target.value as CampaignTerm)} className={`${field} mt-1`} style={{ borderRadius: 3 }}>
                {(Object.keys(TERM_LABEL) as CampaignTerm[]).map((t) => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-rpg-muted">Prioridade
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={`${field} mt-1`} style={{ borderRadius: 3 }}>
                <option>Baixa</option><option>Média</option><option>Alta</option>
              </select>
            </label>
            <label className="text-[11px] text-rpg-muted">Início
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} />
            </label>
            <label className="text-[11px] text-rpg-muted">Prazo final
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={`${field} mt-1`} style={{ borderRadius: 3 }} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-rpg-text">
            <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className={check} /> Iniciar a campanha agora (senão fica como planejada)
          </label>
        </section>
      )}

      {step === 1 && (
        <section>
          {sectionTitle("Projetos", "Quais projetos fazem parte desta campanha? As tarefas deles entram como missões.")}
          {projects.length === 0 && <p className="text-sm text-rpg-muted">Você ainda não tem projetos.</p>}
          <ul className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            {projects.filter((p) => !p.archived_at).map((p) => (
              <li key={p.id}>
                <label className="flex items-start gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-sm text-rpg-text cursor-pointer" style={{ borderRadius: 3 }}>
                  <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => toggle(projectIds, setProjectIds, p.id)} className={check} />
                  <span className="min-w-0 truncate">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="+ Criar novo projeto…" className={field} style={{ borderRadius: 3 }} aria-label="Nome do novo projeto" />
            <RPGButton
              variant="secondary"
              disabled={!newProject.trim()}
              onClick={async () => {
                try {
                  const p = await createProject({ name: newProject.trim() });
                  setProjectIds((ids) => [...ids, p.id]);
                  setNewProject("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível criar o projeto.");
                }
              }}
            >
              <Plus size={14} aria-hidden /> Criar
            </RPGButton>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          {sectionTitle("Missões", "Missões são tarefas reais: as dos projetos escolhidos já entram; escolha outras, crie novas ou peça sugestões.")}
          <p className="text-xs text-rpg-text">Dos projetos: <span className="font-pixel text-rpg-gold-light">{projectTasks.length}</span> tarefas ({projectTasks.filter((t) => t.status !== "Concluído").length} abertas)</p>
          <label className="relative block">
            <span className="sr-only">Buscar tarefas</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder="Buscar no backlog…" className={`${field} pl-8`} style={{ borderRadius: 3 }} />
          </label>
          <ul className="max-h-48 overflow-y-auto space-y-1">
            {looseTasks.map((t) => (
              <li key={t.id}>
                <label className="flex items-start gap-2 text-sm text-rpg-text cursor-pointer">
                  <input type="checkbox" checked={taskIds.includes(t.id)} onChange={() => toggle(taskIds, setTaskIds, t.id)} className={check} />
                  <span className="min-w-0">{t.title} <span className="text-[11px] text-rpg-muted">· {t.status}</span></span>
                </label>
              </li>
            ))}
            {looseTasks.length === 0 && <li className="text-xs text-rpg-muted">Nenhuma tarefa aberta encontrada.</li>}
          </ul>
          <div className="flex gap-2">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newTaskTitle.trim() && (setNewTasks((a) => [...a, { title: newTaskTitle.trim() }]), setNewTaskTitle(""))}
              placeholder="Nova missão…"
              className={field}
              style={{ borderRadius: 3 }}
              aria-label="Título da nova missão"
            />
            <RPGButton variant="secondary" disabled={!newTaskTitle.trim()} onClick={() => (setNewTasks((a) => [...a, { title: newTaskTitle.trim() }]), setNewTaskTitle(""))}>
              <Plus size={14} aria-hidden /> Adicionar
            </RPGButton>
          </div>
          {newTasks.length > 0 && (
            <ul className="space-y-1">
              {newTasks.map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-rpg-text">
                  <span className="min-w-0 flex-1 truncate">✦ {t.title}</span>
                  <select value={t.difficulty ?? ""} onChange={(e) => setNewTasks((a) => a.map((x, j) => (j === i ? { ...x, difficulty: (e.target.value || null) as Difficulty | null } : x)))} className={`${field} !w-32 !py-1`} style={{ borderRadius: 3 }} aria-label="Dificuldade">
                    <option value="">Prioridade</option>
                    {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setNewTasks((a) => a.filter((_, j) => j !== i))} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover ${t.title}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="rpg-panel p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rpg-purple"><Wand2 size={13} aria-hidden /> Sugestões do Copilot</p>
              <RPGButton variant="primary" className="ml-auto" disabled={aiLoading || title.trim().length < 2} onClick={askAI}>{aiLoading ? "Pensando…" : "Sugerir missões"}</RPGButton>
            </div>
            {aiTasks.length > 0 && (
              <ul className="mt-2 space-y-1">
                <li className="text-[11px] text-rpg-muted">Sugestão da IA — só entra na campanha o que você marcar:</li>
                {aiTasks.map((s, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm text-rpg-text">
                      <input type="checkbox" checked={s.picked} onChange={(e) => setAiTasks((a) => a.map((x, j) => (j === i ? { ...x, picked: e.target.checked } : x)))} className={check} />
                      <span className="min-w-0">{s.title}{s.description && <span className="block text-[11px] text-rpg-muted">{s.description}</span>}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          {sectionTitle("Contratos", "Quais hábitos sustentam esta jornada? A adesão a eles conta no progresso.")}
          {habits.length === 0 && <p className="text-sm text-rpg-muted">Você ainda não tem hábitos cadastrados.</p>}
          <ul className="grid sm:grid-cols-2 gap-2">
            {habits.map((h) => (
              <li key={h.id}>
                <label className="flex items-start gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-sm text-rpg-text cursor-pointer" style={{ borderRadius: 3 }}>
                  <input type="checkbox" checked={habitIds.includes(h.id)} onChange={() => toggle(habitIds, setHabitIds, h.id)} className={check} />
                  <span className="min-w-0 truncate">{h.icon ?? "🔁"} {h.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 4 && (
        <section>
          {sectionTitle("Marcos", "Etapas importantes da campanha. O último marco principal vira o “chefe final”. Arraste ou use as setas para ordenar.")}
          <ul className="space-y-2">
            {milestones.map((m, i) => (
              <li
                key={i}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => (dragIdx !== null && dragIdx !== i && moveMs(dragIdx, i), setDragIdx(null))}
                className="border border-rpg-border bg-rpg-bg-2/60 p-2.5"
                style={{ borderRadius: 3 }}
              >
                <div className="flex items-center gap-2">
                  <GripVertical size={16} className="shrink-0 text-rpg-muted cursor-grab" aria-hidden />
                  <span className="font-pixel text-xs text-rpg-gold">{i + 1}</span>
                  <input value={m.title} onChange={(e) => patchMs(i, { title: e.target.value })} placeholder="Ex.: Qualificação" className={`${field} !py-1.5`} style={{ borderRadius: 3 }} aria-label={`Nome do marco ${i + 1}`} />
                  <button type="button" onClick={() => moveMs(i, i - 1)} disabled={i === 0} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Mover para cima"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveMs(i, i + 1)} disabled={i === milestones.length - 1} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Mover para baixo"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => setMilestones((a) => a.filter((_, j) => j !== i).map((x) => ({ ...x, dependsOnIndex: x.dependsOnIndex === i ? null : x.dependsOnIndex != null && x.dependsOnIndex > i ? x.dependsOnIndex - 1 : x.dependsOnIndex })))} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label="Remover marco"><Trash2 size={14} /></button>
                </div>
                <div className="mt-2 grid sm:grid-cols-[1fr_150px_150px] gap-2">
                  <input value={m.description ?? ""} onChange={(e) => patchMs(i, { description: e.target.value })} placeholder="Descrição" className={`${field} !py-1.5`} style={{ borderRadius: 3 }} aria-label="Descrição do marco" />
                  <input type="date" value={m.dueDate ?? ""} onChange={(e) => patchMs(i, { dueDate: e.target.value || null })} className={`${field} !py-1.5`} style={{ borderRadius: 3 }} aria-label="Prazo do marco" />
                  <select value={m.dependsOnIndex ?? ""} onChange={(e) => patchMs(i, { dependsOnIndex: e.target.value === "" ? null : Number(e.target.value) })} className={`${field} !py-1.5`} style={{ borderRadius: 3 }} aria-label="Depende de">
                    <option value="">Sem dependência</option>
                    {milestones.slice(0, i).map((x, j) => <option key={j} value={j}>Depende de {j + 1}. {x.title || "marco"}</option>)}
                  </select>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-rpg-text">
                  <input
                    type="checkbox"
                    checked={!!m.isMajor}
                    onChange={(e) => {
                      const sug = suggest.data?.milestone[e.target.checked ? "major" : "normal"];
                      patchMs(i, { isMajor: e.target.checked, ...(sug ? { xpReward: sug.xp, coinReward: sug.coins } : {}) });
                    }}
                    className={check}
                  />
                  Marco principal (aparece como “chefe”)
                </label>
              </li>
            ))}
          </ul>
          <RPGButton variant="secondary" className="mt-3" onClick={addMilestone} disabled={milestones.length >= 30}><Plus size={14} aria-hidden /> Adicionar marco</RPGButton>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          {sectionTitle("Recompensas", "Sugestão calculada pelo LifeOS. Os limites mantêm a economia justa; nada é pago agora — só quando a condição for atingida.")}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-rpg-muted">XP de conclusão {limits && `(máx. ${limits.completion.xp})`}
              <input type="number" min={0} max={limits?.completion.xp} value={completionXp ?? 0} onChange={(e) => setCompletionXp(Math.min(limits?.completion.xp ?? 1500, Math.max(0, Math.round(Number(e.target.value) || 0))))} className={`${field} mt-1 font-pixel`} style={{ borderRadius: 3 }} />
            </label>
            <label className="text-[11px] text-rpg-muted">Moedas de conclusão {limits && `(máx. ${limits.completion.coins})`}
              <input type="number" min={0} max={limits?.completion.coins} value={completionCoins ?? 0} onChange={(e) => setCompletionCoins(Math.min(limits?.completion.coins ?? 300, Math.max(0, Math.round(Number(e.target.value) || 0))))} className={`${field} mt-1 font-pixel`} style={{ borderRadius: 3 }} />
            </label>
          </div>
          {milestones.length > 0 && (
            <ul className="space-y-1.5">
              {milestones.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-rpg-text">
                  <span className="min-w-0 flex-1 truncate">{m.isMajor ? "👑" : "◆"} {m.title || `Marco ${i + 1}`}</span>
                  <input type="number" min={0} max={limits?.milestone.xp} value={m.xpReward ?? 0} onChange={(e) => patchMs(i, { xpReward: Math.min(limits?.milestone.xp ?? 500, Math.max(0, Math.round(Number(e.target.value) || 0))) })} className={`${field} !w-24 !py-1 font-pixel`} style={{ borderRadius: 3 }} aria-label={`XP do marco ${i + 1}`} />
                  <span className="text-[11px] text-rpg-muted">XP</span>
                  <input type="number" min={0} max={limits?.milestone.coins} value={m.coinReward ?? 0} onChange={(e) => patchMs(i, { coinReward: Math.min(limits?.milestone.coins ?? 100, Math.max(0, Math.round(Number(e.target.value) || 0))) })} className={`${field} !w-20 !py-1 font-pixel`} style={{ borderRadius: 3 }} aria-label={`Moedas do marco ${i + 1}`} />
                  <span className="text-[11px] text-rpg-muted">🪙</span>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 text-sm text-rpg-text">
            <input type="checkbox" checked={streakEnabled} onChange={(e) => setStreakEnabled(e.target.checked)} className={check} /> Ativar bônus de sequência semanal
          </label>
          {streakEnabled && suggest.data && (
            <p className="text-[11px] text-rpg-muted">Faixas: {suggest.data.streakTiers.map((t) => `${t.weeks} sem. +${t.xpPct}% XP`).join(" · ")} — vale só para recompensas futuras de marcos e conclusão.</p>
          )}
          <PotentialTable potential={potential} />
        </section>
      )}

      {step === 6 && (
        <section className="space-y-4">
          {sectionTitle("Aparência", "Escolha a capa, o ícone e a cor da campanha (biblioteca interna).")}
          <div role="radiogroup" aria-label="Capa" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {CAMPAIGN_ART.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={banner === a.id} onClick={() => setBanner(a.id)} className={`border-2 p-0.5 ${banner === a.id ? "border-rpg-gold" : "border-rpg-border hover:border-rpg-gold/50"}`} style={{ borderRadius: 3 }}>
                <img src={campaignArtSrc(a.id)} alt={a.label} loading="lazy" className="pixelated w-full aspect-square object-cover" />
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Ícone" className="flex flex-wrap gap-2">
            {CAMPAIGN_ICONS.map((ic) => (
              <button key={ic} type="button" role="radio" aria-checked={icon === ic} aria-label={ic} onClick={() => setIcon(ic)} className={`w-10 h-10 text-xl border-2 ${icon === ic ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border"}`} style={{ borderRadius: 3 }}>
                {ICON_EMOJI[ic]}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Cor temática" className="flex flex-wrap gap-2">
            {THEME_TONES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={themeColor === t} aria-label={`Cor ${t}`} onClick={() => setThemeColor(t)} className={`w-8 h-8 border-2 ${themeColor === t ? "border-rpg-text" : "border-transparent"} ${RPG_TONE_BG[t]}`} style={{ borderRadius: 3 }} />
            ))}
          </div>
        </section>
      )}

      {step === 7 && (
        <section className="space-y-3 text-sm">
          {sectionTitle("Revisão", "Confira antes de forjar. Só agora a campanha será criada.")}
          <div className="flex gap-3">
            <img src={campaignArtSrc(banner)} alt="" className="pixelated w-20 h-20 object-cover border-2 border-rpg-gold/60" style={{ borderRadius: 3 }} />
            <div className="min-w-0">
              <p className="font-rpg text-lg font-bold text-rpg-text">{ICON_EMOJI[icon]} {title || "—"}</p>
              <p className="text-xs text-rpg-muted">{description || "Sem descrição"}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <RPGBadge tone={startNow ? "gold" : "blue"}>{startNow ? "Em andamento" : "Planejada"}</RPGBadge>
                <RPGBadge tone="muted">{TERM_LABEL[term]}</RPGBadge>
                {endDate && <RPGBadge tone="muted">Prazo {endDate.split("-").reverse().join("/")}</RPGBadge>}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ["Meta", goals.find((g) => g.id === goalId)?.title ?? "—"],
              ["Projetos", String(projectIds.length)],
              ["Missões", String(projectTasks.length + taskIds.length + newTasks.length + aiTasks.filter((a) => a.picked).length)],
              ["Contratos (hábitos)", String(habitIds.length)],
              ["Marcos", String(milestones.filter((m) => m.title.trim()).length)],
              ["Sequência", streakEnabled ? "Ativa" : "Desativada"],
            ].map(([k, v]) => (
              <div key={k} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
                <dt className="text-[10px] uppercase tracking-wide text-rpg-muted">{k}</dt>
                <dd className="truncate text-rpg-text">{v}</dd>
              </div>
            ))}
          </dl>
          <PotentialTable potential={potential} />
          <p className="flex items-center gap-1.5 text-[11px] text-rpg-muted"><Sparkles size={12} aria-hidden /> Valores potenciais — XP e moedas só são concedidos quando cada missão, marco ou a campanha for concluída.</p>
        </section>
      )}
    </Modal>
  );
}

function PotentialTable({ potential: p }: { potential: { missions: { xp: number; coins: number }; milestones: { xp: number; coins: number }; completion: { xp: number; coins: number } } }) {
  const total = { xp: p.missions.xp + p.milestones.xp + p.completion.xp, coins: p.missions.coins + p.milestones.coins + p.completion.coins };
  const rows: Array<[string, { xp: number; coins: number }]> = [["Missões abertas", p.missions], ["Marcos", p.milestones], ["Conclusão", p.completion]];
  return (
    <table className="w-full text-xs">
      <caption className="text-left font-semibold text-rpg-text mb-1">Recompensa potencial</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-rpg-border/50">
            <th scope="row" className="py-1 text-left font-normal text-rpg-muted">{k}</th>
            <td className="py-1 text-right font-pixel text-rpg-purple">+{v.xp} XP</td>
            <td className="py-1 text-right font-pixel text-rpg-gold-light">+{v.coins} 🪙</td>
          </tr>
        ))}
        <tr className="border-t-2 border-rpg-gold/50">
          <th scope="row" className="py-1 text-left text-rpg-text">Total previsto</th>
          <td className="py-1 text-right font-pixel text-rpg-purple">+{total.xp} XP</td>
          <td className="py-1 text-right font-pixel text-rpg-gold-light">+{total.coins} 🪙</td>
        </tr>
      </tbody>
    </table>
  );
}
