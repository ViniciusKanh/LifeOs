import { useMemo, useState } from "react";
import clsx from "clsx";
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Hammer, History, Loader2, Play, Plus, Power, PowerOff, Rocket, Trash2, Undo2, Wand2 } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { KitSection } from "@/components/rpg-modules/ModuleKit";
import { Modal } from "@/components/ui/Modal";
import { useForgeActions, useForgeDictionary } from "@/hooks/useForge";
import { PRIMARY_LABEL, fmtNum, primaryOf, type Alg, type Dictionary, type ForgeModel, type ForgeOverview, type ModelInput, type Primary, type Problem, type Version } from "@/services/forgeService";
import { Empty, FIELD, R, StatusBadge, errMsg, fmtDate, fmtDateTime, templateIcon, type Notify } from "./ForgeShared";

const BASE_ALGS: Alg[] = ["baseline", "persistence"];
const SCHEDULE_LABEL = { manual: "Manual", weekly: "Semanal (automação)", monthly: "Mensal (automação)" } as const;

/** Resumo da métrica principal no holdout (modelo x baseline), sem misturar escalas. */
export function HoldoutLine({ v }: { v: Version | null }) {
  if (!v) return <span className="text-rpg-muted">Sem versão treinada</span>;
  const h = v.metrics.holdout;
  if (!h) return <span className="text-rpg-muted">Sem holdout (dados insuficientes)</span>;
  const p = v.metrics.primary;
  return (
    <span>
      {PRIMARY_LABEL[p].split(" (")[0]}: <b className="tabular-nums text-rpg-text">{fmtNum(primaryOf(h.model, p))}</b> <span className="text-rpg-muted">vs baseline {fmtNum(primaryOf(h.baseline, p))}</span>
    </span>
  );
}

/* ═════════════ Artefatos ═════════════ */

export function ArtifactsTab({ o, notify, onWizard, onOpenVersions }: { o: ForgeOverview; notify: Notify; onWizard: () => void; onOpenVersions: (id: string) => void }) {
  const a = useForgeActions();
  const [confirmDel, setConfirmDel] = useState<ForgeModel | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const models = o.models.filter((m) => showArchived || m.status !== "arquivado");
  const busy = (id: string) => (a.train.isPending && a.train.variables === id) || (a.backtest.isPending && a.backtest.variables === id) || (a.monitor.isPending && a.monitor.variables === id);
  const train = (m: ForgeModel) =>
    a.train.mutate(m.id, { onSuccess: (r) => notify(r.message, r.status === "insufficient" ? "error" : "success"), onError: (e) => notify(errMsg(e, "O treino falhou."), "error") });
  return (
    <div className="space-y-3">
      <KitSection title="Modelos prontos" icon={<Wand2 size={16} />} action={<RPGButton variant="gold" onClick={onWizard}><Plus size={14} aria-hidden /> Novo modelo</RPGButton>}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {o.templates.map((t) => (
            <div key={t.key} className="flex flex-col gap-1.5 border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-rpg-text">
                <span className="text-rpg-purple" aria-hidden>{templateIcon(t.icon)}</span>
                {t.name}
              </p>
              <p className="flex-1 text-[11px] text-rpg-muted">{t.description}</p>
              <RPGBadge tone="muted">{t.problem === "classification" ? "Classificação" : "Regressão"}</RPGBadge>
              <RPGButton
                variant={t.created ? "ghost" : "secondary"}
                disabled={t.created || a.fromTemplate.isPending}
                onClick={() => a.fromTemplate.mutate(t.key, { onSuccess: () => notify(`${t.name} criado. Treine quando quiser.`), onError: (e) => notify(errMsg(e, "Não foi possível criar."), "error") })}
              >
                {t.created ? <><Check size={14} aria-hidden /> Criado</> : <><Hammer size={14} aria-hidden /> Forjar</>}
              </RPGButton>
            </div>
          ))}
        </div>
      </KitSection>
      <KitSection
        title="Seus artefatos"
        icon={<Hammer size={16} />}
        action={
          <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
          </label>
        }
      >
        {!models.length ? (
          <Empty icon={<Hammer size={24} />} title="Nenhum modelo ainda">Use um modelo pronto acima ou crie o seu com o assistente.</Empty>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {models.map((m) => (
              <article key={m.id} className="flex min-w-0 flex-col gap-2 border-2 border-rpg-border bg-rpg-panel p-3" style={R} aria-label={m.name}>
                <header className="flex items-start gap-2">
                  <span className="text-rpg-purple" aria-hidden>{templateIcon(o.templates.find((t) => t.key === m.templateKey)?.icon)}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-rpg-text">{m.name}</h3>
                    <p className="truncate text-[11px] text-rpg-muted">
                      {m.targetLabel} · D+{m.horizon} · {m.features.length} variáveis · {SCHEDULE_LABEL[m.schedule]}
                    </p>
                  </div>
                  <StatusBadge m={m} />
                </header>
                <p className="text-xs">
                  <HoldoutLine v={m.active ?? m.latest} />
                </p>
                <p className="text-[11px] text-rpg-muted">
                  {m.versions} versões · último treino {fmtDateTime(m.lastTrainedAt)}
                  {m.active && ` · ativa v${m.active.version} (${m.active.algorithmLabel})`}
                  {m.monitor && ` · monitor: ${m.monitor.status.replace("_", " ")}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <RPGButton variant="primary" disabled={busy(m.id) || m.status === "arquivado"} onClick={() => train(m)}>
                    {a.train.isPending && a.train.variables === m.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} Treinar
                  </RPGButton>
                  <RPGButton variant="secondary" disabled={!m.versions} onClick={() => onOpenVersions(m.id)}>
                    <History size={14} aria-hidden /> Versões
                  </RPGButton>
                  <RPGButton
                    variant="ghost"
                    disabled={busy(m.id) || !m.latest}
                    onClick={() => a.backtest.mutate(m.id, { onSuccess: (r) => notify(r?.status === "done" ? "Backtest concluído (ver Relatórios)." : "Dados insuficientes para backtest.", r?.status === "done" ? "success" : "error"), onError: (e) => notify(errMsg(e, "Backtest falhou."), "error") })}
                  >
                    Backtest
                  </RPGButton>
                  <RPGButton
                    variant="ghost"
                    disabled={busy(m.id) || !m.activeVersionId}
                    onClick={() => a.monitor.mutate(m.id, { onSuccess: () => notify("Monitoramento atualizado."), onError: (e) => notify(errMsg(e, "Falha no monitoramento."), "error") })}
                  >
                    Monitorar
                  </RPGButton>
                  {m.activeVersionId && (
                    <RPGButton variant="ghost" onClick={() => a.deactivate.mutate(m.id, { onSuccess: () => notify("Modelo desativado. As previsões futuras foram retiradas."), onError: (e) => notify(errMsg(e, "Falha ao desativar."), "error") })}>
                      <PowerOff size={14} aria-hidden /> Desativar
                    </RPGButton>
                  )}
                  <RPGButton variant="ghost" aria-label={m.status === "arquivado" ? "Restaurar modelo" : "Arquivar modelo"} onClick={() => a.archive.mutate({ id: m.id, archived: m.status !== "arquivado" }, { onError: (e) => notify(errMsg(e, "Falha ao arquivar."), "error") })}>
                    {m.status === "arquivado" ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
                  </RPGButton>
                  <RPGButton variant="danger" aria-label="Excluir modelo" onClick={() => setConfirmDel(m)}>
                    <Trash2 size={14} aria-hidden />
                  </RPGButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </KitSection>
      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Excluir modelo?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <RPGButton variant="ghost" onClick={() => setConfirmDel(null)}>Cancelar</RPGButton>
            <RPGButton
              variant="danger"
              disabled={a.remove.isPending}
              onClick={() => confirmDel && a.remove.mutate(confirmDel.id, { onSuccess: () => { setConfirmDel(null); notify("Modelo excluído."); }, onError: (e) => notify(errMsg(e, "Não foi possível excluir."), "error") })}
            >
              Excluir definitivamente
            </RPGButton>
          </div>
        }
      >
        <p className="text-sm text-rpg-text">
          “{confirmDel?.name}”, suas {confirmDel?.versions} versões e previsões serão apagadas. Seus registros de vida não são afetados. Prefira <b>arquivar</b> se quiser manter o histórico.
        </p>
      </Modal>
    </div>
  );
}

/* ═════════════ Assistente de 9 etapas ═════════════ */

const WIZ = ["Objetivo", "Problema", "Alvo", "Horizonte", "Variáveis", "Algoritmos", "Validação", "Busca", "Revisão"] as const;

function initialInput(d: Dictionary): ModelInput {
  return {
    name: "",
    problem: "classification",
    target: d.targets.find((t) => t.problem === "classification")?.key ?? "",
    horizon: 1,
    features: d.features.map((f) => f.key),
    algorithms: d.algorithms.classification.map((a) => a.key).filter((a) => !BASE_ALGS.includes(a)),
    validation: { folds: 4, holdoutPct: 0.2, search: "random", searchBudget: 4, primary: "balanced_accuracy", margin: 0.03 },
    schedule: "manual",
  };
}

export function ModelWizard({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: Notify }) {
  const dict = useForgeDictionary();
  return (
    <Modal open={open} onClose={onClose} title="Forjar novo modelo" size="lg">
      {dict.isLoading && <Loader2 className="mx-auto animate-spin text-rpg-purple" aria-label="Carregando dicionário" />}
      {dict.isError && <p className="text-sm text-rpg-red">Não foi possível carregar o dicionário de dados.</p>}
      {dict.data && open && <WizardBody d={dict.data} onClose={onClose} notify={notify} />}
    </Modal>
  );
}

function WizardBody({ d, onClose, notify }: { d: Dictionary; onClose: () => void; notify: Notify }) {
  const a = useForgeActions();
  const [step, setStep] = useState(0);
  const [inp, setInp] = useState<ModelInput>(() => initialInput(d));
  const [trainNow, setTrainNow] = useState(true);
  const set = (p: Partial<ModelInput>) => setInp((s) => ({ ...s, ...p }));
  const setV = (p: Partial<ModelInput["validation"]>) => setInp((s) => ({ ...s, validation: { ...s.validation, ...p } }));
  const groups = useMemo(() => {
    const g = new Map<string, Dictionary["features"]>();
    for (const f of d.features) g.set(f.source, [...(g.get(f.source) ?? []), f]);
    return [...g.entries()];
  }, [d.features]);
  const setProblem = (p: Problem) =>
    set({
      problem: p,
      target: d.targets.find((t) => t.problem === p)?.key ?? "",
      algorithms: d.algorithms[p].map((x) => x.key).filter((x) => !BASE_ALGS.includes(x)),
      validation: { ...inp.validation, primary: p === "classification" ? "balanced_accuracy" : "mae", margin: p === "classification" ? 0.03 : 0.05 },
    });
  const problems: string | null =
    step === 0 && inp.name.trim().length < 2 ? "Dê um nome com pelo menos 2 letras." : step === 4 && inp.features.length < 2 ? "Escolha pelo menos 2 variáveis." : step === 5 && !inp.algorithms.length ? "Escolha pelo menos 1 algoritmo além da linha de base." : null;
  const primaries: Primary[] = inp.problem === "classification" ? ["balanced_accuracy", "brier", "log_loss"] : ["mae", "rmse"];
  const submit = () =>
    a.create.mutate(inp, {
      onSuccess: (m) => {
        notify(`Modelo “${m.name}” criado.`);
        if (trainNow) a.train.mutate(m.id, { onSuccess: (r) => notify(r.message, r.status === "insufficient" ? "error" : "success"), onError: (e) => notify(errMsg(e, "O treino falhou."), "error") });
        onClose();
      },
      onError: (e) => notify(errMsg(e, "Não foi possível criar o modelo."), "error"),
    });
  const target = d.targets.find((t) => t.key === inp.target);

  return (
    <div className="space-y-3">
      <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Etapas">
        {WIZ.map((w, i) => (
          <li key={w} className={clsx("shrink-0 border px-2 py-1 font-pixel text-[9px] uppercase", i === step ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : i < step ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {w}
          </li>
        ))}
      </ol>

      <div className="min-h-[220px] text-sm text-rpg-text">
        {step === 0 && (
          <label className="block text-xs text-rpg-muted">
            Nome e objetivo do modelo
            <input autoFocus value={inp.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Vou estudar amanhã?" className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />
            <span className="mt-2 block">Um modelo aprende padrões do seu próprio histórico. Ele nunca altera dados — apenas estima.</span>
          </label>
        )}
        {step === 1 && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-xs text-rpg-muted">Que tipo de pergunta?</legend>
            {(["classification", "regression"] as Problem[]).map((p) => (
              <label key={p} className={clsx("cursor-pointer border-2 p-3", inp.problem === p ? "border-rpg-purple bg-rpg-purple/10" : "border-rpg-border")} style={R}>
                <input type="radio" name="problem" className="sr-only" checked={inp.problem === p} onChange={() => setProblem(p)} />
                <b>{p === "classification" ? "Sim ou não" : "Quanto"}</b>
                <span className="block text-xs text-rpg-muted">{p === "classification" ? "Classificação: probabilidade de algo acontecer no dia." : "Regressão: estimativa de um valor (minutos, horas, nível)."}</span>
              </label>
            ))}
          </fieldset>
        )}
        {step === 2 && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs text-rpg-muted">O que prever (alvo)</legend>
            {d.targets.filter((t) => t.problem === inp.problem).map((t) => (
              <label key={t.key} className={clsx("flex cursor-pointer gap-2 border p-2", inp.target === t.key ? "border-rpg-purple bg-rpg-purple/10" : "border-rpg-border")} style={R}>
                <input type="radio" name="target" checked={inp.target === t.key} onChange={() => set({ target: t.key })} />
                <span>
                  <b>{t.label}</b>
                  <span className="block text-xs text-rpg-muted">{t.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {step === 3 && (
          <div className="space-y-2">
            <label className="block text-xs text-rpg-muted">
              Horizonte: prever com {inp.horizon} dia(s) de antecedência
              <input type="range" min={1} max={7} value={inp.horizon} onChange={(e) => set({ horizon: Number(e.target.value) })} className="mt-2 w-full accent-[rgb(var(--rpg-purple))]" />
            </label>
            <p className="text-xs text-rpg-muted">{d.leakageRule} Horizontes maiores usam informação mais antiga e tendem a errar mais.</p>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <RPGButton variant="ghost" onClick={() => set({ features: d.features.map((f) => f.key) })}>Todas</RPGButton>
              <RPGButton variant="ghost" onClick={() => set({ features: [] })}>Nenhuma</RPGButton>
              <span className="ml-auto self-center text-xs text-rpg-muted">{inp.features.length} selecionadas</span>
            </div>
            <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {groups.map(([src, fs]) => (
                <fieldset key={src}>
                  <legend className="font-pixel text-[10px] uppercase text-rpg-purple">{src}</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {fs.map((f) => (
                      <label key={f.key} className="flex items-start gap-1.5 text-xs" title={f.description}>
                        <input type="checkbox" checked={inp.features.includes(f.key)} onChange={(e) => set({ features: e.target.checked ? [...inp.features, f.key] : inp.features.filter((k) => k !== f.key) })} />
                        <span>{f.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-2">
            <p className="text-xs text-rpg-muted">A linha de base{inp.problem === "regression" ? " e a persistência (repetir o último valor) sempre entram" : " (frequência histórica) sempre entra"} na arena — um modelo só é aprovado se superá-la.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {d.algorithms[inp.problem].filter((x) => !BASE_ALGS.includes(x.key)).map((x) => (
                <label key={x.key} className="flex items-center gap-1.5 border border-rpg-border p-2 text-sm" style={R}>
                  <input type="checkbox" checked={inp.algorithms.includes(x.key)} onChange={(e) => set({ algorithms: e.target.checked ? [...inp.algorithms, x.key] : inp.algorithms.filter((k) => k !== x.key) })} />
                  {x.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-rpg-muted">
              Dobras walk-forward ({inp.validation.folds})
              <input type="range" min={3} max={6} value={inp.validation.folds} onChange={(e) => setV({ folds: Number(e.target.value) })} className="mt-2 w-full" />
            </label>
            <label className="block text-xs text-rpg-muted">
              Holdout final: últimos {Math.round(inp.validation.holdoutPct * 100)}% dos dias
              <input type="range" min={10} max={30} step={5} value={Math.round(inp.validation.holdoutPct * 100)} onChange={(e) => setV({ holdoutPct: Number(e.target.value) / 100 })} className="mt-2 w-full" />
            </label>
            <label className="block text-xs text-rpg-muted">
              Métrica principal
              <select value={inp.validation.primary} onChange={(e) => setV({ primary: e.target.value as Primary })} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }}>
                {primaries.map((p) => (
                  <option key={p} value={p}>{PRIMARY_LABEL[p]}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-rpg-muted">
              Margem mínima sobre a linha de base ({Math.round(inp.validation.margin * 100)}%)
              <input type="range" min={0} max={20} value={Math.round(inp.validation.margin * 100)} onChange={(e) => setV({ margin: Number(e.target.value) / 100 })} className="mt-2 w-full" />
            </label>
            <p className="text-xs text-rpg-muted sm:col-span-2">A divisão é sempre temporal: o modelo nunca vê dias posteriores aos que está sendo avaliado.</p>
          </div>
        )}
        {step === 7 && (
          <div className="space-y-2">
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="mb-1 text-xs text-rpg-muted">Busca de hiperparâmetros (só nas dobras de validação, nunca no holdout)</legend>
              {(["random", "grid", "none"] as const).map((s) => (
                <label key={s} className={clsx("cursor-pointer border-2 p-2 text-xs", inp.validation.search === s ? "border-rpg-purple bg-rpg-purple/10" : "border-rpg-border")} style={R}>
                  <input type="radio" name="search" className="sr-only" checked={inp.validation.search === s} onChange={() => setV({ search: s })} />
                  <b className="text-sm">{s === "random" ? "Aleatória" : s === "grid" ? "Grade completa" : "Padrões"}</b>
                  <span className="block text-rpg-muted">{s === "random" ? "Amostra combinações (semente fixa)." : s === "grid" ? "Testa todas — mais lento." : "Sem busca."}</span>
                </label>
              ))}
            </fieldset>
            {inp.validation.search === "random" && (
              <label className="block text-xs text-rpg-muted">
                Combinações por algoritmo: {inp.validation.searchBudget}
                <input type="range" min={1} max={8} value={inp.validation.searchBudget} onChange={(e) => setV({ searchBudget: Number(e.target.value) })} className="mt-2 w-full" />
              </label>
            )}
          </div>
        )}
        {step === 8 && (
          <div className="space-y-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-rpg-muted">Nome</dt><dd>{inp.name}</dd>
              <dt className="text-rpg-muted">Alvo</dt><dd>{target?.label} · D+{inp.horizon}</dd>
              <dt className="text-rpg-muted">Variáveis</dt><dd>{inp.features.length}</dd>
              <dt className="text-rpg-muted">Algoritmos</dt><dd>{inp.algorithms.length} + linha de base</dd>
              <dt className="text-rpg-muted">Validação</dt><dd>{inp.validation.folds} dobras · holdout {Math.round(inp.validation.holdoutPct * 100)}% · {PRIMARY_LABEL[inp.validation.primary]}</dd>
            </dl>
            <label className="block text-xs text-rpg-muted">
              Retreino
              <select value={inp.schedule} onChange={(e) => set({ schedule: e.target.value as ModelInput["schedule"] })} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }}>
                {Object.entries(SCHEDULE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={trainNow} onChange={(e) => setTrainNow(e.target.checked)} /> Treinar logo após criar
            </label>
          </div>
        )}
      </div>

      {problems && <p className="text-xs text-rpg-orange" role="alert">{problems}</p>}
      <div className="flex justify-between gap-2">
        <RPGButton variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft size={14} aria-hidden /> Voltar
        </RPGButton>
        {step < WIZ.length - 1 ? (
          <RPGButton variant="primary" disabled={!!problems} onClick={() => setStep((s) => s + 1)}>
            Avançar <ChevronRight size={14} aria-hidden />
          </RPGButton>
        ) : (
          <RPGButton variant="gold" disabled={a.create.isPending} onClick={submit}>
            {a.create.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Hammer size={14} aria-hidden />} Forjar modelo
          </RPGButton>
        )}
      </div>
    </div>
  );
}

/* ═════════════ Modelos: registro de versões ═════════════ */

export function ModelsTab({ o, notify, selected, onSelect, onWizard }: { o: ForgeOverview; notify: Notify; selected: string | null; onSelect: (id: string) => void; onWizard: () => void }) {
  const a = useForgeActions();
  const [compare, setCompare] = useState<string[]>([]);
  const m = o.models.find((x) => x.id === selected) ?? o.models[0];
  if (!m)
    return (
      <Empty icon={<Hammer size={24} />} title="Nenhum modelo">
        <RPGButton variant="gold" className="mt-2" onClick={onWizard}><Plus size={14} aria-hidden /> Criar com o assistente</RPGButton>
      </Empty>
    );
  const versions = o.versions.filter((v) => v.modelId === m.id);
  const cmp = versions.filter((v) => compare.includes(v.id));
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <KitSection title="Modelos" icon={<Hammer size={16} />} action={<RPGButton variant="ghost" aria-label="Novo modelo" onClick={onWizard}><Plus size={14} aria-hidden /></RPGButton>}>
        <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {o.models.map((x) => (
            <li key={x.id} className="shrink-0">
              <button type="button" onClick={() => { onSelect(x.id); setCompare([]); }} className={clsx("w-full border-2 px-2 py-1.5 text-left text-sm", x.id === m.id ? "border-rpg-purple bg-rpg-purple/10 text-rpg-text" : "border-rpg-border text-rpg-muted")} style={R} aria-pressed={x.id === m.id}>
                {x.name}
                <span className="block text-[10px]">{x.versions} versões</span>
              </button>
            </li>
          ))}
        </ul>
      </KitSection>
      <div className="min-w-0 space-y-3">
        <KitSection title={`Registro de versões · ${m.name}`} icon={<History size={16} />} action={<StatusBadge m={m} />}>
          {!versions.length ? (
            <Empty icon={<History size={22} />} title="Sem versões">Treine o modelo em Artefatos para registrar a primeira versão.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1 font-normal">Comparar</th>
                    <th className="p-1 font-normal">Versão</th>
                    <th className="p-1 font-normal">Algoritmo</th>
                    <th className="p-1 font-normal">Holdout</th>
                    <th className="p-1 font-normal">Dados</th>
                    <th className="p-1 font-normal">Hash</th>
                    <th className="p-1 font-normal">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-t border-rpg-border/60 align-top">
                      <td className="p-1">
                        <input type="checkbox" aria-label={`Comparar versão ${v.version}`} checked={compare.includes(v.id)} onChange={(e) => setCompare((c) => (e.target.checked ? [...c, v.id].slice(-3) : c.filter((x) => x !== v.id)))} />
                      </td>
                      <td className="p-1">
                        v{v.version}{" "}
                        <RPGBadge tone={v.status === "ativa" ? "green" : v.status === "arquivada" ? "muted" : "blue"}>{v.status}</RPGBadge>
                        <span className="block text-[10px] text-rpg-muted">{fmtDateTime(v.trainedAt)}</span>
                      </td>
                      <td className="p-1">
                        {v.algorithmLabel}
                        <span className="block text-[10px] text-rpg-muted">{v.metrics.beatsBaseline ? "superou a base" : "não superou a base"}</span>
                      </td>
                      <td className="p-1"><HoldoutLine v={v} /></td>
                      <td className="p-1 text-rpg-muted">{v.dataset.samples} dias · {fmtDate(v.dataset.from)}→{fmtDate(v.dataset.to)}</td>
                      <td className="p-1 font-mono text-[10px] text-rpg-muted" title={`pipeline ${v.pipelineVersion} · semente ${v.seed}`}>
                        {v.dataHash.slice(0, 8)}/{v.configHash.slice(0, 6)}
                      </td>
                      <td className="p-1">
                        <div className="flex flex-wrap gap-1">
                          {v.status !== "ativa" && v.status !== "arquivada" && (
                            <RPGButton
                              variant={m.activeVersionId ? "secondary" : "success"}
                              disabled={!v.metrics.beatsBaseline || a.activate.isPending}
                              title={v.metrics.beatsBaseline ? undefined : "Só versões que superaram a linha de base podem ser ativadas."}
                              onClick={() => a.activate.mutate({ id: m.id, vid: v.id }, { onSuccess: () => notify(m.activeVersionId ? `Rollback/troca para v${v.version} concluído.` : `v${v.version} ativada. Previsões geradas.`), onError: (e) => notify(errMsg(e, "Não foi possível ativar."), "error") })}
                            >
                              {m.activeVersionId ? <Undo2 size={13} aria-hidden /> : <Rocket size={13} aria-hidden />} {m.activeVersionId ? "Usar esta" : "Ativar"}
                            </RPGButton>
                          )}
                          {v.status === "ativa" && (
                            <RPGButton variant="ghost" onClick={() => a.deactivate.mutate(m.id, { onSuccess: () => notify("Modelo desativado."), onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
                              <Power size={13} aria-hidden /> Desativar
                            </RPGButton>
                          )}
                          {v.status === "candidata" && (
                            <RPGButton variant="ghost" aria-label={`Arquivar versão ${v.version}`} onClick={() => a.archiveVersion.mutate({ id: m.id, vid: v.id }, { onError: (e) => notify(errMsg(e, "Falha."), "error") })}>
                              <Archive size={13} aria-hidden />
                            </RPGButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </KitSection>
        {cmp.length >= 2 && (
          <KitSection title="Comparação de versões" icon={<History size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-rpg-muted">
                    <th className="p-1 font-normal">Item</th>
                    {cmp.map((v) => (
                      <th key={v.id} className="p-1 font-normal">v{v.version}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Algoritmo", (v: Version) => v.algorithmLabel],
                    ["Hiperparâmetros", (v: Version) => Object.entries(v.hyperparams).map(([k, x]) => `${k}=${x}`).join(", ") || "padrão"],
                    ["Métrica principal (holdout)", (v: Version) => (v.metrics.holdout ? fmtNum(primaryOf(v.metrics.holdout.model, v.metrics.primary)) : "—")],
                    ["Baseline (holdout)", (v: Version) => (v.metrics.holdout ? fmtNum(primaryOf(v.metrics.holdout.baseline, v.metrics.primary)) : "—")],
                    ["Dias de treino", (v: Version) => String(v.dataset.samples)],
                    ["Variáveis", (v: Version) => String(v.importance.length)],
                    ["Superou a base", (v: Version) => (v.metrics.beatsBaseline ? "sim" : "não")],
                  ] as Array<[string, (v: Version) => string]>).map(([l, f]) => (
                    <tr key={l} className="border-t border-rpg-border/60">
                      <td className="p-1 text-rpg-muted">{l}</td>
                      {cmp.map((v) => (
                        <td key={v.id} className="p-1 tabular-nums">{f(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10px] text-rpg-muted">Holdouts de versões treinadas em datas diferentes cobrem períodos diferentes: compare com cautela.</p>
          </KitSection>
        )}
      </div>
    </div>
  );
}
