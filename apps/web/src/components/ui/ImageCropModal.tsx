import { useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { Button } from "./primitives";

const OUTPUT_SIZE = 512;
const VIEWPORT_SIZE = 280;

/**
 * Recorte de imagem 100% client-side (arrastar + zoom), sem depender
 * de nenhuma lib nova. Aceita QUALQUER foto — mesmo uma de 12MB tirada
 * no celular — porque nunca envia o arquivo original: sempre exporta
 * um quadrado final de 512x512 em JPEG comprimido, então o upload em
 * si é sempre pequeno independentemente do tamanho da foto de origem.
 */
export function ImageCropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (dataUri: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleImgLoad = () => {
    if (!imgRef.current) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  // Fator de escala mínimo para a imagem sempre cobrir o quadrado de recorte.
  const baseScale = naturalSize.w > 0 ? VIEWPORT_SIZE / Math.min(naturalSize.w, naturalSize.h) : 1;
  const scale = baseScale * zoom;
  const displayW = naturalSize.w * scale;
  const displayH = naturalSize.h * scale;
  const maxOffsetX = Math.max(0, (displayW - VIEWPORT_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayH - VIEWPORT_SIZE) / 2);

  const clampOffset = (x: number, y: number) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.origX + dx, dragState.current.origY + dy));
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  const handleConfirm = () => {
    if (!imgRef.current || naturalSize.w === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mapeia a janela de recorte (VIEWPORT_SIZE, centrada, deslocada por offset)
    // de volta para coordenadas da imagem original. Importante: o
    // primeiro translate tem que levar a origem para o CENTRO do
    // canvas de saída — sem isso a imagem era desenhada a partir do
    // canto superior esquerdo e a foto salva saía deslocada/cortada
    // (só a metade inferior-direita do enquadramento aparecia).
    const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;
    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2 + offset.x * outputScale, OUTPUT_SIZE / 2 + offset.y * outputScale);
    ctx.scale(scale * outputScale, scale * outputScale);
    ctx.drawImage(imgRef.current, -naturalSize.w / 2, -naturalSize.h / 2, naturalSize.w, naturalSize.h);
    ctx.restore();

    const dataUri = canvas.toDataURL("image/jpeg", 0.85);
    onConfirm(dataUri);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-paper-raised dark:bg-ink-raised border border-paper-border dark:border-ink-border my-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">Ajustar foto</p>
          <button onClick={onCancel} className="text-slate">
            <X size={18} />
          </button>
        </div>

        <div
          className="relative mx-auto rounded-full overflow-hidden bg-black/10 select-none touch-none"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              onLoad={handleImgLoad}
              alt="Pré-visualização"
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: displayW,
                height: displayH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                maxWidth: "none",
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <ZoomIn size={14} className="text-slate shrink-0" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
        </div>

        <p className="text-[11px] text-slate mt-2 text-center">Arraste para posicionar e use o zoom para ajustar o enquadramento.</p>

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="flex-1">
            Usar esta foto
          </Button>
        </div>
      </div>
    </div>
  );
}
