import { api } from "./api";
import type { NoteDetail, NoteKind, NoteLinkType, NoteSummary } from "@/types";

export interface NoteInput {
  title: string;
  content?: string | null;
  kind?: NoteKind;
  tags?: string[];
  sourceUrl?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export const notesService = {
  list: (params: { q?: string; kind?: NoteKind; tag?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.kind) qs.set("kind", params.kind);
    if (params.tag) qs.set("tag", params.tag);
    const s = qs.toString();
    return api.get<NoteSummary[]>(`/notes${s ? `?${s}` : ""}`);
  },
  get: (id: string) => api.get<NoteDetail>(`/notes/${id}`),
  create: (input: NoteInput) => api.post<NoteDetail>("/notes", input),
  update: (id: string, patch: Partial<NoteInput>) => api.patch<NoteDetail>(`/notes/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/notes/${id}`),
  addLink: (id: string, targetType: NoteLinkType, targetId: string) => api.post<NoteDetail>(`/notes/${id}/links`, { targetType, targetId }),
  removeLink: (id: string, linkId: string) => api.delete<NoteDetail>(`/notes/${id}/links/${linkId}`),
  linkedTo: (type: NoteLinkType, id: string) => api.get<Array<{ id: string; title: string; kind: NoteKind; updatedAt: string }>>(`/notes/linked?type=${type}&id=${encodeURIComponent(id)}`),
  targets: (type: NoteLinkType, q: string) => api.get<Array<{ id: string; label: string }>>(`/notes/targets?type=${type}&q=${encodeURIComponent(q)}`),
  graph: () => api.get<{ nodes: Array<{ id: string; title: string; kind: NoteKind }>; edges: Array<{ from: string; to: string }> }>("/notes/graph"),
};
