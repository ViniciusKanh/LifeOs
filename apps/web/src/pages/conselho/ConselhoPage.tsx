import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Coins, Flag, Map as MapIcon, RefreshCw, ScrollText, Shield, Sparkles, Swords } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGToast } from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { TavernStepper, type TavernStepDef } from "@/components/taverna/TavernStepper";
import { fmtDay } from "@/components/taverna/tavernFormat";
import { CouncilFocusStep, CouncilReportStep, MAX_FOCUS } from "@/components/conselho/CouncilSteps";
import { blockError, CouncilAgendaStep, CouncilDistributionStep, SealSummaryBadges, type Assignments, type BlockDraft } from "@/components/conselho/CouncilPlanSteps";
import { usePreviousWeekSummary, useWarCouncil } from "@/hooks/useWarCouncil";
import { useRhythm } from "@/hooks/useRhythm";
import { useWide } from "@/hooks/useWide";
import type { CouncilFocusRef, CouncilProposal } from "@/services/warCouncilService";

const STEPS: TavernStepDef[] = [
  { id: "relatorio", label: "Relatório da semana", icon: ScrollText },
  { id: "focos", label: "Focos da semana", icon: Flag },
  { id: "distribuicao", label: "Distribuir missões", icon: Swords },
  { id: "agenda", label: "Blocos na Agenda", icon: CalendarDays },
  { id: "selar", label: "Selar o plano", icon: Shield },
];

const SUBTITLES = [
  "Como foi a semana passada, com os mesmos números da Revisão Semanal.",
  `Escolha até ${MAX_FOCUS} campanhas, projetos ou metas para guiar a semana.`,
  "A proposta respeita a sua capacidade real de cada dia. Ajuste como quiser.",
  "Opcional: proteja horários na Agenda para as missões mais importantes.",
  "Revise e confirme. Só aqui o plano é gravado.",
];

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sameFocus = (a: CouncilFocusRef[], b: CouncilFocusRef[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.type === x.type && y.id === x.id));

/**
 * Conselho de Guerra — o par "para frente" da Revisão Semanal:
 * relatório → focos → distribuição pelos dias → Agenda → selar.
 * Nada é gravado até "Selar o plano" (proposta → confirmação).
 */
export function ConselhoPage() {
  const [params, setParams] = useSearchParams();
  const weekParam = params.get("semana") ?? undefined;
  const fromUrl = STEPS.findIndex((s) => s.id === params.get("passo"));
  const [step, setStep] = useState(fromUrl >= 0 ? fromUrl : 0);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([fromUrl >= 0 ? fromUrl : 0]));
  const [focus, setFocus] = useState<CouncilFocusRef[]>([]);
  const [notes, setNotes] = useState("");
  const [proposal, setProposal] = useState<CouncilProposal | null>(null);
  const [proposalFocus, setProposalFocus] = useState<CouncilFocusRef[] | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [blocks, setBlocks] = useState<Record<string, BlockDraft>>({});
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [sealedNow, setSealedNow] = useState<{ xp: boolean; planned: number; events: number } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const desktop = useWide("(min-width: 1024px)");

  const { overview, proposal: proposalMutation, seal } = useWarCouncil(weekParam);
  const data = overview.data;
  const summary = usePreviousWeekSummary(data?.previousWeekStart);
  const rhythm = useRhythm(90);
  const suggestedHour = rhythm.data?.bestHours[0]?.hour ?? null;

  // Plano já selado da semana: começa a partir dele (focos e notas).
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || hydratedFor.current === data.weekStart) return;
    hydratedFor.current = data.weekStart;
    setFocus(data.plan?.focus ?? []);
    setNotes(data.plan?.notes ?? "");
    setProposal(null);
    setProposalFocus(null);
    setAssignments({});
    setBlocks({});
    setSealedNow(null);
  }, [data]);

  const go = useCallback(
    (i: number) => {
      const next = Math.min(STEPS.length - 1, Math.max(0, i));
      setStep(next);
      setVisited((v) => new Set(v).add(next));
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("passo", STEPS[next].id);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const loadProposal = useCallback(async () => {
    if (!data) return;
    try {
      const p = await proposalMutation.mutateAsync({ week: data.weekStart, focus });
      setProposal(p);
      setProposalFocus(focus);
      setAssignments(Object.fromEntries(p.assignments.map((a) => [a.taskId, a.plannedDate])));
      setBlocks({});
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Não foi possível montar a proposta.", tone: "error" });
    }
  }, [data, focus, proposalMutation]);

  // Entrar na distribuição com focos diferentes dos da última proposta recalcula
  // (uma vez por combinação semana+focos — erro não vira laço de requisições).
  const requestedKey = useRef<string | null>(null);
  useEffect(() => {
    if (step < 2 || !data || proposalMutation.isPending) return;
    const key = `${data.weekStart}|${JSON.stringify([...focus].sort((a, b) => `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`)))}`;
    if (proposal && proposalFocus && sameFocus(focus, proposalFocus)) return;
    if (requestedKey.current === key) return;
    requestedKey.current = key;
    void loadProposal();
  }, [step, data, focus, proposal, proposalFocus, proposalMutation.isPending, loadProposal]);

  const toggleFocus = (ref: CouncilFocusRef) =>
    setFocus((cur) => {
      if (cur.some((f) => f.type === ref.type && f.id === ref.id)) return cur.filter((f) => !(f.type === ref.type && f.id === ref.id));
      return cur.length >= MAX_FOCUS ? cur : [...cur, { type: ref.type, id: ref.id }];
    });

  const setBlock = (taskId: string, patch: Partial<BlockDraft>) =>
    setBlocks((cur) => {
      const task = proposal?.candidates.find((c) => c.id === taskId);
      const base: BlockDraft = cur[taskId] ?? {
        enabled: false,
        startTime: `${String(suggestedHour ?? 9).padStart(2, "0")}:00`,
        durationMinutes: Math.min(480, Math.max(15, task?.estimateMinutes ?? 30)),
      };
      return { ...cur, [taskId]: { ...base, ...patch } };
    });

  const activeBlocks = useMemo(
    () => Object.entries(blocks).filter(([id, b]) => b.enabled && assignments[id]),
    [blocks, assignments],
  );
  const blockProblem = activeBlocks.map(([, b]) => blockError(b)).find(Boolean) ?? null;
  const plannedCount = Object.values(assignments).filter(Boolean).length;

  const onSeal = async () => {
    if (!data || !proposal || blockProblem) return;
    try {
      const r = await seal.mutateAsync({
        weekStart: data.weekStart,
        focus,
        notes: notes.trim() || null,
        assignments: proposal.candidates.map((c) => ({ taskId: c.id, plannedDate: assignments[c.id] ?? null })),
        events: activeBlocks.map(([taskId, b]) => ({ taskId, date: String(assignments[taskId]), startTime: b.startTime, durationMinutes: b.durationMinutes })),
      });
      setSealedNow({ xp: r.xpAwarded, planned: r.plannedCount, events: r.eventsCreated });
      setToast({ text: r.xpAwarded ? `Plano selado! +${data.reward.xp} XP e +${data.reward.coins} moedas.` : "Plano selado e atualizado.", tone: "success" });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Não foi possível selar o plano.", tone: "error" });
    }
  };

  const changeWeek = (weekStart: string) => {
    const p = new URLSearchParams(params);
    p.set("semana", weekStart);
    p.set("passo", STEPS[0].id);
    setParams(p, { replace: true });
    setStep(0);
    setVisited(new Set([0]));
  };

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  // Semanas passadas não se planejam: a seta "anterior" para na semana atual.
  const currentMonday = data ? addDays(data.today, -((new Date(`${data.today}T12:00:00Z`).getUTCDay() + 6) % 7)) : null;

  const weekSwitcher = data && (
    <div className="m-1.5 flex flex-wrap items-center gap-1.5 bg-rpg-bg/85 p-1.5" role="group" aria-label="Semana do plano">
      <RPGButton variant="ghost" onClick={() => changeWeek(addDays(data.weekStart, -7))} aria-label="Semana anterior" disabled={!currentMonday || addDays(data.weekStart, -7) < currentMonday}>
        <ArrowLeft size={14} aria-hidden />
      </RPGButton>
      <span className="font-pixel text-xs text-rpg-gold-light px-1">
        {fmtDay(data.weekStart)} – {fmtDay(data.weekEnd)}
      </span>
      <RPGButton variant="ghost" onClick={() => changeWeek(addDays(data.weekStart, 7))} aria-label="Próxima semana" disabled={!currentMonday || addDays(data.weekStart, 7) > addDays(currentMonday, 28)}>
        <ArrowRight size={14} aria-hidden />
      </RPGButton>
    </div>
  );

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-4">
      <RPGPageHeader
        banner="revisoes"
        size="md"
        eyebrow="Planejamento da semana"
        title="Conselho de Guerra"
        subtitle="Escolha os focos, distribua as missões pelos dias que cabem de verdade e sele o plano da semana."
        aside={weekSwitcher}
      />

      <RPGHowItWorks
        storageKey="lifeos-conselho-como-funciona"
        steps={[
          { icon: ScrollText, title: "Olhe para trás", text: "O relatório da semana passada mostra o que você conseguiu cumprir.", tone: "blue" },
          { icon: MapIcon, title: "Trace a rota", text: "Até 3 focos e as missões distribuídas pela sua capacidade real.", tone: "purple" },
          { icon: Shield, title: "Sele o plano", text: "Só ao selar as datas planejadas e os blocos da Agenda são gravados.", tone: "gold" },
        ]}
      />

      {data?.plan?.sealedAt && (
        <RPGPanel variant="success">
          <div className="flex flex-wrap items-center gap-3">
            <Shield size={18} className="text-rpg-green" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-rpg-text">Plano desta semana já selado. Você pode replanejar e selar de novo.</p>
              {data.adherence.planned > 0 && (
                <>
                  <p className="text-xs text-rpg-muted mt-0.5">
                    Aderência: {data.adherence.completed} de {data.adherence.planned} missões planejadas concluídas{data.adherence.pct != null ? ` (${data.adherence.pct}%)` : ""}.
                  </p>
                  <RPGProgressBar className="mt-1.5 max-w-md" tone="green" label="Aderência ao plano" value={data.adherence.completed} max={data.adherence.planned} showLabel={false} />
                </>
              )}
            </div>
          </div>
        </RPGPanel>
      )}

      <TavernStepper steps={STEPS} current={step} visited={visited} onSelect={go} label="Passos do Conselho de Guerra" />

      <section aria-labelledby="conselho-passo-titulo" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="font-pixel text-[11px] uppercase tracking-[0.14em] text-rpg-gold">
              Passo {step + 1} de {STEPS.length}
            </p>
            <h2 id="conselho-passo-titulo" ref={headingRef} tabIndex={-1} className="rpg-title text-xl font-bold outline-none sm:text-2xl">
              {current.label}
            </h2>
            <p className="text-sm text-rpg-muted">{SUBTITLES[step]}</p>
          </div>
          {step === 2 && proposal && (
            <RPGButton variant="ghost" onClick={() => void loadProposal()} disabled={proposalMutation.isPending}>
              <RefreshCw size={14} className={proposalMutation.isPending ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden /> Refazer proposta
            </RPGButton>
          )}
        </div>

        {overview.isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Carregando o Conselho de Guerra">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="rpg-panel h-24 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
            <div className="rpg-panel h-48 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : overview.isError || !data ? (
          <div className="rpg-panel rpg-panel-danger p-4" role="alert">
            <p className="text-sm text-rpg-text">{overview.error instanceof Error ? overview.error.message : "Não foi possível abrir o Conselho de Guerra agora."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <RPGButton variant="secondary" onClick={() => void overview.refetch()}>
                <RefreshCw size={14} aria-hidden /> Tentar de novo
              </RPGButton>
              {weekParam && (
                <RPGButton variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Ir para a semana sugerida
                </RPGButton>
              )}
            </div>
          </div>
        ) : (
          <>
            {current.id === "relatorio" && (
              <CouncilReportStep
                previousWeekStart={data.previousWeekStart}
                summary={summary.data}
                summaryLoading={summary.isLoading}
                summaryError={summary.isError}
                previousAdherence={data.previousAdherence}
                previousPlanSealed={data.previousPlanSealed}
              />
            )}
            {current.id === "focos" && <CouncilFocusStep options={data.focusOptions} focus={focus} onToggle={toggleFocus} notes={notes} onNotes={setNotes} />}
            {(current.id === "distribuicao" || current.id === "agenda" || current.id === "selar") &&
              (!proposal || proposalMutation.isPending ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7" aria-busy="true" aria-label="Montando a proposta da semana">
                  {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} className="rpg-panel h-40 animate-pulse motion-reduce:animate-none" />
                  ))}
                </div>
              ) : current.id === "distribuicao" ? (
                <CouncilDistributionStep proposal={proposal} assignments={assignments} onAssign={(id, d) => setAssignments((a) => ({ ...a, [id]: d }))} desktop={desktop} />
              ) : current.id === "agenda" ? (
                <CouncilAgendaStep proposal={proposal} assignments={assignments} blocks={blocks} onBlock={setBlock} suggestedHour={suggestedHour} />
              ) : (
                <RPGPanel title="Selo do Conselho" icon={<Shield size={14} aria-hidden />} variant="gold">
                  <div className="space-y-3">
                    <SealSummaryBadges planned={plannedCount} blocks={activeBlocks.length} focus={focus.length} />
                    {focus.length > 0 && (
                      <ul className="text-sm text-rpg-text list-disc pl-5">
                        {focus.map((f) => (
                          <li key={`${f.type}:${f.id}`}>{data.focusOptions.find((o) => o.type === f.type && o.id === f.id)?.title ?? "Foco"}</li>
                        ))}
                      </ul>
                    )}
                    {notes.trim() && <p className="text-sm text-rpg-muted italic break-words">“{notes.trim()}”</p>}
                    {plannedCount === 0 && <p className="text-xs text-rpg-orange">Nenhuma missão com dia: o plano será selado sem distribuição (e sem XP).</p>}
                    {blockProblem && (
                      <p className="text-xs text-rpg-red" role="alert">
                        Bloco da Agenda inválido: {blockProblem}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {!data.reward.awarded && plannedCount > 0 && (
                        <>
                          <RPGBadge tone="purple" icon={<Sparkles size={10} aria-hidden />}>
                            +{data.reward.xp} XP
                          </RPGBadge>
                          <RPGBadge tone="gold" icon={<Coins size={10} aria-hidden />}>
                            +{data.reward.coins}
                          </RPGBadge>
                        </>
                      )}
                      <RPGButton variant="primary" onClick={() => void onSeal()} disabled={seal.isPending || !!blockProblem} className="ml-auto">
                        <Shield size={14} aria-hidden /> {seal.isPending ? "Selando..." : data.plan?.sealedAt ? "Selar de novo" : "Selar o plano"}
                      </RPGButton>
                    </div>
                    {sealedNow && (
                      <div className="rpg-panel rpg-panel-success p-3" role="status">
                        <p className="text-sm text-rpg-text">
                          Plano selado: {sealedNow.planned} {sealedNow.planned === 1 ? "missão planejada" : "missões planejadas"}
                          {sealedNow.events > 0 ? ` e ${sealedNow.events} ${sealedNow.events === 1 ? "bloco criado" : "blocos criados"} na Agenda` : ""}.
                        </p>
                        <p className="text-xs text-rpg-muted mt-1">
                          Acompanhe em{" "}
                          <Link to="/hoje" className="underline text-rpg-gold-light">
                            Hoje
                          </Link>{" "}
                          e no{" "}
                          <Link to="/calendario" className="underline text-rpg-gold-light">
                            Calendário
                          </Link>
                          . A aderência aparece aqui ao longo da semana.
                        </p>
                      </div>
                    )}
                  </div>
                </RPGPanel>
              ))}
          </>
        )}
      </section>

      {!last && (
        <nav aria-label="Navegação entre passos" className="flex items-center justify-between gap-2 border-t border-rpg-border/70 pt-3 pr-16 sm:pr-20">
          <RPGButton variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft size={14} aria-hidden /> <span className="hidden sm:inline">Anterior</span>
            <span className="sr-only sm:hidden">Passo anterior</span>
          </RPGButton>
          <RPGButton variant="primary" onClick={() => go(step + 1)} disabled={!data}>
            Continuar <ArrowRight size={14} aria-hidden />
          </RPGButton>
        </nav>
      )}
      {last && (
        <nav aria-label="Navegação entre passos" className="flex items-center border-t border-rpg-border/70 pt-3">
          <RPGButton variant="ghost" onClick={() => go(step - 1)}>
            <ArrowLeft size={14} aria-hidden /> Anterior
          </RPGButton>
        </nav>
      )}

      <RPGToast message={toast?.text ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
