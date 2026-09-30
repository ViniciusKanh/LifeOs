import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Copy,
  FileCheck2,
  HardDrive,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  ShieldOff,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { Button, IconBadge } from "@/components/ui/primitives";
import { useAdminUserOverview } from "@/hooks/useAdmin";
import type { AdminUser } from "@/types";

/**
 * Painel lateral do admin para uma conta: status de segurança, o que a
 * pessoa usa no LifeOS (apenas CONTAGENS por módulo — o conteúdo dos
 * registros nunca é exposto, conforme a Política de Privacidade) e ações
 * administrativas. Toda ação destrutiva pede confirmação explícita e é
 * revalidada/auditada no backend.
 */

type ActionKey = "mfa" | "reset" | "temp" | "revoke" | "delete";

interface Actions {
  resetMfa: (id: string) => Promise<unknown>;
  sendPasswordReset: (id: string) => Promise<unknown>;
  tempPassword: (id: string) => Promise<{ tempPassword: string }>;
  revokeSessions: (id: string) => Promise<unknown>;
  removeUser: (id: string) => Promise<unknown>;
}

const AUDIT_LABELS: Record<string, string> = {
  "admin_users.create": "Conta criada pelo admin",
  "admin_users.update_role": "Perfil de acesso alterado",
  "admin_users.mfa_reset": "Verificação em duas etapas removida",
  "admin_users.password_reset_email": "E-mail de redefinição enviado",
  "admin_users.temp_password": "Senha provisória gerada",
  "admin_users.revoke_sessions": "Sessões encerradas",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok ? "bg-cat-green/10 text-cat-green" : "bg-slate/10 text-slate"
      )}
    >
      {ok ? <Check size={11} /> : <X size={11} />} {label}
    </span>
  );
}

const ACTION_COPY: Record<ActionKey, { title: string; confirm: string; danger?: boolean }> = {
  mfa: {
    title: "Remover verificação em duas etapas",
    confirm: "A pessoa poderá entrar só com a senha e todas as sessões dela serão encerradas. Use quando ela perdeu o celular e os códigos de recuperação.",
  },
  reset: { title: "Enviar e-mail de redefinição de senha", confirm: "Um link válido por tempo limitado será enviado para o e-mail da conta." },
  temp: {
    title: "Gerar senha provisória",
    confirm: "A senha atual deixa de funcionar e todas as sessões são encerradas. A nova senha aparece uma única vez — repasse por um canal seguro.",
  },
  revoke: { title: "Encerrar todas as sessões", confirm: "A pessoa será desconectada de todos os dispositivos e precisará entrar de novo." },
  delete: {
    title: "Excluir conta",
    confirm: "Todos os dados desta conta (tarefas, hábitos, saúde, diário, mídias…) serão apagados permanentemente. Não é possível desfazer.",
    danger: true,
  },
};

export function UserDetailDrawer({
  user,
  isSelf,
  actions,
  onClose,
}: {
  user: AdminUser;
  isSelf: boolean;
  actions: Actions;
  onClose: () => void;
}) {
  const { overview, isLoading, isError } = useAdminUserOverview(user.id);
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const info = overview?.user ?? user;
  const termsOk = Boolean(info.terms_version) && info.terms_version === overview?.termsCurrentVersion;

  const run = async (key: ActionKey) => {
    setRunning(true);
    setFeedback(null);
    try {
      if (key === "mfa") await actions.resetMfa(user.id);
      if (key === "reset") await actions.sendPasswordReset(user.id);
      if (key === "revoke") await actions.revokeSessions(user.id);
      if (key === "temp") setTempPwd((await actions.tempPassword(user.id)).tempPassword);
      if (key === "delete") {
        await actions.removeUser(user.id);
        onClose();
        return;
      }
      const done: Record<Exclude<ActionKey, "delete">, string> = {
        mfa: "Verificação em duas etapas removida.",
        reset: "E-mail de redefinição enviado.",
        temp: "Senha provisória gerada.",
        revoke: "Sessões encerradas.",
      };
      setFeedback({ tone: "ok", text: done[key] });
      setPending(null);
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível concluir a ação." });
    } finally {
      setRunning(false);
    }
  };

  const actionButtons: Array<{ key: ActionKey; icon: React.ReactNode; label: string; hidden?: boolean }> = [
    { key: "mfa", icon: <ShieldOff size={15} />, label: "Remover MFA", hidden: Number(info.mfa_enabled) !== 1 },
    { key: "reset", icon: <Mail size={15} />, label: "Enviar redefinição de senha" },
    { key: "temp", icon: <KeyRound size={15} />, label: "Gerar senha provisória" },
    { key: "revoke", icon: <LogOut size={15} />, label: "Encerrar sessões" },
    { key: "delete", icon: <Trash2 size={15} />, label: "Excluir conta" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="user-drawer-title">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="relative h-full w-full sm:max-w-md bg-paper-raised dark:bg-ink-raised border-l border-paper-border dark:border-ink-border overflow-y-auto"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-paper-raised/95 dark:bg-ink-raised/95 backdrop-blur border-b border-paper-border dark:border-ink-border">
          <span className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-paper-border dark:bg-ink-border shrink-0">
            {info.avatar_url ? <img src={info.avatar_url} alt="" className="w-full h-full object-cover" /> : <UserIcon size={16} className="text-slate" />}
          </span>
          <div className="min-w-0 flex-1">
            <p id="user-drawer-title" className="font-semibold truncate">
              {info.name}
              {isSelf && <span className="text-slate font-normal"> (você)</span>}
            </p>
            <p className="text-xs text-slate truncate">{info.email}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-slate hover:bg-black/5 dark:hover:bg-white/5" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-6">
          {/* Status da conta */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate mb-2.5">Conta e segurança</h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <StatusPill ok={info.role === "admin"} label={info.role === "admin" ? "Administrador" : "Usuário"} />
              <StatusPill ok={Number(info.email_verified) === 1} label="E-mail verificado" />
              <StatusPill ok={Number(info.mfa_enabled) === 1} label="MFA" />
              <StatusPill ok={Number(info.google_linked) === 1} label="Google" />
              <StatusPill ok={Number(info.password_set) === 1} label="Senha definida" />
              <StatusPill ok={termsOk} label="Termos aceitos" />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-slate">Cadastro</dt>
              <dd>{formatDateTime(info.created_at)}</dd>
              <dt className="text-slate">Último login</dt>
              <dd>{formatDateTime(info.last_login_at)}</dd>
              <dt className="text-slate">Última atividade</dt>
              <dd>{formatDateTime(info.last_seen_at)}</dd>
              {overview && Number(info.mfa_enabled) === 1 && (
                <>
                  <dt className="text-slate">Códigos de recuperação</dt>
                  <dd>{overview.recoveryCodesRemaining} restantes</dd>
                </>
              )}
              <dt className="text-slate">Termos</dt>
              <dd>{info.terms_version ? `v${info.terms_version}${termsOk ? "" : " (desatualizado)"}` : "Não aceitos"}</dd>
            </dl>
          </section>

          {/* Uso do app */}
          <section>
            <div className="flex items-end justify-between mb-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate">Uso do LifeOS</h3>
              {overview && (
                <span className="text-[11px] text-slate inline-flex items-center gap-1">
                  <HardDrive size={11} /> {formatBytes(overview.mediaBytes)} em mídias
                </span>
              )}
            </div>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-paper-border/60 dark:bg-ink-border/60 animate-pulse" />
                ))}
              </div>
            ) : isError || !overview ? (
              <p className="text-xs text-drop">Não foi possível carregar os dados de uso.</p>
            ) : overview.totalRecords === 0 ? (
              <p className="text-xs text-slate rounded-xl border border-dashed border-paper-border dark:border-ink-border p-4 text-center">
                Esta conta ainda não registrou nada no app.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {overview.usage
                    .filter((m) => m.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map((m) => {
                      const pct = Math.max(4, Math.round((m.count / overview.totalRecords) * 100));
                      return (
                        <div key={m.key} className="rounded-xl border border-paper-border dark:border-ink-border p-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-slate truncate">{m.label}</span>
                            <span className="font-display font-bold text-sm">{m.count.toLocaleString("pt-BR")}</span>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-paper-border dark:bg-ink-border overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-cat-purple to-cat-blue" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <p className="text-[11px] text-slate mt-2">
                  {overview.totalRecords.toLocaleString("pt-BR")} registros no total. Apenas contagens são exibidas — o conteúdo é privado.
                </p>
              </>
            )}
          </section>

          {/* Ações administrativas */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate mb-2.5">Ações administrativas</h3>
            {isSelf ? (
              <p className="text-xs text-slate rounded-xl bg-paper dark:bg-ink p-3">
                Para a sua própria conta, use as opções de segurança em <strong>Perfil</strong>.
              </p>
            ) : (
              <div className="space-y-2">
                {actionButtons
                  .filter((a) => !a.hidden)
                  .map((a) => {
                    const copy = ACTION_COPY[a.key];
                    const open = pending === a.key;
                    return (
                      <div
                        key={a.key}
                        className={clsx(
                          "rounded-xl border transition-colors",
                          open
                            ? copy.danger
                              ? "border-drop/50 bg-drop/5"
                              : "border-brand-500/40 bg-brand-500/5"
                            : "border-paper-border dark:border-ink-border"
                        )}
                      >
                        <button
                          onClick={() => {
                            setPending(open ? null : a.key);
                            setFeedback(null);
                            setDeleteConfirm("");
                          }}
                          aria-expanded={open}
                          className={clsx(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-left rounded-xl",
                            copy.danger ? "text-drop" : ""
                          )}
                        >
                          {a.icon} {a.label}
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 space-y-2.5">
                                <p className="text-xs text-slate flex gap-1.5">
                                  {copy.danger && <AlertTriangle size={13} className="text-drop shrink-0 mt-0.5" />}
                                  {copy.confirm}
                                </p>
                                {a.key === "delete" && (
                                  <label className="block text-xs">
                                    Digite <strong>{info.email}</strong> para confirmar
                                    <input
                                      value={deleteConfirm}
                                      onChange={(e) => setDeleteConfirm(e.target.value)}
                                      autoComplete="off"
                                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm bg-transparent border border-paper-border dark:border-ink-border outline-none focus:border-drop"
                                    />
                                  </label>
                                )}
                                <div className="flex gap-2 justify-end">
                                  <Button variant="ghost" onClick={() => setPending(null)} disabled={running}>
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={() => run(a.key)}
                                    disabled={running || (a.key === "delete" && deleteConfirm.trim().toLowerCase() !== info.email.toLowerCase())}
                                    className={copy.danger ? "!bg-none !bg-drop !shadow-none" : ""}
                                  >
                                    {running && <Loader2 size={14} className="animate-spin" />} Confirmar
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            )}

            {feedback && (
              <p role="status" className={clsx("mt-3 text-xs rounded-lg px-3 py-2", feedback.tone === "ok" ? "bg-cat-green/10 text-cat-green" : "bg-drop/10 text-drop")}>
                {feedback.text}
              </p>
            )}

            {tempPwd && (
              <div className="mt-3 rounded-xl border border-signal/40 bg-signal/10 p-3">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <KeyRound size={13} /> Senha provisória (mostrada só agora)
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-paper-raised dark:bg-ink px-3 py-2 text-sm font-semibold tracking-wider select-all">{tempPwd}</code>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(tempPwd);
                      setCopied(true);
                    }}
                    aria-label="Copiar senha provisória"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
                <p className="text-[11px] text-slate mt-2">Oriente a pessoa a trocá-la em Perfil logo após entrar.</p>
              </div>
            )}
          </section>

          {/* Auditoria */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate mb-2.5">Histórico administrativo</h3>
            {!overview || overview.audit.length === 0 ? (
              <p className="text-xs text-slate">Nenhuma ação administrativa registrada para esta conta.</p>
            ) : (
              <ol className="space-y-2">
                {overview.audit.map((a, i) => (
                  <li key={`${a.created_at}-${i}`} className="flex gap-2.5 text-xs">
                    <IconBadge
                      tone={a.action.includes("mfa") ? "purple" : a.action.includes("password") ? "amber" : "blue"}
                      icon={a.action.includes("mfa") ? <ShieldCheck size={12} /> : <FileCheck2 size={12} />}
                      size={24}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{AUDIT_LABELS[a.action] ?? a.action}</p>
                      <p className="text-slate">
                        {formatDateTime(a.created_at)}
                        {a.actor_name && ` · por ${a.actor_name}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </motion.aside>
    </div>
  );
}
