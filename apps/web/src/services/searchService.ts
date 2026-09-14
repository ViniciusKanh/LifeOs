import { api } from "./api";

export type GlobalSearchResult = {
  id: string;
  type: "task" | "goal" | "habit" | "book" | "academic_project" | "project";
  title: string;
  subtitle: string | null;
  link: string;
  /** "semantic" = achado por significado (embeddings), não por palavra exata — só aparece quando o Gemini está configurado. */
  matchType: "text" | "semantic";
};

export const searchService = {
  search: (q: string) =>
    api.get<{ results: GlobalSearchResult[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.results),
};
