import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { HojePage } from "@/pages/hoje/HojePage";
import { TarefasPage } from "@/pages/tarefas/TarefasPage";
import { BibliotecaPage } from "@/pages/biblioteca/BibliotecaPage";
import { LivroDetalhePage } from "@/pages/biblioteca/LivroDetalhePage";
import { EducacaoPage } from "@/pages/educacao/EducacaoPage";
import { FormacaoDetalhePage } from "@/pages/educacao/FormacaoDetalhePage";
import { PerfilPage } from "@/pages/perfil/PerfilPage";
import { ConfiguracoesPage } from "@/pages/admin/ConfiguracoesPage";
import { AdminUsuariosPage } from "@/pages/admin/AdminUsuariosPage";
import { SaudePage } from "@/pages/saude/SaudePage";
import { HabitosPage } from "@/pages/habitos/HabitosPage";
import { MetasPage } from "@/pages/metas/MetasPage";
import { FocoPage } from "@/pages/foco/FocoPage";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { TimelinePage } from "@/pages/timeline/TimelinePage";
import { WeeklyReviewPage } from "@/pages/weekly-review/WeeklyReviewPage";
import { EmptyState } from "@/components/ui/primitives";

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoutes />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/hoje" element={<HojePage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route path="/foco" element={<FocoPage />} />
        <Route path="/biblioteca" element={<BibliotecaPage />} />
        <Route path="/biblioteca/:id" element={<LivroDetalhePage />} />
        <Route path="/educacao" element={<EducacaoPage />} />
        <Route path="/educacao/:id" element={<FormacaoDetalhePage />} />
        <Route path="/saude" element={<SaudePage />} />
        <Route path="/habitos" element={<HabitosPage />} />
        <Route path="/metas" element={<MetasPage />} />
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
  );
}
