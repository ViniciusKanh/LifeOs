import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { researchService, type PaperPatch, type ReviewFields } from "@/services/researchService";

export const RESEARCH_KEY = ["research"] as const;

export function useResearchHub() {
  return useQuery({ queryKey: [...RESEARCH_KEY, "hub"], queryFn: researchService.hub, staleTime: 30_000 });
}
export function useResearchPapers(filters: Record<string, string | undefined>) {
  return useQuery({ queryKey: [...RESEARCH_KEY, "papers", filters], queryFn: () => researchService.papers(filters), staleTime: 15_000, placeholderData: (p) => p });
}
export function usePaperDetail(id: string | null) {
  return useQuery({ queryKey: [...RESEARCH_KEY, "paper", id], queryFn: () => researchService.detail(id!), enabled: !!id });
}
export function useRelated(id: string | null, kind: "related" | "references" | "citing") {
  return useQuery({ queryKey: [...RESEARCH_KEY, "related", id, kind], queryFn: () => researchService.related(id!, kind), enabled: !!id, staleTime: 10 * 60_000, retry: false });
}

export function useResearchActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: RESEARCH_KEY });
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  return {
    save: useMutation({ mutationFn: researchService.save, onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...p }: PaperPatch & { id: string }) => researchService.update(id, p), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => researchService.remove(id), onSuccess: refresh }),
    review: useMutation({ mutationFn: ({ id, fields }: { id: string; fields: ReviewFields }) => researchService.saveReview(id, fields) }),
    addQuote: useMutation({ mutationFn: ({ id, ...q }: { id: string; text: string; page?: string | null; comment?: string | null }) => researchService.addQuote(id, q), onSuccess: refresh }),
    removeQuote: useMutation({ mutationFn: (quoteId: string) => researchService.removeQuote(quoteId), onSuccess: refresh }),
    task: useMutation({ mutationFn: (id: string) => researchService.readingTask(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }) }),
    createCategory: useMutation({ mutationFn: (name: string) => researchService.createCategory(name), onSuccess: refresh }),
    renameCategory: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => researchService.renameCategory(id, name), onSuccess: refresh }),
    deleteCategory: useMutation({ mutationFn: (id: string) => researchService.deleteCategory(id), onSuccess: refresh }),
    settings: useMutation({ mutationFn: researchService.settings, onSuccess: refresh }),
  };
}
