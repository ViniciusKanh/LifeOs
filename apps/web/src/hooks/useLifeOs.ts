import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lifeAdminService, type LifeAdminInput } from "@/services/lifeAdminService";
import { directionService } from "@/services/directionService";
import { notifyGamification } from "@/services/gamificationService";
import { notesService, type NoteInput } from "@/services/notesService";
import type { NoteKind, NoteLinkType, PeriodicKind } from "@/types";

/* Hooks dos módulos de "SO da vida": Administração, Direção e Notas. */

const ADMIN_KEY = ["life-admin"];

export function useLifeAdmin(includeArchived = false) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [...ADMIN_KEY, "list", includeArchived], queryFn: () => lifeAdminService.list(includeArchived) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ADMIN_KEY });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["analytics", "timeline"] });
  };
  const create = useMutation({ mutationFn: lifeAdminService.create, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<LifeAdminInput> }) => lifeAdminService.update(id, patch), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: lifeAdminService.remove, onSuccess: invalidate });
  const markDone = useMutation({
    mutationFn: ({ id, ...input }: { id: string; doneAt?: string; amount?: number | null; note?: string | null; nextDueDate?: string | null }) => lifeAdminService.markDone(id, input),
    onSuccess: () => {
      invalidate();
      // Resolver um vencimento próximo/atrasado rende XP leve (decidido no backend).
      notifyGamification();
    },
  });
  const removeHistory = useMutation({ mutationFn: ({ id, historyId }: { id: string; historyId: string }) => lifeAdminService.removeHistory(id, historyId), onSuccess: invalidate });
  return {
    items: list.data ?? [],
    isLoading: list.isLoading,
    isError: list.isError,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    markDone: markDone.mutateAsync,
    removeHistory: removeHistory.mutateAsync,
  };
}

export function useLifeAdminItem(id: string | null) {
  return useQuery({ queryKey: [...ADMIN_KEY, "item", id], queryFn: () => lifeAdminService.get(id!), enabled: !!id });
}

export function useLifeAdminSummary() {
  return useQuery({ queryKey: [...ADMIN_KEY, "summary"], queryFn: lifeAdminService.summary });
}

const DIRECTION_KEY = ["direction"];

export function useDirection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: DIRECTION_KEY, queryFn: directionService.overview });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: DIRECTION_KEY });
    qc.invalidateQueries({ queryKey: ["lifemap"] });
  };
  const saveVision = useMutation({ mutationFn: directionService.saveVision, onSuccess: invalidate });
  const saveWheel = useMutation({ mutationFn: directionService.saveWheel, onSuccess: invalidate });
  return {
    data: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
    saveVision: saveVision.mutateAsync,
    isSavingVision: saveVision.isPending,
    saveWheel: saveWheel.mutateAsync,
    isSavingWheel: saveWheel.isPending,
  };
}

export function useWhy(type: "task" | "project" | "goal", id: string | null | undefined) {
  return useQuery({ queryKey: [...DIRECTION_KEY, "why", type, id], queryFn: () => directionService.why(type, id!), enabled: !!id });
}

export function usePeriodicReview(kind: PeriodicKind, key: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...DIRECTION_KEY, "review", kind, key], queryFn: () => directionService.review(kind, key) });
  const history = useQuery({ queryKey: [...DIRECTION_KEY, "reviews", kind], queryFn: () => directionService.reviews(kind) });
  const save = useMutation({
    mutationFn: (input: Parameters<typeof directionService.saveReview>[2]) => directionService.saveReview(kind, key, input),
    onSuccess: (data) => {
      qc.setQueryData([...DIRECTION_KEY, "review", kind, key], data);
      qc.invalidateQueries({ queryKey: [...DIRECTION_KEY, "reviews"] });
      qc.invalidateQueries({ queryKey: ["analytics", "timeline"] });
      // Fechar o ciclo pode render XP (uma vez por período, decidido no backend).
      notifyGamification();
    },
  });
  const analyze = useMutation({ mutationFn: () => directionService.analyzeReview(kind, key) });
  return {
    review: q.data ?? null,
    isLoading: q.isLoading,
    history: history.data ?? [],
    save: save.mutateAsync,
    isSaving: save.isPending,
    analyze: analyze.mutateAsync,
    analysis: analyze.data ?? null,
    isAnalyzing: analyze.isPending,
    analyzeError: analyze.error as Error | null,
    resetAnalysis: analyze.reset,
  };
}

const NOTES_KEY = ["notes"];

export function useNotes(params: { q?: string; kind?: NoteKind; tag?: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [...NOTES_KEY, "list", params], queryFn: () => notesService.list(params) });
  const invalidate = () => qc.invalidateQueries({ queryKey: NOTES_KEY });
  const create = useMutation({ mutationFn: notesService.create, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: notesService.remove, onSuccess: invalidate });
  return { notes: list.data ?? [], isLoading: list.isLoading, isError: list.isError, create: create.mutateAsync, remove: remove.mutateAsync };
}

export function useNote(id: string | null) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...NOTES_KEY, "item", id], queryFn: () => notesService.get(id!), enabled: !!id });
  const setData = (data: Awaited<ReturnType<typeof notesService.get>>) => {
    qc.setQueryData([...NOTES_KEY, "item", id], data);
    qc.invalidateQueries({ queryKey: [...NOTES_KEY, "list"] });
  };
  const update = useMutation({ mutationFn: (patch: Partial<NoteInput>) => notesService.update(id!, patch), onSuccess: setData });
  const addLink = useMutation({ mutationFn: ({ type, targetId }: { type: NoteLinkType; targetId: string }) => notesService.addLink(id!, type, targetId), onSuccess: setData });
  const removeLink = useMutation({ mutationFn: (linkId: string) => notesService.removeLink(id!, linkId), onSuccess: setData });
  return {
    note: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    update: update.mutateAsync,
    isSaving: update.isPending,
    addLink: addLink.mutateAsync,
    removeLink: removeLink.mutateAsync,
  };
}

export function useNotesLinkedTo(type: NoteLinkType, id: string | null | undefined) {
  return useQuery({ queryKey: [...NOTES_KEY, "linked", type, id], queryFn: () => notesService.linkedTo(type, id!), enabled: !!id });
}
