/**
 * Meu Mundo — geometria do mapa isométrico (fonte única no frontend).
 *
 * Grade 30×30. Cada ambiente é um retângulo com paredes só nos lados do
 * fundo (linha y0 e coluna x0), no estilo "casa de bonecas" isométrica: o
 * interior fica visível e a entrada é pelos lados da frente. Para adicionar um
 * ambiente: inclua em ROOMS, coloque móveis em FURNITURE e, se houver
 * atividade, uma estação em STATIONS. Os slots de decoração vêm do servidor.
 */

export const GRID = 30;
export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 56;

export type RoomKey = "biblioteca" | "escritorio" | "academia" | "guilda" | "casa" | "jardim" | "praca";
export type Facing = "ne" | "nw" | "se" | "sw";
export type TileKind = "floor" | "wall" | "path" | "grass" | "water" | "plaza";

export interface RoomDef {
  key: RoomKey;
  name: string;
  subtitle: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  walls: boolean;
  floor: [string, string];
  wall: string;
  accent: string;
}

export const ROOMS: RoomDef[] = [
  { key: "biblioteca", name: "Biblioteca", subtitle: "Estudos e leitura", x0: 1, y0: 1, x1: 8, y1: 8, walls: true, floor: ["#6b4a32", "#5d3f2a"], wall: "#3b2a4a", accent: "#A875F5" },
  { key: "escritorio", name: "Escritório", subtitle: "Projetos e agentes", x0: 21, y0: 1, x1: 28, y1: 8, walls: true, floor: ["#3c4a63", "#334058"], wall: "#2a3350", accent: "#59A9F8" },
  { key: "guilda", name: "Guilda", subtitle: "Missões", x0: 1, y0: 11, x1: 8, y1: 18, walls: true, floor: ["#5b3f2c", "#4f3626"], wall: "#4a2b2b", accent: "#F1C66A" },
  { key: "academia", name: "Academia", subtitle: "Saúde e treinos", x0: 21, y0: 11, x1: 28, y1: 18, walls: true, floor: ["#4a4f5c", "#40444f"], wall: "#33363f", accent: "#F16D75" },
  { key: "casa", name: "Casa", subtitle: "Descanso e diário", x0: 1, y0: 21, x1: 8, y1: 28, walls: true, floor: ["#7a5a3e", "#6c4e35"], wall: "#4b3550", accent: "#E78FC0" },
  { key: "jardim", name: "Jardim", subtitle: "Hábitos e evolução", x0: 21, y0: 21, x1: 28, y1: 28, walls: false, floor: ["#3f7a3c", "#377034"], wall: "#2c4a2a", accent: "#4FD49A" },
  { key: "praca", name: "Praça Central", subtitle: "Centro do mundo", x0: 11, y0: 11, x1: 18, y1: 18, walls: false, floor: ["#8a8478", "#7d776b"], wall: "#555", accent: "#A875F5" },
];

export type FurnitureKind =
  | "shelf" | "desk" | "pcdesk" | "lamp" | "armchair" | "board" | "banner" | "table" | "chest"
  | "treadmill" | "bench" | "dumbbells" | "bag" | "mat" | "bed" | "sofa" | "rug" | "pot" | "tree"
  | "parkbench" | "crystal" | "server" | "lantern" | "flowers"
  | "globe" | "bookpile" | "candelabra" | "chair" | "wardrobe" | "nightstand" | "dummy" | "weaponrack" | "barrel"
  | "bush" | "rock" | "pine" | "bannerpole" | "hedge" | "cables" | "target" | "lilypad";

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  room: RoomKey | null;
  /** Ocupa o tile (bloqueia caminho). Tapetes, flores e cadeiras não bloqueiam. */
  blocks: boolean;
  color?: string;
}

/** Itens que não bloqueiam, mas têm volume (precisam de ordenação por profundidade). */
export const VOLUMETRIC_FREE: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>(["chair", "cables", "lilypad"]);

const f = (id: string, kind: FurnitureKind, x: number, y: number, room: RoomKey | null, blocks = true, color?: string): Furniture => ({ id, kind, x, y, room, blocks, color });

export const FURNITURE: Furniture[] = [
  // Biblioteca — estantes altas, vitral no fundo (x 4–5 livres para o vitral aparecer)
  ...[2, 3, 6, 7].map((x) => f(`bib-shelf-${x}`, "shelf", x, 2, "biblioteca")),
  f("bib-candles", "candelabra", 4, 2, "biblioteca"),
  f("bib-shelf-l1", "shelf", 2, 4, "biblioteca"),
  f("bib-desk", "desk", 4, 5, "biblioteca"),
  f("bib-desk2", "desk", 7, 4, "biblioteca"),
  f("bib-lamp", "lamp", 3, 5, "biblioteca"),
  f("bib-books", "bookpile", 5, 4, "biblioteca"),
  f("bib-globe", "globe", 2, 6, "biblioteca"),
  f("bib-arm", "armchair", 6, 7, "biblioteca"),
  f("bib-chair", "chair", 4, 6, "biblioteca", false, "#6b3fa0"),
  f("bib-chair2", "chair", 7, 5, "biblioteca", false, "#6b3fa0"),
  f("bib-rug", "rug", 5, 7, "biblioteca", false, "#6a2f5a"),
  f("bib-rug2", "rug", 5, 6, "biblioteca", false, "#6a2f5a"),
  // Escritório — estações dos agentes, servidor, cabos e painéis luminosos na parede
  f("esc-desk1", "pcdesk", 23, 3, "escritorio"),
  f("esc-desk2", "pcdesk", 25, 3, "escritorio"),
  f("esc-desk3", "pcdesk", 27, 3, "escritorio"),
  f("esc-chair1", "chair", 23, 4, "escritorio", false, "#2a3350"),
  f("esc-chair2", "chair", 25, 4, "escritorio", false, "#2a3350"),
  f("esc-chair3", "chair", 27, 4, "escritorio", false, "#2a3350"),
  f("esc-board", "board", 22, 3, "escritorio"),
  f("esc-server", "server", 28, 5, "escritorio"),
  f("esc-server2", "server", 28, 4, "escritorio"),
  f("esc-pot", "pot", 22, 8, "escritorio"),
  f("esc-table", "table", 25, 6, "escritorio"),
  f("esc-cables", "cables", 26, 5, "escritorio", false),
  f("esc-rug", "rug", 24, 7, "escritorio", false, "#1f3a66"),
  // Guilda — quadro de missões, mesa de planejamento, baú, barris
  f("gui-board", "board", 3, 12, "guilda"),
  f("gui-board2", "board", 4, 12, "guilda"),
  f("gui-table", "table", 4, 15, "guilda"),
  f("gui-table2", "table", 5, 15, "guilda"),
  f("gui-chest", "chest", 2, 14, "guilda"),
  f("gui-barrel", "barrel", 2, 16, "guilda"),
  f("gui-barrel2", "barrel", 7, 15, "guilda"),
  f("gui-rack", "weaponrack", 6, 12, "guilda"),
  f("gui-lantern", "lantern", 8, 12, "guilda"),
  f("gui-rug", "rug", 4, 17, "guilda", false, "#7a2a2a"),
  // Academia — treino de aventureiro
  f("aca-tread", "treadmill", 23, 13, "academia"),
  f("aca-dummy", "dummy", 24, 13, "academia"),
  f("aca-bench", "bench", 27, 14, "academia"),
  f("aca-dumb", "dumbbells", 28, 12, "academia"),
  f("aca-bag", "bag", 26, 16, "academia"),
  f("aca-rack", "weaponrack", 22, 13, "academia"),
  f("aca-target", "target", 28, 15, "academia"),
  f("aca-mat", "mat", 24, 16, "academia", false),
  f("aca-mat2", "mat", 25, 16, "academia", false),
  // Casa — quarto aconchegante (lareira fica na parede)
  f("cas-bed", "bed", 2, 22, "casa"),
  f("cas-bed2", "bed", 3, 22, "casa"),
  f("cas-night", "nightstand", 4, 22, "casa"),
  f("cas-wardrobe", "wardrobe", 5, 22, "casa"),
  f("cas-table", "table", 6, 23, "casa"),
  f("cas-sofa", "sofa", 5, 26, "casa"),
  f("cas-sofa2", "sofa", 6, 26, "casa"),
  f("cas-lamp", "lamp", 8, 24, "casa"),
  f("cas-rug", "rug", 4, 24, "casa", false, "#7a2a3a"),
  f("cas-rug2", "rug", 3, 25, "casa", false, "#7a2a3a"),
  // Jardim
  f("jar-tree1", "tree", 22, 22, "jardim"),
  f("jar-tree2", "tree", 27, 21, "jardim"),
  f("jar-tree3", "tree", 21, 28, "jardim"),
  f("jar-bush", "bush", 21, 21, "jardim"),
  f("jar-bench", "parkbench", 24, 28, "jardim"),
  f("jar-lantern", "lantern", 28, 28, "jardim"),
  f("jar-flw1", "flowers", 22, 21, "jardim", false),
  f("jar-flw2", "flowers", 26, 21, "jardim", false),
  f("jar-flw3", "flowers", 27, 24, "jardim", false),
  f("jar-flw4", "flowers", 21, 25, "jardim", false),
  f("jar-lily1", "lilypad", 25, 26, "jardim", false),
  f("jar-lily2", "lilypad", 27, 25, "jardim", false),
  // Praça
  f("pra-crystal", "crystal", 14, 14, "praca"),
  f("pra-c2", "crystal", 15, 14, "praca"),
  f("pra-c3", "crystal", 14, 15, "praca"),
  f("pra-c4", "crystal", 15, 15, "praca"),
  f("pra-bench1", "parkbench", 12, 12, "praca"),
  f("pra-bench2", "parkbench", 17, 17, "praca"),
  f("pra-lantern1", "lantern", 11, 11, "praca"),
  f("pra-lantern2", "lantern", 18, 18, "praca"),
  f("pra-banner1", "bannerpole", 11, 16, "praca", true, "#6b3fa0"),
  f("pra-banner2", "bannerpole", 18, 13, "praca", true, "#6b3fa0"),
  f("pra-bush1", "bush", 11, 18, "praca"),
  f("pra-bush2", "bush", 18, 11, "praca"),
  f("pra-flowers1", "flowers", 13, 11, "praca", false),
  f("pra-flowers2", "flowers", 18, 15, "praca", false),
  f("pra-flowers3", "flowers", 11, 13, "praca", false),
  f("pra-flowers4", "flowers", 15, 18, "praca", false),
  // Floresta em volta (atrás das paredes e nas bordas) — só cenário
  ...[0, 2, 4, 6, 8, 10, 13, 16, 19, 21, 23, 25, 27, 29].map((x) => f(`wood-n-${x}`, x % 4 === 0 ? "pine" : "tree", x, 0, null)),
  ...[2, 4, 6, 8, 10, 13, 16, 19, 22, 24, 26, 28].map((y) => f(`wood-w-${y}`, y % 4 === 0 ? "pine" : "tree", 0, y, null)),
  ...[3, 7, 12, 17, 23, 27].map((x) => f(`bush-s-${x}`, "bush", x, 29, null)),
  ...[3, 7, 12, 17, 24].map((y) => f(`bush-e-${y}`, "bush", 29, y, null)),
  f("rock-1", "rock", 10, 3, null),
  f("rock-2", "rock", 19, 26, null),
  f("rock-3", "rock", 3, 10, null),
  f("hedge-1", "hedge", 9, 9, null),
  f("hedge-2", "hedge", 20, 9, null),
  f("hedge-3", "hedge", 9, 20, null),
  f("hedge-4", "hedge", 20, 20, null),
];

/** Decoração presa às paredes (face visível da parede do tile). Só visual. */
export type WallDecorKind = "stained" | "window" | "torch" | "banner" | "crest" | "screen" | "painting" | "fireplace" | "shields";
export interface WallDecor {
  x: number;
  y: number;
  kind: WallDecorKind;
  color?: string;
}
export const WALL_DECOR: WallDecor[] = [
  { x: 4, y: 1, kind: "stained" },
  { x: 5, y: 1, kind: "stained" },
  { x: 1, y: 3, kind: "window" },
  { x: 1, y: 5, kind: "torch" },
  { x: 1, y: 7, kind: "window" },
  { x: 8, y: 1, kind: "torch" },
  { x: 24, y: 1, kind: "screen" },
  { x: 26, y: 1, kind: "screen" },
  { x: 28, y: 1, kind: "window" },
  { x: 21, y: 6, kind: "window" },
  { x: 21, y: 8, kind: "torch" },
  { x: 2, y: 11, kind: "banner", color: "#6b3fa0" },
  { x: 5, y: 11, kind: "crest" },
  { x: 7, y: 11, kind: "banner", color: "#6b3fa0" },
  { x: 1, y: 13, kind: "torch" },
  { x: 1, y: 15, kind: "shields" },
  { x: 1, y: 17, kind: "torch" },
  { x: 23, y: 11, kind: "banner", color: "#9e2b2b" },
  { x: 26, y: 11, kind: "shields" },
  { x: 28, y: 11, kind: "banner", color: "#9e2b2b" },
  { x: 21, y: 15, kind: "torch" },
  { x: 21, y: 17, kind: "window" },
  { x: 3, y: 21, kind: "painting" },
  { x: 7, y: 21, kind: "window" },
  { x: 1, y: 25, kind: "fireplace" },
  { x: 1, y: 23, kind: "torch" },
  { x: 1, y: 28, kind: "window" },
];

/** Altura do piso (px): salas com paredes ficam sobre uma plataforma de pedra; a praça sobre um degrau. */
export function tileZ(x: number, y: number): number {
  const r = roomAt(x, y);
  if (!r) return 0;
  if (r.walls) return 12;
  if (r.key === "praca") return 6;
  return 3;
}

/** Altura suavizada para quem está entre dois tiles (movimento em 4 direções). */
export function zAtFloat(x: number, y: number): number {
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const ry = Math.round(y);
  const rx = Math.round(x);
  if (fx > 0.001) return tileZ(Math.floor(x), ry) * (1 - fx) + tileZ(Math.ceil(x), ry) * fx;
  if (fy > 0.001) return tileZ(rx, Math.floor(y)) * (1 - fy) + tileZ(rx, Math.ceil(y)) * fy;
  return tileZ(rx, ry);
}

/** Água do lago do Jardim. */
export const WATER: Array<[number, number]> = [];
for (let x = 25; x <= 27; x++) for (let y = 25; y <= 27; y++) WATER.push([x, y]);

export type StationAnim = "typing" | "reading" | "exercising" | "sleeping" | "interacting" | "sitting";

export interface Station {
  key: string;
  x: number;
  y: number;
  facing: Facing;
  anim: StationAnim;
}

/** Onde cada personagem trabalha (o tile precisa ser livre). */
export const STATIONS: Record<string, Station> = {
  "avatar-biblioteca": { key: "avatar-biblioteca", x: 4, y: 6, facing: "ne", anim: "reading" },
  "avatar-escritorio": { key: "avatar-escritorio", x: 27, y: 4, facing: "ne", anim: "typing" },
  "avatar-guilda": { key: "avatar-guilda", x: 4, y: 16, facing: "ne", anim: "interacting" },
  "avatar-academia": { key: "avatar-academia", x: 24, y: 16, facing: "nw", anim: "exercising" },
  "avatar-casa": { key: "avatar-casa", x: 3, y: 23, facing: "ne", anim: "sleeping" },
  "avatar-jardim": { key: "avatar-jardim", x: 23, y: 26, facing: "se", anim: "interacting" },
  "agent-planejador": { key: "agent-planejador", x: 23, y: 4, facing: "ne", anim: "typing" },
  "agent-analista": { key: "agent-analista", x: 25, y: 4, facing: "ne", anim: "typing" },
  "agent-mentor": { key: "agent-mentor", x: 7, y: 5, facing: "ne", anim: "typing" },
  "agent-habitos": { key: "agent-habitos", x: 24, y: 25, facing: "se", anim: "interacting" },
};

/** Onde os agentes esperam quando estão disponíveis (perto da praça). */
export const AGENT_IDLE: Record<string, { x: number; y: number }> = {
  planejador: { x: 16, y: 12 },
  analista: { x: 17, y: 13 },
  mentor: { x: 12, y: 13 },
  habitos: { x: 16, y: 17 },
};

export const AVATAR_SPAWN = { x: 14, y: 17 };

/** Tiles das plantas de hábito no Jardim (até 10 hábitos). */
export const PLANT_TILES: Array<[number, number]> = [
  [23, 23], [25, 23], [22, 24], [24, 22], [26, 23], [23, 27], [22, 26], [28, 25], [28, 26], [26, 28],
];

export function roomAt(x: number, y: number): RoomDef | null {
  return ROOMS.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) ?? null;
}

export function tileKind(x: number, y: number): TileKind {
  const r = roomAt(x, y);
  if (r) {
    if (r.walls && (x === r.x0 || y === r.y0)) return "wall";
    if (WATER.some(([wx, wy]) => wx === x && wy === y)) return "water";
    if (r.key === "jardim") return "grass";
    if (r.key === "praca") return "plaza";
    return "floor";
  }
  if ((x >= 9 && x <= 20) || (y >= 9 && y <= 20)) return "path";
  return "grass";
}

/** Mapa de bloqueio (true = não navegável). Decoração ocupada e plantas também bloqueiam. */
export function buildBlocked(extra: Array<{ x: number; y: number }> = []): boolean[][] {
  const g: boolean[][] = [];
  for (let x = 0; x < GRID; x++) {
    g[x] = [];
    for (let y = 0; y < GRID; y++) {
      const k = tileKind(x, y);
      g[x]![y] = k === "wall" || k === "water";
    }
  }
  for (const it of FURNITURE) if (it.blocks) g[it.x]![it.y] = true;
  for (const [x, y] of PLANT_TILES) g[x]![y] = true;
  for (const e of extra) if (g[e.x]) g[e.x]![e.y] = true;
  return g;
}

export const isoToScreen = (x: number, y: number) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) });

export function screenToIso(wx: number, wy: number) {
  const x = (wy / (TILE_H / 2) + wx / (TILE_W / 2)) / 2;
  const y = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
  return { x: Math.floor(x + 0.5), y: Math.floor(y + 0.5) };
}

export function facingBetween(ax: number, ay: number, bx: number, by: number): Facing {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "se" : "nw";
  return dy >= 0 ? "sw" : "ne";
}
