/**
 * Sons 8-bit sintetizados (WebAudio, sem arquivos). Só tocam quando o
 * usuário liga "Sons" em Meu Perfil — desligados por padrão — e nunca
 * antes de uma interação (o navegador exige gesto para liberar o áudio).
 */
export type Sfx = "xp" | "hit" | "levelup" | "record";

const NOTES: Record<Sfx, Array<[freq: number, ms: number]>> = {
  xp: [[880, 70], [1320, 90]],
  hit: [[220, 60], [140, 90]],
  levelup: [[523, 90], [659, 90], [784, 90], [1047, 180]],
  record: [[784, 80], [988, 80], [1175, 160]],
};

let ctx: AudioContext | null = null;

export function playSfx(kind: Sfx, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    let t = ctx.currentTime;
    for (const [freq, ms] of NOTES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      // Volume baixo e envelope curto: feedback, não música.
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ms / 1000);
      t += ms / 1000;
    }
  } catch {
    // Áudio indisponível: o feedback visual continua.
  }
}
