import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Flag,
  FolderKanban,
  Gauge,
  Gift,
  Hammer,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Settings2,
  Sparkles,
  Swords,
  Target,
  Trash2,
  User,
  Wand2,
  X,
} from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { useMissionAdvisor } from "@/hooks/useMissions3";
import { useProjects } from "@/hooks/useProjects";
import { useGoals } from "@/hooks/useGoals";
import { useContracts } from "@/hooks/useContracts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { ApiError } from "@/services/api";
import { DETAIL_LABEL, DIFFICULTY_LABEL, LINK_LABEL, MODE_LABEL, fmtMin, type AdvisorMode, type AdvisorResult, type DetailLevel, type LinkType, type MissionProposal } from "@/services/missions3Service";
import type { Task } from "@/types";

const ART = "/assets/rpg/modules/missions3";
const R = { borderRadius: 4 };
const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-purple";
const MODES: Array<[AdvisorMode, ReactNode]> = [
  ["create", <Sparkles key="i" size={14} />],
  ["improve", <Wand2 key="i" size={14} />],
  ["sequence", <ListChecks key="i" size={14} />],
  ["breakdown", <Hammer key="i" size={14} />],
];
const REFINE = ["Deixe a descrição mais técnica", "Divida em cinco etapas", "Reduza o prazo", "Aumente a prioridade", "Quero apenas uma tarefa simples", "Transforme em uma missão recorrente"];
const PLACEHOLDER: Record<AdvisorMode, string> = {
  create: "Ex.: Quero estudar 2 horas de Machine Learning hoje para avançar no meu plano de carreira em dados.",
  improve: "Ex.: Deixe a descrição profissional e com critérios de conclusão.",
  sequence: "Ex.: Preparar a apresentação do artigo para o congresso até o fim do mês.",
  breakdown: "Ex.: Divida em etapas de no máximo 1 hora.",
};
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) : "Sem prazo");
const errText = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);

export interface AdvisorSeed {
  message: string;
  mode?: AdvisorMode;
  taskId?: string | null;
  source?: "missions" | "review";
  sourceRef?: string | null;
  /** Quando true, já envia o pedido ao abrir (ex.: “Transformar em missão” nas Revisões). */
  autoSend?: boolean;
}

type Msg = { role: "user" | "assistant"; text: string; ai?: AdvisorResult["ai"] };

/* ═════════════ Cartão da proposta ═════════════ */

function LinkSlot({ type, link, editing, options, onChange }: { type: LinkType; link: MissionProposal["links"][LinkType]; editing: boolean; options: Array<{ id: string; title: string }>; onChange: (id: string | null, title: string | null) => void }) {
  const icon = { project: <FolderKanban size={16} />, goal: <Target size={16} />, contract: <ScrollText size={16} />, campaign: <Flag size={16} /> }[type];
  return (
    <div className={clsx("flex min-w-0 items-start gap-2 border p-2", link.id ? "border-rpg-green/50 bg-rpg-green/5" : "border-rpg-border bg-rpg-bg-2/60")} style={R}>
      <span className={clsx("mt-0.5 shrink-0", link.id ? "text-rpg-gold" : "text-rpg-muted")} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-rpg-muted">{LINK_LABEL[type]}</p>
        {editing ? (
          <select
            aria-label={`${LINK_LABEL[type]} vinculado`}
            value={link.id ?? ""}
            onChange={(e) => onChange(e.target.value || null, options.find((o) => o.id === e.target.value)?.title ?? null)}
            className={clsx(FIELD, "mt-0.5 py-1 text-xs")}
            style={{ borderRadius: 3 }}
          >
            <option value="">Sem vínculo</option>
            {link.alternatives.length > 0 && (
              <optgroup label="Sugestões do conselheiro">
                {link.alternatives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} · aderência {Math.round(a.score * 100)}%
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Todos os seus">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </optgroup>
          </select>
        ) : (
          <p className={clsx("flex items-center gap-1 truncate text-sm", link.id ? "text-rpg-text" : "text-rpg-muted")} title={link.reason}>
            <span className="truncate">{link.title ?? "Sem vínculo"}</span>
            {link.id && <CheckCircle2 size={13} className="shrink-0 text-rpg-green" aria-label="vínculo sugerido" />}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, children, tone = "text-rpg-text" }: { icon: ReactNode; label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
      <span className="mt-0.5 shrink-0 text-rpg-gold" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-rpg-muted">{label}</p>
        <div className={clsx("truncate text-sm font-semibold", tone)}>{children}</div>
      </div>
    </div>
  );
}

function ProposalCard({
  p,
  index,
  total,
  editing,
  onChange,
  onRecalc,
  recalcBusy,
  entities,
  wide,
}: {
  wide: boolean;
  p: MissionProposal;
  index: number;
  total: number;
  editing: boolean;
  onChange: (next: MissionProposal, field: string) => void;
  onRecalc: () => void;
  recalcBusy: boolean;
  entities: Record<LinkType, Array<{ id: string; title: string }>>;
}) {
  const [why, setWhy] = useState(index === 0);
  const [details, setDetails] = useState(false);
  const set = <K extends keyof MissionProposal>(k: K, v: MissionProposal[K]) => onChange({ ...p, [k]: v }, String(k));
  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const prioTone = p.priority === "Alta" ? "text-rpg-red" : p.priority === "Média" ? "text-rpg-orange" : "text-rpg-green";
  return (
    <article className="rpg-panel rpg-panel-gold space-y-3 p-3" aria-label={`Proposta: ${p.title}`}>
      <header className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg text-rpg-gold" style={R} aria-hidden>
          <BookOpen size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {total > 1 && <p className="text-[11px] text-rpg-muted">Missão {index + 1} de {total}{p.dependsOn != null && ` · depende da missão ${p.dependsOn + 1}`}</p>}
          {editing ? (
            <input aria-label="Título da missão" value={p.title} maxLength={200} onChange={(e) => set("title", e.target.value)} className={clsx(FIELD, "font-semibold")} style={{ borderRadius: 3 }} />
          ) : (
            <h3 className="font-rpg text-lg font-bold leading-snug text-rpg-text">{p.title}</h3>
          )}
        </div>
        <span className="shrink-0 border border-rpg-green/60 bg-rpg-green/10 px-1.5 py-0.5 text-[10px] font-bold text-rpg-green" style={{ borderRadius: 3 }}>
          <Check size={11} className="mr-0.5 inline" aria-hidden />
          Sugerida
        </span>
      </header>

      {editing ? (
        <div className={clsx("grid gap-2", wide && "sm:grid-cols-2")}>
          {(["objective", "context", "scope", "deliverable"] as const).map((k) => (
            <label key={k} className="text-[11px] text-rpg-muted">
              {{ objective: "Objetivo", context: "Contexto", scope: "Escopo", deliverable: "Entregável" }[k]}
              <textarea rows={2} value={p[k]} maxLength={900} onChange={(e) => set(k, e.target.value)} className={clsx(FIELD, "mt-0.5 text-xs")} style={{ borderRadius: 3 }} />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-rpg-text/90">
          {p.objective}
          {p.context && <span className="block text-xs text-rpg-muted">{p.context}</span>}
        </p>
      )}

      <div className={clsx("grid gap-2", wide && "sm:grid-cols-3")}>
        {(["project", "goal", "contract"] as LinkType[]).map((t) => (
          <LinkSlot key={t} type={t} link={p.links[t]} editing={editing} options={entities[t]} onChange={(id, title) => onChange({ ...p, links: { ...p.links, [t]: { ...p.links[t], id, title, reason: id ? "Escolhido por você." : "Sem vínculo." } } }, `links.${t}`)} />
        ))}
      </div>
      {(p.links.campaign.id || editing) && (
        <LinkSlot type="campaign" link={p.links.campaign} editing={editing} options={entities.campaign} onChange={(id, title) => onChange({ ...p, links: { ...p.links, campaign: { ...p.links.campaign, id, title, reason: id ? "Escolhida por você." : "Sem vínculo." } } }, "links.campaign")} />
      )}

      <div className={clsx("grid grid-cols-2 gap-2", wide && "md:grid-cols-4")}>
        <Stat icon={<Flag size={15} />} label="Prioridade" tone={prioTone}>
          {editing ? (
            <select aria-label="Prioridade" value={p.priority} onChange={(e) => set("priority", e.target.value as MissionProposal["priority"])} className={clsx(FIELD, "py-0.5 text-xs")} style={{ borderRadius: 3 }}>
              {["Alta", "Média", "Baixa"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          ) : (
            p.priority
          )}
        </Stat>
        <Stat icon={<Gauge size={15} />} label="Dificuldade">
          {editing ? (
            <select aria-label="Dificuldade" value={p.difficulty} onChange={(e) => set("difficulty", e.target.value as MissionProposal["difficulty"])} className={clsx(FIELD, "py-0.5 text-xs")} style={{ borderRadius: 3 }}>
              {Object.entries(DIFFICULTY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            DIFFICULTY_LABEL[p.difficulty]
          )}
        </Stat>
        <Stat icon={<Clock size={15} />} label={p.schedule.hypothesis ? "Esforço (hipótese)" : "Esforço estimado"}>
          {editing ? <input aria-label="Esforço em minutos" type="number" min={5} max={2400} step={5} value={p.estimateMinutes} onChange={(e) => set("estimateMinutes", Math.max(5, Number(e.target.value) || 5))} className={clsx(FIELD, "py-0.5 text-xs")} style={{ borderRadius: 3 }} /> : fmtMin(p.estimateMinutes)}
        </Stat>
        <Stat icon={<CalendarClock size={15} />} label="Prazo sugerido">
          {editing ? <input aria-label="Prazo" type="date" value={p.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} className={clsx(FIELD, "py-0.5 text-xs")} style={{ borderRadius: 3 }} /> : fmtDay(p.dueDate)}
        </Stat>
      </div>
      {editing && (
        <div className={clsx("grid grid-cols-2 gap-2", wide && "sm:grid-cols-3")}>
          <label className="text-[11px] text-rpg-muted">
            Início
            <input type="date" value={p.startDate} onChange={(e) => set("startDate", e.target.value)} className={clsx(FIELD, "mt-0.5 text-xs")} style={{ borderRadius: 3 }} />
          </label>
          <label className="text-[11px] text-rpg-muted">
            Coluna inicial
            <select value={p.status} onChange={(e) => set("status", e.target.value as MissionProposal["status"])} className={clsx(FIELD, "mt-0.5 text-xs")} style={{ borderRadius: 3 }}>
              <option value="Backlog">Backlog</option>
              <option value="A Fazer">Em Planejamento</option>
            </select>
          </label>
          <label className="text-[11px] text-rpg-muted">
            Recorrência
            <select value={p.recurrence} onChange={(e) => set("recurrence", e.target.value as MissionProposal["recurrence"])} className={clsx(FIELD, "mt-0.5 text-xs")} style={{ borderRadius: 3 }}>
              <option value="none">Não repete</option>
              <option value="daily">Todo dia</option>
              <option value="weekly">Toda semana</option>
              <option value="monthly">Todo mês</option>
            </select>
          </label>
        </div>
      )}

      {/* Agenda: blocos livres, conflitos e alternativas (nada é reservado sem aprovação) */}
      {(p.schedule.blocks.length > 0 || p.schedule.conflicts.length > 0) && (
        <div className={clsx("border p-2 text-xs", p.schedule.feasible ? "border-rpg-blue/50 bg-rpg-blue/5" : "border-rpg-red/60 bg-rpg-red/10")} style={R}>
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-rpg-text">
            {p.schedule.feasible ? <CalendarClock size={14} className="text-rpg-blue" aria-hidden /> : <AlertTriangle size={14} className="text-rpg-red" aria-hidden />}
            {p.schedule.feasible ? "Cabe na sua agenda" : "Conflito de capacidade"}
            {p.schedule.hypothesis && <span className="font-normal text-rpg-muted">· estimativa editável</span>}
          </p>
          {p.schedule.blocks.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {p.schedule.blocks.slice(0, 6).map((b) => (
                <li key={`${b.date}-${b.start}`} className="border border-rpg-border bg-rpg-bg px-1.5 py-0.5 tabular-nums text-rpg-text" style={{ borderRadius: 3 }}>
                  {fmtDay(b.date)} {b.start}–{b.end}
                </li>
              ))}
            </ul>
          )}
          {p.schedule.conflicts.map((c) => (
            <p key={c} className="mt-1 text-rpg-text/90">
              {c}
            </p>
          ))}
          {p.schedule.alternatives.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.schedule.alternatives.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="border border-rpg-gold/60 px-1.5 py-0.5 text-rpg-gold-light hover:bg-rpg-gold/10"
                  style={{ borderRadius: 3 }}
                  onClick={() => onChange({ ...p, ...(a.dueDate ? { dueDate: a.dueDate } : {}), ...(a.estimateMinutes ? { estimateMinutes: a.estimateMinutes } : {}) }, a.dueDate ? "dueDate" : "estimateMinutes")}
                  disabled={!a.dueDate && !a.estimateMinutes}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(p.subtasks.length > 0 || editing) && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
            <ListChecks size={14} className="text-rpg-purple" aria-hidden /> Etapas ({p.subtasks.length})
          </p>
          <ol className="space-y-1">
            {p.subtasks.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-rpg-purple/60 text-[10px] text-rpg-purple" style={{ borderRadius: 3 }}>
                  {i + 1}
                </span>
                {editing ? (
                  <>
                    <input aria-label={`Etapa ${i + 1}`} value={s.title} onChange={(e) => set("subtasks", p.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={clsx(FIELD, "py-0.5 text-xs")} style={{ borderRadius: 3 }} />
                    <input aria-label={`Minutos da etapa ${i + 1}`} type="number" min={1} max={960} value={s.estimateMinutes ?? ""} placeholder="min" onChange={(e) => set("subtasks", p.subtasks.map((x, j) => (j === i ? { ...x, estimateMinutes: e.target.value ? Number(e.target.value) : null } : x)))} className={clsx(FIELD, "w-16 py-0.5 text-xs")} style={{ borderRadius: 3 }} />
                    <button type="button" aria-label={`Remover etapa ${i + 1}`} className="text-rpg-red" onClick={() => set("subtasks", p.subtasks.filter((_, j) => j !== i).map((x) => ({ ...x, dependsOn: x.dependsOn != null && x.dependsOn >= i ? null : x.dependsOn })))}>
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-rpg-text/90">
                    {s.title}
                    {s.estimateMinutes ? <span className="text-rpg-muted"> · {fmtMin(s.estimateMinutes)}</span> : null}
                    {s.dependsOn != null && <span className="text-rpg-muted"> · após a etapa {s.dependsOn + 1}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {editing && (
            <button type="button" className="mt-1 flex items-center gap-1 text-xs text-rpg-gold-light hover:underline" onClick={() => set("subtasks", [...p.subtasks, { title: "Nova etapa", description: null, estimateMinutes: null, dependsOn: null, dueDate: null }])}>
              <Plus size={13} aria-hidden /> Adicionar etapa
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-rpg-gold/40 bg-rpg-gold/5 px-3 py-2" style={R} title={p.reward.basis}>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-rpg-gold-light">
          <Gift size={15} aria-hidden /> Recompensa (estimada)
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-rpg-purple">
          <Sparkles size={14} aria-hidden /> +{p.reward.xp} XP
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-rpg-gold">
          <Coins size={14} aria-hidden /> +{p.reward.coins} moedas
        </span>
        {p.reward.bonuses.length > 0 && <span className="text-[11px] text-rpg-muted">{p.reward.bonuses.join(" · ")}</span>}
      </div>

      <section className="border border-rpg-border" style={R}>
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-rpg-gold-light" aria-expanded={why} onClick={() => setWhy((v) => !v)}>
          <Target size={15} aria-hidden /> Por que essa missão?
          <ChevronDown size={15} className={clsx("ml-auto transition-transform", why && "rotate-180")} aria-hidden />
        </button>
        {why && (
          <ul className="space-y-1 px-3 pb-2.5">
            {p.justification.map((j) => (
              <li key={j.field + j.text} className="flex gap-2 text-xs text-rpg-text/90">
                <CheckCircle2 size={14} className="mt-px shrink-0 text-rpg-green" aria-hidden />
                <span>
                  <b>{j.field}:</b> {j.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-rpg-border" style={R}>
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-rpg-text" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
          <ScrollText size={15} className="text-rpg-purple" aria-hidden /> Passos e critérios de conclusão
          <ChevronDown size={15} className={clsx("ml-auto transition-transform", details && "rotate-180")} aria-hidden />
        </button>
        {details && (
          <div className={clsx("grid gap-3 px-3 pb-3", wide && "sm:grid-cols-2")}>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-rpg-muted">Passos de execução</p>
              {editing ? (
                <textarea rows={5} value={p.steps.join("\n")} onChange={(e) => set("steps", lines(e.target.value).slice(0, 12))} className={clsx(FIELD, "text-xs")} style={{ borderRadius: 3 }} aria-label="Passos, um por linha" />
              ) : (
                <ol className="list-decimal space-y-0.5 pl-4 text-xs text-rpg-text/90">
                  {p.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-rpg-muted">Critérios de conclusão</p>
              {editing ? (
                <textarea rows={5} value={p.acceptanceCriteria.join("\n")} onChange={(e) => set("acceptanceCriteria", lines(e.target.value).slice(0, 10))} className={clsx(FIELD, "text-xs")} style={{ borderRadius: 3 }} aria-label="Critérios, um por linha" />
              ) : (
                <ul className="space-y-0.5 text-xs text-rpg-text/90">
                  {p.acceptanceCriteria.map((c) => (
                    <li key={c} className="flex gap-1.5">
                      <Check size={12} className="mt-0.5 shrink-0 text-rpg-green" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
      {editing && (
        <RPGButton variant="secondary" className="w-full" disabled={recalcBusy} onClick={onRecalc}>
          {recalcBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Recalcular prazo e recompensa
        </RPGButton>
      )}
    </article>
  );
}

/* ═════════════ Painel do Conselheiro ═════════════ */

export function MissionAdvisor({
  tasks,
  seed,
  layout = "panel",
  expanded = false,
  onToggleExpand,
  onClose,
  onCreated,
  onOpenSettings,
  notify,
}: {
  tasks: Task[];
  seed?: AdvisorSeed | null;
  layout?: "panel" | "drawer";
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
  onCreated?: (taskIds: string[]) => void;
  onOpenSettings?: () => void;
  notify: (m: string, tone?: "success" | "error") => void;
}) {
  const a = useMissionAdvisor();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { contracts } = useContracts();
  const { campaigns } = useCampaigns();
  const entities = useMemo(
    () => ({
      project: projects.filter((p) => !p.archived_at && p.status !== "completed" && p.status !== "cancelled").map((p) => ({ id: p.id, title: p.name })),
      goal: goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title })),
      contract: contracts.filter((c) => c.status === "ativo").map((c) => ({ id: c.id, title: c.title })),
      campaign: campaigns.filter((c) => c.status === "active" || c.status === "planned").map((c) => ({ id: c.id, title: c.title })),
    }),
    [projects, goals, contracts, campaigns],
  );
  const [mode, setMode] = useState<AdvisorMode>("create");
  const [detail, setDetail] = useState<DetailLevel>("padrao");
  const [taskId, setTaskId] = useState<string>("");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [items, setItems] = useState<MissionProposal[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [reserve, setReserve] = useState(false);
  const [source, setSource] = useState<{ source: "missions" | "review"; ref: string | null }>({ source: "missions", ref: null });
  const listRef = useRef<HTMLDivElement>(null);
  const openTasks = tasks.filter((t) => t.status !== "Concluído");

  const reset = () => {
    setMsgs([]);
    setResult(null);
    setItems([]);
    setConfirmed([]);
    setEditing(false);
    setReserve(false);
  };

  const send = (message: string, opts: { refine?: boolean; modeOverride?: AdvisorMode; taskOverride?: string } = {}) => {
    const m = opts.modeOverride ?? mode;
    const tid = opts.taskOverride ?? taskId;
    if (message.trim().length < 2) return;
    if ((m === "improve" || m === "breakdown") && !tid) {
      notify("Escolha a missão primeiro.", "error");
      return;
    }
    setMsgs((x) => [...x, { role: "user", text: message }]);
    setText("");
    a.propose.mutate(
      { mode: m, message, detail, sessionId: opts.refine ? result?.sessionId : null, taskId: tid || null, current: opts.refine ? items : null, confirmed: opts.refine ? confirmed : [], source: source.source, sourceRef: source.ref },
      {
        onSuccess: (r) => {
          setResult(r);
          setItems(r.items);
          setEditing(false);
          setMsgs((x) => [...x, { role: "assistant", text: r.message, ai: r.ai }]);
          requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
        },
        onError: (e) => {
          setMsgs((x) => [...x, { role: "assistant", text: errText(e, "Não consegui montar a proposta agora. Tente de novo.") }]);
        },
      },
    );
  };

  // Abertura a partir de outro módulo (Revisões, botão do cartão): aplica o contexto e, se pedido, envia.
  useEffect(() => {
    if (!seed) return;
    reset();
    const m = seed.mode ?? "create";
    setMode(m);
    if (seed.taskId) setTaskId(seed.taskId);
    setSource({ source: seed.source ?? "missions", ref: seed.sourceRef ?? null });
    setText(seed.message);
    if (seed.autoSend) send(seed.message, { modeOverride: m, taskOverride: seed.taskId ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const change = (i: number, next: MissionProposal, field: string) => {
    setItems((list) => list.map((x, j) => (j === i ? next : x)));
    setConfirmed((c) => (c.includes(field) ? c : [...c, field]));
  };
  const recalc = (i: number) =>
    a.recalc.mutate(items[i]!, {
      onSuccess: (p) => setItems((list) => list.map((x, j) => (j === i ? p : x))),
      onError: (e) => notify(errText(e, "Não foi possível recalcular."), "error"),
    });
  const create = () => {
    if (!result) return;
    a.apply.mutate(
      { sessionId: result.sessionId, mode: result.mode, items, targetTaskId: result.targetTaskId, reserveBlocks: reserve },
      {
        onSuccess: (r) => {
          const n = r.taskIds.length;
          notify(r.duplicated ? "Essa proposta já tinha sido aplicada." : result.mode === "breakdown" ? "Etapas adicionadas à missão." : result.mode === "improve" ? "Missão atualizada." : `${n} missão(ões) criada(s)${r.eventsCreated ? ` e ${r.eventsCreated} bloco(s) na Agenda` : ""}.`);
          onCreated?.(r.taskIds);
          reset();
        },
        onError: (e) => notify(errText(e, "Não foi possível criar a missão."), "error"),
      },
    );
  };
  const cancel = () => {
    if (result) a.discard.mutate(result.sessionId);
    reset();
  };

  const busy = a.propose.isPending;
  const hasBlocks = items.some((p) => p.schedule.blocks.length > 0);
  const lastAi = [...msgs].reverse().find((m) => m.ai)?.ai;
  const shell = (
    <section className={clsx("rpg-panel rpg-panel-legendary flex min-h-0 flex-col", layout === "drawer" ? "h-full" : "max-h-[calc(100vh-7rem)]")} aria-label="Conselheiro de Missões">
      <header className="relative flex shrink-0 items-start gap-3 overflow-hidden border-b border-rpg-border/70 p-3">
        <img src={`${ART}/advisor-mage.webp`} alt="" aria-hidden className="pixelated h-20 w-auto shrink-0 drop-shadow-[0_0_12px_rgb(var(--rpg-purple)/0.6)]" />
        <div className="min-w-0 flex-1">
          <h2 className="rpg-title flex flex-wrap items-center gap-x-2 gap-y-1 text-[1.05rem] font-bold leading-tight">
            Conselheiro de Missões
            <span className={clsx("border px-1.5 py-0.5 font-sans text-[10px] font-bold", lastAi?.used ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }} title={lastAi?.detail}>
              {lastAi ? (lastAi.used ? "IA" : "Regras locais") : "IA"}
            </span>
          </h2>
          <p className="text-xs text-rpg-text/85">Descreva o que você quer fazer e eu monto uma missão completa, ligada aos seus projetos, metas e contratos. Nada é criado sem a sua aprovação.</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {onToggleExpand && (
            <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-text" aria-label={expanded ? "Recolher conselheiro" : "Expandir conselheiro"} onClick={onToggleExpand}>
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          {onOpenSettings && (
            <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-text" aria-label="Automações do conselheiro" onClick={onOpenSettings}>
              <Settings2 size={16} />
            </button>
          )}
          {onClose && (
            <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-text" aria-label="Fechar conselheiro" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Modo do conselheiro" className="grid shrink-0 grid-cols-2 gap-1 border-b border-rpg-border/70 p-2 sm:grid-cols-4">
        {MODES.map(([m, icon]) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              reset();
            }}
            className={clsx("flex min-h-[38px] items-center justify-center gap-1.5 border-2 px-2 text-xs font-semibold", mode === m ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-text")}
            style={R}
          >
            {icon} {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {(mode === "improve" || mode === "breakdown") && (
          <label className="block text-xs text-rpg-muted">
            Missão
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }}>
              <option value="">Escolha uma missão aberta…</option>
              {openTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!msgs.length && (
          <div className="flex gap-2 border border-dashed border-rpg-border p-3 text-xs text-rpg-muted" style={R}>
            <Swords size={16} className="shrink-0 text-rpg-gold" aria-hidden />
            <p>
              {mode === "create" && "Conte o objetivo como falaria com alguém. O conselheiro busca os vínculos certos, estima esforço, sugere prazo pela sua agenda e calcula a recompensa oficial."}
              {mode === "improve" && "Escolha uma missão: o conselheiro reescreve título, descrição, critérios e vínculos. Você revisa antes de salvar."}
              {mode === "sequence" && "Descreva um objetivo maior: o conselheiro propõe várias missões encadeadas, com dependências."}
              {mode === "breakdown" && "Escolha uma missão grande: o conselheiro sugere etapas com estimativa e ordem. Etapas não geram XP extra."}
            </p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={clsx("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", m.role === "user" ? "border-rpg-border text-rpg-muted" : "border-rpg-purple text-rpg-purple")} aria-hidden>
              {m.role === "user" ? <User size={15} /> : <Sparkles size={15} />}
            </span>
            <div className={clsx("max-w-[85%] border px-3 py-2 text-sm", m.role === "user" ? "border-rpg-purple/60 bg-rpg-purple/20 text-rpg-text" : "border-rpg-border bg-rpg-bg-2/70 text-rpg-text")} style={R}>
              {m.text}
              {m.ai && <p className="mt-1 text-[10px] text-rpg-muted">{m.ai.detail}</p>}
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-rpg-muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Consultando seus projetos, metas, contratos e agenda…
          </p>
        )}
        {items.map((p, i) => (
          <ProposalCard key={i} p={p} index={i} total={items.length} editing={editing} onChange={(n, f) => change(i, n, f)} onRecalc={() => recalc(i)} recalcBusy={a.recalc.isPending} entities={entities} wide={expanded} />
        ))}
        {items.length > 0 && result && (
          <div className="flex flex-wrap gap-1.5" aria-label="Ajustes rápidos">
            {REFINE.map((r) => (
              <button key={r} type="button" disabled={busy} onClick={() => send(r, { refine: true })} className="border border-rpg-border bg-rpg-bg-2/70 px-2 py-1 text-[11px] text-rpg-text/90 hover:border-rpg-purple" style={{ borderRadius: 999 }}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && result ? (
        <footer className="shrink-0 space-y-2 border-t border-rpg-border/70 p-3">
          {hasBlocks && (result.mode === "create" || result.mode === "sequence") && (
            <label className="flex items-center gap-2 text-xs text-rpg-text/90">
              <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} /> Reservar os blocos sugeridos na Agenda
            </label>
          )}
          <div className={clsx("grid grid-cols-2 gap-2", expanded && "sm:grid-cols-4")}>
            <RPGButton variant="secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil size={14} aria-hidden /> {editing ? "Concluir edição" : "Editar detalhes"}
            </RPGButton>
            <RPGButton variant="secondary" disabled={busy} onClick={() => send("Gere outra opção diferente desta, mantendo o mesmo objetivo.", { refine: true })}>
              <RefreshCw size={14} aria-hidden /> Outra opção
            </RPGButton>
            <RPGButton variant="ghost" onClick={cancel}>
              <X size={14} aria-hidden /> Cancelar
            </RPGButton>
            <RPGButton variant="primary" disabled={a.apply.isPending || items.some((p) => !p.title.trim())} onClick={create}>
              {a.apply.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
              {result.mode === "improve" ? "Salvar melhoria" : result.mode === "breakdown" ? "Adicionar etapas" : items.length > 1 ? `Criar ${items.length} missões` : "Criar missão"}
            </RPGButton>
          </div>
        </footer>
      ) : null}

      <div className="shrink-0 border-t border-rpg-border/70 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-rpg-muted" role="group" aria-label="Nível de detalhe">
          Detalhe:
          {(Object.keys(DETAIL_LABEL) as DetailLevel[]).map((d) => (
            <button key={d} type="button" aria-pressed={detail === d} onClick={() => setDetail(d)} className={clsx("border px-2 py-0.5", detail === d ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : "border-rpg-border")} style={{ borderRadius: 999 }}>
              {DETAIL_LABEL[d]}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text, { refine: !!result && items.length > 0 });
          }}
        >
          <textarea
            value={text}
            rows={2}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text, { refine: !!result && items.length > 0 });
              }
            }}
            placeholder={items.length ? "Peça um ajuste: “associe ao meu mestrado”, “reduza o prazo”…" : PLACEHOLDER[mode]}
            aria-label="Mensagem para o conselheiro"
            className={clsx(FIELD, "min-h-[52px] flex-1 resize-none")}
            style={{ borderRadius: 4 }}
          />
          <RPGButton type="submit" variant="primary" className="!px-3" disabled={busy || text.trim().length < 2} aria-label="Enviar ao conselheiro">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </RPGButton>
        </form>
      </div>
    </section>
  );
  if (layout === "drawer") {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Conselheiro de Missões" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
        <div className="h-full w-full max-w-xl">{shell}</div>
      </div>
    );
  }
  return shell;
}
