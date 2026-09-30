import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, KeyRound, Loader2, LogOut, ShieldCheck, ShieldOff, Smartphone, X } from "lucide-react";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { MfaCodeVerifier } from "@/components/auth/MfaCodeVerifier";
import { authService } from "@/services/authService";
import type { CurrentUser, MfaSetup } from "@/types";

/**
 * Verificação em duas etapas (app autenticador) no Perfil:
 * ativar (QR → confirmar código → guardar códigos de recuperação),
 * gerar novos códigos, desativar (senha + código) e sair de todos os
 * dispositivos.
 */

type Modal = null | "enable" | "disable" | "codes";

function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `LifeOS — códigos de recuperação da verificação em duas etapas\nCada código funciona UMA vez.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lifeos-codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <p className="text-sm font-semibold">Guarde seus códigos de recuperação</p>
      <p className="text-xs text-slate mt-1">Se você perder o celular, use um destes códigos para entrar. Cada um funciona uma vez e eles não serão mostrados de novo.</p>
      <div className="grid grid-cols-2 gap-2 my-4">
        {codes.map((c) => (
          <code key={c} className="rounded-lg bg-paper dark:bg-ink border border-paper-border dark:border-ink-border px-3 py-2 text-center text-sm font-semibold tracking-wider">
            {c}
          </code>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          <Copy size={14} /> {copied ? "Copiado!" : "Copiar"}
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download size={14} /> Baixar .txt
        </Button>
        <Button className="ml-auto" onClick={onDone}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

function EnableFlow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      setSetup(await authService.mfaSetup());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar.");
    } finally {
      setLoading(false);
    }
  };

  if (codes) {
    return (
      <RecoveryCodesView
        codes={codes}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
          queryClient.invalidateQueries({ queryKey: ["auth", "mfa-status"] });
          onClose();
        }}
      />
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#1e88ff]/10 text-[#1e88ff] text-xs font-bold flex items-center justify-center shrink-0">1</span>Instale um app autenticador: Microsoft Authenticator, Google Authenticator, Authy ou 1Password.</li>
          <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#1e88ff]/10 text-[#1e88ff] text-xs font-bold flex items-center justify-center shrink-0">2</span>Leia o QR code que vamos mostrar.</li>
          <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#1e88ff]/10 text-[#1e88ff] text-xs font-bold flex items-center justify-center shrink-0">3</span>Digite o código de 6 dígitos e guarde os códigos de recuperação.</li>
        </ol>
        {error && <p className="text-xs text-drop">{error}</p>}
        <Button onClick={start} disabled={loading} className="w-full">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />} Mostrar QR code
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <img src={setup.qrDataUrl} alt="QR code para o app autenticador" className="w-44 h-44 rounded-2xl border border-paper-border dark:border-ink-border bg-white p-2 shrink-0" />
        <div className="text-sm space-y-2 min-w-0">
          <p>Abra o app autenticador, toque em <strong>adicionar conta</strong> e leia o QR code.</p>
          <p className="text-xs text-slate">Não consegue ler? Digite esta chave manualmente:</p>
          <code className="block break-all rounded-lg bg-paper dark:bg-ink border border-paper-border dark:border-ink-border px-3 py-2 text-xs font-semibold tracking-wider">{setup.secret}</code>
        </div>
      </div>
      <div className="rounded-2xl border border-paper-border dark:border-ink-border p-3">
        <p className="text-center text-sm font-semibold">Digite o código que aparece no app</p>
        <MfaCodeVerifier
          allowRecovery={false}
          successLabel="Ativado"
          onVerify={async (code) => {
            const res = await authService.mfaEnable(code);
            // Mostra os códigos depois da animação de sucesso.
            setTimeout(() => setCodes(res.recoveryCodes), 1300);
          }}
        />
      </div>
    </div>
  );
}

function DisableFlow({ user, onClose }: { user: CurrentUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">Sem a verificação em duas etapas, sua conta fica protegida só pela senha. Confirme para desativar.</p>
      {user.has_password && <Field label="Sua senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      <div className="rounded-2xl border border-paper-border dark:border-ink-border p-3">
        <p className="text-center text-sm font-semibold">Código do app (ou de recuperação)</p>
        <MfaCodeVerifier
          autoFocus={!user.has_password}
          successLabel="Desativado"
          onVerify={async (code) => {
            if (user.has_password && !password) throw new Error("Digite sua senha antes do código.");
            await authService.mfaDisable(code, password || undefined);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
            queryClient.invalidateQueries({ queryKey: ["auth", "mfa-status"] });
            onClose();
          }}
        />
      </div>
    </div>
  );
}

function RegenerateFlow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) {
    return (
      <RecoveryCodesView
        codes={codes}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["auth", "mfa-status"] });
          onClose();
        }}
      />
    );
  }
  return (
    <div>
      <p className="text-sm text-slate mb-2">Os códigos antigos deixarão de funcionar. Confirme com o código do app:</p>
      <MfaCodeVerifier
        allowRecovery={false}
        successLabel="Confirmado"
        onVerify={async (code) => {
          const res = await authService.mfaRegenerateCodes(code);
          setTimeout(() => setCodes(res.recoveryCodes), 1300);
        }}
      />
    </div>
  );
}

export function MfaSettingsCard({ user }: { user: CurrentUser }) {
  const [modal, setModal] = useState<Modal>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const status = useQuery({ queryKey: ["auth", "mfa-status"], queryFn: authService.mfaStatus });
  const enabled = user.mfa_enabled;

  const logoutAll = async () => {
    setLoggingOut(true);
    try {
      await authService.logoutAll();
    } finally {
      window.location.href = "/login";
    }
  };

  const titles: Record<Exclude<Modal, null>, string> = {
    enable: "Ativar verificação em duas etapas",
    disable: "Desativar verificação em duas etapas",
    codes: "Novos códigos de recuperação",
  };

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <IconBadge tone={enabled ? "green" : "amber"} size={32} icon={enabled ? <ShieldCheck size={15} /> : <ShieldOff size={15} />} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Verificação em duas etapas</p>
          <p className="text-xs text-slate">Um código do app autenticador a cada login.</p>
        </div>
        <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${enabled ? "bg-growth/10 text-growth" : "bg-signal/15 text-signal-deep"}`}>
          {enabled ? "Ativa" : "Desativada"}
        </span>
      </div>

      {enabled ? (
        <div className="space-y-2">
          <p className="text-xs text-slate">
            {status.data ? `${status.data.recoveryCodesRemaining} código(s) de recuperação disponível(is).` : "Carregando..."}
            {status.data?.recoveryCodesRemaining === 0 && " Gere novos códigos agora."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setModal("codes")}>
              <KeyRound size={14} /> Novos códigos
            </Button>
            <Button variant="secondary" onClick={() => setModal("disable")} className="!text-drop">
              <ShieldOff size={14} /> Desativar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate mb-3">Mesmo que alguém descubra sua senha, não entra sem o código do seu celular. Recomendado.</p>
          <Button onClick={() => setModal("enable")} className="w-full">
            <Smartphone size={15} /> Ativar com app autenticador
          </Button>
        </>
      )}

      <div className="mt-4 pt-4 border-t border-paper-border dark:border-ink-border flex items-center justify-between gap-3">
        <p className="text-xs text-slate">Esqueceu a conta aberta em outro aparelho?</p>
        <button onClick={logoutAll} disabled={loggingOut} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-100 hover:underline disabled:opacity-50 shrink-0">
          <LogOut size={13} /> Sair de todos os dispositivos
        </button>
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModal(null)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={titles[modal]}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border p-5 sm:p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-bold text-lg">{titles[modal]}</p>
                <button onClick={() => setModal(null)} className="text-slate" aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>
              {modal === "enable" && <EnableFlow onClose={() => setModal(null)} />}
              {modal === "disable" && <DisableFlow user={user} onClose={() => setModal(null)} />}
              {modal === "codes" && <RegenerateFlow onClose={() => setModal(null)} />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
