import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { BarChart3, Gift, History, List, Network, RotateCcw, Search, Sparkles, Wand2, Workflow, X } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { useUrlTab } from "@/components/hero/HeroShared";
import { Modal } from "@/components/ui/Modal";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { MissionAdvisor, type AdvisorSeed } from "@/components/missions3/MissionAdvisor";
import { useTasks } from "@/hooks/useTasks";
import { useSkillEffects, useSkillTree, useSkillTreeActions } from "@/hooks/useSkillTree";
import type { SkillBranch, SkillPreset, SkillTreeView, Target } from "@/services/skillTreeService";
import { SkillGraph } from "./SkillGraph";
import { SkillDetail } from "./SkillDetail";
import { ActiveEffects, BranchProgress, HistoryPanel, JourneyCard, PresetsBar, SkillList, StatsPanel } from "./SkillPanels";
import { Arsenal, OraclePanel, PlanModal, PresetEditor, ResetModal } from "./SkillTools";
import { BRANCH_ICON, BRANCH_TEXT, Box, SKILL_ART, errMsg } from "./skillShared";

const SECTIONS = ["bonus", "oraculo", "simulador", "historico", "estatisticas", "automacoes"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_META: Array<[Section, string, ReactNode]> = [
  ["bonus", "Bônus ativos", <Gift key="i" size={14} />],
  ["oraculo", "Oráculo", <Wand2 key="i" size={14} />],
  ["simulador", "Simulador de build", <Network key="i" size={14} />],
  ["historico", "Histórico", <History key="i" size={14} />],
  ["estatisticas", "Estatísticas", <BarChart3 key="i" size={14} />],
  ["automacoes", "Automações", <Workflow key="i" size={14} />],
];

/** Árvore de Habilidades — progressão permanente com efeitos reais nos módulos do LifeOS. */
export function SkillTreeScreen() {
  const q = useSkillTree();
  const fx = useSkillEffects();
  const act = useSkillTreeActions();
  const { tasks } = useTasks();
  const [section, setSection] = useUrlTab(SECTIONS, "bonus");
  const [branch, setBranch] = useState<SkillBranch | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [asList, setAsList] = useState(false);
  const [toast, setToast] = useState<{ m: string; tone: "success" | "error" } | null>(null);
  const notify = (m: string, tone: "success" | "error" = "success") => setToast({ m, tone });
  const [plan, setPlan] = useState<{ title: string; targets: Target[]; origin: "build" | "preset" | "oracle" } | null>(null);
  const [editor, setEditor] = useState<{ preset: SkillPreset | null; targets: Target[] | null } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [presetPick, setPresetPick] = useState(false);
  const [seed, setSeed] = useState<AdvisorSeed | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const v = q.data;

  useEffect(() => {
    if (v && !selected) setSelected(v.skills.find((s) => s.state === "em_evolucao" || s.state === "disponivel")?.key ?? v.skills.find((s) => s.tier === 1)?.key ?? null);
  }, [v, selected]);

  const skill = useMemo(() => v?.skills.find((s) => s.key === selected) ?? null, [v, selected]);
  const pick = (key: string) => {
    setSelected(key);
    setSheet(true);
  };
  const upgrade = () => {
    if (!skill) return;
    act.upgrade.mutate(
      { key: skill.key, expectedLevel: skill.level },
      {
        onSuccess: (r) => {
          const a = r.applied[0]!;
          setBurst(a.key);
          window.setTimeout(() => setBurst(null), 1300);
          notify(a.level === 1 ? `Habilidade desbloqueada: ${a.name}! −${a.cost} PH` : `${a.name} evoluiu para o nível ${a.level}. −${a.cost} PH`);
        },
        onError: (e) => notify(errMsg(e, "Não consegui evoluir."), "error"),
      },
    );
  };
  const desire = () => {
    if (!v || !skill) return;
    const nextLevel = Math.min(skill.maxLevel, skill.level + 1);
    const others = v.desired.filter((d) => d.key !== skill.key);
    const has = v.desired.some((d) => d.key === skill.key);
    act.desired.mutate(has ? others : [...others, { key: skill.key, level: nextLevel }], { onSuccess: () => notify(has ? "Removida da build desejada." : "Adicionada à build desejada."), onError: (e) => notify(errMsg(e, "Não consegui salvar."), "error") });
  };
  const goSection = (s: Section) => {
    setSection(s);
    requestAnimationFrame(() => sectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  const detail = (close?: () => void) =>
    skill ? (
      <SkillDetail
        s={skill}
        view={v}
        busy={act.upgrade.isPending}
        onUpgrade={upgrade}
        onSimulate={() => setPlan({ title: `Caminho até ${skill.name}`, targets: [{ key: skill.key, level: Math.min(skill.maxLevel, skill.level + 1) }], origin: "build" })}
        onDesire={desire}
        onMission={(m) => setSeed({ message: m, mode: "create", autoSend: true })}
        onSelect={pick}
        onClose={close}
      />
    ) : (
      <Box title="Detalhes">
        <p className="text-sm text-rpg-muted">Selecione uma habilidade na árvore.</p>
      </Box>
    );

  return (
    <div className="w-full px-3 py-4 sm:px-5 md:px-6 md:py-6">
      <Banner v={v} onReset={() => setResetOpen(true)} onAuto={() => setPresetPick(true)} />

      <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Ramos da árvore">
        {[{ key: "all" as const, label: "Visão Geral" }, ...v.branches].map((b) => {
          const Icon = b.key === "all" ? Sparkles : BRANCH_ICON[b.key];
          return (
            <button
              key={b.key}
              role="tab"
              aria-selected={branch === b.key}
              onClick={() => setBranch(b.key)}
              className={clsx("flex shrink-0 items-center gap-1.5 border-2 px-3 py-1.5 text-sm font-semibold", branch === b.key ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-rpg-border bg-rpg-panel text-rpg-text hover:border-rpg-gold/50")}
              style={{ borderRadius: 4 }}
            >
              <Icon size={15} className={b.key === "all" ? "text-rpg-gold" : BRANCH_TEXT[b.key]} aria-hidden />
              {b.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <div className="order-2 grid gap-3 sm:grid-cols-2 xl:order-1 xl:grid-cols-1">
          <JourneyCard v={v} />
          <ActiveEffects v={v} onAll={() => goSection("bonus")} />
        </div>

        <section className="rpg-panel rpg-panel-gold order-1 min-w-0 p-2 xl:order-2" aria-label="Árvore">
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <label className="relative min-w-[160px] flex-1">
              <span className="sr-only">Buscar habilidade</span>
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar habilidade…" className="w-full border border-rpg-border bg-rpg-bg-2 py-1.5 pl-7 pr-2 text-xs text-rpg-text outline-none focus:border-rpg-gold" style={{ borderRadius: 3 }} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-rpg-text">
              <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="accent-[rgb(var(--rpg-gold))]" />
              Destacar disponíveis ({v.stats.available})
            </label>
            <button type="button" onClick={() => setAsList((x) => !x)} aria-pressed={asList} className={clsx("flex items-center gap-1 border px-2 py-1 text-xs font-semibold", asList ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-text")} style={{ borderRadius: 3 }}>
              {asList ? <Network size={13} aria-hidden /> : <List size={13} aria-hidden />} {asList ? "Ver árvore" : "Ver em lista"}
            </button>
          </div>
          {asList ? (
            <SkillList v={{ ...v, branches: branch === "all" ? v.branches : v.branches.filter((b) => b.key === branch) }} onSelect={pick} selected={selected} />
          ) : (
            <SkillGraph skills={v.skills} selected={selected} onSelect={pick} branch={branch} search={search} onlyAvailable={onlyAvailable} available={v.points.available} justUnlocked={burst} height="h-[440px] sm:h-[540px] xl:h-[600px]" />
          )}
          <Legend />
        </section>

        <aside className="order-3 hidden min-w-0 xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)] xl:max-h-[760px]" aria-label="Habilidade selecionada">
          {detail()}
        </aside>
      </div>

      {/* Tablet e celular: detalhes em painel inferior (tela cheia no celular). */}
      {sheet && skill && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 xl:hidden" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="h-[88vh] w-full max-w-xl overflow-hidden bg-rpg-bg p-2 sm:h-[80vh]" role="dialog" aria-modal="true" aria-label={`Detalhes: ${skill.name}`}>
            {detail(() => setSheet(false))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <BranchProgress v={v} onBranch={(b) => setBranch(b)} />
        <PresetsBar
          presets={v.presets}
          onOpen={(p) => setPlan({ title: `Preset ${p.name}`, targets: p.targets, origin: "preset" })}
          onNew={() => setEditor({ preset: null, targets: null })}
          onEdit={(p) => setEditor({ preset: p, targets: null })}
          onDuplicate={(p) => act.duplicatePreset.mutate(p.id, { onSuccess: () => notify(`“${p.name}” duplicado.`), onError: (e) => notify(errMsg(e, "Não consegui duplicar."), "error") })}
          onDelete={(p) => window.confirm(`Excluir o preset “${p.name}”?`) && act.deletePreset.mutate(p.id, { onSuccess: () => notify("Preset excluído."), onError: (e) => notify(errMsg(e, "Não consegui excluir."), "error") })}
        />
      </div>

      <div ref={sectionsRef} className="mt-4 scroll-mt-4">
        <nav className="mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Ferramentas da árvore">
          {SECTION_META.map(([k, label, icon]) => (
            <button key={k} role="tab" aria-selected={section === k} onClick={() => setSection(k)} className={clsx("flex shrink-0 items-center gap-1.5 border-2 px-3 py-1.5 text-sm font-semibold", section === k ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 4 }}>
              {icon}
              {label}
            </button>
          ))}
        </nav>
        {section === "bonus" && <Arsenal effects={fx.data} notify={notify} />}
        {section === "oraculo" && <OraclePanel view={v} notify={notify} onPlan={(targets, title) => setPlan({ title, targets, origin: "oracle" })} onMission={(m) => setSeed({ message: m, mode: "create", autoSend: true })} onSelect={pick} />}
        {section === "simulador" && <Simulator v={v} onSimulate={(targets) => setPlan({ title: "Simulação da build", targets, origin: "build" })} />}
        {section === "historico" && <HistoryPanel v={v} />}
        {section === "estatisticas" && <StatsPanel v={v} />}
        {section === "automacoes" && <AutomationsPanel module="skills" title="Automações da Árvore" icon={<Workflow size={18} />} intro="A–J: requisitos e efeitos acompanham cada ação; as diárias concedem PH e avisam sem nunca evoluir nada sozinhas." />}
      </div>

      <Modal open={presetPick} onClose={() => setPresetPick(false)} title="Distribuição automática">
        <p className="mb-2 text-sm text-rpg-muted">Escolha um preset: a simulação mostra o que pode ser aplicado agora com os seus PH e requisitos.</p>
        <ul className="space-y-1.5">
          {v.presets.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => (setPresetPick(false), setPlan({ title: `Preset ${p.name}`, targets: p.targets, origin: "preset" }))} className="w-full border border-rpg-border bg-rpg-bg-2/70 px-3 py-2 text-left hover:border-rpg-gold" style={{ borderRadius: 3 }}>
                <span className="block text-sm font-bold text-rpg-text">{p.name}</span>
                <span className="block text-xs text-rpg-muted">{p.description || `${p.targets.length} alvos`}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {plan && <PlanModal open title={plan.title} targets={plan.targets} origin={plan.origin} view={v} onClose={() => setPlan(null)} notify={notify} onSavePreset={(t) => (setPlan(null), setEditor({ preset: null, targets: t }))} />}
      <PresetEditor open={!!editor} preset={editor?.preset ?? null} initialTargets={editor?.targets ?? null} view={v} onClose={() => setEditor(null)} notify={notify} />
      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} notify={notify} view={v} />
      {seed && <MissionAdvisor tasks={tasks} seed={seed} layout="drawer" onClose={() => setSeed(null)} onCreated={() => (setSeed(null), notify("Missão criada. Ela conta como evidência real quando for concluída."))} notify={notify} />}
      <RPGToast message={toast?.m ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

function Banner({ v, onReset, onAuto }: { v: SkillTreeView; onReset: () => void; onAuto: () => void }) {
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
          <p className="max-w-2xl text-sm text-rpg-text sm:text-base">Desbloqueie capacidades, fortaleça suas rotinas e personalize as ferramentas do LifeOS nas áreas que mais importam.</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-5 xl:flex-nowrap xl:pb-0 xl:pl-0">
          <div className="flex items-center gap-2 border-2 border-rpg-gold bg-rpg-bg/80 px-4 py-2 shadow-[0_0_24px_-6px_rgb(var(--rpg-purple)/0.8)]" style={{ borderRadius: 4 }} title={v.points.rule}>
            <img src={`${SKILL_ART}/crystal.webp`} alt="" aria-hidden className="pixelated h-10 w-10" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rpg-gold-light">Pontos disponíveis</p>
              <p className="font-rpg text-3xl font-bold leading-none text-rpg-text">{v.points.available}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:flex-col">
            <RPGButton variant="secondary" onClick={onReset} disabled={!v.stats.unlocked}>
              <RotateCcw size={14} aria-hidden /> Resetar árvore
            </RPGButton>
            <RPGButton variant="secondary" onClick={onAuto}>
              <Sparkles size={14} aria-hidden /> Distribuição automática
            </RPGButton>
          </div>
        </div>
      </div>
    </header>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["border-rpg-border bg-rpg-bg", "Bloqueada"],
    ["border-dashed border-rpg-blue bg-rpg-bg", "Indisponível por requisito"],
    ["border-rpg-gold animate-pulse bg-rpg-bg", "Disponível"],
    ["border-rpg-blue bg-rpg-blue/40", "Desbloqueada"],
    ["border-rpg-gold bg-rpg-gold/50", "Maximizada"],
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
        <span className="w-4 border-t-2 border-dashed border-rpg-muted" aria-hidden /> Alternativa (OU)
      </li>
    </ul>
  );
}

function Simulator({ v, onSimulate }: { v: SkillTreeView; onSimulate: (targets: Target[]) => void }) {
  const [levels, setLevels] = useState<Record<string, number>>(() => Object.fromEntries(v.desired.map((d) => [d.key, d.level])));
  const targets = Object.entries(levels).filter(([, l]) => l > 0).map(([key, level]) => ({ key, level }));
  const [open, setOpen] = useState<SkillBranch>("produtividade");
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Box title="Monte a build desejada" icon={<Network size={14} />}>
        <p className="-mt-1 mb-2 text-[11px] text-rpg-muted">Escolha níveis-alvo. O simulador calcula pré-requisitos, custo total e o caminho mínimo — sem gastar nada.</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {v.branches.map((b) => (
            <button key={b.key} type="button" onClick={() => setOpen(b.key)} aria-pressed={open === b.key} className={clsx("border px-2 py-1 text-xs font-semibold", open === b.key ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 3 }}>
              {b.label}
            </button>
          ))}
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {v.skills
            .filter((s) => s.branch === open)
            .map((s) => (
              <li key={s.key} className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 px-2 py-1 text-[12.5px]" style={{ borderRadius: 3 }}>
                <span className="min-w-0 flex-1 truncate text-rpg-text">{s.name}</span>
                <span className="text-[10.5px] text-rpg-muted">atual {s.level}</span>
                <select aria-label={`Alvo de ${s.name}`} value={levels[s.key] ?? 0} onChange={(e) => setLevels((x) => ({ ...x, [s.key]: Number(e.target.value) }))} className="border border-rpg-border bg-rpg-bg px-1 py-0.5 text-xs text-rpg-text" style={{ borderRadius: 2 }}>
                  {Array.from({ length: s.maxLevel + 1 }, (_, i) => (
                    <option key={i} value={i} disabled={i > 0 && i <= s.level}>
                      {i === 0 ? "—" : `nv. ${i}`}
                    </option>
                  ))}
                </select>
              </li>
            ))}
        </ul>
      </Box>
      <Box title="Resumo" icon={<Sparkles size={14} />} gold>
        <p className="text-sm text-rpg-text">{targets.length} alvo(s) selecionado(s).</p>
        {v.desiredPlan && (
          <p className="mt-1 text-xs text-rpg-muted">
            Build salva: {v.desiredPlan.done}/{v.desiredPlan.targets} alvos concluídos · {v.desiredPlan.readyCost} PH prontos para aplicar · custo restante {v.desiredPlan.totalCost} PH.
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <RPGButton variant="primary" disabled={!targets.length} onClick={() => onSimulate(targets)}>
            <Network size={14} aria-hidden /> Simular build
          </RPGButton>
          {targets.length > 0 && (
            <RPGButton variant="secondary" onClick={() => setLevels({})}>
              <X size={14} aria-hidden /> Limpar seleção
            </RPGButton>
          )}
        </div>
      </Box>
    </div>
  );
}
