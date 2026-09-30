import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { KeyRound, MailCheck } from "lucide-react";
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from "@/lib/validation";
import { authService } from "@/services/authService";
import { GlassAuthCard, GlassButton, GlassField } from "@/components/auth/GlassAuthCard";

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
    <GlassAuthCard icon={<KeyRound size={24} />} title="Recuperar senha" subtitle="Enviaremos um link seguro para você criar uma nova senha.">
      {sent ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-start gap-3 rounded-2xl border border-growth/30 bg-growth/10 p-4 text-sm">
          <MailCheck className="text-growth shrink-0 mt-0.5" size={20} />
          Se este e-mail estiver cadastrado, você receberá um link com instruções em instantes.
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <GlassField label="E-mail" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
          <GlassButton type="submit" busy={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar instruções"}
          </GlassButton>
        </form>
      )}
      <p className="text-xs text-center pt-5">
        <Link to="/login" className="font-semibold text-brand-100 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </GlassAuthCard>
  );
}
