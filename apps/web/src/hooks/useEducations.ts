import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { educationService } from "@/services/educationService";

const EDUCATIONS_KEY = ["educations"];
const educationKey = (id: string) => ["educations", id];
const coursesKey = (educationId: string) => ["educations", educationId, "courses"];
const subjectsKey = (courseId: string) => ["courses", courseId, "subjects"];
const ACADEMIC_PROJECTS_KEY = ["academic-projects"];

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
    updateSubject: updateSubject.mutate,
    removeSubject: removeSubject.mutateAsync,
  };
}

export function useAcademicProjects() {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({ queryKey: ACADEMIC_PROJECTS_KEY, queryFn: educationService.listAcademicProjects });

  const createProject = useMutation({
    mutationFn: (input: Record<string, unknown>) => educationService.createAcademicProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMIC_PROJECTS_KEY }),
  });

  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      educationService.updateAcademicProject(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMIC_PROJECTS_KEY }),
  });

  const removeProject = useMutation({
    mutationFn: educationService.removeAcademicProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMIC_PROJECTS_KEY }),
  });

  return {
    academicProjects: projectsQuery.data ?? [],
    isLoading: projectsQuery.isLoading,
    createProject: createProject.mutateAsync,
    updateProject: updateProject.mutate,
    removeProject: removeProject.mutateAsync,
  };
}
