import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGButton } from "@/components/rpg";
import { useSkillActions, useSkillLinks } from "@/hooks/usePersonalSkills";
import {
  DOMAINS,
  DOMAIN_LABEL,
  LINK_LABEL,
  PROOF_LABEL,
  type BranchNode,
  type BranchProposal,
  type LinkKind,
  type PersonalSkill,
  type ProofKind,
  type SkillDomain,
  type SkillTreeView,
} from "@/services/personalSkillsService";
import { DOMAIN_TEXT, FIELD, SKILL_ICONS, errMsg, skillIcon, type Notify } from "./skillShared";

const DEFAULT_TITLES = ["Iniciante", "Básico", "Intermediário", "Avançado", "Especialista", "Mestre", "Grão-mestre", "Referência", "Lenda", "Lenda viva"];
const blankLevels = (n: number, from: Array<{ title: string; criteria: string }> = []) =>
  Array.from({ length: n }, (_, i) => ({ title: from[i]?.title ?? DEFAULT_TITLES[i] ?? `Nível ${i + 1}`, criteria: from[i]?.criteria ?? "" }));

/* ───────────────────────── criar / editar ───────────────────────── */

export function SkillEditor({
  open,
  view,
  skill,
  domain: initialDomain,
  parentId,
  onClose,
  onSaved,
  notify,
}: {
  open: boolean;
  view: SkillTreeView;
  skill: PersonalSkill | null;
  domain: SkillDomain;
  parentId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  notify: Notify;
}) {
  const act = useSkillActions();
  const links = useSkillLinks(open);
  const parent = parentId ? view.skills.find((s) => s.id === parentId) ?? null : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState<SkillDomain>(initialDomain);
  const [icon, setIcon] = useState("sparkles");
  const [maxLevel, setMaxLevel] = useState(5);
  const [levels, setLevels] = useState(blankLevels(5));
  const [proofMode, setProofMode] = useState<ProofKind>("quiz");
  const [linkKind, setLinkKind] = useState<LinkKind | "">("");
  const [linkRef, setLinkRef] = useState("");
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? "");
    setDescription(skill?.description ?? "");
    setDomain(skill?.domain ?? parent?.domain ?? initialDomain);
    setIcon(skill?.icon ?? "sparkles");
    setMaxLevel(skill?.maxLevel ?? 5);
    setLevels(blankLevels(skill?.maxLevel ?? 5, skill?.levels));
    setProofMode(skill?.proofMode ?? "quiz");
    setLinkKind(skill?.linkKind ?? "");
    setLinkRef(skill?.linkRef ?? "");
    setMinutes(skill?.practiceMinutesPerLevel ? String(skill.practiceMinutesPerLevel) : "");
  }, [open, skill, parent, initialDomain]);

  const resize = (n: number) => {
    setMaxLevel(n);
    setLevels((l) => blankLevels(n, l));
  };
  const suggest = () =>
    act.suggestLevels.mutate(
      { name: name.trim(), description: description.trim() || null, domain, maxLevel, path: [...(parent?.path ?? []), name.trim()] },
      { onSuccess: (r) => (setLevels(blankLevels(maxLevel, r.levels)), notify("Critérios sugeridos pela IA — revise antes de salvar.")), onError: (e) => notify(errMsg(e, "A IA não respondeu."), "error") },
    );
  const minLevel = skill?.level ?? 0;
  const save = () => {
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      maxLevel,
      // Critério vazio = o servidor usa o texto padrão daquele nível.
      levels: levels.map((l) => ({ title: l.title.trim(), criteria: l.criteria.trim() })),
      proofMode,
      linkKind: linkKind || null,
      linkRef: linkKind ? linkRef || null : null,
      practiceMinutesPerLevel: linkKind && minutes ? Number(minutes) : null,
    };
    if (skill)
      act.update.mutate(
        { id: skill.id, patch: { ...payload, ...(skill.parentId ? {} : { domain }) } },
        { onSuccess: (r) => (notify("Habilidade atualizada."), onSaved(r.id)), onError: (e) => notify(errMsg(e, "Não consegui salvar."), "error") },
      );
    else
      act.create.mutate(
        { ...payload, domain, parentId },
        { onSuccess: (r) => (notify(`“${r.name}” plantada na árvore.`), onSaved(r.id)), onError: (e) => notify(errMsg(e, "Não consegui criar."), "error") },
      );
  };
  const pending = act.create.isPending || act.update.isPending;
  const options = linkKind ? links.data?.[linkKind] ?? [] : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={skill ? `Editar ${skill.name}` : parent ? `Nova sub-habilidade de ${parent.name}` : "Nova habilidade"}
      footer={
        <div className="flex justify-end gap-2">
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="primary" onClick={save} disabled={!name.trim() || pending || (!!linkKind && !linkRef)}>
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />} {skill ? "Salvar" : "Criar habilidade"}
          </RPGButton>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-rpg-muted sm:col-span-2">
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={clsx(FIELD, "mt-1")} placeholder="Ex.: pandas, Português para concurso, Muay Thai" autoFocus />
        </label>
        <label className="block text-xs text-rpg-muted sm:col-span-2">
          Descrição (opcional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} rows={2} className={clsx(FIELD, "mt-1")} />
        </label>
        <label className="block text-xs text-rpg-muted">
          Tronco
          <select value={domain} onChange={(e) => setDomain(e.target.value as SkillDomain)} disabled={!!parent || !!skill?.parentId} className={clsx(FIELD, "mt-1")}>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d]}
              </option>
            ))}
          </select>
          {skill && !skill.parentId && skill.childCount > 0 && <span className="mt-0.5 block text-[10.5px]">Mudar o tronco leva as sub-habilidades junto.</span>}
        </label>
        <label className="block text-xs text-rpg-muted">
          Formato padrão da prova
          <select value={proofMode} onChange={(e) => setProofMode(e.target.value as ProofKind)} className={clsx(FIELD, "mt-1")}>
            {(Object.keys(PROOF_LABEL) as ProofKind[]).map((k) => (
              <option key={k} value={k}>
                {PROOF_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-xs text-rpg-muted">Ícone</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.keys(SKILL_ICONS).map((k) => {
              const I = skillIcon(k);
              return (
                <button key={k} type="button" onClick={() => setIcon(k)} aria-label={`Ícone ${k}`} aria-pressed={icon === k} className={clsx("flex h-8 w-8 items-center justify-center border", icon === k ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }}>
                  <I size={15} aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="border border-rpg-border p-2 sm:col-span-2" style={{ borderRadius: 3 }}>
          <legend className="px-1 text-xs text-rpg-gold-light">Prática real (opcional)</legend>
          <p className="mb-2 text-[11px] text-rpg-muted">Vincule a origem dos minutos: treinos de luta/dança, estudos de uma formação/disciplina ou sessões de foco de um projeto. Opcionalmente exija um mínimo por nível antes da prova.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select aria-label="Origem da prática" value={linkKind} onChange={(e) => (setLinkKind(e.target.value as LinkKind | ""), setLinkRef(""))} className={FIELD}>
              <option value="">Sem vínculo</option>
              {(Object.keys(LINK_LABEL) as LinkKind[]).map((k) => (
                <option key={k} value={k}>
                  {LINK_LABEL[k]}
                </option>
              ))}
            </select>
            <select aria-label="Item vinculado" value={linkRef} onChange={(e) => setLinkRef(e.target.value)} disabled={!linkKind} className={FIELD}>
              <option value="">{linkKind ? (options.length ? "Escolha…" : "Nada cadastrado ainda") : "—"}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
              <input type="number" min={0} max={6000} step={30} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={!linkKind} className={clsx(FIELD, "w-24")} aria-label="Minutos de prática por nível" />
              min/nível
            </label>
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-rpg-gold-light">Níveis e critérios</span>
            <label className="flex items-center gap-1 text-xs text-rpg-muted">
              máx.
              <select value={maxLevel} onChange={(e) => resize(Number(e.target.value))} className="border border-rpg-border bg-rpg-bg-2 px-1 py-0.5 text-xs text-rpg-text">
                {Array.from({ length: 10 }, (_, i) => i + 1)
                  .filter((n) => n >= Math.max(1, minLevel))
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" onClick={suggest} disabled={!name.trim() || !view.ai.available || act.suggestLevels.isPending} className="ml-auto flex items-center gap-1 text-xs font-semibold text-rpg-purple hover:underline disabled:opacity-50" title={!view.ai.available ? view.ai.message : undefined}>
              {act.suggestLevels.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Wand2 size={12} aria-hidden />} Sugerir critérios com IA
            </button>
          </div>
          <p className="mb-1.5 text-[10.5px] text-rpg-muted">O critério diz o que você precisa demonstrar — é a base da prova de cada nível. Em branco, usa um critério genérico.</p>
          <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {levels.map((l, i) => (
              <li key={i} className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)]">
                <input aria-label={`Título do nível ${i + 1}`} value={l.title} maxLength={40} onChange={(e) => setLevels((x) => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} className={FIELD} />
                <input aria-label={`Critério do nível ${i + 1}`} value={l.criteria} maxLength={400} placeholder={`O que você demonstra no nível ${i + 1}`} onChange={(e) => setLevels((x) => x.map((y, j) => (j === i ? { ...y, criteria: e.target.value } : y)))} className={FIELD} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── criar galho com IA ───────────────────────── */

type Draft = BranchNode & { key: string; on: boolean; children: Draft[] };
let seq = 0;
const toDraft = (n: BranchNode): Draft => ({ ...n, key: `d${++seq}`, on: true, children: n.children.map(toDraft) });
const fromDraft = (list: Draft[]): BranchNode[] => list.filter((n) => n.on && n.name.trim()).map(({ key: _k, on: _o, children, ...n }) => ({ ...n, name: n.name.trim(), children: fromDraft(children) }));
const countOn = (list: Draft[]): number => list.reduce((a, n) => a + (n.on && n.name.trim() ? 1 + countOn(n.children) : 0), 0);

export function AiBranchModal({
  open,
  view,
  initial,
  onClose,
  onCreated,
  notify,
}: {
  open: boolean;
  view: SkillTreeView;
  initial: { goal?: string; domain?: SkillDomain | null; parentId?: string | null } | null;
  onClose: () => void;
  onCreated: (firstId: string | null) => void;
  notify: Notify;
}) {
  const act = useSkillActions();
  const parent = initial?.parentId ? view.skills.find((s) => s.id === initial.parentId) ?? null : null;
  const [goal, setGoal] = useState("");
  const [domain, setDomain] = useState<SkillDomain | "">("");
  const [proposal, setProposal] = useState<BranchProposal | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);

  useEffect(() => {
    if (!open) return;
    setGoal(initial?.goal ?? (parent ? `Sub-habilidades de ${parent.name}` : ""));
    setDomain(initial?.domain ?? parent?.domain ?? "");
    setProposal(null);
    setDraft([]);
  }, [open, initial, parent]);

  const generate = () =>
    act.planBranch.mutate(
      { goal: goal.trim(), domain: domain || null, parentId: parent?.id ?? null },
      {
        onSuccess: (p) => {
          setProposal(p);
          setDomain(p.domain);
          setDraft(p.nodes.map(toDraft));
        },
        onError: (e) => notify(errMsg(e, "A IA não conseguiu montar o galho."), "error"),
      },
    );
  const total = useMemo(() => countOn(draft), [draft]);
  const confirm = () =>
    act.createBranch.mutate(
      { domain: (domain || proposal!.domain) as SkillDomain, parentId: parent?.id ?? null, source: "ia", nodes: fromDraft(draft) },
      { onSuccess: (r) => (notify(`${r.created} habilidade(s) plantada(s) na árvore.`), onCreated(r.ids[0] ?? null)), onError: (e) => notify(errMsg(e, "Não consegui criar o galho."), "error") },
    );
  const patch = (key: string, fn: (n: Draft) => Draft) => {
    const walk = (list: Draft[]): Draft[] => list.map((n) => (n.key === key ? fn(n) : { ...n, children: walk(n.children) }));
    setDraft((d) => walk(d));
  };

  const renderDraft = (list: Draft[], depth: number) => (
    <ul className={clsx("space-y-1", depth > 0 && "mt-1 border-l border-rpg-border pl-3")}>
      {list.map((n) => {
        const I = skillIcon(n.icon ?? "sparkles");
        return (
          <li key={n.key}>
            <div className={clsx("flex items-center gap-2 border px-2 py-1", n.on ? "border-rpg-border bg-rpg-bg-2/70" : "border-dashed border-rpg-border opacity-50")} style={{ borderRadius: 3 }}>
              <input type="checkbox" checked={n.on} onChange={(e) => patch(n.key, (x) => ({ ...x, on: e.target.checked }))} aria-label={`Incluir ${n.name}`} className="accent-[rgb(var(--rpg-gold))]" />
              <I size={14} className={domain ? DOMAIN_TEXT[domain] : "text-rpg-gold"} aria-hidden />
              <input value={n.name} onChange={(e) => patch(n.key, (x) => ({ ...x, name: e.target.value }))} maxLength={60} aria-label="Nome" className="min-w-0 flex-1 bg-transparent text-sm text-rpg-text outline-none focus:underline" disabled={!n.on} />
              <span className="hidden shrink-0 text-[10.5px] text-rpg-muted sm:inline">{PROOF_LABEL[n.proofMode ?? "quiz"]}</span>
            </div>
            {n.description && n.on && <p className="ml-7 mt-0.5 text-[11px] text-rpg-muted">{n.description}</p>}
            {n.on && n.children.length > 0 && renderDraft(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={parent ? `Galhos com IA para ${parent.name}` : "Criar galho com IA"}
      footer={
        proposal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setProposal(null)}>
              Refazer pedido
            </RPGButton>
            <RPGButton variant="primary" onClick={confirm} disabled={!total || act.createBranch.isPending}>
              {act.createBranch.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />} Criar {total} habilidade(s)
            </RPGButton>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={onClose}>
              Cancelar
            </RPGButton>
            <RPGButton variant="primary" onClick={generate} disabled={goal.trim().length < 3 || act.planBranch.isPending || !view.ai.available}>
              {act.planBranch.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />} {act.planBranch.isPending ? "Montando o galho…" : "Gerar proposta"}
            </RPGButton>
          </div>
        )
      }
    >
      {!proposal ? (
        <div className="space-y-3">
          <label className="block text-xs text-rpg-muted">
            O que você quer aprender ou evoluir?
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={500} className={clsx(FIELD, "mt-1")} placeholder="Ex.: Quero aprender Machine Learning — Python, pandas, scikit-learn" autoFocus />
          </label>
          <label className="block text-xs text-rpg-muted">
            Tronco
            <select value={domain} onChange={(e) => setDomain(e.target.value as SkillDomain | "")} disabled={!!parent} className={clsx(FIELD, "mt-1")}>
              <option value="">A IA escolhe</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-rpg-muted">A IA propõe habilidades, sub-habilidades e critérios de cada nível. Nada é salvo até você revisar e confirmar.</p>
          {!view.ai.available && <p className="text-xs text-rpg-orange">{view.ai.message}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-1.5 border border-rpg-purple/40 bg-rpg-purple/10 p-2 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
            <Sparkles size={13} className="mt-px shrink-0 text-rpg-purple" aria-hidden />
            <span>
              <strong className="text-rpg-purple">Sugestão da IA:</strong> {proposal.summary}
            </span>
          </p>
          <label className="flex items-center gap-2 text-xs text-rpg-muted">
            Tronco
            <select value={domain} onChange={(e) => setDomain(e.target.value as SkillDomain)} disabled={!!parent} className={clsx(FIELD, "w-auto")}>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_LABEL[d]}
                </option>
              ))}
            </select>
            <span className="ml-auto">Desmarque o que não quiser; clique no nome para renomear.</span>
          </label>
          <div className="max-h-[50vh] overflow-y-auto pr-1">{renderDraft(draft, 0)}</div>
        </div>
      )}
    </Modal>
  );
}
