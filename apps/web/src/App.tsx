import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { HojePage } from "@/pages/hoje/HojePage";
import { TarefasPage } from "@/pages/tarefas/TarefasPage";
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
        <Route
          path="/biblioteca"
          element={
            <EmptyState
              title="Sua estante está vazia"
              description="Cadastre um livro pelo ISBN ou pelo título para começar a registrar sua leitura."
              ctaLabel="Adicionar meu primeiro livro"
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
