import { useId, useState, type ButtonHTMLAttributes, type FormEvent } from "react";
import clsx from "clsx";
import { Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import { rpgField } from "@/components/contracts/contractUi";
import { useGuildPartners } from "@/hooks/useGuild";
import { isValidEmail, type GuildEntityType, type GuildOwnerShare } from "@/services/guildService";

type Look = "rpg" | "classic";

const STATUS_LABEL: Record<GuildOwnerShare["status"], string> = {
  pending: "Convite pendente",
  accepted: "Acompanhando",
  declined: "Recusou",
  revoked: "Revogado",
};

/** Botão que respeita o visual de quem hospeda o painel (modal RPG do contrato ou página clássica de Metas). */
function Btn({ look, tone, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { look: Look; tone: "primary" | "secondary" | "ghost" | "danger" }) {
  if (look === "rpg") return <RPGButton variant={tone} {...props} />;
  return <Button variant={tone === "danger" ? "secondary" : tone} {...props} className={clsx(props.className, tone === "danger" && "text-drop")} />;
}

/**
 * "Chamar parceiro": lista quem acompanha o item e um formulário de convite
 * por e-mail. O parceiro só verá um resumo (progresso, prazo, sequência) —
 * isso é dito aqui para o dono decidir com clareza.
 */
export function GuildPartnersPanel({
  entityType,
  entityId,
  look,
  onToast,
  startOpen = false,
}: {
  entityType: GuildEntityType;
  entityId: string;
  look: Look;
  onToast: (msg: string, tone?: "success" | "error") => void;
  startOpen?: boolean;
}) {
  const { data, isLoading, isError, invite, revoke } = useGuildPartners(entityType, entityId);
  const [open, setOpen] = useState(startOpen);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const ids = useId();

  const rpg = look === "rpg";
  const field = rpg ? rpgField : inputClass;
  const muted = rpg ? "text-rpg-muted" : "text-slate";
  const live = (data?.shares ?? []).filter((s) => s.status === "pending" || s.status === "accepted");
  const emailError = touched && !isValidEmail(email) ? "Informe um e-mail válido." : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValidEmail(email)) return;
    try {
      const r = await invite.mutateAsync({ entityType, entityId, email: email.trim(), message: message.trim() || null });
      setEmail("");
      setMessage("");
      setTouched(false);
      setOpen(false);
      onToast(r.emailSent ? "Convite enviado por e-mail. Ele aparece na Guilda do parceiro." : "Convite criado. O parceiro verá na página Guilda ao entrar com esse e-mail.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível enviar o convite.", "error");
    }
  };

  const doRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      setConfirmRevoke(null);
      onToast("Acesso revogado. O parceiro não vê mais este item.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Não foi possível revogar.", "error");
    }
  };

  return (
    <section aria-labelledby={`${ids}-title`} className={clsx("space-y-2", rpg ? "rpg-panel p-3" : "rounded-xl border border-paper-border dark:border-ink-border p-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <p id={`${ids}-title`} className={clsx("flex items-center gap-1.5 text-sm font-semibold", rpg ? "font-rpg text-rpg-text" : "")}>
          <ShieldCheck size={14} aria-hidden className={rpg ? "text-rpg-gold-light" : "text-brand-500"} /> Parceiros da Guilda
        </p>
        {!open && (
          <Btn look={look} tone="secondary" className="ml-auto !py-1 !px-2.5 text-xs" onClick={() => setOpen(true)} aria-expanded={false}>
            <UserPlus size={13} aria-hidden /> Chamar parceiro
          </Btn>
        )}
      </div>

      {isLoading && <p className={clsx("text-xs", muted)}>Carregando parceiros…</p>}
      {isError && <p className="text-xs text-rpg-red" role="alert">Não foi possível carregar os parceiros.</p>}
      {data && live.length === 0 && !open && (
        <p className={clsx("text-xs", muted)}>Ninguém acompanha este item ainda. Um parceiro vê só o progresso, o prazo e a sequência — nunca suas tarefas ou anotações.</p>
      )}

      {live.length > 0 && (
        <ul className="space-y-1">
          {live.map((s) => (
            <li key={s.id} className={clsx("flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm", rpg ? "border border-rpg-border/60 bg-rpg-bg-2/60" : "rounded-lg bg-black/[0.03] dark:bg-white/[0.04]")} style={rpg ? { borderRadius: 3 } : undefined}>
              <span className="min-w-0 flex-1 truncate">{s.partnerName ?? s.inviteeEmail}</span>
              {rpg ? (
                <RPGBadge tone={s.status === "accepted" ? "green" : "orange"}>{STATUS_LABEL[s.status]}</RPGBadge>
              ) : (
                <span className={clsx("text-[11px] font-medium", s.status === "accepted" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{STATUS_LABEL[s.status]}</span>
              )}
              {s.testimonyCount > 0 && <span className={clsx("text-[11px]", muted)}>{s.testimonyCount} testemunho{s.testimonyCount > 1 ? "s" : ""}</span>}
              {confirmRevoke === s.id ? (
                <span className="flex items-center gap-1.5" role="alert">
                  <span className="text-[11px] text-rpg-orange">Revogar acesso?</span>
                  <Btn look={look} tone="danger" className="!py-1 !px-2 text-xs" disabled={revoke.isPending} onClick={() => void doRevoke(s.id)}>Revogar</Btn>
                  <Btn look={look} tone="ghost" className="!py-1 !px-2 text-xs" onClick={() => setConfirmRevoke(null)}>Cancelar</Btn>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmRevoke(s.id)} className={clsx("p-1 rounded focus-visible:outline focus-visible:outline-2", muted)} aria-label={`Revogar acesso de ${s.partnerName ?? s.inviteeEmail}`}>
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-2" noValidate>
          <div>
            <label htmlFor={`${ids}-email`} className={clsx("block text-xs font-medium mb-1", muted)}>E-mail do parceiro (conta do LifeOS)</label>
            <div className="relative">
              <Mail size={14} aria-hidden className={clsx("absolute left-2.5 top-1/2 -translate-y-1/2", muted)} />
              <input
                id={`${ids}-email`}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? `${ids}-email-err` : undefined}
                className={clsx(field, "!pl-8")}
                style={rpg ? { borderRadius: 3 } : undefined}
                placeholder="parceiro@email.com"
                required
              />
            </div>
            {emailError && <p id={`${ids}-email-err`} className="mt-1 text-[11px] text-rpg-red">{emailError}</p>}
          </div>
          <div>
            <label htmlFor={`${ids}-msg`} className={clsx("block text-xs font-medium mb-1", muted)}>Recado (opcional)</label>
            <textarea id={`${ids}-msg`} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 280))} rows={2} maxLength={280} className={field} style={rpg ? { borderRadius: 3 } : undefined} placeholder="Me cobra se eu sumir por 3 dias!" />
          </div>
          <p className={clsx("text-[11px]", muted)}>O parceiro verá só título, progresso, prazo, status e sequência de dias com avanço. Você pode revogar quando quiser.</p>
          <div className="flex flex-wrap gap-2">
            <Btn look={look} tone="primary" type="submit" disabled={invite.isPending}>{invite.isPending ? "Enviando…" : "Enviar convite"}</Btn>
            <Btn look={look} tone="ghost" type="button" onClick={() => { setOpen(false); setTouched(false); }}>Cancelar</Btn>
          </div>
        </form>
      )}
    </section>
  );
}
