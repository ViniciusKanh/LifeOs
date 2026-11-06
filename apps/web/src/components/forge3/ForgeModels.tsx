import { useMemo, useState } from "react";
import clsx from "clsx";
import { Activity, Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Gauge, Hammer, History, Loader2, Play, Plus, Power, PowerOff, Rocket, Settings2, Trash2, Undo2, Wand2 } from "lucide-react";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { RPGButton, RPGPanel, RPGProgressBar } from "@/components/rpg";
import { IconTile, TEMPLATE_TONE, artifactScore, modelTone } from "./ForgeOverview";
import { Modal } from "@/components/ui/Modal";
import { useForgeActions, useForgeDictionary } from "@/hooks/useForge";
import { PRIMARY_LABEL, fmtNum, isReg, primaryOf, type Alg, type Dictionary, type ForgeModel, type ForgeOverview, type ModelInput, type Primary, type Problem, type Version } from "@/services/forgeService";
import { Empty, FIELD, R, StatusBadge, errMsg, fmtDate, fmtDateTime, templateIcon, type Notify, Section as KitSection, Tag } from "./ForgeShared";

const BASE_ALGS: Alg[] = ["baseline", "persistence"];
const SOURCE_NAME: Record<string, string> = { saude: "Saúde", habitos: "Hábitos", missoes: "Missões", educacao: "Educação", biblioteca: "Biblioteca", foco: "Foco", calendario: "Calendário" };
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
    <div className="space-y-4">
      <RPGPanel
        title="Receitas de Forja"
        icon={<Wand2 size={15} />}
        variant="gold"
        actions={
          <RPGButton variant="gold" className="!py-1 text-xs" onClick={onWizard}>
            <Plus size={13} aria-hidden /> Modelo personalizado
          </RPGButton>
        }
      >
        <p className="mb-3 text-sm text-rpg-muted">Artefatos pré-configurados: escolha um alvo e a Forja monta variáveis, validação e arena. Forjar não treina — você decide quando.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {o.templates.map((t) => {
            const tone = TEMPLATE_TONE[t.icon] ?? "purple";
            return (
              <article key={t.key} className={clsx("flex flex-col items-center gap-2 border-2 p-3 text-center", t.created ? "border-rpg-gold/50 bg-rpg-gold/5" : "border-rpg-border bg-rpg-bg-2/60")} style={R}>
                <IconTile tone={tone}>{templateIcon(t.icon)}</IconTile>
                <h3 className="font-rpg text-base font-bold text-rpg-text">{t.name}</h3>
                <p className="flex-1 text-xs text-rpg-muted">{t.description}</p>
                <Tag tone="muted">{t.problem === "classification" ? "Sim/não" : "Valor"}</Tag>
                {t.created ? (
                  <p className="flex items-center gap-1 text-xs font-semibold text-rpg-gold-light">
                    <Check size={14} aria-hidden /> Forjado
                  </p>
                ) : (
                  <RPGButton
                    variant="secondary"
                    className="w-full"
                    disabled={a.fromTemplate.isPending}
                    onClick={() => a.fromTemplate.mutate(t.key, { onSuccess: () => notify(`${t.name} forjado. Treine quando quiser.`), onError: (e) => notify(errMsg(e, "Não foi possível forjar."), "error") })}
                  >
                    <Hammer size={14} aria-hidden /> Forjar
                  </RPGButton>
                )}
              </article>
            );
          })}
        </div>
      </RPGPanel>

      <RPGPanel
        title="Seus Artefatos"
        icon={<Hammer size={15} />}
        actions={
          <label className="flex items-center gap-1.5 text-xs text-rpg-muted">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
          </label>
        }
      >
        {!models.length ? (
          <Empty icon={<Hammer size={24} />} title="Nenhum artefato forjado">Escolha uma receita acima ou crie um modelo personalizado.</Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {models.map((m) => {
              const tone = modelTone(o, m);
              const s = artifactScore(m);
              const v = m.active ?? m.latest;
              const ok = m.status === "ativo" || m.status === "aprovado";
              return (
                <article key={m.id} className={clsx("flex min-w-0 flex-col border-2 bg-rpg-bg-2/60", m.status === "ativo" ? "border-rpg-green/60" : m.status === "degradado" ? "border-rpg-red/60" : "border-rpg-border")} style={R} aria-label={m.name}>
                  <header className="flex items-start gap-3 p-3">
                    <IconTile tone={tone}>{templateIcon(o.templates.find((t) => t.key === m.templateKey)?.icon)}</IconTile>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-rpg text-lg font-bold leading-tight text-rpg-text">{m.name}</h3>
                      <p className="truncate text-xs text-rpg-muted">
                        Prevê {m.targetLabel.toLowerCase()} com {m.horizon} dia(s) de antecedência
                      </p>
                    </div>
                    <StatusBadge m={m} />
                  </header>
                  <dl className="grid grid-cols-3 border-y border-rpg-border/70 text-center">
                    <div className="border-r border-rpg-border/70 px-2 py-2">
                      <dt className="text-[10px] text-rpg-muted">Versão</dt>
                      <dd className="font-semibold text-sm text-rpg-purple">{v ? `v${v.version}` : "—"}</dd>
                    </div>
                    <div className="border-r border-rpg-border/70 px-2 py-2">
                      <dt className="text-[10px] text-rpg-muted">Variáveis</dt>
                      <dd className="font-semibold text-sm text-rpg-text">{m.features.length}</dd>
                    </div>
                    <div className="px-2 py-2">
                      <dt className="text-[10px] text-rpg-muted">Último treino</dt>
                      <dd className="font-semibold text-sm text-rpg-text">{m.lastTrainedAt ? fmtDate(m.lastTrainedAt) : "nunca"}</dd>
                    </div>
                  </dl>
                  <div className="space-y-1 px-3 py-2.5">
                    {s ? (
                      <>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-rpg-muted">Teste final</span>
                          <span className="font-semibold text-[11px] text-rpg-text">{s.label}</span>
                        </div>
                        <RPGProgressBar tone={ok ? "green" : "orange"} label={`Desempenho de ${m.name}`} value={s.value * 100} showLabel={false} />
                        <p className="text-[11px] text-rpg-muted">
                          <HoldoutLine v={v} />
                          {m.monitor && ` · monitor: ${m.monitor.status.replace("_", " ")}`}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-rpg-muted">Ainda não treinado. O treino mede o artefato contra a linha de base antes de liberar previsões.</p>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-rpg-border/70 p-2.5">
                    <RPGButton variant="primary" className="!py-1.5 text-sm" disabled={busy(m.id) || m.status === "arquivado"} onClick={() => train(m)}>
                      {a.train.isPending && a.train.variables === m.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} {m.versions ? "Retreinar" : "Treinar"}
                    </RPGButton>
                    <RPGButton variant="secondary" className="!py-1.5 text-sm" disabled={!m.versions} onClick={() => onOpenVersions(m.id)}>
                      <History size={14} aria-hidden /> Versões
                    </RPGButton>
                    <RPGButton
                      variant="ghost"
                      className="!px-2 !py-1.5 text-xs"
                      disabled={busy(m.id) || !m.latest}
                      onClick={() => a.backtest.mutate(m.id, { onSuccess: (r) => notify(r?.status === "done" ? "Backtest concluído (ver Relatórios)." : "Dados insuficientes para backtest.", r?.status === "done" ? "success" : "error"), onError: (e) => notify(errMsg(e, "Backtest falhou."), "error") })}
                    >
                      <Activity size={13} aria-hidden /> Backtest
                    </RPGButton>
                    {m.activeVersionId && (
                      <>
                        <RPGButton variant="ghost" className="!px-2 !py-1.5 text-xs" disabled={busy(m.id)} onClick={() => a.monitor.mutate(m.id, { onSuccess: () => notify("Monitoramento atualizado."), onError: (e) => notify(errMsg(e, "Falha no monitoramento."), "error") })}>
                          <Gauge size={13} aria-hidden /> Monitorar
                        </RPGButton>
                        <RPGButton variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => a.deactivate.mutate(m.id, { onSuccess: () => notify("Artefato desativado. As profecias futuras foram retiradas."), onError: (e) => notify(errMsg(e, "Falha ao desativar."), "error") })}>
                          <PowerOff size={13} aria-hidden /> Desativar
                        </RPGButton>
                      </>
                    )}
                    <span className="ml-auto flex gap-1">
                      <RPGButton variant="ghost" className="!px-2 !py-1.5" aria-label={m.status === "arquivado" ? `Restaurar ${m.name}` : `Arquivar ${m.name}`} title={m.status === "arquivado" ? "Restaurar" : "Arquivar"} onClick={() => a.archive.mutate({ id: m.id, archived: m.status !== "arquivado" }, { onError: (e) => notify(errMsg(e, "Falha ao arquivar."), "error") })}>
                        {m.status === "arquivado" ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
                      </RPGButton>
                      <RPGButton variant="ghost" className="!px-2 !py-1.5 text-rpg-red" aria-label={`Excluir ${m.name}`} title="Excluir" onClick={() => setConfirmDel(m)}>
                        <Trash2 size={14} aria-hidden />
                      </RPGButton>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </RPGPanel>
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
          <li key={w} className={clsx("shrink-0 border px-2 py-1 font-semibold text-[9px] uppercase", i === step ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : i < step ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted")} style={R} aria-current={i === step ? "step" : undefined}>
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
                  <legend className="text-xs font-semibold text-rpg-purple">{SOURCE_NAME[src] ?? src}</legend>
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

/* ═════════════ Modelos: configuração + linha do tempo de versões ═════════════ */

const VERSION_TONE = { ativa: "green", candidata: "blue", arquivada: "muted" } as const;

/** Configuração editável do artefato. Vale a partir do próximo treino; versões já salvas não mudam. */
function ModelConfig({ m, notify }: { m: ForgeModel; notify: Notify }) {
  const { update } = useForgeActions();
  const [name, setName] = useState(m.name);
  const [horizon, setHorizon] = useState(m.horizon);
  const [schedule, setSchedule] = useState(m.schedule);
  const dirty = name.trim() !== m.name || horizon !== m.horizon || schedule !== m.schedule;
  const save = () =>
    update.mutate(
      { id: m.id, input: { name: name.trim(), horizon, schedule } },
      { onSuccess: () => notify("Configuração salva. Ela vale a partir do próximo treino."), onError: (e) => notify(errMsg(e, "Não foi possível salvar."), "error") },
    );
  return (
    <KitSection title="Configuração" icon={<Settings2 size={15} />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-rpg-muted sm:col-span-3">
          Nome do artefato
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />
        </label>
        <label className="block text-xs text-rpg-muted">
          Antecedência: {horizon} dia(s)
          <input type="range" min={1} max={7} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--rpg-purple))]" />
        </label>
        <label className="block text-xs text-rpg-muted sm:col-span-2">
          Retreino
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as ModelInput["schedule"])} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }}>
            {Object.entries(SCHEDULE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {(
          [
            ["Alvo", m.targetLabel],
            ["Variáveis", String(m.features.length)],
            ["Algoritmos", `${m.algorithms.length} + base`],
            ["Validação", `${m.validation.folds} dobras · ${Math.round(m.validation.holdoutPct * 100)}%`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
            <dt className="text-[10px] text-rpg-muted">{k}</dt>
            <dd className="truncate font-semibold text-rpg-text" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RPGButton variant="gold" disabled={!dirty || name.trim().length < 2 || update.isPending} onClick={save}>
          {update.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />} Salvar configuração
        </RPGButton>
        {dirty && <span className="text-[11px] text-rpg-orange">Alterações não salvas</span>}
      </div>
    </KitSection>
  );
}

function VersionCard({ m, v, compare, onCompare, notify }: { m: ForgeModel; v: Version; compare: boolean; onCompare: (on: boolean) => void; notify: Notify }) {
  const a = useForgeActions();
  const tone = VERSION_TONE[v.status];
  const h = v.metrics.holdout;
  const score = h ? (isReg(h.model) && isReg(h.baseline) ? (h.baseline.mae > 0 ? Math.max(0, 1 - h.model.mae / h.baseline.mae) : 0) : !isReg(h.model) ? h.model.balancedAccuracy : 0) : 0;
  return (
    <li className="relative pl-9">
      {/* Gema da versão sobre a linha do tempo */}
      <span className={clsx("absolute left-0 top-3 flex h-7 w-7 rotate-45 items-center justify-center border-2 bg-rpg-bg", RPG_TONE_TEXT[tone], "border-current shadow-[0_0_10px_-2px_currentColor]")} aria-hidden>
        <span className="-rotate-45 text-[11px] font-bold">{v.version}</span>
      </span>
      <article className={clsx("border-2 bg-rpg-bg-2/60 p-3", v.status === "ativa" ? "border-rpg-green/60" : "border-rpg-border")} style={R} aria-label={`Versão ${v.version}`}>
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="font-rpg text-base font-bold text-rpg-text">v{v.version}</h3>
          <Tag tone={tone}>{v.status}</Tag>
          <Tag tone={v.metrics.beatsBaseline ? "gold" : "orange"}>{v.metrics.beatsBaseline ? "venceu a base" : "não venceu a base"}</Tag>
          <span className="ml-auto text-[11px] text-rpg-muted">{fmtDateTime(v.trainedAt)}</span>
        </header>
        <p className="mt-1 text-sm text-rpg-text">{v.algorithmLabel}</p>
        <div className="mt-2">
          <RPGProgressBar tone={v.metrics.beatsBaseline ? "green" : "orange"} label={`Teste final da versão ${v.version}`} value={score * 100} showLabel={false} />
          <p className="mt-1 text-[11px] text-rpg-muted">
            <HoldoutLine v={v} />
          </p>
        </div>
        <p className="mt-1 text-[11px] text-rpg-muted">
          {v.dataset.samples} dias ({fmtDate(v.dataset.from)} → {fmtDate(v.dataset.to)}) ·{" "}
          <span className="font-mono" title={`pipeline ${v.pipelineVersion} · semente ${v.seed}`}>
            dados {v.dataHash.slice(0, 8)} · config {v.configHash.slice(0, 6)}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {v.status === "candidata" && (
            <RPGButton
              variant={m.activeVersionId ? "secondary" : "success"}
              className="!py-1.5 text-sm"
              disabled={!v.metrics.beatsBaseline || a.activate.isPending}
              title={v.metrics.beatsBaseline ? undefined : "Só versões que venceram a linha de base podem ser ativadas."}
              onClick={() => a.activate.mutate({ id: m.id, vid: v.id }, { onSuccess: () => notify(m.activeVersionId ? `Agora a v${v.version} está em produção.` : `v${v.version} ativada. Profecias geradas.`), onError: (e) => notify(errMsg(e, "Não foi possível ativar."), "error") })}
            >
              {m.activeVersionId ? <Undo2 size={14} aria-hidden /> : <Rocket size={14} aria-hidden />} {m.activeVersionId ? "Usar esta versão" : "Ativar"}
            </RPGButton>
          )}
          {v.status === "ativa" && (
            <RPGButton variant="ghost" className="!py-1.5 text-sm" onClick={() => a.deactivate.mutate(m.id, { onSuccess: () => notify("Artefato desativado. As profecias futuras foram retiradas."), onError: (e) => notify(errMsg(e, "Falha ao desativar."), "error") })}>
              <Power size={14} aria-hidden /> Desativar
            </RPGButton>
          )}
          {v.status === "candidata" && (
            <RPGButton variant="ghost" className="!py-1.5 text-xs" onClick={() => a.archiveVersion.mutate({ id: m.id, vid: v.id }, { onSuccess: () => notify(`v${v.version} arquivada.`), onError: (e) => notify(errMsg(e, "Falha ao arquivar."), "error") })}>
              <Archive size={13} aria-hidden /> Arquivar
            </RPGButton>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-rpg-muted">
            <input type="checkbox" checked={compare} onChange={(e) => onCompare(e.target.checked)} /> Comparar
          </label>
        </div>
      </article>
    </li>
  );
}

export function ModelsTab({ o, notify, selected, onSelect, onWizard }: { o: ForgeOverview; notify: Notify; selected: string | null; onSelect: (id: string) => void; onWizard: () => void }) {
  const [compare, setCompare] = useState<string[]>([]);
  const m = o.models.find((x) => x.id === selected) ?? o.models[0];
  if (!m)
    return (
      <Empty icon={<Hammer size={24} />} title="Nenhum modelo">
        <RPGButton variant="gold" className="mt-2" onClick={onWizard}>
          <Plus size={14} aria-hidden /> Criar com o assistente
        </RPGButton>
      </Empty>
    );
  const versions = o.versions.filter((v) => v.modelId === m.id);
  const cmp = versions.filter((v) => compare.includes(v.id));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <KitSection title="Artefatos" icon={<Hammer size={15} />} action={<RPGButton variant="ghost" className="!px-2 !py-1" aria-label="Novo modelo" onClick={onWizard}><Plus size={14} aria-hidden /></RPGButton>}>
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
          {o.models.map((x) => (
            <li key={x.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  onSelect(x.id);
                  setCompare([]);
                }}
                className={clsx("flex w-56 items-center gap-2.5 border-2 p-2 text-left lg:w-full", x.id === m.id ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/60 hover:border-rpg-bronze")}
                style={R}
                aria-pressed={x.id === m.id}
              >
                <IconTile tone={modelTone(o, x)} size="sm">
                  {templateIcon(o.templates.find((t) => t.key === x.templateKey)?.icon)}
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rpg-text">{x.name}</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    <StatusBadge m={x} />
                    <span className="text-[10px] text-rpg-muted">{x.versions} versões</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </KitSection>
      <div className="min-w-0 space-y-4">
        <ModelConfig key={m.id} m={m} notify={notify} />
        <KitSection title={`Linha do tempo · ${m.name}`} icon={<History size={15} />} tone="legendary">
          {!versions.length ? (
            <Empty icon={<History size={22} />} title="Sem versões">
              Treine o artefato em Artefatos para registrar a primeira versão.
            </Empty>
          ) : (
            <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-0.5 before:bg-rpg-border">
              {versions.map((v) => (
                <VersionCard key={v.id} m={m} v={v} compare={compare.includes(v.id)} onCompare={(on) => setCompare((c) => (on ? [...c, v.id].slice(-3) : c.filter((x) => x !== v.id)))} notify={notify} />
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-rpg-muted">Marque 2 ou 3 versões para comparar. Trocar a versão ativa (rollback) gera novas profecias; nada é apagado.</p>
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
