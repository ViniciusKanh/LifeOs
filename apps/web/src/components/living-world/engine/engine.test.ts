import { describe, expect, it } from "vitest";
import { findPath, nearestFree } from "./pathfinding";
import { CharacterBrain, canTransition, canOverride, stateForAnim } from "./characterMachine";
import { AGENT_IDLE, AVATAR_SPAWN, buildBlocked, buildingAt, BUILDINGS, doorOf, FURNITURE, GRID, MEET_SPOTS, PLANT_TILES, STATIONS, tileKind, VILLAGERS } from "./worldMap";
import { buildConversation, buildMarkers, type WorldFacts } from "./village";

const empty = (n: number) => Array.from({ length: n }, () => Array.from({ length: n }, () => false));

describe("A*", () => {
  it("contorna obstáculos e nunca atravessa tile bloqueado", () => {
    const g = empty(6);
    for (let y = 0; y < 5; y++) g[2]![y] = true; // parede com passagem só em y=5
    const path = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path.every((p) => !g[p.x]![p.y])).toBe(true);
    expect(path.some((p) => p.x === 2 && p.y === 5)).toBe(true);
    // passos de 1 tile, 4 direções
    let prev = { x: 0, y: 0 };
    for (const p of path) {
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      prev = p;
    }
  });

  it("destino bloqueado vai para o vizinho livre; sem caminho devolve null", () => {
    const g = empty(5);
    g[3]![3] = true;
    expect(nearestFree(g, { x: 3, y: 3 })).not.toEqual({ x: 3, y: 3 });
    const closed = empty(5);
    for (let y = 0; y < 5; y++) closed[2]![y] = true;
    expect(findPath(closed, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
  });
});

describe("Mapa do Meu Mundo", () => {
  it("todas as estações, esperas dos agentes e o ponto inicial são alcançáveis a partir da praça", () => {
    const blocked = buildBlocked();
    const targets = [...Object.values(STATIONS), ...Object.values(AGENT_IDLE)];
    for (const t of targets) {
      expect(blocked[t.x]![t.y], `tile ${t.x},${t.y} não pode estar bloqueado`).toBe(false);
      const path = findPath(blocked, AVATAR_SPAWN, t);
      expect(path, `sem caminho até ${t.x},${t.y}`).not.toBeNull();
      expect(path!.length === 0 || path!.at(-1)!.x === t.x).toBe(true);
    }
  });

  it("plantas ficam no Jardim e fora da água; grade 42×42 com a vila", () => {
    expect(GRID).toBe(42);
    for (const [x, y] of PLANT_TILES) expect(["grass"]).toContain(tileKind(x, y));
  });

  it("entradas das construções, pontos de encontro e casas dos aldeões são alcançáveis", () => {
    const blocked = buildBlocked();
    const targets = [
      ...BUILDINGS.map((b) => doorOf(b).entrance),
      ...MEET_SPOTS.flatMap((m) => [m.a, m.b]),
      ...VILLAGERS.map((v) => v.home),
    ];
    for (const t of targets) {
      expect(blocked[t.x]![t.y], `tile ${t.x},${t.y} não pode estar bloqueado`).toBe(false);
      expect(findPath(blocked, AVATAR_SPAWN, t), `sem caminho até ${t.x},${t.y}`).not.toBeNull();
    }
  });

  it("construções: pegada quase quadrada, porta numa face visível e nada de móvel por cima", () => {
    for (const b of BUILDINGS) {
      expect(Math.abs(b.x1 - b.x0 - (b.y1 - b.y0))).toBeLessThanOrEqual(1);
      const { door, entrance } = doorOf(b);
      expect(buildingAt(door.x, door.y)?.key).toBe(b.key);
      expect(buildingAt(entrance.x, entrance.y)).toBeNull();
    }
    for (const it of FURNITURE) expect(buildingAt(it.x, it.y), `${it.id} dentro de construção`).toBeNull();
  });
});

const FACTS: WorldFacts = { overdue: 0, dueToday: 0, cardsDue: 0, claimable: 0, loanOverdue: 0, ordersPending: 0, habitsPending: 0, journalToday: true, workoutToday: true, studyToday: true, activityTitle: null };

describe("Vila: marcadores e conversas", () => {
  it("marcadores só aparecem com dado real e atrasado tem prioridade", () => {
    expect(buildMarkers(null)).toEqual({});
    expect(buildMarkers(FACTS)).toEqual({});
    const m = buildMarkers({ ...FACTS, overdue: 2, dueToday: 5, cardsDue: 1, loanOverdue: 1, claimable: 3, journalToday: false });
    expect(m.guilda).toMatchObject({ count: 2, tone: "danger", text: "2 missões atrasadas" });
    expect(m.torre).toMatchObject({ count: 1, text: "1 carta para revisar" });
    expect(m.banco?.tone).toBe("danger");
    expect(m.casa?.tone).toBe("info");
    expect(m.jardim).toBeUndefined();
  });

  it("conversa traz saudação e só cita números que existem nos dados", () => {
    const a = { key: "mentor", name: "Mentor de Estudos" };
    const b = { key: "analista", name: "Analista" };
    expect(buildConversation(a, b, null, 1)).toHaveLength(2);
    for (let seed = 0; seed < 40; seed++) {
      const lines = buildConversation(a, b, { ...FACTS, cardsDue: 7 }, seed);
      expect(lines.length).toBe(4);
      const text = lines.map((l) => l.text).join(" ");
      for (const n of text.match(/\d+/g) ?? []) expect(n).toBe("7");
    }
    const clear = buildConversation({ key: "planejador", name: "Planejador" }, b, FACTS, 3).map((l) => l.text).join(" ");
    expect(clear).not.toMatch(/atrasad[ao]s? na Guilda/);
  });
});

describe("Máquina de estados", () => {
  it("bloqueia transições incompatíveis", () => {
    expect(canTransition("resting", "working")).toBe(false);
    expect(canTransition("idle", "working")).toBe(true);
    expect(stateForAnim("typing")).toBe("working");
    expect(stateForAnim("sleeping")).toBe("resting");
  });

  it("dado real tem prioridade: ambiente e manual não interrompem uma atividade real", () => {
    const b = new CharacterBrain();
    expect(b.propose({ source: "domain", target: { x: 1, y: 1 }, arriveState: "working" })).toBe(true);
    expect(b.propose({ source: "ambient", target: { x: 2, y: 2 }, arriveState: "idle" })).toBe(false);
    expect(b.propose({ source: "manual", target: { x: 2, y: 2 }, arriveState: "idle" })).toBe(false);
    b.release("ambient");
    expect(b.intent?.source).toBe("domain");
    b.release("domain");
    expect(b.intent).toBeNull();
    expect(canOverride({ source: "ambient", target: { x: 0, y: 0 }, arriveState: "idle" }, { source: "manual", target: { x: 1, y: 0 }, arriveState: "idle" })).toBe(true);
  });
});
