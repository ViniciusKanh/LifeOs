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
