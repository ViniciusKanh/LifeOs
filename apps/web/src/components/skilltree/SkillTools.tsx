import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle, BarChart3, BookOpenText, CalendarPlus, CheckCircle2, Circle, Crown, Flag, Loader2, NotebookPen, Repeat, RotateCcw, Save, Send, Sparkles, Swords, Target as TargetIcon, Timer, Wand2,
} from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { Modal } from "@/components/ui/Modal";
import { useGrimoireDecks } from "@/hooks/useGrimoire";
import { useSkillTreeActions } from "@/hooks/useSkillTree";
import { dayHeroService } from "@/services/dayHeroService";
import { taskService } from "@/services/taskService";
import { habitService } from "@/services/habitService";
import { goalsService } from "@/services/goalsService";
import { projectsService } from "@/services/projectsService";
import { planningHubService, type EventCategory } from "@/services/planningHubService";
import { skillTreeService, type OracleResult, type ResetPreview, type SkillEffects, type SkillPreset, type SkillTreeView, type Simulation, type Target } from "@/services/skillTreeService";
import { BRANCH_TEXT, BRANCH_VAR, Box, FIELD, errMsg, type Notify } from "./skillShared";

/* ═════════════ Simulação + aplicação com confirmação ═════════════ */

export function PlanModal({
  open,
  title,
  targets,
  origin,
  view,
  onClose,
  notify,
  onSavePreset,
}: {
  open: boolean;
  title: string;
  targets: Target[];
  origin: "build" | "preset" | "oracle";
  view: SkillTreeView;
  onClose: () => void;
  notify: Notify;
  onSavePreset?: (targets: Target[]) => void;
}) {
  const act = useSkillTreeActions();
  const [sim, setSim] = useState<Simulation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setError(null);
    act.simulate.mutate(targets, { onSuccess: setSim, onError: (e) => setError(errMsg(e, "Não consegui simular.")) });
  };
  useEffect(() => {
    if (open && targets.length) run();
    if (!open) setSim(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(targets)]);
  const apply = () => {
    if (!sim) return;
    act.apply.mutate(
      { targets, confirmed: sim.executable, origin },
      {
        onSuccess: (r) => {
          notify(`${r.applied.length} evolução(ões) aplicada(s) · −${r.spent} PH.${r.skipped.length ? ` ${r.skipped.length} ficaram pendentes por requisito.` : ""}`);
          onClose();
        },
        onError: (e) => {
          notify(errMsg(e, "Não consegui aplicar."), "error");
          run();
        },
      },
    );
  };
  const saveDesired = () =>
    act.desired.mutate(targets, { onSuccess: () => notify("Build desejada salva. A automação I acompanha o progresso."), onError: (e) => notify(errMsg(e, "Não consegui salvar."), "error") });
  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {!sim ? (
        error ? (
          <p className="flex items-center gap-2 text-sm text-rpg-red">
            <AlertTriangle size={15} aria-hidden /> {error}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-rpg-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Simulando caminho mínimo…
          </p>
        )
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Custo total", `${sim.totalCost} PH`],
              ["Prontas agora", `${sim.executable.length} (${sim.readyCost} PH)`],
              ["PH disponíveis", String(sim.available)],
              ["Faltam", sim.missingPoints ? `${sim.missingPoints} PH` : "—"],
            ].map(([l, v]) => (
              <div key={l} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                <p className="text-base font-bold tabular-nums text-rpg-text">{v}</p>
                <p className="text-[10px] uppercase tracking-wide text-rpg-muted">{l}</p>
              </div>
            ))}
          </div>
          <ol className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {sim.steps.map((s, i) => (
              <li key={`${s.key}${s.level}`} className={clsx("flex items-start gap-2 border px-2 py-1.5 text-sm", s.ok ? "border-rpg-green/50 bg-rpg-green/5" : "border-rpg-border bg-rpg-bg-2/60")} style={{ borderRadius: 3 }}>
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-rpg-muted">{i + 1}.</span>
                {s.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-rpg-green" aria-label="pronta" /> : <Circle size={15} className="mt-0.5 shrink-0 text-rpg-muted" aria-label="bloqueada" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-rpg-text">
                    {s.name} → nv. {s.level}
                  </span>
                  {!s.ok && <span className="block text-[11px] text-rpg-orange">Falta: {s.reasons.join("; ")}</span>}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-rpg-purple">{s.cost} PH</span>
              </li>
            ))}
          </ol>
          <div>
            <p className="mb-1 text-xs font-semibold text-rpg-gold-light">Distribuição: atual → após aplicar as prontas</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {sim.branchDistribution.map((b) => {
                const cur = sim.current.find((c) => c.branch === b.branch)?.pct ?? 0;
                const label = view.branches.find((x) => x.key === b.branch)?.label ?? b.branch;
                return (
                  <li key={b.branch} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className={BRANCH_TEXT[b.branch]}>{label}</span>
                    <span className="relative h-2.5 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                      <span className="absolute inset-y-0 left-0 opacity-50" style={{ width: `${b.pct}%`, background: `rgb(var(${BRANCH_VAR[b.branch]}))` }} />
                      <span className="absolute inset-y-0 left-0" style={{ width: `${cur}%`, background: `rgb(var(${BRANCH_VAR[b.branch]}))` }} />
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums text-rpg-muted">
                      {cur}% → {b.pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {sim.pending.length > 0 && <p className="text-[11px] text-rpg-muted">Requisitos pendentes: {sim.pending.slice(0, 6).join(" · ")}</p>}
          <p className="text-[11px] text-rpg-muted">Nada foi gasto. Ao confirmar, o servidor revalida tudo e aplica exatamente as {sim.executable.length} evoluções prontas, na ordem acima — as bloqueadas ficam de fora, sem nenhum desbloqueio parcial escondido.</p>
          <div className="flex flex-wrap gap-2">
            <RPGButton variant="primary" disabled={!sim.executable.length || act.apply.isPending} onClick={apply}>
              {act.apply.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />} Confirmar {sim.executable.length} evolução(ões) · {sim.readyCost} PH
            </RPGButton>
            <RPGButton variant="secondary" onClick={saveDesired} disabled={act.desired.isPending}>
              <Flag size={14} aria-hidden /> Salvar como build desejada
            </RPGButton>
            {onSavePreset && (
              <RPGButton variant="secondary" onClick={() => onSavePreset(targets)}>
                <Save size={14} aria-hidden /> Salvar como preset
              </RPGButton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ═════════════ Editor de preset ═════════════ */

export function PresetEditor({ open, preset, initialTargets, view, onClose, notify }: { open: boolean; preset: SkillPreset | null; initialTargets: Target[] | null; view: SkillTreeView; onClose: () => void; notify: Notify }) {
  const act = useSkillTreeActions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    setName(preset?.name ?? "Meu preset");
    setDescription(preset?.description ?? "");
    setLevels(Object.fromEntries((preset?.targets ?? initialTargets ?? []).map((t) => [t.key, t.level])));
  }, [open, preset, initialTargets]);
  const targets = Object.entries(levels).filter(([, l]) => l > 0).map(([key, level]) => ({ key, level }));
  const save = () => {
    const input = { name: name.trim(), description: description.trim() || null, targets };
    const done = { onSuccess: () => (notify("Preset salvo."), onClose()), onError: (e: unknown) => notify(errMsg(e, "Não consegui salvar o preset."), "error") };
    if (preset && !preset.builtin) act.updatePreset.mutate({ id: preset.id, input }, done);
    else act.createPreset.mutate(input, done);
  };
  return (
    <Modal open={open} onClose={onClose} title={preset && !preset.builtin ? "Editar preset" : "Novo preset"} size="lg">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-rpg-muted">
            Nome
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />
          </label>
          <label className="text-xs font-semibold text-rpg-muted">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} className={clsx(FIELD, "mt-1")} style={{ borderRadius: 3 }} />
          </label>
        </div>
        <p className="text-[11px] text-rpg-muted">Escolha o nível desejado de cada habilidade (0 = fora do preset). Pré-requisitos entram automaticamente na simulação.</p>
        <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {view.branches.map((b) => (
            <fieldset key={b.key} className="border border-rpg-border p-2" style={{ borderRadius: 3 }}>
              <legend className={clsx("px-1 text-xs font-bold", BRANCH_TEXT[b.key])}>{b.label}</legend>
              {view.skills
                .filter((s) => s.branch === b.key)
                .map((s) => (
                  <label key={s.key} className="flex items-center gap-2 py-0.5 text-[12.5px] text-rpg-text">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <select
                      aria-label={`Nível desejado de ${s.name}`}
                      value={levels[s.key] ?? 0}
                      onChange={(e) => setLevels((x) => ({ ...x, [s.key]: Number(e.target.value) }))}
                      className="border border-rpg-border bg-rpg-bg-2 px-1 py-0.5 text-xs text-rpg-text"
                      style={{ borderRadius: 2 }}
                    >
                      {Array.from({ length: s.maxLevel + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? "—" : `nv. ${i}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <RPGButton variant="primary" onClick={save} disabled={name.trim().length < 2 || !targets.length || act.createPreset.isPending || act.updatePreset.isPending}>
          <Save size={14} aria-hidden /> Salvar preset ({targets.length} alvo(s))
        </RPGButton>
      </div>
    </Modal>
  );
}

/* ═════════════ Redefinição ═════════════ */

export function ResetModal({ open, onClose, notify, view }: { open: boolean; onClose: () => void; notify: Notify; view: SkillTreeView }) {
  const act = useSkillTreeActions();
  const preview = useQuery({ queryKey: ["skill-tree", "reset", view.epoch, view.points.spent], queryFn: skillTreeService.resetPreview, enabled: open });
  const p: ResetPreview | undefined = preview.data;
  const [ack, setAck] = useState(false);
  useEffect(() => setAck(false), [open]);
  return (
    <Modal open={open} onClose={onClose} title="Redefinir a árvore" size="lg">
      {!p ? (
        <p className="flex items-center gap-2 text-sm text-rpg-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden /> Calculando o que muda…
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Habilidades afetadas", String(p.skills.length)],
              ["PH recuperados", `${p.refund} (${p.refundPct}%)`],
              ["Bônus desativados", String(p.effects.length)],
            ].map(([l, v]) => (
              <div key={l} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                <p className="text-lg font-bold tabular-nums text-rpg-text">{v}</p>
                <p className="text-[10px] uppercase tracking-wide text-rpg-muted">{l}</p>
              </div>
            ))}
          </div>
          {p.skills.length > 0 && <p className="text-xs text-rpg-text">{p.skills.map((s) => `${s.name} (nv. ${s.level})`).join(" · ")}</p>}
          {p.effects.length > 0 && <p className="text-[11px] text-rpg-muted">Deixam de aparecer: {p.effects.slice(0, 8).map((e) => e.label).join(" · ")}{p.effects.length > 8 ? "…" : ""}</p>}
          <p className="text-[11px] text-rpg-green">{p.keeps}</p>
          <ResetRules view={view} notify={notify} />
          {p.blockedUntil && <p className="text-xs text-rpg-orange">Próxima redefinição liberada em {new Date(p.blockedUntil).toLocaleString("pt-BR")}.</p>}
          <label className="flex items-center gap-2 text-xs text-rpg-text">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-[rgb(var(--rpg-gold))]" />
            Entendi o que será redefinido.
          </label>
          <RPGButton
            variant="danger"
            disabled={!ack || !p.skills.length || !!p.blockedUntil || act.reset.isPending}
            onClick={() =>
              act.reset.mutate(p.epoch, {
                onSuccess: (r) => (notify(`Árvore redefinida: ${r.skills} habilidade(s), +${r.refunded} PH devolvidos.`), onClose()),
                onError: (e) => notify(errMsg(e, "Não consegui redefinir."), "error"),
              })
            }
          >
            {act.reset.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />} Confirmar redefinição
          </RPGButton>
        </div>
      )}
    </Modal>
  );
}

function ResetRules({ view, notify }: { view: SkillTreeView; notify: Notify }) {
  const act = useSkillTreeActions();
  return (
    <div className="flex flex-wrap items-center gap-3 border border-rpg-border bg-rpg-bg-2/60 p-2 text-xs text-rpg-text" style={{ borderRadius: 3 }}>
      <span className="font-semibold text-rpg-gold-light">Regras</span>
      <label className="flex items-center gap-1">
        Intervalo entre redefinições
        <select value={view.settings.cooldownDays} onChange={(e) => act.settings.mutate({ cooldownDays: Number(e.target.value) }, { onError: (er) => notify(errMsg(er, "Falha ao salvar."), "error") })} className="border border-rpg-border bg-rpg-bg px-1 py-0.5" style={{ borderRadius: 2 }}>
          {[0, 1, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "sem intervalo" : `${d} dia(s)`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        Reembolso
        <select value={view.settings.refundPct} onChange={(e) => act.settings.mutate({ refundPct: Number(e.target.value) as 50 | 75 | 100 }, { onError: (er) => notify(errMsg(er, "Falha ao salvar."), "error") })} className="border border-rpg-border bg-rpg-bg px-1 py-0.5" style={{ borderRadius: 2 }}>
          {[100, 75, 50].map((p) => (
            <option key={p} value={p}>
              {p}%
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/* ═════════════ Oráculo de Evolução ═════════════ */

export function OraclePanel({ view, notify, onPlan, onMission, onSelect }: { view: SkillTreeView; notify: Notify; onPlan: (targets: Target[], title: string) => void; onMission: (request: string) => void; onSelect: (key: string) => void }) {
  const act = useSkillTreeActions();
  const [text, setText] = useState("");
  const [res, setRes] = useState<OracleResult | null>(null);
  const ask = (m: string) =>
    act.oracle.mutate(m, { onSuccess: setRes, onError: (e) => notify(errMsg(e, "O Oráculo não respondeu."), "error") });
  return (
    <Box title="Oráculo de Evolução" icon={<Wand2 size={14} />} gold>
      <p className="-mt-1 mb-2 text-xs text-rpg-muted">Conte seu objetivo: o Oráculo cruza metas, projetos e registros reais com a árvore e propõe um caminho. Nada é aplicado sem a sua confirmação.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) ask(text.trim());
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ex.: Quero me desenvolver em Machine Learning e concluir meus projetos acadêmicos." aria-label="Objetivo para o Oráculo" className={FIELD} style={{ borderRadius: 3 }} />
        <RPGButton variant="primary" type="submit" disabled={act.oracle.isPending || text.trim().length < 3} aria-label="Consultar o Oráculo">
          {act.oracle.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </RPGButton>
      </form>
      {res && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-rpg-text">{res.summary}</p>
          <p className="text-[10.5px] text-rpg-muted">
            <span className={clsx("mr-1 border px-1 font-bold", res.ai.used ? "border-rpg-purple text-rpg-purple" : "border-rpg-border text-rpg-muted")} style={{ borderRadius: 2 }}>
              {res.ai.used ? "IA" : "Regras"}
            </span>
            {res.ai.detail}
          </p>
          {res.idlePoints && <p className="text-xs text-rpg-orange">{res.idlePoints}</p>}
          <ul className="space-y-1.5">
            {res.recommendations.map((r) => (
              <li key={r.key} className="border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
                <button type="button" onClick={() => onSelect(r.key)} className="text-left">
                  <span className={clsx("text-sm font-bold", BRANCH_TEXT[r.branch])}>{r.name}</span> <span className="text-xs text-rpg-muted">→ nv. {r.level}</span>
                </button>
                {r.why.map((w, i) => (
                  <p key={i} className="text-[11.5px] text-rpg-text">
                    <span className="mr-1 text-[9.5px] font-bold uppercase text-rpg-purple">{i === 0 && res.ai.used ? "Inferência" : "Dado"}</span>
                    {w}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {res.plan && (
            <div className="flex flex-wrap gap-2">
              <RPGButton variant="primary" onClick={() => onPlan(res.plan!.targets, "Plano do Oráculo")}>
                <Sparkles size={14} aria-hidden /> Simular e aplicar ({res.plan.executable.length} pronta(s))
              </RPGButton>
              {res.preset && (
                <RPGButton
                  variant="secondary"
                  onClick={() =>
                    act.createPreset.mutate({ name: res.preset!.name.slice(0, 60), description: text.slice(0, 200), targets: res.preset!.targets }, { onSuccess: () => notify("Preset do Oráculo salvo."), onError: (e) => notify(errMsg(e, "Não consegui salvar."), "error") })
                  }
                >
                  <Save size={14} aria-hidden /> Salvar como preset
                </RPGButton>
              )}
            </div>
          )}
          {res.missionSeeds.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-rpg-gold-light">Missões que ajudam nos requisitos</p>
              <ul className="space-y-1">
                {res.missionSeeds.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-rpg-text">
                    <span className="min-w-0 flex-1">{m.request}</span>
                    <button type="button" onClick={() => onMission(m.request)} className="flex shrink-0 items-center gap-1 font-semibold text-rpg-purple hover:underline">
                      <Swords size={12} aria-hidden /> Criar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {!res && view.nearest.length > 0 && <p className="mt-3 text-[11px] text-rpg-muted">Mais perto agora: {view.nearest[0]!.name} nv. {view.nearest[0]!.level} — falta {view.nearest[0]!.missing.join("; ")}.</p>}
    </Box>
  );
}

/* ═════════════ Arsenal: usar os bônus desbloqueados ═════════════ */

export function Arsenal({ effects, notify }: { effects: SkillEffects | undefined; notify: Notify }) {
  const qc = useQueryClient();
  const decks = useGrimoireDecks();
  const [busy, setBusy] = useState<string | null>(null);
  const [deck, setDeck] = useState("");
  const [panel, setPanel] = useState<{ panel: string; label: string } | null>(null);
  const [blocks, setBlocks] = useState<{ key: string; list: Array<{ title: string; date: string; start: string; minutes: number; category: string }>; note: string | null } | null>(null);
  const run = async (key: string, fn: () => Promise<string>, keys: string[][] = []) => {
    setBusy(key);
    try {
      notify(await fn());
      for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    } catch (e) {
      notify(errMsg(e, "Não consegui usar este bônus."), "error");
    } finally {
      setBusy(null);
    }
  };
  if (!effects) return <div className="rpg-panel h-40 animate-pulse" aria-busy aria-label="Carregando bônus" />;
  if (!effects.count) return <p className="rpg-panel p-4 text-sm text-rpg-muted">Nenhum bônus desbloqueado ainda. Cada habilidade libera recursos reais aqui e nos módulos (Hoje, Missões, Diário, Agenda).</p>;
  const startTimer = (key: string, mode: "pomodoro" | "block" | "free", minutes: number, link?: { type: "deck"; id: string }) =>
    run(key, async () => {
      await dayHeroService.startTimer({ mode, plannedMinutes: mode === "free" ? null : minutes, linkType: link?.type ?? null, linkId: link?.id ?? null });
      return `Cronômetro iniciado (${minutes} min). Acompanhe em Hoje.`;
    }, [["today-hub"]]);
  const Btn = ({ k, onClick, children }: { k: string; onClick: () => void; children: string }) => (
    <button type="button" disabled={!!busy} onClick={onClick} className="flex items-center gap-1 border border-rpg-gold/60 px-2 py-1 text-[11.5px] font-semibold text-rpg-gold-light hover:bg-rpg-gold/10 disabled:opacity-50" style={{ borderRadius: 3 }}>
      {busy === k ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
  const Section = ({ title, icon, children }: { title: string; icon: JSX.Element; children: React.ReactNode }) => (
    <Box title={title} icon={icon}>
      <ul className="space-y-1.5">{children}</ul>
    </Box>
  );
  const Item = ({ label, from, detail, action }: { label: string; from: string; detail?: string; action: React.ReactNode }) => (
    <li className="flex items-start gap-2 border border-rpg-border bg-rpg-bg-2/70 p-2" style={{ borderRadius: 3 }}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-rpg-text">{label}</span>
        {detail && <span className="block text-[11px] text-rpg-muted">{detail}</span>}
        <span className="block text-[10px] text-rpg-muted">de {from}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {effects.focusPresets.length > 0 && (
        <Section title="Rituais de foco" icon={<Timer size={14} />}>
          {effects.focusPresets.map((f) => (
            <Item key={f.key} label={`${f.label} · ${f.minutes} min`} detail={f.hint} from={f.skill} action={<Btn k={f.key} onClick={() => void startTimer(f.key, f.mode, f.minutes)}>Iniciar</Btn>} />
          ))}
          <p className="text-[10.5px] text-rpg-muted">Também aparecem no Cronômetro de foco da tela Hoje.</p>
        </Section>
      )}
      {effects.missionTemplates.length > 0 && (
        <Section title="Modelos de missão" icon={<Swords size={14} />}>
          {effects.missionTemplates.map((m) => (
            <Item
              key={m.key}
              label={m.title}
              detail={`${m.steps.length} etapas · ${m.estimateMinutes} min · prioridade ${m.priority}`}
              from={m.skill}
              action={
                <Btn
                  k={m.key}
                  onClick={() =>
                    void run(m.key, async () => {
                      const t = await taskService.create({ title: m.title, description: m.description, priority: m.priority, difficulty: m.difficulty, estimateMinutes: m.estimateMinutes, status: "A Fazer" });
                      if (m.steps.length) await planningHubService.addSubtasks(t.id, m.steps);
                      return `Missão criada: “${m.title}”.`;
                    }, [["tasks"], ["missions3"]])
                  }
                >
                  Criar
                </Btn>
              }
            />
          ))}
        </Section>
      )}
      {effects.habitTemplates.length > 0 && (
        <Section title="Modelos de hábito" icon={<Repeat size={14} />}>
          {effects.habitTemplates.map((h) => (
            <Item key={h.key} label={h.name} from={h.skill} action={<Btn k={h.key} onClick={() => void run(h.key, async () => (await habitService.create({ name: h.name, category: h.category, frequency: "daily" }), `Hábito criado: “${h.name}”.`), [["habits"]])}>Criar</Btn>} />
          ))}
        </Section>
      )}
      {(effects.goalTemplates.length > 0 || effects.projectTemplates.length > 0) && (
        <Section title="Metas e projetos" icon={<TargetIcon size={14} />}>
          {effects.goalTemplates.map((g) => (
            <Item key={g.key} label={g.title} detail={g.description} from={g.skill} action={<Btn k={g.key} onClick={() => void run(g.key, async () => (await goalsService.create({ title: g.title, description: g.description }), `Meta criada: “${g.title}”.`), [["goals"]])}>Criar meta</Btn>} />
          ))}
          {effects.projectTemplates.map((p) => (
            <Item
              key={p.key}
              label={p.name}
              detail={`${p.tasks.length} missões iniciais`}
              from={p.skill}
              action={
                <Btn
                  k={p.key}
                  onClick={() =>
                    void run(p.key, async () => {
                      const proj = await projectsService.create({ name: p.name, description: p.description });
                      for (const title of p.tasks) await taskService.create({ title, projectId: proj.id, status: "Backlog" });
                      return `Projeto criado: “${p.name}” com ${p.tasks.length} missões.`;
                    }, [["projects"], ["tasks"]])
                  }
                >
                  Criar projeto
                </Btn>
              }
            />
          ))}
        </Section>
      )}
      {effects.agendaBlocks.length > 0 && (
        <Section title="Planejador de blocos" icon={<CalendarPlus size={14} />}>
          {effects.agendaBlocks.map((b) => (
            <Item
              key={b.key}
              label={b.label}
              detail={`${b.count} bloco(s) de ${b.minutes} min nas janelas livres`}
              from={b.skill}
              action={<Btn k={b.key} onClick={() => void run(b.key, async () => { const r = await skillTreeService.agendaPreview(b.key); setBlocks({ key: b.key, list: r.blocks, note: r.note }); return r.blocks.length ? "Veja os horários propostos e confirme." : "Não encontrei janelas livres."; })}>Propor</Btn>}
            />
          ))}
        </Section>
      )}
      {effects.grimoireSessions.length > 0 && (
        <Section title="Sessões do Grimório" icon={<BookOpenText size={14} />}>
          <li>
            <select aria-label="Baralho" value={deck} onChange={(e) => setDeck(e.target.value)} className={clsx(FIELD, "text-xs")} style={{ borderRadius: 3 }}>
              <option value="">Escolha o baralho…</option>
              {(decks.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </li>
          {effects.grimoireSessions.map((g) => (
            <Item key={g.key} label={`${g.label} · ${g.minutes} min`} detail={g.hint} from={g.skill} action={<Btn k={g.key} onClick={() => (deck ? void startTimer(g.key, "pomodoro", g.minutes, { type: "deck", id: deck }) : notify("Escolha o baralho primeiro.", "error"))}>Iniciar</Btn>} />
          ))}
        </Section>
      )}
      {effects.diaryPrompts.length > 0 && (
        <Section title="Reflexões guiadas" icon={<NotebookPen size={14} />}>
          {effects.diaryPrompts.map((d) => (
            <Item key={d.key} label={d.label} detail={d.prompts.join(" · ")} from={d.skill} action={<Link to="/diario" className="text-[11.5px] font-semibold text-rpg-pink hover:underline">Diário →</Link>} />
          ))}
          <p className="text-[10.5px] text-rpg-muted">Aparecem nas “Inspirações de escrita” do Diário.</p>
        </Section>
      )}
      {effects.analyses.length > 0 && (
        <Section title="Análises complementares" icon={<BarChart3 size={14} />}>
          {effects.analyses.map((a) => (
            <Item key={a.key} label={a.label.replace(/^Análise:\s*/, "")} from={a.skill} action={<Btn k={a.key} onClick={() => setPanel({ panel: a.panel, label: a.label })}>Abrir</Btn>} />
          ))}
        </Section>
      )}
      {effects.titles.length > 0 && (
        <Section title="Títulos" icon={<Crown size={14} />}>
          {effects.titles.map((t) => (
            <Item key={t.key} label={t.name} from={t.skill} action={<Link to="/codex" className="text-[11.5px] font-semibold text-rpg-gold-light hover:underline">Equipar no Códex →</Link>} />
          ))}
        </Section>
      )}
      <Modal open={!!panel} onClose={() => setPanel(null)} title={panel?.label ?? ""} size="lg">
        {panel && <AnalysisView panel={panel.panel} />}
      </Modal>
      <Modal open={!!blocks} onClose={() => setBlocks(null)} title="Blocos propostos na Agenda">
        {blocks && (
          <div className="space-y-2">
            {blocks.list.length === 0 && <p className="text-sm text-rpg-muted">Sem janelas livres suficientes nos próximos 14 dias.</p>}
            <ul className="space-y-1.5">
              {blocks.list.map((b, i) => (
                <li key={i} className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-sm" style={{ borderRadius: 3 }}>
                  <span className="min-w-0 flex-1 font-semibold text-rpg-text">{b.title}</span>
                  <span className="text-xs text-rpg-muted">
                    {new Date(`${b.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · {b.start} · {b.minutes} min
                  </span>
                </li>
              ))}
            </ul>
            {blocks.note && <p className="text-[11px] text-rpg-muted">{blocks.note}</p>}
            {blocks.list.length > 0 && (
              <RPGButton
                variant="primary"
                disabled={!!busy}
                onClick={() =>
                  void run("reserve", async () => {
                    for (const b of blocks.list) await planningHubService.createBlock({ title: b.title, date: b.date, start: b.start, durationMinutes: b.minutes, category: b.category as EventCategory });
                    const n = blocks.list.length;
                    setBlocks(null);
                    return `${n} bloco(s) reservado(s) na Agenda.`;
                  }, [["events"], ["planning"]])
                }
              >
                <CalendarPlus size={14} aria-hidden /> Reservar {blocks.list.length} bloco(s) na Agenda
              </RPGButton>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AnalysisView({ panel }: { panel: string }) {
  const q = useQuery({ queryKey: ["skill-tree", "analysis", panel], queryFn: () => skillTreeService.analysis(panel) });
  const d = q.data;
  const max = useMemo(() => (d?.items ? d.max ?? Math.max(1, ...d.items.map((i) => Math.max(i.value ?? 0, i.value2 ?? 0, i.value3 ?? 0))) : 1), [d]);
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-rpg-muted"><Loader2 size={15} className="animate-spin" aria-hidden /> Calculando com os seus registros…</p>;
  if (q.isError || !d) return <p className="text-sm text-rpg-red">{errMsg(q.error, "Não consegui calcular esta análise.")}</p>;
  const tones = ["--rpg-purple", "--rpg-cyan", "--rpg-green"];
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-rpg-gold-light">{d.title}</p>
      {d.legend && (
        <p className="flex gap-3 text-[11px] text-rpg-muted">
          {d.legend.map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              <span className="h-2 w-3" style={{ background: `rgb(var(${tones[i]}))` }} /> {l}
            </span>
          ))}
        </p>
      )}
      {d.items && (d.items.length === 0 ? <p className="text-sm text-rpg-muted">Ainda sem registros neste período.</p> : (
        <ul className="space-y-1">
          {d.items.map((it) => (
            <li key={it.label} className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-2 text-xs">
              <span className="truncate text-rpg-text" title={it.detail ?? it.label}>{it.label}</span>
              <span className="space-y-0.5">
                {[it.value, it.value2, it.value3].map((v, i) => (v === undefined ? null : (
                  <span key={i} className="block h-2 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                    <span className="block h-full" style={{ width: `${((v ?? 0) / max) * 100}%`, background: `rgb(var(${tones[i]}))` }} />
                  </span>
                )))}
              </span>
              <span className="whitespace-nowrap text-right tabular-nums text-rpg-muted">
                {[it.value, it.value2, it.value3].filter((v) => v !== undefined).map((v) => (v == null ? "—" : v)).join(" / ")}
                {d.unit && d.unit !== "/5" ? ` ${d.unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ))}
      {d.rows && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-xs">
            <thead>
              <tr className="text-left text-rpg-muted">
                <th className="py-1 pr-2 font-normal" />
                {d.columns?.map((c) => (
                  <th key={c} className="py-1 pr-2 text-right font-normal">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.label} className="border-t border-rpg-border/60">
                  <td className="py-1 pr-2 text-rpg-text">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="py-1 pr-2 text-right tabular-nums text-rpg-text">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.list && d.list.length > 0 && <ul className="text-[11px] text-rpg-muted">{d.list.map((l, i) => <li key={i}>{l.label} — {l.detail}</li>)}</ul>}
      {d.note && <p className="text-[11px] text-rpg-muted">{d.note}</p>}
      <p className="text-[10px] text-rpg-muted">Calculado direto dos seus registros{d.sample != null ? ` (amostra: ${d.sample})` : ""}. Nada aqui altera métricas.</p>
    </div>
  );
}

