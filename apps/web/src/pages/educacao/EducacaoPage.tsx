import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Plus, X } from "lucide-react";
import { useAcademicProjects, useEducations } from "@/hooks/useEducations";
import { Button, Card, EmptyState, Field } from "@/components/ui/primitives";
import type { EducationKind } from "@/types";

const KIND_LABEL: Record<EducationKind, string> = {
  graduacao: "Graduação",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado: "Doutorado",
  curso_online: "Curso online",
  certificacao: "Certificação",
  curso_livre: "Curso livre",
};

export function EducacaoPage() {
  const { educations, isLoading, createEducation } = useEducations();
  const { academicProjects } = useAcademicProjects();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="font-display font-medium text-2xl">Educação</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {educations.map((edu) => (
          <Link key={edu.id} to={`/educacao/${edu.id}`}>
            <Card className="p-4 h-full hover:opacity-90 transition-opacity">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap size={16} className="text-slate shrink-0" />
                <span className="text-[10px] rounded-full px-2 py-0.5 border border-paper-border dark:border-ink-border text-slate">
                  {KIND_LABEL[edu.kind]}
                </span>
              </div>
              <p className="text-sm font-semibold leading-snug">{edu.course_name}</p>
              {edu.institution && <p className="text-xs text-slate mt-0.5">{edu.institution}</p>}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate mb-1">
                  <span>Progresso</span>
                  <span>{edu.progress_pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                  <div className="h-full rounded-full bg-signal" style={{ width: `${edu.progress_pct}%` }} />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {academicProjects.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3">TCC, dissertação e projetos acadêmicos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {academicProjects.map((p) => (
              <Card key={p.id} className="p-4">
                <p className="text-sm font-semibold leading-snug">{p.title}</p>
                {p.advisor && <p className="text-xs text-slate mt-0.5">Orientador(a): {p.advisor}</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate mb-1">
                    <span>Progresso</span>
                    <span>{p.progress_pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-paper-border dark:bg-ink-border">
                    <div className="h-full rounded-full bg-growth" style={{ width: `${p.progress_pct}%` }} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

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
