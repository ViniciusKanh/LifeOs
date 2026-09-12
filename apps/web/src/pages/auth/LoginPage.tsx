import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { loginFormSchema, type LoginFormValues } from "@/lib/validation";
import { Button, Field } from "@/components/ui/primitives";

export function LoginPage() {
  const { login, isLoggingIn, loginError } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema), defaultValues: { rememberMe: false } });

  const onSubmit = async (values: LoginFormValues) => {
    await login(values);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <div className="md:w-1/2 flex flex-col justify-center px-8 py-10 md:px-14">
        <div className="flex items-center gap-2 mb-10">
          <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
          <span className="text-sm tracking-wide text-slate">LifeOS</span>
        </div>
        <p className="font-display font-medium" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", lineHeight: 1.05 }}>
          Transforme sua rotina
          <br />
          em progresso.
        </p>
      </div>

      <div className="md:w-1/2 flex items-center justify-center px-6 pb-10 md:p-14">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised space-y-4"
        >
          <h1 className="text-sm font-semibold mb-2">Entrar</h1>

          <Field label="E-mail" type="email" placeholder="voce@email.com" {...register("email")} error={errors.email?.message} />
          <Field label="Senha" type="password" placeholder="••••••••" {...register("password")} error={errors.password?.message} />

          <div className="flex items-center justify-between text-xs text-slate">
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register("rememberMe")} />
              Lembrar de mim
            </label>
            <Link to="/esqueci-senha" className="hover:underline">
              Esqueci minha senha
            </Link>
          </div>

          {loginError && <p className="text-xs text-drop">{loginError.message}</p>}

          <Button type="submit" disabled={isLoggingIn} className="w-full">
            {isLoggingIn ? "Entrando..." : "Entrar"}
          </Button>

          <p className="text-xs text-slate text-center pt-2">
            Não tem conta?{" "}
            <Link to="/cadastro" className="font-semibold hover:underline text-inherit">
              Criar conta
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
