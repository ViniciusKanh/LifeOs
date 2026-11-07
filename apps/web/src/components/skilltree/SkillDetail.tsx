import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CheckCircle2, Circle, Clock, GitBranchPlus, Hourglass, Loader2, Pencil, ScrollText, Swords, Trash2, Wand2, X } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { useSkillProofs } from "@/hooks/usePersonalSkills";
import { DOMAIN_LABEL, LINK_LABEL, PROOF_LABEL, type PersonalSkill, type ProofKind, type SkillTreeView } from "@/services/personalSkillsService";
import { Chip, DOMAIN_TEXT, DOMAIN_VAR, Segments, fmtDate, fmtMinutes, skillIcon } from "./skillShared";

const LINK_ROUTE: Record<string, string> = { modalidade: "/saude", formacao: "/educacao", disciplina: "/educacao", projeto: "/projetos" };
const STATUS_TONE: Record<string, string> = {
  aprovada: "border-rpg-green/60 text-rpg-green",
  reprovada: "border-rpg-red/60 text-rpg-red",
  aberta: "border-rpg-gold/60 text-rpg-gold-light",
  corrigindo: "border-rpg-gold/60 text-rpg-gold-light",
  expirada: "border-rpg-border text-rpg-muted",
};

/** Painel da habilidade selecionada: níveis, prática real, provas e ações. */
export function SkillDetail({
  s,
  view,
  busy,
  onProof,
  onOpenProof,
  onEdit,
  onAddChild,
  onAiChildren,
  onMission,
  onDelete,
  onSelect,
  onClose,
}: {
  s: PersonalSkill;
  view: SkillTreeView;
  busy: boolean;
  onProof: (kind: ProofKind) => void;
  onOpenProof: (proofId: string) => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAiChildren: () => void;
  onMission: () => void;
  onDelete: () => void;
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  const Icon = skillIcon(s.icon);
  const proofs = useSkillProofs(s.id);
  const [kind, setKind] = useState<ProofKind>(s.proofMode);
  const maxed = s.level >= s.maxLevel;
  const next = s.levels[s.level];
  const practiceOk = !s.practiceNeeded || (s.practice?.minutes ?? 0) >= s.practiceNeeded;
  const blocked = maxed ? "Nível máximo comprovado." : !view.ai.available ? view.ai.message : s.retryAt ? `Nova tentativa liberada em ${new Date(s.retryAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.` : !practiceOk ? `Registre mais ${fmtMinutes(s.practiceNeeded! - (s.practice?.minutes ?? 0))} de prática para liberar a prova.` : null;
  const children = view.skills.filter((x) => x.parentId === s.id);
  const parent = s.parentId ? view.skills.find((x) => x.id === s.parentId) : null;

  return (
    <article className="rpg-panel rpg-panel-gold flex h-full flex-col p-3" aria-label={`Detalhes: ${s.name}`}>
      <header className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 bg-rpg-bg" style={{ borderRadius: 4, borderColor: `rgb(var(${DOMAIN_VAR[s.domain]}))`, color: `rgb(var(${DOMAIN_VAR[s.domain]}))` }} aria-hidden>
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("truncate text-[11px] font-bold uppercase tracking-wider", DOMAIN_TEXT[s.domain])} title={s.path.join(" › ")}>
            {DOMAIN_LABEL[s.domain]}
            {s.path.length > 1 ? ` › ${s.path.slice(0, -1).join(" › ")}` : ""}
          </p>
          <h2 className="font-rpg text-lg font-bold leading-snug text-rpg-text [overflow-wrap:anywhere]">{s.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip className={s.level ? "border-rpg-green/60 bg-rpg-green/10 text-rpg-green" : "border-rpg-border text-rpg-muted"}>{s.level ? `Nv. ${s.level} · ${s.levels[s.level - 1]?.title}` : "Sem nível comprovado"}</Chip>
            {s.source === "ia" && <Chip className="border-rpg-purple/60 text-rpg-purple">Criada com IA</Chip>}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 shrink-0 p-2 text-rpg-muted hover:text-rpg-text" aria-label="Fechar detalhes">
            <X size={16} />
          </button>
        )}
      </header>
      {s.description && <p className="mt-2 text-xs text-rpg-muted">{s.description}</p>}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold text-rpg-gold-light">Nível comprovado</span>
          <span className="font-bold tabular-nums text-rpg-text">
            {s.level} / {s.maxLevel}
          </span>
        </div>
        <Segments value={s.level} max={s.maxLevel} tone={DOMAIN_VAR[s.domain]} />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {/* Próxima prova */}
        {!maxed && next && (
          <section className="border border-rpg-gold/40 bg-rpg-gold/5 p-2.5" style={{ borderRadius: 3 }} aria-label="Próximo nível">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-rpg-gold-light">
              <ScrollText size={14} aria-hidden /> Prova do nível {s.level + 1} · {next.title}
            </h3>
            <p className="mt-1 text-xs text-rpg-text">{next.criteria}</p>
            {s.linkKind && (
              <div className="mt-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {practiceOk ? <CheckCircle2 size={13} className="text-rpg-green" aria-label="cumprido" /> : <Circle size={13} className="text-rpg-red" aria-label="pendente" />}
                  <span className="flex-1 text-rpg-text">
                    Prática em {s.practice?.label ?? LINK_LABEL[s.linkKind]}
                    {s.practiceNeeded ? `: ${fmtMinutes(s.practice?.minutes ?? 0)} de ${fmtMinutes(s.practiceNeeded)}` : `: ${fmtMinutes(s.practice?.minutes ?? 0)} (sem mínimo)`}
                  </span>
                </div>
                {s.practiceNeeded ? (
                  <span className="ml-5 mt-1 block h-1.5 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 1 }}>
                    <span className="block h-full bg-rpg-green" style={{ width: `${Math.min(100, ((s.practice?.minutes ?? 0) / s.practiceNeeded) * 100)}%` }} />
                  </span>
                ) : null}
              </div>
            )}
            {s.openProof ? (
              <RPGButton variant="primary" className="mt-2 w-full" onClick={() => onOpenProof(s.openProof!.id)}>
                <ScrollText size={15} aria-hidden /> Continuar prova em andamento
              </RPGButton>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor={`kind-${s.id}`} className="text-xs text-rpg-muted">
                    Formato
                  </label>
                  <select id={`kind-${s.id}`} value={kind} onChange={(e) => setKind(e.target.value as ProofKind)} className="flex-1 border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
                    {(Object.keys(PROOF_LABEL) as ProofKind[]).map((k) => (
                      <option key={k} value={k}>
                        {PROOF_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <RPGButton variant="primary" className="mt-2 w-full" disabled={!!blocked || busy} onClick={() => onProof(kind)} title={blocked ?? undefined}>
                  {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ScrollText size={15} aria-hidden />}
                  {busy ? "Gerando a prova…" : `Fazer a prova do nível ${s.level + 1}`}
                </RPGButton>
                {blocked && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-rpg-orange">
                    <Hourglass size={12} className="mt-px shrink-0" aria-hidden /> {blocked}
                  </p>
                )}
                <p className="mt-1.5 text-[10.5px] text-rpg-muted">
                  Nota mínima {view.rules.passScore}/100 · válida por {view.rules.expiresHours} h · após reprovar, nova tentativa em {view.rules.retryCooldownHours} h.
                </p>
              </>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Níveis</h3>
          <ol className="space-y-1.5">
            {s.levels.map((l) => {
              const own = s.level >= l.level;
              const isNext = l.level === s.level + 1;
              return (
                <li key={l.level} className={clsx("border-l-2 pl-2", own ? "border-rpg-green" : isNext ? "border-rpg-gold" : "border-rpg-border")}>
                  <p className={clsx("flex items-center gap-1.5 text-xs font-semibold", own ? "text-rpg-green" : isNext ? "text-rpg-gold-light" : "text-rpg-muted")}>
                    {own ? <CheckCircle2 size={13} aria-hidden /> : <Circle size={13} aria-hidden />} Nv. {l.level} · {l.title}
                  </p>
                  <p className={clsx("text-[11.5px]", own ? "text-rpg-text" : "text-rpg-muted")}>{l.criteria}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {s.linkKind && s.practice && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Prática registrada</h3>
            <p className="text-xs text-rpg-text">
              {fmtMinutes(s.practice.minutes)} em {s.practice.sessions} sessão(ões) · última: {fmtDate(s.practice.lastAt)}
            </p>
            <p className="text-[10.5px] text-rpg-muted">
              Origem:{" "}
              <Link to={LINK_ROUTE[s.linkKind] ?? "/"} className="text-rpg-blue hover:underline">
                {s.practice.label ?? LINK_LABEL[s.linkKind]}
              </Link>{" "}
              — dado real dos seus registros.
            </p>
          </section>
        )}

        {(parent || children.length > 0) && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Galho</h3>
            <div className="flex flex-wrap gap-1">
              {parent && (
                <button type="button" onClick={() => onSelect(parent.id)} className="border border-rpg-border px-1.5 py-px text-[11px] text-rpg-muted hover:text-rpg-text" style={{ borderRadius: 2 }}>
                  ↑ {parent.name}
                </button>
              )}
              {children.map((c) => (
                <button key={c.id} type="button" onClick={() => onSelect(c.id)} className={clsx("border px-1.5 py-px text-[11px]", c.level ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-text hover:border-rpg-gold/60")} style={{ borderRadius: 2 }}>
                  {c.name} {c.level}/{c.maxLevel}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Histórico de provas</h3>
          {proofs.isLoading ? (
            <div className="h-10 animate-pulse bg-rpg-bg-2" />
          ) : !proofs.data?.length ? (
            <p className="text-xs text-rpg-muted">Nenhuma prova feita ainda.</p>
          ) : (
            <ul className="space-y-1">
              {proofs.data.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpenProof(p.id)} className="flex w-full items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 px-2 py-1 text-left text-xs hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                    <Clock size={12} className="text-rpg-muted" aria-hidden />
                    <span className="flex-1 text-rpg-text">
                      Nv. {p.targetLevel} · {PROOF_LABEL[p.kind]}
                    </span>
                    {p.score != null && <span className="tabular-nums text-rpg-text">{p.score}/100</span>}
                    <Chip className={STATUS_TONE[p.status]}>{p.status}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="mt-3 grid grid-cols-2 gap-2 border-t border-rpg-border pt-3">
        <RPGButton variant="secondary" onClick={onAddChild} disabled={s.depth >= view.rules.maxDepth} title={s.depth >= view.rules.maxDepth ? "Profundidade máxima da árvore." : undefined}>
          <GitBranchPlus size={14} aria-hidden /> Sub-habilidade
        </RPGButton>
        <RPGButton variant="secondary" onClick={onAiChildren} disabled={!view.ai.available || s.depth >= view.rules.maxDepth} title={!view.ai.available ? view.ai.message : undefined}>
          <Wand2 size={14} aria-hidden /> Galhos com IA
        </RPGButton>
        <RPGButton variant="secondary" onClick={onMission} disabled={maxed}>
          <Swords size={14} aria-hidden /> Missão de estudo
        </RPGButton>
        <RPGButton variant="secondary" onClick={onEdit}>
          <Pencil size={14} aria-hidden /> Editar
        </RPGButton>
        <button type="button" onClick={onDelete} className="col-span-2 flex items-center justify-center gap-1 py-1 text-xs text-rpg-red hover:underline">
          <Trash2 size={12} aria-hidden /> Excluir {children.length ? "habilidade e sub-habilidades" : "habilidade"}
        </button>
      </footer>
    </article>
  );
}
