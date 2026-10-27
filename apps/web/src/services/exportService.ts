import { api } from "@/services/api";
import { todayKey } from "@/utils/localDate";

/**
 * Exportação LGPD ("Exportar meus dados"): o backend devolve um JSON com as
 * tabelas do usuário (sem credenciais); aqui só viramos arquivo no navegador.
 */

export interface ExportPayload {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  tables: string[];
  data: Record<string, unknown[]>;
}

/** Nome do arquivo com a data LOCAL (não a UTC, que já virou às 21h em São Paulo). */
export function exportFileName(dateKey: string = todayKey()): string {
  return `lifeos-export-${dateKey}.json`;
}

/** Total de registros exportados (para o feedback de sucesso). */
export function countExportedRows(payload: Pick<ExportPayload, "data">): number {
  return Object.values(payload.data ?? {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

export async function downloadMyData(): Promise<{ rows: number; tables: number }> {
  const payload = await api.get<ExportPayload>("/export/me");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { rows: countExportedRows(payload), tables: Object.keys(payload.data ?? {}).length };
}

export interface RestoreSummary {
  restored: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * Restauração de backup (escopo V1 — módulos centrais, ver backupRestoreService
 * no backend): lê o próprio arquivo gerado por "Exportar meus dados" e reenvia
 * para /import/restore, que recria os registros com ids novos e sempre sob o
 * usuário autenticado (nunca sob o dono original do arquivo).
 */
export async function restoreMyData(file: File): Promise<RestoreSummary> {
  const text = await file.text();
  let parsed: Partial<ExportPayload>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Arquivo inválido — selecione o JSON gerado por "Exportar meus dados".');
  }
  if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error('Arquivo inválido — selecione o JSON gerado por "Exportar meus dados".');
  }
  return api.post<RestoreSummary>("/import/restore", { data: parsed.data });
}

/** Resumo legível do que a restauração fez, para o feedback de sucesso. */
export function summarizeRestore(summary: RestoreSummary): string {
  const restoredTotal = Object.values(summary.restored).reduce((sum, n) => sum + n, 0);
  const skippedTotal = Object.values(summary.skipped).reduce((sum, n) => sum + n, 0);
  if (restoredTotal === 0) {
    return skippedTotal > 0
      ? "Nenhum registro novo: tudo nesse arquivo já existia na sua conta."
      : "Nenhum registro reconhecido nesse arquivo.";
  }
  return skippedTotal > 0
    ? `${restoredTotal} registro${restoredTotal === 1 ? "" : "s"} restaurado${restoredTotal === 1 ? "" : "s"} (${skippedTotal} já existiam ou foram ignorados).`
    : `${restoredTotal} registro${restoredTotal === 1 ? "" : "s"} restaurado${restoredTotal === 1 ? "" : "s"} com sucesso.`;
}
