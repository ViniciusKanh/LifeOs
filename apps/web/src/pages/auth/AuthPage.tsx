import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Loader2, MailCheck, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { loginFormSchema, registerFormSchema, type LoginFormValues, type RegisterFormValues } from "@/lib/validation";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { NeoField } from "@/components/auth/NeoField";
import { PasswordStrengthPanel } from "@/components/auth/PasswordStrengthPanel";
import "@/styles/auth.css";

/**
 * Entrar e Criar conta num único cartão que vira em 3D. As rotas /login e
 * /cadastro renderizam este mesmo componente (ver App.tsx), então trocar de
 * rota só gira o cartão, sem recarregar a tela. Toda a lógica real
 * (validação, e-mail não confirmado, reenvio, Google) é a mesma de antes.
 */

// Mensagens por código de erro do login com Google (ver /google/callback em auth.routes.ts).
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

function Logo() {
  return (
    <motion.div whileHover={{ y: -5, rotate: 8 }} className="neo-raised-sm mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center">
      <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-signal p-[2.5px] shadow-glow-brand">
        <img src="/logo/icon-64.png" alt="LifeOS" className="w-full h-full rounded-[14px] object-cover bg-white" />
      </span>
    </motion.div>
  );
}

function Face({ children, hidden, back }: { children: ReactNode; hidden: boolean; back?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // A face virada fica inacessível ao teclado e leitores de tela.
  useEffect(() => {
    ref.current?.toggleAttribute("inert", hidden);
  }, [hidden]);
  return (
    <div
      ref={ref}
      aria-hidden={hidden}
      className="neo-raised [grid-area:1/1] rounded-[32px] px-6 py-8 sm:px-9 sm:py-10 flex flex-col justify-center"
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined }}
    >
      {children}
    </div>
  );
}

function SwitchArea({ text, onClick, icon, label }: { text: string; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-6 text-xs text-[var(--auth-muted)]">
      <span>{text}</span>
      <button type="button" onClick={onClick} aria-label={label} className="neo-switch w-12 h-12 rounded-full flex items-center justify-center">
        {icon}
      </button>
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="neo-btn w-full h-14 rounded-2xl text-sm font-bold tracking-wide inline-flex items-center justify-center gap-2">
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login, isLoggingIn, loginError, resendVerification, isResendingVerification, resendVerificationSuccess } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [googleError] = useState(() => searchParams.get("google_error"));
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema), defaultValues: { rememberMe: false } });
  const isUnverified = loginError?.status === 403;

  // Remove o parâmetro da URL depois de ler, pra um F5 não reexibir o erro.
  useEffect(() => {
    if (searchParams.get("google_error")) setSearchParams((prev) => (prev.delete("google_error"), prev), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (values: LoginFormValues) => {
    setPendingEmail(null);
    try {
      await login(values);
      navigate("/dashboard");
    } catch (err) {
      if ((err as { status?: number })?.status === 403) setPendingEmail(values.email);
    }
  };

  return (
    <>
      <Logo />
      <h1 className="text-center font-display font-bold text-[26px] tracking-tight">Bem-vindo de volta</h1>
      <p className="text-center text-[13px] text-[var(--auth-muted)] mt-1 mb-7">Entre para continuar transformando sua rotina em progresso.</p>

      {googleError && (
        <p className="mb-4 rounded-xl border border-drop/30 bg-drop/10 px-3 py-2.5 text-xs" role="alert">
          {GOOGLE_ERROR_MESSAGES[googleError] ?? "Não foi possível entrar com o Google. Tente novamente."}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <NeoField label="E-mail" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <NeoField label="Senha" togglePassword autoComplete="current-password" {...register("password")} error={errors.password?.message} />

        <div className="flex items-center justify-between text-[13px] text-[var(--auth-muted)] px-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-[#7C4DFF]" {...register("rememberMe")} />
            Lembrar de mim
          </label>
          <Link to="/esqueci-senha" className="text-[var(--auth-accent)] hover:underline">
            Esqueci a senha
          </Link>
        </div>

        {loginError && !isUnverified && (
          <p className="text-xs text-drop" role="alert">
            {loginError.message}
          </p>
        )}
        {isUnverified && pendingEmail && (
          <div className="rounded-xl border border-signal/30 bg-signal/10 px-3 py-2.5 text-xs space-y-2" role="alert">
            <p>{loginError?.message}</p>
            {resendVerificationSuccess ? (
              <p className="font-medium">Link reenviado! Confira sua caixa de entrada.</p>
            ) : (
              <button type="button" disabled={isResendingVerification} onClick={() => resendVerification(pendingEmail)} className="font-semibold underline disabled:opacity-50">
                {isResendingVerification ? "Reenviando..." : "Reenviar e-mail de confirmação"}
              </button>
            )}
          </div>
        )}

        <SubmitButton busy={isLoggingIn}>{isLoggingIn ? "ENTRANDO..." : "ENTRAR"}</SubmitButton>
        <GoogleLoginButton />
      </form>

      <SwitchArea text="Ainda não tem conta?" onClick={onSwitch} icon={<Plus size={22} />} label="Criar conta" />
    </>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register: registerUser, isRegistering, registerError, resendVerification, isResendingVerification, resendVerificationSuccess } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });
  const password = watch("password") ?? "";

  const onSubmit = async (values: RegisterFormValues) => {
    const result = await registerUser(values);
    setSentTo(result.email);
  };

  if (sentTo) {
    return (
      <div className="text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="neo-raised-sm mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center text-growth">
          <MailCheck size={30} />
        </motion.div>
        <h1 className="font-display font-bold text-2xl">Confirme seu e-mail</h1>
        <p className="text-sm text-[var(--auth-muted)] mt-2">
          Enviamos um link para <strong className="text-[var(--auth-text)]">{sentTo}</strong>. Clique nele para ativar sua conta.
        </p>
        {resendVerificationSuccess ? (
          <p className="text-xs text-growth font-medium mt-4">Link reenviado! Confira sua caixa de entrada.</p>
        ) : (
          <button type="button" disabled={isResendingVerification} onClick={() => resendVerification(sentTo)} className="text-xs font-semibold underline mt-4 disabled:opacity-50">
            {isResendingVerification ? "Reenviando..." : "Não recebeu? Reenviar e-mail"}
          </button>
        )}
        <SwitchArea text="Voltar para o login" onClick={onSwitch} icon={<ArrowLeft size={20} />} label="Voltar para o login" />
      </div>
    );
  }

  return (
    <>
      <Logo />
      <h1 className="text-center font-display font-bold text-[26px] tracking-tight">Criar sua conta</h1>
      <p className="text-center text-[13px] text-[var(--auth-muted)] mt-1 mb-7">Planejar → Executar → Registrar → Medir → Melhorar.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <NeoField label="Nome completo" autoComplete="name" {...register("name")} error={errors.name?.message} />
        <NeoField label="E-mail" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <NeoField label="Senha" togglePassword autoComplete="new-password" {...register("password")} error={errors.password?.message} />
        {password.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden px-1">
            <PasswordStrengthPanel password={password} />
          </motion.div>
        )}
        <NeoField label="Confirmar senha" togglePassword autoComplete="new-password" {...register("confirmPassword")} error={errors.confirmPassword?.message} />

        <label className="flex items-start gap-2 text-xs text-[var(--auth-muted)] px-1 cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-[#7C4DFF]" {...register("acceptTerms")} />
          <span>Aceito os Termos de Uso e a Política de Privacidade.</span>
        </label>
        {errors.acceptTerms && <p className="text-xs text-drop px-1">{errors.acceptTerms.message}</p>}
        {registerError && (
          <p className="text-xs text-drop" role="alert">
            {registerError.message}
          </p>
        )}

        <SubmitButton busy={isRegistering}>{isRegistering ? "CRIANDO CONTA..." : "CRIAR CONTA"}</SubmitButton>
        <GoogleLoginButton />
      </form>

      <SwitchArea text="Já tem uma conta?" onClick={onSwitch} icon={<ArrowLeft size={20} />} label="Voltar para o login" />
    </>
  );
}

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const isRegister = location.pathname.startsWith("/cadastro");

  return (
    <div className="auth-scope relative min-h-screen w-full flex flex-col items-center justify-center px-4 py-10 overflow-x-hidden">
      <span className="auth-bubble w-[190px] h-[190px] top-[7%] left-[7%]" aria-hidden />
      <span className="auth-bubble w-[130px] h-[130px] right-[8%] bottom-[8%]" style={{ animationDelay: "1.5s" }} aria-hidden />
      <span className="auth-bubble w-[55px] h-[55px] right-[20%] top-[22%]" style={{ animationDelay: "3s" }} aria-hidden />

      <p className="relative z-10 mb-6 text-xs font-semibold tracking-[0.2em] uppercase text-[var(--auth-muted)]">
        LifeOS · Transforme sua rotina em progresso
      </p>

      <div className="relative z-10 w-full max-w-[420px]" style={{ perspective: 1600 }}>
        <motion.div
          className="grid"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateY: isRegister ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 1, ease: [0.68, -0.55, 0.27, 1.55] }}
        >
          <Face hidden={isRegister}>
            <LoginForm onSwitch={() => navigate("/cadastro")} />
          </Face>
          <Face hidden={!isRegister} back>
            <RegisterForm onSwitch={() => navigate("/login")} />
          </Face>
        </motion.div>
      </div>
    </div>
  );
}
