import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookMarked, CheckCircle2, ClipboardList, Download, Eye, FlaskConical, History, Lightbulb, Microscope, Pause, Play, Sparkles, Target, TestTube2 } from "lucide-react";
import type { CycleStage, DiscoveryVerdict, LabExperiment, LabHub } from "@/services/chronicleLabService";
import type { ExperimentAISuggestion } from "@/types";
import { API_URL } from "@/services/api";
import { useChronicleActions } from "@/hooks/useChronicleLab";
import { RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection, RankPanel } from "@/components/rpg-modules/ModuleKit";

/**
 * Laboratório da Jornada 2.0 — peças RPG (lê /api/lab). As análises
 * estatísticas continuam no servidor (experimentAnalysisService); aqui só
 * exibimos, separando dias decorridos de dias cumpridos.
 */

const R = { borderRadius: 4 } as const;
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function LabRankPanel({ hub }: { hub: LabHub }) {
  const b = hub.rankBreakdown;
  return (
    <RankPanel
      title="Rank do Pesquisador"
      subtitle={`${hub.indicators.completed} experimento(s) concluído(s)`}
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="pts"
      icon={<Microscope size={26} />}
      rules={
        <>
          Reconhece método, não resultado: 3 por dia com observação ({b.logDays}), 5 por hipótese escrita ({b.hypotheses}), 40 por experimento concluído com conclusão documentada ({b.documented}) —
          apoiado, não apoiado ou inconclusivo valem igual — e 15 por interrompido com justificativa ({b.stoppedDocumented}).
        </>
      }
    />
  );
}

export function LabIndicators({ hub }: { hub: LabHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
      <IndicatorCard tone="purple" icon={<FlaskConical size={24} />} label="Ativos" value={i.active} />
      <IndicatorCard tone="green" icon={<CheckCircle2 size={24} />} label="Concluídos" value={i.completed} />
      <IndicatorCard tone="orange" icon={<Microscope size={24} />} label="Em análise" value={i.inAnalysis} hint="período terminou" />
      <IndicatorCard tone="blue" icon={<Pause size={24} />} label="Pausados" value={i.paused} />
      <IndicatorCard tone="pink" icon={<Lightbulb size={24} />} label="Hipóteses" value={i.hypotheses} />
      <IndicatorCard tone="gold" icon={<BookMarked size={24} />} label="Descobertas" value={i.discoveries} hint="com conclusão" />
      <IndicatorCard tone="gold" icon={<Sparkles size={24} />} label="XP de experimentação" value={i.xp.toLocaleString("pt-BR")} hint="já concedido" />
      <IndicatorCard
        tone="green"
        icon={<Eye size={24} />}
        label={i.successRatePct != null ? "Taxa de sucesso" : "Consistência"}
        value={i.successRatePct != null ? `${i.successRatePct}%` : i.consistencyPct == null ? "--" : `${i.consistencyPct}%`}
        hint={i.successRatePct != null ? `${i.successRateBase} com critério definido` : "dias cumpridos ÷ decorridos"}
        title="A taxa de sucesso só aparece com ao menos 3 concluídos que tinham critério de sucesso e veredito registrado."
      />
    </div>
  );
}

const STAGES: Array<{ key: CycleStage; label: string; hint: string }> = [
  { key: "ideia", label: "Ideia", hint: "O que você quer melhorar ou investigar." },
  { key: "hipotese", label: "Hipótese", hint: "O que espera observar." },
  { key: "planejamento", label: "Planejamento", hint: "Métricas, duração e critério definidos." },
  { key: "execucao", label: "Execução", hint: "Experimento ativo, aguardando os primeiros registros." },
  { key: "coleta", label: "Coleta", hint: "Registros diários em andamento." },
  { key: "analise", label: "Análise", hint: "Período encerrado — compare com o período de referência." },
  { key: "conclusao", label: "Conclusão", hint: "Conclusão documentada (apoiada, não apoiada ou inconclusiva)." },
];

export function ExperimentCycle({ stage }: { stage: CycleStage }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  const [open, setOpen] = useState<CycleStage>(stage);
  return (
    <div>
      <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Ciclo de experimentação">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setOpen(s.key)}
              aria-current={s.key === stage ? "step" : undefined}
              className={clsx(
                "flex flex-col items-center gap-0.5 px-1 text-[10px]",
                i < idx ? "text-rpg-green" : i === idx ? "text-rpg-gold-light" : "text-rpg-muted",
                open === s.key && "underline underline-offset-2",
              )}
            >
              <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full border-2 font-pixel", i < idx ? "border-rpg-green bg-rpg-green/20" : i === idx ? "border-rpg-gold bg-rpg-gold/20 motion-safe:animate-pulse" : "border-rpg-border")}>
                {i < idx ? "✓" : i + 1}
              </span>
              {s.label}
            </button>
            {i < STAGES.length - 1 && <span className={clsx("mx-0.5 h-0.5 w-4", i < idx ? "bg-rpg-green" : "bg-rpg-border")} aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-[11px] text-rpg-muted">{STAGES.find((s) => s.key === open)?.hint}</p>
    </div>
  );
}

export function FeaturedExperiment({ hub, onLog, onStatus }: { hub: LabHub; onLog: (e: LabExperiment) => void; onStatus: (e: LabExperiment, status: "active" | "paused") => void }) {
  const e = hub.featured;
  if (!e) return <KitSection title="Experimento em destaque" icon={<FlaskConical size={16} />}><p className="text-sm text-rpg-muted">Nenhum experimento ainda. Comece pela Biblioteca de Protocolos ou pela IA Cientista.</p></KitSection>;
  return (
    <KitSection title="Experimento em destaque" icon={<FlaskConical size={16} />} tone="gold" action={<span className={clsx("font-pixel text-[10px] uppercase", e.status === "active" ? "text-rpg-green" : "text-rpg-muted")}>{STATUS_LABEL[e.status] ?? e.status}</span>}>
      <p className="font-rpg text-lg font-bold text-rpg-gold-light">
        {e.emoji ? `${e.emoji} ` : ""}
        {e.title}
      </p>
      {e.hypothesis && <p className="text-[12.5px] text-rpg-text">Hipótese: {e.hypothesis}</p>}
      <p className="mt-0.5 text-[11px] text-rpg-muted">
        {dayBr(e.startDate)} → {dayBr(e.endDate)} · {e.totalDays} dias · métrica: {e.primaryMetric}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <p className="font-pixel text-[9px] uppercase text-rpg-muted">Dias decorridos</p>
          <RPGProgressBar value={e.elapsedDays} max={e.totalDays} tone="purple" label="Dias decorridos" valueLabel={`${e.elapsedDays}/${e.totalDays}`} />
        </div>
        <div>
          <p className="font-pixel text-[9px] uppercase text-rpg-muted">Dias cumpridos</p>
          <RPGProgressBar value={e.doneDays} max={Math.max(1, e.elapsedDays)} tone="green" label="Dias cumpridos" valueLabel={`${e.doneDays}/${e.elapsedDays}`} />
        </div>
      </div>
      {e.missingDays > 0 && <p className="mt-1 text-[11px] text-rpg-orange">{e.missingDays} dia(s) sem nenhum registro até agora.</p>}
      <div className="mt-2">
        <ExperimentCycle stage={e.stage} />
      </div>
      <p className="mt-2 text-sm text-rpg-text">
        <strong>Próxima ação:</strong> {e.nextAction}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.status === "active" && (
          <button type="button" className="rpg-btn rpg-btn-primary text-xs" onClick={() => onLog(e)}>
            Registrar observação
          </button>
        )}
        {e.status === "active" && (
          <button type="button" className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => onStatus(e, "paused")}>
            <Pause size={12} aria-hidden /> Pausar
          </button>
        )}
        {(e.status === "paused" || e.status === "draft") && (
          <button type="button" className="rpg-btn rpg-btn-success inline-flex items-center gap-1 text-xs" onClick={() => onStatus(e, "active")}>
            <Play size={12} aria-hidden /> {e.status === "draft" ? "Iniciar" : "Continuar"}
          </button>
        )}
        <Link to={`/experimentos/${e.id}`} className="rpg-btn rpg-btn-secondary text-xs">
          Analisar · Concluir · Editar
        </Link>
      </div>
    </KitSection>
  );
}

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", paused: "Pausado", completed: "Concluído", cancelled: "Interrompido" };

export function ExperimentsList({ hub, filter }: { hub: LabHub; filter?: (e: LabExperiment) => boolean }) {
  const list = filter ? hub.experiments.filter(filter) : hub.experiments;
  if (list.length === 0) return <p className="text-sm text-rpg-muted">Nada por aqui ainda.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((e) => (
        <li key={e.id}>
          <Link to={`/experimentos/${e.id}`} className="block h-full border-2 border-rpg-border bg-rpg-panel p-3 hover:border-rpg-purple/70" style={R}>
            <div className="flex items-center gap-1.5">
              <span aria-hidden>{e.emoji ?? "🧪"}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{e.title}</p>
              <span className="shrink-0 font-pixel text-[9px] uppercase text-rpg-muted">{STATUS_LABEL[e.status] ?? e.status}</span>
            </div>
            {e.hypothesis && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-rpg-muted">{e.hypothesis}</p>}
            <p className="mt-1 text-[11px] text-rpg-muted">
              Etapa: <span className="text-rpg-gold-light">{STAGES.find((s) => s.key === e.stage)?.label}</span> · {e.doneDays}/{e.elapsedDays} dias cumpridos
            </p>
            {e.adherencePct != null && <RPGProgressBar className="mt-1" value={Math.min(100, e.adherencePct)} tone="green" label={`Adesão de ${e.title}`} showLabel={false} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Modelos prontos e editáveis — abrem o assistente de criação já preenchido (nada é criado direto). */
export const PROTOCOLS: Array<{ category: string; icon: string; suggestion: ExperimentAISuggestion; howTo: string }> = [
  { category: "Foco e Produtividade", icon: "⚡", suggestion: { title: "Blocos de foco de 50 min", hypothesis: "Trabalhar em blocos de 50 min com pausa está associado a mais missões concluídas por dia.", durationDays: 21, primaryMetric: "tasks_completed", motivation: "Melhorar a execução diária." }, howTo: "2 blocos por dia útil; registre se cumpriu. Adesão: bloco iniciado e terminado." },
  { category: "Sono e Rotina", icon: "🌙", suggestion: { title: "Horário fixo para deitar", hypothesis: "Deitar sempre no mesmo horário está associado a melhor qualidade de sono percebida.", durationDays: 21, primaryMetric: "sleep_quality", motivation: "Regularidade do sono, sem reduzir horas de descanso." }, howTo: "Escolha um horário realista e mantenha a duração normal de sono. Nunca reduza o sono para testar." },
  { category: "Estudos", icon: "📚", suggestion: { title: "Blocos regulares de estudo", hypothesis: "Blocos regulares de estudo estão associados a mais consistência semanal.", durationDays: 28, primaryMetric: "study_minutes", motivation: "Consistência acadêmica." }, howTo: "Defina dias fixos e duração; registre as sessões na Educação." },
  { category: "Organização", icon: "🗺️", suggestion: { title: "Planejamento semanal", hypothesis: "Semanas com plano selado no Conselho têm mais missões concluídas do que semanas sem plano.", durationDays: 28, primaryMetric: "tasks_completed", motivation: "Comparar semanas com e sem planejamento." }, howTo: "Sele o plano toda segunda; compare com o período anterior." },
  { category: "Exercícios", icon: "🏃", suggestion: { title: "Caminhada leve 3x por semana", hypothesis: "Caminhar 3x por semana está associado a mais energia autorrelatada.", durationDays: 28, primaryMetric: "energy", motivation: "Movimento leve e sustentável." }, howTo: "20–30 min em ritmo confortável. Sem aumentar carga de forma brusca." },
  { category: "Bem-estar", icon: "🌿", suggestion: { title: "Pausa de respiração diária", hypothesis: "Uma pausa de 5 min de respiração está associada a menor estresse autorrelatado.", durationDays: 14, primaryMetric: "stress", motivation: "Pequenas pausas no dia." }, howTo: "5 min após o almoço; registre estresse no check-in. Não substitui acompanhamento profissional." },
  { category: "Leitura", icon: "📖", suggestion: { title: "Leitura diária de 15 min", hypothesis: "Ler 15 min por dia aumenta o número de páginas lidas por semana.", durationDays: 21, primaryMetric: "reading_pages", motivation: "Manter o hábito de leitura." }, howTo: "Horário âncora (ex.: antes de dormir); registre a sessão na Biblioteca." },
  { category: "Hábitos", icon: "🔗", suggestion: { title: "Âncora de hábito", hypothesis: "Ligar um hábito a uma rotina existente aumenta a consistência dele.", durationDays: 21, primaryMetric: "habit_consistency", motivation: "Consistência de hábitos." }, howTo: "Escolha o hábito e a rotina-âncora (ex.: após o café)." },
  { category: "Rotina", icon: "☀️", suggestion: { title: "Rotina matinal", hypothesis: "Executar uma rotina matinal curta está associado a mais disposição autorrelatada.", durationDays: 21, primaryMetric: "energy", motivation: "Começar o dia com intenção." }, howTo: "3 passos simples; adesão = rotina feita até 10h." },
];

export function ProtocolLibrary({ onPick, onCustom }: { onPick: (s: ExperimentAISuggestion) => void; onCustom: () => void }) {
  return (
    <KitSection title="Biblioteca de Protocolos" icon={<ClipboardList size={16} />}>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PROTOCOLS.map((p) => (
          <li key={p.suggestion.title} className="flex flex-col border-2 border-rpg-border bg-rpg-bg-2/70 p-3" style={R}>
            <p className="font-pixel text-[9px] uppercase text-rpg-purple">
              {p.icon} {p.category}
            </p>
            <p className="text-sm font-semibold text-rpg-text">{p.suggestion.title}</p>
            <p className="mt-0.5 text-[11.5px] text-rpg-muted">{p.suggestion.hypothesis}</p>
            <p className="mt-1 text-[11px] text-rpg-text">{p.howTo}</p>
            <p className="mt-1 text-[10.5px] text-rpg-muted">
              {p.suggestion.durationDays} dias · métrica {p.suggestion.primaryMetric}
            </p>
            <button type="button" className="rpg-btn rpg-btn-secondary mt-auto pt-2 text-xs" onClick={() => onPick(p.suggestion)}>
              Usar e revisar
            </button>
          </li>
        ))}
        <li className="flex flex-col items-center justify-center border-2 border-dashed border-rpg-border p-3 text-center" style={R}>
          <p className="text-sm text-rpg-text">Personalizado</p>
          <button type="button" className="rpg-btn rpg-btn-ghost mt-1 text-xs" onClick={onCustom}>
            Criar do zero
          </button>
        </li>
      </ul>
      <p className="mt-2 text-[10.5px] text-rpg-muted">Os protocolos evitam privação de sono, restrições alimentares, excesso de exercício e qualquer mudança de tratamento médico.</p>
    </KitSection>
  );
}

const VERDICT_UI: Record<DiscoveryVerdict, { label: string; cls: string }> = {
  apoiada: { label: "Hipótese apoiada pelos dados", cls: "border-rpg-green/70 text-rpg-green" },
  nao_apoiada: { label: "Hipótese não apoiada", cls: "border-rpg-red/70 text-rpg-red" },
  inconclusiva: { label: "Resultado inconclusivo", cls: "border-rpg-blue/70 text-rpg-blue" },
  interrompida: { label: "Experimento interrompido", cls: "border-rpg-border text-rpg-muted" },
};

export function DiscoveriesLibrary({ hub }: { hub: LabHub }) {
  return (
    <KitSection title="Biblioteca de Descobertas" icon={<BookMarked size={16} />} tone="gold">
      {hub.discoveries.length === 0 ? (
        <p className="text-sm text-rpg-muted">Conclua ou interrompa um experimento documentando o que aprendeu. Resultados inconclusivos também contam.</p>
      ) : (
        <ul className="space-y-1.5">
          {hub.discoveries.map((d) => (
            <li key={d.id} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span aria-hidden>{d.emoji ?? "🧪"}</span>
                <Link to={`/experimentos/${d.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text underline">
                  {d.title}
                </Link>
                <span className={clsx("border px-1 font-pixel text-[9px] uppercase", VERDICT_UI[d.verdict].cls)} style={{ borderRadius: 2 }}>
                  {VERDICT_UI[d.verdict].label}
                </span>
              </div>
              {d.conclusion ? <p className="mt-0.5 text-[12px] text-rpg-text">{d.conclusion}</p> : <p className="mt-0.5 text-[11px] text-rpg-orange">Conclusão ainda não documentada.</p>}
              <p className="text-[10.5px] text-rpg-muted">Encerrado em {dayBr(d.endDate)} · estudo pessoal observacional (não é prova científica).</p>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/** Resultados: análise do servidor (detalhe), exportação dos dados brutos e explicação da IA com os mesmos números. */
export function ResultsList({ hub, goals, onToast }: { hub: LabHub; goals: Array<{ id: string; title: string }>; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { explain, setGoal } = useChronicleActions();
  const [explained, setExplained] = useState<Record<string, { ai: boolean; text: string }>>({});
  const list = hub.experiments.filter((e) => e.status !== "draft");
  return (
    <KitSection title="Resultados" icon={<TestTube2 size={16} />}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Inicie um experimento para ver resultados.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <li key={e.id} className="border border-rpg-border/70 bg-rpg-bg-2/60 p-2" style={R}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{e.title}</span>
                <span className="text-[11px] text-rpg-muted">
                  {dayBr(e.startDate)}–{dayBr(e.endDate)} · {e.loggedDays} registro(s) · adesão {e.adherencePct ?? "--"}%
                </span>
              </div>
              {e.loggedDays < 7 && <p className="text-[11px] text-rpg-orange">Amostra pequena: evite conclusões com menos de 7 dias de dados.</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Link to={`/experimentos/${e.id}`} className="rpg-btn rpg-btn-secondary text-xs">
                  Ver análise completa
                </Link>
                <button
                  type="button"
                  className="rpg-btn rpg-btn-primary inline-flex items-center gap-1 text-xs"
                  disabled={explain.isPending}
                  onClick={() => explain.mutate({ id: e.id }, { onSuccess: (r) => setExplained((s) => ({ ...s, [e.id]: r })), onError: (x) => onToast(x instanceof Error ? x.message : "Falhou.", "error") })}
                >
                  <Sparkles size={12} aria-hidden /> Explicar resultados
                </button>
                <a href={`${API_URL}/lab/experiments/${e.id}/export.csv`} className="inline-flex items-center gap-1 text-xs text-rpg-gold-light underline">
                  <Download size={12} aria-hidden /> Exportar dados (CSV)
                </a>
                <label className="sr-only" htmlFor={`goal-${e.id}`}>
                  Meta vinculada
                </label>
                <select
                  id={`goal-${e.id}`}
                  value={e.goalId ?? ""}
                  onChange={(ev) => setGoal.mutate({ id: e.id, goalId: ev.target.value || null }, { onSuccess: () => onToast("Vínculo com meta atualizado."), onError: (x) => onToast(x instanceof Error ? x.message : "Falhou.", "error") })}
                  className="min-h-[34px] max-w-[12rem] border border-rpg-border bg-rpg-bg px-1 text-[11px] text-rpg-text"
                  style={R}
                >
                  <option value="">Sem meta vinculada</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      🎯 {g.title}
                    </option>
                  ))}
                </select>
              </div>
              {explained[e.id] && (
                <p className="mt-1.5 whitespace-pre-line border-l-2 border-rpg-purple pl-2 text-[12px] text-rpg-text">
                  <span className="font-pixel text-[9px] uppercase text-rpg-purple">{explained[e.id]!.ai ? "IA Cientista" : "Fatos calculados"}</span>
                  <br />
                  {explained[e.id]!.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] text-rpg-muted">Correlação não é causalidade. Observações de dias seguidos não são independentes; fatores como rotina, clima e outros experimentos podem confundir.</p>
    </KitSection>
  );
}

export function HypothesesList({ hub, onNew }: { hub: LabHub; onNew: () => void }) {
  return (
    <KitSection title="Hipóteses" icon={<Lightbulb size={16} />} action={<button type="button" className="rpg-btn rpg-btn-secondary px-2 py-1 text-xs" onClick={onNew}>Nova hipótese</button>}>
      <ExperimentsList hub={hub} filter={(e) => !!e.hypothesis} />
    </KitSection>
  );
}

export function ProtocolChanges({ hub }: { hub: LabHub }) {
  const title = new Map(hub.experiments.map((e) => [e.id, e.title]));
  return (
    <KitSection title="Histórico de alterações de protocolo" icon={<History size={16} />}>
      {hub.protocolChanges.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma alteração registrada. Mudanças de hipótese, métricas, critério ou datas aparecem aqui.</p>
      ) : (
        <ul className="space-y-1 text-[12px]">
          {hub.protocolChanges.map((c, i) => (
            <li key={i} className="text-rpg-text">
              <span className="font-pixel text-[10px] text-rpg-muted">{c.createdAt.slice(8, 10)}/{c.createdAt.slice(5, 7)}</span> {title.get(c.experimentId) ?? "Experimento"} — <strong>{c.field}</strong>: “{(c.oldValue ?? "—").slice(0, 60)}” → “{(c.newValue ?? "—").slice(0, 60)}”
              {c.afterStart && <span className="ml-1 font-pixel text-[9px] uppercase text-rpg-orange">após o início</span>}
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

export function NextActions({ hub }: { hub: LabHub }) {
  const list = hub.experiments.filter((e) => e.status === "active" || e.status === "draft" || e.stage === "analise").slice(0, 5);
  return (
    <KitSection title="Próximas ações" icon={<Target size={16} />}>
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Sem pendências.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-rpg-purple" aria-hidden />
              <Link to={`/experimentos/${e.id}`} className="min-w-0 flex-1 truncate text-rpg-text underline">
                {e.title}
              </Link>
              <span className="shrink-0 text-[11px] text-rpg-muted">{e.nextAction}</span>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}
