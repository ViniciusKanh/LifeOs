import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from "@/lib/validation";
import { authService } from "@/services/authService";
import { Button, Field } from "@/components/ui/primitives";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordFormSchema) });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await authService.forgotPassword(values.email);
    setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <div className="flex items-center gap-2 mb-6">
        <img src="/logo/icon-64.png" alt="LifeOS" className="w-8 h-8 rounded-md object-contain" />
        <span className="text-sm tracking-wide text-slate">LifeOS</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised">
        <h1 className="text-sm font-semibold mb-4">Recuperar senha</h1>

        {sent ? (
          <p className="text-sm text-slate">
            Se este e-mail estiver cadastrado, você receberá um link com instruções em instantes.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="E-mail" type="email" placeholder="voce@email.com" {...register("email")} error={errors.email?.message} />
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Enviando..." : "Enviar instruções"}
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
