import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, FileText, Film, ImagePlus, Loader2, Play, Sparkles, Trash2, X } from "lucide-react";
import type { JournalMedia } from "@/types";
import { Button } from "@/components/ui/primitives";
import { MediaLightbox, type CarouselItem } from "@/components/media/MediaCarousel";
import { SpotlightSlider, type SpotlightSlide } from "@/components/media/SpotlightSlider";
import { prepareUpload, uploadKindOf } from "@/utils/files";

/**
 * Mídias do dia no Diário: fotos, vídeos curtos e PDFs. Cada upload passa
 * por um passo "Conte a história" — o texto do usuário sobre aquela mídia
 * fica salvo junto dela e é o que a IA usa para organizar o dia (o arquivo
 * em si nunca é enviado ao Gemini).
 *
 * Fotos e vídeos também aparecem num carrossel em destaque no topo.
 */

export const MAX_JOURNAL_MEDIA = 12;

const KIND_LABEL: Record<string, string> = { photo: "Foto", video: "Vídeo", document: "PDF", audio: "Áudio" };

export function toCarouselItem(m: JournalMedia): CarouselItem {
  return {
    id: m.id,
    kind: m.kind === "video" ? "video" : m.kind === "document" ? "document" : "image",
    src: m.dataUri,
    title: m.caption ?? m.fileName,
    badge: m.aiCategory,
  };
}

/**
 * Momento do slider em destaque: rótulo = categoria da IA (ou tipo da
 * mídia), título = legenda (ou começo da história) e uma linha da história.
 */
function toSpotlightSlide(m: JournalMedia): SpotlightSlide {
  const story = m.story?.trim() || null;
  const caption = m.caption?.trim() || null;
  // Sem legenda, a 1ª frase da história vira o título e o restante vira a linha de apoio.
  const [firstSentence, ...rest] = story ? story.split(/(?<=[.!?])\s+|\n+/) : [];
  const title = caption ?? (firstSentence ? firstSentence.slice(0, 90) : "Um momento do seu dia");
  const subtitle = caption ? story : rest.join(" ").trim() || null;
  return {
    id: m.id,
    kind: m.kind === "video" ? "video" : "image",
    src: m.dataUri,
    eyebrow: m.aiCategory ?? (m.kind === "video" ? "Vídeo do dia" : "Momento"),
    title,
    subtitle,
  };
}

interface PendingUpload {
  file: File;
  previewUrl: string;
}

/** Passo "Conte a história" — aparece para cada arquivo escolhido, antes do envio. */
function StoryComposer({
  pending,
  remaining,
  onSubmit,
  onCancel,
}: {
  pending: PendingUpload;
  remaining: number;
  onSubmit: (story: string, caption: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [story, setStory] = useState("");
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const kind = uploadKindOf(pending.file);

  const submit = async (withStory: boolean) => {
    setSending(true);
    try {
      await onSubmit(withStory ? story : "", withStory ? caption : "");
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-composer-title"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <p id="story-composer-title" className="text-sm font-semibold">Conte a história desta {kind === "video" ? "gravação" : kind === "document" ? "página" : "foto"}</p>
            <p className="text-[11px] text-slate">{remaining > 1 ? `${remaining} arquivos na fila` : "Último arquivo da fila"}</p>
          </div>
          <button type="button" onClick={onCancel} className="text-slate hover:text-inherit" aria-label="Cancelar envio">
            <X size={18} />
          </button>
        </div>

        <div className="mx-5 mt-4 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 aspect-video flex items-center justify-center">
          {kind === "image" && <img src={pending.previewUrl} alt="" className="w-full h-full object-contain" />}
          {kind === "video" && <video src={pending.previewUrl} controls playsInline className="w-full h-full object-contain bg-black" />}
          {kind === "document" && (
            <div className="flex flex-col items-center gap-2 text-center p-4">
              <FileText size={40} className="text-cat-pink" />
              <p className="text-xs font-medium truncate max-w-[16rem]">{pending.file.name}</p>
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label htmlFor="story-caption" className="text-xs text-slate">Título curto (opcional)</label>
            <input
              id="story-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Pôr do sol no parque"
              className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-cat-pink transition-colors"
            />
          </div>
          <div>
            <label htmlFor="story-text" className="text-xs text-slate">A história</label>
            <textarea
              id="story-text"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              maxLength={4000}
              rows={5}
              autoFocus
              placeholder="O que aconteceu aqui? Quem estava junto, o que você sentiu, por que vale lembrar…"
              className="w-full mt-1.5 rounded-xl px-3 py-2.5 text-sm leading-relaxed bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-cat-pink transition-colors resize-y"
            />
            <p className="text-[10px] text-slate text-right">{story.length}/4000</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={sending} onClick={() => submit(false)}>
              Enviar sem história
            </Button>
            <Button className="flex-1" disabled={sending} onClick={() => submit(true)}>
              {sending ? <Loader2 size={15} className="animate-spin" /> : null}
              Salvar mídia
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Painel lateral do visualizador: título, história e categoria da IA, editáveis. */
function StoryAside({
  media,
  onSave,
}: {
  media: JournalMedia;
  onSave: (patch: { caption?: string | null; story?: string | null }) => Promise<void>;
}) {
  const [caption, setCaption] = useState(media.caption ?? "");
  const [story, setStory] = useState(media.story ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = caption !== (media.caption ?? "") || story !== (media.story ?? "");

  const save = async () => {
    setStatus("saving");
    try {
      await onSave({ caption: caption.trim() || null, story: story.trim() || null });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-cat-pink">{KIND_LABEL[media.kind]}</span>
        {media.aiCategory && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-100" title="Categoria sugerida pela IA e confirmada por você">
            <Sparkles size={10} /> {media.aiCategory}
          </span>
        )}
      </div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={200}
        placeholder="Título da mídia"
        aria-label="Título da mídia"
        className="w-full rounded-xl px-3 py-2 text-sm font-semibold bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-cat-pink"
      />
      <textarea
        value={story}
        onChange={(e) => setStory(e.target.value)}
        maxLength={4000}
        rows={8}
        placeholder="Conte a história desta mídia…"
        aria-label="História da mídia"
        className="w-full rounded-xl px-3 py-2 text-sm leading-relaxed bg-paper dark:bg-ink border border-paper-border dark:border-ink-border outline-none focus:border-cat-pink resize-y"
      />
      {media.fileName && <p className="text-[11px] text-slate truncate">Arquivo: {media.fileName}</p>}
      <div className="flex items-center gap-2">
        <Button className="flex-1" disabled={!dirty || status === "saving"} onClick={save}>
          {status === "saving" ? "Salvando…" : "Salvar história"}
        </Button>
      </div>
      {status === "saved" && !dirty && <p className="text-[11px] text-growth">História salva.</p>}
      {status === "error" && <p className="text-[11px] text-drop">Não foi possível salvar. Tente novamente.</p>}
    </div>
  );
}

export function JournalMediaSection({
  media,
  onUpload,
  onUpdate,
  onRemove,
}: {
  media: JournalMedia[];
  onUpload: (input: { dataUri: string; fileName: string; story: string | null; caption: string | null }) => Promise<unknown>;
  onUpdate: (mediaId: string, patch: { caption?: string | null; story?: string | null }) => Promise<unknown>;
  onRemove: (mediaId: string) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxStart, setLightboxStart] = useState<number | null>(null);

  const visual = media.filter((m) => m.kind === "photo" || m.kind === "video");
  const allViewable = media.filter((m) => m.kind !== "audio");
  const canAddMore = media.length + queue.length < MAX_JOURNAL_MEDIA;

  // Libera as URLs temporárias de pré-visualização que sobrarem ao desmontar.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const cancelQueue = () => {
    queue.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setQueue([]);
  };

  const pickFiles = (files: FileList) => {
    setError(null);
    const free = MAX_JOURNAL_MEDIA - media.length - queue.length;
    const accepted = Array.from(files).filter((f) => uploadKindOf(f) !== null);
    if (accepted.length < files.length) setError("Alguns arquivos foram ignorados — aceitamos fotos, vídeos e PDFs.");
    if (accepted.length > free) setError(`Limite de ${MAX_JOURNAL_MEDIA} mídias por dia — só os primeiros ${free} foram adicionados.`);
    setQueue((q) => [...q, ...accepted.slice(0, Math.max(free, 0)).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const submitCurrent = async (story: string, caption: string) => {
    const current = queue[0];
    if (!current) return;
    try {
      const prepared = await prepareUpload(current.file, ["image", "video", "document"]);
      await onUpload({ dataUri: prepared.dataUri, fileName: prepared.fileName, story: story.trim() || null, caption: caption.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    }
    URL.revokeObjectURL(current.previewUrl);
    setQueue((q) => q.slice(1));
  };

  const items = allViewable.map(toCarouselItem);
  const visualSlides = visual.map(toSpotlightSlide);

  return (
    <div className="space-y-3">
      {visualSlides.length > 0 && (
        <SpotlightSlider
          slides={visualSlides}
          index={carouselIndex}
          onIndexChange={setCarouselIndex}
          onOpen={(slide) => setLightboxStart(allViewable.findIndex((v) => v.id === slide.id))}
          className="h-[300px] sm:h-[420px] lg:h-[500px]"
        />
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {allViewable.map((item, i) => (
          <motion.button
            key={item.id}
            type="button"
            layout
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setLightboxStart(i)}
            className="relative aspect-square rounded-xl overflow-hidden bg-paper dark:bg-ink border border-paper-border dark:border-ink-border text-left"
            aria-label={`Abrir ${KIND_LABEL[item.kind]}${item.caption ? `: ${item.caption}` : ""}`}
          >
            {item.kind === "photo" && <img src={item.dataUri} alt="" className="w-full h-full object-cover" />}
            {item.kind === "video" && (
              <>
                <video src={item.dataUri} muted preload="metadata" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center">
                    <Play size={14} className="ml-0.5" />
                  </span>
                </span>
              </>
            )}
            {item.kind === "document" && (
              <span className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 bg-gradient-to-br from-cat-pink/10 to-brand-500/10">
                <FileText size={22} className="text-cat-pink" />
                <span className="text-[10px] font-medium truncate max-w-full">{item.fileName ?? "PDF"}</span>
              </span>
            )}
            {item.story && (
              <span className="absolute bottom-1 left-1 right-1 rounded-md px-1.5 py-0.5 text-[9px] bg-black/55 text-white truncate">
                {item.caption ?? item.story}
              </span>
            )}
          </motion.button>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-paper-border dark:border-ink-border flex flex-col items-center justify-center gap-1 text-slate hover:border-cat-pink hover:text-cat-pink transition-colors"
          >
            <ImagePlus size={18} />
            <span className="text-[10px] font-medium">Adicionar</span>
            <span className="flex items-center gap-1 text-[9px] opacity-70">
              <Camera size={9} /> <Film size={9} /> <FileText size={9} />
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) pickFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-[11px] text-slate">Fotos, vídeos curtos (até 3 MB) e PDFs — até {MAX_JOURNAL_MEDIA} por dia.</p>
      {error && <p className="text-xs text-drop" role="alert">{error}</p>}

      <AnimatePresence>
        {queue[0] && (
          <StoryComposer
            key={queue[0].previewUrl}
            pending={queue[0]}
            remaining={queue.length}
            onSubmit={submitCurrent}
            onCancel={cancelQueue}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxStart !== null && items.length > 0 && (
          <MediaLightbox
            items={items}
            startIndex={Math.min(lightboxStart, items.length - 1)}
            onClose={() => setLightboxStart(null)}
            actions={(item) => (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="text-white/80 hover:text-white"
                aria-label="Excluir mídia"
              >
                <Trash2 size={18} />
              </button>
            )}
            aside={(item) => {
              const m = allViewable.find((v) => v.id === item.id);
              return m ? <StoryAside key={m.id} media={m} onSave={async (patch) => void (await onUpdate(m.id, patch))} /> : null;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
