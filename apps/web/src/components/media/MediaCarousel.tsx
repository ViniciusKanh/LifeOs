import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from "lucide-react";
import { openDataUriInNewTab } from "@/utils/files";

/**
 * Carrossel de mídias reutilizável (Diário, anexos de Tarefas e Documentos
 * de Projeto). Suporta imagem, vídeo e PDF; navegação por setas, teclado
 * (← →), pontos e gesto de arrastar no celular. As animações respeitam
 * "reduzir movimento" do sistema (o motion desliga transições sozinho
 * quando o usuário pede).
 */
export interface CarouselItem {
  id: string;
  kind: "image" | "video" | "document";
  src: string;
  title?: string | null;
  badge?: string | null;
}

const SWIPE_THRESHOLD = 60;

function MediaView({ item, fit }: { item: CarouselItem; fit: "contain" | "cover" }) {
  if (item.kind === "video") {
    return <video src={item.src} controls playsInline className="w-full h-full object-contain bg-black" />;
  }
  if (item.kind === "document") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-cat-pink/10 to-brand-500/10 text-center p-6">
        <FileText size={48} className="text-cat-pink" aria-hidden />
        <p className="text-sm font-semibold max-w-xs truncate">{item.title ?? "Documento PDF"}</p>
        <button
          type="button"
          onClick={() => openDataUriInNewTab(item.src)}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border hover:border-brand-500/50 transition-colors"
        >
          <ExternalLink size={13} /> Abrir PDF
        </button>
      </div>
    );
  }
  return (
    <img
      src={item.src}
      alt={item.title ?? "Imagem"}
      draggable={false}
      className={`w-full h-full select-none ${fit === "cover" ? "object-cover" : "object-contain"}`}
    />
  );
}

export function MediaCarousel({
  items,
  index,
  onIndexChange,
  fit = "contain",
  className,
  overlay,
}: {
  items: CarouselItem[];
  index: number;
  onIndexChange: (index: number) => void;
  fit?: "contain" | "cover";
  className?: string;
  /** Conteúdo sobreposto no rodapé do slide (ex.: legenda). */
  overlay?: (item: CarouselItem) => ReactNode;
}) {
  const [direction, setDirection] = useState(0);
  const count = items.length;
  const safeIndex = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  const current = items[safeIndex];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setDirection(delta);
      onIndexChange((safeIndex + delta + count) % count);
    },
    [count, safeIndex, onIndexChange]
  );

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) go(1);
    else if (info.offset.x > SWIPE_THRESHOLD) go(-1);
  };

  if (!current) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5 ${className ?? ""}`}
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Mídia ${safeIndex + 1} de ${count}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={current.id}
          custom={direction}
          initial={{ x: direction >= 0 ? "100%" : "-100%", opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction >= 0 ? "-100%" : "100%", opacity: 0.4 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          drag={count > 1 && current.kind !== "video" ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleDragEnd}
          className="absolute inset-0"
        >
          <MediaView item={current} fit={fit} />
        </motion.div>
      </AnimatePresence>

      {current.badge && (
        <span className="absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-black/55 text-white backdrop-blur">
          {current.badge}
        </span>
      )}

      {overlay && <div className="absolute inset-x-0 bottom-0 z-10">{overlay(current)}</div>}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Mídia anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/85 dark:bg-ink-raised/85 shadow-card backdrop-blur hover:scale-105 active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próxima mídia"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/85 dark:bg-ink-raised/85 shadow-card backdrop-blur hover:scale-105 active:scale-95 transition-transform"
          >
            <ChevronRight size={18} />
          </button>
          <div className={`absolute left-1/2 -translate-x-1/2 z-10 flex gap-1.5 ${overlay ? "top-3" : "bottom-3"}`}>
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDirection(i > safeIndex ? 1 : -1);
                  onIndexChange(i);
                }}
                aria-label={`Ir para mídia ${i + 1}`}
                aria-current={i === safeIndex}
                className="p-1"
              >
                <motion.span
                  layout
                  className={`block h-1.5 rounded-full ${i === safeIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"}`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Visualizador em tela cheia com o carrossel + painel lateral opcional
 * (no Diário, é onde o usuário lê/edita a história de cada mídia).
 */
export function MediaLightbox({
  items,
  startIndex,
  onClose,
  aside,
  actions,
}: {
  items: CarouselItem[];
  startIndex: number;
  onClose: () => void;
  aside?: (item: CarouselItem) => ReactNode;
  actions?: (item: CarouselItem) => ReactNode;
}) {
  const [index, setIndex] = useState(startIndex);
  const current = items[Math.min(index, items.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  useEffect(() => {
    if (items.length === 0) onClose();
  }, [items.length, onClose]);

  if (!current) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar mídia"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`w-full ${aside ? "max-w-5xl" : "max-w-3xl"} max-h-full flex flex-col lg:flex-row gap-3`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-end gap-3 mb-2 text-white/85">
            <span className="mr-auto text-xs">
              {Math.min(index, items.length - 1) + 1} / {items.length}
            </span>
            {actions?.(current)}
            <button type="button" onClick={onClose} className="hover:text-white" aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
          <MediaCarousel items={items} index={index} onIndexChange={setIndex} className="h-[46vh] sm:h-[60vh] lg:h-[70vh] !bg-black/40" />
        </div>
        {aside && (
          <div className="lg:w-80 shrink-0 rounded-2xl bg-paper-raised dark:bg-ink-raised p-4 overflow-y-auto max-h-[38vh] lg:max-h-[74vh]">
            {aside(current)}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
