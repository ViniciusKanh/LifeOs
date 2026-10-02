import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { notesService } from "@/services/notesService";
import { inputClass } from "@/components/ui/Modal";
import type { NoteLinkType } from "@/types";

const TYPES: Array<{ key: NoteLinkType; label: string }> = [
  { key: "note", label: "Nota" },
  { key: "task", label: "Tarefa" },
  { key: "project", label: "Projeto" },
  { key: "goal", label: "Meta" },
  { key: "book", label: "Livro" },
  { key: "education", label: "Formação" },
  { key: "journal", label: "Dia do diário" },
];

export const LINK_TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label])) as Record<NoteLinkType, string>;

/** Busca um item de qualquer módulo para ligar à nota. */
export function NoteLinkPicker({ onPick, excludeId }: { onPick: (type: NoteLinkType, id: string) => Promise<unknown>; excludeId?: string }) {
  const [type, setType] = useState<NoteLinkType>("project");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      notesService
        .targets(type, q)
        .then((r) => alive && setResults(r.filter((x) => !(type === "note" && x.id === excludeId))))
        .catch(() => alive && setResults([]));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [type, q, excludeId]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as NoteLinkType)} className={`${inputClass} !w-36 !py-2 !text-xs`} aria-label="Tipo do item">
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar item" className={`${inputClass} !pl-8 !py-2 !text-xs`} />
        </div>
      </div>
      <ul className="max-h-44 overflow-y-auto space-y-1">
        {results.length === 0 ? (
          <li className="text-[11px] text-slate px-1">Nada encontrado.</li>
        ) : (
          results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onPick(type, r.id).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível ligar."))}
                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06] truncate"
              >
                {r.label}
              </button>
            </li>
          ))
        )}
      </ul>
      {error && <p className="text-[11px] text-drop">{error}</p>}
    </div>
  );
}
