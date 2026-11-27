/**
 * Meu Mundo — geometria do mapa isométrico (fonte única no frontend).
 *
 * Grade 42×42. O núcleo (0..29) guarda os ambientes "casa de bonecas" —
 * paredes só nos lados do fundo (linha y0 e coluna x0), interior visível e
 * entrada pelos lados da frente. Em volta fica a Vila: construções fechadas
 * com telhado (BUILDINGS), ruas, lago, moinho, plantação e mercado.
 *
 * As coordenadas do núcleo não mudam (o servidor guarda slots de decoração e
 * a posição do avatar nelas). Para adicionar um ambiente: inclua em ROOMS,
 * coloque móveis em FURNITURE e, se houver atividade, uma estação em STATIONS.
 * Para uma construção da vila: inclua em BUILDINGS (pegada quadrada ou quase,
 * para a ordenação por profundidade funcionar) com a porta numa face visível.
 */
import type { CharacterLook } from "./looks";

/** 50×50: o núcleo original (0–41) + Distrito das Aventuras a leste (x 42–48) e ao sul (y 42–48). */
export const GRID = 50;
export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 56;

/** Alamedas (2 tiles) entre os ambientes e que seguem pela vila. */
const LANES = [9, 10, 19, 20];
/** Estrada do Reino: avenida que separa o núcleo do bairro sul e do lago. */
const ESTRADA = [30, 31];

export type RoomKey = "biblioteca" | "escritorio" | "academia" | "guilda" | "casa" | "jardim" | "praca";
export type Facing = "ne" | "nw" | "se" | "sw";
export type TileKind = "floor" | "wall" | "path" | "dirt" | "grass" | "water" | "plaza" | "dock" | "field" | "building";

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
  | "bush" | "rock" | "pine" | "bannerpole" | "hedge" | "cables" | "target" | "lilypad"
  | "statue" | "campfire" | "log" | "tent" | "fence" | "fencey" | "well" | "stall" | "crate" | "hay" | "signpost"
  | "anvil" | "forge" | "cart" | "reeds" | "flowerbed";

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
export const VOLUMETRIC_FREE: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>(["chair", "cables", "lilypad", "reeds"]);

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
  // Clareira do Pomar (norte da praça)
  f("pom-statue", "statue", 14, 4, null),
  f("pom-tree1", "tree", 12, 2, null),
  f("pom-tree2", "tree", 17, 2, null),
  f("pom-tree3", "tree", 12, 7, null),
  f("pom-tree4", "tree", 17, 7, null),
  f("pom-bench", "parkbench", 14, 6, null),
  f("pom-fb1", "flowerbed", 13, 4, null, false),
  f("pom-fb2", "flowerbed", 15, 4, null, false),
  f("pom-fb3", "flowerbed", 14, 3, null, false),
  f("pom-bush1", "bush", 11, 5, null),
  f("pom-bush2", "bush", 18, 4, null),
  f("pom-rock", "rock", 16, 8, null),
  // Fogueira (sul da praça) — ponto de encontro dos agentes
  f("fog-fire", "campfire", 14, 25, null),
  f("fog-log1", "log", 14, 24, null),
  f("fog-log2", "log", 14, 26, null),
  f("fog-tent1", "tent", 12, 22, null, true, "#9e2b2b"),
  f("fog-tent2", "tent", 17, 22, null, true, "#2b5c9e"),
  f("fog-tree1", "pine", 11, 27, null),
  f("fog-tree2", "tree", 18, 27, null),
  f("fog-tree3", "pine", 12, 28, null),
  f("fog-bush", "bush", 17, 28, null),
  f("fog-rock", "rock", 11, 23, null),
  f("fog-crate", "crate", 18, 23, null),
  // Floresta do fundo (linha y=0 e coluna x=0) — só cenário
  ...[0, 2, 4, 6, 8, 11, 13, 16, 18, 21, 23, 25, 27, 29, 32, 34, 36, 38, 40].map((x) => f(`wood-n-${x}`, x % 4 === 0 ? "pine" : "tree", x, 0, null)),
  ...[2, 4, 6, 8, 12, 14, 16, 22, 24, 26, 28, 33, 36, 39].map((y) => f(`wood-w-${y}`, y % 4 === 0 ? "pine" : "tree", 0, y, null)),
  // Bordas e cantos do núcleo
  f("rock-1", "rock", 29, 3, null),
  f("rock-2", "rock", 3, 29, null),
  f("bush-c1", "bush", 29, 14, null),
  f("bush-c2", "bush", 14, 29, null),
  f("bush-c3", "bush", 29, 26, null),
  f("bush-c4", "bush", 26, 29, null),
  f("sign-1", "signpost", 21, 29, null),
  f("sign-2", "signpost", 29, 21, null),
  f("sign-3", "signpost", 8, 29, null),
  // Postes da Estrada do Reino e das alamedas da vila
  ...[4, 13, 17, 24, 28, 34, 39].map((x) => f(`lamp-e-${x}`, "lantern", x, 32, null)),
  ...[33, 37].map((x) => f(`lamp-b-${x}`, "lantern", x, 8, null)),
  ...[33, 37].map((x) => f(`lamp-l-${x}`, "lantern", x, 18, null)),
  f("lamp-t1", "lantern", 34, 27, null),
  f("lamp-s1", "lantern", 8, 33, null),
  f("lamp-s2", "lantern", 18, 33, null),
  // Bairro leste: árvores e caixotes
  f("vl-tree1", "tree", 39, 3, null),
  f("vl-tree2", "pine", 40, 6, null),
  f("vl-tree3", "tree", 39, 13, null),
  f("vl-tree4", "tree", 32, 23, null),
  f("vl-pine1", "pine", 40, 12, null),
  f("vl-bush1", "bush", 32, 13, null),
  f("vl-bush2", "bush", 40, 17, null),
  f("vl-bush3", "bush", 32, 3, null),
  f("loja-crate1", "crate", 38, 15, null),
  f("loja-crate2", "crate", 38, 16, null),
  f("loja-barrel", "barrel", 38, 14, null),
  f("banco-cart", "cart", 38, 7, null),
  // Moinho e plantação
  ...[37, 38, 39, 40].map((x) => f(`fence-f-${x}`, "fence", x, 25, null)),
  ...[26, 27, 28].map((y) => f(`fence-fy-${y}`, "fencey", 36, y, null)),
  f("hay-1", "hay", 40, 22, null),
  f("hay-2", "hay", 37, 22, null),
  f("vl-tree5", "tree", 40, 29, null),
  // Bairro sul: taverna, salão dos contratos e mercado
  f("tav-barrel1", "barrel", 7, 34, null),
  f("tav-barrel2", "barrel", 7, 35, null),
  f("tav-table1", "table", 3, 40, null),
  f("tav-table2", "table", 6, 40, null),
  f("tav-bush", "bush", 1, 33, null),
  f("con-anvil", "anvil", 17, 38, null),
  f("con-forge", "forge", 17, 34, null),
  f("con-rack", "weaponrack", 13, 40, null),
  f("con-barrel", "barrel", 15, 40, null),
  f("mer-well", "well", 25, 36, null),
  f("mer-stall1", "stall", 23, 34, null, true, "#C8423B"),
  f("mer-stall2", "stall", 27, 34, null, true, "#2B6CB0"),
  f("mer-stall3", "stall", 23, 38, null, true, "#2F855A"),
  f("mer-stall4", "stall", 27, 38, null, true, "#B7791F"),
  f("mer-crate1", "crate", 28, 36, null),
  f("mer-crate2", "crate", 22, 36, null),
  f("mer-tree1", "tree", 30, 34, null),
  f("mer-tree2", "pine", 30, 39, null),
  f("sul-tree1", "tree", 1, 40, null),
  f("sul-tree2", "pine", 11, 40, null),
  f("sul-bush1", "bush", 21, 40, null),
  // Lago, cais e margens
  f("lago-reeds1", "reeds", 34, 34, null),
  f("lago-reeds2", "reeds", 38, 38, null),
  f("lago-lily1", "lilypad", 35, 37, null, false),
  f("lago-lily2", "lilypad", 37, 36, null, false),
  f("lago-rock1", "rock", 33, 36, null),
  f("lago-rock2", "rock", 39, 34, null),
  f("lago-tree1", "tree", 33, 33, null),
  f("lago-tree2", "tree", 40, 38, null),
  f("lago-tree3", "pine", 33, 40, null),
  f("lago-bush1", "bush", 39, 39, null),
  // Borda frontal (só arbustos baixos, para não esconder o mapa)
  ...[5, 15, 27].map((y) => f(`bush-e-${y}`, "bush", 41, y, null)),
  ...[5, 16, 26].map((x) => f(`bush-s-${x}`, "bush", x, 41, null)),
  // Distrito das Aventuras: floresta da borda, tochas da Arena e o Campo de Treinamento
  ...[42, 44, 46, 48].map((x) => f(`wood-n-${x}`, x % 4 === 0 ? "pine" : "tree", x, 0, null)),
  ...[41, 43, 45, 47].map((y) => f(`wood-w-${y}`, y % 4 === 0 ? "pine" : "tree", 0, y, null)),
  ...[6, 18, 28, 38, 44].map((y) => f(`bush-e2-${y}`, "bush", 49, y, null)),
  ...[3, 22, 30, 44].map((x) => f(`bush-s2-${x}`, "bush", x, 49, null)),
  f("arena-pole1", "bannerpole", 42, 8, null),
  f("arena-pole2", "bannerpole", 47, 8, null),
  f("arena-rack", "weaponrack", 48, 4, null),
  f("expl-sign", "signpost", 48, 17, null),
  f("expl-globe", "globe", 42, 14, null),
  f("expl-pine", "pine", 48, 12, null),
  f("aven-crystal", "crystal", 42, 25, null),
  f("aven-chest", "chest", 48, 24, null),
  f("leste-tree1", "tree", 41, 34, null),
  f("leste-tree2", "pine", 44, 33, null),
  f("leste-tree3", "tree", 47, 36, null),
  f("leste-rock", "rock", 45, 40, null),
  f("leste-bush", "bush", 42, 44, null),
  f("leste-pine", "pine", 46, 46, null),
  f("treino-dummy1", "dummy", 13, 42, null),
  f("treino-dummy2", "dummy", 16, 42, null),
  f("treino-target", "target", 17, 47, null),
  f("treino-rack", "weaponrack", 11, 47, null),
  f("canil-bowl", "pot", 6, 42, null),
  f("canil-flowers", "flowers", 3, 45, null),
  f("sul-tree3", "tree", 24, 44, null),
  f("sul-tree4", "pine", 28, 46, null),
  f("sul-rock2", "rock", 31, 43, null),
  f("sul-bush3", "bush", 33, 47, null),
  f("sul-tree5", "tree", 22, 47, null),
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

/** Água: lago do Jardim, lago da vila e o riacho que desce até a borda. */
export const WATER: Array<[number, number]> = [];
for (let x = 25; x <= 27; x++) for (let y = 25; y <= 27; y++) WATER.push([x, y]);
for (let x = 34; x <= 38; x++) for (let y = 34; y <= 38; y++) if (!((x === 34 || x === 38) && (y === 34 || y === 38))) WATER.push([x, y]);
for (const t of [[39, 36], [40, 36], [41, 36], [36, 39], [36, 40], [36, 41]] as const) WATER.push([t[0], t[1]]);
// O riacho segue até a nova borda sul.
for (let y = 42; y < GRID; y++) WATER.push([36, y]);
/** Cais de madeira sobre o lago (caminhável). */
export const DOCK: Array<[number, number]> = [[36, 34], [36, 35]];
const DOCK_SET = new Set(DOCK.map(([x, y]) => x * 100 + y));
const WATER_SET = new Set(WATER.filter(([x, y]) => !DOCK_SET.has(x * 100 + y)).map(([x, y]) => x * 100 + y));
/** Plantação ao lado do moinho (terra arada com cultivo, não caminhável). */
const FIELD_SET = new Set<number>();
for (let x = 37; x <= 40; x++) for (let y = 26; y <= 28; y++) FIELD_SET.add(x * 100 + y);
/** Praça do mercado (pedra). */
const MARKET = { x0: 22, y0: 33, x1: 28, y1: 39 };

/* ───────────────────────── Vila ───────────────────────── */

export type BuildingKey = "banco" | "loja" | "torre" | "taverna" | "contratos" | "moinho" | "arena" | "exploradores" | "aventureiro" | "treino" | "canil";
export type BuildingStyle = "bank" | "house" | "tower" | "mill" | "hall" | "arena" | "kennel" | "camp";

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  subtitle: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  style: BuildingStyle;
  /** Altura das paredes (px), sem o telhado. */
  height: number;
  wall: string;
  roof: string;
  trim: string;
  accent: string;
  /** Porta numa face visível: "x" = face leste (x1), "y" = face sul (y1). */
  door: { face: "x" | "y"; at: number };
  /** Tela do LifeOS ligada à construção (navegação pelo painel). */
  route: string | null;
  chimney: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  { key: "banco", name: "Banco do Reino", subtitle: "Cofre e investimentos", x0: 33, y0: 2, x1: 37, y1: 6, style: "bank", height: 58, wall: "#b9b2a3", roof: "#2d4f8f", trim: "#F1C66A", accent: "#59A9F8", door: { face: "y", at: 35 }, route: "/banco", chimney: false },
  { key: "loja", name: "Loja Arcana", subtitle: "Recompensas e pedidos", x0: 33, y0: 12, x1: 37, y1: 16, style: "house", height: 50, wall: "#e6d6b8", roof: "#6b3fa0", trim: "#4a2f1b", accent: "#A875F5", door: { face: "y", at: 35 }, route: "/loja-arcana", chimney: true },
  { key: "torre", name: "Torre do Grimório", subtitle: "Cartas de revisão", x0: 34, y0: 22, x1: 36, y1: 24, style: "tower", height: 118, wall: "#8d8fa3", roof: "#4b2a7a", trim: "#F1C66A", accent: "#A875F5", door: { face: "y", at: 35 }, route: "/grimorio", chimney: false },
  { key: "moinho", name: "Moinho", subtitle: "Plantação da vila", x0: 38, y0: 23, x1: 39, y1: 24, style: "mill", height: 84, wall: "#d9c9a8", roof: "#8a3b2a", trim: "#4a2f1b", accent: "#4FD49A", door: { face: "x", at: 24 }, route: null, chimney: false },
  { key: "taverna", name: "Taverna", subtitle: "Como foi meu dia", x0: 2, y0: 34, x1: 6, y1: 38, style: "house", height: 54, wall: "#ead9b9", roof: "#9e2b2b", trim: "#4a2f1b", accent: "#E78FC0", door: { face: "x", at: 36 }, route: "/taverna", chimney: true },
  // Distrito das Aventuras
  { key: "arena", name: "Arena dos Chefes", subtitle: "Chefe da Semana", x0: 42, y0: 2, x1: 47, y1: 7, style: "arena", height: 46, wall: "#8d8796", roof: "#5b2a7a", trim: "#F1C66A", accent: "#A875F5", door: { face: "y", at: 44 }, route: "/raid", chimney: false },
  { key: "exploradores", name: "Guilda dos Exploradores", subtitle: "Atlas de Exploração", x0: 43, y0: 12, x1: 47, y1: 16, style: "hall", height: 52, wall: "#d9c9a8", roof: "#2b6cb0", trim: "#3a2414", accent: "#4FD49A", door: { face: "y", at: 45 }, route: "/atlas", chimney: true },
  { key: "aventureiro", name: "Sala do Aventureiro", subtitle: "Tempo de Jogo", x0: 43, y0: 22, x1: 47, y1: 26, style: "house", height: 50, wall: "#c9c2d8", roof: "#3a2a6a", trim: "#59A9F8", accent: "#59A9F8", door: { face: "y", at: 45 }, route: "/tempo-de-jogo", chimney: false },
  { key: "treino", name: "Campo de Treinamento", subtitle: "Saúde e treinos", x0: 12, y0: 43, x1: 16, y1: 46, style: "camp", height: 8, wall: "#e9e2cf", roof: "#d0673a", trim: "#8a5d3b", accent: "#F16D75", door: { face: "x", at: 45 }, route: "/saude", chimney: false },
  { key: "canil", name: "Casa do Companheiro", subtitle: "Companheiro", x0: 4, y0: 43, x1: 5, y1: 44, style: "kennel", height: 20, wall: "#b98a5a", roof: "#9e2b2b", trim: "#5a3a22", accent: "#E78FC0", door: { face: "x", at: 44 }, route: "/companheiro", chimney: false },
  { key: "contratos", name: "Salão dos Contratos", subtitle: "Compromissos firmados", x0: 12, y0: 34, x1: 16, y1: 38, style: "hall", height: 56, wall: "#cdb48e", roof: "#3f5a3a", trim: "#3a2414", accent: "#F1C66A", door: { face: "x", at: 36 }, route: "/contratos", chimney: true },
];

export function buildingAt(x: number, y: number): BuildingDef | null {
  return BUILDINGS.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) ?? null;
}

/** Tile de porta (na pegada) e a entrada (tile livre em frente à porta). */
export function doorOf(b: BuildingDef): { door: { x: number; y: number }; entrance: { x: number; y: number } } {
  return b.door.face === "y"
    ? { door: { x: b.door.at, y: b.y1 }, entrance: { x: b.door.at, y: b.y1 + 1 } }
    : { door: { x: b.x1, y: b.door.at }, entrance: { x: b.x1 + 1, y: b.door.at } };
}

/** Caminho de terra da porta até a rua mais próxima (na direção da face da porta). */
const APPROACH_SET = new Set<number>();
for (const b of BUILDINGS) {
  const { entrance } = doorOf(b);
  let { x, y } = entrance;
  for (let i = 0; i < 8 && x <= GRID - 2 && y <= GRID - 2; i++) {
    if (ESTRADA.includes(y) || LANES.includes(x) || LANES.includes(y)) break;
    APPROACH_SET.add(x * 100 + y);
    if (b.door.face === "y") y++;
    else x++;
  }
}

/** Pontos de encontro: pares de tiles frente a frente onde os agentes conversam. */
export interface MeetSpot {
  key: string;
  label: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
}
export const MEET_SPOTS: MeetSpot[] = [
  { key: "fogueira", label: "Fogueira", a: { x: 13, y: 25 }, b: { x: 15, y: 25 } },
  { key: "praca", label: "Praça", a: { x: 16, y: 16 }, b: { x: 17, y: 15 } },
  { key: "pomar", label: "Pomar", a: { x: 13, y: 6 }, b: { x: 15, y: 6 } },
  { key: "poco", label: "Poço do mercado", a: { x: 24, y: 36 }, b: { x: 26, y: 36 } },
  { key: "taverna", label: "Porta da Taverna", a: { x: 8, y: 37 }, b: { x: 8, y: 35 } },
  { key: "banco", label: "Porta do Banco", a: { x: 34, y: 8 }, b: { x: 36, y: 8 } },
];

/** Aldeões decorativos: dão vida à vila, não representam dados do usuário. */
export interface Villager {
  id: string;
  home: { x: number; y: number };
  radius: number;
  /** Visual do aldeão (completado com o padrão em looks.ts). */
  look: Partial<CharacterLook>;
  lines: string[];
}

export const VILLAGERS: Villager[] = [
  { id: "npc-bardo", home: { x: 8, y: 38 }, radius: 1, look: { skin: "#E8B48A", hair: "#C8742E", hairStyle: "cacheado", outfit: "gibao", shirt: "#5B3F8C", pants: "#2A2420", trim: "#F1C66A", hat: "boina", hatColor: "#7A1F3A", prop: "nenhum", cape: null }, lines: ["Que trilha tocamos hoje?", "Música para a jornada!", "A Taverna canta contigo."] },
  { id: "npc-taverneira", home: { x: 8, y: 36 }, radius: 2, look: { skin: "#F0C8A0", hair: "#A0522D", hairStyle: "rabo", outfit: "vestido", shirt: "#7A2A3A", trim: "#F3E7C9", prop: "nenhum", cape: null }, lines: ["Bem-vindo à Taverna!", "Sopa quente hoje.", "Boa jornada, viajante!"] },
  { id: "npc-ferreiro", home: { x: 18, y: 36 }, radius: 2, look: { skin: "#A86F4C", hair: "#1E1410", hairStyle: "careca", beard: "cheia", outfit: "avental", shirt: "#4A4F5C", pants: "#2A2420", trim: "#5A3A22", prop: "nenhum", cape: null }, lines: ["O fogo da forja não apaga.", "Promessa é metal forjado."] },
  { id: "npc-fazendeiro", home: { x: 37, y: 29 }, radius: 2, look: { skin: "#E8B48A", hair: "#6B4A32", beard: "bigode", outfit: "tunica", shirt: "#3F7A3C", pants: "#5A4A3A", trim: "#8A5D3B", hat: "palha", hatColor: "#8A5D3B", prop: "nenhum", cape: null }, lines: ["A colheita vem com paciência.", "Que dia bom para plantar!"] },
  { id: "npc-guarda", home: { x: 21, y: 31 }, radius: 6, look: { skin: "#D9A57A", hair: "#2A1A10", outfit: "armadura", shirt: "#7A1F3A", pants: "#3B3B46", trim: "#F1C66A", hat: "elmo", hatColor: "#C8423B", prop: "escudo", cape: "#7A1F3A" }, lines: ["Tudo calmo na estrada.", "Ronda em andamento."] },
  { id: "npc-mercadora", home: { x: 25, y: 34 }, radius: 3, look: { skin: "#C98E66", hair: "#2B1A12", hairStyle: "longo", outfit: "tunica", shirt: "#B7791F", pants: "#4A3A2A", trim: "#2B6CB0", hat: "capuz", hatColor: "#2B6CB0", prop: "nenhum", cape: null }, lines: ["Frutas frescas!", "Volte sempre ao mercado."] },
  { id: "npc-pescador", home: { x: 36, y: 33 }, radius: 1, look: { skin: "#E8B48A", hair: "#7A7A7A", beard: "cheia", outfit: "tunica", shirt: "#2B6CB0", pants: "#3A3020", trim: "#E9E2CF", hat: "boina", hatColor: "#3F5A3A", prop: "lanterna", cape: null }, lines: ["Os peixes estão tímidos.", "O lago está sereno hoje."] },
];

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
    if (WATER_SET.has(x * 100 + y)) return "water";
    if (r.key === "jardim") return "grass";
    if (r.key === "praca") return "plaza";
    return "floor";
  }
  if (buildingAt(x, y)) return "building";
  if (DOCK_SET.has(x * 100 + y)) return "dock";
  if (WATER_SET.has(x * 100 + y)) return "water";
  if (FIELD_SET.has(x * 100 + y)) return "field";
  if (x >= MARKET.x0 && x <= MARKET.x1 && y >= MARKET.y0 && y <= MARKET.y1) return "plaza";
  return roadKind(x, y) ?? "grass";
}


/** Pedra no núcleo e na Estrada do Reino; terra batida nas ruas da vila. */
function roadKind(x: number, y: number): TileKind | null {
  const inCore = x <= 29 && y <= 29;
  if (ESTRADA.includes(y) && x >= 1 && x <= GRID - 2) return "path";
  if ((LANES.includes(x) && y >= 1 && y <= GRID - 2) || (LANES.includes(y) && x >= 1 && x <= GRID - 2)) return inCore ? "path" : "dirt";
  if (APPROACH_SET.has(x * 100 + y)) return "dirt";
  return null;
}

/** Mapa de bloqueio (true = não navegável). Decoração ocupada e plantas também bloqueiam. */
export function buildBlocked(extra: Array<{ x: number; y: number }> = []): boolean[][] {
  const g: boolean[][] = [];
  for (let x = 0; x < GRID; x++) {
    g[x] = [];
    for (let y = 0; y < GRID; y++) {
      const k = tileKind(x, y);
      g[x]![y] = k === "wall" || k === "water" || k === "building" || k === "field";
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
