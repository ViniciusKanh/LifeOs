import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { parseImportFile, type ImportResult } from "@/utils/taskImport";
import { taskImportService } from "@/services/taskService";

const SOURCE_LABEL: Record<ImportResult["source"], string> = { todoist: "Todoist", notion: "Notion", google_tasks: "Google Tasks", csv: "CSV" };

/**
 * Importar de Todoist (CSV), Notion (CSV do banco) e Google Tasks (JSON do
 * Takeout). O arquivo é convertido aqui no navegador; o usuário vê a prévia
 * e só então confirma o envio.
 */
export function TaskImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [createProjects, setCreateProjects] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; projectsCreated: number } | null>(null);

  const reset = () => {
    setResult(null);
    setFileName("");
    setError(null);
    setDone(null);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    reset();
    if (file.size > 5 * 1024 * 1024) return setError("Arquivo grande demais (máx. 5 MB).");
    setFileName(file.name);
    const text = await file.text();
    setResult(parseImportFile(file.name, text));
  };

  const confirm = async () => {
    if (!result || result.tasks.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const items = result.tasks.slice(0, 1000);
      const r = await taskImportService.importTasks({ source: result.source, createProjects, items });
      setDone(r);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar.");
    } finally {
      setBusy(false);
    }
  };

  const projects = result ? [...new Set(result.tasks.map((t) => t.projectName).filter(Boolean))] : [];

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importar tarefas"
      size="lg"
      footer={
        done ? (
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={busy || !result || result.tasks.length === 0}>
              {busy && <Loader2 size={14} className="animate-spin" />} Importar {result?.tasks.length ? Math.min(result.tasks.length, 1000) : ""} tarefa(s)
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="text-center py-6">
          <p className="text-3xl font-bold">{done.imported}</p>
          <p className="text-sm text-slate">tarefas importadas{done.projectsCreated > 0 ? ` · ${done.projectsCreated} projeto(s) criado(s)` : ""}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate">
            <div className="rounded-xl border border-paper-border dark:border-ink-border p-2.5">
              <p className="font-semibold text-inherit text-xs">Todoist</p>Configurações do projeto → Exportar como CSV.
            </div>
            <div className="rounded-xl border border-paper-border dark:border-ink-border p-2.5">
              <p className="font-semibold text-inherit text-xs">Notion</p>No banco de dados: ••• → Exportar → Markdown & CSV (envie o .csv).
            </div>
            <div className="rounded-xl border border-paper-border dark:border-ink-border p-2.5">
              <p className="font-semibold text-inherit text-xs">Google Tasks</p>takeout.google.com → Tasks → envie o Tasks.json.
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-paper-border dark:border-ink-border p-6 cursor-pointer hover:border-brand-500 transition-colors text-center">
            <FileUp size={22} className="text-brand-600 dark:text-brand-400" />
            <span className="text-sm font-semibold">{fileName || "Escolher arquivo .csv ou .json"}</span>
            <span className="text-[11px] text-slate">O arquivo é lido aqui no navegador — você revisa antes de importar.</span>
            <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-100 px-2.5 py-1 font-semibold">Formato: {SOURCE_LABEL[result.source]}</span>
                <span>{result.tasks.length} tarefa(s)</span>
                {result.skipped > 0 && <span className="text-slate">· {result.skipped} linha(s) ignorada(s)</span>}
                {result.tasks.length > 1000 && <span className="text-drop">· só as 1000 primeiras serão importadas</span>}
              </div>
              {result.warnings.map((w) => (
                <p key={w} className="text-[11px] text-signal-deep dark:text-signal">
                  {w}
                </p>
              ))}
              {projects.length > 0 && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={createProjects} onChange={(e) => setCreateProjects(e.target.checked)} />
                  Criar projetos que ainda não existem ({projects.length}: {projects.slice(0, 4).join(", ")}
                  {projects.length > 4 ? "…" : ""})
                </label>
              )}
              <div className="rounded-xl border border-paper-border dark:border-ink-border overflow-hidden">
                <div className="max-h-64 overflow-y-auto divide-y divide-paper-border dark:divide-ink-border">
                  {result.tasks.slice(0, 50).map((t, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="font-medium flex-1 min-w-[160px] truncate">{t.title}</span>
                      {t.projectName && <span className="text-slate truncate max-w-[160px]">{t.projectName}</span>}
                      {t.dueDate && <span className="text-slate">{t.dueDate}</span>}
                      <span className="text-slate">{t.priority}</span>
                      <span className="text-slate">{t.status}</span>
                    </div>
                  ))}
                </div>
                {result.tasks.length > 50 && <p className="text-[11px] text-slate px-3 py-2 bg-black/[0.02]">+ {result.tasks.length - 50} outras</p>}
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-drop" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
