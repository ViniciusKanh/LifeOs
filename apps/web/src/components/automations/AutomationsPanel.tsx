import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, History, Loader2, Play, Sparkles, Zap } from "lucide-react";
import { RPGSwitch } from "@/components/rpg";
import { useAutomationRuns, useAutomations } from "@/hooks/useAutomations";
import type { Automation, AutomationModule } from "@/services/automationsService";

/**
 * Central de automações (Grimório e Metas). Cada automação é real:
 * liga/desliga persistido, configuração validada no servidor, "Executar
 * agora", última/próxima execução e histórico. Compartilhada pelas duas telas.
 */

const LABELS: Record<string, { label: string; suffix?: string; min?: number; max?: number }> = {
  minWords: { label: "Mínimo de palavras na entrada", min: 20, max: 1000 },
  lookbackDays: { label: "Olhar entradas dos últimos", suffix: "dias", min: 1, max: 14 },
  maxEntries: { label: "Entradas por execução", min: 1, max: 5 },
  cardsPerEntry: { label: "Cartões por entrada", min: 3, max: 10 },
  cardsPerImport: { label: "Cartões por importação", min: 3, max: 20 },
  withSummary: { label: "Gerar resumo junto" },
  dailyLimit: { label: "Limite de revisões por dia", min: 10, max: 1000 },
  concepts: { label: "Extrair conceitos-chave" },
  questions: { label: "Sugerir perguntas de estudo" },
  preferredHour: { label: "Seu horário de estudo", suffix: "h", min: 0, max: 23 },
  minDue: { label: "Avisar a partir de", suffix: "cartões", min: 1, max: 500 },
  inApp: { label: "Avisar no LifeOS" },
  push: { label: "Enviar notificação push" },
  daysBefore: { label: "Avisar quando faltarem", suffix: "dias", min: 1, max: 60 },
  stalledDays: { label: "Considerar parada após", suffix: "dias", min: 3, max: 90 },
  tasksPerDay: { label: "Tarefas por dia", min: 1, max: 10 },
  includeWeekend: { label: "Incluir fim de semana" },
  deckId: { label: "Baralho de destino" },
  // Banco
  split_cofre_livre: { label: "Cofre Livre", suffix: "%", min: 0, max: 100 },
  split_cofre_aventureiro: { label: "Cofre do Aventureiro", suffix: "%", min: 0, max: 100 },
  split_rota_mercador: { label: "Rota do Mercador", suffix: "%", min: 0, max: 100 },
  split_fundo_dragao: { label: "Fundo do Dragão", suffix: "%", min: 0, max: 100 },
  autoPay: { label: "Autorizo o pagamento automático da fatura quando o saldo cobrir" },
  // Educação
  sessionsPerDay: { label: "Sessões por dia", min: 1, max: 6 },
  sessionMinutes: { label: "Duração da sessão", suffix: "min", min: 15, max: 180 },
  // Saúde (limites prudentes — o backend também valida)
  bedtimeHour: { label: "Horário do ritual noturno", suffix: "h", min: 18, max: 23 },
  waterGoalMl: { label: "Meta diária de água", suffix: "ml", min: 1500, max: 4000 },
  sleepGoalMinutes: { label: "Meta de sono", suffix: "min", min: 360, max: 600 },
  weeklyWorkouts: { label: "Treinos por semana", min: 1, max: 7 },
  // Agenda
  dayStartHour: { label: "Início da janela de trabalho", suffix: "h", min: 5, max: 12 },
  dayEndHour: { label: "Fim da janela de trabalho", suffix: "h", min: 13, max: 23 },
  maxPerDay: { label: "Máximo de missões por dia", min: 1, max: 10 },
  gapDays: { label: "Avisar após dias sem registro", suffix: "dias", min: 1, max: 14 },
};

const STATUS_UI = {
  ok: { label: "Concluída", icon: CheckCircle2, cls: "text-rpg-green" },
  skipped: { label: "Sem ação", icon: Clock, cls: "text-rpg-muted" },
  error: { label: "Falhou", icon: AlertTriangle, cls: "text-rpg-red" },
} as const;

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export function AutomationsPanel({
  module,
  decks = [],
  keys,
  title = "Automações",
  intro,
  icon,
}: {
  module: AutomationModule;
  decks?: Array<{ id: string; name: string }>;
  keys?: string[];
  title?: string;
  intro?: ReactNode;
  icon?: ReactNode;
}) {
  const { automations, isLoading, isError, refetch, update, run } = useAutomations(module);
  const list = keys ? automations.filter((a) => keys.includes(a.key)) : automations;
  const [result, setResult] = useState<Record<string, { status: string; summary: string }>>({});

  return (
    <section className="rpg-panel p-4" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-rpg-gold" aria-hidden>
          {icon ?? <Zap size={18} />}
        </span>
        <h2 className="rpg-title text-lg font-bold">{title}</h2>
        {intro && <p className="w-full text-xs text-rpg-muted">{intro}</p>}
      </div>
      {isLoading && (
        <div className="grid gap-2 md:grid-cols-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse border border-rpg-border bg-rpg-bg-2" style={{ borderRadius: 3 }} />
          ))}
        </div>
      )}
      {isError && (
        <p className="text-sm text-rpg-red" role="alert">
          Não foi possível carregar as automações.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </p>
      )}
      <ul className="grid gap-2.5 md:grid-cols-2">
        {list.map((a) => (
          <AutomationCard
            key={a.key}
            automation={a}
            decks={decks}
            busy={(update.isPending && update.variables?.automationKey === a.key) || (run.isPending && run.variables === a.key)}
            result={result[a.key]}
            onToggle={() => update.mutate({ automationKey: a.key, patch: { enabled: !a.enabled } })}
            onConfig={(config) =>
              update.mutate(
                { automationKey: a.key, patch: { config } },
                {
                  onSuccess: () => setResult((s) => ({ ...s, [a.key]: { status: "ok", summary: "Configuração salva." } })),
                  onError: (e) => setResult((s) => ({ ...s, [a.key]: { status: "error", summary: e instanceof Error ? e.message : "Configuração recusada." } })),
                },
              )
            }
            onRun={() =>
              run.mutate(a.key, {
                onSuccess: (r) => setResult((s) => ({ ...s, [a.key]: r })),
                onError: (e) => setResult((s) => ({ ...s, [a.key]: { status: "error", summary: e instanceof Error ? e.message : "Falhou." } })),
              })
            }
          />
        ))}
      </ul>
    </section>
  );
}

function AutomationCard({
  automation: a,
  decks,
  busy,
  result,
  onToggle,
  onConfig,
  onRun,
}: {
  automation: Automation;
  decks: Array<{ id: string; name: string }>;
  busy: boolean;
  result?: { status: string; summary: string };
  onToggle: () => void;
  onConfig: (c: Record<string, unknown>) => void;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const runs = useAutomationRuns(a.module, history ? a.key : null);
  const configKeys = Object.keys(a.config).filter((k) => k in LABELS);
  const status = a.lastStatus ? STATUS_UI[a.lastStatus] : null;
  const runnable = a.trigger === "daily" || a.trigger === "weekly" || a.key === "goal_sync" || a.key === "priority_review" || a.key === "forecast" || a.key === "vault_split" || a.key === "health_goals" || a.trigger === "event";

  return (
    <li className={clsx("border-2 bg-rpg-bg-2/70 p-3", a.enabled ? "border-rpg-gold/50" : "border-rpg-border")} style={{ borderRadius: 4 }}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-rpg-text">
            {a.label}
            {a.usesAi && (
              <span className="inline-flex items-center gap-0.5 border border-rpg-purple/60 bg-rpg-purple/15 px-1 font-pixel text-[9px] uppercase text-rpg-purple" style={{ borderRadius: 2 }}>
                <Sparkles size={9} aria-hidden /> IA
              </span>
            )}
            <span
              className={clsx("border px-1 font-pixel text-[9px] uppercase", a.enabled ? "border-rpg-green/60 text-rpg-green" : "border-rpg-border text-rpg-muted")}
              style={{ borderRadius: 2 }}
            >
              {a.enabled ? "Ativa" : "Desligada"}
            </span>
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-rpg-muted">{a.description}</p>
        </div>
        <RPGSwitch checked={a.enabled} onChange={onToggle} disabled={busy} label={a.enabled ? `Desligar ${a.label}` : `Ligar ${a.label}`} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-rpg-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} aria-hidden /> {a.triggerLabel}
        </span>
        {status && (
          <span className={clsx("inline-flex items-center gap-1", status.cls)} title={a.lastMessage ?? undefined}>
            <status.icon size={11} aria-hidden /> Última: {fmt(a.lastRunAt)}
          </span>
        )}
        {a.enabled && a.nextRunAt && <span>Próxima: {fmt(a.nextRunAt)}</span>}
      </div>
      {(result?.summary || a.lastMessage) && (
        <p className={clsx("mt-1.5 text-[11.5px]", result?.status === "error" ? "text-rpg-red" : "text-rpg-text/85")} role="status">
          {result?.summary ?? a.lastMessage}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {runnable && (
          <button type="button" onClick={onRun} disabled={busy || !a.enabled} className="rpg-btn rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Play size={12} aria-hidden />} Executar agora
          </button>
        )}
        {configKeys.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 px-2.5 py-1 text-xs">
            Configurar <ChevronDown size={12} className={clsx("transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
        <button type="button" onClick={() => setHistory((v) => !v)} aria-expanded={history} className="rpg-btn rpg-btn-ghost inline-flex items-center gap-1 px-2.5 py-1 text-xs">
          <History size={12} aria-hidden /> Histórico
        </button>
      </div>

      {open && (
        <div className="mt-2 grid gap-2 border-t border-rpg-border/60 pt-2 sm:grid-cols-2">
          {configKeys.map((k) => {
            const meta = LABELS[k];
            const v = a.config[k];
            if (k === "deckId") {
              return (
                <label key={k} className="text-[11px] text-rpg-muted sm:col-span-2">
                  {meta.label}
                  <select
                    className="mt-0.5 w-full border border-rpg-border bg-rpg-bg px-2 py-1.5 text-sm text-rpg-text"
                    style={{ borderRadius: 3 }}
                    value={typeof v === "string" ? v : ""}
                    onChange={(e) => onConfig({ deckId: e.target.value || null })}
                  >
                    <option value="">Primeiro baralho ativo</option>
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (typeof v === "boolean") {
              return (
                <label key={k} className="flex items-center gap-2 text-xs text-rpg-text">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--rpg-gold))]" checked={v} onChange={(e) => onConfig({ [k]: e.target.checked })} />
                  {meta.label}
                </label>
              );
            }
            return (
              <label key={k} className="text-[11px] text-rpg-muted">
                {meta.label}
                <span className="mt-0.5 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={meta.min}
                    max={meta.max}
                    defaultValue={Number(v ?? 0)}
                    onBlur={(e) => {
                      const n = Math.min(meta.max ?? 1000, Math.max(meta.min ?? 0, Number(e.target.value)));
                      if (n !== Number(v)) onConfig({ [k]: n });
                    }}
                    className="w-20 border border-rpg-border bg-rpg-bg px-2 py-1 text-sm text-rpg-text"
                    style={{ borderRadius: 3 }}
                  />
                  {meta.suffix && <span>{meta.suffix}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {history && (
        <div className="mt-2 border-t border-rpg-border/60 pt-2">
          {runs.isLoading && <p className="text-xs text-rpg-muted">Carregando…</p>}
          {runs.data && runs.data.length === 0 && <p className="text-xs text-rpg-muted">Ainda não executada.</p>}
          <ul className="space-y-1">
            {(runs.data ?? []).map((r, i) => {
              const s = STATUS_UI[r.status];
              return (
                <li key={i} className="flex gap-2 text-[11px]">
                  <s.icon size={12} className={clsx("mt-0.5 shrink-0", s.cls)} aria-label={s.label} />
                  <span className="text-rpg-muted shrink-0">{fmt(r.startedAt)}</span>
                  <span className="min-w-0 text-rpg-text/85">
                    {r.trigger === "cron" ? "Agendada" : r.trigger === "manual" ? "Manual" : "Evento"} — {r.summary ?? s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
