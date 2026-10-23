import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { copilotService } from "@/services/copilotService";

/** Evento global que abre a paleta (o app desktop dispara via atalho global do sistema). */
export const OPEN_PALETTE_EVENT = "lifeos:open-palette";

export interface OpenPaletteDetail {
  /** Texto inicial opcional (ex.: captura vinda de outro ponto do app). */
  text?: string;
}

/** Abre a paleta de qualquer lugar do app sem acoplar componentes. */
export function openCommandPalette(detail: OpenPaletteDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, { detail }));
}

/**
 * Estado de abertura da paleta: Ctrl/Cmd+K (alterna), evento
 * "lifeos:open-palette" e ?captura=1 na URL (o parâmetro é removido
 * depois de usado para não reabrir ao navegar/recarregar).
 */
export function useCommandPaletteState() {
  const [open, setOpen] = useState(false);
  const [initialText, setInitialText] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const show = useCallback((text = "") => {
    setInitialText(text);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setInitialText("");
          return !o;
        });
      }
    };
    const onOpen = (e: Event) => show((e as CustomEvent<OpenPaletteDetail | undefined>).detail?.text ?? "");
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [show]);

  useEffect(() => {
    if (searchParams.get("captura") !== "1") return;
    show(searchParams.get("texto") ?? "");
    const next = new URLSearchParams(searchParams);
    next.delete("captura");
    next.delete("texto");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, show]);

  return { open, initialText, show, close };
}

/** Debounce simples de um valor. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Prévia instantânea de comando rápido (parser local do backend, sem IA):
 * "bebi 500ml" → proposta de registro de água. Nunca grava nada.
 */
export function useLocalCommandPreview(text: string, enabled: boolean) {
  const debounced = useDebounced(text.trim(), 220);
  const active = enabled && debounced.length >= 3;
  const query = useQuery({
    queryKey: ["copilot", "parse", debounced],
    queryFn: () => copilotService.parse(debounced),
    enabled: active,
    staleTime: 30_000,
    retry: false,
  });
  // Enquanto o debounce não alcança o texto atual, a prévia antiga não vale.
  const settled = debounced === text.trim();
  return {
    preview: active && settled ? query.data ?? null : null,
    isParsing: active && (query.isFetching || !settled),
  };
}

/** Minúsculas sem acento — filtro de telas por texto. */
export function foldText(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
