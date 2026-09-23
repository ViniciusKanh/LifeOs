import { useGoogleLoginAvailable } from "@/hooks/useAuth";
import { GOOGLE_LOGIN_START_URL } from "@/services/authService";

/** "G" colorido da Google — ícone oficial usado em botões de login, conforme as diretrizes de marca da própria Google. */
function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.96H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.04l3.05-2.34Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.96l3.05 2.34C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Botão "Entrar com Google" — só aparece quando um admin já configurou
 * Client ID/Secret em Configurações → Login com Google (ver
 * ConfiguracoesPage.tsx); sem isso, o botão simplesmente não existe em
 * vez de aparecer e falhar ao clicar. Navegação de página inteira (não
 * fetch): o fluxo OAuth precisa sair do app e voltar via redirect.
 */
export function GoogleLoginButton() {
  const available = useGoogleLoginAvailable();
  if (!available) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-[11px] text-slate">
        <div className="flex-1 h-px bg-paper-border dark:bg-ink-border" />
        ou
        <div className="flex-1 h-px bg-paper-border dark:bg-ink-border" />
      </div>
      <a
        href={GOOGLE_LOGIN_START_URL}
        className="w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold border border-paper-border dark:border-ink-border hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
      >
        <GoogleGlyph />
        Continuar com Google
      </a>
    </>
  );
}
