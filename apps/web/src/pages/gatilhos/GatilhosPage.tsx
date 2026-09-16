import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Mail,
  Mails,
  Play,
  Smartphone,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useNotificationTriggers } from "@/hooks/useNotifications";
import { Button, Card, IconBadge, PageHeader } from "@/components/ui/primitives";
import type { NotificationAlertLevel, NotificationTriggerEvent, NotificationTriggerRule } from "@/types";

const EVENT_ICON: Record<NotificationTriggerEvent, typeof BellRing> = {
  task_overdue: AlertTriangle,
  task_due_today: Clock3,
  achievement_unlocked: Trophy,
  weekly_summary: Mails,
  daily_insight: Sparkles,
};

const EVENT_TONE: Record<NotificationTriggerEvent, "blue" | "purple" | "green" | "pink" | "teal" | "amber"> = {
  task_overdue: "amber",
  task_due_today: "blue",
  achievement_unlocked: "purple",
  weekly_summary: "teal",
  daily_insight: "pink",
};

const ALERT_LABEL: Record<NotificationAlertLevel, string> = {
  soft: "Suave",
  medium: "Alerta",
  critical: "Crítico",
};

export function GatilhosPage() {
  const { triggers, isLoading, updateTrigger, isUpdating, runTriggers, isRunning } = useNotificationTriggers();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const activeCount = triggers.filter((trigger) => trigger.active).length;
  const emailCount = triggers.filter((trigger) => trigger.active && trigger.channelEmail).length;
  const pushCount = triggers.filter((trigger) => trigger.active && trigger.channelPush).length;

  async function patch(trigger: NotificationTriggerRule, patchData: Partial<NotificationTriggerRule>) {
    setMessage(null);
    try {
      await updateTrigger({ eventType: trigger.eventType, patch: patchData });
      setMessage({ ok: true, text: "Gatilho atualizado." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Não foi possível atualizar o gatilho." });
    }
  }

  async function runNow() {
    setMessage(null);
    try {
      const result = await runTriggers();
      const total = result.results.reduce((sum, item) => sum + item.count, 0);
      setMessage({
        ok: true,
        text: total > 0 ? `Checagem feita: ${total} tarefa(s) acionaram gatilhos.` : "Checagem feita: nenhuma tarefa vencida ou vencendo hoje.",
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Não foi possível testar os gatilhos." });
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        icon={<BellRing size={21} />}
        title="Gatilhos"
        subtitle="Escolha quando o LifeOS deve chamar sua atenção por e-mail, push ou alerta no app."
        actions={
          <Button variant="secondary" onClick={runNow} disabled={isRunning}>
            <Play size={14} /> {isRunning ? "Checando..." : "Testar tarefas agora"}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile icon={<Zap size={16} />} label="Gatilhos ativos" value={`${activeCount}/${triggers.length || 5}`} tone="purple" />
        <SummaryTile icon={<Mail size={16} />} label="Com e-mail" value={`${emailCount}`} tone="teal" />
        <SummaryTile icon={<Smartphone size={16} />} label="Com push" value={`${pushCount}`} tone="blue" />
      </div>

      {message && (
        <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${message.ok ? "border-growth/20 bg-growth/5 text-growth" : "border-drop/20 bg-drop/10 text-drop"}`}>
          {message.text}
        </div>
      )}

      <Card className="mb-4 overflow-hidden border-0 bg-gradient-to-br from-[#251f44] via-[#33406f] to-[#0d9488] p-5 text-white shadow-card">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Central de alertas</p>
            <p className="mt-2 font-display text-2xl font-bold leading-tight">Quando algo importante acontecer, o LifeOS fala do jeito certo.</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/82">
              Use e-mail para registros importantes, push para avisos rápidos e alerta no app para deixar o sino mais incisivo.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-white/10 p-3">
            <MiniSignal icon={<Mail size={15} />} label="E-mail" />
            <MiniSignal icon={<Smartphone size={15} />} label="Push" />
            <MiniSignal icon={<BellRing size={15} />} label="App" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-paper-border/60 dark:bg-ink-border/40" />)
          : triggers.map((trigger) => <TriggerCard key={trigger.id} trigger={trigger} disabled={isUpdating} onPatch={(patchData) => patch(trigger, patchData)} />)}
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Antes de usar push e e-mail</p>
            <p className="text-xs text-slate">Ative notificações no seu dispositivo e confira o SMTP nas configurações administrativas.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/perfil" className="rounded-xl border border-paper-border px-3 py-2 text-xs font-semibold dark:border-ink-border">
              Perfil
            </Link>
            <Link to="/configuracoes" className="rounded-xl border border-paper-border px-3 py-2 text-xs font-semibold dark:border-ink-border">
              SMTP
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TriggerCard({
  trigger,
  disabled,
  onPatch,
}: {
  trigger: NotificationTriggerRule;
  disabled: boolean;
  onPatch: (patch: Partial<NotificationTriggerRule>) => void;
}) {
  const Icon = EVENT_ICON[trigger.eventType];
  return (
    <Card className={`p-5 transition-all ${trigger.active ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBadge tone={EVENT_TONE[trigger.eventType]} size={40} icon={<Icon size={17} />} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{trigger.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate">{trigger.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ active: !trigger.active })}
          disabled={disabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            trigger.active ? "bg-growth" : "bg-paper-border dark:bg-ink-border"
          }`}
          title={trigger.active ? "Desativar gatilho" : "Ativar gatilho"}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${trigger.active ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ChannelButton icon={<Mail size={14} />} label="E-mail" active={trigger.channelEmail} disabled={disabled} onClick={() => onPatch({ channelEmail: !trigger.channelEmail })} />
        <ChannelButton icon={<Smartphone size={14} />} label="Push" active={trigger.channelPush} disabled={disabled} onClick={() => onPatch({ channelPush: !trigger.channelPush })} />
        <ChannelButton icon={<BellRing size={14} />} label="App" active={trigger.channelInApp} disabled={disabled} onClick={() => onPatch({ channelInApp: !trigger.channelInApp })} />
      </div>

      <div className="mt-4 rounded-2xl bg-paper p-2 dark:bg-ink">
        <p className="px-2 pb-2 text-[11px] font-semibold text-slate">Intensidade do alerta</p>
        <div className="grid grid-cols-3 gap-1">
          {(["soft", "medium", "critical"] as NotificationAlertLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ alertLevel: level })}
              className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                trigger.alertLevel === level
                  ? level === "critical"
                    ? "bg-drop text-white"
                    : level === "medium"
                      ? "bg-signal text-white"
                      : "bg-brand-500 text-white"
                  : "text-slate hover:bg-paper-raised dark:hover:bg-ink-raised"
              }`}
            >
              {ALERT_LABEL[level]}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ChannelButton({ icon, label, active, disabled, onClick }: { icon: React.ReactNode; label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-semibold transition-all disabled:opacity-50 ${
        active
          ? "border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-200"
          : "border-paper-border text-slate hover:bg-paper dark:border-ink-border dark:hover:bg-ink-overlay"
      }`}
    >
      {active ? <CheckCircle2 size={15} /> : icon}
      {label}
    </button>
  );
}

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "purple" | "teal" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <IconBadge tone={tone} size={36} icon={icon} />
        <div>
          <p className="text-xs text-slate">{label}</p>
          <p className="font-display text-xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function MiniSignal({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/12 p-3 text-center">
      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/18">{icon}</span>
      <p className="mt-1 text-[11px] font-semibold">{label}</p>
    </div>
  );
}
