import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, ImagePlus, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { useTaskAttachments } from "@/hooks/useTaskAttachments";
import { MediaLightbox, type CarouselItem } from "@/components/media/MediaCarousel";
import { prepareUpload, uploadKindOf } from "@/utils/files";
import { taskService } from "@/services/taskService";

/**
 * Anexos de tarefa (imagens e PDFs). Na edição, envia na hora; na criação
 * (a tarefa ainda não tem id), guarda os arquivos numa fila local e o
 * TaskModal envia logo depois de criar a tarefa (uploadQueuedFiles).
 * Anexos de tarefas vinculadas a um projeto viram os "Documentos" dele.
 */

const ACCEPT = "image/*,application/pdf";

/** Envia a fila de arquivos de uma tarefa recém-criada, um por vez. Devolve quantos falharam. */
export async function uploadQueuedFiles(taskId: string, files: File[]): Promise<number> {
  let failed = 0;
  for (const file of files) {
    try {
      const prepared = await prepareUpload(file, ["image", "document"]);
      await taskService.addAttachment(taskId, { dataUri: prepared.dataUri, fileName: prepared.fileName });
    } catch {
      failed += 1;
    }
  }
  return failed;
}

function Thumb({ kind, src, name, onOpen, onRemove }: { kind: "image" | "document"; src?: string; name: string; onOpen?: () => void; onRemove: () => void }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative group">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="w-full aspect-square rounded-xl overflow-hidden border border-paper-border dark:border-ink-border bg-paper dark:bg-ink flex items-center justify-center"
        aria-label={`Abrir ${name}`}
      >
        {kind === "image" && src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 p-2 text-center">
            <FileText size={20} className="text-cat-pink" />
            <span className="text-[9px] font-medium truncate max-w-full">{name}</span>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${name}`}
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border text-slate hover:text-drop shadow-card sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

/** Miniatura de um arquivo ainda não enviado — a URL temporária é liberada ao sair da fila. */
function QueuedThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = uploadKindOf(file) === "image";
  const [preview, setPreview] = useState<string | undefined>();
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);
  return <Thumb kind={isImage ? "image" : "document"} src={preview} name={file.name} onRemove={onRemove} />;
}

export function TaskAttachments({
  taskId,
  queued,
  onQueueChange,
}: {
  taskId: string | null;
  queued: File[];
  onQueueChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { attachments, isAdding, addAttachment, removeAttachment } = useTaskAttachments(taskId);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const handleFiles = async (files: FileList) => {
    setError(null);
    const list = Array.from(files).filter((f) => {
      const kind = uploadKindOf(f);
      return kind === "image" || kind === "document";
    });
    if (list.length < files.length) setError("Só imagens e PDFs podem ser anexados.");
    if (!taskId) {
      onQueueChange([...queued, ...list]);
      return;
    }
    for (const file of list) {
      try {
        const prepared = await prepareUpload(file, ["image", "document"]);
        await addAttachment({ dataUri: prepared.dataUri, fileName: prepared.fileName });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível anexar o arquivo.");
      }
    }
  };

  const items: CarouselItem[] = attachments.map((a) => ({
    id: a.id,
    kind: a.kind === "document" ? "document" : "image",
    src: a.dataUri,
    title: a.caption ?? a.fileName,
  }));

  const total = attachments.length + queued.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-slate flex items-center gap-1.5">
          <Paperclip size={12} /> Anexos {total > 0 && <span className="text-[10px]">({total})</span>}
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isAdding}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-100 hover:underline disabled:opacity-50"
        >
          {isAdding ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} Adicionar imagem ou PDF
        </button>
      </div>

      {total === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-paper-border dark:border-ink-border py-4 text-xs text-slate hover:border-brand-500/50 hover:text-brand-600 transition-colors"
        >
          Prints, fotos de quadro, briefings em PDF… Se a tarefa for de um projeto, os anexos aparecem em Documentos.
        </button>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          <AnimatePresence>
            {attachments.map((a, i) => (
              <Thumb
                key={a.id}
                kind={a.kind}
                src={a.dataUri}
                name={a.fileName ?? (a.kind === "document" ? "PDF" : "Imagem")}
                onOpen={() => setLightbox(i)}
                onRemove={() => removeAttachment(a.id).catch(() => setError("Não foi possível remover o anexo."))}
              />
            ))}
            {queued.map((f, i) => (
              <QueuedThumb key={`${f.name}-${f.lastModified}-${i}`} file={f} onRemove={() => onQueueChange(queued.filter((_, j) => j !== i))} />
            ))}
          </AnimatePresence>
        </div>
      )}
      {queued.length > 0 && <p className="text-[11px] text-slate mt-1.5">Os arquivos serão enviados ao criar a tarefa.</p>}
      {error && <p className="text-xs text-drop mt-1.5" role="alert">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <AnimatePresence>
        {lightbox !== null && items.length > 0 && (
          <MediaLightbox
            items={items}
            startIndex={Math.min(lightbox, items.length - 1)}
            onClose={() => setLightbox(null)}
            actions={(item) => (
              <button type="button" onClick={() => removeAttachment(item.id)} className="text-white/80 hover:text-white" aria-label="Excluir anexo">
                <Trash2 size={18} />
              </button>
            )}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
