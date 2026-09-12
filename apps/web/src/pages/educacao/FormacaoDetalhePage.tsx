import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEducation, useSubjects } from "@/hooks/useEducations";
import { Button, Card, Field } from "@/components/ui/primitives";
import type { Course, Subject } from "@/types";

const SUBJECT_STATUS: Subject["status"][] = ["Planejada", "Em andamento", "Concluída", "Trancada"];

export function FormacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { education, courses, createCourse, removeCourse } = useEducation(id);
  const [newCourseName, setNewCourseName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!education) {
    return <div className="px-4 py-8 text-sm text-slate">Carregando...</div>;
  }

  const handleAddCourse = async () => {
    if (!newCourseName.trim()) return;
    await createCourse({ name: newCourseName.trim() });
    setNewCourseName("");
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl mx-auto">
      <button onClick={() => navigate("/educacao")} className="flex items-center gap-1.5 text-xs text-slate mb-4">
        <ArrowLeft size={14} /> Voltar para Educação
      </button>

      <p className="font-display font-medium text-2xl">{education.course_name}</p>
      {education.institution && <p className="text-sm text-slate mt-1">{education.institution}</p>}

      <div className="flex gap-2 mt-5 mb-6">
        <input
          value={newCourseName}
          onChange={(e) => setNewCourseName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCourse()}
          placeholder="Novo período/curso (ex: 2026/2)"
          className="flex-1 rounded-lg px-3 py-2 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border"
        />
        <Button onClick={handleAddCourse}>
          <Plus size={14} /> Adicionar
        </Button>
      </div>

      <div className="space-y-3">
        {courses.map((course) => (
          <CourseBlock
            key={course.id}
            course={course}
            expanded={expanded === course.id}
            onToggle={() => setExpanded(expanded === course.id ? null : course.id)}
            onRemove={() => removeCourse(course.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CourseBlock({
  course,
  expanded,
  onToggle,
  onRemove,
}: {
  course: Course;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { subjects, createSubject, updateSubject, removeSubject } = useSubjects(course.id);
  const [subjectName, setSubjectName] = useState("");

  const handleAddSubject = async () => {
    if (!subjectName.trim()) return;
    await createSubject({ name: subjectName.trim() });
    setSubjectName("");
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="flex items-center gap-2 text-sm font-semibold">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {course.name}
          {course.semester && <span className="text-xs text-slate font-normal">· {course.semester}</span>}
        </button>
        <button onClick={onRemove} className="text-slate">
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {subjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg p-2.5 border border-paper-border dark:border-ink-border"
            >
              <div className="min-w-0">
                <p className="text-sm">{s.name}</p>
                {s.professor && <p className="text-xs text-slate">{s.professor}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={s.status}
                  onChange={(e) => updateSubject({ id: s.id, patch: { status: e.target.value } })}
                  className="text-xs rounded-lg px-2 py-1.5 bg-transparent border border-paper-border dark:border-ink-border"
                >
                  {SUBJECT_STATUS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeSubject(s.id)} className="text-slate">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Field label="" placeholder="Nova disciplina..." value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            <Button variant="secondary" onClick={handleAddSubject} className="self-end">
              <Plus size={14} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
