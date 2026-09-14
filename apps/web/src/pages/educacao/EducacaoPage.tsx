import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useEducations } from "@/hooks/useEducations";
import { Button, EmptyState, Field } from "@/components/ui/primitives";
import { EducationDashboard } from "./EducationDashboard";
import type { EducationKind, EducationPhase } from "@/types";

const KIND_LABEL: Record<EducationKind, string> = {
  graduacao: "Graduação",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado: "Doutorado",
  curso_online: "Curso online",
  certificacao: "Certificação",
  curso_livre: "Curso livre",
};

// Fase calculada no backend a partir de dados reais (disciplinas em
// andamento, projetos acadêmicos em aberto, progresso) — diferencia
// se o usuário está cursando disciplinas ou já só em fase de
// projeto/TCC/dissertação, como pedido.
export const PHASE_LABEL: Record<EducationPhase, string> = {
  cursando_disciplinas: "Em período de aulas",
  fase_projeto: "Fase de projeto/TCC",
  concluida: "Concluída",
  sem_atividade: "Sem atividade recente",
};

export const PHASE_COLOR: Record<EducationPhase, string> = {
  cursando_disciplinas: "#2E7D6B",
  fase_projeto: "#C9821E",
  concluida: "#5B6B7A",
  sem_atividade: "#8A93A0",
};

export function PhaseBadge({ phase }: { phase: EducationPhase }) {
  return (
    <span
      className="text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={{ color: PHASE_COLOR[phase], background: `${PHASE_COLOR[phase]}1A` }}
    >
      {PHASE_LABEL[phase]}
    </span>
  );
}

export function EducacaoPage() {
  const { educations, isLoading, createEducation } = useEducations();
  const [modalOpen, setModalOpen] = useState(false);

  // Formação em destaque no painel: a primeira ainda ativa (não
  // concluída); se todas estiverem concluídas, cai na mais recente.
  // Sempre real — nunca uma escolha aleatória — e trocável pelas
  // abas quando o usuário tem mais de uma formação cadastrada.
  const sortedEducations = useMemo(
    () => [...educations].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    [educations]
  );
  const defaultEducation = sortedEducations.find((e) => e.phase !== "concluida") ?? sortedEducations[0];
  const [activeId, setActiveId] = useState<string | null>(null);

  // Se a formação selecionada foi excluída (ex.: via "Excluir
  // formação" dentro do painel), volta pra formação em destaque em
  // vez de tentar renderizar um painel que já não existe mais.
  useEffect(() => {
    if (activeId && !isLoading && !educations.some((e) => e.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, educations, isLoading]);

  const activeEducationId = activeId ?? defaultEducation?.id ?? null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <p className="font-display font-bold text-2xl">Educação</p>
          <p className="text-sm text-slate mt-0.5">Organize seus estudos, disciplinas, projetos e prazos em um só lugar.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Nova formação
        </Button>
      </div>

      {!isLoading && educations.length === 0 && (
        <EmptyState
          title="Nenhuma formação cadastrada"
          description="Adicione sua graduação, pós-graduação, mestrado ou um curso para acompanhar disciplinas e progresso."
          ctaLabel="Nova formação"
          onCta={() => setModalOpen(true)}
        />
      )}

      {sortedEducations.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {sortedEducations.map((edu) => (
            <button
              key={edu.id}
              onClick={() => setActiveId(edu.id)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                edu.id === activeEducationId
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "border-paper-border dark:border-ink-border text-slate hover:bg-paper dark:hover:bg-ink-overlay"
              }`}
            >
              {edu.course_name}
            </button>
          ))}
        </div>
      )}

      {activeEducationId && <EducationDashboard educationId={activeEducationId} />}

      {modalOpen && <NovaFormacaoModal onClose={() => setModalOpen(false)} onCreate={createEducation} />}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 md:p-6 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NovaFormacaoModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { kind: EducationKind; courseName: string; institution?: string | null }) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<EducationKind>("mestrado");
  const [courseName, setCourseName] = useState("");
  const [institution, setInstitution] = useState("");

  const handleSubmit = async () => {
    if (!courseName.trim()) return;
    await onCreate({ kind, courseName: courseName.trim(), institution: institution.trim() || null });
    onClose();
  };

  return (
    <ModalShell title="Nova formação" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate">Tipo</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EducationKind)}
            className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
          >
            {Object.entries(KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Nome do curso/formação" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
        <Field label="Instituição" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        <Button onClick={handleSubmit} disabled={!courseName.trim()} className="w-full">
          Adicionar
        </Button>
      </div>
    </ModalShell>
  );
}
