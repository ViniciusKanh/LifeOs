import { useSyncExternalStore } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * Atualização da parte nativa do LifeOS Desktop (Tauri Updater).
 * A interface já se atualiza a cada deploy da Vercel; isto cuida só do
 * executável. O pacote vem do GitHub Releases e o Tauri recusa qualquer
 * arquivo que não esteja assinado com a chave pública embutida no app.
 * Este módulo só é carregado dentro do Desktop (import dinâmico).
 */
export type UpdateStatus = "idle" | "checking" | "available" | "up-to-date" | "downloading" | "installing" | "error";
export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  /** 0–100 durante o download; null quando o tamanho é desconhecido. */
  progress: number | null;
  error: string | null;
  lastChecked: number | null;
}

let state: UpdateState = { status: "idle", version: null, notes: null, progress: null, error: null, lastChecked: null };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Erro desconhecido.");

export async function checkForUpdate(): Promise<void> {
  if (state.status === "checking" || state.status === "downloading" || state.status === "installing") return;
  set({ status: "checking", error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 30_000 });
    pending = update;
    if (update) set({ status: "available", version: update.version, notes: update.body ?? null, lastChecked: Date.now() });
    else set({ status: "up-to-date", version: null, notes: null, lastChecked: Date.now() });
  } catch (e) {
    // Sem rede ou GitHub fora do ar: não é falha do app, só tenta de novo depois.
    set({ status: "error", error: `Não foi possível verificar atualizações (${message(e)}).`, lastChecked: Date.now() });
  }
}

/** Baixa, verifica a assinatura e instala. No Windows o instalador fecha e reabre o LifeOS. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  let total = 0;
  let received = 0;
  set({ status: "downloading", progress: 0, error: null });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        received += event.data.chunkLength;
        set({ progress: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null });
      } else if (event.event === "Finished") set({ status: "installing", progress: 100 });
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    set({ status: "error", progress: null, error: `A atualização não foi instalada (${message(e)}). Nada foi alterado; tente de novo.` });
  }
}

export function useDesktopUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
