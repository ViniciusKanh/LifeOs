/**
 * Clima da Vila — camada visual e sonora do Meu Mundo.
 *
 * O estado (`visual`) vem pronto do backend (weatherCodeUtils.worldWeatherVisual):
 * o frontend nunca interpreta código WMO. Tudo aqui é determinístico a
 * partir do tempo `t` — nenhuma partícula guarda estado entre quadros.
 */
import { drawSky, hash, isoPoint, type Ctx } from "./draw";

export type WeatherVisual = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "heavy_rain" | "snow" | "storm";

export interface WorldWeather {
  visual: WeatherVisual;
  /** 0 = sutil, 1 = médio, 2 = completo. */
  intensity: 0 | 1 | 2;
  /** Partículas (chuva/neve) ligadas. */
  particles: boolean;
  /** Direção do vento em graus (de onde sopra); inclina a chuva. */
  windDirection?: number | null;
  windSpeedKmh?: number | null;
}

export const isWet = (v: WeatherVisual) => v === "drizzle" || v === "rain" || v === "heavy_rain" || v === "storm";
/** Quanto o céu fica encoberto (0 = limpo, 1 = fechado). */
export function overcastOf(v: WeatherVisual): number {
  return { clear: 0, cloudy: 0.45, fog: 0.6, drizzle: 0.55, rain: 0.75, heavy_rain: 0.85, snow: 0.6, storm: 0.95 }[v];
}
const INTENSITY = [0.35, 0.65, 1] as const;
const RAIN_DROPS: Partial<Record<WeatherVisual, number>> = { drizzle: 140, rain: 340, heavy_rain: 560, storm: 620 };

/** Ciclo do relâmpago: um clarão a cada ~9 s, com duas piscadas. 0 = sem clarão. */
export function lightningAt(t: number): { flash: number; seed: number } {
  const period = 9000;
  const k = Math.floor(t / period);
  const offset = hash(k, 3) * 5000;
  const local = t - k * period - offset;
  if (local < 0 || local > 420) return { flash: 0, seed: k };
  const flash = local < 90 ? 1 : local < 160 ? 0.15 : local < 260 ? 0.75 : Math.max(0, 1 - (local - 260) / 160) * 0.4;
  return { flash, seed: k };
}

/** Raio desenhado no céu (espaço de tela) durante o clarão. */
export function drawBolt(ctx: Ctx, w: number, h: number, seed: number, alpha: number) {
  let x = w * (0.15 + hash(seed, 5) * 0.7);
  let y = 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#f4f0ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#b9a8ff";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 9; i++) {
    x += (hash(seed, i + 10) - 0.5) * 60;
    y += h * 0.05 + hash(seed, i + 20) * h * 0.03;
    ctx.lineTo(x, y);
    if (i === 4) {
      // galho
      ctx.moveTo(x, y);
      ctx.lineTo(x + (hash(seed, 40) - 0.5) * 90, y + h * 0.08);
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Chuva em espaço de tela: riscos inclinados pelo vento, densidade pela intensidade. */
export function drawRain(ctx: Ctx, w: number, h: number, t: number, wx: WorldWeather) {
  const n = Math.round((RAIN_DROPS[wx.visual] ?? 0) * INTENSITY[wx.intensity] * Math.min(2, (w * h) / (1400 * 900)));
  if (!n) return;
  const heavy = wx.visual === "heavy_rain" || wx.visual === "storm";
  const len = wx.visual === "drizzle" ? 7 : heavy ? 20 : 14;
  const speed = wx.visual === "drizzle" ? 0.35 : heavy ? 1.05 : 0.8;
  // vento de leste empurra a chuva para oeste e vice-versa (só a componente horizontal)
  const wind = wx.windDirection == null ? 0.25 : -Math.sin((wx.windDirection * Math.PI) / 180) * Math.min(1, (wx.windSpeedKmh ?? 10) / 25) * 0.55;
  ctx.strokeStyle = wx.visual === "drizzle" ? "rgba(210,225,255,0.45)" : "rgba(205,220,250,0.62)";
  ctx.lineWidth = heavy ? 1.6 : 1.1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x0 = hash(i, 1) * (w + 200) - 100;
    const y = ((hash(i, 2) * (h + 60) + t * speed * (0.8 + hash(i, 3) * 0.4)) % (h + 60)) - 30;
    const x = x0 + y * wind;
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * wind, y + len);
  }
  ctx.stroke();
}

/** Neve: flocos que caem balançando. */
export function drawSnow(ctx: Ctx, w: number, h: number, t: number, wx: WorldWeather) {
  const n = Math.round(260 * INTENSITY[wx.intensity]);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < n; i++) {
    const y = ((hash(i, 4) * (h + 20) + t * (0.05 + hash(i, 5) * 0.05)) % (h + 20)) - 10;
    const x = hash(i, 6) * w + Math.sin(t / 900 + i) * 12;
    const s = hash(i, 7) > 0.8 ? 3 : 2;
    ctx.fillRect(x, y, s, s);
  }
}

/** Neblina: faixas translúcidas que deslizam devagar sobre a tela. */
export function drawFog(ctx: Ctx, w: number, h: number, t: number, wx: WorldWeather) {
  const a = INTENSITY[wx.intensity];
  ctx.fillStyle = `rgba(214,222,236,${0.3 * a})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    const y = h * (0.15 + i * 0.15) + Math.sin(t / 4000 + i) * 10;
    const x = ((t / (60 + i * 15)) % (w + 600)) - 600 + hash(i, 9) * 300;
    const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    g.addColorStop(0, "rgba(220,228,240,0)");
    g.addColorStop(0.5, `rgba(225,232,244,${0.42 * a})`);
    g.addColorStop(1, "rgba(220,228,240,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y - 40, 900, 80);
    ctx.fillRect(x - w - 600, y - 40, 700, 80);
  }
}

/** Cor que escurece/esfria o mundo conforme o clima (aplicada depois da tinta do horário). */
export function weatherTint(v: WeatherVisual, intensity: 0 | 1 | 2): string | null {
  const a = INTENSITY[intensity];
  if (v === "cloudy") return `rgba(70,80,100,${0.08 * a})`;
  if (v === "drizzle") return `rgba(50,64,96,${0.12 * a})`;
  if (v === "rain") return `rgba(36,50,84,${0.18 * a})`;
  if (v === "heavy_rain") return `rgba(26,38,70,${0.24 * a})`;
  if (v === "storm") return `rgba(18,20,48,${0.32 * a})`;
  if (v === "snow") return `rgba(210,224,245,${0.1 * a})`;
  return null;
}

/** Poça com reflexo e, na chuva, anéis de gotas (espaço do mundo). */
export function drawPuddle(ctx: Ctx, x: number, y: number, t: number, seed: number, rings: boolean) {
  const [sx, sy] = isoPoint(x + (hash(seed, 1) - 0.5) * 0.4, y + (hash(seed, 2) - 0.5) * 0.4);
  const rw = 14 + hash(seed, 3) * 12;
  ctx.fillStyle = "rgba(40,60,100,0.6)";
  ctx.beginPath();
  ctx.ellipse(sx, sy, rw, rw * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // reflexo das luzes do céu
  ctx.fillStyle = "rgba(200,220,255,0.4)";
  ctx.fillRect(sx - rw * 0.5, sy - 1, rw * 0.6, 1);
  ctx.fillRect(sx + rw * 0.2, sy + 1, rw * 0.3, 1);
  if (!rings) return;
  for (let k = 0; k < 2; k++) {
    const p = ((t / 900 + hash(seed, k + 5) + k * 0.5) % 1 + 1) % 1;
    ctx.strokeStyle = `rgba(210,225,255,${0.5 * (1 - p)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx + (hash(seed, k + 7) - 0.5) * rw, sy, 1 + p * 6, (1 + p * 6) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Guarda-chuva sobre um personagem (coordenadas já na base do sprite). */
export function drawUmbrella(ctx: Ctx, sx: number, top: number, color: string, flip: boolean) {
  const cx = sx + (flip ? -5 : 5);
  ctx.save();
  ctx.translate(cx, top);
  ctx.scale(1.25, 1.25);
  ctx.translate(-cx, -top);
  ctx.strokeStyle = "#2a1a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, top + 4);
  ctx.lineTo(cx, top + 34);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 24, top + 6);
  ctx.quadraticCurveTo(cx, top - 16, cx + 24, top + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (const dx of [-12, 0, 12]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx - 6, top + 6);
    ctx.quadraticCurveTo(cx + dx, top + 1, cx + dx + 6, top + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(cx - 14, top - 3, 8, 2);
  ctx.strokeStyle = "rgba(20,12,30,0.8)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 24, top + 6);
  ctx.quadraticCurveTo(cx, top - 16, cx + 24, top + 6);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Som ambiente (opcional, só com o som do mundo ligado): ruído filtrado para
 * chuva e um estrondo grave no relâmpago. Nada toca sem o usuário ativar.
 */
export class WeatherSound {
  private ctx: AudioContext | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(private getCtx: () => AudioContext | null) {}

  private noise(ac: AudioContext, seconds: number) {
    const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  setRain(level: number) {
    try {
      const ac = (this.ctx ??= this.getCtx());
      if (!ac) return;
      if (level <= 0) {
        this.rain?.gain.gain.setTargetAtTime(0, ac.currentTime, 0.4);
        return;
      }
      if (!this.rain) {
        const src = ac.createBufferSource();
        src.buffer = this.noise(ac, 2);
        src.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1400;
        const gain = ac.createGain();
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(ac.destination);
        src.start();
        this.rain = { src, gain };
      }
      this.rain.gain.gain.setTargetAtTime(0.05 * level, ac.currentTime, 0.6);
    } catch {
      /* sem áudio */
    }
  }

  thunder() {
    try {
      const ac = (this.ctx ??= this.getCtx());
      if (!ac) return;
      const src = ac.createBufferSource();
      src.buffer = this.noise(ac, 2.5);
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 2.4);
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
      src.stop(ac.currentTime + 2.5);
    } catch {
      /* sem áudio */
    }
  }

  stop() {
    try {
      this.rain?.src.stop();
    } catch {
      /* já parado */
    }
    this.rain = null;
  }
}

/**
 * Miniatura estática de uma condição (cards de prévia): céu, colinas, uma
 * casinha com janela acesa e o efeito do clima. Sem loop de animação.
 */
export function drawWeatherThumb(canvas: HTMLCanvasElement, visual: WeatherVisual, hour: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.imageSmoothingEnabled = false;
  drawSky(ctx, w, h, 12000, 1, hour, overcastOf(visual));
  // colinas e grama
  ctx.fillStyle = "#2f6834";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.6, h * 0.7);
  ctx.quadraticCurveTo(w * 0.8, h * 0.62, w, h * 0.68);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = "#3b7d3a";
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  // casinha: parede, telhado, porta e janela acesa
  const bx = w * 0.18;
  const by = h * 0.52;
  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(bx, by, w * 0.26, h * 0.3);
  ctx.fillStyle = "#7a2a3a";
  ctx.beginPath();
  ctx.moveTo(bx - 6, by + 2);
  ctx.lineTo(bx + w * 0.13, by - h * 0.18);
  ctx.lineTo(bx + w * 0.26 + 6, by + 2);
  ctx.fill();
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(bx + w * 0.04, by + h * 0.14, w * 0.05, h * 0.16);
  ctx.fillStyle = visual === "clear" && hour >= 7 && hour < 17 ? "#9fc6e8" : "#ffd27a";
  ctx.fillRect(bx + w * 0.15, by + h * 0.08, w * 0.06, h * 0.07);
  // árvore e moinho ao fundo
  ctx.fillStyle = "#245a35";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.58, h * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(w * 0.715, h * 0.62, 4, h * 0.12);
  const tint = weatherTint(visual, 2);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
  }
  const wx: WorldWeather = { visual, intensity: 2, particles: true, windDirection: 70, windSpeedKmh: 15 };
  if (visual === "fog") drawFog(ctx, w, h, 5000, wx);
  if (isWet(visual)) drawRain(ctx, w, h, 4321, wx);
  if (visual === "snow") drawSnow(ctx, w, h, 4321, wx);
  if (visual === "storm") drawBolt(ctx, w, h * 0.75, 7, 1);
}
