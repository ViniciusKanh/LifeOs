import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { User, Mail, Lock, ArrowRight, MailCheck, Target, BookOpen, HeartPulse } from "lucide-react";
import { registerFormSchema, type RegisterFormValues, passwordStrength } from "@/lib/validation";
import { useAuth } from "@/hooks/useAuth";
import { Button, IconField } from "@/components/ui/primitives";
import { AuthIllustration } from "@/components/auth/AuthIllustration";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";

const STRENGTH_LABELS = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
const STRENGTH_COLORS = ["#C75146", "#C75146", "#E8A33D", "#E8A33D", "#4F8F63"];

export function RegisterPage() {
  const { register: registerUser, isRegistering, registerError, resendVerification, isResendingVerification, resendVerificationSuccess } =
    useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const password = watch("password") ?? "";
  const strength = passwordStrength(password);

  const onSubmit = async (values: RegisterFormValues) => {
    const result = await registerUser(values);
    setSentTo(result.email);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <AuthIllustration
        headline={
          <>
            Sua rotina, organizada
            <br />
            do seu jeito.
          </>
        }
        subheadline="Tarefas, estudos, leitura e saúde em um só painel — com dados reais, não só listas soltas."
        features={[
          { icon: <Target size={16} />, label: "Metas e projetos com progresso real", tone: "green" },
          { icon: <BookOpen size={16} />, label: "Biblioteca e trilha de estudos", tone: "pink" },
          { icon: <HeartPulse size={16} />, label: "Sono, água, humor e energia", tone: "teal" },
        ]}
        insight="Planejar → Executar → Registrar → Medir → Melhorar — o ciclo por trás de cada tela do LifeOS."
        vertical="PLANEJE · EVOLUA · VIVA MELHOR"
      />

      <div className="flex-1 flex items-center justify-center px-6 py-10 md:p-14">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
            <span className="text-sm tracking-wide text-slate">LifeOS</span>
          </div>

          {sentTo ? (
            <div className="rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-growth/10 text-growth flex items-center justify-center mb-4">
                <MailCheck size={22} />
              </div>
              <h1 className="font-display font-semibold text-lg">Confirme seu e-mail</h1>
              <p className="text-sm text-slate mt-2">
                Enviamos um link de confirmação para <span className="font-semibold text-inherit">{sentTo}</span>. Abra sua caixa de
                entrada e clique nele para ativar sua conta.
              </p>

              {resendVerificationSuccess ? (
                <p className="text-xs text-growth font-medium mt-4">Link reenviado! Confira sua caixa de entrada.</p>
              ) : (
                <button
                  type="button"
                  disabled={isResendingVerification}
                  onClick={() => resendVerification(sentTo)}
                  className="text-xs font-semibold underline mt-4 disabled:opacity-50"
                >
                  {isResendingVerification ? "Reenviando..." : "Não recebeu? Reenviar e-mail"}
                </button>
              )}

              <p className="text-xs text-slate text-center pt-6">
                <Link to="/login" className="font-semibold hover:underline text-inherit">
                  Voltar para o login
                </Link>
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card space-y-4"
            >
              <div className="hidden md:flex items-center gap-2 mb-2">
                <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
                <span className="text-sm tracking-wide text-slate">LifeOS</span>
              </div>
              <div>
                <h1 className="font-display font-semibold text-xl">Criar sua conta</h1>
                <p className="text-sm text-slate mt-1">Leva menos de um minuto para começar.</p>
              </div>

              <IconField label="Nome" placeholder="Seu nome" icon={<User size={16} />} {...register("name")} error={errors.name?.message} />
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

              {password.length > 0 && (
                <div>
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full"
                        style={{ background: i < strength ? STRENGTH_COLORS[strength] : "var(--tw-border-opacity, #E4E0D6)" }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate">{STRENGTH_LABELS[strength]}</p>
                </div>
              )}

              <IconField
                label="Confirmar senha"
                type="password"
                placeholder="••••••••"
                icon={<Lock size={16} />}
                {...register("confirmPassword")}
                error={errors.confirmPassword?.message}
              />

              <label className="flex items-start gap-2 text-xs text-slate">
                <input type="checkbox" className="mt-0.5" {...register("acceptTerms")} />
                <span>Aceito os Termos de Uso e a Política de Privacidade.</span>
              </label>
              {errors.acceptTerms && <p className="text-xs text-drop">{errors.acceptTerms.message}</p>}

              {registerError && <p className="text-xs text-drop">{registerError.message}</p>}

              <Button type="submit" disabled={isRegistering} className="w-full group">
                {isRegistering ? "Criando conta..." : "Criar minha conta"}
                {!isRegistering && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
              </Button>

              <GoogleLoginButton />

              <p className="text-xs text-slate text-center pt-2">
                Já tem conta?{" "}
                <Link to="/login" className="font-semibold hover:underline text-inherit">
                  Entrar
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
