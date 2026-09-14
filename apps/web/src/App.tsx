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
const LoginPage = lazy(() => import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const VerifyEmailPage = lazy(() =>
  import("@/pages/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage }))
);
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const HojePage = lazy(() => import("@/pages/hoje/HojePage").then((m) => ({ default: m.HojePage })));
const TarefasPage = lazy(() => import("@/pages/tarefas/TarefasPage").then((m) => ({ default: m.TarefasPage })));
const ProjetosPage = lazy(() => import("@/pages/projetos/ProjetosPage").then((m) => ({ default: m.ProjetosPage })));
const InboxPage = lazy(() => import("@/pages/inbox/InboxPage").then((m) => ({ default: m.InboxPage })));
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
const FocoPage = lazy(() => import("@/pages/foco/FocoPage").then((m) => ({ default: m.FocoPage })));
const ConquistasPage = lazy(() =>
  import("@/pages/conquistas/ConquistasPage").then((m) => ({ default: m.ConquistasPage }))
);
const AnalyticsPage = lazy(() => import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
const TimelinePage = lazy(() => import("@/pages/timeline/TimelinePage").then((m) => ({ default: m.TimelinePage })));
const WeeklyReviewPage = lazy(() =>
  import("@/pages/weekly-review/WeeklyReviewPage").then((m) => ({ default: m.WeeklyReviewPage }))
);

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/verificar-email" element={<VerifyEmailPage />} />

        <Route element={<ProtectedRoutes />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/hoje" element={<HojePage />} />
          <Route path="/tarefas" element={<TarefasPage />} />
          <Route path="/projetos" element={<ProjetosPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/calendario" element={<CalendarioPage />} />
          <Route path="/foco" element={<FocoPage />} />
          <Route path="/biblioteca" element={<BibliotecaPage />} />
          <Route path="/biblioteca/:id" element={<LivroDetalhePage />} />
          <Route path="/educacao" element={<EducacaoPage />} />
          <Route path="/educacao/:id" element={<FormacaoDetalhePage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/habitos" element={<HabitosPage />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/conquistas" element={<ConquistasPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/weekly-review" element={<WeeklyReviewPage />} />
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
