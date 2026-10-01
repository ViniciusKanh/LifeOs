import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Play } from "lucide-react";

/**
 * Slider "em destaque" (imagem cheia, degradê escuro, botões de vidro,
 * contador 01 — 05 e pontos que viram pílula). Usado no topo do Diário.
 *
 * Diferente do MediaCarousel (que segue no visualizador em tela cheia),
 * aqui cada slide é um "momento": rótulo curto, título e uma linha de
 * história. Clicar no slide abre o detalhe. Navegação por setas, teclado
 * (← →), pontos e arrastar no celular; respeita "reduzir movimento".
 */
export interface SpotlightSlide {
  id: string;
  kind: "image" | "video";
  src: string;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
}

const SWIPE_THRESHOLD = 50;
const pad = (n: number) => String(n).padStart(2, "0");

export function SpotlightSlider({
  slides,
  index,
  onIndexChange,
  onOpen,
  className,
}: {
  slides: SpotlightSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onOpen?: (slide: SpotlightSlide) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState(1);
  const count = slides.length;
  const safeIndex = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  const current = slides[safeIndex];

  // Se mídias forem removidas e o índice sobrar, volta para um slide válido.
  useEffect(() => {
    if (count > 0 && index !== safeIndex) onIndexChange(safeIndex);
  }, [count, index, safeIndex, onIndexChange]);

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
      className={`group relative overflow-hidden rounded-[18px] bg-[#111] shadow-[0_25px_60px_-20px_rgba(15,10,40,0.45)] ring-1 ring-white/10 ${className ?? ""}`}
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Momento ${safeIndex + 1} de ${count}: ${current.title}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "Enter" && onOpen) onOpen(current);
      }}
    >
      {/* Mídia: crossfade com leve zoom de entrada (efeito "Ken Burns" curto) */}
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={current.id}
          className="absolute inset-0"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.06, x: direction * 24 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.9, ease: [0.22, 1, 0.36, 1] }, x: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
          drag={count > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={handleDragEnd}
        >
          {current.kind === "video" ? (
            <video src={current.src} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <img src={current.src} alt={current.title} draggable={false} className="w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-[1.02]" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Degradê de leitura — de baixo (forte) para cima (suave) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/20" aria-hidden />

      {/* Área clicável para abrir o detalhe (fica abaixo dos controles) */}
      {onOpen && (
        <button type="button" onClick={() => onOpen(current)} className="absolute inset-0 z-[1] cursor-zoom-in" aria-label={`Abrir ${current.title}`} tabIndex={-1} />
      )}

      {current.kind === "video" && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/45 backdrop-blur-md border border-white/30 flex items-center justify-center text-white">
          <Play size={22} className="ml-0.5" fill="currentColor" />
        </span>
      )}

      {onOpen && (
        <button
          type="button"
          onClick={() => onOpen(current)}
          aria-label="Ver em tela cheia"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white bg-[rgba(15,15,15,0.45)] backdrop-blur-md border border-white/25 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Maximize2 size={15} />
        </button>
      )}

      {count > 1 && (
        <>
          {(["prev", "next"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => go(side === "prev" ? -1 : 1)}
              aria-label={side === "prev" ? "Momento anterior" : "Próximo momento"}
              className={`absolute top-1/2 z-10 -translate-y-1/2 w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center text-white
                bg-[rgba(15,15,15,0.45)] backdrop-blur-md border border-white/25 transition-all duration-300
                hover:bg-white/20 hover:border-white/60 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                ${side === "prev" ? "left-3 sm:left-5 hover:-translate-x-[3px]" : "right-3 sm:right-5 hover:translate-x-[3px]"}`}
            >
              {side === "prev" ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
            </button>
          ))}
        </>
      )}

      {/* Texto do momento + contador */}
      <div className="pointer-events-none absolute z-[5] left-5 right-5 sm:left-[35px] sm:right-[35px] bottom-12 sm:bottom-[55px] flex items-end justify-between gap-4 text-white">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            className="min-w-0"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <p className="mb-1.5 text-[11px] font-bold tracking-[3px] uppercase opacity-70 truncate">{current.eyebrow}</p>
            <h2 className="font-display text-xl sm:text-[27px] font-semibold leading-tight line-clamp-2 drop-shadow-sm">{current.title}</h2>
            {current.subtitle && <p className="mt-1 text-xs sm:text-sm text-white/80 line-clamp-1 max-w-xl">{current.subtitle}</p>}
          </motion.div>
        </AnimatePresence>

        {count > 1 && (
          <div className="flex items-center gap-2.5 text-[13px] font-semibold shrink-0" aria-hidden>
            <span className="text-[19px] tabular-nums">{pad(safeIndex + 1)}</span>
            <i className="block w-[35px] h-px bg-white/60" />
            <span className="opacity-55 tabular-nums">{pad(count)}</span>
          </div>
        )}
      </div>

      {/* Pontos: o ativo vira pílula */}
      {count > 1 && (
        <div className="absolute z-10 left-5 sm:left-[35px] bottom-[18px] sm:bottom-[22px] flex gap-[7px]">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setDirection(i > safeIndex ? 1 : -1);
                onIndexChange(i);
              }}
              aria-label={`Ir para o momento ${i + 1}`}
              aria-current={i === safeIndex}
              className="py-1.5 -my-1.5"
            >
              <span
                className={`block h-[7px] rounded-full transition-all duration-300 ${i === safeIndex ? "w-7 bg-white" : "w-[7px] bg-white/35 hover:bg-white/60"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
