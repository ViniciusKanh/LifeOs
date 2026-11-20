import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { WorldEngine, type EngineData, type EngineSettings, type Selection } from "./engine/WorldEngine";
import type { RoomKey } from "./engine/worldMap";

export interface WorldCanvasHandle {
  centerAvatar: () => void;
  reset: () => void;
  zoom: (f: number) => void;
  pan: (dx: number, dy: number) => void;
  centerRoom: (k: RoomKey) => void;
  moveAvatar: (x: number, y: number) => boolean;
  celebrate: (id: string, text: string) => void;
}

/**
 * Casca React do motor. O motor é criado uma vez; dados, preferências,
 * seleção e modo de decoração são repassados sem recriar o canvas.
 */
export const WorldCanvas = forwardRef<WorldCanvasHandle, {
  data: EngineData | null;
  settings: EngineSettings;
  selectedRoom: RoomKey | null;
  decorMode: boolean;
  onSelect: (s: Selection) => void;
  onAvatarMoved: (p: { x: number; y: number }) => void;
  className?: string;
}>(function WorldCanvas({ data, settings, selectedRoom, decorMode, onSelect, onAvatarMoved, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const cb = useRef({ onSelect, onAvatarMoved });
  cb.current = { onSelect, onAvatarMoved };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new WorldEngine(canvas, settings);
    engine.onSelect = (s) => cb.current.onSelect(s);
    engine.onAvatarMoved = (p) => cb.current.onAvatarMoved(p);
    engineRef.current = engine;
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    // Fora da tela (rolagem) o loop para — economiza CPU e bateria.
    const io = new IntersectionObserver(([e]) => engine.setVisible(!!e?.isIntersecting), { threshold: 0.01 });
    io.observe(canvas);
    return () => {
      ro.disconnect();
      io.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => engineRef.current?.setSettings(settings), [settings]);
  useEffect(() => {
    if (data) engineRef.current?.setData(data);
  }, [data]);
  useEffect(() => engineRef.current?.setSelectedRoom(selectedRoom), [selectedRoom]);
  useEffect(() => engineRef.current?.setDecorMode(decorMode), [decorMode]);

  useImperativeHandle(ref, () => ({
    centerAvatar: () => engineRef.current?.centerOn("avatar"),
    reset: () => engineRef.current?.resetCamera(),
    zoom: (f) => engineRef.current?.zoomBy(f),
    pan: (dx, dy) => engineRef.current?.pan(dx, dy),
    centerRoom: (k) => engineRef.current?.centerOnRoom(k),
    moveAvatar: (x, y) => engineRef.current?.moveAvatarTo({ x, y }) ?? false,
    celebrate: (id, text) => engineRef.current?.celebrate(id, text),
  }));

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Mapa isométrico do Meu Mundo. Use os botões de ambientes abaixo do mapa para navegar pelo teclado."
      style={{ touchAction: "none", imageRendering: "pixelated" }}
    />
  );
});
