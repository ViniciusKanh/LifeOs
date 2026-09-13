import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPasswordFormSchema, type ResetPasswordFormValues } from "@/lib/validation";
import { authService } from "@/services/authService";
import { Button, Field } from "@/components/ui/primitives";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setError(null);
    try {
      await authService.resetPassword(token, values.newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link de recuperação inválido ou expirado.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <div className="flex items-center gap-2 mb-6">
        <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
        <span className="text-sm tracking-wide text-slate">LifeOS</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised">
        <h1 className="text-sm font-semibold mb-4">Redefinir senha</h1>

        {!token ? (
          <p className="text-sm text-slate">
            Link inválido — solicite um novo em{" "}
            <Link to="/esqueci-senha" className="font-semibold hover:underline">
              recuperar senha
            </Link>
            .
          </p>
        ) : done ? (
          <p className="text-sm text-slate">Senha atualizada com sucesso! Redirecionando para o login...</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field
              label="Nova senha"
              type="password"
              placeholder="••••••••"
              {...register("newPassword")}
              error={errors.newPassword?.message}
            />
            <Field
              label="Confirmar nova senha"
              type="password"
              placeholder="••••••••"
              {...register("confirmPassword")}
              error={errors.confirmPassword?.message}
            />
            {error && <p className="text-xs text-drop">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Salvando..." : "Redefinir senha"}
            </Button>
          </form>
        )}

        <p className="text-xs text-slate text-center pt-4">
          <Link to="/login" className="font-semibold hover:underline text-inherit">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
