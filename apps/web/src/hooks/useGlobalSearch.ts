import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchService } from "@/services/searchService";

/**
 * Busca global do topo do app — antes um <input> decorativo sem
 * nenhuma lógica. Debounce simples (250ms) pra não disparar uma
 * requisição a cada tecla; só busca de verdade a partir de 2
 * caracteres (o backend também valida isso).
 */
export function useGlobalSearch(query: string) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = debounced.trim();

  const { data, isFetching } = useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => searchService.search(trimmed),
    enabled: trimmed.length >= 2,
  });

  return {
    results: trimmed.length >= 2 ? (data ?? []) : [],
    isSearching: trimmed.length >= 2 && isFetching,
  };
}
