import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MonitorUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { authService } from "@/services/authService";
import { desktopDeepLink, takeDesktopVerifier } from "@/platform/desktopAuth";

const CODE_RE = /^[A-Za-z0-9_-]{20,128}$/;

function AuthStatusCard({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-paper text-[#1E2126] dark:bg-ink dark:text-[#EDEBE4]">
      <div className="w-full max-w-sm rounded-2xl p-7 md:p-8 border border-paper-border dark:border-ink-border bg-paper-raised dark:bg-ink-raised shadow-card text-center">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${tone}`}>{icon}</div>
        <h1 className="font-display font-semibold text-lg">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Aberta no NAVEGADOR depois do Google, quando o login começou no LifeOS
 * Desktop: devolve o código de uso único ao app pelo deep link lifeos://.
 * Nenhuma sessão é criada neste navegador.
 */
export function DesktopHandoffPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const valid = CODE_RE.test(code);
  const link = valid ? desktopDeepLink(code) : "";

  useEffect(() => {
    if (valid) window.location.href = link;
  }, [valid, link]);

  if (!valid) {
    return (
      <AuthStatusCard icon={<XCircle size={22} />} tone="bg-drop/10 text-drop" title="Link de login inválido">
        <p className="text-sm text-slate mt-2">Volte ao LifeOS Desktop e clique em “Continuar com Google” de novo.</p>
      </AuthStatusCard>
    );
  }
  return (
    <AuthStatusCard icon={<MonitorUp size={22} />} tone="bg-brand-50 text-brand-600" title="Login confirmado">
      <p className="text-sm text-slate mt-2">
        Voltando ao LifeOS Desktop… Se o navegador perguntar, permita abrir o LifeOS. Depois você pode fechar esta aba.
      </p>
      <a
        href={link}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
      >
        Abrir o LifeOS
      </a>
    </AuthStatusCard>
  );
}

/**
 * Aberta DENTRO do app (o deep link navega a janela para cá): troca o código
 * + verificador PKCE pela sessão normal. Com MFA, segue para a 2ª etapa.
 */
export function DesktopCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = searchParams.get("code") ?? "";
    const verifier = takeDesktopVerifier();
    if (!CODE_RE.test(code) || !verifier) {
      setError("Este login não foi iniciado nesta janela ou já foi usado.");
      return;
    }
    authService
      .desktopExchange(code, verifier)
      .then(async (result) => {
        if ("mfaRequired" in result) {
          navigate(`/login?mfa=${encodeURIComponent(result.mfaToken)}`, { replace: true });
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        navigate("/dashboard", { replace: true });
      })
      .catch((err: { message?: string }) => setError(err?.message ?? "Não foi possível concluir o login."));
  }, [searchParams, navigate, queryClient]);

  if (error) {
    return (
      <AuthStatusCard icon={<XCircle size={22} />} tone="bg-drop/10 text-drop" title="Login não concluído">
        <p className="text-sm text-slate mt-2">{error}</p>
        <Button className="w-full mt-5" onClick={() => navigate("/login", { replace: true })}>
          Tentar de novo
        </Button>
        <p className="text-xs text-slate pt-5">
          <Link to="/login" className="font-semibold hover:underline text-inherit">
            Entrar com e-mail e senha
          </Link>
        </p>
      </AuthStatusCard>
    );
  }
  return (
    <AuthStatusCard icon={<Loader2 size={22} className="animate-spin" />} tone="bg-brand-50 text-brand-600" title="Entrando no LifeOS…">
      <p className="text-sm text-slate mt-2 inline-flex items-center gap-1.5">
        <CheckCircle2 size={14} aria-hidden="true" /> Conta Google confirmada.
      </p>
    </AuthStatusCard>
  );
}
