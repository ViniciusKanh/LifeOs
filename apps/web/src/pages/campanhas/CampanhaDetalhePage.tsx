import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, CheckSquare, Hammer, Pause, Play, Plus, Square, Trash2, Archive, Trophy } from "lucide-react";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar, RPGStatCard, RPGTabs, RPGToast } from "@/components/rpg";
import { CampaignTrail } from "@/components/campaigns/CampaignTrail";
import { CampaignMilestoneList } from "@/components/campaigns/CampaignMilestoneList";
import { CampaignRewardCard } from "@/components/campaigns/CampaignRewardCard";
import { CampaignStreakCard } from "@/components/campaigns/CampaignStreakCard";
import { CampaignCompleteOverlay } from "@/components/campaigns/CampaignCompleteOverlay";
import { useCampaignActions, useCampaignDetail } from "@/hooks/useCampaigns";
import { useProjects } from "@/hooks/useProjects";
import { useHabits } from "@/hooks/useHabits";
import { useTasks } from "@/hooks/useTasks";
import { taskService } from "@/services/taskService";
import { notifyGamification } from "@/services/gamificationService";
import type { CampaignMilestone } from "@/services/campaignsService";
import { CAMPAIGN_STATUS, ICON_EMOJI, TERM_LABEL, campaignArtSrc, fmtMonthYear, lifeAreaLabel } from "@/utils/campaignDisplay";

type Tab = "geral" | "missoes" | "projetos" | "contratos" | "marcos" | "cronograma" | "recompensas" | "atividade";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "geral", label: "Visão geral" },
  { value: "missoes", label: "Missões" },
  { value: "projetos", label: "Projetos" },
  { value: "contratos", label: "Contratos" },
  { value: "marcos", label: "Marcos" },
  { value: "cronograma", label: "Cronograma" },
  { value: "recompensas", label: "Recompensas" },
  { value: "atividade", label: "Atividade" },
];
const field = "w-full px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";
const fmtDay = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

/** Detalhe da campanha: tudo referenciado (tarefas/projetos/hábitos reais), com abas. */
export function CampanhaDetalhePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get("aba")) ? params.get("aba") : "geral") as Tab;
  const { data, isLoading, isError, refetch } = useCampaignDetail(id);
  const a = useCampaignActions();
  const { projects } = useProjects();
  const { habits } = useHabits();
  const { tasks: allTasks } = useTasks();
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [overlay, setOverlay] = useState<{ title: string; reward: { xp: number; coins: number } | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMs, setNewMs] = useState({ title: "", dueDate: "", isMajor: false });
  const [pick, setPick] = useState("");
  const err = (e: unknown) => setToast({ msg: e instanceof Error ? e.message : "Não foi possível concluir a ação.", tone: "error" });
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) setToast({ msg: ok, tone: "success" });
      void refetch();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const c = data?.campaign;
  const timeline = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.campaign.milestones.filter((m) => m.dueDate).map((m) => ({ date: m.dueDate!, label: `${m.isMajor ? "👑" : "◆"} ${m.title}`, done: m.status === "completed" })),
      ...data.tasks.filter((t) => t.due_date).map((t) => ({ date: t.due_date!.slice(0, 10), label: `✦ ${t.title}`, done: t.status === "Concluído" })),
    ];
    return items.sort((x, y) => x.date.localeCompare(y.date));
  }, [data]);

  if (isLoading) return <div className="px-4 py-6 md:px-8 space-y-3" aria-busy><div className="rpg-panel h-40 animate-pulse" /><div className="rpg-panel h-64 animate-pulse" /></div>;
  if (isError || !c || !data)
    return (
      <div className="px-4 py-6 md:px-8">
        <RPGPanel variant="danger">
          <p className="text-sm text-rpg-text">Não foi possível carregar a campanha.</p>
          <div className="mt-2 flex gap-2">
            <RPGButton variant="secondary" onClick={() => void refetch()}>Tentar novamente</RPGButton>
            <Link to="/forja-campanhas" className="rpg-btn rpg-btn-ghost">Voltar à Forja</Link>
          </div>
        </RPGPanel>
      </div>
    );

  const st = CAMPAIGN_STATUS[c.status];
  const area = lifeAreaLabel(c.lifeArea);
  const editable = c.status !== "completed" && c.status !== "archived";
  const toggleMs = (m: CampaignMilestone) =>
    run(`ms-${m.id}`, async () => {
      const r = await a.milestoneDone.mutateAsync({ id: c.id, mid: m.id, done: m.status !== "completed" });
      if (m.status !== "completed") setToast({ msg: r.rewarded ? `Marco concluído: ${m.title}` : `Marco concluído: ${m.title}`, tone: "success" });
    });
  const complete = () =>
    run("complete", async () => {
      const r = await a.complete.mutateAsync(c.id);
      setOverlay({ title: c.title, reward: r.reward });
    });
  const linkedProjectIds = new Set(data.projects.map((p) => p.id));
  const linkedHabitIds = new Set(data.habits.map((h) => h.id));
  const linkedTaskIds = new Set(data.tasks.map((t) => t.id));

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 space-y-4">
      <Link to="/forja-campanhas" className="inline-flex items-center gap-1 text-xs text-rpg-gold-light hover:underline"><ArrowLeft size={13} aria-hidden /> Forja de Campanhas</Link>

      <header className="rpg-panel rpg-panel-gold flex flex-col sm:flex-row gap-4 p-4">
        <img src={campaignArtSrc(c.banner)} alt="" className="pixelated w-24 h-24 sm:w-32 sm:h-32 object-cover border-2 border-rpg-gold/60 self-start" style={{ borderRadius: 3 }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <RPGBadge tone={st.tone}>{st.label}</RPGBadge>
            {area && <RPGBadge tone="muted">{area.emoji} {area.label}</RPGBadge>}
            <RPGBadge tone="muted">{TERM_LABEL[c.term]}</RPGBadge>
            {c.goalTitle && <RPGBadge tone="blue">🎯 {c.goalTitle}</RPGBadge>}
          </div>
          <h1 className="mt-1 rpg-title text-2xl sm:text-3xl font-bold leading-tight">{c.icon && ICON_EMOJI[c.icon]} {c.title}</h1>
          {c.description && <p className="mt-1 text-sm text-rpg-muted">{c.description}</p>}
          <div className="mt-2 flex items-center gap-2 max-w-xl">
            <RPGProgressBar className="flex-1" tone="purple" label="Progresso da campanha" value={c.progress.pct} showLabel={false} />
            <span className="font-pixel text-sm text-rpg-text">{c.progress.pct}%</span>
          </div>
          <p className="mt-1 text-[11px] text-rpg-muted">
            {c.startDate && `Início ${fmtDay(c.startDate)} · `}{c.endDate ? `Prazo ${fmtDay(c.endDate)}` : "Sem prazo final"}
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-col gap-2 sm:items-end">
          {c.readyToComplete && (
            <RPGButton variant="gold" disabled={busy === "complete"} onClick={complete}><Trophy size={14} aria-hidden /> Concluir campanha</RPGButton>
          )}
          {c.status === "planned" && <RPGButton variant="primary" onClick={() => run("st", () => a.setStatus.mutateAsync({ id: c.id, status: "active" }), "Campanha iniciada.")}><Play size={14} aria-hidden /> Iniciar</RPGButton>}
          {c.status === "active" && <RPGButton variant="secondary" onClick={() => run("st", () => a.setStatus.mutateAsync({ id: c.id, status: "paused" }), "Campanha pausada.")}><Pause size={14} aria-hidden /> Pausar</RPGButton>}
          {c.status === "paused" && <RPGButton variant="primary" onClick={() => run("st", () => a.setStatus.mutateAsync({ id: c.id, status: "active" }), "Campanha retomada.")}><Play size={14} aria-hidden /> Retomar</RPGButton>}
          {c.status !== "archived" ? (
            <RPGButton variant="ghost" onClick={() => run("st", () => a.setStatus.mutateAsync({ id: c.id, status: "archived" }), "Campanha arquivada.")}><Archive size={14} aria-hidden /> Arquivar</RPGButton>
          ) : (
            <RPGButton variant="secondary" onClick={() => run("st", () => a.setStatus.mutateAsync({ id: c.id, status: "planned" }), "Campanha reativada como planejada.")}>Desarquivar</RPGButton>
          )}
          {!confirmDelete ? (
            <RPGButton variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden /> Excluir</RPGButton>
          ) : (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <span className="text-xs text-rpg-orange">Excluir? Tarefas, projetos, hábitos e XP continuam.</span>
              <RPGButton variant="danger" onClick={() => run("del", async () => (await a.remove.mutateAsync(c.id), navigate("/forja-campanhas")))}>Excluir</RPGButton>
              <RPGButton variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</RPGButton>
            </div>
          )}
        </div>
      </header>
      {c.readyToComplete && <p className="rpg-panel rpg-panel-success p-3 text-sm text-rpg-green" role="status">Campanha pronta para concluir — todas as missões e marcos foram cumpridos.</p>}

      <RPGTabs label="Seções da campanha" tabs={TABS} value={tab} onChange={(v) => setParams(v === "geral" ? {} : { aba: v }, { replace: true })} className="max-w-full" />

      {tab === "geral" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <RPGStatCard icon={<CheckSquare size={18} />} tone="blue" label="Missões" value={`${c.counts.missionsDone}/${c.counts.missions}`} pct={c.progress.missionsPct ?? undefined} caption={c.progress.missionsPct == null ? "sem missões" : `peso ${Math.round(c.progress.weights.missions * 100)}%`} />
            <RPGStatCard icon={<Trophy size={18} />} tone="gold" label="Marcos" value={`${c.counts.milestonesDone}/${c.counts.milestones}`} pct={c.progress.milestonesPct ?? undefined} caption={c.progress.milestonesPct == null ? "sem marcos" : `peso ${Math.round(c.progress.weights.milestones * 100)}%`} />
            <RPGStatCard icon={<Hammer size={18} />} tone="green" label="Contratos (adesão)" value={c.progress.contractsPct == null ? "—" : `${c.progress.contractsPct}%`} pct={c.progress.contractsPct ?? undefined} caption={c.progress.contractsPct == null ? "sem hábitos ligados" : `peso ${Math.round(c.progress.weights.contracts * 100)}%`} />
            <RPGStatCard icon={<Trophy size={18} />} tone="purple" label="XP conquistado" value={`${c.earned.xp} XP`} caption={`+${c.earned.coins} moedas · potencial +${c.potential.xp} XP`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CampaignTrail campaign={c} />
            <CampaignMilestoneList campaign={c} onToggle={toggleMs} busyId={busy?.startsWith("ms-") ? busy.slice(3) : null} limit={6} />
            <CampaignRewardCard campaign={c} />
            <CampaignStreakCard campaign={c} />
          </div>
        </div>
      )}

      {tab === "missoes" && (
        <RPGPanel title="Missões da campanha">
          <p className="-mt-1 mb-3 text-xs text-rpg-muted">Tarefas ligadas diretamente e tarefas dos projetos da campanha. Concluir aqui conclui a tarefa de verdade (com XP).</p>
          <ul className="space-y-1">
            {data.tasks.map((t) => {
              const done = t.status === "Concluído";
              return (
                <li key={t.id} className="flex items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 px-2 py-1.5" style={{ borderRadius: 3 }}>
                  <button type="button" disabled={busy === t.id || !editable} onClick={() => run(t.id, async () => { await taskService.update(t.id, { status: done ? "A Fazer" : "Concluído" }); notifyGamification(); })} className="p-1 text-rpg-gold-light disabled:opacity-50" aria-label={done ? `Reabrir ${t.title}` : `Concluir ${t.title}`} aria-pressed={done}>
                    {done ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <span className={`min-w-0 flex-1 text-sm ${done ? "line-through text-rpg-muted" : "text-rpg-text"}`}>{t.title}</span>
                  {!t.direct_link && <RPGBadge tone="muted">via projeto</RPGBadge>}
                  <span className="hidden sm:inline text-[11px] text-rpg-muted">{fmtDay(t.due_date)}</span>
                  {t.direct_link === 1 && editable && (
                    <button type="button" onClick={() => run(`un-${t.id}`, () => a.links.mutateAsync({ id: c.id, kind: "tasks", ids: [t.id], linked: false }))} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Desvincular ${t.title}`}><Trash2 size={14} /></button>
                  )}
                </li>
              );
            })}
            {data.tasks.length === 0 && <li className="text-sm text-rpg-muted">Nenhuma missão ligada.</li>}
          </ul>
          {editable && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={field} style={{ borderRadius: 3 }} aria-label="Vincular tarefa existente">
                <option value="">Vincular tarefa existente…</option>
                {allTasks.filter((t) => !linkedTaskIds.has(t.id) && t.status !== "Concluído").slice(0, 200).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <RPGButton variant="secondary" disabled={!pick} onClick={() => run("link", () => a.links.mutateAsync({ id: c.id, kind: "tasks", ids: [pick], linked: true }).then(() => setPick("")), "Missão vinculada.")}><Plus size={14} aria-hidden /> Vincular</RPGButton>
            </div>
          )}
        </RPGPanel>
      )}

      {tab === "projetos" && (
        <RPGPanel title="Projetos da campanha">
          <ul className="grid sm:grid-cols-2 gap-2">
            {projects.filter((p) => !p.archived_at).map((p) => {
              const on = linkedProjectIds.has(p.id);
              return (
                <li key={p.id}>
                  <label className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-sm text-rpg-text" style={{ borderRadius: 3 }}>
                    <input type="checkbox" checked={on} disabled={!editable || busy === `p-${p.id}`} onChange={() => run(`p-${p.id}`, () => a.links.mutateAsync({ id: c.id, kind: "projects", ids: [p.id], linked: !on }))} className="accent-[rgb(var(--rpg-gold))]" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <Link to={`/projetos/${p.id}`} className="text-[11px] text-rpg-gold-light hover:underline">abrir</Link>
                  </label>
                </li>
              );
            })}
          </ul>
        </RPGPanel>
      )}

      {tab === "contratos" && (
        <RPGPanel title="Contratos (hábitos) que sustentam a jornada">
          <p className="-mt-1 mb-3 text-xs text-rpg-muted">A adesão conta no progresso: ciclos cumpridos ÷ ciclos esperados desde o início da campanha.</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {habits.map((h) => {
              const on = linkedHabitIds.has(h.id);
              return (
                <li key={h.id}>
                  <label className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2 text-sm text-rpg-text" style={{ borderRadius: 3 }}>
                    <input type="checkbox" checked={on} disabled={!editable || busy === `h-${h.id}`} onChange={() => run(`h-${h.id}`, () => a.links.mutateAsync({ id: c.id, kind: "habits", ids: [h.id], linked: !on }))} className="accent-[rgb(var(--rpg-gold))]" />
                    <span className="min-w-0 truncate">{h.icon ?? "🔁"} {h.name}</span>
                  </label>
                </li>
              );
            })}
            {habits.length === 0 && <li className="text-sm text-rpg-muted">Nenhum hábito cadastrado.</li>}
          </ul>
        </RPGPanel>
      )}

      {tab === "marcos" && (
        <RPGPanel title="Marcos">
          <ul className="space-y-1.5">
            {c.milestones.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 px-2 py-1.5" style={{ borderRadius: 3 }}>
                <button type="button" disabled={!editable || (m.state === "blocked" && m.status !== "completed") || busy === `ms-${m.id}`} onClick={() => toggleMs(m)} className="p-1 text-rpg-gold-light disabled:opacity-40" aria-label={m.status === "completed" ? `Reabrir ${m.title}` : `Concluir ${m.title}`} aria-pressed={m.status === "completed"}>
                  {m.status === "completed" ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <span className="min-w-0 flex-1 text-sm text-rpg-text">{m.isMajor ? "👑 " : ""}{m.title} <span className="text-[11px] text-rpg-muted">· {m.state === "blocked" ? "bloqueado" : m.state === "current" ? "atual" : m.state === "completed" ? "concluído" : "a seguir"}</span></span>
                <span className="font-pixel text-[11px] text-rpg-purple">+{m.xpReward} XP</span>
                <span className="text-[11px] text-rpg-muted w-20 text-right">{fmtMonthYear(m.dueDate) ?? "—"}</span>
                {editable && (
                  <span className="flex">
                    <button type="button" disabled={i === 0} onClick={() => { const ids = c.milestones.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; void run("reo", () => a.reorder.mutateAsync({ id: c.id, ids })); }} className="p-1 text-rpg-muted disabled:opacity-30" aria-label={`Subir ${m.title}`}><ArrowUp size={14} /></button>
                    <button type="button" disabled={i === c.milestones.length - 1} onClick={() => { const ids = c.milestones.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; void run("reo", () => a.reorder.mutateAsync({ id: c.id, ids })); }} className="p-1 text-rpg-muted disabled:opacity-30" aria-label={`Descer ${m.title}`}><ArrowDown size={14} /></button>
                    <button type="button" onClick={() => run("rm", () => a.removeMilestone.mutateAsync({ id: c.id, mid: m.id }))} className="p-1 text-rpg-muted hover:text-rpg-red" aria-label={`Remover ${m.title}`}><Trash2 size={14} /></button>
                  </span>
                )}
              </li>
            ))}
            {c.milestones.length === 0 && <li className="text-sm text-rpg-muted">Nenhum marco ainda.</li>}
          </ul>
          {editable && (
            <div className="mt-3 grid sm:grid-cols-[1fr_160px_auto_auto] gap-2 items-center">
              <input value={newMs.title} onChange={(e) => setNewMs({ ...newMs, title: e.target.value })} placeholder="Novo marco…" className={field} style={{ borderRadius: 3 }} aria-label="Nome do novo marco" />
              <input type="date" value={newMs.dueDate} onChange={(e) => setNewMs({ ...newMs, dueDate: e.target.value })} className={field} style={{ borderRadius: 3 }} aria-label="Prazo do novo marco" />
              <label className="flex items-center gap-1.5 text-xs text-rpg-text"><input type="checkbox" checked={newMs.isMajor} onChange={(e) => setNewMs({ ...newMs, isMajor: e.target.checked })} className="accent-[rgb(var(--rpg-gold))]" /> Principal</label>
              <RPGButton variant="secondary" disabled={!newMs.title.trim()} onClick={() => run("addms", () => a.addMilestone.mutateAsync({ id: c.id, m: { title: newMs.title.trim(), dueDate: newMs.dueDate || null, isMajor: newMs.isMajor } }).then(() => setNewMs({ title: "", dueDate: "", isMajor: false })), "Marco adicionado.")}><Plus size={14} aria-hidden /> Adicionar</RPGButton>
            </div>
          )}
        </RPGPanel>
      )}

      {tab === "cronograma" && (
        <RPGPanel title="Cronograma">
          {timeline.length === 0 && <p className="text-sm text-rpg-muted">Nenhum prazo definido em marcos ou missões.</p>}
          <ol className="relative border-l-2 border-rpg-border/70 ml-2 space-y-2">
            {timeline.map((it, i) => (
              <li key={i} className="pl-4 relative">
                <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 ${it.done ? "border-rpg-green bg-rpg-green" : "border-rpg-gold bg-rpg-bg"}`} aria-hidden />
                <p className="text-[11px] font-pixel text-rpg-gold-light">{fmtDay(it.date)}</p>
                <p className={`text-sm ${it.done ? "line-through text-rpg-muted" : "text-rpg-text"}`}>{it.label}</p>
              </li>
            ))}
          </ol>
        </RPGPanel>
      )}

      {tab === "recompensas" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RPGPanel title="Recompensas da campanha">
            <ul className="divide-y divide-rpg-border/50 text-sm">
              <li className="flex justify-between py-1.5"><span className="text-rpg-text">Já conquistado (dado real)</span><span className="font-pixel text-rpg-green">{c.earned.xp} XP · {c.earned.coins} 🪙</span></li>
              <li className="flex justify-between py-1.5"><span className="text-rpg-text">Potencial restante</span><span className="font-pixel text-rpg-purple">{c.potential.xp} XP · {c.potential.coins} 🪙</span></li>
              <li className="flex justify-between py-1.5"><span className="text-rpg-text">Baú de conclusão (base)</span><span className="font-pixel text-rpg-gold-light">{c.completionReward.xp} XP · {c.completionReward.coins} 🪙</span></li>
              {c.milestones.map((m) => (
                <li key={m.id} className="flex justify-between py-1.5"><span className="text-rpg-muted">{m.isMajor ? "👑" : "◆"} {m.title}</span><span className={`font-pixel ${m.status === "completed" ? "text-rpg-green" : "text-rpg-muted"}`}>{m.xpReward} XP · {m.coinReward} 🪙</span></li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-rpg-muted">Recompensas só são pagas quando a condição é atingida, uma única vez. O bônus de sequência vale para marcos e conclusão futuros.</p>
          </RPGPanel>
          <CampaignStreakCard campaign={c} />
        </div>
      )}

      {tab === "atividade" && (
        <RPGPanel title="Atividade">
          <ul className="space-y-1.5">
            {data.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 font-pixel text-[11px] text-rpg-muted">{fmtDay(e.created_at)}</span>
                <span className="text-rpg-text">{e.label}</span>
              </li>
            ))}
            {data.events.length === 0 && <li className="text-sm text-rpg-muted">Sem atividade registrada.</li>}
          </ul>
        </RPGPanel>
      )}

      <CampaignCompleteOverlay data={overlay} onClose={() => setOverlay(null)} />
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

export default CampanhaDetalhePage;
