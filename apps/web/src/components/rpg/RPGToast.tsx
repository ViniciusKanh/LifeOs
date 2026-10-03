import { useEffect, useRef } from "react";
import clsx from "clsx";

/**
 * Aviso curto do tema RPG (sucesso/erro). Fica no canto, fecha sozinho
 * e é anunciado por leitores de tela (role="status").
 */
export function RPGToast({ message, tone = "success", onClose }: { message: string | null; tone?: "success" | "error"; onClose: () => void }) {
  // Ref evita reiniciar o tempo a cada render do pai (onClose costuma ser inline).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => closeRef.current(), 4500);
    return () => window.clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <button
      type="button"
      role="status"
      onClick={onClose}
      className={clsx(
        "fixed bottom-20 md:bottom-5 right-4 left-4 sm:left-auto z-[70] max-w-sm border-2 bg-rpg-panel px-4 py-3 text-left text-sm text-rpg-text shadow-rpg",
        tone === "success" ? "border-rpg-green" : "border-rpg-red",
      )}
      style={{ borderRadius: 3 }}
    >
      {message}
    </button>
  );
}
