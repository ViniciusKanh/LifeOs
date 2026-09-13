import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/primitives";

/**
 * Tela do link enviado por e-mail no cadastro (?token=...). Confirma
 * a conta e já loga o usuário (o backend seta o cookie de sessão na
 * própria resposta de /verify-email).
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">(token ? "loading" : "error");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate("/dashboard"), 1500);
      })
      .catch(() => setStatus("error"));
  }, [token, verifyEmail, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <div className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
              <Loader2 size={22} className="animate-spin" />
            </div>
            <h1 className="font-display font-semibold text-lg">Confirmando seu e-mail…</h1>
            <p className="text-sm text-slate mt-2">Só um instante.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto w-12 h-12 rounded-full bg-growth/10 text-growth flex items-center justify-center mb-4">
              <CheckCircle2 size={22} />
            </div>
            <h1 className="font-display font-semibold text-lg">Conta confirmada!</h1>
            <p className="text-sm text-slate mt-2">Redirecionando para o seu painel…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto w-12 h-12 rounded-full bg-drop/10 text-drop flex items-center justify-center mb-4">
              <XCircle size={22} />
            </div>
            <h1 className="font-display font-semibold text-lg">Link inválido ou expirado</h1>
            <p className="text-sm text-slate mt-2">
              Peça um novo link de confirmação na tela de login, informando seu e-mail.
            </p>
            <Button className="w-full mt-5" onClick={() => navigate("/login")}>
              Ir para o login
            </Button>
          </>
        )}

        <p className="text-xs text-slate text-center pt-6">
          <Link to="/login" className="font-semibold hover:underline text-inherit">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
