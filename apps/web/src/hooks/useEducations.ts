import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { educationService } from "@/services/educationService";

const EDUCATIONS_KEY = ["educations"];
const educationKey = (id: string) => ["educations", id];
const coursesKey = (educationId: string) => ["educations", educationId, "courses"];
const subjectsKey = (courseId: string) => ["courses", courseId, "subjects"];
const ACADEMIC_PROJECTS_KEY = ["academic-projects"];
const educationSubjectsKey = (educationId: string) => ["educations", educationId, "subjects"];
const deadlinesKey = (educationId: string) => ["educations", educationId, "deadlines"];
const checklistKey = (educationId: string) => ["educations", educationId, "checklist"];
const statsKey = (educationId: string) => ["educations", educationId, "stats"];

export function useEducations() {
  const queryClient = useQueryClient();

  const educationsQuery = useQuery({ queryKey: EDUCATIONS_KEY, queryFn: educationService.list });

  const createEducation = useMutation({
    mutationFn: educationService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EDUCATIONS_KEY }),
  });

  const updateEducation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => educationService.update(id, patch),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: EDUCATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: educationKey(vars.id) });
    },
  });

  const removeEducation = useMutation({
    mutationFn: educationService.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EDUCATIONS_KEY }),
  });

  return {
    educations: educationsQuery.data ?? [],
    isLoading: educationsQuery.isLoading,
    createEducation: createEducation.mutateAsync,
    updateEducation: updateEducation.mutate,
    removeEducation: removeEducation.mutateAsync,
  };
}

export function useEducation(id: string | undefined) {
  const queryClient = useQueryClient();

  const educationQuery = useQuery({
    queryKey: id ? educationKey(id) : ["educations", "none"],
    queryFn: () => educationService.get(id as string),
    enabled: !!id,
  });

  const coursesQuery = useQuery({
    queryKey: id ? coursesKey(id) : ["educations", "none", "courses"],
    queryFn: () => educationService.listCourses(id as string),
    enabled: !!id,
  });

  const createCourse = useMutation({
    mutationFn: (input: { name: string; semester?: string | null }) => educationService.createCourse(id as string, input),
    onSuccess: () => id && queryClient.invalidateQueries({ queryKey: coursesKey(id) }),
  });

  const removeCourse = useMutation({
    mutationFn: (courseId: string) => educationService.removeCourse(courseId),
    onSuccess: () => id && queryClient.invalidateQueries({ queryKey: coursesKey(id) }),
  });

  return {
    education: educationQuery.data,
    isLoading: educationQuery.isLoading,
    courses: coursesQuery.data ?? [],
    createCourse: createCourse.mutateAsync,
    removeCourse: removeCourse.mutateAsync,
  };
}

export function useSubjects(courseId: string | undefined) {
  const queryClient = useQueryClient();

  const subjectsQuery = useQuery({
    queryKey: courseId ? subjectsKey(courseId) : ["courses", "none", "subjects"],
    queryFn: () => educationService.listSubjects(courseId as string),
    enabled: !!courseId,
  });

  const createSubject = useMutation({
    mutationFn: (input: Record<string, unknown>) => educationService.createSubject(courseId as string, input),
    onSuccess: () => courseId && queryClient.invalidateQueries({ queryKey: subjectsKey(courseId) }),
  });

  const updateSubject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => educationService.updateSubject(id, patch),
    onSuccess: () => courseId && queryClient.invalidateQueries({ queryKey: subjectsKey(courseId) }),
  });

  const removeSubject = useMutation({
    mutationFn: (subjectId: string) => educationService.removeSubject(subjectId),
    onSuccess: () => courseId && queryClient.invalidateQueries({ queryKey: subjectsKey(courseId) }),
  });

  return {
    subjects: subjectsQuery.data ?? [],
    isLoading: subjectsQuery.isLoading,
    createSubject: createSubject.mutateAsync,
    updateSubject: updateSubject.mutateAsync,
    removeSubject: removeSubject.mutateAsync,
  };
}

export function useAcademicProjects() {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({ queryKey: ACADEMIC_PROJECTS_KEY, queryFn: educationService.listAcademicProjects });

  // O painel de Educação (useEducation) mostra academicProjects
  // embutido dentro da própria formação, não a partir desta query —
  // por isso toda mutação aqui precisa invalidar também EDUCATIONS_KEY
  // (invalida por prefixo: pega tanto a lista quanto cada formação
  // individual), senão criar/editar/excluir um projeto acadêmico não
  // refletia no painel sem recarregar a página.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ACADEMIC_PROJECTS_KEY });
    queryClient.invalidateQueries({ queryKey: EDUCATIONS_KEY });
  };

  const createProject = useMutation({
    mutationFn: (input: Record<string, unknown>) => educationService.createAcademicProject(input),
    onSuccess: invalidate,
  });

  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      educationService.updateAcademicProject(id, patch),
    onSuccess: invalidate,
  });

  const removeProject = useMutation({
    mutationFn: educationService.removeAcademicProject,
    onSuccess: invalidate,
  });

  return {
    academicProjects: projectsQuery.data ?? [],
    isLoading: projectsQuery.isLoading,
    createProject: createProject.mutateAsync,
    updateProject: updateProject.mutate,
    removeProject: removeProject.mutateAsync,
  };
}

/**
 * Alimenta o painel completo de uma formação (dashboard): disciplinas
 * consolidadas, prazos, checklist do semestre e os indicadores em
 * "stats" — tudo real, vindo do backend. Usado pela nova
 * FormacaoDetalhePage, sem duplicar a lógica de useEducation/useSubjects
 * já usada pela seção de períodos/kanban mais abaixo na mesma página.
 */
export function useEducationDashboard(educationId: string | undefined) {
  const queryClient = useQueryClient();
  const id = educationId as string;

  const subjectsQuery = useQuery({
    queryKey: educationId ? educationSubjectsKey(id) : ["educations", "none", "subjects"],
    queryFn: () => educationService.listEducationSubjects(id),
    enabled: !!educationId,
  });

  const deadlinesQuery = useQuery({
    queryKey: educationId ? deadlinesKey(id) : ["educations", "none", "deadlines"],
    queryFn: () => educationService.listDeadlines(id),
    enabled: !!educationId,
  });

  const checklistQuery = useQuery({
    queryKey: educationId ? checklistKey(id) : ["educations", "none", "checklist"],
    queryFn: () => educationService.listChecklist(id),
    enabled: !!educationId,
  });

  const statsQuery = useQuery({
    queryKey: educationId ? statsKey(id) : ["educations", "none", "stats"],
    queryFn: () => educationService.getStats(id),
    enabled: !!educationId,
  });

  const invalidateSubjects = () => educationId && queryClient.invalidateQueries({ queryKey: educationSubjectsKey(id) });
  const invalidateStats = () => educationId && queryClient.invalidateQueries({ queryKey: statsKey(id) });

  const quickCreateSubject = useMutation({
    mutationFn: (input: { name: string; professor?: string | null }) => educationService.quickCreateSubject(id, input),
    onSuccess: () => {
      invalidateSubjects();
      invalidateStats();
    },
  });

  const updateSubjectProgress = useMutation({
    mutationFn: ({ subjectId, patch }: { subjectId: string; patch: Record<string, unknown> }) =>
      educationService.updateSubject(subjectId, patch),
    onSuccess: () => {
      invalidateSubjects();
      invalidateStats();
    },
  });

  const createDeadline = useMutation({
    mutationFn: (input: { title: string; dueDate: string; subjectId?: string | null }) => educationService.createDeadline(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlinesKey(id) });
      invalidateStats();
    },
  });

  const updateDeadline = useMutation({
    mutationFn: ({ deadlineId, patch }: { deadlineId: string; patch: Record<string, unknown> }) =>
      educationService.updateDeadline(deadlineId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlinesKey(id) });
      invalidateStats();
    },
  });

  const removeDeadline = useMutation({
    mutationFn: (deadlineId: string) => educationService.removeDeadline(deadlineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlinesKey(id) });
      invalidateStats();
    },
  });

  const logStudySession = useMutation({
    mutationFn: (input: { occurredAt: string; durationMinutes: number; subjectId?: string | null }) =>
      educationService.createStudySession(id, input),
    onSuccess: invalidateStats,
  });

  const createChecklistItem = useMutation({
    mutationFn: (input: { title: string; dueDate?: string | null }) => educationService.createChecklistItem(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checklistKey(id) }),
  });

  const updateChecklistItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Record<string, unknown> }) =>
      educationService.updateChecklistItem(itemId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checklistKey(id) }),
  });

  const removeChecklistItem = useMutation({
    mutationFn: (itemId: string) => educationService.removeChecklistItem(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checklistKey(id) }),
  });

  return {
    subjects: subjectsQuery.data ?? [],
    deadlines: deadlinesQuery.data ?? [],
    checklist: checklistQuery.data ?? [],
    stats: statsQuery.data ?? null,
    isLoading: subjectsQuery.isLoading || statsQuery.isLoading,
    quickCreateSubject: quickCreateSubject.mutateAsync,
    updateSubjectProgress: updateSubjectProgress.mutateAsync,
    createDeadline: createDeadline.mutateAsync,
    updateDeadline: updateDeadline.mutateAsync,
    removeDeadline: removeDeadline.mutateAsync,
    logStudySession: logStudySession.mutateAsync,
    createChecklistItem: createChecklistItem.mutateAsync,
    updateChecklistItem: updateChecklistItem.mutateAsync,
    removeChecklistItem: removeChecklistItem.mutateAsync,
  };
}
