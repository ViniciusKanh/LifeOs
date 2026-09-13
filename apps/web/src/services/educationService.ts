import { api } from "./api";
import type {
  AcademicDeadline,
  AcademicProject,
  Course,
  Education,
  EducationDetail,
  EducationStats,
  SemesterChecklistItem,
  StudySession,
  Subject,
} from "@/types";

export const educationService = {
  list: () => api.get<Education[]>("/educations"),
  get: (id: string) => api.get<EducationDetail>(`/educations/${id}`),
  create: (input: Partial<Education> & { kind: Education["kind"]; course_name?: string; courseName?: string }) =>
    api.post<Education>("/educations", input),
  update: (id: string, patch: Record<string, unknown>) => api.patch<Education>(`/educations/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/educations/${id}`),

  listCourses: (educationId: string) => api.get<Course[]>(`/educations/${educationId}/courses`),
  createCourse: (educationId: string, input: { name: string; semester?: string | null }) =>
    api.post<Course>(`/educations/${educationId}/courses`, input),
  removeCourse: (id: string) => api.delete<void>(`/courses/${id}`),

  listSubjects: (courseId: string) => api.get<Subject[]>(`/courses/${courseId}/subjects`),
  createSubject: (courseId: string, input: Record<string, unknown>) =>
    api.post<Subject>(`/courses/${courseId}/subjects`, input),
  updateSubject: (id: string, patch: Record<string, unknown>) => api.patch<Subject>(`/subjects/${id}`, patch),
  removeSubject: (id: string) => api.delete<void>(`/subjects/${id}`),

  // Visão consolidada de disciplinas (todos os períodos da formação),
  // usada no painel — evita ter que navegar período por período.
  listEducationSubjects: (educationId: string) => api.get<Subject[]>(`/educations/${educationId}/subjects`),
  quickCreateSubject: (educationId: string, input: { name: string; professor?: string | null; status?: Subject["status"] }) =>
    api.post<Subject>(`/educations/${educationId}/subjects`, input),

  listDeadlines: (educationId: string) => api.get<AcademicDeadline[]>(`/educations/${educationId}/deadlines`),
  createDeadline: (educationId: string, input: { title: string; dueDate: string; subjectId?: string | null }) =>
    api.post<AcademicDeadline>(`/educations/${educationId}/deadlines`, input),
  updateDeadline: (id: string, patch: { title?: string; dueDate?: string; subjectId?: string | null; done?: boolean }) =>
    api.patch<AcademicDeadline>(`/deadlines/${id}`, patch),
  removeDeadline: (id: string) => api.delete<void>(`/deadlines/${id}`),

  createStudySession: (educationId: string, input: { occurredAt: string; durationMinutes: number; subjectId?: string | null }) =>
    api.post<StudySession>(`/educations/${educationId}/study-sessions`, input),

  listChecklist: (educationId: string) => api.get<SemesterChecklistItem[]>(`/educations/${educationId}/checklist`),
  createChecklistItem: (educationId: string, input: { title: string; dueDate?: string | null }) =>
    api.post<SemesterChecklistItem>(`/educations/${educationId}/checklist`, input),
  updateChecklistItem: (id: string, patch: { title?: string; dueDate?: string | null; done?: boolean; position?: number }) =>
    api.patch<SemesterChecklistItem>(`/checklist/${id}`, patch),
  removeChecklistItem: (id: string) => api.delete<void>(`/checklist/${id}`),

  getStats: (educationId: string) => api.get<EducationStats>(`/educations/${educationId}/stats`),

  listAcademicProjects: () => api.get<AcademicProject[]>("/academic-projects"),
  createAcademicProject: (input: Record<string, unknown>) => api.post<AcademicProject>("/academic-projects", input),
  updateAcademicProject: (id: string, patch: Record<string, unknown>) =>
    api.patch<AcademicProject>(`/academic-projects/${id}`, patch),
  removeAcademicProject: (id: string) => api.delete<void>(`/academic-projects/${id}`),
};
