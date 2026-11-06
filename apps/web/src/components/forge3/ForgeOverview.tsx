import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Cpu,
  FlaskConical,
  GraduationCap,
  Hammer,
  Heart,
  Leaf,
  Lightbulb,
  Loader2,
  Lock,
  Medal,
  Sparkles,
  Swords,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar, RPGProgressRing } from "@/components/rpg";
import { RPG_TONE_TEXT, type RpgTone } from "@/components/rpg/rpgAssets";
import { AdvisorPanel } from "@/components/rpg-modules/ModuleKit";
import { Modal } from "@/components/ui/Modal";
import { useForgeActions } from "@/hooks/useForge";
import { RUN_KIND, RUN_STATUS, fmtNum, isReg, type ForgeModel, type ForgeOverview, type Prediction, type Run } from "@/services/forgeService";
import { FORGE_ART, errMsg, fmtDate, fmtDateTime, pct, templateIcon, type Notify } from "./ForgeShared";

type Source = NonNullable<ForgeOverview["quality"]>["sources"][number];
type GoTab = (t: "artefatos" | "modelos" | "arena" | "previsoes" | "experimentos" | "gargalos" | "laboratorio") => void;

/** Formata a previsão conforme o tipo de problema (probabilidade x valor na unidade do alvo). */
export function predText(p: Prediction, m: ForgeModel | undefined) {
  if (!m) return fmtNum(p.value, 2);
  if (m.problem === "classification") return pct(p.value);
  const range = p.lower != null && p.upper != null ? ` (${fmtNum(p.lower, 1)}–${fmtNum(p.upper, 1)})` : "";
  return `${fmtNum(p.value, 1)}${range}`;
}

/** Cor de cada artefato pronto — a mesma em todas as abas. */
export const TEMPLATE_TONE: Record<string, RpgTone> = { flame: "orange", book: "blue", bolt: "cyan", sun: "gold", leaf: "green" };
export const modelTone = (o: ForgeOverview, m: ForgeModel): RpgTone => TEMPLATE_TONE[o.templates.find((t) => t.key === m.templateKey)?.icon ?? ""] ?? "purple";

/** Moldura quadrada de ícone (padrão dos itens de inventário do tema). */
export function IconTile({ tone, children, size = "md", dim }: { tone: RpgTone; children: ReactNode; size?: "sm" | "md"; dim?: boolean }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center border-2 bg-rpg-bg", size === "md" ? "h-11 w-11" : "h-9 w-9", dim ? "border-rpg-border text-rpg-muted/60" : clsx("border-current shadow-[inset_0_0_10px_-2px_currentColor]", RPG_TONE_TEXT[tone]))}
      style={{ borderRadius: 3 }}
      aria-hidden
    >
      {children}
    </span>
  );
}

/* ═════════════ Núcleo de Inteligência (8 fontes ao redor do cristal) ═════════════ */

const SOURCE_UI: Record<string, { icon: LucideIcon; tone: RpgTone }> = {
  habitos: { icon: Leaf, tone: "green" },
  saude: { icon: Heart, tone: "pink" },
  missoes: { icon: Swords, tone: "blue" },
  metas: { icon: Trophy, tone: "gold" },
  educacao: { icon: GraduationCap, tone: "cyan" },
  biblioteca: { icon: BookOpen, tone: "purple" },
  agenda: { icon: CalendarDays, tone: "orange" },
  experimentos: { icon: FlaskConical, tone: "green" },
};
const HEX = "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)";

function HexNode({ s, onOpen, style }: { s: Source; onOpen: () => void; style: React.CSSProperties }) {
  const ui = SOURCE_UI[s.key] ?? { icon: Cpu, tone: "muted" as RpgTone };
  const Icon = ui.icon;
  const lit = s.connected && s.eligible;
  const tone = lit ? RPG_TONE_TEXT[ui.tone] : s.connected ? "text-rpg-orange" : "text-rpg-muted";
  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      className="group absolute flex w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 focus-visible:outline-none sm:w-24"
      aria-label={`${s.label}: ${s.connected ? `${s.records} registros` : "sem registros"}, ${s.eligible ? "elegível para modelos" : "dados insuficientes"}. Ver detalhes.`}
    >
      <span className={clsx("relative block h-11 w-12 transition-transform group-hover:scale-110 group-focus-visible:scale-110 sm:h-12 sm:w-14", tone)}>
        <span className={clsx("absolute inset-0", lit ? "bg-current" : "bg-current/45")} style={{ clipPath: HEX }} />
        <span className="absolute inset-[2px] flex items-center justify-center bg-rpg-bg" style={{ clipPath: HEX }}>
          <Icon size={20} strokeWidth={2.2} />
        </span>
        {lit && <span className="absolute inset-0 -z-10 rounded-full bg-current opacity-25 blur-md" aria-hidden />}
      </span>
      <span className={clsx("text-[11px] leading-tight sm:text-xs", lit ? "text-rpg-text" : "text-rpg-muted")}>{s.label}</span>
      <span className="font-pixel text-[9px] tabular-nums text-rpg-muted">{s.connected ? `${s.recentDays}/120 dias` : "sem dados"}</span>
    </button>
  );
}

function NucleusPanel({ o, notify }: { o: ForgeOverview; notify: Notify }) {
  const { analyze } = useForgeActions();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<Source | null>(null);
  const q = o.quality;
  const r = o.researcher;
  const sources = q?.sources ?? [];
  const lit = sources.filter((s) => s.connected && s.eligible).length;
  const run = () => analyze.mutate(undefined, { onSuccess: () => notify("Dados analisados: o núcleo foi atualizado."), onError: (e) => notify(errMsg(e, "Não foi possível analisar os dados."), "error") });
  // Fontes distribuídas numa elipse ao redor do cristal (começa no topo, sentido horário).
  const pos = (i: number, n: number): React.CSSProperties => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 39 * Math.sin(a)}%` };
  };
  return (
    <RPGPanel
      title="Núcleo de Inteligência"
      icon={<Cpu size={15} />}
      variant="gold"
      className="h-full"
      actions={
        <RPGButton variant="secondary" className="!py-1 text-xs" disabled={analyze.isPending} onClick={run}>
          {analyze.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />} {q ? "Reanalisar" : "Analisar"}
        </RPGButton>
      }
    >
      <div className="relative mx-auto aspect-[10/9] w-full max-w-[520px] sm:aspect-[16/11]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {sources.map((s, i) => {
            const a = (-90 + (360 / sources.length) * i) * (Math.PI / 180);
            const on = s.connected && s.eligible;
            return <line key={s.key} x1="50" y1="50" x2={50 + 41 * Math.cos(a)} y2={50 + 39 * Math.sin(a)} stroke={on ? "rgb(var(--rpg-purple))" : "rgb(var(--rpg-border))"} strokeWidth={on ? 0.5 : 0.3} strokeDasharray={on ? undefined : "1.2 1.2"} vectorEffect="non-scaling-stroke" opacity={on ? 0.9 : 0.6} />;
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 w-[34%] max-w-[170px] -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <img
            src={`${FORGE_ART}/core.webp`}
            alt=""
            className={clsx("pixelated w-full object-contain drop-shadow-[0_0_24px_rgb(var(--rpg-purple)/0.7)]", !reduce && lit > 0 && "motion-safe:animate-[pulse_4s_ease-in-out_infinite]", !lit && "opacity-60 grayscale-[60%]")}
            style={{ maskImage: "radial-gradient(ellipse 50% 46% at 50% 46%, #000 70%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 50% 46% at 50% 46%, #000 70%, transparent 100%)" }}
          />
        </div>
        {sources.map((s, i) => (
          <HexNode key={s.key} s={s} style={pos(i, sources.length)} onOpen={() => setOpen(s)} />
        ))}
        {!q && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 text-center">
            <p className="max-w-xs text-sm text-rpg-text/90">O núcleo ainda está apagado. Analise seus registros para acender as fontes que podem alimentar modelos.</p>
            <RPGButton variant="primary" onClick={run} disabled={analyze.isPending}>
              <Sparkles size={14} aria-hidden /> Acender o núcleo
            </RPGButton>
          </div>
        )}
      </div>
      {q && (
        <p className="mt-1 text-center text-sm text-rpg-text/85">
          {lit} de {sources.length} fontes acesas · qualidade dos dados <strong className="font-rpg text-rpg-cyan">{q.quality.scores.overall ?? "—"}</strong>
          <span className="block text-[11px] text-rpg-muted">Fonte acesa = usada como variável e com registros em 30+ dias distintos nos últimos 120. Análise de {fmtDateTime(q.analyzedAt)}.</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rpg-border/70 pt-3">
        <span className="text-sm text-rpg-text">
          Nível da Forja <strong className="font-rpg text-xl text-rpg-gold-light">{r.level}</strong>
        </span>
        <span className="text-xs italic text-rpg-gold-light">{r.title}</span>
        <RPGProgressBar className="min-w-[140px] flex-1" tone="purple" label="Pontos de pesquisa" value={r.pct} max={100} showLabel={false} />
        <span className="font-pixel text-xs tabular-nums text-rpg-text" title={r.rule}>
          {r.points} / {r.next ? r.next.min : r.points} pts
        </span>
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Fonte: ${open.label}` : ""} size="sm">
        {open && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-rpg-muted">Estado</dt>
            <dd>{open.connected ? "Conectada" : "Sem registros"}</dd>
            <dt className="text-rpg-muted">Registros</dt>
            <dd className="tabular-nums">{open.records}</dd>
            <dt className="text-rpg-muted">Período</dt>
            <dd>
              {fmtDate(open.from)} → {fmtDate(open.to)}
            </dd>
            <dt className="text-rpg-muted">Dias com registro (120 dias)</dt>
            <dd className="tabular-nums">{open.recentDays}</dd>
            <dt className="text-rpg-muted">Duplicados</dt>
            <dd className="tabular-nums">{open.duplicates}</dd>
            <dt className="text-rpg-muted">Qualidade</dt>
            <dd>{open.quality == null ? "—" : `${open.quality}/100`}</dd>
            <dt className="text-rpg-muted">Granularidade</dt>
            <dd>{open.granularity}</dd>
            <dt className="text-rpg-muted">Uso em modelos</dt>
            <dd>{open.usedAsFeature ? "Gera variáveis" : "Apenas contexto"}</dd>
            <dt className="col-span-2 mt-1 text-rpg-muted">Elegibilidade</dt>
            <dd className="col-span-2">{open.eligibility}</dd>
          </dl>
        )}
      </Modal>
    </RPGPanel>
  );
}

/* ═════════════ Profecia do Dia ═════════════ */

/** Trilha das últimas profecias já resolvidas do artefato: acerto (limiar 50%) ou erro absoluto — só dias com valor real. */
function ProphecyTrack({ o, m }: { o: ForgeOverview; m: ForgeModel }) {
  const done = o.predictions
    .filter((p) => p.modelId === m.id && p.actual != null)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(-10);
  const cls = m.problem === "classification";
  const hits = cls ? done.filter((p) => (p.value >= 0.5 ? 1 : 0) === p.actual).length : 0;
  return (
    <div className="mt-4 border-t border-rpg-border/70 pt-3 sm:pr-20">
      <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-rpg-muted">
        <span>Últimas profecias resolvidas</span>
        {!!done.length && <span className="font-pixel text-[10px] text-rpg-text">{cls ? `${hits}/${done.length} acertos` : `erro médio ${fmtNum(done.reduce((a, p) => a + Math.abs(p.value - (p.actual ?? 0)), 0) / done.length, 2)}`}</span>}
      </p>
      {!done.length ? (
        <p className="text-[11px] text-rpg-muted">Ainda nenhuma: o resultado real de cada dia é conferido automaticamente quando o dia termina.</p>
      ) : (
        <ol className="flex flex-wrap gap-1.5" aria-label="Profecias resolvidas">
          {done.map((p) => {
            const ok = cls ? (p.value >= 0.5 ? 1 : 0) === p.actual : null;
            return (
              <li
                key={p.targetDate}
                className={clsx("flex h-8 min-w-8 flex-col items-center justify-center border-2 px-1 font-pixel text-[9px] leading-none", ok === null ? "border-rpg-cyan/60 text-rpg-cyan" : ok ? "border-rpg-green/70 bg-rpg-green/10 text-rpg-green" : "border-rpg-red/70 bg-rpg-red/10 text-rpg-red")}
                style={{ borderRadius: 3 }}
                title={`${fmtDate(p.targetDate)}: previsto ${predText(p, m)}, real ${cls ? (p.actual === 1 ? "sim" : "não") : fmtNum(p.actual, 1)}`}
              >
                <span aria-hidden>{ok === null ? fmtNum(Math.abs(p.value - (p.actual ?? 0)), 1) : ok ? "✓" : "✗"}</span>
                <span className="mt-0.5 text-[8px] text-rpg-muted">{p.targetDate.slice(8, 10)}</span>
                <span className="sr-only">{ok === null ? "" : ok ? "acerto" : "erro"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ProphecyPanel({ o, goTab }: { o: ForgeOverview; goTab: GoTab }) {
  const byId = new Map(o.models.map((m) => [m.id, m]));
  const upcoming = o.predictions.filter((p) => p.targetDate >= o.today).sort((a, b) => a.targetDate.localeCompare(b.targetDate) || Number(a.partial) - Number(b.partial));
  const [idx, setIdx] = useState(0);
  const p = upcoming[Math.min(idx, upcoming.length - 1)];
  const m = p ? byId.get(p.modelId) : undefined;
  const cls = m?.problem === "classification";
  const likely = cls && p ? p.value >= 0.5 : false;
  return (
    <RPGPanel title="Profecia do Dia" icon={<Sparkles size={15} className="text-rpg-purple" />} variant="legendary" className="relative h-full overflow-hidden" actions={<span className="font-pixel text-[10px] text-rpg-muted">ML · sem IA externa</span>}>
      <img src={`${FORGE_ART}/orb.webp`} alt="" aria-hidden className="pixelated pointer-events-none absolute -bottom-2 right-1 hidden w-20 opacity-90 sm:block" />
      {!p || !m ? (
        <div className="space-y-3 py-3">
          <p className="text-sm text-rpg-text/90">Nenhuma profecia ativa.</p>
          <p className="text-xs text-rpg-muted">Uma profecia só aparece quando um artefato supera a linha de base no teste final e você o ativa — assim nenhuma previsão chega sem prova.</p>
          <RPGButton variant="secondary" onClick={() => goTab("artefatos")}>
            <Hammer size={14} aria-hidden /> Ir aos artefatos
          </RPGButton>
        </div>
      ) : (
        <>
          {upcoming.length > 1 && (
            <div className="mb-2 flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Escolher profecia">
              {upcoming.map((u, i) => (
                <button key={`${u.modelId}-${u.targetDate}`} type="button" aria-pressed={i === idx} onClick={() => setIdx(i)} className={clsx("shrink-0 border px-2 py-0.5 text-[11px]", i === idx ? "border-rpg-purple bg-rpg-purple/20 text-rpg-text" : "border-rpg-border text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }}>
                  <span className="inline-block max-w-[150px] truncate align-bottom">{byId.get(u.modelId)?.name}</span> · {fmtDate(u.targetDate)}{u.partial ? " · prelim." : ""}
                </button>
              ))}
            </div>
          )}
          <div className="grid items-center gap-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <div className="flex flex-col items-center text-center">
              {cls ? (
                <RPGProgressRing value={p.value * 100} size={124} tone={likely ? "green" : "orange"} label={`Chance de ${m.targetLabel.toLowerCase()}`} valueClassName="text-2xl text-rpg-text" />
              ) : (
                <div className="flex h-[124px] w-[124px] flex-col items-center justify-center rounded-full border-4 border-rpg-cyan/70 bg-rpg-bg shadow-[inset_0_0_18px_-4px_rgb(var(--rpg-cyan)/0.7)]">
                  <span className="font-rpg text-3xl font-bold tabular-nums text-rpg-text">{fmtNum(p.value, 1)}</span>
                  {p.lower != null && p.upper != null && (
                    <span className="text-[10px] tabular-nums text-rpg-muted">
                      {fmtNum(p.lower, 1)}–{fmtNum(p.upper, 1)}
                    </span>
                  )}
                </div>
              )}
              <p className={clsx("mt-2 text-sm font-semibold", cls ? (likely ? "text-rpg-green" : "text-rpg-orange") : "text-rpg-cyan")}>{cls ? `${likely ? "Provável" : "Pouco provável"}: ${m.targetLabel.toLowerCase()}` : m.targetLabel}</p>
              <p className="text-[11px] text-rpg-muted">
                {fmtDate(p.targetDate)} · v{p.explanation.version}
                {p.partial && " · preliminar"}
              </p>
            </div>
            <div className="min-w-0 sm:pr-16">
              <p className="mb-1.5 text-xs font-semibold text-rpg-muted">Fatores principais</p>
              {!p.explanation.factors.length ? (
                <p className="text-xs text-rpg-muted">Nenhuma variável afastou a previsão da média.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {p.explanation.factors.slice(0, 4).map((f) => {
                    const up = f.effect > 0;
                    return (
                      <li key={f.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                        <span className={clsx("inline-flex h-5 w-5 items-center justify-center rounded-full border", up ? "border-rpg-green text-rpg-green" : "border-rpg-red text-rpg-red")} aria-hidden>
                          {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        </span>
                        <span className="truncate text-rpg-text/90" title={f.label}>
                          {f.label}
                        </span>
                        <span className={clsx("font-pixel text-xs tabular-nums", up ? "text-rpg-green" : "text-rpg-red")}>
                          {up ? "+" : "−"}
                          {cls ? `${fmtNum(Math.abs(f.effect) * 100, 0)} p.p.` : fmtNum(Math.abs(f.effect), 2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <ProphecyTrack o={o} m={m} />
          <RPGButton variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => goTab("previsoes")}>
            Ver análise completa
          </RPGButton>
          <p className="mt-2 text-[10px] text-rpg-muted">{m.name}. Fator = quanto a previsão muda se a variável estivesse na sua média. Associação, não causa.</p>
        </>
      )}
    </RPGPanel>
  );
}

/* ═════════════ Artefatos ativos ═════════════ */

/** Barra do artefato: acurácia balanceada (classificação) ou redução de erro sobre a base (regressão) — nunca mistura escalas. */
export function artifactScore(m: ForgeModel): { value: number; label: string } | null {
  const v = m.active ?? m.latest;
  const h = v?.metrics.holdout;
  if (!h) return null;
  if (isReg(h.model) && isReg(h.baseline)) {
    const gain = h.baseline.mae > 0 ? 1 - h.model.mae / h.baseline.mae : 0;
    return { value: Math.max(0, gain), label: `erro ${gain >= 0 ? "−" : "+"}${pct(Math.abs(gain))} vs base` };
  }
  if (!isReg(h.model)) return { value: h.model.balancedAccuracy, label: `${pct(h.model.balancedAccuracy)} acerto bal.` };
  return null;
}

function ArtifactsPanel({ o, goTab, notify }: { o: ForgeOverview; goTab: GoTab; notify: Notify }) {
  const { fromTemplate } = useForgeActions();
  const models = o.models.filter((m) => m.status !== "arquivado").slice(0, 5);
  const locked = o.templates.filter((t) => !t.created).slice(0, Math.max(0, 5 - models.length));
  return (
    <RPGPanel title="Artefatos" icon={<Hammer size={15} />} variant="gold" className="h-full" actions={<button type="button" className="text-xs text-rpg-gold-light hover:underline" onClick={() => goTab("artefatos")}>Ver todos</button>}>
      <ul className="space-y-2">
        {models.map((m) => {
          const tone = modelTone(o, m);
          const s = artifactScore(m);
          const ok = m.status === "ativo" || m.status === "aprovado";
          return (
            <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(90px,140px)] items-center gap-2.5">
              <IconTile tone={tone}>{templateIcon(o.templates.find((t) => t.key === m.templateKey)?.icon)}</IconTile>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-rpg-text">{m.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  <RPGBadge tone="purple">{m.versions ? `v${m.latest?.version ?? m.versions}` : "v0"}</RPGBadge>
                  <RPGBadge tone={m.status === "ativo" ? "green" : m.status === "degradado" ? "red" : m.status === "aprovado" ? "gold" : m.status === "aguardando_dados" ? "orange" : "muted"}>{m.status.replace("_", " ")}</RPGBadge>
                </p>
              </div>
              <div className="min-w-0 text-right">
                {s ? (
                  <>
                    <RPGProgressBar tone={ok ? "green" : "orange"} label={`Desempenho de ${m.name}`} value={s.value * 100} showLabel={false} />
                    <p className="mt-0.5 truncate font-pixel text-[10px] tabular-nums text-rpg-muted">{s.label}</p>
                  </>
                ) : (
                  <p className="text-[11px] text-rpg-muted">não treinado</p>
                )}
              </div>
            </li>
          );
        })}
        {locked.map((t) => (
          <li key={t.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 opacity-80">
            <IconTile tone="muted" dim>
              <Lock size={16} />
            </IconTile>
            <div className="min-w-0">
              <p className="truncate text-sm text-rpg-muted">{t.name}</p>
              <p className="truncate text-[11px] text-rpg-muted/80">{t.description}</p>
            </div>
            <RPGButton variant="ghost" className="!py-1 text-xs" disabled={fromTemplate.isPending} onClick={() => fromTemplate.mutate(t.key, { onSuccess: () => notify(`${t.name} forjado. Treine quando quiser.`), onError: (e) => notify(errMsg(e, "Não foi possível forjar."), "error") })}>
              Forjar
            </RPGButton>
          </li>
        ))}
        {!models.length && !locked.length && <p className="text-sm text-rpg-muted">Nenhum artefato.</p>}
      </ul>
    </RPGPanel>
  );
}

/* ═════════════ Arena (resumo) ═════════════ */

function ArenaPanel({ o, goTab }: { o: ForgeOverview; goTab: GoTab }) {
  const m = o.models.find((x) => x.activeVersionId && x.active) ?? [...o.models].filter((x) => x.latest).sort((a, b) => (b.lastTrainedAt ?? "").localeCompare(a.lastTrainedAt ?? ""))[0];
  const v = m ? (m.active ?? m.latest) : null;
  const mt = v?.metrics;
  const lower = mt ? mt.primary !== "balanced_accuracy" : false;
  const rows = mt ? [...mt.arena].sort((a, b) => (lower ? a.cvMean - b.cvMean : b.cvMean - a.cvMean)).slice(0, 6) : [];
  return (
    <RPGPanel title="Arena de Modelos" icon={<Swords size={15} />} variant="gold" className="h-full" actions={<button type="button" className="text-xs text-rpg-gold-light hover:underline" onClick={() => goTab("arena")}>Ver arena</button>}>
      {!m || !mt ? (
        <p className="py-3 text-sm text-rpg-muted">Treine um artefato: todos os algoritmos duelam contra a linha de base em validação temporal.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rpg-muted">
            {m.name} · v{v!.version} · {lower ? "menor é melhor" : "maior é melhor"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-rpg-muted">
                  <th className="pb-1 font-normal">Algoritmo</th>
                  <th className="pb-1 text-right font-normal">Validação</th>
                  <th className="pb-1 text-right font-normal">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const sel = e.algorithm === mt.selected;
                  return (
                    <tr key={e.algorithm} className={clsx("border-t border-rpg-border/50", sel && "bg-rpg-gold/10")}>
                      <td className="py-1 pr-2">
                        <span className="flex items-center gap-1.5">
                          {sel ? <Trophy size={13} className="text-rpg-gold" aria-hidden /> : <span className="w-[13px] text-center font-pixel text-[10px] text-rpg-muted">{i + 1}</span>}
                          <span className={clsx("truncate", sel ? "text-rpg-gold-light" : "text-rpg-text")}>{e.label}</span>
                          {e.isBaseline && <RPGBadge tone="muted">base</RPGBadge>}
                        </span>
                      </td>
                      <td className="py-1 text-right font-pixel text-xs tabular-nums text-rpg-text">{fmtNum(e.cvMean)}</td>
                      <td className="py-1 text-right text-xs">
                        {sel ? <span className={mt.beatsBaseline ? "text-rpg-green" : "text-rpg-orange"}>{mt.beatsBaseline ? "Campeão" : "Referência"}</span> : <span className="text-rpg-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">{mt.beatsBaseline ? "O campeão venceu a base na validação e no teste final." : "Nenhum desafiante venceu a base com confiança — sem campeão superior."}</p>
        </>
      )}
    </RPGPanel>
  );
}

/* ═════════════ Linha inferior: gargalos, experimentos, recomendações ═════════════ */

const runTone = (r: Run): RpgTone => (r.status === "done" ? "green" : r.status === "failed" ? "red" : r.status === "insufficient" ? "orange" : "muted");

function BottlenecksPanel({ o, goTab }: { o: ForgeOverview; goTab: GoTab }) {
  const b = o.quality?.bottlenecks ?? [];
  return (
    <RPGPanel title="Gargalos Identificados" icon={<AlertTriangle size={15} className="text-rpg-red" />} className="h-full" actions={<button type="button" className="text-xs text-rpg-gold-light hover:underline" onClick={() => goTab("gargalos")}>Detalhes</button>}>
      {!o.quality ? (
        <p className="text-sm text-rpg-muted">Analise os dados no Núcleo para procurar gargalos.</p>
      ) : !b.length ? (
        <p className="flex items-center gap-2 text-sm text-rpg-green">
          <CheckCircle2 size={16} aria-hidden /> Nenhuma queda ≥ 20% nas últimas duas semanas.
        </p>
      ) : (
        <ul className="space-y-2">
          {b.slice(0, 4).map((x) => (
            <li key={x.key} className="flex items-center gap-2 text-sm">
              <AlertTriangle size={15} className="shrink-0 text-rpg-red" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-rpg-text">{x.label}</span>
              <span className="font-pixel text-xs tabular-nums text-rpg-red">{x.diffPct}%</span>
            </li>
          ))}
        </ul>
      )}
    </RPGPanel>
  );
}

function RunsPanel({ o, goTab }: { o: ForgeOverview; goTab: GoTab }) {
  const names = new Map(o.models.map((m) => [m.id, m.name]));
  const runs = o.runs.filter((r) => !r.archived).slice(0, 4);
  return (
    <RPGPanel title="Experimentos Recentes" icon={<FlaskConical size={15} className="text-rpg-green" />} className="h-full" footer={<RPGButton variant="secondary" className="w-full" onClick={() => goTab("experimentos")}>Ver todos os experimentos</RPGButton>}>
      {!runs.length ? (
        <p className="text-sm text-rpg-muted">Nenhuma execução ainda.</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <FlaskConical size={14} className="shrink-0 text-rpg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-rpg-text">
                {RUN_KIND[r.kind]} · {r.modelId ? (names.get(r.modelId) ?? "modelo removido") : "dados"}
              </span>
              <RPGBadge tone={runTone(r)}>{RUN_STATUS[r.status]}</RPGBadge>
            </li>
          ))}
        </ul>
      )}
    </RPGPanel>
  );
}

function RecommendationsPanel({ o }: { o: ForgeOverview }) {
  // Recomendações são derivadas de estados reais: alertas e próximos marcos do pesquisador.
  const items: Array<{ text: string; tone: RpgTone }> = [
    ...o.alerts.slice(0, 3).map((a) => ({ text: a.text, tone: (a.level === "alto" ? "red" : a.level === "medio" ? "orange" : "blue") as RpgTone })),
    ...o.milestones.filter((m) => !m.done).slice(0, Math.max(0, 3 - o.alerts.length)).map((m) => ({ text: `Próximo marco: ${m.title} — ${m.description}`, tone: "gold" as RpgTone })),
  ];
  return (
    <RPGPanel
      title="Recomendações da Forja"
      icon={<Lightbulb size={15} />}
      variant="gold"
      className="h-full"
      footer={
        <RPGButton variant="primary" className="w-full" onClick={() => document.getElementById("forja-mestre")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Consultar o Mestre da Inteligência
        </RPGButton>
      }
    >
      {!items.length ? (
        <p className="text-sm text-rpg-muted">Tudo em ordem: nenhum alerta e todos os marcos conquistados.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-rpg-text/90">
              <CheckCircle2 size={15} className={clsx("mt-0.5 shrink-0", RPG_TONE_TEXT[it.tone])} aria-hidden />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </RPGPanel>
  );
}

function MilestonesPanel({ o }: { o: ForgeOverview }) {
  const done = o.milestones.filter((m) => m.done).length;
  return (
    <RPGPanel title="Marcos do Pesquisador" icon={<Medal size={15} />} variant="gold" className="h-full">
      <div className="mb-3 flex items-center gap-3">
        <img src={`${FORGE_ART}/emblem.webp`} alt="" aria-hidden className="pixelated h-16 w-auto" />
        <div className="min-w-0">
          <p className="rpg-title truncate text-lg font-bold">{o.researcher.title}</p>
          <p className="text-xs text-rpg-muted">
            {done} de {o.milestones.length} marcos · cada um paga uma única vez +{o.milestoneReward.xp} XP e +{o.milestoneReward.coins} moedas
          </p>
        </div>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {o.milestones.map((m) => (
          <li key={m.code} className={clsx("flex items-start gap-2 border p-2 text-xs", m.done ? "border-rpg-gold/50 bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/50")} style={{ borderRadius: 3 }} title={m.description}>
            {m.done ? <CheckCircle2 size={15} className="shrink-0 text-rpg-gold" aria-hidden /> : <Circle size={15} className="shrink-0 text-rpg-muted" aria-hidden />}
            <span className={m.done ? "text-rpg-text" : "text-rpg-muted"}>{m.title}</span>
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}

export function OverviewTab({ o, notify, goTab }: { o: ForgeOverview; notify: Notify; goTab: GoTab }) {
  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <NucleusPanel o={o} notify={notify} />
        <ProphecyPanel o={o} goTab={goTab} />
      </div>
      <div className="grid items-stretch gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ArtifactsPanel o={o} goTab={goTab} notify={notify} />
        <ArenaPanel o={o} goTab={goTab} />
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <BottlenecksPanel o={o} goTab={goTab} />
        <RunsPanel o={o} goTab={goTab} />
        <div className="md:col-span-2 xl:col-span-1">
          <RecommendationsPanel o={o} />
        </div>
      </div>
      <div id="forja-mestre" className="grid items-start gap-4 scroll-mt-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <AdvisorPanel module="forge" title="Mestre da Inteligência" avatar={`${FORGE_ART}/orb.webp`} />
        <MilestonesPanel o={o} />
      </div>
    </div>
  );
}
