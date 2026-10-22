import { CalendarClock, Clock, Copy, ListChecks, Pencil, Play, Star, Trash2, Zap } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { Protocol, ProtocolRun } from "@/services/protocolsService";
import { CATEGORY_TONE, MODE_UI, ago, formatMinutes, protocolArtUrl, stepDisplayTitle } from "@/utils/protocolDisplay";

/** Resumo do protocolo selecionado (lateral no desktop, folha no celular). */
export function ProtocolDetail({
  protocol: p,
  categoryLabel,
  onExecute,
  onEdit,
  onClone,
  onFavorite,
  onDelete,
  busy,
}: {
  protocol: Protocol;
  categoryLabel: string;
  onExecute: () => void;
  onEdit: () => void;
  onClone: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      <img src={protocolArtUrl(p.art)} alt="" className="pixelated w-full aspect-[16/9] object-cover border border-rpg-border bg-rpg-bg-2" style={{ borderRadius: 3 }} />
      <div className="flex flex-wrap items-center gap-1.5">
        <RPGBadge tone={CATEGORY_TONE[p.category] ?? "muted"}>{categoryLabel}</RPGBadge>
        <RPGBadge tone={p.kind === "template" ? "blue" : "green"}>{p.kind === "template" ? "Modelo pronto" : "Meu protocolo"}</RPGBadge>
        {p.triggered && (
          <RPGBadge tone="orange" icon={<Zap size={10} aria-hidden />}>
            Indicado para hoje
          </RPGBadge>
        )}
      </div>
      <h3 className="font-rpg text-xl font-bold leading-tight text-rpg-text">{p.name}</h3>
      {p.description && <p className="text-sm text-rpg-text/85">{p.description}</p>}
      <dl className="grid gap-1.5 text-xs">
        <div className="flex items-start gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1 font-semibold text-rpg-gold-light">
            <CalendarClock size={13} aria-hidden /> Quando usar:
          </dt>
          <dd className="text-rpg-text/85">
            {p.triggerDescription || "quando você quiser"}
            {p.triggerReason && <span className="block text-rpg-orange mt-0.5">Indicado hoje porque: {p.triggerReason}</span>}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1 font-semibold text-rpg-gold-light">
            <ListChecks size={13} aria-hidden /> Passos:
          </dt>
          <dd className="text-rpg-text/85">
            {p.steps.length} · duração total de {formatMinutes(p.totalMinutes)}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1 font-semibold text-rpg-gold-light">
            <Clock size={13} aria-hidden /> Seu uso:
          </dt>
          <dd className="text-rpg-text/85">
            {p.uses === 0 ? "ainda não usado" : `${p.uses} ${p.uses === 1 ? "vez" : "vezes"} (${p.completedRuns} até o fim) · último: ${ago(p.lastRunAt).toLowerCase()}`}
          </dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <RPGButton variant="gold" className="col-span-2 justify-center" onClick={onExecute}>
          <Play size={14} aria-hidden /> Usar agora
        </RPGButton>
        {p.kind === "template" ? (
          <RPGButton variant="secondary" className="justify-center" onClick={onClone} disabled={busy} aria-label="Adicionar uma cópia aos meus protocolos para personalizar">
            <Copy size={14} aria-hidden /> Copiar
          </RPGButton>
        ) : (
          <RPGButton variant="secondary" className="justify-center" onClick={onEdit}>
            <Pencil size={14} aria-hidden /> Editar
          </RPGButton>
        )}
        <RPGButton variant="ghost" className="justify-center" onClick={onFavorite} aria-pressed={p.favorite}>
          <Star size={14} fill={p.favorite ? "currentColor" : "none"} aria-hidden /> {p.favorite ? "Favorito" : "Favoritar"}
        </RPGButton>
        {p.kind === "mine" && (
          <RPGButton variant="danger" className="col-span-2 justify-center" onClick={onDelete} disabled={busy}>
            <Trash2 size={14} aria-hidden /> Excluir protocolo
          </RPGButton>
        )}
      </div>
      {p.kind === "template" && <p className="text-[11px] text-rpg-muted">Modelos prontos não mudam. Para trocar passos, horários ou o nome, copie para “Meus protocolos” e edite a sua versão.</p>}
    </div>
  );
}

/** Passo a passo numerado, com quem faz cada passo e o tempo de cada um. */
export function ProtocolActionList({ protocol }: { protocol: Protocol }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {protocol.steps.map((s, i) => {
          const mode = MODE_UI[s.mode];
          return (
            <li key={s.ref} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center border border-rpg-gold/70 font-pixel text-[10px] text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-rpg-text">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {stepDisplayTitle(s)}
                  {s.optional && <span className="text-[11px] text-rpg-muted"> (opcional)</span>}
                </p>
                {s.description && <p className="text-[11px] text-rpg-text/70">{s.description}</p>}
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-rpg-muted">
                  <span title={mode.hint}>
                    <RPGBadge tone={mode.tone}>{mode.label}</RPGBadge>
                  </span>
                  {s.minutes > 0 && <span>{s.minutes} min</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-rpg-border/50 pt-2 text-xs text-rpg-text/85">
        Duração total: <strong className="text-rpg-gold-light">{formatMinutes(protocol.totalMinutes)}</strong>
      </p>
      <ul className="space-y-0.5 text-[11px] text-rpg-muted" aria-label="O que cada etiqueta significa">
        {(Object.keys(MODE_UI) as Array<keyof typeof MODE_UI>).map((m) => (
          <li key={m}>
            <RPGBadge tone={MODE_UI[m].tone}>{MODE_UI[m].label}</RPGBadge> {MODE_UI[m].hint}
          </li>
        ))}
      </ul>
    </div>
  );
}

const RUN_STATUS: Record<ProtocolRun["status"], { label: string; tone: "green" | "orange" | "blue" | "muted" }> = {
  completed: { label: "Concluído", tone: "green" },
  partial: { label: "Parcial", tone: "orange" },
  started: { label: "Em andamento", tone: "blue" },
  canceled: { label: "Cancelado", tone: "muted" },
};

/** Execuções recentes: passos manuais pendentes podem ser marcados depois. */
export function ProtocolRunsList({
  runs,
  onStep,
  onCancel,
  busy,
}: {
  runs: ProtocolRun[];
  onStep: (runId: string, stepRef: string, status: "completed" | "skipped") => void;
  onCancel: (runId: string) => void;
  busy: boolean;
}) {
  if (runs.length === 0) return <p className="text-sm text-rpg-muted">Você ainda não usou nenhum protocolo. Quando usar, os passos que dependem de você ficam aqui para marcar como feitos.</p>;
  return (
    <ul className="space-y-3">
      {runs.slice(0, 5).map((r) => {
        const pending = r.steps.filter((s) => s.status === "pending");
        const st = RUN_STATUS[r.status];
        return (
          <li key={r.id} className="border border-rpg-border/60 bg-rpg-bg-2/50 p-2.5 text-sm" style={{ borderRadius: 3 }}>
            <p className="flex items-center gap-2">
              <span className="font-semibold text-rpg-text truncate">{r.protocolName}</span>
              <RPGBadge tone={st.tone} className="ml-auto shrink-0">
                {st.label}
              </RPGBadge>
            </p>
            <p className="text-[11px] text-rpg-muted">{ago(r.startedAt)}</p>
            {pending.length > 0 && r.status !== "canceled" && (
              <ul className="mt-2 space-y-1.5">
                {pending.map((s) => (
                  <li key={s.ref} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 text-rpg-text">{stepDisplayTitle(s)}</span>
                    <button type="button" className="text-rpg-green hover:underline disabled:opacity-50" disabled={busy} onClick={() => onStep(r.id, s.ref, "completed")}>
                      Feito
                    </button>
                    <button type="button" className="text-rpg-muted hover:underline disabled:opacity-50" disabled={busy} onClick={() => onStep(r.id, s.ref, "skipped")}>
                      Pular
                    </button>
                  </li>
                ))}
                {r.status === "started" && (
                <li>
                  <button type="button" className="text-[11px] text-rpg-red hover:underline disabled:opacity-50" disabled={busy} onClick={() => onCancel(r.id)}>
                    Encerrar execução (não desfaz o que já foi feito)
                  </button>
                </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
