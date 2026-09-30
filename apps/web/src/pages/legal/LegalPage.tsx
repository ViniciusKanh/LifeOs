import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, FileText, Printer, ShieldCheck } from "lucide-react";
import { CONTROLLER, LEGAL_UPDATED_LABEL, LEGAL_VERSION, PRIVACY_POLICY, TERMS_OF_USE } from "@/content/legal";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { useAuth } from "@/hooks/useAuth";

/**
 * Páginas públicas /privacidade e /termos — acessíveis sem login (a
 * Microsoft Store exige uma URL pública de política de privacidade).
 */
export function LegalPage() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const isTerms = pathname.startsWith("/termos");
  const doc = isTerms ? TERMS_OF_USE : PRIVACY_POLICY;

  return (
    <div className="min-h-screen bg-[#f5f8fd] dark:bg-ink text-[#26303d] dark:text-[#E7EAF2]">
      <header className="sticky top-0 z-10 border-b border-paper-border dark:border-ink-border bg-white/85 dark:bg-ink-raised/85 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center gap-3">
          <Link to={isAuthenticated ? "/dashboard" : "/login"} className="flex items-center gap-2.5 min-w-0">
            <img src="/logo/icon-64.png" alt="" className="w-8 h-8 rounded-lg" />
            <span className="font-display font-extrabold text-lg">
              Life<span className="bg-[linear-gradient(120deg,#19d3e0,#1e88ff,#8b5cf6)] bg-clip-text text-transparent">OS</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Documentos legais">
            <Link to="/privacidade" aria-current={!isTerms ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${!isTerms ? "bg-[#1e88ff]/10 text-[#1e88ff] font-semibold" : "text-slate hover:text-inherit"}`}>
              Privacidade
            </Link>
            <Link to="/termos" aria-current={isTerms ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${isTerms ? "bg-[#1e88ff]/10 text-[#1e88ff] font-semibold" : "text-slate hover:text-inherit"}`}>
              Termo de Uso
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12 grid lg:grid-cols-[220px_minmax(0,1fr)] gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate mb-2">Nesta página</p>
            {doc.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-2 py-1.5 text-xs text-slate hover:text-[#1e88ff] hover:bg-[#1e88ff]/5">
                {s.title}
              </a>
            ))}
          </div>
        </aside>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-paper-border dark:border-ink-border bg-white dark:bg-ink-raised p-6 sm:p-10 shadow-card">
          <div className="flex items-start gap-4 mb-6">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-[linear-gradient(135deg,#19d3e0,#1e88ff,#8b5cf6)] shrink-0">
              {isTerms ? <FileText size={22} /> : <ShieldCheck size={22} />}
            </span>
            <div className="min-w-0">
              <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight">{doc.title}</h1>
              <p className="text-xs text-slate mt-1">
                Versão {LEGAL_VERSION} · Atualizado em {LEGAL_UPDATED_LABEL} · {CONTROLLER.product}
              </p>
            </div>
            <button onClick={() => window.print()} className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-paper-border dark:border-ink-border px-3 py-2 text-xs hover:bg-paper dark:hover:bg-ink print:hidden">
              <Printer size={14} /> Imprimir
            </button>
          </div>
          <LegalDocument doc={doc} />
          <div className="mt-10 pt-6 border-t border-paper-border dark:border-ink-border flex flex-wrap items-center gap-3 text-xs text-slate">
            <span>Dúvidas: {CONTROLLER.email}</span>
            <Link to={isAuthenticated ? "/perfil" : "/login"} className="ml-auto inline-flex items-center gap-1 text-[#1e88ff] font-semibold hover:underline">
              <ArrowLeft size={13} /> {isAuthenticated ? "Voltar ao Perfil" : "Voltar ao login"}
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
