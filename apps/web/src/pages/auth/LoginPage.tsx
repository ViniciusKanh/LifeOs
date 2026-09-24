import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, ArrowRight, MailCheck, CalendarCheck2, LineChart, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { loginFormSchema, type LoginFormValues } from "@/lib/validation";
import { Button, IconField } from "@/components/ui/primitives";
import { AuthIllustration } from "@/components/auth/AuthIllustration";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";

// Mensagens amigáveis por código de erro do login com Google (ver auth.routes.ts
// /google/callback — cada etapa que pode falhar tem seu próprio código, em vez
// de um "state_invalido" genérico, para o usuário e o suporte saberem o motivo real.
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  code_ausente: "O Google não retornou uma autorização válida. Tente novamente.",
  state_ausente: "A tentativa de login expirou antes de voltar do Google. Tente novamente.",
  state_expirado: "Você demorou demais na tela do Google e a tentativa expirou. Tente novamente.",
  state_assinatura_invalida: "Não foi possível confirmar que este login veio do LifeOS. Tente novamente.",
  "state_propósito_invalido": "Não foi possível confirmar que este login veio do LifeOS. Tente novamente.",
  chave_ausente: "Login com Google está temporariamente indisponível. Avise um administrador.",
  falha_google: "Não foi possível confirmar sua conta Google agora. Tente novamente em instantes.",
  nao_configurado: "Login com Google ainda não foi configurado neste sistema.",
  google_access_denied: "Você cancelou o login com o Google.",
};

function googleErrorMessage(code: string): string {
  return GOOGLE_ERROR_MESSAGES[code] ?? "Não foi possível entrar com o Google. Tente novamente.";
}

export function LoginPage() {
  const { login, isLoggingIn, loginError, resendVerification, isResendingVerification, resendVerificationSuccess } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema), defaultValues: { rememberMe: false } });

  const isUnverified = loginError?.status === 403;

  const googleErrorCode = searchParams.get("google_error");
  // Remove o parâmetro da URL depois de ler, pra um F5 não reexibir o erro.
  useEffect(() => {
    if (googleErrorCode) setSearchParams((prev) => (prev.delete("google_error"), prev), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleErrorCode]);

  const onSubmit = async (values: LoginFormValues) => {
    setPendingEmail(null);
    try {
      await login(values);
      navigate("/dashboard");
    } catch (err) {
      if ((err as { status?: number })?.status === 403) {
        setPendingEmail(values.email);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <AuthIllustration
        headline={
          <>
            Transforme sua rotina
            <br />
            em progresso.
          </>
        }
        subheadline="Planeje seu dia, acompanhe hábitos e metas e veja sua evolução em um só lugar."
        features={[
          { icon: <CalendarCheck2 size={16} />, label: "Prioridades e rotina do dia", tone: "blue" },
          { icon: <LineChart size={16} />, label: "Analytics e Life Score em tempo real", tone: "purple" },
          { icon: <Trophy size={16} />, label: "Conquistas por progresso real", tone: "amber" },
        ]}
        insight="Registrar seu progresso todos os dias é o que transforma intenção em rotina — e rotina em resultado."
        vertical="PLANEJE · EXECUTE · MELHORE"
      />

      <div className="flex-1 flex items-center justify-center px-6 py-10 md:p-14">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
            <span className="text-sm tracking-wide text-slate">LifeOS</span>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card space-y-4"
          >
            {googleErrorCode && (
              <div className="rounded-xl border border-drop/30 bg-drop/10 px-3 py-2.5 text-xs text-[#1E2126] dark:text-[#EDEBE4]">
                {googleErrorMessage(googleErrorCode)}
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 mb-2">
              <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
              <span className="text-sm tracking-wide text-slate">LifeOS</span>
            </div>
            <div>
              <h1 className="font-display font-semibold text-xl">Bem-vindo de volta</h1>
              <p className="text-sm text-slate mt-1">Entre para continuar de onde parou.</p>
            </div>

            <IconField
              label="E-mail"
              type="email"
              placeholder="voce@email.com"
              icon={<Mail size={16} />}
              {...register("email")}
              error={errors.email?.message}
            />
            <IconField
              label="Senha"
              type="password"
              placeholder="••••••••"
              icon={<Lock size={16} />}
              {...register("password")}
              error={errors.password?.message}
            />

            <div className="flex items-center justify-between text-xs text-slate">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("rememberMe")} />
                Lembrar de mim
              </label>
              <Link to="/esqueci-senha" className="hover:underline">
                Esqueci minha senha
              </Link>
            </div>

            {loginError && !isUnverified && <p className="text-xs text-drop">{loginError.message}</p>}

            {isUnverified && pendingEmail && (
              <div className="rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs text-[#1E2126] dark:text-[#EDEBE4] space-y-2">
                <p>{loginError?.message}</p>
                {resendVerificationSuccess ? (
                  <p className="font-medium">Link reenviado! Confira sua caixa de entrada.</p>
                ) : (
                  <button
                    type="button"
                    disabled={isResendingVerification}
                    onClick={() => resendVerification(pendingEmail)}
                    className="font-semibold underline disabled:opacity-50"
                  >
                    {isResendingVerification ? "Reenviando..." : "Reenviar e-mail de confirmação"}
                  </button>
                )}
              </div>
            )}

            <Button type="submit" disabled={isLoggingIn} className="w-full group">
              {isLoggingIn ? "Entrando..." : "Entrar"}
              {!isLoggingIn && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
            </Button>

            <GoogleLoginButton />

            <p className="text-xs text-slate text-center pt-2">
              Não tem conta?{" "}
              <Link to="/cadastro" className="font-semibold hover:underline text-inherit">
                Criar conta
              </Link>
            </p>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate">
            <MailCheck size={13} /> Todo cadastro é confirmado por e-mail antes do primeiro acesso.
          </p>
        </div>
      </div>
    </div>
  );
}
