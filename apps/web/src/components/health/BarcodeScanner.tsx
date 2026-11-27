import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** API nativa do navegador (Chrome Android/macOS/ChromeOS). Tipagem mínima: não está no lib.dom. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

export const barcodeScanSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * Leitor de código de barras pela câmera, sem biblioteca extra: usa o
 * BarcodeDetector do navegador. Onde não existe (ex.: Chrome no Windows),
 * o botão nem aparece e o usuário digita o código.
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const code = found.find((b) => /^\d{6,14}$/.test(b.rawValue))?.rawValue;
            if (code) {
              stopped = true;
              onDetected(code);
              return;
            }
          } catch {
            // quadro ainda não pronto: tenta no próximo
          }
          timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch {
        setError("Não foi possível abrir a câmera. Verifique a permissão ou digite o código.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Ler código de barras">
      <div className="rpg-panel w-full max-w-md space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="font-rpg text-sm font-bold text-rpg-text">Aponte para o código de barras</p>
          <button type="button" onClick={onClose} className="p-1 text-rpg-muted hover:text-rpg-text" aria-label="Fechar leitor">
            <X size={16} aria-hidden />
          </button>
        </div>
        {error ? (
          <p className="text-sm text-rpg-orange" role="alert">
            {error}
          </p>
        ) : (
          <div className="relative overflow-hidden" style={{ borderRadius: 6 }}>
            <video ref={video} className="aspect-[4/3] w-full bg-black object-cover" muted playsInline />
            <span className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rpg-red shadow-[0_0_10px_rgba(255,0,0,0.8)]" aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}
