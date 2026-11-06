import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, BookOpenCheck, CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, Lock, Save, Sparkles, Stamp } from "lucide-react";
import { RPGButton, RPGToast } from "@/components/rpg";
import { Tag } from "@/components/forge3/ForgeShared";
import { Modal } from "@/components/ui/Modal";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { MissionAdvisor, type AdvisorSeed } from "@/components/missions3/MissionAdvisor";
import { useTasks } from "@/hooks/useTasks";
import { useJourneyReview, useJourneyReviewActions } from "@/hooks/useJourneyReview";
import { ApiError } from "@/services/api";
import { habitService } from "@/services/habitService";
import { goalsService } from "@/services/goalsService";
import { planningHubService } from "@/services/planningHubService";
import { journeyReviewService, KIND_TAB, KIND_TITLE, type JourneyReview, type ReviewAction, type ReviewAdvice, type ReviewAdvisorMode, type ReviewKind } from "@/services/journeyReviewService";
import { ChestPanel, EvolutionPanel, GoalsPanel, HistoryStrip, InsightsPanel, LifeScorePanel, MissionsPendingPanel, Portrait, ReviewBanner, RevisorCard, SealsPanel, TimelinePanel } from "./ReviewOverview";
import { ActionsEditor, BlocksList, CycleQuestions, PlanEditor, Reflection, WeeklyRitual, type ConvertKind, type Draft } from "./ReviewRitual";
import { ReviewAdvisor } from "./ReviewAdvisor";
import { KIND_UNIT, cap, canSealLocal, fmtDate, fmtDateTime, fmtIndicator, plain } from "./ReviewShared";

const KINDS: ReviewKind[] = ["weekly", "monthly", "quarterly", "annual"];
const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);
const draftOf = (d: JourneyReview): Draft => ({ steps: d.review.steps, answers: d.review.answers, reflection: d.review.reflection, actions: d.review.actions, plan: d.review.plan });

/** Revisões 3.0 — semanal, mensal, trimestral e anual num só módulo (tela reconstruída do zero). */
export function ReviewsScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // ?ciclo= (novo) ou ?tipo= (links antigos, ex.: lembrete do Hoje).
  const rawKind = params.get("ciclo") ?? params.get("tipo");
  const kind = (KINDS.includes(rawKind as ReviewKind) ? rawKind : "weekly") as ReviewKind;
  const key = params.get("periodo");
  const q = useJourneyReview(kind, key);
  const act = useJourneyReviewActions(kind, q.data?.key ?? key);
  const { tasks } = useTasks();
  const d = q.data;

  const [toast, setToast] = useState<{ m: string; tone: "success" | "error" } | null>(null);
  const notify = (m: string, tone: "success" | "error" = "success") => setToast({ m, tone });
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const base = useRef<string | null>(null);
  const dirty = useRef(false);
  const version = useRef(0);
  const loadedFor = useRef<string>("");
  const [advice, setAdvice] = useState<ReviewAdvice | null>(null);
  const [adviceMode, setAdviceMode] = useState<ReviewAdvisorMode | null>(null);
  const [missionSeed, setMissionSeed] = useState<AdvisorSeed | null>(null);
  const pendingAction = useRef<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blocks, setBlocks] = useState<Array<{ title: string; date: string; start: string; minutes: number }> | null>(null);
  const [blocksBusy, setBlocksBusy] = useState(false);
  const [reserving, setReserving] = useState<string | null>(null);
  const ritualRef = useRef<HTMLDivElement>(null);

  const go = (k: ReviewKind, periodKey: string | null) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("ciclo", k);
        n.delete("tipo");
        if (periodKey) n.set("periodo", periodKey);
        else n.delete("periodo");
        return n;
      },
      { replace: false },
    );

  // Carrega o rascunho local quando o período muda (ou quando não há edição pendente).
  useEffect(() => {
    if (!d) return;
    const id = `${d.kind}:${d.key}`;
    if (loadedFor.current !== id || !dirty.current) {
      loadedFor.current = id;
      setDraftState(draftOf(d));
      base.current = d.review.updatedAt;
      dirty.current = false;
      setAdvice(null);
      setAdviceMode(null);
      setBlocks(null);
    }
  }, [d]);

  const save = useCallback(
    (silent = true) => {
      if (!d || !draft || !dirty.current) return Promise.resolve(true);
      const v = version.current;
      setSaving("saving");
      return act.save
        .mutateAsync({ ...draft, baseUpdatedAt: base.current })
        .then((r) => {
          base.current = r.updatedAt;
          if (version.current === v) dirty.current = false;
          setSaving("saved");
          if (!silent) notify(d.review.status === "sealed" ? `Alterações registradas no histórico (revisão ${r.revision}).` : "Revisão salva.");
          return true;
        })
        .catch((e: unknown) => {
          setSaving("error");
          if (e instanceof ApiError && e.status === 409) {
            dirty.current = false;
            notify("Esta revisão foi alterada em outra aba ou aparelho. Carreguei a versão mais recente.", "error");
            act.refresh();
          } else notify(errMsg(e, "Não consegui salvar a revisão."), "error");
          return false;
        });
    },
    [d, draft, act],
  );

  // Autosave: 1,5 s depois da última edição.
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(t);
  }, [draft, save]);

  const set = (fn: (x: Draft) => Draft) =>
    setDraftState((cur) => {
      if (!cur) return cur;
      dirty.current = true;
      version.current++;
      return fn(cur);
    });

  /* ─── Conselheiro de Revisão ─── */
  const runAdvisor = (mode: ReviewAdvisorMode, question?: string) => {
    setAdviceMode(mode);
    act.advisor.mutate(
      { mode, question: question ?? null },
      {
        onSuccess: (r) => setAdvice(r),
        onError: (e) => notify(errMsg(e, "O Conselheiro não respondeu agora."), "error"),
      },
    );
  };
  const insertDraft = (dr: Record<string, string>) => {
    let n = 0;
    set((x) => {
      const answers = { ...x.answers };
      for (const [k, v] of Object.entries(dr)) if (!plain(answers[k] ?? "")) (answers[k] = `${v}`), n++;
      return { ...x, answers };
    });
    notify(n ? `Rascunho inserido em ${n} resposta(s) vazia(s). Revise e ajuste com suas palavras.` : "Todas as respostas já tinham texto; nada foi sobrescrito.");
  };

  /* ─── Conversões das ações ─── */
  const markConverted = (actionId: string, to: ConvertKind, refId: string | null) =>
    set((x) => ({
      ...x,
      actions: x.actions.map((a) => (a.id === actionId ? { ...a, convertedTo: to, refId } : a)),
      plan: {
        ...x.plan,
        missionIds: to === "missao" && refId ? [...x.plan.missionIds, refId].slice(0, 20) : x.plan.missionIds,
        habitIds: to === "habito" && refId ? [...x.plan.habitIds, refId].slice(0, 10) : x.plan.habitIds,
        goalIds: to === "meta" && refId ? [...x.plan.goalIds, refId].slice(0, 10) : x.plan.goalIds,
      },
    }));
  const convert = async (a: ReviewAction, to: ConvertKind) => {
    if (!d) return;
    if (to === "missao") {
      pendingAction.current = a.id;
      setMissionSeed({ message: a.text, mode: "create", source: "review", sourceRef: `${d.kind}:${d.key}`, autoSend: true });
      return;
    }
    if (to === "experimento" || to === "protocolo") {
      try {
        await navigator.clipboard?.writeText(a.text);
      } catch {
        // sem área de transferência: só navega
      }
      markConverted(a.id, to, null);
      await save();
      notify(`Texto copiado. Abra um novo ${to === "experimento" ? "experimento" : "protocolo"} e cole a ideia.`);
      navigate(to === "experimento" ? "/experimentos" : "/protocolos");
      return;
    }
    setConverting(`${a.id}:${to}`);
    try {
      if (to === "habito") {
        const h = await habitService.create({ name: a.text.slice(0, 80), frequency: "daily" });
        markConverted(a.id, to, h.id);
        notify(`Hábito criado: “${h.name}”. Ajuste frequência e meta em Hábitos.`);
      } else {
        const g = await goalsService.create({ title: a.text.slice(0, 120) });
        markConverted(a.id, to, g.id);
        notify(`Meta criada: “${g.title}”.`);
      }
    } catch (e) {
      notify(errMsg(e, "Não consegui converter a ação."), "error");
    } finally {
      setConverting(null);
    }
  };

  /* ─── Selar, baú, plano, blocos ─── */
  const seal = async () => {
    if (!(await save())) return;
    act.seal.mutate(undefined, {
      onSuccess: (r) => {
        dirty.current = false;
        notify(r.alreadySealed ? "Esta revisão já estava selada." : r.warCouncil ? `Revisão selada! O plano foi levado ao Conselho de Guerra da semana de ${fmtDate(r.warCouncil.weekStart)} como rascunho.` : "Revisão selada! Agora o baú pode ser resgatado.");
      },
      onError: (e) => notify(errMsg(e, "Não consegui selar."), "error"),
    });
  };
  const claim = () =>
    act.claim.mutate(undefined, {
      onSuccess: (r) => notify(r.granted ? `Baú aberto: +${r.xp} XP e +${r.coins} moedas.` : r.alreadyClaimed ? "A recompensa deste período já foi resgatada." : r.reason ?? "Recompensa indisponível.", r.granted || r.alreadyClaimed ? "success" : "error"),
      onError: (e) => notify(errMsg(e, "Não consegui abrir o baú."), "error"),
    });
  const applyPlan = async () => {
    if (!(await save())) return;
    act.applyPlan.mutate(undefined, {
      onSuccess: (r) => notify(r.warCouncil ? `Plano enviado ao Conselho de Guerra (semana de ${fmtDate(r.warCouncil.weekStart)}, ${r.warCouncil.priorities} prioridade(s)). Revise lá antes de selar.` : "Plano registrado como aplicado."),
      onError: (e) => notify(errMsg(e, "Não consegui aplicar o plano."), "error"),
    });
  };
  const suggestBlocks = async () => {
    if (!d) return;
    if (!(await save())) return;
    setBlocksBusy(true);
    try {
      const r = await journeyReviewService.blocks(d.kind, d.key);
      if (!r.enabled) notify("A automação “Blocos na Agenda” está desligada.", "error");
      setBlocks(r.blocks);
    } catch (e) {
      notify(errMsg(e, "Não consegui sugerir horários."), "error");
    } finally {
      setBlocksBusy(false);
    }
  };
  const reserve = async (b: { title: string; date: string; start: string; minutes: number }) => {
    const k = `${b.date}${b.start}${b.title}`;
    setReserving(k);
    try {
      await planningHubService.createBlock({ title: b.title, date: b.date, start: b.start, durationMinutes: b.minutes, category: "foco" });
      setBlocks((list) => (list ?? []).filter((x) => `${x.date}${x.start}${x.title}` !== k));
      notify(`Bloco reservado na Agenda: ${b.title}.`);
    } catch (e) {
      notify(errMsg(e, "Não consegui reservar o bloco."), "error");
    } finally {
      setReserving(null);
    }
  };

  if (q.isError)
    return (
      <div className="w-full px-4 py-6 md:px-6">
        <KindTabs kind={kind} onKind={(k) => go(k, null)} />
        <p className="rpg-panel mt-4 flex items-center gap-2 p-4 text-sm text-rpg-red">
          <AlertTriangle size={16} aria-hidden /> {errMsg(q.error, "Não consegui carregar esta revisão.")}
          <RPGButton variant="secondary" className="ml-auto" onClick={() => go(kind, null)}>
            Ir para o período atual
          </RPGButton>
        </p>
      </div>
    );
  if (!d || !draft)
    return (
      <div className="w-full space-y-4 px-4 py-6 md:px-6" aria-busy aria-label="Carregando revisão">
        <KindTabs kind={kind} onKind={(k) => go(k, null)} />
        <div className="rpg-panel h-52 animate-pulse" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rpg-panel h-40 animate-pulse" />
          <div className="rpg-panel h-40 animate-pulse" />
          <div className="rpg-panel h-40 animate-pulse" />
        </div>
      </div>
    );

  const sealed = d.review.status === "sealed";
  const local = canSealLocal(d, draft.answers, draft.reflection, draft.plan.priorities.length + draft.plan.focus.length, draft.actions.length);
  const ritual = {
    d,
    draft,
    set,
    readOnly: false,
    onAiDraft: () => runAdvisor("reflection"),
    aiBusy: act.advisor.isPending,
    onConvert: (a: ReviewAction, to: ConvertKind) => void convert(a, to),
    converting,
    onSuggestBlocks: () => void suggestBlocks(),
    onApplyPlan: () => void applyPlan(),
    applying: act.applyPlan.isPending,
    onOpenDiary: () => navigate("/diario"),
    flush: () => void save(),
  };

  return (
    <div className="w-full px-3 py-4 sm:px-5 md:px-6 md:py-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <KindTabs kind={kind} onKind={(k) => go(k, null)} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => go(kind, d.nav.prevKey)} className="rpg-panel p-2 text-rpg-muted hover:text-rpg-gold" aria-label="Período anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="rpg-panel flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-rpg-text">
            <CalendarDays size={14} className="text-rpg-gold" aria-hidden /> {cap(d.label)}
            <span className="hidden text-xs font-normal text-rpg-muted sm:inline">
              {fmtDate(d.range.from)} – {fmtDate(d.range.to)}
            </span>
          </span>
          <button onClick={() => d.nav.nextKey && go(kind, d.nav.nextKey)} disabled={!d.nav.nextKey} className="rpg-panel p-2 text-rpg-muted hover:text-rpg-gold disabled:opacity-40" aria-label="Próximo período">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <ReviewBanner
        d={d}
        onNew={() => {
          go(kind, null);
          requestAnimationFrame(() => ritualRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
        onHistory={() => setHistoryOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onAi={() => runAdvisor("analyze")}
        aiBusy={act.advisor.isPending}
      />
      <RevisorCard d={d} className="mt-3 w-full xl:hidden" />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Portrait d={d} />
            <LifeScorePanel d={d} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <EvolutionPanel d={d} />
            <InsightsPanel d={d} />
          </div>

          <div ref={ritualRef} className="scroll-mt-4 space-y-4">
            {sealed && (
              <p className="flex items-center gap-2 border border-rpg-green/50 bg-rpg-green/10 p-2 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
                <Lock size={13} className="text-rpg-green" aria-hidden /> Revisão selada em {fmtDateTime(d.review.sealedAt)}. Você ainda pode editar: cada alteração fica registrada no histórico (revisão {d.review.revision}) e não paga XP de novo.
              </p>
            )}
            {d.kind === "weekly" ? (
              <WeeklyRitual {...ritual} />
            ) : (
              <>
                <CycleQuestions d={d} draft={draft} set={set} readOnly={false} flush={ritual.flush} />
                <Reflection {...ritual} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <ActionsEditor draft={draft} set={set} readOnly={false} onConvert={ritual.onConvert} converting={converting} unit={KIND_UNIT[d.kind].next} />
                  <PlanEditor {...ritual} />
                </div>
              </>
            )}
            {(blocks || blocksBusy) && (
              <section className="rpg-panel p-3" aria-label="Blocos sugeridos">
                <h3 className="mb-2 font-pixel text-[12px] uppercase tracking-wider text-rpg-gold-light">Blocos sugeridos na Agenda</h3>
                {blocksBusy ? <Loader2 className="animate-spin text-rpg-muted" aria-label="Buscando horários" /> : <BlocksList blocks={blocks ?? []} onReserve={(b) => void reserve(b)} reserving={reserving} />}
                <p className="mt-2 text-[10.5px] text-rpg-muted">Nada entra na Agenda sem o seu clique em “Reservar”.</p>
              </section>
            )}

            <SealBar d={d} local={local} saving={saving} onSave={() => void save(false)} onSeal={() => void seal()} sealing={act.seal.isPending} onExport={() => exportBook(d, draft)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GoalsPanel d={d} onOpenGoals={() => navigate("/metas")} />
            <TimelinePanel d={d} />
          </div>
          <HistoryStrip d={d} onGo={(k, p) => go(k, p)} />
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4" aria-label="Conselheiro e recompensas">
          <ReviewAdvisor
            d={d}
            result={advice}
            mode={adviceMode}
            busy={act.advisor.isPending}
            onRun={runAdvisor}
            onInsertDraft={insertDraft}
            onMission={(request) => setMissionSeed({ message: request, mode: "create", source: "review", sourceRef: `${d.kind}:${d.key}`, autoSend: true })}
            onUsePriority={(p) => {
              if (draft.plan.priorities.includes(p)) return;
              if (draft.plan.priorities.length >= 5) return notify("O plano já tem 5 prioridades.", "error");
              set((x) => ({ ...x, plan: { ...x.plan, priorities: [...x.plan.priorities, p] } }));
              notify("Prioridade adicionada ao plano.");
            }}
          />
          <ChestPanel d={d} onClaim={claim} busy={act.claim.isPending} />
          <MissionsPendingPanel d={d} onOpen={(id) => navigate(`/tarefas?task=${id}`)} />
          <SealsPanel d={d} />
        </aside>
      </div>

      {/* Conselheiro de Missões reaproveitado (mesmo agente da tela de Missões). */}
      {missionSeed && (
        <MissionAdvisor
          tasks={tasks}
          seed={missionSeed}
          layout="drawer"
          onClose={() => {
            setMissionSeed(null);
            pendingAction.current = null;
          }}
          onCreated={(ids) => {
            if (pendingAction.current) markConverted(pendingAction.current, "missao", ids[0] ?? null);
            pendingAction.current = null;
            setMissionSeed(null);
            notify(ids.length > 1 ? `${ids.length} missões criadas a partir da revisão.` : "Missão criada a partir da revisão.");
          }}
          notify={notify}
        />
      )}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Revisões anteriores" size="lg">
        <HistoryList d={d} onGo={(k, p) => (setHistoryOpen(false), go(k, p))} />
      </Modal>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Configurar ciclos" size="lg">
        <CycleSettings
          d={d}
          busy={act.settings.isPending}
          onSave={(v) =>
            act.settings.mutate(v, {
              onSuccess: () => {
                setSettingsOpen(false);
                notify("Ciclos configurados.");
              },
              onError: (e) => notify(errMsg(e, "Não consegui salvar."), "error"),
            })
          }
        />
      </Modal>
      <RPGToast message={toast?.m ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}

function KindTabs({ kind, onKind }: { kind: ReviewKind; onKind: (k: ReviewKind) => void }) {
  return (
    <nav className="rpg-panel flex gap-1 overflow-x-auto p-1" role="tablist" aria-label="Ciclo da revisão">
      {KINDS.map((k) => (
        <button
          key={k}
          role="tab"
          aria-selected={kind === k}
          onClick={() => onKind(k)}
          className={clsx("shrink-0 border-2 px-3 py-1.5 text-sm font-semibold", kind === k ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")}
          style={{ borderRadius: 3 }}
        >
          {KIND_TAB[k]}
        </button>
      ))}
    </nav>
  );
}

function SealBar({
  d,
  local,
  saving,
  onSave,
  onSeal,
  sealing,
  onExport,
}: {
  d: JourneyReview;
  local: { filled: number; required: number; ok: boolean };
  saving: "idle" | "saving" | "saved" | "error";
  onSave: () => void;
  onSeal: () => void;
  sealing: boolean;
  onExport: () => void;
}) {
  const sealed = d.review.status === "sealed";
  return (
    <section className="rpg-panel rpg-panel-gold flex flex-wrap items-center gap-3 p-3" aria-label="Selar revisão">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-rpg-text">
          <Stamp size={16} className="text-rpg-gold" aria-hidden />
          {sealed ? "Período selado" : local.ok ? "Pronta para selar" : `Faltam respostas: ${local.filled}/${local.required}`}
          <span className="text-[11px] font-normal text-rpg-muted">
            {saving === "saving" ? "salvando…" : saving === "saved" ? "salvo" : saving === "error" ? "erro ao salvar" : ""}
          </span>
        </p>
        {!sealed && !local.ok && <p className="text-[11px] text-rpg-muted">{d.seal.reason}</p>}
        {sealed && <p className="text-[11px] text-rpg-muted">Selada em {fmtDateTime(d.review.sealedAt)}. XP e moedas: pelo baú, uma única vez.</p>}
      </div>
      <RPGButton variant="secondary" onClick={onSave}>
        <Save size={14} aria-hidden /> Salvar
      </RPGButton>
      <RPGButton variant="secondary" onClick={onExport} title="Baixar em HTML para guardar ou imprimir em PDF">
        {d.kind === "annual" ? <BookOpenCheck size={14} aria-hidden /> : <Download size={14} aria-hidden />} {d.kind === "annual" ? "Livro da Jornada" : "Exportar"}
      </RPGButton>
      {!sealed && (
        <RPGButton variant="primary" onClick={onSeal} disabled={!local.ok || sealing}>
          {sealing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Stamp size={14} aria-hidden />} {KIND_TITLE[d.kind].seal}
        </RPGButton>
      )}
    </section>
  );
}

function HistoryList({ d, onGo }: { d: JourneyReview; onGo: (k: ReviewKind, key: string) => void }) {
  if (!d.history.length) return <p className="text-sm text-rpg-muted">Nenhuma revisão registrada ainda.</p>;
  return (
    <ol className="relative space-y-2 border-l-2 border-rpg-border pl-4">
      {d.history.map((h) => (
        <li key={`${h.kind}${h.key}`} className="relative">
          <span className={clsx("absolute -left-[21px] top-2 h-2.5 w-2.5 rotate-45 border", h.status === "sealed" ? "border-rpg-gold bg-rpg-gold" : "border-rpg-border bg-rpg-bg")} aria-hidden />
          <button onClick={() => onGo(h.kind, h.key)} className="flex w-full flex-wrap items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-left hover:border-rpg-gold" style={{ borderRadius: 3 }}>
            <Tag tone="muted">{KIND_TAB[h.kind]}</Tag>
            <span className="font-semibold text-rpg-text">{h.label}</span>
            <Tag tone={h.status === "sealed" ? "green" : h.status === "legacy" ? "blue" : "orange"}>{h.status === "sealed" ? "selada" : h.status === "legacy" ? "legado" : "rascunho"}</Tag>
            {h.planApplied && <Tag tone="purple">plano aplicado</Tag>}
            <span className="ml-auto text-xs text-rpg-muted">
              Life Score {h.lifeScore ?? "—"} · {h.tasksDone ?? "—"} missões
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function CycleSettings({ d, busy, onSave }: { d: JourneyReview; busy: boolean; onSave: (v: Record<ReviewKind, number>) => void }) {
  const [v, setV] = useState<Record<ReviewKind, number>>(d.settings);
  const max: Record<ReviewKind, number> = { weekly: 4, monthly: 8, quarterly: 6, annual: 9 };
  return (
    <div className="space-y-3">
      <p className="text-sm text-rpg-muted">Quantas respostas (incluindo a reflexão) cada ciclo exige antes de poder ser selado.</p>
      {KINDS.map((k) => (
        <label key={k} className="flex items-center gap-3 text-sm text-rpg-text">
          <span className="w-28">{KIND_TAB[k]}</span>
          <input type="range" min={1} max={max[k]} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: Number(e.target.value) }))} className="flex-1 accent-[rgb(var(--rpg-gold))]" aria-label={`Respostas mínimas — ${KIND_TAB[k]}`} />
          <span className="w-8 text-right font-bold tabular-nums">{v[k]}</span>
        </label>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <RPGButton variant="primary" disabled={busy} onClick={() => onSave(v)}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />} Salvar
        </RPGButton>
      </div>
      <AutomationsPanel module="reviews" title="Automações das Revisões" icon={<Sparkles size={18} />} intro="A–L: lembretes e pré-análise diários; as demais agem na própria tela. Nenhuma grava sem a sua confirmação, exceto os registros ao selar (Crônica, conquistas e rascunho no Conselho de Guerra)." />
    </div>
  );
}

/* ─── Exportação (Livro da Jornada / relatório do período) ─── */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function exportBook(d: JourneyReview, draft: Draft) {
  const title = d.kind === "annual" ? `Livro da Jornada — ${d.label}` : `${KIND_TITLE[d.kind].title} — ${d.label}`;
  const rows = d.indicators
    .filter((i) => i.value != null)
    .map((i) => `<tr><td>${esc(i.label)}</td><td>${esc(fmtIndicator(i))} ${esc(i.unit)}</td><td>${i.deltaPct == null ? esc(i.note ?? "—") : `${i.deltaPct > 0 ? "+" : ""}${i.deltaPct}%`}</td></tr>`)
    .join("");
  const answers = d.questions
    .filter((q) => plain(draft.answers[q.key] ?? ""))
    .map((q) => `<h3>${esc(q.label)}</h3><p>${esc(draft.answers[q.key]!).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const timeline = d.timeline.map((e) => `<li><strong>${esc(e.title)}</strong> <span>${esc(fmtDateTime(e.at))}${e.detail ? ` · ${esc(e.detail)}` : ""}</span></li>`).join("");
  const goals = d.goals.map((g) => `<li>${esc(g.title)} — ${g.progressPct ?? 0}%</li>`).join("");
  const actions = draft.actions.map((a) => `<li>${esc(a.text)}</li>`).join("");
  const plan = [draft.plan.objective ? `<p><strong>Foco:</strong> ${esc(draft.plan.objective)}</p>` : "", draft.plan.priorities.length ? `<ol>${draft.plan.priorities.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""].join("");
  // A reflexão vem do editor rico; remove scripts/atributos de evento por segurança antes de embutir.
  const reflection = draft.reflection.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Georgia,serif;max-width:820px;margin:40px auto;padding:0 20px;color:#2a1e12;background:#fbf6ea}h1{font-size:30px;border-bottom:3px double #a8832f;padding-bottom:8px}h2{color:#6b3fa0;margin-top:32px}h3{margin-bottom:4px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e3d6b6;padding:4px 6px}li span{color:#7a6a50;font-size:13px}.meta{color:#7a6a50}</style></head><body>
<h1>${esc(title)}</h1><p class="meta">${esc(fmtDate(d.range.from))} – ${esc(fmtDate(d.range.to))} · ${d.review.status === "sealed" ? `selada em ${esc(fmtDateTime(d.review.sealedAt))}` : "rascunho"} · gerado pelo LifeOS com dados reais do período.</p>
<h2>Retrato</h2><table>${rows}</table>
${answers ? `<h2>Respostas</h2>${answers}` : ""}
${plain(reflection) ? `<h2>Reflexão</h2>${reflection}` : ""}
${actions ? `<h2>Ajustes</h2><ul>${actions}</ul>` : ""}
${plan ? `<h2>Plano para ${esc(KIND_UNIT[d.kind].next)}</h2>${plan}` : ""}
${goals ? `<h2>Metas</h2><ul>${goals}</ul>` : ""}
${timeline ? `<h2>Crônica</h2><ul>${timeline}</ul>` : ""}
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${d.kind === "annual" ? "livro-da-jornada" : "revisao"}-${d.key}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
