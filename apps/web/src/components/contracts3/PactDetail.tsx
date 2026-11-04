import { useState } from "react";
import clsx from "clsx";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Circle,
  History,
  Pause,
  Pencil,
  Play,
  Plus,
  ScrollText,
  Settings2,
  Square,
  Stamp,
  Star,
  Trash2,
  Users,
  Wand2,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useContractAI, useContracts } from "@/hooks/useContracts";
import { useGuildActions, usePactDetail } from "@/hooks/useContractGuild";
import { taskService } from "@/services/taskService";
import { difficultyLabel } from "@/services/gamificationService";
import { CATEGORY_LABEL, EVENT_LABEL, PHASE_LABEL, PHASE_TONE, RISK_LABEL, type PactDetail as Detail, type PactTask } from "@/services/contractGuildService";
import type { ProposedTask } from "@/services/contractsService";
import { DIFFICULTY_TONE, dateInDays, fmtDate, rpgField } from "@/components/contracts/contractUi";
import { ContractDocument } from "@/components/contracts/ContractDocument";
import { ContractTaskEditor, draftsToInput, emptyDraft, type TaskDraft } from "@/components/contracts/ContractTaskEditor";
import { GuildPartnersPanel } from "@/components/guild/GuildPartnersPanel";
import { todayKey } from "@/utils/localDate";
import { ART, RiskMeter, SealIcon } from "./pactUi";

const R = { borderRadius: 3 };
type Toast = (msg: string, tone?: "success" | "error") => void;
type Tab = "etapas" | "documento" | "historico" | "configurar" | "parceiros";

/** Detalhe do pacto: etapas com tarefas reais, histórico, documento e todas as ações do ciclo de vida. */
export function PactDetailModal({ id, onClose, onToast, onEdit, initialDialog = null }: { id: string; onClose: () => void; onToast: Toast; onEdit: () => void; initialDialog?: "replan" | null }) {
  const { data, isLoading, isError } = usePactDetail(id);
  const [tab, setTab] = useState<Tab>("etapas");
  const [dialog, setDialog] = useState<null | "seal" | "replan" | "cancel" | "delete">(initialDialog);
  const a = useGuildActions();
  const { update } = useContracts(false);
  const c = data?.contract;
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      onToast(ok);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível concluir a ação.", "error");
    }
  };
  const live = c && (c.phase === "ativo" || c.phase === "em_andamento" || c.phase === "pausado");

  return (
    <>
    <Modal open={!dialog} size="lg" onClose={onClose} title={c?.title ?? "Pacto"}>
      {isLoading && <p className="py-6 text-sm text-rpg-muted">Abrindo o pergaminho…</p>}
      {isError && (
        <p className="py-6 text-sm text-rpg-red" role="alert">
          Não foi possível carregar o pacto.
        </p>
      )}
      {c && data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <RPGBadge tone={PHASE_TONE[c.phase]}>{PHASE_LABEL[c.phase]}</RPGBadge>
            <RPGBadge tone={DIFFICULTY_TONE[c.difficulty]}>{difficultyLabel(c.difficulty)}</RPGBadge>
            <RPGBadge tone={c.priority === "Alta" ? "red" : c.priority === "Média" ? "orange" : "muted"}>Prioridade {c.priority}</RPGBadge>
            {c.category && <RPGBadge tone="blue">{CATEGORY_LABEL[c.category] ?? c.category}</RPGBadge>}
            {c.goalTitle && <RPGBadge tone="cyan">Meta: {c.goalTitle}</RPGBadge>}
            {c.projectName && <RPGBadge tone="cyan">Projeto: {c.projectName}</RPGBadge>}
            {c.campaignTitle && <RPGBadge tone="purple">Campanha: {c.campaignTitle}</RPGBadge>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 space-y-1.5">
              <RPGProgressBar label="Progresso geral" value={c.doneTasks} max={Math.max(1, c.totalTasks)} valueLabel={`${c.progressPct}% (${c.doneTasks}/${c.totalTasks})`} tone="purple" />
              <p className="text-[11px] text-rpg-muted">
                {c.dueDate ? `Prazo ${fmtDate(c.dueDate)}${c.daysLeft != null ? (c.daysLeft >= 0 ? ` · faltam ${c.daysLeft} dia(s)` : ` · vencido há ${-c.daysLeft} dia(s)`) : ""}` : "Sem prazo"} · sequência {c.streak} dia(s) · {c.earned.xp} XP já recebidos aqui
              </p>
              {c.nextAction && (
                <p className="text-sm text-rpg-text">
                  <span className="font-pixel text-[10px] uppercase text-rpg-gold">Próxima ação · </span>
                  {c.nextAction}
                </p>
              )}
            </div>
            {c.risk && <RiskMeter level={c.risk.level} reasons={c.risk.reasons} compact />}
          </div>

          <div role="tablist" aria-label="Seções do pacto" className="flex gap-1 overflow-x-auto border-b border-rpg-border pb-1 [scrollbar-width:none]">
            {(
              [
                ["etapas", "Etapas", <ScrollText key="i" size={13} />],
                ["documento", "Documento", <Stamp key="i" size={13} />],
                ["historico", "Histórico", <History key="i" size={13} />],
                ["configurar", "Configurar etapas", <Settings2 key="i" size={13} />],
                ["parceiros", "Parceiros", <Users key="i" size={13} />],
              ] as Array<[Tab, string, JSX.Element]>
            ).map(([v, l, icon]) => (
              <button
                key={v}
                role="tab"
                aria-selected={tab === v}
                onClick={() => setTab(v)}
                className={clsx("flex shrink-0 items-center gap-1 border px-2 py-1 text-xs font-semibold", tab === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")}
                style={R}
              >
                {icon} {l}
              </button>
            ))}
          </div>

          {tab === "etapas" && <StagesTab data={data} onToast={onToast} />}
          {tab === "documento" && <DocumentTab data={data} />}
          {tab === "historico" && <HistoryTab data={data} />}
          {tab === "configurar" && <StageConfigTab data={data} onToast={onToast} />}
          {tab === "parceiros" && <GuildPartnersPanel entityType="contract" entityId={id} look="rpg" onToast={onToast} />}

          <footer className="flex flex-wrap gap-2 border-t border-rpg-border/60 pt-3">
            {c.phase === "pronto_selar" && (
              <RPGButton variant="gold" onClick={() => setDialog("seal")}>
                <Stamp size={14} aria-hidden /> Selar contrato
              </RPGButton>
            )}
            {c.phase === "rascunho" && (
              <RPGButton variant="gold" disabled={a.activate.isPending} onClick={() => void run(a.activate.mutateAsync(id), "Rascunho ativado: etapas e tarefas criadas.")}>
                <Play size={14} aria-hidden /> Ativar pacto
              </RPGButton>
            )}
            {live && c.phase !== "pausado" && (
              <RPGButton variant="secondary" onClick={() => void run(a.pause.mutateAsync({ id, pause: true }), "Pacto pausado. O risco não é medido enquanto pausado.")}>
                <Pause size={14} aria-hidden /> Pausar
              </RPGButton>
            )}
            {c.phase === "pausado" && (
              <RPGButton variant="primary" onClick={() => void run(a.pause.mutateAsync({ id, pause: false }), "Pacto retomado.")}>
                <Play size={14} aria-hidden /> Retomar
              </RPGButton>
            )}
            {live && (
              <RPGButton variant="secondary" onClick={() => setDialog("replan")}>
                <CalendarClock size={14} aria-hidden /> Replanejar
              </RPGButton>
            )}
            {(live || c.phase === "rascunho") && (
              <RPGButton variant="ghost" onClick={onEdit}>
                <Pencil size={14} aria-hidden /> Editar
              </RPGButton>
            )}
            {live && (
              <RPGButton variant="ghost" onClick={() => void run(a.feature.mutateAsync({ id, featured: !c.featured }), c.featured ? "Pacto removido do destaque." : "Pacto em destaque.")}>
                <Star size={14} aria-hidden /> {c.featured ? "Tirar destaque" : "Destacar"}
              </RPGButton>
            )}
            {c.phase === "arquivado" || c.phase === "cancelado" ? (
              <RPGButton variant="secondary" onClick={() => void run(update.mutateAsync({ id, input: { status: "ativo" } }), "Pacto reativado.")}>
                <ArchiveRestore size={14} aria-hidden /> Reativar
              </RPGButton>
            ) : (
              <RPGButton variant="ghost" onClick={() => void run(update.mutateAsync({ id, input: { status: "arquivado" } }), "Pacto arquivado.")}>
                <Archive size={14} aria-hidden /> Arquivar
              </RPGButton>
            )}
            {(live || c.phase === "rascunho") && (
              <RPGButton variant="ghost" onClick={() => setDialog("cancel")}>
                <XCircle size={14} aria-hidden /> Cancelar pacto
              </RPGButton>
            )}
            <RPGButton variant="ghost" className="ml-auto" onClick={() => setDialog("delete")}>
              <Trash2 size={14} aria-hidden /> Excluir
            </RPGButton>
          </footer>
        </div>
      )}
    </Modal>
    {/* Diálogos fora do modal principal: o painel animado usa transform, que quebraria o position: fixed. */}
    {c && data && dialog === "seal" && <SealDialog data={data} onClose={() => setDialog(null)} onToast={onToast} />}
    {c && dialog === "replan" && <ReplanDialog id={id} current={c.dueDate} overdue={c.overdueOpen} onClose={() => setDialog(null)} onToast={onToast} />}
    {dialog === "cancel" && <CancelDialog id={id} onClose={() => setDialog(null)} onToast={onToast} />}
    {dialog === "delete" && <DeleteDialog id={id} onClose={() => setDialog(null)} onDeleted={onClose} onToast={onToast} />}
    </>
  );
}

function TaskRow({ t, data, onToast }: { t: PactTask; data: Detail; onToast: Toast }) {
  const a = useGuildActions();
  const [busy, setBusy] = useState(false);
  const locked = data.contract.phase === "arquivado" || data.contract.phase === "cancelado" || data.contract.phase === "rascunho";
  const toggle = async () => {
    setBusy(true);
    try {
      await taskService.update(t.id, { status: t.done ? "A Fazer" : "Concluído" });
      a.sync();
      onToast(t.done ? "Tarefa reaberta." : "Obrigação cumprida — XP pelas regras oficiais.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível atualizar a tarefa.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex min-w-0 items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 px-2 py-1.5" style={R}>
      <button type="button" disabled={busy || locked} onClick={() => void toggle()} className="shrink-0 p-1 text-rpg-gold-light disabled:opacity-50" aria-label={t.done ? `Reabrir ${t.title}` : `Concluir ${t.title}`} aria-pressed={t.done}>
        {t.done ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
      <span className={clsx("min-w-0 flex-1 text-sm", t.done ? "text-rpg-muted line-through" : "text-rpg-text")}>{t.title}</span>
      {t.difficulty && <RPGBadge tone={DIFFICULTY_TONE[t.difficulty]}>{difficultyLabel(t.difficulty)}</RPGBadge>}
      {t.dueDate && <span className={clsx("hidden text-[11px] sm:inline", !t.done && t.dueDate < todayKey() ? "text-rpg-red" : "text-rpg-muted")}>{fmtDate(t.dueDate)}</span>}
      {data.stages.length > 0 && !locked && (
        <select
          value={t.stageId ?? ""}
          onChange={(e) => void a.setTaskStage.mutateAsync({ id: data.contract.id, taskId: t.id, stageId: e.target.value || null }).catch((err: unknown) => onToast(err instanceof Error ? err.message : "Erro", "error"))}
          className={`${rpgField} !w-28 !py-0.5 text-[11px]`}
          style={R}
          aria-label={`Etapa de ${t.title}`}
        >
          <option value="">Sem etapa</option>
          {data.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

function StagesTab({ data, onToast }: { data: Detail; onToast: Toast }) {
  const a = useGuildActions();
  const { addTasks } = useContracts(false);
  const { proposeTasks } = useContractAI();
  const c = data.contract;
  const [drafts, setDrafts] = useState<TaskDraft[]>([emptyDraft()]);
  const [targetStage, setTargetStage] = useState(data.stages.find((s) => s.status === "ativa")?.id ?? "");
  const [suggestions, setSuggestions] = useState<ProposedTask[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const canAdd = c.phase === "ativo" || c.phase === "em_andamento" || c.phase === "pausado" || c.phase === "pronto_selar";

  const add = async (tasks: ReturnType<typeof draftsToInput>) => {
    if (!tasks.length) return;
    try {
      await addTasks.mutateAsync({ id: c.id, tasks: tasks.map((t) => ({ ...t, stageIndex: null, stageId: targetStage || null })) });
      a.sync();
      onToast(`${tasks.length} obrigação(ões) adicionada(s).`);
      setDrafts([emptyDraft()]);
      setSuggestions(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível adicionar.", "error");
    }
  };

  return (
    <div className="space-y-3">
      {data.stages.length === 0 && <p className="text-sm text-rpg-muted">Este pacto ainda não tem etapas. Organize as obrigações em etapas em “Configurar etapas”.</p>}
      <ol className="space-y-2">
        {data.stages.map((s, i) => (
          <li key={s.id} className={clsx("border-2 p-2.5", s.status === "ativa" ? "border-rpg-purple bg-rpg-purple/5" : s.status === "concluida" ? "border-rpg-green/60" : "border-rpg-border")} style={R}>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.status === "concluida" ? <CheckCircle2 size={16} className="text-rpg-green" aria-hidden /> : <Circle size={16} className={s.status === "ativa" ? "text-rpg-purple" : "text-rpg-muted"} aria-hidden />}
              <span className="font-rpg font-semibold text-rpg-text">
                {i + 1}. {s.name}
              </span>
              <RPGBadge tone={s.status === "concluida" ? "green" : s.status === "ativa" ? "purple" : "muted"}>{s.status === "concluida" ? "Concluída" : s.status === "ativa" ? "Etapa atual" : "Pendente"}</RPGBadge>
              <span className="ml-auto text-[11px] text-rpg-muted">{s.total ? `${s.done}/${s.total} tarefas` : "sem tarefas"}</span>
            </div>
            {(s.objective || s.criterion) && (
              <p className="mt-1 text-[11px] text-rpg-muted">
                {s.objective}
                {s.criterion ? ` · Critério: ${s.criterion}` : ""}
              </p>
            )}
            {s.completedAt && <p className="text-[10px] text-rpg-green">Concluída em {fmtDate(s.completedAt.slice(0, 10))}</p>}
            {s.tasks.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {s.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} data={data} onToast={onToast} />
                ))}
              </ul>
            )}
            {s.total === 0 && canAdd && (
              <RPGButton
                variant={s.status === "concluida" ? "ghost" : "secondary"}
                className="mt-1.5 !px-2 !py-1 text-xs"
                onClick={() =>
                  void a.completeStage
                    .mutateAsync({ id: c.id, stageId: s.id, done: s.status !== "concluida" })
                    .then(() => onToast(s.status === "concluida" ? "Etapa reaberta." : "Etapa concluída — critério conferido por você."))
                    .catch((err: unknown) => onToast(err instanceof Error ? err.message : "Erro", "error"))
                }
              >
                {s.status === "concluida" ? "Reabrir etapa" : "Conferi o critério — concluir etapa"}
              </RPGButton>
            )}
          </li>
        ))}
      </ol>
      {data.unstagedTasks.length > 0 && (
        <section>
          <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-muted">Obrigações sem etapa</p>
          <ul className="space-y-1">
            {data.unstagedTasks.map((t) => (
              <TaskRow key={t.id} t={t} data={data} onToast={onToast} />
            ))}
          </ul>
        </section>
      )}
      {canAdd && (
        <section className="space-y-2 border-t border-rpg-border/60 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-rpg text-sm font-semibold text-rpg-text">Adicionar obrigações</p>
            {data.stages.length > 0 && (
              <select value={targetStage} onChange={(e) => setTargetStage(e.target.value)} className={`${rpgField} !w-auto !py-1 text-xs`} style={R} aria-label="Etapa das novas obrigações">
                <option value="">Sem etapa</option>
                {data.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    Na etapa: {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ContractTaskEditor drafts={drafts} onChange={setDrafts} contractDue={c.dueDate} />
          <div className="flex flex-wrap gap-2">
            <RPGButton variant="secondary" disabled={!drafts.some((d) => d.title.trim()) || addTasks.isPending} onClick={() => void add(draftsToInput(drafts))}>
              <Plus size={14} aria-hidden /> Adicionar
            </RPGButton>
            <RPGButton
              variant="primary"
              disabled={proposeTasks.isPending}
              onClick={() =>
                void proposeTasks
                  .mutateAsync({ id: c.id })
                  .then((r) => (setSuggestions(r.tasks), setPicked(r.tasks.map(() => true))))
                  .catch((err: unknown) => onToast(err instanceof Error ? err.message : "A IA não respondeu.", "error"))
              }
            >
              <Wand2 size={14} aria-hidden /> {proposeTasks.isPending ? "Consultando o Escriba…" : "Sugerir com IA"}
            </RPGButton>
          </div>
          {suggestions && (
            <div className="rpg-panel space-y-1.5 p-2">
              <p className="text-[11px] text-rpg-muted">Sugestão da IA — marque o que entra (nada é salvo sem confirmar):</p>
              {suggestions.map((s, i) => (
                <label key={i} className="flex items-start gap-2 text-sm text-rpg-text">
                  <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 accent-[rgb(var(--rpg-gold))]" />
                  <span className="min-w-0 flex-1">
                    {s.title}
                    {s.description && <span className="block text-[11px] text-rpg-muted">{s.description}</span>}
                  </span>
                </label>
              ))}
              <div className="flex gap-2">
                <RPGButton
                  variant="gold"
                  disabled={!picked.some(Boolean)}
                  onClick={() => void add(suggestions.filter((_, i) => picked[i]).map((t) => ({ title: t.title, description: t.description, priority: t.priority, difficulty: t.difficulty, dueDate: dateInDays(t.dueInDays), estimateMinutes: t.estimateMinutes })))}
                >
                  Adicionar selecionadas
                </RPGButton>
                <RPGButton variant="ghost" onClick={() => setSuggestions(null)}>
                  Descartar
                </RPGButton>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DocumentTab({ data }: { data: Detail }) {
  const { user } = useAuth();
  const c = data.contract;
  const all = [...data.stages.flatMap((s) => s.tasks), ...data.unstagedTasks];
  return (
    <div className="space-y-2">
      <ContractDocument
        compact
        data={{
          number: c.id,
          title: c.title,
          description: c.description,
          objective: c.objective,
          why: c.why,
          rewardText: c.rewardText,
          stakes: c.stakes,
          startDate: c.startDate ?? c.createdAt.slice(0, 10),
          dueDate: c.dueDate,
          weeklyHours: c.weeklyHours,
          difficulty: c.difficulty,
          goalTitle: c.goalTitle,
          projectName: c.projectName,
          bonus: c.reward,
          aiGenerated: c.aiGenerated,
          obligations: all.map((t) => ({ title: t.title, dueDate: t.dueDate, done: t.done })),
          signerName: user?.name ?? "Você",
          signedAt: c.createdAt,
        }}
      />
      {c.successCriteria.length > 0 && (
        <section className="rpg-panel p-2">
          <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-gold">Critérios de sucesso</p>
          <ul className="list-inside list-disc text-sm text-rpg-text">
            {c.successCriteria.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HistoryTab({ data }: { data: Detail }) {
  if (!data.events.length && !data.seals.length) return <p className="text-sm text-rpg-muted">Sem histórico registrado ainda — ações a partir dos Contratos 3.0 aparecem aqui.</p>;
  return (
    <div className="space-y-3">
      {data.seals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.seals.map((s) => (
            <span key={s.code} className="flex items-center gap-1.5 border border-rpg-gold/60 bg-rpg-gold/5 px-2 py-1 text-xs text-rpg-text" style={R}>
              <SealIcon code={s.code} size={22} /> {fmtDate(s.earnedAt.slice(0, 10))}
            </span>
          ))}
        </div>
      )}
      <ol className="relative space-y-2 border-l-2 border-rpg-border pl-3">
        {data.events.map((e) => (
          <li key={e.id} className="text-sm">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 bg-rpg-gold" style={{ borderRadius: 999 }} aria-hidden />
            <span className="font-semibold text-rpg-text">{EVENT_LABEL[e.kind] ?? e.kind}</span>
            {e.detail && <span className="text-rpg-muted"> — {e.detail}</span>}
            <span className="block text-[10px] text-rpg-muted">{new Date(e.at.replace(" ", "T") + (e.at.includes("Z") ? "" : "Z")).toLocaleString("pt-BR")}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageConfigTab({ data, onToast }: { data: Detail; onToast: Toast }) {
  const a = useGuildActions();
  const [stages, setStages] = useState(data.stages.length ? data.stages.map((s) => ({ id: s.id as string | undefined, name: s.name, objective: s.objective ?? "", criterion: s.criterion ?? "", total: s.total })) : data.stageTemplate.map((s) => ({ id: undefined as string | undefined, name: s.name, objective: s.objective, criterion: s.criterion, total: 0 })));
  const set = (i: number, patch: Partial<(typeof stages)[number]>) => setStages((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setStages((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const invalid = stages.some((s) => !s.name.trim());
  if (data.contract.phase === "rascunho") return <p className="text-sm text-rpg-muted">No rascunho, as etapas são editadas pelo formulário (Editar).</p>;
  return (
    <div className="space-y-2">
      {!data.stages.length && <p className="text-[11px] text-rpg-muted">Sugestão inicial com o modelo padrão — ajuste à vontade. As tarefas existentes ficam “sem etapa” até você distribuí-las.</p>}
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id ?? `n${i}`} className="border border-rpg-border/70 bg-rpg-bg-2/40 p-2" style={R}>
            <div className="flex items-center gap-1.5">
              <span className="font-pixel text-[10px] text-rpg-gold">{i + 1}</span>
              <input value={s.name} onChange={(e) => set(i, { name: e.target.value })} className={`${rpgField} !py-1`} style={R} maxLength={80} aria-label={`Nome da etapa ${i + 1}`} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Subir etapa">
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === stages.length - 1} className="p-1 text-rpg-muted disabled:opacity-30" aria-label="Descer etapa">
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => setStages((l) => l.filter((_, j) => j !== i))} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover etapa ${i + 1}`} title={s.total ? "As tarefas desta etapa ficarão sem etapa" : undefined}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <input value={s.objective} onChange={(e) => set(i, { objective: e.target.value })} className={`${rpgField} !py-1 text-xs`} style={R} placeholder="Objetivo" aria-label={`Objetivo da etapa ${i + 1}`} />
              <input value={s.criterion} onChange={(e) => set(i, { criterion: e.target.value })} className={`${rpgField} !py-1 text-xs`} style={R} placeholder="Critério de conclusão" aria-label={`Critério da etapa ${i + 1}`} />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {stages.length < 10 && (
          <RPGButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setStages((l) => [...l, { id: undefined, name: `Etapa ${l.length + 1}`, objective: "", criterion: "", total: 0 }])}>
            <Plus size={12} aria-hidden /> Etapa
          </RPGButton>
        )}
        <RPGButton
          variant="gold"
          disabled={invalid || a.saveStages.isPending}
          onClick={() =>
            void a.saveStages
              .mutateAsync({ id: data.contract.id, stages: stages.map((s) => ({ id: s.id, name: s.name.trim(), objective: s.objective.trim() || null, criterion: s.criterion.trim() || null })) })
              .then(() => onToast("Etapas salvas."))
              .catch((err: unknown) => onToast(err instanceof Error ? err.message : "Erro ao salvar etapas.", "error"))
          }
        >
          Salvar etapas
        </RPGButton>
      </div>
    </div>
  );
}

function SealDialog({ data, onClose, onToast }: { data: Detail; onClose: () => void; onToast: Toast }) {
  const a = useGuildActions();
  const [result, setResult] = useState<Awaited<ReturnType<typeof a.seal.mutateAsync>> | null>(null);
  const each = data.sealRewardEach;
  return (
    <Modal open size="sm" onClose={onClose} title={result ? "Pacto selado" : "Selar contrato"}>
      {!result ? (
        <div className="space-y-3 text-sm text-rpg-text">
          <img src={`${ART}/chest-guardian.webp`} alt="" aria-hidden className="pixelated mx-auto h-16 w-auto" />
          <p>Todas as obrigações foram cumpridas. O bônus oficial do contrato já foi creditado quando a última tarefa foi concluída — selar não repete esse bônus.</p>
          {data.sealPreview.length ? (
            <>
              <p className="font-semibold">Selos que este pacto conquista (critérios conferidos com seus registros):</p>
              <ul className="space-y-1.5">
                {data.sealPreview.map((s) => (
                  <li key={s.code} className="flex items-center gap-2">
                    <SealIcon code={s.code} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{s.name}</span>
                      <span className="block text-[11px] text-rpg-muted">{s.criterion}</span>
                    </span>
                    {data.sealEligible && <span className="font-pixel text-[10px] text-rpg-purple">+{each.xp} XP · +{each.coins} 🪙</span>}
                  </li>
                ))}
              </ul>
              {!data.sealEligible && <p className="text-[11px] text-rpg-orange">Contratos com menos de 2 obrigações ganham o selo, mas sem recompensa (regra anti-farm).</p>}
            </>
          ) : (
            <p className="text-rpg-muted">Nenhum critério de selo foi atingido neste pacto. Você ainda pode selá-lo para encerrar o ciclo.</p>
          )}
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={onClose}>
              Agora não
            </RPGButton>
            <RPGButton
              variant="gold"
              disabled={a.seal.isPending}
              onClick={() =>
                void a.seal
                  .mutateAsync(data.contract.id)
                  .then(setResult)
                  .catch((err: unknown) => onToast(err instanceof Error ? err.message : "Não foi possível selar.", "error"))
              }
            >
              <Stamp size={14} aria-hidden /> {a.seal.isPending ? "Selando…" : "Confirmar selamento"}
            </RPGButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-center text-sm text-rpg-text">
          <p className="rpg-title text-lg font-bold">Pacto cumprido!</p>
          {result.seals.length ? (
            <div className="flex flex-wrap justify-center gap-3">
              {result.seals.map((s) => (
                <span key={s.code} className="flex flex-col items-center gap-1">
                  <SealIcon code={s.code} size={44} />
                  <span className="text-xs font-semibold">{s.name}</span>
                  {s.xp > 0 && <span className="font-pixel text-[10px] text-rpg-purple">+{s.xp} XP · +{s.coins} 🪙</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-rpg-muted">Selado sem selos novos.</p>
          )}
          <p className="text-[11px] text-rpg-muted">Registrado na Crônica da Jornada e nas conquistas oficiais.</p>
          <RPGButton variant="gold" onClick={onClose}>
            Fechar
          </RPGButton>
        </div>
      )}
    </Modal>
  );
}

function ReplanDialog({ id, current, overdue, onClose, onToast }: { id: string; current: string | null; overdue: number; onClose: () => void; onToast: Toast }) {
  const a = useGuildActions();
  const today = todayKey();
  const [due, setDue] = useState(current && current >= today ? current : today);
  const [spread, setSpread] = useState(overdue > 0);
  const [reason, setReason] = useState("");
  return (
    <Modal open size="sm" onClose={onClose} title="Replanejar pacto">
      <div className="space-y-3 text-sm text-rpg-text">
        <label className="block text-[11px] text-rpg-muted">
          Novo prazo final
          <input type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className={`${rpgField} mt-1`} style={R} />
        </label>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} className="mt-0.5 accent-[rgb(var(--rpg-gold))]" />
          Redistribuir as obrigações atrasadas (ou além do novo prazo) entre hoje e o novo prazo{overdue ? ` — ${overdue} atrasada(s) agora` : ""}.
        </label>
        <label className="block text-[11px] text-rpg-muted">
          Motivo (opcional, vai para o histórico)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={`${rpgField} mt-1`} style={R} />
        </label>
        <div className="flex justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton
            variant="gold"
            disabled={!due || a.replan.isPending}
            onClick={() =>
              void a.replan
                .mutateAsync({ id, dueDate: due, spreadOverdue: spread, reason: reason.trim() || null })
                .then((r) => (onToast(`Pacto replanejado${r.moved ? ` · ${r.moved} obrigação(ões) redistribuída(s)` : ""}.`), onClose()))
                .catch((err: unknown) => onToast(err instanceof Error ? err.message : "Não foi possível replanejar.", "error"))
            }
          >
            Confirmar replanejamento
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}

function CancelDialog({ id, onClose, onToast }: { id: string; onClose: () => void; onToast: Toast }) {
  const a = useGuildActions();
  const [reason, setReason] = useState("");
  return (
    <Modal open size="sm" onClose={onClose} title="Cancelar pacto">
      <div className="space-y-3 text-sm text-rpg-text">
        <p>O pacto sai da lista de ativos. As tarefas continuam em Missões e o XP já recebido é mantido. Você pode reativá-lo depois.</p>
        <label className="block text-[11px] text-rpg-muted">
          Motivo (opcional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={`${rpgField} mt-1`} style={R} />
        </label>
        <div className="flex justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Voltar
          </RPGButton>
          <RPGButton variant="danger" disabled={a.cancel.isPending} onClick={() => void a.cancel.mutateAsync({ id, reason: reason.trim() || null }).then(() => (onToast("Pacto cancelado."), onClose())).catch((err: unknown) => onToast(err instanceof Error ? err.message : "Erro", "error"))}>
            Cancelar pacto
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}

function DeleteDialog({ id, onClose, onDeleted, onToast }: { id: string; onClose: () => void; onDeleted: () => void; onToast: Toast }) {
  const { remove } = useContracts(false);
  const go = (deleteOpenTasks: boolean) =>
    void remove
      .mutateAsync({ id, deleteOpenTasks })
      .then(() => (onToast("Contrato excluído. Selos conquistados ficam no histórico."), onClose(), onDeleted()))
      .catch((err: unknown) => onToast(err instanceof Error ? err.message : "Não foi possível excluir.", "error"));
  return (
    <Modal open size="sm" onClose={onClose} title="Excluir contrato">
      <div className="space-y-3 text-sm text-rpg-text">
        <p>Excluir é definitivo. O XP já ganho é mantido e os selos continuam no histórico da Guilda. O que fazer com as tarefas?</p>
        <div className="flex flex-wrap justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Voltar
          </RPGButton>
          <RPGButton variant="danger" onClick={() => go(false)}>
            Manter tarefas
          </RPGButton>
          <RPGButton variant="danger" onClick={() => go(true)}>
            Apagar tarefas abertas
          </RPGButton>
        </div>
      </div>
    </Modal>
  );
}
