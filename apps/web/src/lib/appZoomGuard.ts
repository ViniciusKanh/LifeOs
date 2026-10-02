/**
 * Bloqueia o zoom acidental que "quebra" o layout do app:
 * - pinça no trackpad / Ctrl + roda do mouse (desktop);
 * - pinça no iOS Safari, que ignora user-scalable=no da meta viewport.
 * Atalhos de teclado (Ctrl + / Ctrl -) continuam liberados de propósito,
 * para não remover o zoom de acessibilidade de quem precisa dele.
 */
export function installAppZoomGuard(): void {
  if (typeof window === "undefined") return;

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );

  const block = (e: Event) => e.preventDefault();
  // Eventos proprietários do WebKit (iOS/macOS Safari) para gesto de pinça.
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });

  // Pinça com dois dedos em navegadores que não respeitam a meta viewport.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}
