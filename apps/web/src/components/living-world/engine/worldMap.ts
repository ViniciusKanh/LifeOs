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
  | "parkbench" | "crystal" | "server" | "lantern" | "flowers";

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  room: RoomKey | null;
  /** Ocupa o tile (bloqueia caminho). Tapetes e flores não bloqueiam. */
  blocks: boolean;
  color?: string;
}

const f = (id: string, kind: FurnitureKind, x: number, y: number, room: RoomKey | null, blocks = true, color?: string): Furniture => ({ id, kind, x, y, room, blocks, color });

export const FURNITURE: Furniture[] = [
  // Biblioteca
  ...[2, 3, 4, 5, 6, 7].map((x) => f(`bib-shelf-${x}`, "shelf", x, 2, "biblioteca")),
  f("bib-shelf-l1", "shelf", 2, 4, "biblioteca"),
  f("bib-desk", "pcdesk", 4, 5, "biblioteca"),
  f("bib-desk2", "desk", 7, 4, "biblioteca"),
  f("bib-lamp", "lamp", 3, 5, "biblioteca"),
  f("bib-arm", "armchair", 6, 7, "biblioteca"),
  f("bib-rug", "rug", 5, 7, "biblioteca", false, "#6a2f5a"),
  // Escritório
  f("esc-desk1", "pcdesk", 23, 3, "escritorio"),
  f("esc-desk2", "pcdesk", 25, 3, "escritorio"),
  f("esc-desk3", "pcdesk", 27, 3, "escritorio"),
  f("esc-board", "board", 22, 3, "escritorio"),
  f("esc-server", "server", 28, 5, "escritorio"),
  f("esc-pot", "pot", 22, 8, "escritorio"),
  f("esc-table", "table", 25, 6, "escritorio"),
  // Guilda
  f("gui-board", "board", 3, 12, "guilda"),
  f("gui-board2", "board", 4, 12, "guilda"),
  f("gui-banner", "banner", 6, 12, "guilda"),
  f("gui-table", "table", 4, 15, "guilda"),
  f("gui-table2", "table", 5, 15, "guilda"),
  f("gui-chest", "chest", 2, 14, "guilda"),
  f("gui-lantern", "lantern", 8, 12, "guilda"),
  // Academia
  f("aca-tread", "treadmill", 23, 13, "academia"),
  f("aca-tread2", "treadmill", 24, 13, "academia"),
  f("aca-bench", "bench", 27, 14, "academia"),
  f("aca-dumb", "dumbbells", 28, 12, "academia"),
  f("aca-bag", "bag", 26, 16, "academia"),
  f("aca-mat", "mat", 24, 16, "academia", false),
  // Casa
  f("cas-bed", "bed", 2, 22, "casa"),
  f("cas-bed2", "bed", 3, 22, "casa"),
  f("cas-table", "table", 6, 23, "casa"),
  f("cas-sofa", "sofa", 5, 26, "casa"),
  f("cas-sofa2", "sofa", 6, 26, "casa"),
  f("cas-lamp", "lamp", 2, 25, "casa"),
  f("cas-rug", "rug", 4, 24, "casa", false, "#3a4a8a"),
  // Jardim
  f("jar-tree1", "tree", 22, 22, "jardim"),
  f("jar-tree2", "tree", 27, 21, "jardim"),
  f("jar-tree3", "tree", 21, 28, "jardim"),
  f("jar-bench", "parkbench", 24, 28, "jardim"),
  f("jar-lantern", "lantern", 28, 28, "jardim"),
  // Praça
  f("pra-crystal", "crystal", 14, 14, "praca"),
  f("pra-c2", "crystal", 15, 14, "praca"),
  f("pra-c3", "crystal", 14, 15, "praca"),
  f("pra-c4", "crystal", 15, 15, "praca"),
  f("pra-bench1", "parkbench", 12, 12, "praca"),
  f("pra-bench2", "parkbench", 17, 17, "praca"),
  f("pra-lantern1", "lantern", 11, 11, "praca"),
  f("pra-lantern2", "lantern", 18, 18, "praca"),
  f("pra-flowers1", "flowers", 13, 11, "praca", false),
  f("pra-flowers2", "flowers", 18, 15, "praca", false),
];

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
