import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Clock,
  GraduationCap,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  Wand2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAcademicProjects, useEducation, useEducationDashboard, useEducations, useSubjects } from "@/hooks/useEducations";
import { useEducationInsight } from "@/hooks/useCopilot";
import { useProjectTasks } from "@/hooks/useTasks";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskModal } from "@/components/tasks/TaskModal";
import { PhaseBadge } from "./EducacaoPage";
import type { AcademicProject, AcademicProjectKind, Course, Subject, Task } from "@/types";

const SUBJECT_STATUS: Subject["status"][] = ["Planejada", "Em andamento", "Concluída", "Trancada"];
const ACADEMIC_COLUMNS = ["Backlog", "A Fazer", "Em Andamento", "Em Revisão", "Concluído"];
const SUBJECT_TONES: Array<"blue" | "purple" | "green" | "pink" | "teal"> = ["blue", "purple", "green", "pink", "teal"];
const DEADLINES_LIMIT = 5;
const SUBJECTS_LIMIT = 4;
const CHECKLIST_LIMIT = 6;

const ACADEMIC_KIND_LABEL: Record<AcademicProjectKind, string> = {
  tcc: "TCC",
  dissertacao: "Dissertação",
  tese: "Tese",
  artigo: "Artigo",
  projeto_cientifico: "Projeto científico",
  trabalho_final: "Trabalho final",
};

const EDUCATION_KIND_LABEL: Record<string, string> = {
  graduacao: "Graduação",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado: "Doutorado",
  curso_online: "Curso online",
  certificacao: "Certificação",
  curso_livre: "Curso livre",
};

const FALLBACK_QUOTES = [
  "O conhecimento aplicado transforma possibilidades em realidade.",
  "Aprendizado é um investimento que sempre rende.",
  "Cada disciplina concluída é um degrau — o ritmo importa mais que a pressa.",
  "Estudar um pouco todo dia bate estudar muito um dia só.",
];
function fallbackQuoteOfTheDay() {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return FALLBACK_QUOTES[dayIndex % FALLBACK_QUOTES.length];
}

function formatMonthYear(value: string | null) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDayMonth(value: string) {
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value.replace(" ", "T"));
  return {
    day: d.toLocaleDateString("pt-BR", { day: "2-digit" }),
    month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
  };
}

function formatHM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function urgencyInfo(dueDate: string) {
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const today = new Date(new Date().toDateString());
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Atrasado", className: "bg-drop/10 text-drop" };
  if (days <= 3) return { label: "Urgente", className: "bg-drop/10 text-drop" };
  if (days <= 7) return { label: "Em breve", className: "bg-signal/15 text-signal-deep" };
  if (days <= 30) return { label: "Normal", className: "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" };
  return { label: "Planejado", className: "bg-slate/10 text-slate" };
}

/**
 * Painel completo de uma formação — cabeçalho, indicadores,
 * disciplinas/prazos/estudo, projetos acadêmicos, cronograma do
 * semestre (stepper) e o Kanban de cada projeto acadêmico. Usado
 * tanto pela tela principal de Educação (formação "ativa" em
 * destaque, sem botão de voltar) quanto pela página de detalhe de
 * uma formação específica (com botão de voltar) — mesma lógica,
 * nunca duplicada entre as duas.
 */
export function EducationDashboard({ educationId, onBack }: { educationId: string; onBack?: () => void }) {
  const { education, courses, createCourse, removeCourse } = useEducation(educationId);
  const { createProject } = useAcademicProjects();
  const { removeEducation } = useEducations();
  const dashboard = useEducationDashboard(educationId);
  const insight = useEducationInsight();
  const [newCourseName, setNewCourseName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [confirmDeleteEducation, setConfirmDeleteEducation] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);
  const [showAllChecklist, setShowAllChecklist] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [checklistDueDate, setChecklistDueDate] = useState("");

  const visibleSubjects = showAllSubjects ? dashboard.subjects : dashboard.subjects.slice(0, SUBJECTS_LIMIT);
  const pendingDeadlines = useMemo(() => dashboard.deadlines.filter((d) => !d.done), [dashboard.deadlines]);
  const visibleDeadlines = showAllDeadlines ? pendingDeadlines : pendingDeadlines.slice(0, DEADLINES_LIMIT);
  const visibleChecklist = showAllChecklist ? dashboard.checklist : dashboard.checklist.slice(0, CHECKLIST_LIMIT);

  const weekMax = Math.max(1, ...dashboard.stats?.dailyStudyMinutes.map((d) => d.minutes) ?? [1]);
  const weeklyGoalPct = dashboard.stats
    ? Math.min(100, Math.round((dashboard.stats.studyMinutesThisWeek / Math.max(1, dashboard.stats.weeklyGoalMinutes)) * 100))
    : 0;

  if (!education) {
    return <div className="px-4 py-8 text-sm text-slate">Carregando...</div>;
  }

  const handleAddCourse = async () => {
    if (!newCourseName.trim()) return;
    await createCourse({ name: newCourseName.trim() });
    setNewCourseName("");
  };

  const handleAddChecklistItem = async () => {
    if (!checklistTitle.trim()) return;
    await dashboard.createChecklistItem({ title: checklistTitle.trim(), dueDate: checklistDueDate || null });
    setChecklistTitle("");
    setChecklistDueDate("");
    setAddingStep(false);
  };

  const handleDeleteEducation = async () => {
    await removeEducation(education.id);
    setConfirmDeleteEducation(false);
    onBack?.();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate">
            <ArrowLeft size={14} /> Voltar para Educação
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => setConfirmDeleteEducation(true)}
          className="flex items-center gap-1.5 text-xs text-slate hover:text-drop transition-colors"
        >
          <Trash2 size={13} /> Excluir formação
        </button>
      </div>

      {/* ===================== Cabeçalho da formação ===================== */}
      <Card className="p-5 md:p-6 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <IconBadge tone="blue" size={56} icon={<GraduationCap size={26} />} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-paper-border dark:border-ink-border text-slate">
                  {EDUCATION_KIND_LABEL[education.kind] ?? education.kind}
                </span>
                <PhaseBadge phase={education.phase} />
              </div>
              <p className="font-display font-bold text-xl mt-1.5">{education.course_name}</p>
              {education.institution && <p className="text-sm text-slate">{education.institution}</p>}
              <div className="mt-3 max-w-sm">
                <div className="flex items-center justify-between text-xs text-slate mb-1">
                  <span>Progresso geral</span>
                  <span className="font-semibold text-inherit">{education.progress_pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                  <div
                    className="h-full rounded-full bg-signal transition-[width] duration-700"
                    style={{ width: `${education.progress_pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* flex-wrap + gap menor no mobile: em ~360-400px as duas datas
              lado a lado com shrink-0 podiam empurrar a largura do cartão */}
          <div className="flex items-center gap-4 sm:gap-5 text-xs shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate" />
              <div>
                <p className="text-slate">Início</p>
                <p className="font-semibold">{formatMonthYear(education.started_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate" />
              <div>
                <p className="text-slate">Previsão de conclusão</p>
                <p className="font-semibold">{formatMonthYear(education.expected_end_at)}</p>
              </div>
            </div>
          </div>

          {/* Largura total no mobile (empilhado); volta a ser um cartão
              lateral compacto a partir de lg, quando fica ao lado do resto */}
          <div className="rounded-2xl p-4 bg-gradient-to-br from-brand-500 to-cat-purple text-white w-full lg:max-w-[220px] shrink-0">
            <p className="text-xs leading-relaxed">&ldquo;{fallbackQuoteOfTheDay()}&rdquo;</p>
          </div>
        </div>
      </Card>

      {/* ========================== Indicadores reais ========================== */}
      {/* 1 coluna em telas muito estreitas, 2 a partir de sm e 4 a partir de
          lg — evita cartões apertados demais em ~360-400px de largura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <IconBadge tone="blue" size={34} icon={<BookOpen size={16} />} />
            <span className="text-xs text-slate">Disciplinas ativas</span>
          </div>
          <p className="font-display font-bold text-xl leading-none">
            {dashboard.stats?.activeSubjects ?? 0} / {dashboard.stats?.totalSubjects ?? 0}
          </p>
          <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border mt-3">
            <div
              className="h-full rounded-full bg-cat-blue"
              style={{
                width: `${dashboard.stats && dashboard.stats.totalSubjects > 0 ? Math.round((dashboard.stats.activeSubjects / dashboard.stats.totalSubjects) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-slate mt-1.5">
            {dashboard.stats && dashboard.stats.totalSubjects > 0
              ? `${Math.round((dashboard.stats.activeSubjects / dashboard.stats.totalSubjects) * 100)}% do semestre`
              : "Nenhuma disciplina cadastrada"}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <IconBadge tone="amber" size={34} icon={<Calendar size={16} />} />
            <span className="text-xs text-slate">Próximos prazos</span>
          </div>
          <p className="font-display font-bold text-xl leading-none">{dashboard.stats?.upcomingDeadlines ?? 0}</p>
          <p className="text-[10px] text-slate mt-1.5">nos próximos 30 dias</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <IconBadge tone="green" size={34} icon={<Clock size={16} />} />
            <span className="text-xs text-slate">Horas de estudo</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="font-display font-bold text-xl leading-none">{formatHM(dashboard.stats?.studyMinutesThisWeek ?? 0)}</p>
            {dashboard.stats?.studyChangePct !== null && dashboard.stats?.studyChangePct !== undefined && (
              <span className={`text-[10px] font-semibold ${dashboard.stats.studyChangePct >= 0 ? "text-growth" : "text-drop"}`}>
                {dashboard.stats.studyChangePct >= 0 ? "↑" : "↓"} {Math.abs(dashboard.stats.studyChangePct)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate mt-1.5">esta semana</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <IconBadge tone="purple" size={34} icon={<Trophy size={16} />} />
            <span className="text-xs text-slate">Projetos acadêmicos</span>
          </div>
          <p className="font-display font-bold text-xl leading-none">{dashboard.stats?.activeAcademicProjects ?? 0}</p>
          <p className="text-[10px] text-slate mt-1.5">em andamento</p>
        </Card>
      </div>

      {/* ==================== Disciplinas / Prazos / Estudo ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Disciplinas do semestre</p>
            {dashboard.subjects.length > SUBJECTS_LIMIT && (
              <button onClick={() => setShowAllSubjects((v) => !v)} className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                {showAllSubjects ? "Ver menos" : "Ver todas →"}
              </button>
            )}
          </div>
          {dashboard.subjects.length === 0 ? (
            <p className="text-xs text-slate">Nenhuma disciplina cadastrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {visibleSubjects.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <IconBadge tone={SUBJECT_TONES[idx % SUBJECT_TONES.length]} size={30} icon={<BookOpen size={13} />} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{s.name}</p>
                    {s.professor && <p className="text-[10px] text-slate truncate">{s.professor}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                        <div
                          className={`h-full rounded-full ${SUBJECT_TONES[idx % SUBJECT_TONES.length] === "blue" ? "bg-cat-blue" : SUBJECT_TONES[idx % SUBJECT_TONES.length] === "purple" ? "bg-cat-purple" : SUBJECT_TONES[idx % SUBJECT_TONES.length] === "green" ? "bg-cat-green" : SUBJECT_TONES[idx % SUBJECT_TONES.length] === "pink" ? "bg-cat-pink" : "bg-cat-teal"}`}
                          style={{ width: `${s.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate shrink-0 w-8 text-right">{s.progress_pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setSubjectModalOpen(true)}
            className="w-full mt-3 text-xs text-slate rounded-lg px-2 py-2 border border-dashed border-paper-border dark:border-ink-border hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus size={12} /> Adicionar disciplina
          </button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Próximos prazos</p>
            {pendingDeadlines.length > DEADLINES_LIMIT && (
              <button onClick={() => setShowAllDeadlines((v) => !v)} className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                {showAllDeadlines ? "Ver menos" : "Ver todos →"}
              </button>
            )}
          </div>
          {pendingDeadlines.length === 0 ? (
            <p className="text-xs text-slate">Nenhum prazo pendente cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {visibleDeadlines.map((d) => {
                const { day, month } = formatDayMonth(d.due_date);
                const urgency = urgencyInfo(d.due_date);
                return (
                  <div key={d.id} className="flex items-center gap-3">
                    <div className="w-9 text-center shrink-0">
                      <p className="text-sm font-bold leading-none">{day}</p>
                      <p className="text-[10px] text-slate">{month}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{d.title}</p>
                      {d.subject_name && <p className="text-[10px] text-slate truncate">{d.subject_name}</p>}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${urgency.className}`}>{urgency.label}</span>
                    <button onClick={() => dashboard.updateDeadline({ deadlineId: d.id, patch: { done: true } })} className="text-slate shrink-0">
                      <CheckSquare size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setDeadlineModalOpen(true)}
            className="w-full mt-3 text-xs text-slate rounded-lg px-2 py-2 border border-dashed border-paper-border dark:border-ink-border hover:border-brand-500 hover:text-brand-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus size={12} /> Adicionar prazo
          </button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Horas de estudo na semana</p>
            <button onClick={() => setStudyModalOpen(true)} className="text-xs text-brand-600 dark:text-brand-500 font-medium">
              + Registrar
            </button>
          </div>
          <div className="flex items-baseline justify-between mb-3">
            <p className="font-display font-bold text-2xl">{formatHM(dashboard.stats?.studyMinutesThisWeek ?? 0)}</p>
            <p className="text-[11px] text-slate">Meta: {formatHM(dashboard.stats?.weeklyGoalMinutes ?? 1200)}</p>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-20">
            {(dashboard.stats?.dailyStudyMinutes ?? []).map((d) => (
              <div key={d.weekday} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate">{d.minutes > 0 ? formatHM(d.minutes) : ""}</span>
                <div className="w-full rounded-t-md bg-brand-500/80" style={{ height: `${Math.max(3, (d.minutes / weekMax) * 56)}px` }} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            {(dashboard.stats?.dailyStudyMinutes ?? []).map((d) => (
              <span key={d.weekday} className="flex-1 text-center text-[10px] text-slate">
                {d.weekday}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate mt-2 text-right">{weeklyGoalPct}% da meta</p>
        </Card>
      </div>

      {/* ==================== Semestre / Insight ====================
          O card "Projetos acadêmicos" que existia aqui foi removido:
          ele só repetia (título, tipo, progresso) exatamente o que a
          seção "TCC, dissertação e projetos acadêmicos" mais abaixo já
          mostra, com um simples link-âncora para rolar até lá. Essa
          era a redundância da tela de Educação — a lista completa com
          o Kanban de cada projeto já está mais abaixo, com muito mais
          informação real (e agora com exclusão). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">Meu semestre</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setAddingStep((v) => !v)} className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                + Etapa
              </button>
              {dashboard.checklist.length > CHECKLIST_LIMIT && (
                <button onClick={() => setShowAllChecklist((v) => !v)} className="text-xs text-brand-600 dark:text-brand-500 font-medium">
                  {showAllChecklist ? "Ver menos" : "Ver cronograma →"}
                </button>
              )}
            </div>
          </div>

          {dashboard.checklist.length === 0 ? (
            <p className="text-xs text-slate mb-3">Nenhuma etapa cadastrada ainda — adicione as fases do seu semestre (ex.: Disciplinas, Qualificação, Entrega final).</p>
          ) : (
            <SemesterStepper
              items={visibleChecklist}
              onToggle={(itemId, done) => dashboard.updateChecklistItem({ itemId, patch: { done } })}
            />
          )}

          {(addingStep || dashboard.checklist.length === 0) && (
            // flex-wrap + data mais estreita: em ~360px os três campos
            // (texto + data + botão) não cabiam todos numa única linha
            <div className="flex gap-1.5 mt-3 flex-wrap">
              <input
                value={checklistTitle}
                onChange={(e) => setChecklistTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddChecklistItem()}
                placeholder="Nome da etapa..."
                className="flex-1 min-w-[140px] rounded-lg px-2.5 py-1.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500"
              />
              <input
                type="date"
                value={checklistDueDate}
                onChange={(e) => setChecklistDueDate(e.target.value)}
                className="w-28 sm:w-32 rounded-lg px-2 py-1.5 text-xs bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border focus:border-brand-500"
              />
              <button onClick={handleAddChecklistItem} className="rounded-lg px-2.5 border border-paper-border dark:border-ink-border text-slate shrink-0">
                <Plus size={13} />
              </button>
            </div>
          )}
        </Card>

        <Card className="p-5 bg-gradient-to-br from-cat-green/90 to-brand-500 text-white border-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 mb-3">
              <Sparkles size={18} />
            </span>
          </div>
          <p className="font-display font-semibold text-base mb-1">Insight de estudos</p>
          <p className="text-sm leading-relaxed bg-white/10 rounded-xl px-4 py-3 flex-1">
            {insight.text && !insight.error ? insight.text : fallbackQuoteOfTheDay()}
          </p>
          {insight.error && (
            <p className="text-xs mt-2.5 opacity-90">
              {insight.error.message}
              {insight.error.status === 400 && insight.error.message.includes("configurada") && (
                <>
                  {" "}
                  <Link to="/configuracoes" className="underline font-semibold">
                    Ir para Configurações
                  </Link>
                </>
              )}
            </p>
          )}
          <button
            onClick={() => insight.generate(educationId)}
            disabled={insight.isGenerating}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 py-2.5 text-sm font-semibold disabled:opacity-60 self-start"
          >
            <Wand2 size={15} />
            {insight.isGenerating ? "Analisando..." : insight.text ? "Gerar outra análise" : "Analisar com IA"}
          </button>
        </Card>
      </div>

      {/* ==================== Períodos e disciplinas (avançado) ==================== */}
      <p className="text-sm font-semibold mb-3">Períodos e disciplinas</p>
      <div className="flex gap-2 mb-6">
        <input
          value={newCourseName}
          onChange={(e) => setNewCourseName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCourse()}
          placeholder="Novo período/curso (ex: 2026/2)"
          className="flex-1 rounded-lg px-3 py-2 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
        <Button onClick={handleAddCourse}>
          <Plus size={14} /> Adicionar
        </Button>
      </div>

      <div className="space-y-3">
        {courses.map((course) => (
          <CourseBlock
            key={course.id}
            course={course}
            expanded={expanded === course.id}
            onToggle={() => setExpanded(expanded === course.id ? null : course.id)}
            onRemove={() => removeCourse(course.id)}
          />
        ))}
      </div>

      <div id="projetos-academicos" className="mt-8 space-y-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold">TCC, dissertação e projetos acadêmicos</p>
          <Button variant="secondary" onClick={() => setNewProjectOpen(true)}>
            <Plus size={14} /> Novo projeto acadêmico
          </Button>
        </div>
        {education.academicProjects.length === 0 && (
          <p className="text-xs text-slate">
            Nenhum projeto acadêmico vinculado ainda — cadastre seu TCC, dissertação ou tese para ganhar um Kanban dedicado a ele.
          </p>
        )}
        {education.academicProjects.map((project) => (
          <AcademicProjectKanban key={project.id} project={project} />
        ))}
      </div>

      {newProjectOpen && (
        <NovoProjetoAcademicoModal educationId={education.id} onClose={() => setNewProjectOpen(false)} onCreate={createProject} />
      )}

      {subjectModalOpen && <QuickSubjectModal onClose={() => setSubjectModalOpen(false)} onCreate={dashboard.quickCreateSubject} />}

      {deadlineModalOpen && (
        <DeadlineModal subjects={dashboard.subjects} onClose={() => setDeadlineModalOpen(false)} onCreate={dashboard.createDeadline} />
      )}

      {studyModalOpen && <StudySessionModal onClose={() => setStudyModalOpen(false)} onCreate={dashboard.logStudySession} />}

      {confirmDeleteEducation && (
        <ModalWrap title={`Excluir "${education.course_name}"?`} onClose={() => setConfirmDeleteEducation(false)}>
          <p className="text-xs text-slate mb-4">
            Cursos, disciplinas, prazos e projetos acadêmicos (TCC/dissertação/tese) desta formação serão apagados junto, incluindo o Kanban de cada um. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteEducation(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleDeleteEducation} className="flex-1 !bg-drop !from-drop !to-drop">
              Excluir
            </Button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}

/**
 * Cronograma do semestre como um stepper horizontal: cada etapa
 * (checklist real do usuário, ordenada por posição) vira um ponto na
 * linha do tempo — concluída (check verde), atual (anel azul, a
 * primeira ainda não concluída) ou futura (contorno neutro). Clicar
 * num ponto alterna concluída/pendente, igual ao checklist anterior.
 */
function SemesterStepper({
  items,
  onToggle,
}: {
  items: { id: string; title: string; done: number; due_date: string | null }[];
  onToggle: (itemId: string, done: boolean) => void;
}) {
  const firstPendingIndex = items.findIndex((i) => !i.done);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-start min-w-max">
        {items.map((item, idx) => {
          const isDone = !!item.done;
          const isCurrent = !isDone && idx === firstPendingIndex;
          return (
            <div key={item.id} className="flex items-start flex-1 min-w-[92px]">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => onToggle(item.id, !isDone)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                    isDone
                      ? "bg-growth border-growth text-white"
                      : isCurrent
                      ? "border-brand-500 text-brand-600 dark:text-brand-500 bg-paper-raised dark:bg-ink-raised"
                      : "border-paper-border dark:border-ink-border text-transparent"
                  }`}
                >
                  {isDone ? <Check size={13} /> : isCurrent ? <span className="w-2 h-2 rounded-full bg-brand-500" /> : null}
                </button>
                <p className={`text-[11px] font-medium mt-2 text-center leading-tight ${isCurrent ? "text-brand-600 dark:text-brand-500" : isDone ? "" : "text-slate"}`}>
                  {item.title}
                </p>
                {item.due_date && <p className="text-[10px] text-slate mt-0.5">{formatMonthYear(item.due_date)}</p>}
              </div>
              {idx < items.length - 1 && (
                <div className={`h-0.5 flex-1 mt-3 rounded-full ${isDone ? "bg-growth" : "bg-paper-border dark:bg-ink-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuickSubjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; professor?: string | null }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [professor, setProfessor] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), professor: professor.trim() || null });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrap title="Adicionar disciplina" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome da disciplina" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Professor(a)" value={professor} onChange={(e) => setProfessor(e.target.value)} />
        <Button onClick={handleSubmit} disabled={!name.trim() || saving} className="w-full">
          {saving ? "Adicionando..." : "Adicionar"}
        </Button>
      </div>
    </ModalWrap>
  );
}

function DeadlineModal({
  subjects,
  onClose,
  onCreate,
}: {
  subjects: Subject[];
  onClose: () => void;
  onCreate: (input: { title: string; dueDate: string; subjectId?: string | null }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    try {
      await onCreate({ title: title.trim(), dueDate, subjectId: subjectId || null });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrap title="Adicionar prazo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Entrega do projeto final" />
        <Field label="Data" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {subjects.length > 0 && (
          <div>
            <label className="text-xs text-slate">Disciplina (opcional)</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink outline-none border border-paper-border dark:border-ink-border"
            >
              <option value="">Nenhuma</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={handleSubmit} disabled={!title.trim() || !dueDate || saving} className="w-full">
          {saving ? "Adicionando..." : "Adicionar"}
        </Button>
      </div>
    </ModalWrap>
  );
}

function StudySessionModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { occurredAt: string; durationMinutes: number; subjectId?: string | null }) => Promise<unknown>;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [minutes, setMinutes] = useState(60);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (minutes <= 0) return;
    setSaving(true);
    try {
      await onCreate({ occurredAt: date, durationMinutes: minutes });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrap title="Registrar sessão de estudo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label="Duração (minutos)" type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        <Button onClick={handleSubmit} disabled={minutes <= 0 || saving} className="w-full">
          {saving ? "Salvando..." : "Registrar"}
        </Button>
      </div>
    </ModalWrap>
  );
}

function NovoProjetoAcademicoModal({
  educationId,
  onClose,
  onCreate,
}: {
  educationId: string;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<AcademicProjectKind>("tcc");
  const [title, setTitle] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({ kind, title: title.trim(), advisor: advisor.trim() || null, educationId });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-4">Novo projeto acadêmico</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate">Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AcademicProjectKind)}
              className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
            >
              {Object.entries(ACADEMIC_KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Dissertação de Mestrado" />
          <Field label="Orientador(a)" value={advisor} onChange={(e) => setAdvisor(e.target.value)} />
          <Button onClick={handleSubmit} disabled={!title.trim() || saving} className="w-full">
            {saving ? "Criando..." : "Criar projeto"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Kanban de um projeto acadêmico específico (TCC/dissertação/tese),
 * reaproveitando o mesmo KanbanBoard genérico + TaskCard + TaskModal
 * usados em Tarefas — as tarefas ficam ligadas a academic_projects
 * via projects.id, então o progresso aqui é real, nunca estimado.
 */
function AcademicProjectKanban({ project }: { project: AcademicProject }) {
  const { tasks, createTask, updateTask, removeTask, moveTask } = useProjectTasks(project.project_id);
  const { removeProject } = useAcademicProjects();
  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openNew = () => setModalState({ open: true, task: null });
  const openEdit = (task: Task) => setModalState({ open: true, task });
  const close = () => setModalState({ open: false, task: null });

  const handleSave = async (input: Parameters<typeof createTask>[0]) => {
    if (modalState.task) {
      await updateTask({ id: modalState.task.id, patch: input });
    } else {
      await createTask(input);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">{project.title}</p>
          {project.advisor && <p className="text-xs text-slate">Orientador(a): {project.advisor}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32">
            <div className="flex items-center justify-between text-[11px] text-slate mb-1">
              <span>Progresso</span>
              <span>{project.progress_pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
              <div className="h-full rounded-full bg-growth" style={{ width: `${project.progress_pct}%` }} />
            </div>
          </div>
          <Button onClick={openNew}>
            <Plus size={15} /> Nova etapa
          </Button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label={`Excluir projeto acadêmico ${project.title}`}
            className="text-slate/60 hover:text-drop transition-colors shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <KanbanBoard
        columns={ACADEMIC_COLUMNS}
        items={tasks}
        getId={(t) => t.id}
        getStatus={(t) => t.status}
        onMove={(id, status) => moveTask({ id, status })}
        renderCard={(task, dragProps) => <TaskCard task={task} onClick={() => openEdit(task)} dragProps={dragProps} />}
        emptyHint="Sem etapas aqui ainda"
      />

      {modalState.open && (
        <TaskModal task={modalState.task} statusOptions={ACADEMIC_COLUMNS} onClose={close} onSave={handleSave} onDelete={removeTask} />
      )}

      {confirmDelete && (
        <ModalWrap title={`Excluir "${project.title}"?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-xs text-slate mb-4">
            O Kanban e as etapas deste projeto acadêmico serão apagados. As tarefas em si continuam existindo, mas perdem o vínculo com ele.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={() => removeProject(project.id)} className="flex-1 !bg-drop !from-drop !to-drop">
              Excluir
            </Button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}

/**
 * Edição completa de uma disciplina — antes só dava pra trocar o
 * status pelo select inline. Aqui dá pra ajustar professor, carga
 * horária, progresso e anotações (notas/avaliações ficam em texto
 * livre por enquanto, sem UI própria de lançamento nota a nota).
 */
function SubjectEditModal({
  subject,
  onClose,
  onSave,
}: {
  subject: Subject;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const [name, setName] = useState(subject.name);
  const [professor, setProfessor] = useState(subject.professor ?? "");
  const [workloadHours, setWorkloadHours] = useState(subject.workload_hours != null ? String(subject.workload_hours) : "");
  const [status, setStatus] = useState<Subject["status"]>(subject.status);
  const [progressPct, setProgressPct] = useState(String(subject.progress_pct));
  const [notes, setNotes] = useState(subject.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        professor: professor.trim() || null,
        workloadHours: workloadHours.trim() ? Number(workloadHours) : null,
        status,
        progressPct: Math.max(0, Math.min(100, Number(progressPct) || 0)),
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a disciplina.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrap title="Editar disciplina" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Professor(a)" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Opcional" />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Carga horária (h)"
            type="number"
            value={workloadHours}
            onChange={(e) => setWorkloadHours(e.target.value)}
            placeholder="Opcional"
          />
          <Field label="Progresso (%)" type="number" value={progressPct} onChange={(e) => setProgressPct(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Subject["status"])}
            className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none"
          >
            {SUBJECT_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate">Anotações (notas, avaliações, observações)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Ex.: Prova 1: 8,5 · Trabalho final entregue dia 20/11..."
            className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none resize-none"
          />
        </div>
        {error && <p className="text-xs text-drop bg-drop/10 rounded-lg px-3 py-2.5">{error}</p>}
        <Button onClick={handleSubmit} disabled={saving || !name.trim()} className="w-full">
          {saving ? "Salvando..." : "Salvar disciplina"}
        </Button>
      </div>
    </ModalWrap>
  );
}

function CourseBlock({
  course,
  expanded,
  onToggle,
  onRemove,
}: {
  course: Course;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { subjects, createSubject, updateSubject, removeSubject } = useSubjects(course.id);
  const [subjectName, setSubjectName] = useState("");
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const handleAddSubject = async () => {
    if (!subjectName.trim()) return;
    await createSubject({ name: subjectName.trim() });
    setSubjectName("");
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="flex items-center gap-2 text-sm font-semibold">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {course.name}
          {course.semester && <span className="text-xs text-slate font-normal">· {course.semester}</span>}
        </button>
        <button onClick={onRemove} className="text-slate">
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg p-2.5 border border-paper-border dark:border-ink-border">
              <button className="min-w-0 text-left" onClick={() => setEditingSubject(s)}>
                <p className="text-sm">{s.name}</p>
                <p className="text-xs text-slate">
                  {[s.professor, s.workload_hours ? `${s.workload_hours}h` : null].filter(Boolean).join(" · ") || "Toque para editar"}
                </p>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={s.status}
                  onChange={(e) => updateSubject({ id: s.id, patch: { status: e.target.value } })}
                  className="text-xs rounded-lg px-2 py-1.5 bg-transparent border border-paper-border dark:border-ink-border"
                >
                  {SUBJECT_STATUS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button onClick={() => setEditingSubject(s)} aria-label={`Editar ${s.name}`} className="text-slate">
                  <Pencil size={13} />
                </button>
                <button onClick={() => removeSubject(s.id)} className="text-slate">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Field label="" placeholder="Nova disciplina..." value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            <Button variant="secondary" onClick={handleAddSubject} className="self-end">
              <Plus size={14} />
            </Button>
          </div>
        </div>
      )}

      {editingSubject && (
        <SubjectEditModal
          subject={editingSubject}
          onClose={() => setEditingSubject(null)}
          onSave={(patch) => updateSubject({ id: editingSubject.id, patch })}
        />
      )}
    </Card>
  );
}
