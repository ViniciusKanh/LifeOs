import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Link2, Link2Off, Loader2, ShieldAlert } from "lucide-react";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { useProfile } from "@/hooks/useProfile";
import { useGoogleLoginAvailable } from "@/hooks/useAuth";
import { GOOGLE_LINK_START_URL } from "@/services/authService";
import type { CurrentUser } from "@/types";

/**
 * Status e gestão do login com Google no Perfil.
 * Regras (validadas também no backend):
 * - vincular: fluxo OAuth iniciado com a sessão atual (vincula a ESTA conta);
 * - desvincular: só com senha cadastrada, e pedindo a senha como confirmação —
 *   sem senha o usuário perderia a única forma de entrar.
 */
const RETURN_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  vinculado: { text: "Conta Google vinculada com sucesso.", ok: true },
  em_uso: { text: "Essa conta Google já está vinculada a outro usuário do LifeOS.", ok: false },
  nao_configurado: { text: "O login com Google ainda não foi configurado pelo administrador.", ok: false },
  erro: { text: "Não foi possível vincular a conta Google. Tente novamente.", ok: false },
};

export function GoogleAccountCard({ user }: { user: CurrentUser }) {
  const googleAvailable = useGoogleLoginAvailable();
  const { unlinkGoogle, isUnlinkingGoogle, unlinkGoogleError, resetUnlinkGoogle } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // Resultado do retorno do Google (/perfil?google=...) — lido uma vez e removido da URL.
  useEffect(() => {
    const status = searchParams.get("google");
    if (!status) return;
    setFeedback(RETURN_MESSAGES[status] ?? RETURN_MESSAGES.erro);
    setSearchParams((prev) => (prev.delete("google"), prev), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnlink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await unlinkGoogle(password);
      setConfirming(false);
      setPassword("");
      setFeedback({ text: "Conta Google desvinculada. Entre com e-mail e senha a partir de agora.", ok: true });
    } catch {
      // mensagem exibida via unlinkGoogleError
    }
  };

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <IconBadge tone={user.google_linked ? "green" : "amber"} size={32} icon={user.google_linked ? <Link2 size={15} /> : <Link2Off size={15} />} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Conta Google</p>
          <p className="text-xs text-slate">Entrar no LifeOS com um clique pela sua conta Google.</p>
        </div>
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            user.google_linked ? "bg-growth/10 text-growth" : "bg-slate/10 text-slate"
          }`}
        >
          {user.google_linked ? "Vinculada" : "Não vinculada"}
        </span>
      </div>

      {feedback && (
        <p className={`text-xs rounded-lg px-3 py-2.5 mb-3 ${feedback.ok ? "bg-growth/10 text-growth" : "bg-drop/10 text-drop"}`} role="status">
          {feedback.text}
        </p>
      )}

      {user.google_linked ? (
        user.has_password ? (
          <>
            <p className="text-xs text-slate mb-3">Você entra com o Google ou com seu e-mail e senha. Ao desvincular, só o e-mail e senha continuarão valendo.</p>
            <AnimatePresence initial={false} mode="wait">
              {confirming ? (
                <motion.form
                  key="confirm"
                  onSubmit={handleUnlink}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <Field
                    label="Confirme sua senha para desvincular"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  {unlinkGoogleError && <p className="text-xs text-drop">{unlinkGoogleError.message}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setConfirming(false);
                        setPassword("");
                        resetUnlinkGoogle();
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1 !bg-drop !from-drop !to-drop" disabled={!password || isUnlinkingGoogle}>
                      {isUnlinkingGoogle ? <Loader2 size={14} className="animate-spin" /> : <Link2Off size={14} />}
                      Desvincular
                    </Button>
                  </div>
                </motion.form>
              ) : (
                <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Button variant="secondary" className="w-full" onClick={() => setConfirming(true)}>
                    <Link2Off size={14} /> Desvincular conta Google
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="rounded-xl p-3.5 bg-signal/10 border border-signal/25 flex gap-2.5">
            <ShieldAlert size={16} className="text-signal-deep shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              Sua conta ainda não tem senha própria — hoje você só entra pelo Google. <strong>Defina uma senha</strong> no card “Definir senha” para poder
              desvincular o Google sem perder o acesso.
            </p>
          </div>
        )
      ) : googleAvailable ? (
        <>
          <p className="text-xs text-slate mb-3">Vincule sua conta Google para entrar sem digitar senha. Sua senha atual continua funcionando.</p>
          <a
            href={GOOGLE_LINK_START_URL}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
          >
            <Link2 size={14} /> Vincular conta Google
          </a>
        </>
      ) : (
        <p className="text-xs text-slate">O login com Google não está disponível no momento.</p>
      )}
    </Card>
  );
}
