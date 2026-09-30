import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button, Card, Field, IconBadge } from "@/components/ui/primitives";
import { authService } from "@/services/authService";
import type { CurrentUser } from "@/types";

/**
 * "Excluir minha conta" (LGPD art. 18, VI): apaga a conta e todos os dados.
 * Pede o e-mail digitado, a senha (se houver) e o código do MFA (se ativo).
 */
export function DeleteAccountCard({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmEmail.trim().toLowerCase() === user.email.toLowerCase() && (!user.has_password || password) && (!user.mfa_enabled || code.trim().length >= 6);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.deleteAccount({ confirmEmail, password: password || undefined, code: code || undefined });
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir a conta.");
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 md:p-6 border-drop/25">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge tone="amber" size={32} icon={<Trash2 size={15} />} />
        <div>
          <p className="text-sm font-semibold">Excluir minha conta</p>
          <p className="text-xs text-slate">Apaga a conta e todos os seus dados de forma definitiva.</p>
        </div>
      </div>
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate flex-1 min-w-[180px]">
            Antes, se quiser, exporte seus dados acima. Veja a{" "}
            <Link to="/privacidade#retencao" className="text-brand-600 dark:text-brand-100 hover:underline">
              política de retenção
            </Link>
            .
          </p>
          <Button variant="secondary" className="!text-drop" onClick={() => setOpen(true)}>
            <Trash2 size={14} /> Quero excluir
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 rounded-xl bg-drop/10 border border-drop/25 p-3 text-xs">
            <AlertTriangle size={16} className="text-drop shrink-0" />
            <span>Isto não pode ser desfeito: tarefas, projetos, Diário (com fotos e vídeos), saúde, hábitos, metas e todo o resto serão apagados.</span>
          </div>
          <Field label={`Digite seu e-mail (${user.email}) para confirmar`} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
          {user.has_password && <Field label="Sua senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
          {user.mfa_enabled && <Field label="Código do app autenticador" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />}
          {error && <p className="text-xs text-drop">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={!canSubmit || busy} className="flex-1 !bg-drop !from-drop !to-drop">
              {busy && <Loader2 size={14} className="animate-spin" />} Excluir definitivamente
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
