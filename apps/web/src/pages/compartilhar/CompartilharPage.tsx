import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { Check, Inbox, ListChecks, Loader2, Mic, NotebookText, Share2 } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { inputClass } from "@/components/ui/Modal";
import { api } from "@/services/api";
import { inboxService } from "@/services/inboxService";
import { useSpeechCapture } from "@/hooks/useSpeechCapture";

type Target = "inbox" | "note" | "task";

/**
 * Destino do "Compartilhar" do celular/Windows (share_target do PWA) e do
 * atalho "Captura rápida": o conteúdo chega por ?title=&text=&url= e o
 * usuário escolhe onde guardar. Funciona offline (vai para a fila).
 */
export function CompartilharPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = useMemo(() => {
    const title = params.get("title")?.trim() ?? "";
    const text = params.get("text")?.trim() ?? "";
    const url = params.get("url")?.trim() ?? "";
    // Muitos apps mandam o link dentro de "text"; evita duplicar.
    const parts = [title, text, url && !text.includes(url) ? url : ""].filter(Boolean);
    return { content: parts.join("\n"), url: url || (text.match(/https?:\/\/\S+/)?.[0] ?? ""), title };
  }, [params]);
  const [content, setContent] = useState(initial.content);
  const [target, setTarget] = useState<Target>("inbox");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechCapture((t) => setContent((c) => (c ? `${c} ${t}` : t)));

  useEffect(() => setContent(initial.content), [initial]);

  const save = async () => {
    const text = content.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const firstLine = text.split("\n")[0].slice(0, 200);
      if (target === "inbox") {
        const r = await inboxService.capture(text);
        setDone(r ? "Guardado no Inbox." : "Sem conexão: guardado no aparelho, sobe sozinho quando voltar.");
      } else if (target === "note") {
        const r = await api.postOrQueue<{ id: string }>(
          "/notes",
          { title: initial.title || firstLine, content: `<p>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`, kind: "referencia", sourceUrl: initial.url || null },
          firstLine
        );
        if (r) return navigate(`/notas?nota=${r.id}`);
        setDone("Sem conexão: a nota foi guardada no aparelho e sobe sozinha.");
      } else {
        const r = await api.postOrQueue<{ id: string }>("/tasks", { title: firstLine, description: text.length > firstLine.length ? text : undefined, status: "A Fazer" }, firstLine);
        if (r) return navigate(`/tarefas?task=${r.id}`);
        setDone("Sem conexão: a tarefa foi guardada no aparelho e sobe sozinha.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  };

  const options: Array<{ key: Target; label: string; hint: string; icon: JSX.Element }> = [
    { key: "inbox", label: "Inbox", hint: "Decidir depois", icon: <Inbox size={16} /> },
    { key: "note", label: "Nota", hint: "Guardar como referência", icon: <NotebookText size={16} /> },
    { key: "task", label: "Tarefa", hint: "Virar algo a fazer", icon: <ListChecks size={16} /> },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-8">
      <PageHeader icon={<Share2 size={20} />} title="Capturar" subtitle="Guarde o que chegou — decida o resto depois." />
      <Card className="p-4 sm:p-5 space-y-4">
        {done ? (
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
            <span className="mx-auto w-12 h-12 rounded-full bg-growth/15 text-growth flex items-center justify-center mb-3">
              <Check size={22} />
            </span>
            <p className="text-sm font-semibold">{done}</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="secondary" onClick={() => navigate("/inbox")}>
                Abrir Inbox
              </Button>
              <Button
                onClick={() => {
                  setDone(null);
                  setContent("");
                }}
              >
                Capturar outra
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <div className="relative">
              <label htmlFor="share-content" className="sr-only">
                Conteúdo
              </label>
              <textarea id="share-content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} className={`${inputClass} resize-y pr-12`} placeholder="Escreva, cole ou dite…" maxLength={5000} autoFocus />
              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? "Parar ditado" : "Ditar"}
                  className={`absolute right-2 top-2 w-9 h-9 rounded-xl flex items-center justify-center ${speech.listening ? "bg-drop text-white animate-pulse" : "text-slate hover:bg-black/[0.04]"}`}
                >
                  <Mic size={16} />
                </button>
              )}
            </div>
            {speech.interim && <p className="text-xs text-slate italic -mt-2">{speech.interim}…</p>}
            <div role="radiogroup" aria-label="Guardar em" className="grid grid-cols-3 gap-2">
              {options.map((o) => (
                <button
                  key={o.key}
                  role="radio"
                  aria-checked={target === o.key}
                  onClick={() => setTarget(o.key)}
                  className={`rounded-xl border p-3 text-left transition-all ${target === o.key ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30" : "border-paper-border dark:border-ink-border"}`}
                >
                  <span className="text-brand-600 dark:text-brand-400">{o.icon}</span>
                  <span className="block text-xs font-semibold mt-1">{o.label}</span>
                  <span className="block text-[10.5px] text-slate">{o.hint}</span>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-drop">{error}</p>}
            <Button onClick={save} disabled={busy || !content.trim()} className="w-full">
              {busy && <Loader2 size={14} className="animate-spin" />} Guardar
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
