import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowUp, CheckCircle2, Circle, Flag, GitBranch, Loader2, Lock, Sparkles, Swords, Target, X } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { STATE_LABEL, type SkillNode, type SkillTreeView } from "@/services/skillTreeService";
import { BRANCH_TEXT, BRANCH_VAR, Chip, STATE_TONE, Segments, TYPE_LABEL, skillIcon } from "./skillShared";

const TIER = ["I", "II", "III", "IV", "V"];

/** Painel da habilidade selecionada: efeitos por nível, requisitos reais com progresso e a ação de evoluir (validada no servidor). */
export function SkillDetail({
  s,
  view,
  busy,
  onUpgrade,
  onSimulate,
  onDesire,
  onMission,
  onSelect,
  onClose,
}: {
  s: SkillNode;
  view: SkillTreeView;
  busy: boolean;
  onUpgrade: () => void;
  onSimulate: () => void;
  onDesire: () => void;
  onMission: (request: string) => void;
  onSelect: (key: string) => void;
  onClose?: () => void;
}) {
  const Icon = skillIcon(s.icon);
  const branch = view.branches.find((b) => b.key === s.branch);
  const next = s.next;
  const nextLevel = s.levels[s.level];
  const desired = view.desired.find((d) => d.key === s.key);
  return (
    <article className="rpg-panel rpg-panel-gold flex h-full flex-col p-3" aria-label={`Detalhes: ${s.name}`}>
      <header className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 bg-rpg-bg" style={{ borderRadius: 4, borderColor: `rgb(var(${BRANCH_VAR[s.branch]}))`, color: `rgb(var(${BRANCH_VAR[s.branch]}))` }} aria-hidden>
          {s.state === "bloqueada" ? <Lock size={26} /> : <Icon size={28} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("text-[11px] font-bold uppercase tracking-wider", BRANCH_TEXT[s.branch])}>
            {branch?.label} · Tier {TIER[s.tier - 1]}
          </p>
          <h2 className="font-rpg text-lg font-bold leading-snug text-rpg-text [overflow-wrap:anywhere]">{s.name}</h2>
          <Chip className={clsx("mt-1", STATE_TONE[s.state])}>{STATE_LABEL[s.state]}</Chip>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 shrink-0 p-2 text-rpg-muted hover:text-rpg-text" aria-label="Fechar detalhes">
            <X size={16} />
          </button>
        )}
      </header>
      <p className="mt-2 text-xs text-rpg-muted">{s.description}</p>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold text-rpg-gold-light">Nível da habilidade</span>
          <span className="font-bold tabular-nums text-rpg-text">
            Nv. {s.level} / {s.maxLevel}
          </span>
        </div>
        <Segments value={s.level} max={s.maxLevel} tone={BRANCH_VAR[s.branch]} />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Efeitos por nível</h3>
          <ol className="space-y-1.5">
            {s.levels.map((l) => {
              const own = s.level >= l.level;
              const isNext = l.level === s.level + 1;
              return (
                <li key={l.level} className={clsx("border-l-2 pl-2", own ? "border-rpg-green" : isNext ? "border-rpg-gold" : "border-rpg-border")}>
                  <p className={clsx("flex items-center gap-1.5 text-xs font-semibold", own ? "text-rpg-green" : isNext ? "text-rpg-gold-light" : "text-rpg-muted")}>
                    {own ? <CheckCircle2 size={13} aria-hidden /> : <Circle size={13} aria-hidden />} Nv. {l.level}
                    {own && l.level === s.level ? " (atual)" : isNext ? " (próximo)" : ""}
                    <span className="ml-auto font-normal text-rpg-muted">{l.cost} PH · herói nv. {l.heroLevel}</span>
                  </p>
                  {l.effects.map((e) => (
                    <p key={e.key} className={clsx("text-[12px]", own ? "text-rpg-text" : "text-rpg-muted")}>
                      <span className="font-semibold">{TYPE_LABEL[e.type] ?? "Efeito"}:</span> {e.label.replace(/^[^:]+:\s*/, "")}
                      <span className="block text-[10.5px] text-rpg-muted">{e.description}</span>
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
        </section>

        {next && nextLevel && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-rpg-gold-light">Requisitos para o nível {s.level + 1}</h3>
            <ul className="space-y-1.5">
              {next.checks.map((c, i) => (
                <li key={i} className="text-xs">
                  <div className="flex items-start gap-1.5">
                    {c.met ? <CheckCircle2 size={14} className="mt-px shrink-0 text-rpg-green" aria-label="cumprido" /> : <Circle size={14} className="mt-px shrink-0 text-rpg-red" aria-label="pendente" />}
                    <span className={clsx("min-w-0 flex-1", c.met ? "text-rpg-text" : "text-rpg-text")}>
                      {c.kind === "prereq" ? "Pré-requisito: " : c.kind === "points" ? "Custo: " : ""}
                      {c.label}
                    </span>
                    {c.current != null && c.target != null && c.kind !== "order" && (
                      <span className={clsx("shrink-0 tabular-nums", c.met ? "text-rpg-green" : "text-rpg-red")}>
                        ({Math.min(c.current, c.target)}/{c.target})
                      </span>
                    )}
                  </div>
                  {c.kind === "prereq" && c.options && (
                    <div className="ml-5 mt-0.5 flex flex-wrap gap-1">
                      {c.options.map((o) => (
                        <button key={o.skill} type="button" onClick={() => onSelect(o.skill)} className={clsx("border px-1.5 py-px text-[10.5px]", o.met ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 2 }}>
                          {o.name} {o.current}/{o.level}
                        </button>
                      ))}
                    </div>
                  )}
                  {c.kind === "evidence" && (
                    <div className="ml-5 mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-rpg-muted">
                      Origem: {c.route ? <Link to={c.route} className="text-rpg-blue hover:underline">{c.module}</Link> : c.module}
                      {!c.met && (
                        <button type="button" onClick={() => onMission(`Criar uma missão para avançar em: ${c.label.toLowerCase()} (hoje ${c.current}/${c.target}) — requisito de “${s.name}” nível ${s.level + 1}`)} className="flex items-center gap-1 font-semibold text-rpg-purple hover:underline">
                          <Swords size={11} aria-hidden /> Criar missão
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="mt-3 space-y-2 border-t border-rpg-border pt-3">
        {next && (
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-rpg-gold-light">Custo de melhoria</span>
            <span className="flex items-center gap-1 font-bold text-rpg-text">
              <Sparkles size={14} className="text-rpg-purple" aria-hidden /> {next.cost} PH
            </span>
          </div>
        )}
        <RPGButton variant="primary" className="w-full" disabled={!next?.ok || busy} onClick={onUpgrade} title={next && !next.ok ? next.checks.filter((c) => !c.met).map((c) => c.label).join(" · ") : undefined}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
          {!next ? "Habilidade maximizada" : s.level === 0 ? "Desbloquear habilidade" : `Evoluir para Nv. ${s.level + 1}`}
        </RPGButton>
        <div className="grid grid-cols-2 gap-2">
          <RPGButton variant="secondary" onClick={onSimulate} disabled={!next} title="Calcula o caminho mínimo até aqui, sem gastar pontos">
            <GitBranch size={14} aria-hidden /> Simular caminho
          </RPGButton>
          <RPGButton variant="secondary" onClick={onDesire} disabled={!next}>
            {desired ? <Target size={14} aria-hidden /> : <Flag size={14} aria-hidden />} {desired ? `Na build (nv. ${desired.level})` : "Marcar na build"}
          </RPGButton>
        </div>
      </footer>
    </article>
  );
}
