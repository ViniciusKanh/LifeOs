/**
 * "+XP" flutuante saindo do ponto onde o usuário agiu (o card clicado).
 * Guarda o último toque/clique e, quando o backend confirma o XP (evento
 * real), desenha o número ali. Sem toque recente, não desenha nada.
 */
let lastPoint: { x: number; y: number; at: number } | null = null;
let listening = false;

/** Começa a lembrar o último toque/clique (chamado uma vez pelo feedback global). */
export function trackActionPoints(): () => void {
  if (listening || typeof window === "undefined") return () => {};
  listening = true;
  const onDown = (e: PointerEvent) => {
    lastPoint = { x: e.clientX, y: e.clientY, at: Date.now() };
  };
  window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  return () => {
    window.removeEventListener("pointerdown", onDown, { capture: true });
    listening = false;
  };
}

/** Ponto da última ação, se foi há pouco (o XP chega depois do servidor responder). */
export function recentActionPoint(maxAgeMs = 8000): { x: number; y: number } | null {
  if (!lastPoint || Date.now() - lastPoint.at > maxAgeMs) return null;
  return { x: lastPoint.x, y: lastPoint.y };
}

/**
 * Desenha o texto flutuante. `reduced` (preferência do sistema ou do
 * usuário) troca o voo por um fade curto no lugar.
 */
export function spawnBurst(text: string, point: { x: number; y: number }, opts: { tone?: "xp" | "damage" | "coins"; reduced?: boolean } = {}): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("span");
  el.textContent = text;
  el.className = `xp-burst xp-burst-${opts.tone ?? "xp"}${opts.reduced ? " xp-burst-reduced" : ""}`;
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${Math.round(point.x)}px`;
  el.style.top = `${Math.round(point.y)}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1300);
}
