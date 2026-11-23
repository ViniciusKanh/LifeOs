import { api } from "./api";

/** Biblioteca do Mestrado (/api/research) — tipos espelham researchLibraryService.ts da API. */
export type PaperStatus = "para_ler" | "lendo" | "lido" | "fichado";
export type PaperPriority = "baixa" | "media" | "alta";
export interface PaperAuthor {
  name: string;
  given: string | null;
  family: string | null;
}
export interface PaperMeta {
  doi: string;
  openalexId: string | null;
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  abstract: string | null;
  keywords: string[];
  citedBy: number | null;
  citedBySource: string | null;
  url: string | null;
  oaUrl: string | null;
  type: string | null;
  sources: string[];
}
export type PaperOverrides = Partial<Pick<PaperMeta, "title" | "authors" | "year" | "venue" | "volume" | "issue" | "pages" | "publisher" | "abstract" | "url">>;
export interface LibraryPaper extends Omit<PaperMeta, "doi"> {
  id: string;
  paperId: string;
  doi: string | null;
  citedByAt: string | null;
  overrides: string[];
  academicProjectId: string | null;
  projectTitle: string | null;
  categoryId: string | null;
  categoryName: string | null;
  chapter: string | null;
  status: PaperStatus;
  priority: PaperPriority;
  progress: number;
  favorite: boolean;
  tags: string[];
  notes: string | null;
  position: number;
  quotesCount: number;
  hasReview: boolean;
  readAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export const REVIEW_FIELDS = [
  ["problema", "Problema de pesquisa"],
  ["objetivo", "Objetivo do artigo"],
  ["fundamentacao", "Fundamentação teórica"],
  ["metodologia", "Metodologia"],
  ["base_dados", "Base de dados"],
  ["experimentos", "Experimentos realizados"],
  ["resultados", "Principais resultados"],
  ["contribuicoes", "Contribuições"],
  ["limitacoes", "Limitações"],
  ["trabalhos_futuros", "Trabalhos futuros"],
  ["relacao_pesquisa", "Relação com minha pesquisa"],
  ["notas_pessoais", "Notas pessoais"],
] as const;
export type ReviewKey = (typeof REVIEW_FIELDS)[number][0];
export type ReviewFields = Partial<Record<ReviewKey, string>>;
export interface PaperQuote {
  id: string;
  text: string;
  page: string | null;
  comment: string | null;
  createdAt: string;
}
export interface PaperDetail {
  paper: LibraryPaper;
  review: { fields: ReviewFields; updatedAt: string | null };
  quotes: PaperQuote[];
  history: Array<{ field: string; oldValue: string | null; newValue: string | null; at: string }>;
}
export interface ReadingCategory {
  id: string;
  name: string;
  position: number;
}
export interface LibraryHub {
  categories: ReadingCategory[];
  stats: {
    saved: number;
    byStatus: Record<PaperStatus, number>;
    read: number;
    reviewed: number;
    pending: number;
    progressPct: number;
    citations: { total: number; papersWithData: number; sources: string[]; updatedAt: string | null };
    byCategory: Array<{ categoryId: string | null; total: number; done: number }>;
    weekly: { read: number; goal: number };
    settings: { weeklyGoal: number; activeProjectId: string | null };
  };
  projects: Array<{ id: string; title: string; kind: string; defenseDate: string | null; progressPct: number }>;
}
export interface RelatedItem {
  openalexId: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  citedBy: number | null;
  savedId: string | null;
}
export type RelationKind = "related" | "references" | "citing";
export type CitationFormat = "abnt" | "apa" | "bibtex" | "ris";
export interface PaperPatch {
  status?: PaperStatus;
  priority?: PaperPriority;
  progress?: number;
  favorite?: boolean;
  tags?: string[];
  notes?: string | null;
  categoryId?: string | null;
  academicProjectId?: string | null;
  chapter?: string | null;
  position?: number;
  overrides?: PaperOverrides;
}

export const researchService = {
  hub: () => api.get<LibraryHub>("/research"),
  papers: (f: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    return api.get<LibraryPaper[]>(`/research/papers?${p.toString()}`);
  },
  previewDoi: (doi: string) => api.get<PaperMeta & { savedId: string | null }>(`/research/doi?doi=${encodeURIComponent(doi)}`),
  save: (body: { doi: string; overrides?: PaperOverrides; academicProjectId?: string | null; categoryId?: string | null; status?: PaperStatus; priority?: PaperPriority }) => api.post<LibraryPaper>("/research/papers", body),
  detail: (id: string) => api.get<PaperDetail>(`/research/papers/${id}`),
  update: (id: string, patch: PaperPatch) => api.patch<LibraryPaper>(`/research/papers/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/research/papers/${id}`),
  saveReview: (id: string, fields: ReviewFields) => api.put<{ fields: ReviewFields; updatedAt: string }>(`/research/papers/${id}/review`, fields),
  addQuote: (id: string, q: { text: string; page?: string | null; comment?: string | null }) => api.post<PaperQuote>(`/research/papers/${id}/quotes`, q),
  removeQuote: (quoteId: string) => api.delete<void>(`/research/quotes/${quoteId}`),
  related: (id: string, kind: RelationKind) => api.get<{ kind: RelationKind; proven: boolean; items: RelatedItem[] }>(`/research/papers/${id}/related?kind=${kind}`),
  readingTask: (id: string) => api.post<unknown>(`/research/papers/${id}/task`),
  exportRefs: (format: CitationFormat, ids: string[] | null) => api.post<{ format: CitationFormat; count: number; text: string }>("/research/export", { format, ids }),
  createCategory: (name: string) => api.post<ReadingCategory>("/research/categories", { name }),
  renameCategory: (id: string, name: string) => api.patch<void>(`/research/categories/${id}`, { name }),
  deleteCategory: (id: string) => api.delete<void>(`/research/categories/${id}`),
  settings: (p: { weeklyGoal?: number; activeProjectId?: string | null }) => api.put<{ weeklyGoal: number; activeProjectId: string | null }>("/research/settings", p),
};
