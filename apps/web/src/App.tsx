import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { HojePage } from "@/pages/hoje/HojePage";
import { TarefasPage } from "@/pages/tarefas/TarefasPage";
import { BibliotecaPage } from "@/pages/biblioteca/BibliotecaPage";
import { LivroDetalhePage } from "@/pages/biblioteca/LivroDetalhePage";
import { EducacaoPage } from "@/pages/educacao/EducacaoPage";
import { FormacaoDetalhePage } from "@/pages/educacao/FormacaoDetalhePage";
import { PerfilPage } from "@/pages/perfil/PerfilPage";
import { ConfiguracoesPage } from "@/pages/admin/ConfiguracoesPage";
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

      <Route element={<ProtectedRoutes />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/hoje" element={<HojePage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route
          path="/foco"
          element={
            <EmptyState
              title="Nenhuma sessão de foco hoje"
              description="Escolha um projeto e uma tarefa para começar um ciclo Pomodoro ou um cronômetro livre."
              ctaLabel="Iniciar sessão de foco"
            />
          }
        />
        <Route path="/biblioteca" element={<BibliotecaPage />} />
        <Route path="/biblioteca/:id" element={<LivroDetalhePage />} />
        <Route path="/educacao" element={<EducacaoPage />} />
        <Route path="/educacao/:id" element={<FormacaoDetalhePage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route
          path="/configuracoes"
          element={
            <AdminRoute>
              <ConfiguracoesPage />
            </AdminRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
