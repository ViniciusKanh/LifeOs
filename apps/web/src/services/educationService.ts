import { api } from "./api";
import type { AcademicProject, Course, Education, Subject } from "@/types";

export const educationService = {
  list: () => api.get<Education[]>("/educations"),
  get: (id: string) => api.get<Education>(`/educations/${id}`),
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

  listAcademicProjects: () => api.get<AcademicProject[]>("/academic-projects"),
  createAcademicProject: (input: Record<string, unknown>) => api.post<AcademicProject>("/academic-projects", input),
  updateAcademicProject: (id: string, patch: Record<string, unknown>) =>
    api.patch<AcademicProject>(`/academic-projects/${id}`, patch),
  removeAcademicProject: (id: string) => api.delete<void>(`/academic-projects/${id}`),
};
