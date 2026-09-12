import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { registerFormSchema, type RegisterFormValues, passwordStrength } from "@/lib/validation";
import { useAuth } from "@/hooks/useAuth";
import { Button, Field } from "@/components/ui/primitives";

const STRENGTH_LABELS = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
const STRENGTH_COLORS = ["#C75146", "#C75146", "#E8A33D", "#E8A33D", "#4F8F63"];

export function RegisterPage() {
  const { register: registerUser, isRegistering, registerError } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const password = watch("password") ?? "";
  const strength = passwordStrength(password);

  const onSubmit = async (values: RegisterFormValues) => {
    await registerUser(values);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised space-y-4"
      >
        <h1 className="text-sm font-semibold mb-2">Criar conta</h1>

        <Field label="Nome" placeholder="Seu nome" {...register("name")} error={errors.name?.message} />
        <Field label="E-mail" type="email" placeholder="voce@email.com" {...register("email")} error={errors.email?.message} />
        <Field label="Senha" type="password" placeholder="••••••••" {...register("password")} error={errors.password?.message} />

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

        <Field
          label="Confirmar senha"
          type="password"
          placeholder="••••••••"
          {...register("confirmPassword")}
          error={errors.confirmPassword?.message}
        />

        <label className="flex items-start gap-2 text-xs text-slate">
          <input type="checkbox" className="mt-0.5" {...register("acceptTerms")} />
          <span>Aceito os Termos de Uso e a Política de Privacidade.</span>
        </label>
        {errors.acceptTerms && <p className="text-xs text-drop">{errors.acceptTerms.message}</p>}

        {registerError && <p className="text-xs text-drop">{registerError.message}</p>}

        <Button type="submit" disabled={isRegistering} className="w-full">
          {isRegistering ? "Criando conta..." : "Criar minha conta"}
        </Button>

        <p className="text-xs text-slate text-center pt-2">
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold hover:underline text-inherit">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
