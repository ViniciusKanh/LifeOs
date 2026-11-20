/**
 * Motor do Meu Mundo: canvas 2D isométrico, câmera, personagens, A* e
 * máquina de estados. Não depende de React — o componente WorldCanvas só
 * repassa dados/preferências e recebe as seleções. Atualizar os painéis
 * nunca reinicia o motor.
 */
import { CharacterBrain, stateForAnim, type CharState, type Intent } from "./characterMachine";
import { box, diamond, drawFlat, drawFurniture, drawPlant, drawTile, drawWall, glow, isoPoint } from "./draw";
import { findPath, nearestFree, type Point } from "./pathfinding";
import { framesFor, getSprite, SPRITE_H, SPRITE_W, type Look, type Pose } from "./sprites";
import {
  AGENT_IDLE,
  AVATAR_SPAWN,
  buildBlocked,
  facingBetween,
  FURNITURE,
  GRID,
  isoToScreen,
  PLANT_TILES,
  roomAt,
  ROOMS,
  screenToIso,
  STATIONS,
  tileKind,
  type Facing,
  type RoomKey,
  type Station,
} from "./worldMap";

export interface EngineSettings {
  quality: "low" | "medium" | "high";
  effects: 0 | 1 | 2;
  animSpeed: number;
  sound: boolean;
  autonomous: boolean;
  showNames: boolean;
  showIndicators: boolean;
  followAvatar: boolean;
  reducedMotion: boolean;
}

export interface EngineAgent {
  key: string;
  name: string;
  color: string;
  /** Estado REAL da última execução (servidor) — ou "running" enquanto o pedido está em curso. */
  status: "idle" | "running" | "done" | "failed";
  finishedAt: string | null;
}

export interface EngineData {
  avatar: { name: string; skin: string; hair: string; shirt: string; pants: string; x: number; y: number };
  activity: { room: RoomKey; title: string } | null;
  agents: EngineAgent[];
  habits: Array<{ id: string; name: string; stage: number; doneToday: boolean; pendingToday: boolean }>;
  decor: Array<{ slotKey: string; x: number; y: number; art: string | null; name: string }>;
  slots: Array<{ key: string; x: number; y: number; room: string }>;
  roomStatus: Partial<Record<RoomKey, string>>;
  localHour: number;
}

export type Selection =
  | { type: "room"; key: RoomKey }
  | { type: "avatar" }
  | { type: "agent"; key: string }
  | { type: "habit"; id: string }
  | { type: "slot"; key: string };

interface Char {
  id: string;
  isAvatar: boolean;
  name: string;
  look: Look;
  x: number;
  y: number;
  path: Point[];
  facing: Facing;
  brain: CharacterBrain;
  station: Station | null;
  frame: number;
  frameT: number;
  idleSince: number;
  celebrateUntil: number;
  bubble: { text: string; until: number; tone: "info" | "error" | "work" } | null;
  onBench: boolean;
}

const BENCHES: Point[] = [
  { x: 13, y: 12 },
  { x: 17, y: 16 },
  { x: 24, y: 27 },
];

export class WorldEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private cam = { x: 0, y: 0, zoom: 0.9 };
  private blocked = buildBlocked();
  private chars = new Map<string, Char>();
  private data: EngineData | null = null;
  private settings: EngineSettings;
  private raf = 0;
  private last = 0;
  private visible = true;
  private hover: Point | null = null;
  private selectedRoom: RoomKey | null = null;
  private decorMode = false;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; zoom: number } | null = null;
  private prevAgent = new Map<string, string>();
  private images = new Map<string, HTMLImageElement>();
  private audio: AudioContext | null = null;
  private listeners: Array<() => void> = [];
  onSelect: (s: Selection) => void = () => undefined;
  onAvatarMoved: (p: Point) => void = () => undefined;

  constructor(canvas: HTMLCanvasElement, settings: EngineSettings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.settings = settings;
    this.bindInput();
    this.resize();
    this.resetCamera();
    const onVis = () => {
      this.visible = document.visibilityState === "visible";
      if (this.visible) this.start();
    };
    document.addEventListener("visibilitychange", onVis);
    this.listeners.push(() => document.removeEventListener("visibilitychange", onVis));
    this.start();
  }

  /* ───────────── API pública ───────────── */

  setSettings(s: EngineSettings) {
    this.settings = s;
  }

  setVisible(v: boolean) {
    this.visible = v && document.visibilityState === "visible";
    if (this.visible) this.start();
  }

  setDecorMode(on: boolean) {
    this.decorMode = on;
  }

  setSelectedRoom(r: RoomKey | null) {
    this.selectedRoom = r;
  }

  setData(d: EngineData) {
    const first = !this.data;
    this.data = d;
    this.blocked = buildBlocked(d.decor.map((o) => ({ x: o.x, y: o.y })));
    for (const o of d.decor) if (o.art && !this.images.has(o.art)) {
      const img = new Image();
      img.src = o.art;
      this.images.set(o.art, img);
    }
    this.syncAvatar(d, first);
    this.syncAgents(d, first);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === "low" ? 1 : 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  resetCamera() {
    const c = isoToScreen(GRID / 2, GRID / 2);
    this.cam.zoom = Math.min(1.1, Math.max(0.45, Math.min(this.w / 1950, this.h / 1000)));
    this.cam.x = this.w / 2 - c.sx * this.cam.zoom;
    this.cam.y = this.h / 2 - c.sy * this.cam.zoom + 20;
  }

  zoomBy(f: number, ax = this.w / 2, ay = this.h / 2) {
    const nz = Math.min(2.2, Math.max(0.4, this.cam.zoom * f));
    this.cam.x = ax - ((ax - this.cam.x) * nz) / this.cam.zoom;
    this.cam.y = ay - ((ay - this.cam.y) * nz) / this.cam.zoom;
    this.cam.zoom = nz;
  }

  pan(dx: number, dy: number) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.clampCam();
  }

  centerOn(id: string) {
    const c = this.chars.get(id);
    if (!c) return;
    const s = isoToScreen(c.x, c.y);
    this.cam.x = this.w / 2 - s.sx * this.cam.zoom;
    this.cam.y = this.h / 2 - (s.sy - 30) * this.cam.zoom;
  }

  centerOnRoom(key: RoomKey) {
    const r = ROOMS.find((x) => x.key === key);
    if (!r) return;
    const s = isoToScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    this.cam.x = this.w / 2 - s.sx * this.cam.zoom;
    this.cam.y = this.h / 2 - s.sy * this.cam.zoom;
  }

  /** Movimento manual: só quando não há atividade real exigindo outro lugar. */
  moveAvatarTo(p: Point): boolean {
    const av = this.chars.get("avatar");
    if (!av) return false;
    return this.walk(av, { source: "manual", target: p, arriveState: "idle" });
  }

  /** Comemoração curta após uma ação real confirmada pelo servidor (missão/hábito). */
  celebrate(id: string, text: string) {
    const c = this.chars.get(id);
    if (!c) return;
    const now = performance.now();
    c.celebrateUntil = now + 2400;
    c.brain.set("celebrating");
    c.bubble = { text, until: now + 3500, tone: "info" };
    this.blip(988);
    window.setTimeout(() => {
      if (c.brain.state === "celebrating") c.brain.set(c.brain.intent ? c.brain.intent.arriveState : "idle");
    }, 2500);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const off of this.listeners) off();
    void this.audio?.close().catch(() => undefined);
  }

  /* ───────────── Personagens ───────────── */

  private makeChar(id: string, isAvatar: boolean, name: string, look: Look, at: Point): Char {
    const brain = new CharacterBrain();
    return { id, isAvatar, name, look, x: at.x, y: at.y, path: [], facing: "sw", brain, station: null, frame: 0, frameT: 0, idleSince: performance.now(), celebrateUntil: 0, bubble: null, onBench: false };
  }

  private walk(c: Char, intent: Intent): boolean {
    if (!c.brain.propose(intent)) return false;
    const from = { x: Math.round(c.x), y: Math.round(c.y) };
    const path = findPath(this.blocked, from, intent.target);
    if (path === null) {
      c.brain.release(intent.source);
      return false;
    }
    c.path = path;
    c.onBench = false;
    c.station = null;
    if (path.length) c.brain.set("walking");
    else this.arrive(c);
    return true;
  }

  private stationFor(c: Char, intent: Intent): Station | null {
    return Object.values(STATIONS).find((s) => s.x === intent.target.x && s.y === intent.target.y && (c.isAvatar ? s.key.startsWith("avatar") : s.key === `agent-${c.id}`)) ?? null;
  }

  private arrive(c: Char) {
    const intent = c.brain.intent;
    c.idleSince = performance.now();
    if (!intent) {
      c.brain.set("idle");
      return;
    }
    const st = this.stationFor(c, intent);
    c.station = st;
    if (st) c.facing = st.facing;
    c.onBench = BENCHES.some((b) => b.x === Math.round(c.x) && b.y === Math.round(c.y)) && intent.source === "ambient";
    c.brain.set(intent.arriveState);
    if (intent.source === "manual" && c.isAvatar) {
      c.brain.release("manual");
      this.onAvatarMoved({ x: Math.round(c.x), y: Math.round(c.y) });
    }
    if (intent.source === "ambient") c.brain.release("ambient");
  }

  private syncAvatar(d: EngineData, first: boolean) {
    const look: Look = { kind: "human", skin: d.avatar.skin, hair: d.avatar.hair, shirt: d.avatar.shirt, pants: d.avatar.pants, accent: "#F1C66A" };
    let av = this.chars.get("avatar");
    if (!av) {
      const start = nearestFree(this.blocked, { x: d.avatar.x, y: d.avatar.y }) ?? AVATAR_SPAWN;
      av = this.makeChar("avatar", true, d.avatar.name, look, start);
      this.chars.set("avatar", av);
    }
    av.look = look;
    av.name = d.avatar.name;
    if (d.activity) {
      const st = STATIONS[`avatar-${d.activity.room}`];
      if (st) {
        const same = av.brain.intent?.source === "domain" && av.brain.intent.target.x === st.x && av.brain.intent.target.y === st.y;
        if (!same) {
          // Ao recarregar a página, o avatar já aparece na estação da atividade real.
          if (first) {
            av.x = st.x;
            av.y = st.y;
          }
          av.brain.intent = null;
          this.walk(av, { source: "domain", target: { x: st.x, y: st.y }, arriveState: stateForAnim(st.anim), label: d.activity.title });
        }
      }
    } else if (av.brain.intent?.source === "domain") {
      av.brain.release("domain");
      av.station = null;
      av.brain.set("idle");
    }
  }

  private syncAgents(d: EngineData, first: boolean) {
    const now = performance.now();
    for (const a of d.agents) {
      const look: Look = { kind: "robot", skin: "#cfd6e6", hair: "#000000", shirt: a.color, pants: "#8e97ab", accent: a.color };
      let c = this.chars.get(a.key);
      const idle = AGENT_IDLE[a.key] ?? AVATAR_SPAWN;
      const st = STATIONS[`agent-${a.key}`];
      if (!c) {
        c = this.makeChar(a.key, false, a.name, look, a.status === "running" && st ? { x: st.x, y: st.y } : idle);
        this.chars.set(a.key, c);
      }
      c.look = look;
      const prev = this.prevAgent.get(a.key);
      this.prevAgent.set(a.key, a.status);
      if (a.status === "running" && st) {
        if (!(c.brain.intent?.source === "domain")) {
          c.brain.intent = null;
          this.walk(c, { source: "domain", target: { x: st.x, y: st.y }, arriveState: "working", label: "Trabalhando…" });
        }
        c.bubble = { text: "Trabalhando…", until: now + 3_600_000, tone: "work" };
      } else if (prev === "running" && !first) {
        c.brain.release("domain");
        if (a.status === "done") {
          c.celebrateUntil = now + 2600;
          c.brain.set("celebrating");
          c.bubble = { text: "Concluído!", until: now + 4000, tone: "info" };
          this.blip(880);
        } else if (a.status === "failed") {
          c.brain.set("error");
          c.bubble = { text: "Falhou", until: now + 8000, tone: "error" };
          this.blip(220);
        }
        window.setTimeout(() => this.walk(c!, { source: "ambient", target: idle, arriveState: "idle" }), a.status === "done" ? 2700 : 8000);
      } else if (a.status !== "running" && c.brain.intent?.source === "domain") {
        c.brain.release("domain");
        c.bubble = null;
        this.walk(c, { source: "ambient", target: idle, arriveState: "idle" });
      } else if (a.status === "failed" && first) {
        c.brain.set("error");
        c.bubble = { text: "Última execução falhou", until: now + 6000, tone: "error" };
      }
    }
  }

  private ambientTick(now: number) {
    if (!this.settings.autonomous || !this.data) return;
    for (const c of this.chars.values()) {
      if (c.brain.intent || c.path.length || c.brain.state === "error" || now < c.celebrateUntil) continue;
      if (now - c.idleSince < (c.isAvatar ? 7000 : 11000) + ((c.id.length * 997) % 5000)) continue;
      let target: Point;
      let arrive: CharState = "idle";
      if (c.isAvatar) {
        const night = this.data.localHour >= 23 || this.data.localHour < 6;
        if (night) {
          const st = STATIONS["avatar-casa"]!;
          target = { x: st.x, y: st.y };
          arrive = "resting";
        } else if (Math.random() < 0.35) {
          target = BENCHES[Math.floor(Math.random() * BENCHES.length)]!;
          arrive = "resting";
        } else {
          target = this.randomWalkable();
        }
      } else {
        const home = AGENT_IDLE[c.id] ?? AVATAR_SPAWN;
        target = { x: home.x + Math.round(Math.random() * 4 - 2), y: home.y + Math.round(Math.random() * 4 - 2) };
      }
      c.idleSince = now;
      this.walk(c, { source: "ambient", target, arriveState: arrive });
    }
  }

  private randomWalkable(): Point {
    for (let i = 0; i < 30; i++) {
      const p = { x: 2 + Math.floor(Math.random() * 27), y: 2 + Math.floor(Math.random() * 27) };
      if (!this.blocked[p.x]![p.y] && tileKind(p.x, p.y) !== "grass") return p;
    }
    return AVATAR_SPAWN;
  }

  private blip(freq: number) {
    if (!this.settings.sound) return;
    try {
      this.audio ??= new AudioContext();
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.frequency.value = freq;
      o.type = "square";
      g.gain.value = 0.04;
      o.connect(g).connect(this.audio.destination);
      o.start();
      o.stop(this.audio.currentTime + 0.12);
    } catch {
      /* áudio indisponível: segue sem som */
    }
  }

  /* ───────────── Loop ───────────── */

  private start() {
    if (this.raf || !this.visible) return;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = 0;
      if (!this.visible) return;
      const minDt = this.settings.quality === "low" ? 1000 / 30 : 0;
      if (t - this.last >= minDt) {
        const dt = Math.min(0.1, (t - this.last) / 1000);
        this.last = t;
        this.update(dt, t);
        this.render(t);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number, now: number) {
    const speed = 2.8 * (this.settings.reducedMotion ? 0.6 : this.settings.animSpeed);
    for (const c of this.chars.values()) {
      if (c.path.length) {
        const next = c.path[0]!;
        const dx = next.x - c.x;
        const dy = next.y - c.y;
        const dist = Math.hypot(dx, dy);
        c.facing = facingBetween(c.x, c.y, next.x, next.y);
        const step = speed * dt;
        if (dist <= step) {
          c.x = next.x;
          c.y = next.y;
          c.path.shift();
          if (!c.path.length) this.arrive(c);
        } else {
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
        }
      }
      if (c.brain.state === "celebrating" && now > c.celebrateUntil) c.brain.set("idle");
      if (c.bubble && now > c.bubble.until) c.bubble = null;
      const fps = (c.path.length ? 8 : 3) * (this.settings.reducedMotion ? 0.5 : this.settings.animSpeed);
      c.frameT += dt * fps;
      if (c.frameT >= 1) {
        c.frameT = 0;
        c.frame = (c.frame + 1) % 120;
      }
    }
    this.ambientTick(now);
    if (this.settings.followAvatar && !this.drag) {
      const av = this.chars.get("avatar");
      if (av) {
        const s = isoToScreen(av.x, av.y);
        const tx = this.w / 2 - s.sx * this.cam.zoom;
        const ty = this.h / 2 - (s.sy - 30) * this.cam.zoom;
        this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 3);
        this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 3);
      }
    }
  }

  private poseFor(c: Char): { pose: Pose; lying: boolean } {
    if (c.path.length) return { pose: "walk", lying: false };
    switch (c.brain.state) {
      case "working":
        return { pose: c.station?.anim === "interacting" ? "interact" : "typing", lying: false };
      case "studying":
        return { pose: "reading", lying: false };
      case "exercising":
        return { pose: "exercise", lying: false };
      case "resting":
        return c.station?.anim === "sleeping" ? { pose: "stand", lying: true } : { pose: "sit", lying: false };
      case "interacting":
        return { pose: "interact", lying: false };
      case "celebrating":
        return { pose: "celebrate", lying: false };
      case "thinking":
        return { pose: "think", lying: false };
      default:
        return { pose: c.onBench ? "sit" : "stand", lying: false };
    }
  }

  private render(t: number) {
    const ctx = this.ctx;
    const d = this.data;
    const fx = this.settings.reducedMotion ? 0 : this.settings.effects;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bg.addColorStop(0, "#0b1430");
    bg.addColorStop(1, "#080E22");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
    ctx.imageSmoothingEnabled = false;

    // 1) Chão
    for (let s = 0; s <= 2 * (GRID - 1); s++) {
      for (let x = Math.max(0, s - GRID + 1); x <= Math.min(GRID - 1, s); x++) {
        const y = s - x;
        drawTile(ctx, x, y, tileKind(x, y), roomAt(x, y), t, fx);
      }
    }
    for (const it of FURNITURE) if (!it.blocks) drawFlat(ctx, it, t);
    if (this.selectedRoom) {
      const r = ROOMS.find((x) => x.key === this.selectedRoom)!;
      ctx.globalAlpha = 0.12 + (fx ? Math.sin(t / 400) * 0.04 : 0);
      for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) diamond(ctx, x, y, r.accent);
      ctx.globalAlpha = 1;
    }
    if (this.decorMode && d) {
      const used = new Set(d.decor.map((o) => o.slotKey));
      for (const s of d.slots) diamond(ctx, s.x, s.y, used.has(s.key) ? "rgba(241,198,106,0.25)" : "rgba(79,212,154,0.35)", "#F1C66A", 0.9);
    }
    if (this.hover && this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < GRID && this.hover.y < GRID) diamond(ctx, this.hover.x, this.hover.y, "rgba(241,198,106,0.18)", "#F1C66A");

    // 2) Objetos ordenados por profundidade
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    for (const r of ROOMS) {
      if (!r.walls) continue;
      for (let x = r.x0; x <= r.x1; x++) items.push({ depth: x + r.y0 - 0.01, draw: () => drawWall(ctx, x, r.y0, r) });
      for (let y = r.y0 + 1; y <= r.y1; y++) items.push({ depth: r.x0 + y - 0.01, draw: () => drawWall(ctx, r.x0, y, r) });
    }
    for (const it of FURNITURE) if (it.blocks) items.push({ depth: it.x + it.y + (it.kind === "crystal" ? 1 : 0), draw: () => drawFurniture(ctx, it, t) });
    if (d) {
      d.habits.slice(0, PLANT_TILES.length).forEach((h, i) => {
        const [px, py] = PLANT_TILES[i]!;
        items.push({ depth: px + py, draw: () => drawPlant(ctx, px, py, h.stage, h.doneToday, t) });
      });
      PLANT_TILES.slice(d.habits.length).forEach(([px, py]) => items.push({ depth: px + py, draw: () => drawPlant(ctx, px, py, 0, false, t) }));
      for (const o of d.decor) {
        items.push({
          depth: o.x + o.y,
          draw: () => {
            box(ctx, o.x, o.y, 0.22, 0.22, 14, "#3b3150", 0, "#2c2440", "#211b31");
            const img = o.art ? this.images.get(o.art) : null;
            const [sx, sy] = isoPoint(o.x, o.y);
            if (img?.complete && img.naturalWidth) ctx.drawImage(img, sx - 16, sy - 50, 32, 32);
            else {
              ctx.fillStyle = "#F1C66A";
              ctx.fillRect(sx - 6, sy - 30, 12, 12);
            }
          },
        });
      }
    }
    for (const c of this.chars.values()) items.push({ depth: c.x + c.y + 0.5, draw: () => this.drawChar(c) });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // 3) Luz ambiente
    if (this.settings.quality !== "low" && fx > 0) {
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.22 + Math.sin(t / 700) * 0.06;
      const [cx, cy] = isoPoint(15, 15);
      glow(ctx, cx, cy - 60, 150, "rgba(168,117,245,ALPHA)", pulse);
      for (const it of FURNITURE) {
        if (it.kind === "lamp" || it.kind === "lantern") {
          const [lx, ly] = isoPoint(it.x, it.y);
          glow(ctx, lx, ly - 46, 70, "rgba(241,198,106,ALPHA)", 0.18);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    if (d && (d.localHour >= 19 || d.localHour < 6)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(8,14,40,0.28)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // 4) Interface no espaço de tela (rótulos sempre legíveis)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (d) this.drawRoomLabels(d);
    for (const c of this.chars.values()) this.drawCharOverlay(c, t);
    if (d && this.settings.showIndicators) {
      d.habits.slice(0, PLANT_TILES.length).forEach((h, i) => {
        if (!h.pendingToday) return;
        const [px, py] = PLANT_TILES[i]!;
        const s = this.toScreen(px, py);
        this.badge(s.x, s.y - 60 * this.cam.zoom, "!", "#F1C66A", "#1b1405");
      });
    }
    if (fx > 1 && this.settings.quality === "high") {
      ctx.fillStyle = "rgba(241,198,106,0.5)";
      for (let i = 0; i < 18; i++) {
        const px = ((i * 197 + t / 40) % this.w + this.w) % this.w;
        const py = ((i * 131 - t / 60) % this.h + this.h) % this.h;
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }

  private toScreen(x: number, y: number) {
    const s = isoToScreen(x, y);
    return { x: s.sx * this.cam.zoom + this.cam.x, y: s.sy * this.cam.zoom + this.cam.y };
  }

  private drawChar(c: Char) {
    const ctx = this.ctx;
    const { pose, lying } = this.poseFor(c);
    const back = c.facing === "ne" || c.facing === "nw";
    const flip = c.facing === "se" || c.facing === "nw";
    const spr = getSprite(c.look, pose, c.frame % framesFor(pose), back && !lying);
    const [sx, sy] = isoPoint(c.x, c.y);
    const scale = 2;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    if (lying) {
      ctx.translate(sx, sy - 18);
      ctx.rotate(-Math.PI / 2.4);
      ctx.drawImage(spr, (-SPRITE_W * scale) / 2, (-SPRITE_H * scale) / 2, SPRITE_W * scale, SPRITE_H * scale);
    } else {
      ctx.translate(sx, sy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(spr, (-SPRITE_W * scale) / 2, -SPRITE_H * scale + 4, SPRITE_W * scale, SPRITE_H * scale);
    }
    ctx.restore();
  }

  private drawCharOverlay(c: Char, t: number) {
    const ctx = this.ctx;
    const s = this.toScreen(c.x, c.y);
    const top = s.y - 70 * this.cam.zoom;
    if (this.settings.showNames) {
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      const label = c.name;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(8,14,34,0.78)";
      ctx.fillRect(s.x - w / 2, top - 16, w, 15);
      ctx.fillStyle = c.isAvatar ? "#F1C66A" : c.look.accent;
      ctx.fillText(label, s.x - w / 2 + 5, top - 5);
    }
    if (!this.settings.showIndicators) return;
    if (c.bubble) {
      const tone = c.bubble.tone === "error" ? "#F16D75" : c.bubble.tone === "work" ? "#59A9F8" : "#4FD49A";
      this.bubble(s.x, top - 22, c.bubble.text + (c.bubble.tone === "work" ? ".".repeat(Math.floor(t / 400) % 3) : ""), tone);
    } else if (c.brain.state === "resting" && c.station?.anim === "sleeping") {
      this.bubble(s.x + 10, top - 4, "Zz", "#AAB6CC");
    } else if (c.isAvatar && c.brain.intent?.source === "domain" && c.brain.intent.label && !c.path.length) {
      this.bubble(s.x, top - 22, c.brain.intent.label.slice(0, 28), "#A875F5");
    }
  }

  private bubble(x: number, y: number, text: string, color: string) {
    const ctx = this.ctx;
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = "rgba(17,26,50,0.95)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - 18, w, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, x - w / 2 + 7, y - 5);
  }

  private badge(x: number, y: number, text: string, bg: string, fg: string) {
    const ctx = this.ctx;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText(text, x - 2, y + 4);
  }

  private drawRoomLabels(d: EngineData) {
    const ctx = this.ctx;
    for (const r of ROOMS) {
      const s = this.toScreen(r.key === "praca" ? 14.5 : (r.x0 + r.x1) / 2 - 1.5, r.key === "praca" ? 11 : (r.y0 + r.y1) / 2 - 1.5);
      const y = s.y - (r.walls ? 70 : 40) * this.cam.zoom;
      const status = d.roomStatus[r.key] ?? r.subtitle;
      ctx.font = "700 13px Inter, system-ui, sans-serif";
      const w1 = ctx.measureText(r.name).width;
      ctx.font = "500 11px Inter, system-ui, sans-serif";
      const w2 = ctx.measureText(status).width;
      const w = Math.max(w1, w2) + 34;
      const x = s.x - w / 2;
      ctx.fillStyle = this.selectedRoom === r.key ? "rgba(40,30,70,0.95)" : "rgba(17,26,50,0.9)";
      ctx.strokeStyle = this.selectedRoom === r.key ? "#F1C66A" : "rgba(167,124,52,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x, y - 34, w, 34);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = r.accent;
      ctx.fillRect(x + 8, y - 25, 14, 14);
      ctx.fillStyle = "#F3F4FA";
      ctx.font = "700 13px Inter, system-ui, sans-serif";
      ctx.fillText(r.name, x + 28, y - 19);
      ctx.fillStyle = "#AAB6CC";
      ctx.font = "500 11px Inter, system-ui, sans-serif";
      ctx.fillText(status, x + 28, y - 6);
    }
  }

  /* ───────────── Entrada ───────────── */

  private pick(px: number, py: number): Selection | null {
    // Personagens primeiro (caixa do sprite na tela)
    const chars = [...this.chars.values()].sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const c of chars) {
      const s = this.toScreen(c.x, c.y);
      const hw = 16 * this.cam.zoom;
      if (px > s.x - hw && px < s.x + hw && py > s.y - 64 * this.cam.zoom && py < s.y + 4) return c.isAvatar ? { type: "avatar" } : { type: "agent", key: c.id };
    }
    const tile = screenToIso((px - this.cam.x) / this.cam.zoom, (py - this.cam.y) / this.cam.zoom);
    if (this.decorMode && this.data) {
      const slot = this.data.slots.find((s) => s.x === tile.x && s.y === tile.y);
      if (slot) return { type: "slot", key: slot.key };
    }
    if (this.data) {
      const i = PLANT_TILES.findIndex(([x, y]) => x === tile.x && y === tile.y);
      if (i >= 0 && this.data.habits[i]) return { type: "habit", id: this.data.habits[i]!.id };
    }
    const r = roomAt(tile.x, tile.y);
    return r ? { type: "room", key: r.key } : null;
  }

  private clampCam() {
    const lim = 1400 * this.cam.zoom;
    this.cam.x = Math.min(this.w / 2 + lim, Math.max(this.w / 2 - lim, this.cam.x));
    this.cam.y = Math.min(this.h / 2 + lim * 0.3, Math.max(this.h / 2 - lim * 1.2, this.cam.y));
  }

  private bindInput() {
    const el = this.canvas;
    const rel = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = rel(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.cam.zoom };
        this.drag = null;
      } else this.drag = { x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y, moved: false };
    };
    const move = (e: PointerEvent) => {
      const p = rel(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dd = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.zoomBy((this.pinch.zoom * (dd / this.pinch.d)) / this.cam.zoom, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        return;
      }
      if (this.drag) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          this.cam.x = this.drag.cx + dx;
          this.cam.y = this.drag.cy + dy;
          this.clampCam();
        }
      }
      this.hover = screenToIso((p.x - this.cam.x) / this.cam.zoom, (p.y - this.cam.y) / this.cam.zoom);
      el.style.cursor = this.drag?.moved ? "grabbing" : this.pick(p.x, p.y) ? "pointer" : "grab";
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const drag = this.drag;
      this.drag = null;
      if (drag && !drag.moved) {
        const p = rel(e);
        const sel = this.pick(p.x, p.y);
        if (sel) this.onSelect(sel);
      }
    };
    const dbl = (e: MouseEvent) => {
      const p = rel(e);
      const tile = screenToIso((p.x - this.cam.x) / this.cam.zoom, (p.y - this.cam.y) / this.cam.zoom);
      if (tile.x >= 0 && tile.y >= 0 && tile.x < GRID && tile.y < GRID) this.moveAvatarTo(tile);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = rel(e);
      this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, p.x, p.y);
    };
    const leave = () => {
      this.hover = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("dblclick", dbl);
    el.addEventListener("wheel", wheel, { passive: false });
    this.listeners.push(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("dblclick", dbl);
      el.removeEventListener("wheel", wheel);
    });
  }
}
