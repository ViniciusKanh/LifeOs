/**
 * Motor do Meu Mundo: canvas 2D isométrico, câmera, personagens, A* e
 * máquina de estados. Não depende de React — o componente WorldCanvas só
 * repassa dados/preferências e recebe as seleções. Atualizar os painéis
 * nunca reinicia o motor.
 */
import { CharacterBrain, stateForAnim, type CharState, type Intent } from "./characterMachine";
import { box, cliff, dayPhase, floatingRock, diamond, drawFlat, drawFurniture, drawPlant, drawSky, phaseTint, drawTile, drawWall, drawWallDecor, drawWater, glow, isoPoint, platformSide, step, wallDecorLight } from "./draw";
import { findPath, nearestFree, type Point } from "./pathfinding";
import { framesFor, getSprite, SPRITE_H, SPRITE_W, type Look, type Pose } from "./sprites";
import { agentLookFor, DEFAULT_AVATAR_LOOK, normalizeLook, type CharacterLook } from "./looks";
import { drawBolt, drawFog, drawPuddle, drawRain, drawSnow, drawUmbrella, isWet, lightningAt, overcastOf, weatherTint, WeatherSound, type WorldWeather } from "./weather";
import { buildingBounds, buildingHull, buildingLights, insideHull, buildingTopZ, drawBuilding, drawBuildingAnim, drawDock, drawVillageItem, VILLAGE_KINDS } from "./drawVillage";
import { drawHusky, type PetLook } from "./adventureScenes";
import { buildConversation, type PlaceKey, type PlaceMarker, type TalkLine, type WorldFacts } from "./village";
import {
  AGENT_IDLE,
  AVATAR_SPAWN,
  buildBlocked,
  buildingAt,
  BUILDINGS,
  doorOf,
  MEET_SPOTS,
  VILLAGERS,
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
  tileZ,
  VOLUMETRIC_FREE,
  WALL_DECOR,
  zAtFloat,
  type BuildingKey,
  type Facing,
  type MeetSpot,
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
  showLabels: boolean;
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
  /** Visual personalizado pelo usuário (null = padrão da especialidade). */
  look?: Partial<CharacterLook> | null;
}

export interface EngineData {
  /** Nome, posição e visual (campos ausentes caem no padrão de looks.ts). */
  avatar: Partial<CharacterLook> & { name: string; x: number; y: number };
  activity: { room: RoomKey; title: string } | null;
  agents: EngineAgent[];
  habits: Array<{ id: string; name: string; stage: number; doneToday: boolean; pendingToday: boolean }>;
  decor: Array<{ slotKey: string; x: number; y: number; art: string | null; name: string }>;
  slots: Array<{ key: string; x: number; y: number; room: string }>;
  roomStatus: Partial<Record<RoomKey, string>>;
  localHour: number;
  /** Pendências reais do usuário (alimentam marcadores e conversas). */
  facts: WorldFacts | null;
  markers: Partial<Record<PlaceKey, PlaceMarker>>;
  /** Companheiro que segue o herói (null = sem companheiro ou oculto). */
  pet?: (PetLook & { name: string }) | null;
}

export type Selection =
  | { type: "room"; key: RoomKey }
  | { type: "avatar" }
  | { type: "agent"; key: string }
  | { type: "habit"; id: string }
  | { type: "slot"; key: string }
  | { type: "building"; key: BuildingKey }
  | { type: "npc"; id: string }
  | { type: "pet" };

interface Char {
  id: string;
  isAvatar: boolean;
  /** Aldeão decorativo (não selecionável, sem nome). */
  isNpc: boolean;
  home: Point;
  roam: number;
  lines: string[];
  /** Fala real a exibir ao chegar num ponto de patrulha. */
  say: { text: string; tone: Bubble["tone"] } | null;
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
  bubble: Bubble | null;
  onBench: boolean;
}

interface Bubble {
  text: string;
  until: number;
  tone: "info" | "error" | "work" | "talk" | "warn";
}

/** Conversa em andamento entre dois agentes (visual; dados reais nas falas). */
interface Talk {
  a: string;
  b: string;
  spot: MeetSpot;
  lines: TalkLine[];
  idx: number;
  nextAt: number;
  phase: "gather" | "talk";
  started: number;
  speaker: string | null;
}

/** Entrada de cada lugar: onde os agentes param para "olhar" uma pendência. */
const PLACE_POI: Record<PlaceKey, Point> = {
  biblioteca: { x: 9, y: 5 },
  escritorio: { x: 25, y: 9 },
  guilda: { x: 5, y: 19 },
  academia: { x: 25, y: 19 },
  casa: { x: 9, y: 25 },
  jardim: { x: 20, y: 25 },
  praca: { x: 14, y: 17 },
  ...(Object.fromEntries(BUILDINGS.map((b) => [b.key, doorOf(b).entrance])) as Record<BuildingKey, Point>),
};

const MARKER_COLOR: Record<PlaceMarker["tone"], string> = { danger: "#F16D75", warn: "#F1C66A", info: "#59A9F8" };

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
  /** Companheiro: segue o rastro do avatar (sempre por tiles já caminhados). */
  private pet = { x: 0, y: 0, placed: false, flip: false, moving: false };
  private trail: Array<{ x: number; y: number }> = [];
  /** Enquanto o usuário não mexer na câmera, redimensionar reenquadra o mundo. */
  private camTouched = false;
  private blocked = buildBlocked();
  private chars = new Map<string, Char>();
  private data: EngineData | null = null;
  private settings: EngineSettings;
  private raf = 0;
  private last = 0;
  private visible = true;
  private hover: Point | null = null;
  private selectedRoom: RoomKey | null = null;
  private selectedChar: string | null = null;
  private followChar: string | null = null;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticScale = 0;
  private labelRects: Array<{ key: PlaceKey; x: number; y: number; w: number; h: number }> = [];
  private buildingCache = new Map<BuildingKey, { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>();
  private selectedBuilding: BuildingKey | null = null;
  private talk: Talk | null = null;
  private nextTalkAt = performance.now() + 6000;
  private talkSeed = 0;
  private floaters: Array<{ x: number; y: number; z: number; text: string; color: string; born: number }> = [];
  private weather: WorldWeather | null = null;
  private weatherSound = new WeatherSound(() => {
    try {
      return (this.audio ??= new AudioContext());
    } catch {
      return null;
    }
  });
  private lastFlash = -1;
  /** Ruas e praça onde a chuva forma poças. */
  private puddleSpots: Point[] | null = null;
  /** Tiles de grama (vida ambiente: borboletas, vaga-lumes, pétalas). */
  private grassSpots: Point[] | null = null;
  private particles: Array<{ x: number; y: number; ox: number; oy: number; vx: number; vy: number; life: number; color: string }> = [];
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
  /** O usuário arrastou o mapa enquanto a câmera acompanhava alguém. */
  onFollowStop: () => void = () => undefined;

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
    const rebuild = s.quality !== this.settings.quality;
    this.settings = s;
    if (rebuild) this.staticLayer = null;
  }

  /** Clima real (ou prévia de demonstração) aplicado à Vila. null = sem clima. */
  setWeather(w: WorldWeather | null) {
    this.weather = w;
    if (!w || !isWet(w.visual) || !this.settings.sound) this.weatherSound.setRain(0);
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

  /** Destaca um personagem; com `follow`, a câmera acompanha até o usuário arrastar o mapa. */
  setSelectedBuilding(k: BuildingKey | null) {
    this.selectedBuilding = k;
  }

  centerOnBuilding(key: BuildingKey) {
    const b = BUILDINGS.find((x) => x.key === key);
    if (!b) return;
    const s = isoToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    this.camTouched = true;
    this.cam.x = this.w / 2 - s.sx * this.cam.zoom;
    this.cam.y = this.h / 2 - (s.sy - 60) * this.cam.zoom;
  }

  setSelectedChar(id: string | null, follow = false) {
    this.selectedChar = id;
    this.followChar = id && follow ? id : null;
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
    if (first) this.spawnVillagers();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === "low" ? 1 : 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    if (!this.camTouched) this.resetCamera();
  }

  resetCamera() {
    // Enquadra o núcleo e o começo da vila; o restante se explora arrastando/zoom.
    const c = isoToScreen(19, 19);
    this.cam.zoom = Math.min(1.2, Math.max(0.3, Math.min(this.w / 2250, this.h / 1300)));
    this.cam.x = this.w / 2 - c.sx * this.cam.zoom;
    this.cam.y = this.h / 2 - (c.sy + 70) * this.cam.zoom;
  }

  zoomBy(f: number, ax = this.w / 2, ay = this.h / 2) {
    this.camTouched = true;
    const nz = Math.min(2.2, Math.max(0.25, this.cam.zoom * f));
    this.cam.x = ax - ((ax - this.cam.x) * nz) / this.cam.zoom;
    this.cam.y = ay - ((ay - this.cam.y) * nz) / this.cam.zoom;
    this.cam.zoom = nz;
  }

  pan(dx: number, dy: number) {
    this.camTouched = true;
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
  celebrate(id: string, text: string, xp?: number | null) {
    const c = this.chars.get(id);
    if (!c) return;
    const now = performance.now();
    if (xp) this.floaters.push({ x: c.x, y: c.y, z: 0, text: `+${xp} XP`, color: "#F1C66A", born: now });
    if (!this.settings.reducedMotion && this.settings.effects > 0) {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        this.particles.push({ x: c.x, y: c.y, ox: 0, oy: 0, vx: Math.cos(a) * (40 + Math.random() * 40), vy: -60 - Math.random() * 60, life: 1, color: ["#F1C66A", "#A875F5", "#4FD49A", "#f3f4fa"][i % 4]! });
      }
    }
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
    this.weatherSound.stop();
    void this.audio?.close().catch(() => undefined);
  }

  /* ───────────── Personagens ───────────── */

  private makeChar(id: string, isAvatar: boolean, name: string, look: Look, at: Point): Char {
    const brain = new CharacterBrain();
    return { id, isAvatar, isNpc: false, home: at, roam: 0, lines: [], say: null, name, look, x: at.x, y: at.y, path: [], facing: "sw", brain, station: null, frame: 0, frameT: 0, idleSince: performance.now(), celebrateUntil: 0, bubble: null, onBench: false };
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
    if (c.say) {
      c.bubble = { text: c.say.text, until: performance.now() + 4500, tone: c.say.tone };
      c.say = null;
    }
  }

  /** Aldeões decorativos da vila (sempre os mesmos; não guardam estado no servidor). */
  private spawnVillagers() {
    for (const v of VILLAGERS) {
      if (this.chars.has(v.id)) continue;
      const look: Look = normalizeLook(v.look, { ...DEFAULT_AVATAR_LOOK, cape: null, prop: "nenhum" });
      const at = nearestFree(this.blocked, v.home) ?? v.home;
      const c = this.makeChar(v.id, false, "", look, at);
      c.isNpc = true;
      c.home = at;
      c.roam = v.radius;
      c.lines = v.lines;
      c.idleSince = performance.now() - Math.random() * 8000;
      this.chars.set(v.id, c);
    }
  }

  private syncAvatar(d: EngineData, first: boolean) {
    const look: Look = normalizeLook(d.avatar, DEFAULT_AVATAR_LOOK);
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
      const look: Look = agentLookFor(a.key, a.look);
      let c = this.chars.get(a.key);
      const idle = AGENT_IDLE[a.key] ?? AVATAR_SPAWN;
      const st = STATIONS[`agent-${a.key}`];
      if (!c) {
        c = this.makeChar(a.key, false, a.name, look, a.status === "running" && st ? { x: st.x, y: st.y } : idle);
        this.chars.set(a.key, c);
      }
      c.look = look;
      c.name = a.name;
      const prev = this.prevAgent.get(a.key);
      this.prevAgent.set(a.key, a.status);
      if (a.status === "running" && st) {
        if (this.talk && (this.talk.a === a.key || this.talk.b === a.key)) this.endTalk(now);
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
    const d = this.data;
    const night = d.localHour >= 23 || d.localHour < 6;
    this.talkTick(now);
    for (const c of this.chars.values()) {
      if (c.brain.intent || c.path.length || c.brain.state === "error" || c.brain.state === "talking" || now < c.celebrateUntil) continue;
      if (this.talk && (this.talk.a === c.id || this.talk.b === c.id)) continue;
      const wait = c.isNpc ? 6000 : c.isAvatar ? 7000 : 11000;
      if (now - c.idleSince < wait + ((c.id.length * 997) % 5000)) continue;
      let target: Point;
      let arrive: CharState = "idle";
      if (c.isNpc) {
        if (night && c.id !== "npc-guarda") {
          c.idleSince = now;
          continue;
        }
        const wx = this.weather;
        if (wx && (wx.visual === "storm" || (isWet(wx.visual) && !this.usesUmbrella(c)))) {
          // Tempestade (ou chuva sem guarda-chuva): procura a porta coberta mais próxima e espera lá.
          const door = this.nearestShelter(c);
          if (door && (Math.abs(door.x - c.x) + Math.abs(door.y - c.y) > 1)) {
            c.idleSince = now;
            if (Math.random() < 0.5) c.say = { text: wx.visual === "storm" ? "Que tempestade! Vou me abrigar." : "Esqueci o guarda-chuva!", tone: "talk" };
            this.walk(c, { source: "ambient", target: door, arriveState: "idle" });
          } else c.idleSince = now;
          continue;
        }
        if (wx && isWet(wx.visual) && Math.random() < 0.25) c.say = { text: ["Chuva boa pra plantação.", "Cuidado com as poças!", "Dia de ficar perto da lareira."][Math.floor(Math.random() * 3)]!, tone: "talk" };
        target = { x: c.home.x + Math.round((Math.random() * 2 - 1) * c.roam), y: c.home.y + Math.round((Math.random() * 2 - 1) * c.roam) };
        if (Math.random() < 0.2 && c.lines.length) c.say = { text: c.lines[Math.floor(Math.random() * c.lines.length)]!, tone: "talk" };
      } else if (c.isAvatar) {
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
        // Agentes patrulham os lugares com pendência real e comentam o que viram.
        const marked = (Object.entries(d.markers) as Array<[PlaceKey, PlaceMarker]>).filter(([k]) => PLACE_POI[k]);
        if (marked.length && Math.random() < 0.45) {
          const [k, m] = marked[Math.floor(Math.random() * marked.length)]!;
          target = PLACE_POI[k];
          arrive = "thinking";
          c.say = { text: m.text, tone: m.tone === "danger" ? "error" : m.tone === "warn" ? "warn" : "info" };
        } else {
          const home = AGENT_IDLE[c.id] ?? AVATAR_SPAWN;
          target = { x: home.x + Math.round(Math.random() * 4 - 2), y: home.y + Math.round(Math.random() * 4 - 2) };
        }
      }
      c.idleSince = now;
      if (target.x < 0 || target.y < 0 || target.x >= GRID || target.y >= GRID) continue;
      if (!this.walk(c, { source: "ambient", target, arriveState: arrive })) c.say = null;
    }
  }

  /** Agentes livres se encontram em pontos da vila e conversam sobre dados reais. */
  private talkTick(now: number) {
    const d = this.data;
    if (!d) return;
    const t = this.talk;
    if (t) {
      const a = this.chars.get(t.a);
      const b = this.chars.get(t.b);
      if (!a || !b || a.brain.intent?.source === "domain" || b.brain.intent?.source === "domain" || (t.phase === "gather" && now - t.started > 30000)) {
        this.endTalk(now);
        return;
      }
      if (t.phase === "gather") {
        const ready = (c: Char, p: Point) => !c.path.length && Math.round(c.x) === p.x && Math.round(c.y) === p.y;
        if (ready(a, t.spot.a) && ready(b, t.spot.b)) {
          t.phase = "talk";
          t.nextAt = now + 300;
          a.facing = facingBetween(a.x, a.y, b.x, b.y);
          b.facing = facingBetween(b.x, b.y, a.x, a.y);
          a.brain.set("talking");
          b.brain.set("talking");
        }
        return;
      }
      if (now < t.nextAt) return;
      const line = t.lines[t.idx];
      if (!line) {
        this.endTalk(now);
        return;
      }
      const sp = line.speaker === 0 ? a : b;
      sp.bubble = { text: line.text, until: now + 3300, tone: "talk" };
      t.speaker = sp.id;
      t.idx++;
      t.nextAt = now + 3500;
      return;
    }
    if (now < this.nextTalkAt) return;
    this.nextTalkAt = now + 5000;
    const free = d.agents
      .map((x) => this.chars.get(x.key))
      .filter((c): c is Char => !!c && !c.brain.intent && !c.path.length && (c.brain.state === "idle" || c.brain.state === "thinking") && now > c.celebrateUntil);
    if (free.length < 2) return;
    const seed = this.talkSeed++;
    const i = seed % free.length;
    const a = free[i]!;
    const b = free[(i + 1 + (seed % (free.length - 1))) % free.length]!;
    if (a === b) return;
    const spot = MEET_SPOTS[(seed * 7 + 3) % MEET_SPOTS.length]!;
    const na = d.agents.find((x) => x.key === a.id)!;
    const nb = d.agents.find((x) => x.key === b.id)!;
    const lines = buildConversation({ key: na.key, name: na.name }, { key: nb.key, name: nb.name }, d.facts, seed * 31 + Math.floor(now / 1000));
    a.say = null;
    b.say = null;
    if (!this.walk(a, { source: "ambient", target: spot.a, arriveState: "idle" })) return;
    if (!this.walk(b, { source: "ambient", target: spot.b, arriveState: "idle" })) {
      a.brain.release("ambient");
      return;
    }
    this.talk = { a: a.id, b: b.id, spot, lines, idx: 0, nextAt: 0, phase: "gather", started: now, speaker: null };
  }

  private endTalk(now: number) {
    const t = this.talk;
    if (!t) return;
    this.talk = null;
    for (const id of [t.a, t.b]) {
      const c = this.chars.get(id);
      if (!c) continue;
      if (c.brain.state === "talking") c.brain.set("idle");
      c.idleSince = now;
    }
    this.nextTalkAt = now + 16000 + Math.random() * 14000;
  }

  private randomWalkable(): Point {
    for (let i = 0; i < 30; i++) {
      const p = { x: 2 + Math.floor(Math.random() * (GRID - 4)), y: 2 + Math.floor(Math.random() * (GRID - 4)) };
      const k = tileKind(p.x, p.y);
      if (!this.blocked[p.x]![p.y] && k !== "grass" && k !== "dock") return p;
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

  private updatePet(dt: number) {
    const av = this.chars.get("avatar");
    if (!av || !this.data?.pet) return;
    if (!this.pet.placed) {
      this.pet = { x: av.x, y: av.y + 0.6, placed: true, flip: false, moving: false };
      this.trail = [];
    }
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - av.x, last.y - av.y) > 0.25) this.trail.push({ x: av.x, y: av.y });
    if (this.trail.length > 40) this.trail.shift();
    // Fica ~1 tile atrás no rastro; parado, senta ao lado.
    const target = this.trail.length > 4 ? this.trail[this.trail.length - 5]! : null;
    this.pet.moving = false;
    if (!target) return;
    const dx = target.x - this.pet.x;
    const dy = target.y - this.pet.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return;
    const step = Math.min(dist, (dist > 2 ? 4.2 : 3) * dt * (this.settings.reducedMotion ? 0.6 : this.settings.animSpeed));
    const before = isoPoint(this.pet.x, this.pet.y)[0];
    this.pet.x += (dx / dist) * step;
    this.pet.y += (dy / dist) * step;
    this.pet.flip = isoPoint(this.pet.x, this.pet.y)[0] < before;
    this.pet.moving = true;
    // Avatar teleportou (troca de sala): o companheiro vai junto.
    if (dist > 6) this.pet = { ...this.pet, x: av.x, y: av.y + 0.6 };
  }

  private update(dt: number, now: number) {
    this.updatePet(dt);
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
    for (const p of this.particles) {
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.vy += 160 * dt;
      p.life -= dt * 1.1;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.floaters = this.floaters.filter((f) => now - f.born < 1800);
    const followId = this.followChar ?? (this.settings.followAvatar ? "avatar" : null);
    if (followId && !this.drag) {
      const av = this.chars.get(followId);
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
      case "talking":
        return { pose: this.talk?.speaker === c.id && c.bubble ? "talk" : "stand", lying: false };
      default:
        return { pose: c.onBench ? "sit" : "stand", lying: false };
    }
  }

  /** Limites do mundo em pixels (antes da câmera), para a camada estática. */
  private static readonly WB = { x: -(GRID * 32) - 90, y: -260, w: GRID * 64 + 180, h: GRID * 32 + 560 };

  /**
   * Camada estática em cache: pisos texturizados, plataformas, degraus,
   * penhascos, tapetes e paredes. Redesenhada só quando a qualidade muda —
   * o quadro a quadro desenha apenas o que se move ou brilha.
   */
  private buildStatic() {
    // Mundo grande: escala do cache limitada para caber na memória de celulares.
    const scale = this.settings.quality === "high" ? 1.5 : this.settings.quality === "medium" ? 1.25 : 1;
    const WB = WorldEngine.WB;
    const c = document.createElement("canvas");
    c.width = Math.round(WB.w * scale);
    c.height = Math.round(WB.h * scale);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, -WB.x * scale, -WB.y * scale);
    ctx.imageSmoothingEnabled = false;
    // ilhotas flutuando em volta (atrás dos penhascos)
    for (const [rx, ry, rr, seed] of [[46, 6, 34, 1], [44, 30, 22, 2], [8, 46, 28, 3], [30, 47, 18, 4], [-4, 24, 20, 5], [24, -4, 16, 6]] as const) {
      const [sx, sy] = isoPoint(rx, ry);
      floatingRock(ctx, sx, sy + 60, rr * 1.5, seed);
    }
    // penhascos das bordas frontais (ilha flutuante)
    for (let i = 0; i < GRID; i++) {
      cliff(ctx, GRID - 1, i, "se");
      cliff(ctx, i, GRID - 1, "sw");
    }
    for (let s = 0; s <= 2 * (GRID - 1); s++) {
      for (let x = Math.max(0, s - GRID + 1); x <= Math.min(GRID - 1, s); x++) {
        const y = s - x;
        const z = tileZ(x, y);
        const kind = tileKind(x, y);
        const room = roomAt(x, y);
        ctx.save();
        ctx.translate(0, -z);
        if (kind !== "water") drawTile(ctx, x, y, kind, room);
        ctx.restore();
        // laterais da plataforma e degraus para o vizinho mais baixo
        for (const [nx, ny, side] of [[x, y + 1, "sw"], [x + 1, y, "se"]] as const) {
          if (nx >= GRID || ny >= GRID) continue;
          const nz = tileZ(nx, ny);
          if (nz >= z) continue;
          ctx.save();
          ctx.translate(0, -z);
          platformSide(ctx, x, y, side, z - nz, room?.wall ?? "#6d685e");
          ctx.restore();
          if (room && (tileKind(nx, ny) === "path" || tileKind(nx, ny) === "plaza") && (x + y) % 2 === 0) {
            ctx.save();
            ctx.translate(0, -nz);
            step(ctx, nx, ny, side === "sw" ? "y" : "x", (z - nz) / 2);
            ctx.restore();
          }
        }
      }
    }
    for (const it of FURNITURE) {
      if (it.blocks || VOLUMETRIC_FREE.has(it.kind)) continue;
      ctx.save();
      ctx.translate(0, -tileZ(it.x, it.y));
      drawFlat(ctx, it);
      ctx.restore();
    }
    for (const r of ROOMS) {
      if (!r.walls) continue;
      ctx.save();
      ctx.translate(0, -tileZ(r.x0, r.y0));
      for (let y = r.y1; y > r.y0; y--) drawWall(ctx, r.x0, y, r);
      for (let x = r.x1; x >= r.x0; x--) drawWall(ctx, x, r.y0, r);
      for (const d of WALL_DECOR) {
        if (d.kind === "torch" || d.kind === "screen" || d.kind === "fireplace" || d.kind === "window") continue;
        if (roomAt(d.x, d.y) === r) drawWallDecor(ctx, d, r, 0, false);
      }
      ctx.restore();
    }
    this.staticLayer = c;
    this.staticScale = scale;
    // Cada construção da vila num canvas próprio (desenhada por profundidade a cada quadro).
    this.buildingCache.clear();
    for (const b of BUILDINGS) {
      const bb = buildingBounds(b);
      const bc = document.createElement("canvas");
      bc.width = Math.round(bb.w * scale);
      bc.height = Math.round(bb.h * scale);
      const bctx = bc.getContext("2d")!;
      bctx.setTransform(scale, 0, 0, scale, -bb.x * scale, -bb.y * scale);
      drawBuilding(bctx, b);
      this.buildingCache.set(b.key, { canvas: bc, ...bb });
    }
  }

  private render(t: number) {
    const ctx = this.ctx;
    const d = this.data;
    const fx = this.settings.reducedMotion ? 0 : this.settings.effects;
    const night = !!d && (d.localHour >= 19 || d.localHour < 6);
    if (!this.staticLayer) this.buildStatic();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const phase = dayPhase(d?.localHour ?? 21);
    const wx = this.weather;
    const wet = !!wx && isWet(wx.visual);
    drawSky(ctx, this.w, this.h, t, fx, d?.localHour ?? 21, wx ? overcastOf(wx.visual) * (0.55 + wx.intensity * 0.225) : 0);
    if (fx > 0 && (phase === "day" || phase === "dawn") && !wet && wx?.visual !== "fog") this.drawBirds(t);
    // relâmpago: o clarão ilumina o céu e o raio aparece por trás da ilha
    const bolt = wx?.visual === "storm" && fx > 0 ? lightningAt(t) : null;
    if (bolt && bolt.flash > 0.5) drawBolt(ctx, this.w, this.h * 0.6, bolt.seed, bolt.flash);
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
    ctx.imageSmoothingEnabled = false;

    // 1) Camada estática + elementos animados de fundo
    const WB = WorldEngine.WB;
    if (this.staticLayer) ctx.drawImage(this.staticLayer, WB.x, WB.y, WB.w, WB.h);
    for (let x = 0; x < GRID; x++)
      for (let y = 0; y < GRID; y++) {
        const k = tileKind(x, y);
        if (k === "water" || k === "dock") drawWater(ctx, x, y, t, fx);
        if (k === "dock") drawDock(ctx, x, y);
      }
    // poças nas ruas e na praça enquanto chove
    if (wet) {
      if (!this.puddleSpots) {
        this.puddleSpots = [];
        for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
          const k = tileKind(x, y);
          if ((k === "path" || k === "plaza" || k === "dirt") && (x * 31 + y * 17) % 7 === 0) this.puddleSpots.push({ x, y });
        }
      }
      for (const p of this.puddleSpots) {
        ctx.save();
        ctx.translate(0, -tileZ(p.x, p.y));
        drawPuddle(ctx, p.x, p.y, t, p.x * 41 + p.y, fx > 0 && wx!.particles);
        ctx.restore();
      }
    }
    // anel de missão no chão, na porta de cada construção com pendência
    if (d && this.settings.showIndicators) {
      for (const b of BUILDINGS) {
        const m = d.markers[b.key];
        if (!m) continue;
        const e = doorOf(b).entrance;
        ctx.globalAlpha = 0.45 + (fx ? Math.sin(t / 350) * 0.2 : 0);
        diamond(ctx, e.x, e.y, "rgba(0,0,0,0)", MARKER_COLOR[m.tone], 0.9);
        diamond(ctx, e.x, e.y, "rgba(0,0,0,0)", MARKER_COLOR[m.tone], 0.6);
        ctx.globalAlpha = 1;
      }
    }
    for (const r of ROOMS) {
      if (!r.walls) continue;
      ctx.save();
      ctx.translate(0, -tileZ(r.x0, r.y0));
      for (const w of WALL_DECOR) if ((w.kind === "torch" || w.kind === "screen" || w.kind === "fireplace" || w.kind === "window") && roomAt(w.x, w.y) === r) drawWallDecor(ctx, w, r, t, night);
      ctx.restore();
    }
    if (this.selectedRoom) {
      const r = ROOMS.find((x) => x.key === this.selectedRoom)!;
      ctx.globalAlpha = 0.14 + (fx ? Math.sin(t / 400) * 0.05 : 0);
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++) {
          ctx.save();
          ctx.translate(0, -tileZ(x, y));
          diamond(ctx, x, y, r.accent);
          ctx.restore();
        }
      ctx.globalAlpha = 1;
    }
    if (this.selectedBuilding) {
      const b = BUILDINGS.find((x) => x.key === this.selectedBuilding);
      if (b) {
        ctx.globalAlpha = 0.25 + (fx ? Math.sin(t / 400) * 0.08 : 0);
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (let y = b.y0 - 1; y <= b.y1 + 1; y++) if (!buildingAt(x, y)) diamond(ctx, x, y, b.accent);
        ctx.globalAlpha = 1;
      }
    }
    const lifted = (x: number, y: number, draw: () => void) => {
      ctx.save();
      ctx.translate(0, -tileZ(x, y));
      draw();
      ctx.restore();
    };
    if (this.decorMode && d) {
      const used = new Set(d.decor.map((o) => o.slotKey));
      for (const sl of d.slots) lifted(sl.x, sl.y, () => diamond(ctx, sl.x, sl.y, used.has(sl.key) ? "rgba(241,198,106,0.3)" : `rgba(79,212,154,${0.3 + Math.sin(t / 300) * 0.12})`, "#F1C66A", 0.9));
    }
    if (this.hover && this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < GRID && this.hover.y < GRID) {
      const hv = this.hover;
      lifted(hv.x, hv.y, () => diamond(ctx, hv.x, hv.y, "rgba(241,198,106,0.16)", "#F1C66A"));
    }
    // marcador do personagem selecionado (no chão)
    const sel = this.selectedChar ? this.chars.get(this.selectedChar) : null;
    if (sel) {
      const [sx, sy] = isoPoint(sel.x, sel.y);
      const z = zAtFloat(sel.x, sel.y);
      ctx.strokeStyle = "#F1C66A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy - z, 20 + Math.sin(t / 250) * 2, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2) Objetos ordenados por profundidade
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    for (const it of FURNITURE)
      if (it.blocks || VOLUMETRIC_FREE.has(it.kind))
        items.push({
          depth: it.x + it.y + (it.kind === "crystal" ? 1 : 0) - (it.kind === "chair" ? 0.1 : 0),
          draw: () => lifted(it.x, it.y, () => (VILLAGE_KINDS.has(it.kind) ? drawVillageItem(ctx, it, t) : drawFurniture(ctx, it, t))),
        });
    // Construções: chave de profundidade na diagonal central da pegada (pegadas quadradas).
    for (const b of BUILDINGS) {
      const cache = this.buildingCache.get(b.key);
      items.push({
        depth: b.x0 + b.y0 + (b.x1 - b.x0),
        draw: () => {
          if (cache) ctx.drawImage(cache.canvas, cache.x, cache.y, cache.w, cache.h);
          drawBuildingAnim(ctx, b, t, fx);
        },
      });
    }
    if (d) {
      d.habits.slice(0, PLANT_TILES.length).forEach((h, i) => {
        const [px, py] = PLANT_TILES[i]!;
        items.push({ depth: px + py, draw: () => lifted(px, py, () => drawPlant(ctx, px, py, h.stage, h.doneToday, t)) });
      });
      PLANT_TILES.slice(d.habits.length).forEach(([px, py]) => items.push({ depth: px + py, draw: () => lifted(px, py, () => drawPlant(ctx, px, py, 0, false, t)) }));
      for (const o of d.decor) {
        items.push({
          depth: o.x + o.y,
          draw: () =>
            lifted(o.x, o.y, () => {
              box(ctx, o.x, o.y, 0.22, 0.22, 14, "#4a3f63", 0, "#3a3150", "#2c2440");
              box(ctx, o.x, o.y, 0.24, 0.24, 2, "#A77C34", 14);
              const img = o.art ? this.images.get(o.art) : null;
              const [sx, sy] = isoPoint(o.x, o.y);
              const bob = fx ? Math.sin(t / 700 + o.x) * 2 : 0;
              if (img?.complete && img.naturalWidth) ctx.drawImage(img, sx - 16, sy - 52 + bob, 32, 32);
              else {
                ctx.fillStyle = "#F1C66A";
                ctx.fillRect(sx - 6, sy - 32, 12, 12);
              }
            }),
        });
      }
    }
    for (const c of this.chars.values()) items.push({ depth: c.x + c.y + 0.5, draw: () => this.drawChar(c, t) });
    const pet = this.data?.pet;
    if (pet && this.pet.placed) {
      const { x: qx, y: qy, flip, moving } = this.pet;
      items.push({
        depth: qx + qy + 0.45,
        draw: () => {
          const [sx, sy] = isoPoint(qx, qy);
          // Andando ele está sempre "feliz"; parado mostra o humor real.
          const mood = moving ? "feliz" : pet.mood;
          drawHusky(this.ctx, sx, sy - zAtFloat(qx, qy) + (moving ? -Math.abs(Math.sin(t / 90)) * 2 : 0), 1.7, { ...pet, mood }, this.settings.reducedMotion ? 0 : t, flip);
        },
      });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // vida ambiente (só visual; some com movimento reduzido ou efeitos desligados)
    if (fx > 0 && this.settings.quality !== "low" && !wet && wx?.visual !== "snow") this.drawAmbient(t, phase);

    // partículas e números flutuantes (mundo)
    for (const p of this.particles) {
      const [sx, sy] = isoPoint(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx + p.ox, sy - zAtFloat(p.x, p.y) - 40 + p.oy, 3, 3);
    }
    ctx.globalAlpha = 1;

    // 3) Luz: noite escurece; tochas, velas, monitores e cristal iluminam
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tint = phaseTint(phase);
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (wx) {
      const wt = weatherTint(wx.visual, wx.intensity);
      if (wt) {
        ctx.fillStyle = wt;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
    if (this.settings.quality !== "low" && fx > 0) {
      ctx.globalCompositeOperation = "lighter";
      // Tempo fechado acende e aquece as luzes da Vila (janelas, postes, lareiras).
      const k = (night ? 1.4 : 1) * (wet ? 1.35 : wx?.visual === "fog" || wx?.visual === "cloudy" ? 1.15 : 1);
      const pulse = (0.24 + Math.sin(t / 700) * 0.07) * k;
      const [cx, cy] = isoPoint(15, 15);
      glow(ctx, cx, cy - 6 - 95, 210, "rgba(168,117,245,ALPHA)", pulse);
      for (const it of FURNITURE) {
        const z = tileZ(it.x, it.y);
        const [lx, ly] = isoPoint(it.x, it.y);
        if (it.kind === "lamp" || it.kind === "lantern") glow(ctx, lx, ly - z - 50, 80, "rgba(255,190,90,ALPHA)", 0.2 * k);
        else if (it.kind === "candelabra" || it.kind === "nightstand" || it.kind === "desk") glow(ctx, lx, ly - z - 30, 46, "rgba(255,180,80,ALPHA)", 0.14 * k);
        else if (it.kind === "pcdesk" || it.kind === "server") glow(ctx, lx, ly - z - 36, 60, "rgba(89,169,248,ALPHA)", 0.16 * k);
        else if (it.kind === "campfire" || it.kind === "forge") glow(ctx, lx, ly - 14, 110, "rgba(255,140,50,ALPHA)", (0.3 + Math.sin(t / 130 + it.x) * 0.05) * k);
      }
      const lit = night || wet || wx?.visual === "fog";
      for (const b of BUILDINGS) for (const [lx, ly] of buildingLights(b)) glow(ctx, lx, ly, lit ? 46 : 26, b.style === "tower" ? "rgba(190,140,255,ALPHA)" : "rgba(246,200,110,ALPHA)", lit ? 0.2 : 0.08);
      for (const w of WALL_DECOR) {
        const r = roomAt(w.x, w.y);
        if (!r) continue;
        const L = wallDecorLight(w, r);
        const z = tileZ(w.x, w.y);
        const flick = 0.9 + Math.sin(t / 110 + w.x * 7) * 0.1;
        if (w.kind === "torch") glow(ctx, L.x, L.y - z, 90, "rgba(255,150,60,ALPHA)", 0.24 * k * flick);
        else if (w.kind === "fireplace") glow(ctx, L.x, L.y - z, 120, "rgba(255,140,50,ALPHA)", 0.28 * k * flick);
        else if (w.kind === "stained") glow(ctx, L.x, L.y - z - 30, 70, "rgba(170,120,255,ALPHA)", 0.14 * k);
        else if (w.kind === "window" && (night || wet)) glow(ctx, L.x, L.y - z, 50, "rgba(246,210,122,ALPHA)", 0.16);
        else if (w.kind === "screen") glow(ctx, L.x, L.y - z, 60, "rgba(89,169,248,ALPHA)", 0.18 * k);
      }
      ctx.globalCompositeOperation = "source-over";
      // vagalumes no jardim e faíscas mágicas na praça
      if (fx > 1 && !wet) {
        for (let i = 0; i < 16; i++) {
          const gx = 21.5 + ((i * 37) % 70) / 10 + Math.sin(t / 1500 + i) * 0.5;
          const gy = 21.5 + ((i * 53) % 70) / 10 + Math.cos(t / 1700 + i) * 0.5;
          const [sx, sy] = isoPoint(gx, gy);
          ctx.fillStyle = `rgba(200,255,140,${0.4 + Math.sin(t / 300 + i) * 0.4})`;
          ctx.fillRect(sx, sy - 18 - Math.sin(t / 600 + i) * 8, 2, 2);
        }
        for (let i = 0; i < 14; i++) {
          const a = t / 2000 + i;
          const r = 30 + (i % 4) * 14;
          ctx.fillStyle = `rgba(220,190,255,${0.5 + Math.sin(t / 400 + i) * 0.4})`;
          ctx.fillRect(cx + Math.cos(a) * r, cy - 6 - 40 - ((t / 20 + i * 30) % 90), 2, 2);
        }
      }
    }

    // 3b) Clima no espaço de tela: neblina, chuva/neve e clarão do relâmpago
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (wx) {
      if (wx.visual === "fog") drawFog(ctx, this.w, this.h, fx > 0 ? t : 0, wx);
      if (wx.particles && fx > 0) {
        if (wet) drawRain(ctx, this.w, this.h, t, wx);
        else if (wx.visual === "snow") drawSnow(ctx, this.w, this.h, t, wx);
      }
      if (bolt && bolt.flash > 0) {
        ctx.fillStyle = `rgba(225,225,255,${0.35 * bolt.flash})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      // som: chuva contínua e trovão a cada novo relâmpago (só com o som do mundo ligado)
      if (this.settings.sound) {
        this.weatherSound.setRain(wet ? (wx.visual === "drizzle" ? 0.4 : wx.visual === "rain" ? 0.7 : 1) * (0.5 + wx.intensity * 0.25) : 0);
        if (bolt && bolt.flash > 0 && bolt.seed !== this.lastFlash) {
          this.lastFlash = bolt.seed;
          this.weatherSound.thunder();
        }
      } else this.weatherSound.setRain(0);
    }

    // 4) Interface no espaço de tela
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.labelRects = [];
    if (d && this.settings.showLabels) this.drawRoomLabels(d);
    if (d && this.settings.showIndicators) this.drawMarkers(d, t);
    for (const c of this.chars.values()) this.drawCharOverlay(c, t);
    if (d && this.settings.showIndicators) {
      d.habits.slice(0, PLANT_TILES.length).forEach((h, i) => {
        if (!h.pendingToday) return;
        const [px, py] = PLANT_TILES[i]!;
        const s = this.toScreen(px, py, tileZ(px, py));
        this.badge(s.x, s.y - (58 + Math.sin(t / 300) * 3) * this.cam.zoom, "!", "#F1C66A", "#1b1405");
      });
    }
    const now = performance.now();
    for (const f of this.floaters) {
      const age = (now - f.born) / 1800;
      const s = this.toScreen(f.x, f.y, zAtFloat(f.x, f.y));
      ctx.globalAlpha = 1 - age;
      ctx.font = "800 18px Inter, system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1b1405";
      const y = s.y - (90 + age * 50) * this.cam.zoom;
      const w = ctx.measureText(f.text).width;
      ctx.strokeText(f.text, s.x - w / 2, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x - w / 2, y);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Borboletas e pétalas de dia, vaga-lumes à noite. Posições derivadas de
   * `t` e de sementes fixas — nada é guardado nem sorteado a cada quadro.
   */
  private drawAmbient(t: number, phase: ReturnType<typeof dayPhase>) {
    const ctx = this.ctx;
    if (!this.grassSpots) {
      this.grassSpots = [];
      for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) if (tileKind(x, y) === "grass" && (x * 7 + y * 13) % 9 === 0) this.grassSpots.push({ x, y });
    }
    const spots = this.grassSpots;
    if (!spots.length) return;
    const pick = (i: number) => spots[(i * 37) % spots.length]!;
    if (phase === "night") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 28; i++) {
        const sp = pick(i + 3);
        const [bx, by] = isoPoint(sp.x, sp.y);
        const x = bx + Math.sin(t / 1700 + i * 2.1) * 26;
        const y = by - zAtFloat(sp.x, sp.y) - 18 + Math.cos(t / 1300 + i) * 10;
        const a = 0.35 + Math.max(0, Math.sin(t / 600 + i * 1.7)) * 0.65;
        glow(ctx, x, y, 9, "rgba(190,255,120,ALPHA)", 0.35 * a);
        ctx.fillStyle = `rgba(230,255,160,${a})`;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.restore();
      return;
    }
    // borboletas: voo em oito com bater de asas
    const colors = ["#F1C66A", "#F3F4FA", "#E78FC0", "#7FC8F8", "#F19A5A"];
    for (let i = 0; i < 9; i++) {
      const sp = pick(i * 5 + 1);
      const [bx, by] = isoPoint(sp.x, sp.y);
      const k = t / 2400 + i * 1.3;
      const x = bx + Math.sin(k) * 34;
      const y = by - zAtFloat(sp.x, sp.y) - 22 + Math.sin(k * 2) * 10 + Math.sin(t / 160 + i) * 1.5;
      const open = Math.floor(t / 110 + i) % 2 === 0;
      ctx.fillStyle = colors[i % colors.length]!;
      if (open) {
        ctx.fillRect(x - 3, y - 2, 2, 3);
        ctx.fillRect(x + 1, y - 2, 2, 3);
      } else {
        ctx.fillRect(x - 1, y - 3, 1, 3);
        ctx.fillRect(x + 1, y - 3, 1, 3);
      }
      ctx.fillStyle = "#2a1a10";
      ctx.fillRect(x, y - 2, 1, 3);
    }
    // pétalas de cerejeira levadas pelo vento
    ctx.fillStyle = "#F7B6D2";
    for (let i = 0; i < 16; i++) {
      const sp = pick(i * 11 + 7);
      const [bx, by] = isoPoint(sp.x, sp.y);
      const life = ((t / 9000 + i * 0.37) % 1 + 1) % 1;
      const x = bx - 30 + life * 90 + Math.sin(t / 500 + i) * 4;
      const y = by - zAtFloat(sp.x, sp.y) - 60 + life * 58;
      ctx.globalAlpha = Math.min(1, (1 - life) * 3, life * 6);
      ctx.fillRect(x, y, 2, 1 + (Math.floor(t / 300 + i) % 2));
    }
    ctx.globalAlpha = 1;
  }

  /** Pássaros cruzando o céu de dia (espaço de tela, atrás de nada). */
  private drawBirds(t: number) {
    const ctx = this.ctx;
    for (let flock = 0; flock < 2; flock++) {
      const period = 38000 + flock * 9000;
      const p = ((t + flock * 17000) % period) / period;
      const ox = -80 + p * (this.w + 160);
      const oy = this.h * (0.12 + flock * 0.1) + Math.sin(p * 6) * 12;
      ctx.fillStyle = "rgba(30,40,70,0.75)";
      for (let i = 0; i < 4 + flock; i++) {
        const x = ox - i * 14 - (i % 2) * 4;
        const y = oy + (i % 2 ? 6 : 0) + i * 3;
        const flap = Math.floor(t / 180 + i) % 2;
        ctx.fillRect(x - 4, y - flap, 3, 1);
        ctx.fillRect(x + 1, y - flap, 3, 1);
        ctx.fillRect(x - 1, y + 1 - flap, 2, 1);
      }
    }
  }

  private toScreen(x: number, y: number, z = 0) {
    const s = isoToScreen(x, y);
    return { x: s.sx * this.cam.zoom + this.cam.x, y: (s.sy - z) * this.cam.zoom + this.cam.y };
  }

  private drawChar(c: Char, t: number) {
    const ctx = this.ctx;
    const { pose, lying } = this.poseFor(c);
    const back = c.facing === "ne" || c.facing === "nw";
    const flip = c.facing === "se" || c.facing === "nw";
    const spr = getSprite(c.look, pose, c.frame % framesFor(pose), back && !lying);
    const [sx, sy0] = isoPoint(c.x, c.y);
    const z = zAtFloat(c.x, c.y);
    const sy = sy0 - z;
    // Sprites 32×46: escala menor que a dos antigos 24×32 para manter a altura
    // na tela, com o dobro de detalhe.
    const scale = 1.85;
    // respiração sutil parado
    const breath = pose === "stand" && !this.settings.reducedMotion ? Math.sin(t / 500 + c.x) * 0.6 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    if (lying) {
      ctx.translate(sx, sy - 16);
      ctx.rotate(-Math.PI / 2.4);
      ctx.drawImage(spr, (-SPRITE_W * scale) / 2, (-SPRITE_H * scale) / 2, SPRITE_W * scale, SPRITE_H * scale);
    } else {
      ctx.translate(sx, sy + breath);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(spr, (-SPRITE_W * scale) / 2, -SPRITE_H * scale + 5, SPRITE_W * scale, SPRITE_H * scale);
    }
    ctx.restore();
    // Chuva: quem está ao ar livre abre o guarda-chuva (parte dos aldeões prefere correr pro abrigo).
    if (!lying && this.underUmbrella(c)) {
      drawUmbrella(ctx, sx, sy + breath - SPRITE_H * scale + 2, c.isNpc ? c.look.shirt : this.accentOf(c), flip);
    }
  }

  /** Entrada de construção mais próxima (abrigo na chuva forte). */
  private nearestShelter(c: Char): Point | null {
    let best: Point | null = null;
    let bd = Infinity;
    for (const b of BUILDINGS) {
      const e = doorOf(b).entrance;
      const dist = Math.abs(e.x - c.x) + Math.abs(e.y - c.y);
      if (dist < bd) (bd = dist), (best = e);
    }
    return best ? nearestFree(this.blocked, best) ?? best : null;
  }

  private underUmbrella(c: Char): boolean {
    return !!this.weather && isWet(this.weather.visual) && !roomAt(Math.round(c.x), Math.round(c.y))?.walls && this.usesUmbrella(c);
  }

  /** Dois terços dos aldeões levam guarda-chuva; avatar e agentes sempre. */
  private usesUmbrella(c: Char): boolean {
    if (!c.isNpc) return true;
    let h = 0;
    for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h) % 3 !== 0;
  }

  /** Cor de destaque do personagem (agente: cor da especialidade). */
  private accentOf(c: Char): string {
    return this.data?.agents.find((a) => a.key === c.id)?.color ?? "#F1C66A";
  }

  private drawCharOverlay(c: Char, t: number) {
    const ctx = this.ctx;
    const s = this.toScreen(c.x, c.y, zAtFloat(c.x, c.y));
    // Com guarda-chuva aberto, nome e balões sobem para não cobrir a lona.
    const top = s.y - (this.underUmbrella(c) ? 118 : 88) * this.cam.zoom;
    if (this.selectedChar === c.id) {
      const by = top - (this.settings.showNames ? 24 : 6) + Math.sin(t / 220) * 3;
      ctx.fillStyle = "#F1C66A";
      ctx.beginPath();
      ctx.moveTo(s.x - 6, by - 8);
      ctx.lineTo(s.x + 6, by - 8);
      ctx.lineTo(s.x, by);
      ctx.fill();
    }
    // Telas estreitas: só o nome do avatar e do selecionado, para não poluir o mapa.
    const showName = !c.isNpc && this.settings.showNames && (this.w >= 700 || c.isAvatar || this.selectedChar === c.id);
    if (showName) {
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      const label = c.name;
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(8,14,34,0.85)";
      ctx.fillRect(s.x - w / 2, top - 16, w, 15);
      ctx.fillStyle = c.isAvatar ? "#F1C66A" : this.accentOf(c);
      ctx.fillRect(s.x - w / 2, top - 2, w, 1);
      ctx.fillText(label, s.x - w / 2 + 6, top - 5);
    }
    if (!this.settings.showIndicators) return;
    const bt = top - (this.settings.showNames && !c.isNpc ? 20 : 2);
    // Mundo visto de longe: aldeões ficam em silêncio para não poluir o mapa.
    if (c.isNpc && this.cam.zoom < 0.5) return;
    if (c.bubble?.tone === "talk") {
      this.speech(s.x, bt, c.bubble.text, c.isNpc ? "#8a5d3b" : this.accentOf(c));
    } else if (c.bubble) {
      const tone = c.bubble.tone === "error" ? "#F16D75" : c.bubble.tone === "work" ? "#59A9F8" : c.bubble.tone === "warn" ? "#F1C66A" : "#4FD49A";
      this.bubble(s.x, bt, c.bubble.text + (c.bubble.tone === "work" ? ".".repeat(Math.floor(t / 400) % 3) : ""), tone);
    } else if (c.brain.state === "resting" && c.station?.anim === "sleeping") {
      this.bubble(s.x + 14, bt + 10, "Zz", "#AAB6CC");
    } else if (c.isAvatar && c.brain.intent?.source === "domain" && c.brain.intent.label && !c.path.length) {
      this.bubble(s.x, bt, c.brain.intent.label.slice(0, 30), "#A875F5");
    }
  }

  private bubble(x: number, y: number, text: string, color: string) {
    const ctx = this.ctx;
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = "rgba(14,22,48,0.96)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - 19, w, 19);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x - w / 2 + 8, y - 6);
  }

  /** Balão de fala (pergaminho) das conversas e dos aldeões. */
  private speech(x: number, y: number, text: string, edge: string) {
    const ctx = this.ctx;
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    const w = Math.min(230, ctx.measureText(text).width + 18);
    const bx = Math.min(this.w - w - 4, Math.max(4, x - w / 2));
    const by = y - 24;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(bx + 2, by + 2, w, 22);
    ctx.fillStyle = "#f6ecd2";
    ctx.fillRect(bx, by, w, 22);
    ctx.fillStyle = edge;
    ctx.fillRect(bx, by, 3, 22);
    ctx.strokeStyle = "#4a2f1b";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, 21);
    ctx.fillStyle = "#f6ecd2";
    ctx.beginPath();
    ctx.moveTo(x - 5, by + 21);
    ctx.lineTo(x + 5, by + 21);
    ctx.lineTo(x - 2, by + 29);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4a2f1b";
    ctx.beginPath();
    ctx.moveTo(x - 5, by + 22);
    ctx.lineTo(x - 2, by + 29);
    ctx.lineTo(x + 5, by + 22);
    ctx.stroke();
    ctx.fillStyle = "#2a1c10";
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + 6, by, w - 10, 22);
    ctx.clip();
    ctx.fillText(text, bx + 9, by + 15);
    ctx.restore();
  }

  /** Marcadores de pendência estilo jogo: brasão com "!" (ou "?" para lembrete) e contador. */
  private drawMarkers(d: EngineData, t: number) {
    const ctx = this.ctx;
    for (const [key, m] of Object.entries(d.markers) as Array<[PlaceKey, PlaceMarker]>) {
      const rect = this.labelRects.find((l) => l.key === key);
      const a = rect ? { x: rect.x + rect.w / 2, y: rect.y - 8 } : this.placeAnchor(key);
      if (!a) continue;
      const bob = this.settings.reducedMotion ? 0 : Math.sin(t / 280 + key.length) * 3;
      const s = this.w < 700 ? 0.8 : 1;
      const cx = a.x;
      const by = a.y + bob;
      const col = MARKER_COLOR[m.tone];
      glow(ctx, cx, by - 16 * s, 26 * s, m.tone === "danger" ? "rgba(241,109,117,ALPHA)" : m.tone === "warn" ? "rgba(241,198,106,ALPHA)" : "rgba(89,169,248,ALPHA)", 0.45);
      // brasão
      const w = 22 * s;
      const h = 26 * s;
      const top = by - h;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top);
      ctx.lineTo(cx + w / 2, top);
      ctx.lineTo(cx + w / 2, top + h * 0.62);
      ctx.lineTo(cx, by);
      ctx.lineTo(cx - w / 2, top + h * 0.62);
      ctx.closePath();
      ctx.fillStyle = "#1b1405";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1b1405";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + 2, top + 2);
      ctx.lineTo(cx + w / 2 - 2, top + 2);
      ctx.lineTo(cx + w / 2 - 2, top + h * 0.6);
      ctx.lineTo(cx, by - 3);
      ctx.lineTo(cx - w / 2 + 2, top + h * 0.6);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(cx - w / 2 + 3, top + 3, w - 6, 3);
      ctx.fillStyle = "#1b1405";
      ctx.font = `900 ${Math.round(16 * s)}px Georgia, 'Times New Roman', serif`;
      const sym = m.tone === "info" ? "?" : "!";
      const sw = ctx.measureText(sym).width;
      ctx.fillText(sym, cx - sw / 2, top + 17 * s);
      if (m.count > 0) {
        const txt = m.count > 99 ? "99+" : String(m.count);
        ctx.font = "800 10px Inter, system-ui, sans-serif";
        const cw = Math.max(16, ctx.measureText(txt).width + 8);
        const kx = cx + w / 2 - 4;
        const ky = top - 6;
        ctx.fillStyle = "#1b1405";
        ctx.fillRect(kx - 1, ky - 1, cw + 2, 16);
        ctx.fillStyle = "#f6ecd2";
        ctx.fillRect(kx, ky, cw, 14);
        ctx.fillStyle = "#1b1405";
        ctx.fillText(txt, kx + (cw - ctx.measureText(txt).width) / 2, ky + 11);
      }
      this.labelRects.push({ key, x: cx - w / 2 - 4, y: top - 8, w: w + 24, h: h + 10 });
    }
  }

  /** Ponto de tela sobre o lugar (quando as placas estão ocultas). */
  private placeAnchor(key: PlaceKey): { x: number; y: number } | null {
    const b = BUILDINGS.find((x) => x.key === key);
    if (b) return this.toScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, buildingTopZ(b) + 10);
    const r = ROOMS.find((x) => x.key === key);
    if (!r) return null;
    return this.toScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.walls ? 100 : 70);
  }

  private badge(x: number, y: number, text: string, bg: string, fg: string) {
    const ctx = this.ctx;
    ctx.fillStyle = "#1b1405";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = "800 12px Inter, system-ui, sans-serif";
    ctx.fillText(text, x - 2, y + 4);
  }

  /** Placas de madeira com moldura dourada sobre cada ambiente e cada construção da vila. */
  private drawRoomLabels(d: EngineData) {
    const ctx = this.ctx;
    const compact = this.w < 700 || this.cam.zoom < 0.42;
    const places: Array<{ key: PlaceKey; name: string; status: string; accent: string; at: { x: number; y: number } }> = [];
    for (const r of ROOMS) {
      const anchor =
        r.key === "praca" ? { x: 14.5, y: 14.5, lift: 215 } : r.walls ? { x: (r.x0 + r.x1) / 2 + 0.5, y: r.y0, lift: 112 } : { x: 25, y: 22, lift: 96 };
      places.push({ key: r.key, name: r.name, status: d.roomStatus[r.key] ?? r.subtitle, accent: r.accent, at: this.toScreen(anchor.x, anchor.y, anchor.lift) });
    }
    for (const b of BUILDINGS) {
      if (!b.route && !d.markers[b.key]) continue; // cenário puro (moinho) não ganha placa
      places.push({ key: b.key, name: b.name, status: d.markers[b.key]?.text ?? b.subtitle, accent: b.accent, at: this.toScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, buildingTopZ(b) + 18) });
    }
    for (const p of places) {
      const s = p.at;
      const status = compact ? "" : p.status;
      ctx.font = compact ? "700 11px Georgia, 'Times New Roman', serif" : "700 14px Georgia, 'Times New Roman', serif";
      const w1 = ctx.measureText(p.name).width;
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      const w2 = status ? ctx.measureText(status).width : 0;
      const w = Math.max(w1, w2) + (compact ? 30 : 40);
      const h = compact ? 22 : 38;
      // fora da tela: não desenha (o mundo é maior que a viewport)
      if (s.x + w / 2 < -20 || s.x - w / 2 > this.w + 20 || s.y < -20 || s.y - h > this.h + 20) continue;
      const x = Math.min(this.w - w - 6, Math.max(6, s.x - w / 2));
      const y = Math.min(this.h - h - 50, Math.max(34, s.y - h));
      const selected = this.selectedRoom === p.key || this.selectedBuilding === p.key;
      // correntes
      ctx.fillStyle = "#6e4f1f";
      ctx.fillRect(x + 10, y - 6, 2, 6);
      ctx.fillRect(x + w - 12, y - 6, 2, 6);
      // tábua
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, selected ? "#3a2a5a" : "#1c2448");
      g.addColorStop(1, selected ? "#2a1f44" : "#121a36");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selected ? "#F6D27A" : "#A77C34";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = "rgba(246,210,122,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = "#F1C66A";
      for (const [cx, cy] of [[x, y], [x + w - 4, y], [x, y + h - 4], [x + w - 4, y + h - 4]]) ctx.fillRect(cx!, cy!, 4, 4);
      // brasão do lugar
      const sh = compact ? 0.55 : 1;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 5 * sh + 4);
      ctx.lineTo(x + 8 + 14 * sh, y + 5 * sh + 4);
      ctx.lineTo(x + 8 + 14 * sh, y + 17 * sh + 4);
      ctx.lineTo(x + 8 + 7 * sh, y + 23 * sh + 4);
      ctx.lineTo(x + 8, y + 17 * sh + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#F6D27A";
      ctx.font = compact ? "700 11px Georgia, 'Times New Roman', serif" : "700 14px Georgia, 'Times New Roman', serif";
      ctx.fillText(p.name, x + (compact ? 22 : 32), y + (compact ? 15 : 17));
      if (status) {
        const m = d.markers[p.key];
        ctx.fillStyle = m ? MARKER_COLOR[m.tone] : "#c9d2e6";
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        ctx.fillText(status, x + 32, y + 31);
      }
      this.labelRects.push({ key: p.key, x, y, w, h });
    }
  }

  /* ───────────── Entrada ───────────── */

  private pick(px: number, py: number): Selection | null {
    for (let i = this.labelRects.length - 1; i >= 0; i--) {
      const l = this.labelRects[i]!;
      if (px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h) return this.placeSelection(l.key);
    }
    // Personagens (caixa do sprite na tela). Dos aldeões, só o ferreiro (abre a Forja do Código).
    const chars = [...this.chars.values()].filter((c) => !c.isNpc || c.id === "npc-ferreiro" || c.id === "npc-bardo").sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const c of chars) {
      const s = this.toScreen(c.x, c.y, zAtFloat(c.x, c.y));
      const hw = 22 * this.cam.zoom;
      if (px > s.x - hw && px < s.x + hw && py > s.y - 76 * this.cam.zoom && py < s.y + 4) return c.isAvatar ? { type: "avatar" } : c.isNpc ? { type: "npc", id: c.id } : { type: "agent", key: c.id };
    }
    if (this.data?.pet && this.pet.placed) {
      const s = this.toScreen(this.pet.x, this.pet.y, zAtFloat(this.pet.x, this.pet.y));
      if (Math.abs(px - s.x) < 18 * this.cam.zoom && py > s.y - 30 * this.cam.zoom && py < s.y + 4) return { type: "pet" };
    }
    const tile = this.tileAt(px, py);
    if (this.decorMode && this.data) {
      const slot = this.data.slots.find((s) => s.x === tile.x && s.y === tile.y);
      if (slot) return { type: "slot", key: slot.key };
    }
    if (this.data) {
      const i = PLANT_TILES.findIndex(([x, y]) => x === tile.x && y === tile.y);
      if (i >= 0 && this.data.habits[i]) return { type: "habit", id: this.data.habits[i]!.id };
    }
    // Construções: telhado/paredes na tela (da frente para o fundo)
    const wx = (px - this.cam.x) / this.cam.zoom;
    const wy = (py - this.cam.y) / this.cam.zoom;
    const byDepth = [...BUILDINGS].sort((a, b) => b.x0 + b.y0 - (a.x0 + a.y0));
    for (const b of byDepth) {
      if (insideHull(buildingHull(b), wx, wy)) return { type: "building", key: b.key };
    }
    const bt = buildingAt(tile.x, tile.y);
    if (bt) return { type: "building", key: bt.key };
    const r = roomAt(tile.x, tile.y);
    return r ? { type: "room", key: r.key } : null;
  }

  private placeSelection(key: PlaceKey): Selection {
    return BUILDINGS.some((b) => b.key === key) ? { type: "building", key: key as BuildingKey } : { type: "room", key: key as RoomKey };
  }

  /** Tile sob o cursor, considerando a altura das plataformas. */
  private tileAt(px: number, py: number): Point {
    const wx = (px - this.cam.x) / this.cam.zoom;
    const wy = (py - this.cam.y) / this.cam.zoom;
    for (const z of [12, 6, 3, 0]) {
      const t = screenToIso(wx, wy + z);
      if (t.x >= 0 && t.y >= 0 && t.x < GRID && t.y < GRID && tileZ(t.x, t.y) === z) return t;
    }
    return screenToIso(wx, wy);
  }

  private clampCam() {
    const lim = GRID * 34 * this.cam.zoom;
    this.cam.x = Math.min(this.w / 2 + lim, Math.max(this.w / 2 - lim, this.cam.x));
    this.cam.y = Math.min(this.h / 2 + lim * 0.3, Math.max(this.h / 2 - lim * 1.25, this.cam.y));
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
        if (Math.abs(dx) + Math.abs(dy) > 5) {
          this.drag.moved = true;
          this.camTouched = true;
          if (this.followChar) {
            this.followChar = null;
            this.onFollowStop();
          }
        }
        if (this.drag.moved) {
          this.cam.x = this.drag.cx + dx;
          this.cam.y = this.drag.cy + dy;
          this.clampCam();
        }
      }
      this.hover = this.tileAt(p.x, p.y);
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
      const tile = this.tileAt(p.x, p.y);
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
