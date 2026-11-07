import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { BookOpenCheck, Coins, Hourglass, List, Network, Plus, ScrollText, Search, Sparkles, Wand2, Workflow } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { MissionAdvisor, type AdvisorSeed } from "@/components/missions3/MissionAdvisor";
import { useTasks } from "@/hooks/useTasks";
import { useSkillActions, useSkillTree } from "@/hooks/usePersonalSkills";
import { DOMAINS, DOMAIN_LABEL, type PersonalSkill, type ProofKind, type SkillDomain, type SkillTreeView } from "@/services/personalSkillsService";
import { SkillGraph } from "./SkillGraph";
import { SkillDetail } from "./SkillDetail";
import { DomainProgress, EmptyTree, JourneyCard, SkillList } from "./SkillPanels";
import { AiBranchModal, SkillEditor } from "./SkillTools";
import { ProofModal } from "./ProofModal";
import { Box, DOMAIN_ICON, DOMAIN_TEXT, SKILL_ART, errMsg } from "./skillShared";

/**
 * Árvore de Habilidades 2.0 — o usuário (ou a IA, com confirmação) cria os
 * próprios galhos em quatro troncos e comprova cada nível numa prova.
 */
export function SkillTreeScreen() {
  const q = useSkillTree();
  const act = useSkillActions();
  const { tasks } = useTasks();
  const [params, setParams] = useSearchParams();
  const [domain, setDomain] = useState<SkillDomain | "all">("all");
  const [selected, setSelected] = useState<string | null>(params.get("habilidade"));
  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState("");
  const [asList, setAsList] = useState(false);
  const [toast, setToast] = useState<{ m: string; tone: "success" | "error" } | null>(null);
  const notify = (m: string, tone: "success" | "error" = "success") => setToast({ m, tone });
  const [editor, setEditor] = useState<{ skill: PersonalSkill | null; domain: SkillDomain; parentId: string | null } | null>(null);
  const [ai, setAi] = useState<{ goal?: string; domain?: SkillDomain | null; parentId?: string | null } | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [seed, setSeed] = useState<AdvisorSeed | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [showAutomations, setShowAutomations] = useState(false);
  const v = q.data;

  // Seleção inicial: a habilidade do link (?habilidade=) ou a primeira com prova aberta / mais evoluída.
  useEffect(() => {
    if (!v?.skills.length) return;
    if (selected && v.skills.some((s) => s.id === selected)) return;
    const first = v.skills.find((s) => s.openProof) ?? [...v.skills].sort((a, b) => b.level - a.level)[0]!;
    setSelected(first.id);
  }, [v, selected]);
  useEffect(() => {
    const id = params.get("habilidade");
    if (id && v?.skills.some((s) => s.id === id)) {
      setSelected(id);
      setSheet(true);
      params.delete("habilidade");
      setParams(params, { replace: true });
    }
  }, [params, setParams, v]);

  const skill = useMemo(() => v?.skills.find((s) => s.id === selected) ?? null, [v, selected]);
  const pick = (id: string) => {
    setSelected(id);
    setSheet(true);
  };
  const startProof = (kind: ProofKind) => {
    if (!skill) return;
    act.startProof.mutate({ skillId: skill.id, kind }, { onSuccess: (p) => setProofId(p.id), onError: (e) => notify(errMsg(e, "Não consegui gerar a prova."), "error") });
  };
  const leveled = (id: string) => {
    setBurst(id);
    window.setTimeout(() => setBurst(null), 1400);
  };
  const remove = () => {
    if (!skill) return;
    const extra = skill.childCount ? " e todas as sub-habilidades (com o histórico de provas)" : " e o histórico de provas";
    if (!window.confirm(`Excluir “${skill.name}”${extra}? Isso não pode ser desfeito. XP e conquistas já recebidos continuam.`)) return;
    act.remove.mutate(skill.id, { onSuccess: (r) => (notify(`${r.removed} habilidade(s) removida(s).`), setSelected(null), setSheet(false)), onError: (e) => notify(errMsg(e, "Não consegui excluir."), "error") });
  };
  const mission = () => {
    if (!skill) return;
    const next = skill.levels[skill.level];
    setSeed({ message: `Criar uma missão de estudo para evoluir em “${skill.path.join(" › ")}” até o nível ${skill.level + 1} (${next?.title}): ${next?.criteria}`, mode: "create", autoSend: true });
  };

  if (q.isError)
    return (
      <div className="px-4 py-6">
        <p className="rpg-panel p-4 text-sm text-rpg-red">{errMsg(q.error, "Não consegui carregar a Árvore de Habilidades.")}</p>
      </div>
    );
  if (!v)
    return (
      <div className="space-y-4 px-4 py-6 md:px-6" aria-busy aria-label="Carregando árvore">
        <div className="rpg-panel h-40 animate-pulse" />
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          <div className="rpg-panel h-80 animate-pulse" />
          <div className="rpg-panel h-[560px] animate-pulse" />
          <div className="rpg-panel h-80 animate-pulse" />
        </div>
      </div>
    );

  const empty = v.skills.length === 0;
  const detail = (close?: () => void) =>
    skill ? (
      <SkillDetail
        s={skill}
        view={v}
        busy={act.startProof.isPending}
        onProof={startProof}
        onOpenProof={setProofId}
        onEdit={() => setEditor({ skill, domain: skill.domain, parentId: skill.parentId })}
        onAddChild={() => setEditor({ skill: null, domain: skill.domain, parentId: skill.id })}
        onAiChildren={() => setAi({ parentId: skill.id, domain: skill.domain })}
        onMission={mission}
        onDelete={remove}
        onSelect={pick}
        onClose={close}
      />
    ) : (
      <Box title="Detalhes">
        <p className="text-sm text-rpg-muted">Selecione uma habilidade na árvore ou crie a primeira.</p>
      </Box>
    );

  return (
    <div className="w-full px-3 py-4 sm:px-5 md:px-6 md:py-6">
      <Banner v={v} onNew={() => setEditor({ skill: null, domain: domain === "all" ? "pessoal" : domain, parentId: null })} onAi={() => setAi({ domain: domain === "all" ? null : domain })} />

      <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Troncos da árvore">
        {[{ key: "all" as const, label: "Visão Geral" }, ...DOMAINS.map((d) => ({ key: d, label: DOMAIN_LABEL[d] }))].map((b) => {
          const Icon = b.key === "all" ? Sparkles : DOMAIN_ICON[b.key];
          const count = b.key === "all" ? v.skills.length : v.skills.filter((s) => s.domain === b.key).length;
          return (
            <button
              key={b.key}
              role="tab"
              aria-selected={domain === b.key}
              onClick={() => setDomain(b.key)}
              className={clsx("flex shrink-0 items-center gap-1.5 border-2 px-3 py-1.5 text-sm font-semibold", domain === b.key ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border bg-rpg-panel text-rpg-text hover:border-rpg-gold/50")}
              style={{ borderRadius: 4 }}
            >
              <Icon size={15} className={b.key === "all" ? "text-rpg-gold" : DOMAIN_TEXT[b.key]} aria-hidden />
              {b.label}
              <span className="text-xs font-normal text-rpg-muted">{count}</span>
            </button>
          );
        })}
      </nav>

      {empty ? (
        <div className="mt-6">
          <EmptyTree aiAvailable={v.ai.available} aiMessage={v.ai.message} onAi={(goal, d) => setAi({ goal, domain: d ?? null })} onManual={() => setEditor({ skill: null, domain: "pessoal", parentId: null })} />
        </div>
      ) : null}

      <div className={clsx("mt-3 grid items-start gap-3 xl:grid-cols-[260px_minmax(0,1fr)_360px]", empty && "opacity-90")}>
        <div className="order-2 grid gap-3 sm:grid-cols-2 xl:order-1 xl:grid-cols-1">
          <JourneyCard v={v} />
          <RulesCard v={v} />
        </div>

        <section className="rpg-panel rpg-panel-gold order-1 min-w-0 p-2 xl:order-2" aria-label="Árvore">
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <label className="relative min-w-[160px] flex-1">
              <span className="sr-only">Buscar habilidade</span>
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar habilidade…" className="w-full border border-rpg-border bg-rpg-bg-2 py-1.5 pl-7 pr-2 text-xs text-rpg-text outline-none focus:border-rpg-gold" style={{ borderRadius: 3 }} />
            </label>
            <button type="button" onClick={() => setAsList((x) => !x)} aria-pressed={asList} className={clsx("flex items-center gap-1 border px-2 py-1 text-xs font-semibold", asList ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-text")} style={{ borderRadius: 3 }}>
              {asList ? <Network size={13} aria-hidden /> : <List size={13} aria-hidden />} {asList ? "Ver árvore" : "Ver em lista"}
            </button>
          </div>
          {asList ? (
            <SkillList v={v} domain={domain} selected={selected} onSelect={pick} />
          ) : (
            <SkillGraph
              skills={v.skills}
              selected={selected}
              onSelect={pick}
              domain={domain}
              search={search}
              onAdd={(d) => setEditor({ skill: null, domain: d, parentId: null })}
              onDomain={(d) => setDomain((cur) => (cur === d ? "all" : d))}
              totalLevels={v.stats.verifiedLevels}
              justLeveled={burst}
              height="h-[440px] sm:h-[540px] xl:h-[600px]"
            />
          )}
          <Legend />
        </section>

        <aside className="order-3 hidden min-w-0 xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)] xl:max-h-[780px]" aria-label="Habilidade selecionada">
          {detail()}
        </aside>
      </div>

      {/* Tablet e celular: detalhes em painel inferior. */}
      {sheet && skill && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 xl:hidden" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="h-[88vh] w-full max-w-xl overflow-hidden bg-rpg-bg p-2 sm:h-[80vh]" role="dialog" aria-modal="true" aria-label={`Detalhes: ${skill.name}`}>
            {detail(() => setSheet(false))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <DomainProgress v={v} onDomain={(d) => setDomain(d)} />
      </div>

      <div className="mt-3">
        <button type="button" onClick={() => setShowAutomations((x) => !x)} aria-expanded={showAutomations} className="flex items-center gap-1.5 text-sm font-semibold text-rpg-muted hover:text-rpg-text">
          <Workflow size={14} aria-hidden /> Automações da árvore {showAutomations ? "▲" : "▼"}
        </button>
        {showAutomations && (
          <div className="mt-2">
            <AutomationsPanel module="skills" title="Automações da Árvore" icon={<Workflow size={18} />} intro="A IA gera e corrige as provas; recompensas, conquistas e avisos acompanham cada nível comprovado. Nada sobe de nível sem prova aprovada." />
          </div>
        )}
      </div>

      <SkillEditor open={!!editor} view={v} skill={editor?.skill ?? null} domain={editor?.domain ?? "pessoal"} parentId={editor?.parentId ?? null} onClose={() => setEditor(null)} onSaved={(id) => (setEditor(null), setSelected(id))} notify={notify} />
      <AiBranchModal open={!!ai} view={v} initial={ai} onClose={() => setAi(null)} onCreated={(id) => (setAi(null), id && setSelected(id))} notify={notify} />
      {proofId && <ProofModal proofId={proofId} skill={v.skills.find((s) => s.openProof?.id === proofId || s.lastProof?.id === proofId) ?? skill} onClose={() => setProofId(null)} onLeveled={leveled} notify={notify} />}
      {seed && <MissionAdvisor tasks={tasks} seed={seed} layout="drawer" onClose={() => setSeed(null)} onCreated={() => (setSeed(null), notify("Missão de estudo criada."))} notify={notify} />}
      <RPGToast message={toast?.m ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

function Banner({ v, onNew, onAi }: { v: SkillTreeView; onNew: () => void; onAi: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden">
      <div className="relative grid items-stretch md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_auto]">
        <div className="relative h-32 overflow-hidden md:row-span-2 md:h-auto md:min-h-[150px] xl:row-span-1" aria-hidden>
          <img src={`${SKILL_ART}/banner-mage.webp`} alt="" decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover object-[35%_40%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-rpg-panel via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:from-70% md:to-rpg-panel" />
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3 sm:px-5">
          <p className="font-pixel text-[11px] uppercase tracking-[0.2em] text-rpg-gold">Progressão do herói</p>
          <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">Árvore das Habilidades</h1>
          <p className="max-w-2xl text-sm text-rpg-text sm:text-base">Plante o que você quer aprender e evoluir — e comprove cada nível numa prova.</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-5 xl:flex-nowrap xl:pb-0 xl:pl-0">
          <div className="flex items-center gap-2 border-2 border-rpg-gold bg-rpg-bg/80 px-4 py-2 shadow-[0_0_24px_-6px_rgb(var(--rpg-purple)/0.8)]" style={{ borderRadius: 4 }} title="Soma dos níveis comprovados por provas aprovadas">
            <img src={`${SKILL_ART}/crystal.webp`} alt="" aria-hidden className="pixelated h-10 w-10" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-gold-light">Níveis comprovados</p>
              <p className="font-rpg text-3xl font-bold leading-none text-rpg-text">{v.stats.verifiedLevels}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:flex-col">
            <RPGButton variant="primary" onClick={onAi} disabled={!v.ai.available} title={!v.ai.available ? v.ai.message : undefined}>
              <Wand2 size={14} aria-hidden /> Criar com IA
            </RPGButton>
            <RPGButton variant="secondary" onClick={onNew}>
              <Plus size={14} aria-hidden /> Nova habilidade
            </RPGButton>
          </div>
        </div>
      </div>
    </header>
  );
}

function RulesCard({ v }: { v: SkillTreeView }) {
  return (
    <Box title="Como se evolui" icon={<BookOpenCheck size={14} />}>
      <ul className="space-y-1.5 text-xs text-rpg-text">
        <li className="flex gap-2">
          <ScrollText size={13} className="mt-px shrink-0 text-rpg-gold" aria-hidden /> A IA gera a prova a partir do critério do próximo nível: quiz, desafio prático ou misto.
        </li>
        <li className="flex gap-2">
          <Sparkles size={13} className="mt-px shrink-0 text-rpg-purple" aria-hidden /> Nota mínima {v.rules.passScore}/100. Objetivas são corrigidas pelo sistema; abertas e desafios pela IA, com rubrica.
        </li>
        <li className="flex gap-2">
          <Hourglass size={13} className="mt-px shrink-0 text-rpg-orange" aria-hidden /> Reprovou? Nova tentativa do mesmo nível em {v.rules.retryCooldownHours} h. Até {v.rules.maxPerDay} provas por dia.
        </li>
        <li className="flex gap-2">
          <Coins size={13} className="mt-px shrink-0 text-rpg-gold-light" aria-hidden /> Cada nível comprovado rende XP e moedas, marca a Crônica e conta para conquistas e títulos do Códex.
        </li>
      </ul>
      {!v.ai.available && <p className="mt-2 border-t border-rpg-border pt-2 text-[11px] text-rpg-orange">{v.ai.message}</p>}
    </Box>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["border-rpg-border bg-rpg-bg", "Sem nível comprovado"],
    ["border-rpg-purple bg-rpg-purple/40", "Nível comprovado"],
    ["border-rpg-gold bg-rpg-gold/50", "Nível máximo"],
    ["border-rpg-gold animate-pulse bg-rpg-bg", "Prova em andamento"],
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10.5px] text-rpg-muted" aria-label="Legenda">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1">
          <span className={clsx("h-3 w-3 rounded-full border-2 motion-reduce:animate-none", c)} aria-hidden />
          {l}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="flex h-3 w-3 items-center justify-center rounded-full border border-dashed border-rpg-muted text-[8px]" aria-hidden>
          +
        </span>
        Adicionar ao tronco
      </li>
    </ul>
  );
}
