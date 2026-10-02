import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Link2, Plus, Tag, X } from "lucide-react";
import { Button, Field } from "@/components/ui/primitives";
import type { Project, ProjectKind, ProjectLink, ProjectPriority, ProjectStatus } from "@/types";
import type { ProjectCreateInput } from "@/services/projectsService";
import { useGoals } from "@/hooks/useGoals";
import { cycleLabel } from "@/utils/lifeOsLabels";
import { KIND_META, PRIORITY_META, PROJECT_COLORS, STATUS_META } from "./projectMeta";

/**
 * Cadastro completo de projeto (criação e edição). Organizado em seções
 * para não virar um formulário gigante: Essencial → Planejamento →
 * Contexto → Links e etiquetas. Só o nome é obrigatório; progresso e
 * documentos nunca são digitados aqui — vêm das tarefas vinculadas.
 */

const inputClass =
  "w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500 transition-colors";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate mb-2">{title}</legend>
      {children}
    </fieldset>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate">{label}</label>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${inputClass} resize-y`} />
    </div>
  );
}

export function ProjectFormModal({
  project,
  onClose,
  onSubmit,
}: {
  project?: Project | null;
  onClose: () => void;
  onSubmit: (input: ProjectCreateInput) => Promise<unknown>;
}) {
  const isEditing = !!project;
  const [name, setName] = useState(project?.name ?? "");
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? "personal");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [priority, setPriority] = useState<ProjectPriority | "">(project?.priority ?? "");
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [description, setDescription] = useState(project?.description ?? "");
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(project?.due_date?.slice(0, 10) ?? "");
  const [objective, setObjective] = useState(project?.objective ?? "");
  const [goalId, setGoalId] = useState(project?.goal_id ?? "");
  const { goals } = useGoals();
  const activeGoals = goals.filter((g) => g.status === "active" || g.id === project?.goal_id);
  const [scope, setScope] = useState(project?.scope ?? "");
  const [successCriteria, setSuccessCriteria] = useState(project?.success_criteria ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [area, setArea] = useState(project?.area ?? "");
  const [budget, setBudget] = useState(project?.budget != null ? String(project.budget) : "");
  const [repositoryUrl, setRepositoryUrl] = useState(project?.repository_url ?? "");
  const [links, setLinks] = useState<ProjectLink[]>(project?.links ?? []);
  const [tags, setTags] = useState<string[]>(project?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState<ProjectLink>({ label: "", url: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "");
    if (t && !tags.includes(t) && tags.length < 20) setTags([...tags, t]);
    setTagDraft("");
  };

  const addLink = () => {
    const label = linkDraft.label.trim() || linkDraft.url.trim();
    let url = linkDraft.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLinks([...links, { label: label.slice(0, 80), url }]);
    setLinkDraft({ label: "", url: "" });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Informe um nome para o projeto.");
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setError("O prazo não pode ser anterior à data de início.");
      return;
    }
    const budgetNumber = budget.trim() === "" ? null : Number(budget.replace(",", "."));
    if (budgetNumber !== null && (Number.isNaN(budgetNumber) || budgetNumber < 0)) {
      setError("Orçamento inválido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        status,
        priority: priority || null,
        color,
        description: description.trim() || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        objective: objective.trim() || null,
        goalId: goalId || null,
        scope: scope.trim() || null,
        successCriteria: successCriteria.trim() || null,
        client: client.trim() || null,
        area: area.trim() || null,
        budget: budgetNumber,
        repositoryUrl: repositoryUrl.trim() ? (/^https?:\/\//i.test(repositoryUrl.trim()) ? repositoryUrl.trim() : `https://${repositoryUrl.trim()}`) : null,
        links,
        tags,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o projeto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-paper-border dark:border-ink-border">
          <div>
            <p id="project-form-title" className="font-display font-semibold text-lg">{isEditing ? "Editar projeto" : "Novo projeto"}</p>
            <p className="text-xs text-slate">Só o nome é obrigatório — o resto pode ser completado depois.</p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-inherit" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          <Section title="Essencial">
            <Field label="Nome do projeto *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dissertação de mestrado" maxLength={160} autoFocus />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate" htmlFor="pf-kind">Tipo</label>
                <select id="pf-kind" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)} className={inputClass}>
                  {Object.entries(KIND_META).map(([value, meta]) => (
                    <option key={value} value={value}>{meta.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate" htmlFor="pf-status">Status</label>
                <select id="pf-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={inputClass}>
                  {Object.entries(STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>{meta.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate" htmlFor="pf-priority">Prioridade</label>
                <select id="pf-priority" value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority | "")} className={inputClass}>
                  <option value="">Sem prioridade</option>
                  {Object.keys(PRIORITY_META).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            {(kind === "professional" || kind === "workspace") && (
              <p className="text-[11px] text-slate -mt-1">Tarefas de projetos Profissional/Workspace contam na dimensão Profissional do Life Score.</p>
            )}
            <div>
              <span className="text-xs text-slate">Cor</span>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    aria-pressed={color === c}
                    className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-offset-paper-raised dark:ring-offset-ink-raised scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                  />
                ))}
              </div>
            </div>
            <TextArea label="Descrição" value={description} onChange={setDescription} placeholder="Do que se trata este projeto?" />
          </Section>

          <Section title="Planejamento">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Field label="Prazo final" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate" htmlFor="project-goal">
                Serve a qual meta? <span className="text-slate/70">(o “porquê” do projeto)</span>
              </label>
              <select id="project-goal" value={goalId} onChange={(e) => setGoalId(e.target.value)} className={inputClass}>
                <option value="">Nenhuma meta</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {g.cycle ? ` · ${cycleLabel(g.cycle)}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <TextArea label="Objetivo" value={objective} onChange={setObjective} placeholder="Qual resultado este projeto precisa entregar?" rows={2} />
            <TextArea label="Escopo" value={scope} onChange={setScope} placeholder="O que está dentro (e fora) do projeto" />
            <TextArea label="Critérios de sucesso" value={successCriteria} onChange={setSuccessCriteria} placeholder="Como você vai saber que deu certo?" rows={2} />
          </Section>

          <Section title="Contexto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Cliente / stakeholder" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Ex.: Penso, UNESP" maxLength={160} />
              <Field label="Área" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Pesquisa, BI" maxLength={80} />
              <Field label="Orçamento (R$)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0,00" />
            </div>
            <Field label="Repositório" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} placeholder="https://github.com/…" />
          </Section>

          <Section title="Links e etiquetas">
            <div>
              <span className="text-xs text-slate flex items-center gap-1"><Link2 size={12} /> Links úteis</span>
              {links.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {links.map((l, i) => (
                    <li key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-paper dark:bg-ink text-xs">
                      <span className="font-semibold truncate">{l.label}</span>
                      <span className="text-slate truncate flex-1">{l.url}</span>
                      <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Remover link ${l.label}`} className="text-slate hover:text-drop">
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 mt-2">
                <input value={linkDraft.label} onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="Nome (ex.: Figma)" aria-label="Nome do link" className={`${inputClass} !mt-0`} />
                <input
                  value={linkDraft.url}
                  onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
                  placeholder="URL"
                  aria-label="URL do link"
                  className={`${inputClass} !mt-0`}
                />
                <Button type="button" variant="secondary" onClick={addLink} disabled={!linkDraft.url.trim() || links.length >= 20}>
                  <Plus size={14} /> Link
                </Button>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate flex items-center gap-1"><Tag size={12} /> Etiquetas</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-[11px] bg-brand-500/10 text-brand-600 dark:text-brand-100">
                    #{t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remover etiqueta ${t}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  maxLength={40}
                  placeholder="Nova etiqueta + Enter"
                  aria-label="Nova etiqueta"
                  className="flex-1 min-w-[10rem] rounded-full px-3 py-1 text-xs bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </Section>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-paper-border dark:border-ink-border space-y-2">
          {error && <p className="text-xs text-drop bg-drop/10 rounded-lg px-3 py-2.5" role="alert">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
