import { useNavigate, useParams } from "react-router-dom";
import { EducationDashboard } from "./EducationDashboard";

/**
 * Página de detalhe de uma formação específica (/educacao/:id) — só
 * resolve o id da URL e delega todo o painel para EducationDashboard,
 * o mesmo componente usado na tela principal de Educação para a
 * formação em destaque. Nada de lógica duplicada entre as duas.
 */
export function FormacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return <div className="px-4 py-8 text-sm text-slate">Formação não encontrada.</div>;
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <EducationDashboard educationId={id} onBack={() => navigate("/educacao")} />
    </div>
  );
}
