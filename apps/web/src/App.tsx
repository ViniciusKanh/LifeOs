import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/primitives";

/**
 * Code-splitting por rota: cada página vira um chunk próprio, baixado
 * só quando o usuário navega até ela — em vez de um bundle único de
 * ~1MB que carregava todo o app (Kanban, gráficos do Analytics,
 * biblioteca etc.) só pra mostrar a tela de login. `vite.config.ts`
 * ainda separa os pacotes pesados (recharts, react-hook-form/zod) em
 * chunks compartilhados via manualChunks.
 */
// Login e Cadastro são o MESMO componente (cartão que vira em 3D): as duas
// rotas apontam para AuthPage, então trocar entre elas só gira o cartão.
const LegalPage = lazy(() => import("@/pages/legal/LegalPage").then((m) => ({ default: m.LegalPage })));
const AuthPage = lazy(() => import("@/pages/auth/AuthPage").then((m) => ({ default: m.AuthPage })));
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const DesktopHandoffPage = lazy(() => import("@/pages/auth/DesktopAuthPages").then((m) => ({ default: m.DesktopHandoffPage })));
const DesktopCallbackPage = lazy(() => import("@/pages/auth/DesktopAuthPages").then((m) => ({ default: m.DesktopCallbackPage })));
const VerifyEmailPage = lazy(() =>
  import("@/pages/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage }))
);
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const HojePage = lazy(() => import("@/pages/hoje/HojePage").then((m) => ({ default: m.HojePage })));
const TarefasPage = lazy(() => import("@/pages/tarefas/TarefasPage").then((m) => ({ default: m.TarefasPage })));
const ForjaCampanhasPage = lazy(() => import("@/pages/campanhas/ForjaCampanhasPage").then((m) => ({ default: m.ForjaCampanhasPage })));
const CampanhaDetalhePage = lazy(() => import("@/pages/campanhas/CampanhaDetalhePage").then((m) => ({ default: m.CampanhaDetalhePage })));
const CodexPage = lazy(() => import("@/pages/codex/CodexPage").then((m) => ({ default: m.CodexPage })));
const ContratosPage = lazy(() => import("@/pages/contratos/ContratosPage").then((m) => ({ default: m.ContratosPage })));
const ProjetosPage = lazy(() => import("@/pages/projetos/ProjetosPage").then((m) => ({ default: m.ProjetosPage })));
const ProjetoDetalhePage = lazy(() =>
  import("@/pages/projetos/ProjetoDetalhePage").then((m) => ({ default: m.ProjetoDetalhePage }))
);
const InboxPage = lazy(() => import("@/pages/inbox/InboxPage").then((m) => ({ default: m.InboxPage })));
const ProfissionalPage = lazy(() => import("@/pages/profissional/ProfissionalPage").then((m) => ({ default: m.ProfissionalPage })));
const CalendarioPage = lazy(() =>
  import("@/pages/calendario/CalendarioPage").then((m) => ({ default: m.CalendarioPage }))
);
const BibliotecaPage = lazy(() => import("@/pages/biblioteca/BibliotecaPage").then((m) => ({ default: m.BibliotecaPage })));
const LivroDetalhePage = lazy(() =>
  import("@/pages/biblioteca/LivroDetalhePage").then((m) => ({ default: m.LivroDetalhePage }))
);
const EducacaoPage = lazy(() => import("@/pages/educacao/EducacaoPage").then((m) => ({ default: m.EducacaoPage })));
const FormacaoDetalhePage = lazy(() =>
  import("@/pages/educacao/FormacaoDetalhePage").then((m) => ({ default: m.FormacaoDetalhePage }))
);
const PerfilPage = lazy(() => import("@/pages/perfil/PerfilPage").then((m) => ({ default: m.PerfilPage })));
const ConfiguracoesPage = lazy(() =>
  import("@/pages/admin/ConfiguracoesPage").then((m) => ({ default: m.ConfiguracoesPage }))
);
const AdminUsuariosPage = lazy(() =>
  import("@/pages/admin/AdminUsuariosPage").then((m) => ({ default: m.AdminUsuariosPage }))
);
const SaudePage = lazy(() => import("@/pages/saude/SaudePage").then((m) => ({ default: m.SaudePage })));
const HabitosPage = lazy(() => import("@/pages/habitos/HabitosPage").then((m) => ({ default: m.HabitosPage })));
const MetasPage = lazy(() => import("@/pages/metas/MetasPage").then((m) => ({ default: m.MetasPage })));
const ExperimentsPage = lazy(() => import("@/pages/experimentos/ExperimentsPage").then((m) => ({ default: m.ExperimentsPage })));
const ExperimentDetailPage = lazy(() => import("@/pages/experimentos/ExperimentDetailPage").then((m) => ({ default: m.ExperimentDetailPage })));
const ConquistasPage = lazy(() =>
  import("@/pages/conquistas/ConquistasPage").then((m) => ({ default: m.ConquistasPage }))
);
const CapacityPlannerPage = lazy(() =>
  import("@/pages/capacity-planner/CapacityPlannerPage").then((m) => ({ default: m.CapacityPlannerPage }))
);
const DeadlineRadarPage = lazy(() =>
  import("@/pages/deadline-radar/DeadlineRadarPage").then((m) => ({ default: m.DeadlineRadarPage }))
);
const WeeklyReviewPage = lazy(() =>
  import("@/pages/weekly-review/WeeklyReviewPage").then((m) => ({ default: m.WeeklyReviewPage }))
);
const GatilhosPage = lazy(() => import("@/pages/gatilhos/GatilhosPage").then((m) => ({ default: m.GatilhosPage })));
const InventarioPage = lazy(() => import("@/pages/inventario/InventarioPage").then((m) => ({ default: m.InventarioPage })));
const BuildPage = lazy(() => import("@/pages/character-build/BuildPage").then((m) => ({ default: m.BuildPage })));
const ProtocolosPage = lazy(() => import("@/pages/protocolos/ProtocolosPage").then((m) => ({ default: m.ProtocolosPage })));
const DetectorGargalosPage = lazy(() => import("@/pages/detector-gargalos/DetectorGargalosPage").then((m) => ({ default: m.DetectorGargalosPage })));
const ForjaInteligenciaPage = lazy(() => import("@/pages/forja-inteligencia/ForjaInteligenciaPage").then((m) => ({ default: m.ForjaInteligenciaPage })));
const TesouroPage = lazy(() => import("@/pages/tesouro/TesouroPage").then((m) => ({ default: m.TesouroPage })));
const DiarioPage = lazy(() => import("@/pages/diario/DiarioPage").then((m) => ({ default: m.DiarioPage })));
const AdministracaoPage = lazy(() => import("@/pages/administracao/AdministracaoPage").then((m) => ({ default: m.AdministracaoPage })));
const RevisoesPage = lazy(() => import("@/pages/revisoes/RevisoesPage").then((m) => ({ default: m.RevisoesPage })));
const CompartilharPage = lazy(() => import("@/pages/compartilhar/CompartilharPage").then((m) => ({ default: m.CompartilharPage })));

function PageFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
    </div>
  );
}

function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate">Carregando…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <EmptyState
        title="Acesso restrito"
        description="Apenas administradores podem acessar as configurações do LifeOS."
        ctaLabel="Voltar ao início"
        onCta={() => window.location.assign("/dashboard")}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/cadastro" element={<AuthPage />} />
        {/* Documentos legais públicos (também são a URL de privacidade da Microsoft Store). */}
        <Route path="/privacidade" element={<LegalPage />} />
        <Route path="/termos" element={<LegalPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/verificar-email" element={<VerifyEmailPage />} />
        {/* Login com Google do Desktop: navegador → deep link → janela do app. */}
        <Route path="/auth/desktop-handoff" element={<DesktopHandoffPage />} />
        <Route path="/auth/desktop" element={<DesktopCallbackPage />} />

        <Route element={<ProtectedRoutes />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/hoje" element={<HojePage />} />
          <Route path="/tarefas" element={<TarefasPage />} />
          <Route path="/contratos" element={<ContratosPage />} />
          <Route path="/forja-campanhas" element={<ForjaCampanhasPage />} />
          <Route path="/forja-campanhas/:id" element={<CampanhaDetalhePage />} />
          <Route path="/projetos" element={<ProjetosPage />} />
          <Route path="/projetos/:id" element={<ProjetoDetalhePage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/profissional" element={<ProfissionalPage />} />
          <Route path="/calendario" element={<CalendarioPage />} />
          <Route path="/semana" element={<Navigate to="/calendario" replace />} />
          <Route path="/biblioteca" element={<BibliotecaPage />} />
          <Route path="/biblioteca/:id" element={<LivroDetalhePage />} />
          <Route path="/educacao" element={<EducacaoPage />} />
          <Route path="/educacao/:id" element={<FormacaoDetalhePage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/habitos" element={<HabitosPage />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/experimentos" element={<ExperimentsPage />} />
          <Route path="/experimentos/:id" element={<ExperimentDetailPage />} />
          <Route path="/signals" element={<Navigate to="/hoje" replace />} />
          <Route path="/contexto-do-dia" element={<Navigate to="/hoje" replace />} />
          <Route path="/conquistas" element={<ConquistasPage />} />
          <Route path="/tesouro" element={<TesouroPage />} />
          <Route path="/inventario" element={<InventarioPage />} />
          <Route path="/build" element={<BuildPage />} />
          <Route path="/protocolos" element={<ProtocolosPage />} />
          <Route path="/detector-gargalos" element={<DetectorGargalosPage />} />
          <Route path="/forja-inteligencia" element={<ForjaInteligenciaPage />} />
          {/* A antiga Loja virou o Tesouro & Recompensas. */}
          <Route path="/loja" element={<Navigate to="/tesouro" replace />} />
          <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
          <Route path="/capacity-planner" element={<CapacityPlannerPage />} />
          <Route path="/deadline-radar" element={<DeadlineRadarPage />} />
          <Route path="/goal-forecast" element={<Navigate to="/metas" replace />} />
          <Route path="/timeline" element={<Navigate to="/dashboard" replace />} />
          <Route path="/codex" element={<CodexPage />} />
          <Route path="/weekly-review" element={<WeeklyReviewPage />} />
          <Route path="/life-map" element={<Navigate to="/metas" replace />} />
          <Route path="/data-health" element={<Navigate to="/dashboard" replace />} />
          <Route path="/gatilhos" element={<GatilhosPage />} />
          <Route path="/diario" element={<DiarioPage />} />
          <Route path="/administracao" element={<AdministracaoPage />} />
          <Route path="/direcao" element={<Navigate to="/metas" replace />} />
          <Route path="/revisoes" element={<RevisoesPage />} />
          <Route path="/notas" element={<Navigate to="/diario" replace />} />
          <Route path="/compartilhar" element={<CompartilharPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route
            path="/configuracoes"
            element={
              <AdminRoute>
                <ConfiguracoesPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <AdminRoute>
                <AdminUsuariosPage />
              </AdminRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
