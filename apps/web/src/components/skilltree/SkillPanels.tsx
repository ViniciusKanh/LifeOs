import { Link } from "react-router-dom";
import clsx from "clsx";
import { Award, Crown, GitBranch, ScrollText, Sparkles, Trees, Wand2, Plus } from "lucide-react";
import { RPGAvatar } from "@/components/rpg/RPGAvatar";
import { RPGButton } from "@/components/rpg";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { useSkillsSummary } from "@/hooks/usePersonalSkills";
import { DOMAINS, DOMAIN_LABEL, type PersonalSkill, type SkillDomain, type SkillTreeView } from "@/services/personalSkillsService";
import { Box, DOMAIN_ICON, DOMAIN_TEXT, DOMAIN_VAR, Segments, fmtDate, skillIcon } from "./skillShared";

export function JourneyCard({ v }: { v: SkillTreeView }) {
  const { avatarId } = useRpgAvatar();
  const rate = v.stats.proofsTaken ? Math.round((v.stats.proofsPassed / v.stats.proofsTaken) * 100) : null;
  return (
    <Box title="Sua jornada" icon={<Crown size={14} />} gold>
      <div className="flex items-center gap-3">
        <RPGAvatar avatarId={avatarId} size="lg" frame="gold" alt="" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-muted">Níveis comprovados</p>
          <p className="font-rpg text-3xl font-bold leading-none text-rpg-gold-light">{v.stats.verifiedLevels}</p>
          <p className="mt-1 text-xs text-rpg-muted">em {v.stats.skills} habilidade(s)</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {[
          { l: "Provas aprovadas", v: `${v.stats.proofsPassed}${v.stats.proofsTaken ? ` de ${v.stats.proofsTaken}` : ""}`, i: <ScrollText size={14} className="text-rpg-gold" /> },
          { l: "Taxa de aprovação", v: rate == null ? "—" : `${rate}%`, i: <Award size={14} className="text-rpg-green" /> },
          { l: "Troncos com nível", v: `${v.stats.domainsVerified} / 4`, i: <Trees size={14} className="text-rpg-blue" /> },
          { l: "Habilidades no máximo", v: v.stats.maxed, i: <Sparkles size={14} className="text-rpg-purple" /> },
        ].map((r) => (
          <div key={r.l} className="flex items-center gap-2">
            <span aria-hidden>{r.i}</span>
            <dt className="flex-1 text-rpg-text">{r.l}</dt>
            <dd className="font-bold tabular-nums text-rpg-text">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-rpg-border pt-2 text-[11px] leading-snug text-rpg-muted">
        O nível só sobe com prova aprovada (nota mínima de {v.rules.passScores[0]} a {v.rules.passScores[4]}, conforme o nível). Cada nível comprovado rende XP e moedas oficiais e conta para conquistas e títulos do Códex.
      </p>
    </Box>
  );
}

export function DomainProgress({ v, onDomain }: { v: SkillTreeView; onDomain: (d: SkillDomain) => void }) {
  return (
    <Box title="Troncos da árvore" icon={<Trees size={14} />}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {v.domains.map((d) => {
          const Icon = DOMAIN_ICON[d.key];
          return (
            <li key={d.key}>
              <button type="button" onClick={() => onDomain(d.key)} className="w-full border border-rpg-border bg-rpg-bg-2/60 p-2 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                <span className="flex items-center gap-2 text-sm font-semibold text-rpg-text">
                  <Icon size={15} className={DOMAIN_TEXT[d.key]} aria-hidden /> {d.label}
                  <span className="ml-auto text-xs tabular-nums text-rpg-muted">
                    {d.levels} nv · {d.skills} hab.
                  </span>
                </span>
                <span className="mt-1.5 block h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 1 }}>
                  <span className="block h-full" style={{ width: `${d.pct}%`, background: `rgb(var(${DOMAIN_VAR[d.key]}))` }} />
                </span>
                <span className="mt-1 block text-[11px] text-rpg-muted">{d.skills ? `${d.pct}% dos níveis possíveis comprovados` : d.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

/** Alternativa acessível ao grafo: lista em árvore, navegável por teclado. */
export function SkillList({ v, domain, selected, onSelect }: { v: SkillTreeView; domain: SkillDomain | "all"; selected: string | null; onSelect: (id: string) => void }) {
  const byParent = new Map<string | null, PersonalSkill[]>();
  for (const s of v.skills) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s]);
  const render = (list: PersonalSkill[]) => (
    <ul className="space-y-1 border-l border-rpg-border/70 pl-3">
      {list
        .sort((a, b) => a.position - b.position)
        .map((s) => {
          const Icon = skillIcon(s.icon);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => onSelect(s.id)} aria-current={selected === s.id} className={clsx("flex w-full items-center gap-2 border px-2 py-1.5 text-left", selected === s.id ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/60 hover:border-rpg-gold/50")} style={{ borderRadius: 3 }}>
                <Icon size={15} className={DOMAIN_TEXT[s.domain]} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{s.name}</span>
                {s.openProof && <ScrollText size={13} className="text-rpg-gold" aria-label="prova em andamento" />}
                <span className="w-20 shrink-0">
                  <Segments value={s.level} max={s.maxLevel} tone={DOMAIN_VAR[s.domain]} />
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-rpg-muted">
                  {s.level}/{s.maxLevel}
                </span>
              </button>
              {byParent.get(s.id)?.length ? <div className="mt-1">{render(byParent.get(s.id)!)}</div> : null}
            </li>
          );
        })}
    </ul>
  );
  const domains = domain === "all" ? DOMAINS : [domain];
  return (
    <div className="max-h-[600px] space-y-3 overflow-y-auto p-1">
      {domains.map((d) => {
        const roots = (byParent.get(null) ?? []).filter((s) => s.domain === d);
        const Icon = DOMAIN_ICON[d];
        return (
          <section key={d} aria-label={DOMAIN_LABEL[d]}>
            <h3 className={clsx("mb-1 flex items-center gap-1.5 font-pixel text-[12px] uppercase tracking-wider", DOMAIN_TEXT[d])}>
              <Icon size={14} aria-hidden /> {DOMAIN_LABEL[d]}
            </h3>
            {roots.length ? render(roots) : <p className="pl-3 text-xs text-rpg-muted">Nenhuma habilidade neste tronco.</p>}
          </section>
        );
      })}
    </div>
  );
}

const EXAMPLES: Array<{ goal: string; domain: SkillDomain }> = [
  { goal: "Quero aprender Machine Learning: Python, pandas, scikit-learn", domain: "pessoal" },
  { goal: "Português para concurso público", domain: "educacao" },
  { goal: "Evoluir no Muay Thai", domain: "saude" },
  { goal: "Excel e Power BI avançados para o trabalho", domain: "trabalho" },
];

/** Primeira visita: explica a ideia e oferece os dois caminhos de criação. */
export function EmptyTree({ aiAvailable, aiMessage, onAi, onManual }: { aiAvailable: boolean; aiMessage: string; onAi: (goal?: string, domain?: SkillDomain) => void; onManual: () => void }) {
  return (
    <div className="rpg-panel rpg-panel-gold mx-auto max-w-2xl p-4 text-center">
      <p className="font-pixel text-[11px] uppercase tracking-[0.2em] text-rpg-gold">Plante sua árvore</p>
      <h2 className="mt-1 font-rpg text-2xl font-bold text-rpg-text">Suas habilidades, do seu jeito</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-rpg-muted">
        Crie galhos em Saúde, Educação, Pessoal e Trabalho — como Machine Learning → Python, pandas e scikit-learn. Cada nível é conquistado numa prova gerada e corrigida pela IA.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <RPGButton variant="primary" onClick={() => onAi()} disabled={!aiAvailable}>
          <Wand2 size={15} aria-hidden /> Criar galho com IA
        </RPGButton>
        <RPGButton variant="secondary" onClick={onManual}>
          <Plus size={15} aria-hidden /> Criar manualmente
        </RPGButton>
      </div>
      {!aiAvailable && <p className="mt-2 text-xs text-rpg-orange">{aiMessage}</p>}
      {aiAvailable && (
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Exemplos">
          {EXAMPLES.map((e) => (
            <li key={e.goal}>
              <button type="button" onClick={() => onAi(e.goal, e.domain)} className={clsx("border border-rpg-border bg-rpg-bg-2 px-2 py-1 text-xs hover:border-rpg-gold", DOMAIN_TEXT[e.domain])} style={{ borderRadius: 3 }}>
                {e.goal}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Resumo da Árvore para outras telas (Perfil, Build, Códex, Hoje, Educação,
 * Profissional, Saúde). Com `domain`, mostra só aquele tronco. Só níveis
 * comprovados por prova — nenhum número é estimado.
 */
export function MySkillsCard({ className, domain, compact }: { className?: string; domain?: SkillDomain; compact?: boolean }) {
  const q = useSkillsSummary(domain ?? null);
  const d = q.data;
  const base = domain ? `/arvore-habilidades` : "/arvore-habilidades";
  const title = domain ? `Habilidades · ${DOMAIN_LABEL[domain]}` : "Árvore de Habilidades";
  // Compacto (ex.: Hoje): só aparece quando há algo a fazer — prova em andamento.
  if (compact && (!d || !d.openProofs.length)) return null;
  return (
    <section className={clsx("rpg-panel p-3", className)} aria-label={title}>
      <header className="mb-2 flex items-center gap-2">
        <GitBranch size={14} className="text-rpg-gold" aria-hidden />
        <h2 className="font-pixel text-[12px] uppercase tracking-wider text-rpg-gold-light">{compact ? "Provas em andamento" : title}</h2>
        <Link to={`${base}${compact ? "" : "?aba=provas"}`} className="ml-auto text-xs font-semibold text-rpg-blue hover:underline">
          {compact ? "Abrir árvore →" : "Ver evolução →"}
        </Link>
      </header>
      {q.isLoading ? (
        <div className="h-24 animate-pulse bg-rpg-bg-2" />
      ) : !d || !d.stats.skills ? (
        <p className="text-sm text-rpg-muted">
          {domain ? `Nenhuma habilidade no tronco ${DOMAIN_LABEL[domain]} ainda.` : "Nenhuma habilidade criada ainda."} Monte seus galhos na Árvore e comprove cada nível em provas.{" "}
          <Link to="/arvore-habilidades" className="text-rpg-blue hover:underline">
            Criar habilidade
          </Link>
        </p>
      ) : (
        <>
          {d.openProofs.length > 0 && (
            <ul className={clsx("space-y-1", !compact && "mb-2")}>
              {d.openProofs.map((p) => (
                <li key={p.id}>
                  <Link to={`/arvore-habilidades?habilidade=${p.skillId}`} className="flex items-center gap-2 border border-rpg-gold/50 bg-rpg-gold/10 px-2 py-1 text-xs text-rpg-text hover:border-rpg-gold" style={{ borderRadius: 3 }}>
                    <ScrollText size={13} className="text-rpg-gold" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Prova de <strong>{p.name}</strong> nível {p.level} em andamento
                    </span>
                    <span className="shrink-0 text-rpg-muted">até {fmtDate(p.expiresAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!compact && (
            <>
              {!domain && (
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {d.domains.map((x) => {
                    const Icon = DOMAIN_ICON[x.key];
                    return (
                      <div key={x.key} className="border border-rpg-border bg-rpg-bg-2/60 px-1 py-1.5" style={{ borderRadius: 3 }} title={`${x.label}: ${x.skills} habilidade(s)`}>
                        <Icon size={14} className={clsx("mx-auto", DOMAIN_TEXT[x.key])} aria-hidden />
                        <p className="font-bold tabular-nums text-rpg-text">{x.levels}</p>
                        <p className="truncate text-[10px] text-rpg-muted">{x.label}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {domain && (
                <p className="text-xs text-rpg-muted">
                  <strong className="text-rpg-text">{d.stats.verifiedLevels}</strong> nível(is) comprovado(s) em <strong className="text-rpg-text">{d.stats.skills}</strong> habilidade(s) deste tronco.
                </p>
              )}
              {d.top.length ? (
                <ul className="mt-2 space-y-1">
                  {d.top.slice(0, domain ? 5 : 4).map((s) => {
                    const Icon = skillIcon(s.icon);
                    return (
                      <li key={s.id}>
                        <Link to={`/arvore-habilidades?habilidade=${s.id}`} className="flex items-center gap-2 text-sm hover:underline">
                          <Icon size={14} className={DOMAIN_TEXT[s.domain]} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-rpg-text">{s.name}</span>
                          <span className="hidden text-xs text-rpg-muted sm:inline">{s.title}</span>
                          <span className="w-16 shrink-0">
                            <Segments value={s.level} max={s.maxLevel} tone={DOMAIN_VAR[s.domain]} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-rpg-muted">Nenhum nível comprovado ainda — faça a primeira prova na árvore.</p>
              )}
              {d.recent[0] && (
                <p className="mt-2 border-t border-rpg-border pt-1.5 text-[11px] text-rpg-muted">
                  Última prova aprovada: <strong className="text-rpg-text">{d.recent[0].name}</strong> nv. {d.recent[0].level} ({d.recent[0].score}/100) · {fmtDate(d.recent[0].at)}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
