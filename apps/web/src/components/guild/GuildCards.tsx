import { useId, useState } from "react";
import { CalendarClock, Flame, HandHeart, Megaphone, ScrollText, Target, Trash2, X } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar, type RpgTone } from "@/components/rpg";
import { DIFFICULTY_TONE, fmtDate, rpgField } from "@/components/contracts/contractUi";
import { DIFFICULTIES } from "@/services/gamificationService";
import { GUILD_ENTITY_LABEL, type GuildCheer, type GuildInvite, type GuildOwnerShare, type GuildSharedWithMe, type GuildSummary } from "@/services/guildService";
import type { Difficulty } from "@/types";

/** Status do item como o dono o vê (contrato e meta usam vocabulários diferentes no banco). */
const ITEM_STATUS: Record<string, { label: string; tone: RpgTone }> = {
  ativo: { label: "Em andamento", tone: "blue" },
  concluido: { label: "Cumprido", tone: "green" },
  arquivado: { label: "Arquivado", tone: "muted" },
  active: { label: "Em andamento", tone: "blue" },
  done: { label: "Concluída", tone: "green" },
  abandoned: { label: "Abandonada", tone: "muted" },
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

function EntityIcon({ type }: { type: GuildSummary["entityType"] }) {
  return type === "contract" ? <ScrollText size={10} aria-hidden /> : <Target size={10} aria-hidden />;
}

// ---------------------------------------------------------------------
// Convite recebido
// ---------------------------------------------------------------------

export function GuildInviteCard({ invite, busy, onRespond }: { invite: GuildInvite; busy: boolean; onRespond: (accept: boolean) => void }) {
  return (
    <li className="rpg-panel rpg-panel-gold p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <RPGBadge tone="gold" icon={<EntityIcon type={invite.entityType} />}>{GUILD_ENTITY_LABEL[invite.entityType]}</RPGBadge>
        <span className="text-[11px] text-rpg-muted">{fmtWhen(invite.createdAt)}</span>
      </div>
      <p className="text-sm text-rpg-text">
        <strong className="text-rpg-gold-light">{invite.ownerName}</strong> chamou você para acompanhar <strong>{invite.entityTitle}</strong>.
      </p>
      {invite.message && <p className="text-xs italic text-rpg-muted break-words">“{invite.message}”</p>}
      <div className="flex flex-wrap gap-2">
        <RPGButton variant="gold" disabled={busy} onClick={() => onRespond(true)}>Aceitar e entrar na guilda</RPGButton>
        <RPGButton variant="ghost" disabled={busy} onClick={() => onRespond(false)}>Recusar</RPGButton>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------
// Compartilhado comigo (o parceiro vê só o resumo)
// ---------------------------------------------------------------------

export function GuildSharedCard({
  item,
  cheerMax,
  busy,
  onCheer,
  onLeave,
}: {
  item: GuildSharedWithMe;
  cheerMax: number;
  busy: boolean;
  onCheer: (kind: "testemunho" | "incentivo", text: string | null) => Promise<void>;
  onLeave: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const ids = useId();
  const s = item.summary;
  const status = s ? ITEM_STATUS[s.status] ?? { label: s.status, tone: "muted" as RpgTone } : null;
  const difficulty = s?.difficulty ? DIFFICULTIES.find((d) => d.id === s.difficulty) : undefined;
  const canCheer = Boolean(s);

  const send = async (kind: "testemunho" | "incentivo") => {
    try {
      await onCheer(kind, text.trim() || null);
      setText("");
    } catch {
      // O aviso de erro já foi mostrado por quem chamou; mantém o texto para tentar de novo.
    }
  };

  return (
    <li className="rpg-panel p-3 space-y-3 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {s && <RPGBadge tone="blue" icon={<EntityIcon type={s.entityType} />}>{GUILD_ENTITY_LABEL[s.entityType]}</RPGBadge>}
        {difficulty && <RPGBadge tone={DIFFICULTY_TONE[difficulty.id as Difficulty]}>{difficulty.label}</RPGBadge>}
        {status && <RPGBadge tone={status.tone}>{status.label}</RPGBadge>}
        <span className="ml-auto text-[11px] text-rpg-muted">de {item.ownerName}</span>
      </div>

      {s ? (
        <>
          <p className="font-rpg text-base font-semibold text-rpg-text break-words">{s.title}</p>
          <RPGProgressBar
            tone={s.progressPct >= 100 ? "green" : "gold"}
            value={s.progressPct}
            label={`Progresso de ${s.title}`}
            valueLabel={s.obligations ? `${s.obligations.done}/${s.obligations.total} · ${s.progressPct}%` : `${s.progressPct}%`}
          />
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-rpg-muted">
              <Flame size={13} aria-hidden className={s.streakDays > 0 ? "text-rpg-orange" : ""} />
              <dt className="sr-only">Sequência</dt>
              <dd>{s.streakDays > 0 ? `${s.streakDays} dia${s.streakDays > 1 ? "s" : ""} seguido${s.streakDays > 1 ? "s" : ""} com avanço` : "Sem sequência ativa"}</dd>
            </div>
            <div className="flex items-center gap-1.5 text-rpg-muted">
              <CalendarClock size={13} aria-hidden />
              <dt className="sr-only">Prazo</dt>
              <dd>{s.dueDate ? `Prazo ${fmtDate(s.dueDate)}` : "Sem prazo"}</dd>
            </div>
          </dl>
          {s.lastAdvanceDay && <p className="text-[11px] text-rpg-muted">Último avanço registrado: {fmtDate(s.lastAdvanceDay)}</p>}
        </>
      ) : (
        <p className="text-sm text-rpg-muted">O dono removeu este item. Não há mais o que acompanhar aqui.</p>
      )}

      {canCheer && (
        <div className="space-y-2 border-t border-rpg-border/60 pt-2">
          <label htmlFor={`${ids}-txt`} className="block text-[11px] text-rpg-muted">Recado curto (opcional, até {cheerMax} caracteres)</label>
          <input
            id={`${ids}-txt`}
            value={text}
            maxLength={cheerMax}
            onChange={(e) => setText(e.target.value.slice(0, cheerMax))}
            className={rpgField}
            style={{ borderRadius: 3 }}
            placeholder="Vi você na corrida hoje, segue firme!"
          />
          <div className="flex flex-wrap gap-2">
            <RPGButton
              variant="gold"
              disabled={busy || item.today.testimonyGiven}
              onClick={() => void send("testemunho")}
              title="Confirma que você viu o avanço de hoje (1 por dia)"
            >
              <HandHeart size={14} aria-hidden /> {item.today.testimonyGiven ? "Testemunho de hoje dado" : "Testemunhar hoje"}
            </RPGButton>
            <RPGButton variant="secondary" disabled={busy || item.today.incentivesLeft === 0} onClick={() => void send("incentivo")}>
              <Megaphone size={14} aria-hidden /> Incentivar{item.today.incentivesLeft < 3 ? ` (${item.today.incentivesLeft} hoje)` : ""}
            </RPGButton>
          </div>
        </div>
      )}

      {item.myCheers.length > 0 && <CheerList cheers={item.myCheers.slice(0, 3)} title="Seus últimos recados" />}

      <div className="flex justify-end">
        {confirmLeave ? (
          <span className="flex flex-wrap items-center gap-2" role="alert">
            <span className="text-xs text-rpg-orange">Deixar de acompanhar?</span>
            <RPGButton variant="danger" disabled={busy} onClick={() => void onLeave()}>Sair</RPGButton>
            <RPGButton variant="ghost" onClick={() => setConfirmLeave(false)}>Cancelar</RPGButton>
          </span>
        ) : (
          <RPGButton variant="ghost" onClick={() => setConfirmLeave(true)}>
            <X size={14} aria-hidden /> Deixar de acompanhar
          </RPGButton>
        )}
      </div>
    </li>
  );
}

function CheerList({ cheers, title }: { cheers: GuildCheer[]; title: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-rpg-muted mb-1">{title}</p>
      <ul className="space-y-1">
        {cheers.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <RPGBadge tone={c.kind === "testemunho" ? "green" : "purple"}>{c.kind === "testemunho" ? "Testemunho" : "Incentivo"}</RPGBadge>
            <span className="min-w-0 flex-1 break-words text-rpg-text">{c.text ?? <span className="text-rpg-muted">sem recado</span>}</span>
            <span className="shrink-0 text-[10px] text-rpg-muted">{fmtDate(c.dayKey)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Que compartilhei (visão do dono, agrupada por item)
// ---------------------------------------------------------------------

const SHARE_STATUS: Record<GuildOwnerShare["status"], { label: string; tone: RpgTone }> = {
  accepted: { label: "Acompanhando", tone: "green" },
  pending: { label: "Pendente", tone: "orange" },
  declined: { label: "Recusou/saiu", tone: "muted" },
  revoked: { label: "Revogado", tone: "muted" },
};

export function GuildOwnedGroup({ title, entityType, shares, onRevoke, busy }: { title: string; entityType: GuildOwnerShare["entityType"]; shares: GuildOwnerShare[]; onRevoke: (id: string) => Promise<void>; busy: boolean }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const live = shares.filter((s) => s.status === "pending" || s.status === "accepted");
  const past = shares.filter((s) => s.status !== "pending" && s.status !== "accepted");
  return (
    <li className="rpg-panel p-3 space-y-2 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <RPGBadge tone="blue" icon={<EntityIcon type={entityType} />}>{GUILD_ENTITY_LABEL[entityType]}</RPGBadge>
        <p className="min-w-0 flex-1 font-rpg font-semibold text-rpg-text break-words">{title}</p>
      </div>
      {live.length === 0 && <p className="text-xs text-rpg-muted">Nenhum parceiro ativo neste item.</p>}
      <ul className="space-y-2">
        {live.map((s) => (
          <li key={s.id} className="border border-rpg-border/60 bg-rpg-bg-2/60 p-2 space-y-2" style={{ borderRadius: 3 }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-rpg-text">{s.partnerName ?? s.inviteeEmail}</span>
              <RPGBadge tone={SHARE_STATUS[s.status].tone}>{SHARE_STATUS[s.status].label}</RPGBadge>
              {s.testimonyCount > 0 && <span className="text-[11px] text-rpg-muted">{s.testimonyCount} testemunho{s.testimonyCount > 1 ? "s" : ""}</span>}
              {confirm === s.id ? (
                <span className="flex flex-wrap items-center gap-1.5" role="alert">
                  <span className="text-[11px] text-rpg-orange">Revogar acesso?</span>
                  <RPGButton variant="danger" disabled={busy} onClick={() => void onRevoke(s.id).then(() => setConfirm(null))}>Revogar</RPGButton>
                  <RPGButton variant="ghost" onClick={() => setConfirm(null)}>Cancelar</RPGButton>
                </span>
              ) : (
                <RPGButton variant="ghost" onClick={() => setConfirm(s.id)} aria-label={`Revogar acesso de ${s.partnerName ?? s.inviteeEmail}`}>
                  <Trash2 size={13} aria-hidden /> <span className="hidden sm:inline">Revogar</span>
                </RPGButton>
              )}
            </div>
            {s.cheers.length > 0 && <CheerList cheers={s.cheers.slice(0, 5)} title="Recebidos" />}
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <p className="text-[11px] text-rpg-muted">
          Histórico: {past.map((s) => `${s.partnerName ?? s.inviteeEmail} (${SHARE_STATUS[s.status].label.toLowerCase()})`).join(", ")}
        </p>
      )}
    </li>
  );
}
