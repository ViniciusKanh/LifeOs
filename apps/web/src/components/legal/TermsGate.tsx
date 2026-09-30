import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/authService";
import { LEGAL_UPDATED_LABEL, LEGAL_VERSION, PRIVACY_POLICY } from "@/content/legal";
import { LegalDocument } from "./LegalDocument";

/**
 * Aviso bloqueante quando a conta ainda não aceitou a versão vigente do
 * Termo de Uso e da Política de Privacidade (inclui contas antigas, de
 * antes do termo existir). O aceite fica registrado no servidor com data e
 * versão — é o registro de consentimento exigido pela LGPD.
 */
export function TermsGate() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = !!user?.terms_pending;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await authService.acceptTerms(user?.terms_current_version ?? LEGAL_VERSION);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o aceite.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-gate-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-2xl"
          >
            <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-paper-border dark:border-ink-border">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-[linear-gradient(135deg,#19d3e0,#1e88ff,#8b5cf6)]">
                <ShieldCheck size={20} />
              </span>
              <div className="min-w-0">
                <p id="terms-gate-title" className="font-display font-bold text-lg leading-tight">
                  Sua privacidade no LifeOS
                </p>
                <p className="text-xs text-slate">Versão {LEGAL_VERSION} · {LEGAL_UPDATED_LABEL}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              <div className="rounded-2xl bg-[#1e88ff]/[0.06] border border-[#1e88ff]/20 p-4 mb-5 text-sm space-y-1.5">
                <p className="font-semibold">Resumo rápido</p>
                <p>• Seus dados não são vendidos nem usados para anúncios.</p>
                <p>• Dados de saúde e do Diário são usados só para mostrar seus registros e métricas.</p>
                <p>• A IA (Gemini) só recebe o necessário quando você usa um recurso de IA — nunca suas fotos ou arquivos.</p>
                <p>• O administrador vê apenas contagens de uso, nunca o conteúdo.</p>
                <p>• Você pode exportar ou excluir tudo pelo Perfil, quando quiser.</p>
              </div>
              <LegalDocument doc={PRIVACY_POLICY} compact />
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-paper-border dark:border-ink-border space-y-3">
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-[#1E88FF]" />
                <span>
                  Li e aceito a Política de Privacidade e o{" "}
                  <Link to="/termos" target="_blank" className="font-semibold text-[#1e88ff] hover:underline inline-flex items-center gap-0.5">
                    Termo de Uso <FileText size={12} />
                  </Link>
                  , inclusive o tratamento dos meus dados de saúde e do Diário para as funções do app.
                </span>
              </label>
              {error && <p className="text-xs text-drop">{error}</p>}
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button onClick={() => void logout()} className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm text-slate hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                  <LogOut size={14} /> Não aceito, sair
                </button>
                <button
                  onClick={accept}
                  disabled={!agree || saving}
                  className="sm:ml-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-[linear-gradient(120deg,#19d3e0,#1e88ff,#8b5cf6)] disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />} Aceitar e continuar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
