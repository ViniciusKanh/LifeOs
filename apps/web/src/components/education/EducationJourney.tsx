import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Code2,
  FlagTriangleRight,
  GraduationCap,
  Layers,
  Map as MapIcon,
  Medal,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { EducationHub, EducationStage, StudyPlanItem } from "@/services/moduleHubService";
import { useEducationHubActions } from "@/hooks/useModuleHub";
import { RPGProgressBar } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { AdvisorPanel, IndicatorCard, KitSection, MedalStrip, MODULE_ART, RankPanel } from "@/components/rpg-modules/ModuleKit";

/**
 * Jornada do Conhecimento — peças RPG da Educação (lê /api/hub/education).
 * O Rank Acadêmico é de jogo (atividade verificável), nunca um título real.
 */

const ART = `${MODULE_ART}/education`;
const R = { borderRadius: 4 } as const;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`);
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const KIND_LABEL: Record<string, string> = {
  graduacao: "Graduação",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado: "Doutorado",
  curso_online: "Curso online",
  certificacao: "Certificação",
  curso_livre: "Curso livre",
};

export function EducationRankPanel({ hub }: { hub: EducationHub }) {
  const b = hub.breakdown;
  return (
    <RankPanel
      title="Rank Acadêmico"
      subtitle="Rank de jogo — não é título acadêmico"
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="pts"
      icon={<GraduationCap size={26} />}
      rules={
        <>
          Pontos por atividade verificável: 10 por hora de estudo registrada ({hm(b.studyMinutes)}), 30 por disciplina concluída ({b.subjectsDone}), 15 por prazo cumprido (
          {b.deadlinesDone}) e 40 por etapa da campanha concluída ({b.stagesDone}). Ranks: Aprendiz → Estudante Dedicado → Pesquisador → Mestre do Conhecimento → Sábio da Academia.
        </>
      }
    />
  );
}

export function EducationIndicators({ hub }: { hub: EducationHub }) {
  const i = hub.indicators;
  const active = hub.educations.find((e) => e.progressPct < 100);
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <IndicatorCard tone="purple" icon={<GraduationCap size={26} />} label="Formação ativa" value={i.activeEducations} hint={active?.courseName ?? "nenhuma em andamento"} />
      <IndicatorCard tone="orange" icon={<BookOpen size={26} />} label="Disciplinas do semestre" value={i.subjectsInProgress} hint="em andamento" />
      <IndicatorCard tone="gold" icon={<Clock size={26} />} label="Horas de estudo" value={hm(i.studyMinutesWeek)} hint={`nesta semana · ${hm(i.studyMinutesTotal)} no total`} />
      <IndicatorCard tone="blue" icon={<Code2 size={26} />} label="Projetos acadêmicos" value={i.academicProjectsOpen} hint="em andamento" />
      <IndicatorCard tone={i.overdueDeadlines ? "red" : "green"} icon={<CalendarClock size={26} />} label="Próximos prazos" value={i.upcomingDeadlines} hint={i.overdueDeadlines ? `${i.overdueDeadlines} atrasado(s)` : "nos próximos 14 dias"} />
      <IndicatorCard tone="green" icon={<FlagTriangleRight size={26} />} label="Progresso" value={i.avgProgressPct == null ? "--" : `${i.avgProgressPct}%`} hint="média das formações ativas" />
    </div>
  );
}

/** Card "Formação Ativa" (dados reais da formação; o progresso é o já gravado). */
export function ActiveEducationCard({ hub, educationId }: { hub: EducationHub; educationId: string | null }) {
  const edu = hub.educations.find((e) => e.id === educationId) ?? hub.educations.find((e) => e.progressPct < 100) ?? hub.educations[0];
  if (!edu) return null;
  const stages = hub.stages.filter((s) => s.educationId === edu.id);
  const current = stages.find((s) => s.status === "active") ?? stages.find((s) => s.status === "pending");
  const goal = edu.weeklyGoalMinutes;
  return (
    <section className="rpg-panel rpg-panel-gold grid gap-3 p-3 md:grid-cols-[190px_minmax(0,1fr)]" aria-label="Formação ativa">
      <img src={`${ART}/formacao.webp`} alt="" aria-hidden className="pixelated mx-auto hidden h-40 w-auto object-contain md:block" />
      <div className="min-w-0">
        <p className="font-pixel text-[10px] uppercase text-rpg-gold">◆ Formação ativa · {KIND_LABEL[edu.kind] ?? edu.kind}</p>
        <h2 className="rpg-title truncate text-xl font-bold">{edu.courseName}</h2>
        {edu.institution && <p className="text-sm text-rpg-muted">{edu.institution}</p>}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
            <p className="font-pixel text-[9px] uppercase text-rpg-muted">Fase da jornada</p>
            <p className="truncate text-sm text-rpg-text">{current ? current.title : stages.length ? "Campanha concluída" : "Sem etapas ainda"}</p>
          </div>
          <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
            <p className="font-pixel text-[9px] uppercase text-rpg-muted">Início · previsão</p>
            <p className="text-sm text-rpg-text">
              {edu.startedAt ? edu.startedAt.slice(0, 7).split("-").reverse().join("/") : "--"} · {edu.expectedEndAt ? edu.expectedEndAt.slice(0, 7).split("-").reverse().join("/") : "--"}
            </p>
          </div>
          <div className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
            <p className="font-pixel text-[9px] uppercase text-rpg-muted">Estudo da semana</p>
            <p className="text-sm text-rpg-text">
              {hm(edu.studyMinutesWeek)}
              {goal > 0 ? ` / ${hm(goal)}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <div className="mb-0.5 flex items-center justify-between font-pixel text-[10px] uppercase text-rpg-muted">
            <span>Progresso da formação</span>
            <span className="text-rpg-text">{edu.progressPct}%</span>
          </div>
          <RPGProgressBar value={edu.progressPct} tone="purple" label="Progresso da formação" showLabel={false} />
        </div>
      </div>
    </section>
  );
}

const STATUS_NEXT: Record<EducationStage["status"], EducationStage["status"]> = { pending: "active", active: "done", done: "pending" };
const STATUS_LABEL: Record<EducationStage["status"], string> = { pending: "Pendente", active: "Em andamento", done: "Concluída" };

/** Campanha acadêmica: etapas configuráveis como nós de um mapa. */
export function CampaignMap({ hub, educationId, onToast }: { hub: EducationHub; educationId: string | null; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { createStage, applyTemplate, updateStage, deleteStage } = useEducationHubActions();
  const [title, setTitle] = useState("");
  const edu = hub.educations.find((e) => e.id === educationId) ?? hub.educations.find((e) => e.progressPct < 100) ?? hub.educations[0];
  if (!edu) return null;
  const stages = hub.stages.filter((s) => s.educationId === edu.id).sort((a, b) => a.position - b.position);
  const done = stages.filter((s) => s.status === "done").length;
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível salvar.", "error");

  return (
    <KitSection title="Campanha acadêmica" icon={<MapIcon size={16} />} action={<span className="font-pixel text-[10px] text-rpg-muted">{done}/{stages.length} etapas</span>}>
      {stages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <img src={`${ART}/campaign.webp`} alt="" aria-hidden className="pixelated h-16 w-auto" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-rpg-text">Transforme {edu.courseName} em uma campanha com fases.</p>
            <p className="text-[11px] text-rpg-muted">Use as etapas sugeridas para {KIND_LABEL[edu.kind] ?? "a formação"} (você edita depois) ou crie as suas.</p>
          </div>
          <button
            type="button"
            className="rpg-btn rpg-btn-gold text-sm"
            disabled={applyTemplate.isPending}
            onClick={() => applyTemplate.mutate(edu.id, { onSuccess: () => onToast("Etapas criadas. Ajuste como quiser."), onError: err })}
          >
            Usar etapas sugeridas
          </button>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5 md:flex-row md:flex-wrap md:items-start md:gap-0">
          {stages.map((s, i) => (
            <li key={s.id} className="flex min-w-0 items-center gap-2 md:w-[150px] md:flex-col md:gap-1 md:text-center">
              <div className="flex items-center md:w-full">
                <span className={clsx("hidden h-0.5 flex-1 md:block", i === 0 ? "invisible" : stages[i - 1]!.status === "done" ? "bg-rpg-green" : "bg-rpg-border")} aria-hidden />
                <button
                  type="button"
                  onClick={() => updateStage.mutate({ id: s.id, patch: { status: STATUS_NEXT[s.status] } }, { onError: err })}
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    s.status === "done" && "border-rpg-green bg-rpg-green/20 text-rpg-green",
                    s.status === "active" && "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light shadow-[0_0_12px_rgb(var(--rpg-gold)/0.6)]",
                    s.status === "pending" && "border-rpg-border bg-rpg-bg-2 text-rpg-muted",
                  )}
                  aria-label={`${s.title}: ${STATUS_LABEL[s.status]}. Clique para marcar como ${STATUS_LABEL[STATUS_NEXT[s.status]]}`}
                  title={`${STATUS_LABEL[s.status]} — clique para avançar`}
                >
                  {s.status === "done" ? <Check size={16} /> : s.status === "active" ? <Sparkles size={15} /> : <Circle size={12} />}
                </button>
                <span className={clsx("hidden h-0.5 flex-1 md:block", i === stages.length - 1 ? "invisible" : s.status === "done" ? "bg-rpg-green" : "bg-rpg-border")} aria-hidden />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1 md:flex-col md:px-1">
                <p className={clsx("min-w-0 flex-1 truncate text-xs md:whitespace-normal", s.status === "active" ? "text-rpg-gold-light" : "text-rpg-text")}>{s.title}</p>
                {s.dueDate && <p className="shrink-0 text-[10px] text-rpg-muted">até {dayBr(s.dueDate)}</p>}
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-rpg-muted hover:text-rpg-red md:h-6 md:w-6"
                  aria-label={`Excluir etapa ${s.title}`}
                  onClick={() => {
                    if (confirm(`Excluir a etapa "${s.title}"?`)) deleteStage.mutate(s.id, { onError: err });
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t) return;
          createStage.mutate({ educationId: edu.id, title: t }, { onSuccess: () => setTitle(""), onError: err });
        }}
      >
        <label htmlFor="new-stage" className="sr-only">
          Nova etapa
        </label>
        <input
          id="new-stage"
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova etapa (ex.: Qualificação)"
          className="min-h-[44px] min-w-0 flex-1 border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
          style={R}
        />
        <button type="submit" className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 text-sm" disabled={createStage.isPending || !title.trim()}>
          <Plus size={14} aria-hidden /> Etapa
        </button>
      </form>
    </KitSection>
  );
}

export function SubjectsGrimoirePanel({ hub, educationId }: { hub: EducationHub; educationId: string | null }) {
  const list = hub.subjects.filter((s) => !educationId || s.educationId === educationId).filter((s) => s.status === "Em andamento" || s.status === "Planejada");
  return (
    <KitSection title="Disciplinas e tomos" icon={<Layers size={16} />} action={<Link to="/grimorio" className="text-xs text-rpg-gold-light underline">Grimório</Link>}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma disciplina em andamento ou planejada. Cadastre no painel da formação abaixo.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.slice(0, 8).map((s) => (
            <li key={s.id} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{s.name}</p>
                <span className="shrink-0 font-pixel text-[10px] text-rpg-muted">{s.status}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <RPGProgressBar className="flex-1" value={s.progressPct} tone="blue" label={`Progresso de ${s.name}`} showLabel={false} />
                <span className="shrink-0 font-pixel text-[10px] text-rpg-text">{s.progressPct}%</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-rpg-muted">
                <span>{hm(s.studyMinutesWeek)} nesta semana</span>
                {s.decks.length > 0 ? (
                  s.decks.slice(0, 2).map((d) => (
                    <Link key={d.id} to="/grimorio" className="text-rpg-purple underline">
                      📘 {d.name}
                    </Link>
                  ))
                ) : (
                  <Link to="/grimorio" className="text-rpg-orange underline">
                    sem tomo — criar no Grimório
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function DeadlinesProjectsPanel({ hub, educationId }: { hub: EducationHub; educationId: string | null }) {
  const deadlines = hub.deadlines.filter((d) => !educationId || d.educationId === educationId);
  const projects = hub.projects.filter((p) => !educationId || p.educationId === educationId || p.educationId === null);
  return (
    <KitSection title="Prazos e projetos" icon={<CalendarClock size={16} />}>
      <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-muted">Próximos prazos (14 dias)</p>
      {deadlines.length === 0 ? (
        <p className="mb-2 text-sm text-rpg-muted">Nenhum prazo nos próximos 14 dias.</p>
      ) : (
        <ul className="mb-2 space-y-1">
          {deadlines.slice(0, 6).map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <CalendarClock size={13} className={d.overdue ? "text-rpg-red" : "text-rpg-muted"} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-rpg-text">
                {d.title}
                {d.subjectName && <span className="text-rpg-muted"> · {d.subjectName}</span>}
              </span>
              <span className={clsx("shrink-0 font-pixel text-[10px]", d.overdue ? "text-rpg-red" : "text-rpg-muted")}>{d.overdue ? "atrasado" : dayBr(d.dueDate)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mb-1 font-pixel text-[10px] uppercase text-rpg-muted">Projetos acadêmicos</p>
      {projects.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum projeto acadêmico.</p>
      ) : (
        <ul className="space-y-1.5">
          {projects.slice(0, 4).map((p) => (
            <li key={p.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-rpg-text">{p.title}</span>
                <span className="shrink-0 font-pixel text-[10px] text-rpg-text">{p.progressPct}%</span>
              </div>
              <RPGProgressBar value={p.progressPct} tone="purple" label={`Progresso de ${p.title}`} showLabel={false} />
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/** Plano semanal de estudo: proposta editável; só vira tarefa após aprovação explícita. */
export function StudyPlanEditor({ hub, onToast }: { hub: EducationHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { generatePlan, decidePlan } = useEducationHubActions();
  const plan = hub.pendingPlan;
  const [items, setItems] = useState<StudyPlanItem[]>(plan?.payload.items ?? []);
  useEffect(() => setItems(plan?.payload.items ?? []), [plan?.id, plan?.payload.items]);
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
  const patch = (i: number, p: Partial<StudyPlanItem>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)));

  return (
    <KitSection
      title="Plano semanal de estudo"
      icon={<Sparkles size={16} />}
      tone="legendary"
      action={
        <button
          type="button"
          className="rpg-btn rpg-btn-secondary px-2 py-1 text-xs"
          disabled={generatePlan.isPending}
          onClick={() => generatePlan.mutate(undefined, { onSuccess: (r) => onToast(r.summary, r.status === "ok" ? "success" : "error"), onError: err })}
        >
          {plan ? "Gerar de novo" : "Gerar plano"}
        </button>
      }
    >
      {!plan ? (
        <p className="text-sm text-rpg-muted">Gere uma proposta que distribui sua meta semanal entre as disciplinas em andamento, priorizando as com prazo mais próximo. Nada é criado sem a sua aprovação.</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-rpg-muted">
            Semana de {dayBr(plan.weekStart)} · meta {hm(plan.payload.goalMinutes)}. Edite, remova sessões e aprove para criar as tarefas.
          </p>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {items.map((it, i) => (
              <li key={`${it.date}-${i}`} className="grid grid-cols-[1fr_auto] gap-1.5 border border-rpg-border/70 bg-rpg-bg-2/60 p-1.5 sm:grid-cols-[1fr_120px_76px_auto]" style={R}>
                <label className="sr-only" htmlFor={`plan-title-${i}`}>
                  Título da sessão
                </label>
                <input id={`plan-title-${i}`} value={it.title} maxLength={200} onChange={(e) => patch(i, { title: e.target.value })} className="min-h-[40px] min-w-0 border border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text" style={R} />
                <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="flex h-10 w-10 items-center justify-center text-rpg-muted hover:text-rpg-red sm:order-last" aria-label={`Remover ${it.title}`}>
                  <X size={14} />
                </button>
                <label className="sr-only" htmlFor={`plan-date-${i}`}>
                  Data
                </label>
                <input id={`plan-date-${i}`} type="date" value={it.date} onChange={(e) => patch(i, { date: e.target.value })} className="min-h-[40px] border border-rpg-border bg-rpg-bg px-1 text-xs text-rpg-text" style={R} />
                <label className="sr-only" htmlFor={`plan-min-${i}`}>
                  Minutos
                </label>
                <input
                  id={`plan-min-${i}`}
                  type="number"
                  min={5}
                  max={240}
                  value={it.minutes}
                  onChange={(e) => patch(i, { minutes: Math.max(5, Math.min(240, Number(e.target.value) || 5)) })}
                  className="min-h-[40px] border border-rpg-border bg-rpg-bg px-1 text-xs text-rpg-text"
                  style={R}
                />
                <p className="col-span-full text-[10px] text-rpg-muted">Motivo: {it.reason}</p>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <button
              type="button"
              className="rpg-btn rpg-btn-success inline-flex items-center justify-center gap-1 text-sm"
              disabled={decidePlan.isPending || items.length === 0}
              onClick={() =>
                decidePlan.mutate(
                  { id: plan.id, decision: "apply", items: items.map((it) => ({ date: it.date, subjectId: it.subjectId, minutes: it.minutes, title: it.title.trim() || `Estudar ${it.subjectName}` })) },
                  { onSuccess: (r) => onToast(`${r.created} tarefa(s) de estudo criada(s).`), onError: err },
                )
              }
            >
              <CheckCircle2 size={14} aria-hidden /> Aprovar e criar {items.length} tarefa(s)
            </button>
            <button type="button" className="rpg-btn rpg-btn-ghost text-sm" disabled={decidePlan.isPending} onClick={() => decidePlan.mutate({ id: plan.id, decision: "reject" }, { onSuccess: () => onToast("Plano descartado."), onError: err })}>
              Descartar proposta
            </button>
          </div>
        </>
      )}
    </KitSection>
  );
}

const EDU_MEDALS = [
  { code: "edu_start", img: `${ART}/medal-1.webp`, fallbackTitle: "Início da Jornada" },
  { code: "edu_dedicated", img: `${ART}/medal-2.webp`, fallbackTitle: "Estudante Dedicado" },
  { code: "edu_organized", img: `${ART}/medal-3.webp`, fallbackTitle: "Organização" },
  { code: "edu_researcher", img: `${ART}/medal-2.webp`, fallbackTitle: "Pesquisador" },
  { code: "edu_epic", img: `${ART}/medal-1.webp`, fallbackTitle: "Conclusão Épica" },
];

export function EducationRewardsAndAutomations() {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <KitSection title="Conquistas da educação" icon={<Medal size={16} />} tone="gold">
        <MedalStrip medals={EDU_MEDALS} />
      </KitSection>
      <AutomationsPanel module="education" title="Automações da educação" intro="Prazos, plano semanal, Grimório e progresso automático. Propostas de plano só viram tarefa com sua aprovação." />
    </div>
  );
}

export function EducationAdvisor() {
  return <AdvisorPanel module="education" title="Conselheiro acadêmico" avatar={`${ART}/advisor.webp`} research />;
}
